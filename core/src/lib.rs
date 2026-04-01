use jni::{JNIEnv, JavaVM};
use jni::objects::{JClass, JString, JByteArray};
use jni::sys::{jstring, jint};
use serde_json::json;
use std::sync::{OnceLock, Mutex};
use std::ptr;
use tokio::runtime::Runtime;
use tokio_util::sync::CancellationToken;
use crate::geohash::GeohashEngine;

/// Global reference to the JVM, used for Rust-to-Kotlin callbacks from any thread.
pub static JVM: OnceLock<JavaVM> = OnceLock::new();

/// The heavy-lifting async executor for Nostr WebSockets and SQLite tasks.
pub static RUNTIME: OnceLock<Runtime> = OnceLock::new();

/// Signals all background tasks (like relay listeners) to shut down.
pub static CANCEL_TOKEN: OnceLock<CancellationToken> = OnceLock::new();

/// Global Geohash/IRC command state
pub static GEOHASH_ENGINE: OnceLock<Mutex<GeohashEngine>> = OnceLock::new();

/// Utility for other modules to fire JNI callbacks via the global JVM handle
pub fn get_jvm() -> Option<JavaVM> {
    JVM.get().cloned()
}

/// Helper to get a reference to the active Tokio runtime
pub fn get_runtime() -> Option<&'static Runtime> {
    RUNTIME.get()
}

pub mod crypto;
pub mod database;
pub mod ble;
pub mod discovery;
pub mod geohash;
pub mod mesh_router;
pub mod nostr;
pub mod packet;
pub mod relay_pool;

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_initEngine(
    mut env: JNIEnv,
    _class: JClass,
    _db_path: JString,
) -> jstring {
    // Capture the JavaVM reference for future callbacks
    let jvm = match env.get_java_vm() {
        Ok(j) => j,
        Err(_) => return ptr::null_mut(),
    };
    let _ = JVM.set(jvm);

    // Initialize the Tokio multi-threaded runtime exactly once
    if RUNTIME.get().is_none() {
        match tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build() {
                Ok(rt) => { let _ = RUNTIME.set(rt); },
                Err(_) => return ptr::null_mut(),
            }
    }

    // Initialize the Global Cancellation Token
    if CANCEL_TOKEN.get().is_none() {
        let _ = CANCEL_TOKEN.set(CancellationToken::new());
    }

    // Initialize the Database (SQLite)
    let db_path: String = match env.get_string(&_db_path) {
        Ok(s) => s.into(),
        Err(_) => "/data/user/0/com.flowdrop/databases/flowdrop.db".to_string(),
    };
    if let Err(e) = database::init(&db_path) {
        println!("DB ERROR: Failed to init storage at {}: {}", db_path, e);
    }

    // Initialize the Geohash Engine (IRC Channels)
    if GEOHASH_ENGINE.get().is_none() {
        let _ = GEOHASH_ENGINE.set(Mutex::new(GeohashEngine::new()));
    }

    match env.new_string("Engine Initialized Successfully") {
        Ok(response) => response.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_shutdownEngine(
    _env: JNIEnv,
    _class: JClass,
) {
    if let Some(token) = CANCEL_TOKEN.get() {
        println!("RustCore: Shutting down Mesh Engine tasks...");
        token.cancel();
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_generateIdentity(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    // 1. Return existing keys if already stored
    if let Some((_sk, pk)) = database::get_local_keys() {
        return env.new_string(format!("{{\"public_key\":\"{}\"}}", pk))
            .map(|s| s.into_raw())
            .unwrap_or(ptr::null_mut());
    }

    // 2. Generate and persist new keys
    let keys_json = crypto::generate_keypair_hex();
    if let Ok(val) = serde_json::from_str::<serde_json::Value>(&keys_json) {
        let sk = val["private_key"].as_str().unwrap_or_default();
        let pk = val["public_key"].as_str().unwrap_or_default();
        let _ = database::store_local_keys(sk, pk);
    }

    match env.new_string(keys_json) {
        Ok(output) => output.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_onPeerDiscovered(
    mut env: JNIEnv,
    _class: JClass,
    node_id: JString,
) {
    let peer_id: String = match env.get_string(&node_id) {
        Ok(s) => s.into(),
        Err(_) => return,
    };
    discovery::handle_peer_discovered(&peer_id);
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_sendMessage(
    mut env: JNIEnv,
    _class: JClass,
    peer_id: JString,
    text: JString,
    mtu: jint,
) {
    let peer_id: String = match env.get_string(&peer_id) {
        Ok(s) => s.into(),
        Err(_) => return,
    };
    let text: String = match env.get_string(&text) {
        Ok(s) => s.into(),
        Err(_) => return,
    };
    let msg_id = rand::random::<u32>();
    
    // Core Encryption Entry Point (NIP-44)
    match crypto::encrypt_nip44(&text, &peer_id) {
        Ok(cyphertext) => {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap_or_default()
                .as_millis() as u64;

            // Save to Local History
            let _ = database::save_message(&peer_id, "me", &text, now);

            // Queue for Mesh Dispatch
            mesh_router::queue_outbound_message(&peer_id, msg_id, &cyphertext, mtu as usize);
        },
        Err(e) => {
            println!("CRITICAL: Encryption failed for {}: {}", peer_id, e);
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_onBleChunkReceived(
    mut env: JNIEnv,
    _class: JClass,
    peer_id: JString,
    chunk: JByteArray,
) {
    let peer_id: String = match env.get_string(&peer_id) {
        Ok(s) => s.into(),
        Err(_) => return,
    };
    let bytes = match env.convert_byte_array(&chunk) {
        Ok(b) => b,
        Err(_) => return,
    };
    
    mesh_router::handle_inbound_bytes(&peer_id, &bytes);
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_encodeGeohash(
    mut env: JNIEnv,
    _class: JClass,
    lat: f64,
    lon: f64,
    precision: i32,
) -> jstring {
    let hash = GeohashEngine::encode(lat, lon, precision as usize);
    match env.new_string(hash) {
        Ok(s) => s.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_handleIrcCommand(
    mut env: JNIEnv,
    _class: JClass,
    input: JString,
) -> jstring {
    let input: String = env.get_string(&input).unwrap_or_default().into();
    
    let result = if let Some(mut engine) = GEOHASH_ENGINE.get().and_then(|m| m.lock().ok()) {
        geohash::handle_irc_input(&mut engine, &input)
    } else {
        "Critical Error: Engine Not Initialized".to_string()
    };

    match env.new_string(result) {
        Ok(s) => s.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_sweepInboundBuffers(
    _env: JNIEnv,
    _class: JClass,
) {
    mesh_router::sweep_all_stalled_inbound_buffers();
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_onChunkWriteCompleted(
    mut env: JNIEnv,
    _class: JClass,
    peer_id: JString,
) {
    let peer_id: String = match env.get_string(&peer_id) {
        Ok(s) => s.into(),
        Err(_) => return,
    };
    mesh_router::on_chunk_write_completed(&peer_id);
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_getThreads(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    let response = database::get_threads_json();

    match env.new_string(response) {
        Ok(s) => s.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_flowdrop_core_RustCore_getMessages(
    mut env: JNIEnv,
    _class: JClass,
    peer_id: JString,
) -> jstring {
    let peer_id: String = match env.get_string(&peer_id) {
        Ok(s) => s.into(),
        Err(_) => return ptr::null_mut(),
    };

    let response = database::get_messages_json(&peer_id);

    match env.new_string(response) {
        Ok(s) => s.into_raw(),
        Err(_) => ptr::null_mut(),
    }
}

// Scaffold tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init() {
        assert_eq!(1, 1); // Scaffold
    }
}
