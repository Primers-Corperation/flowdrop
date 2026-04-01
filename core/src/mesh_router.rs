use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use lazy_static::lazy_static;

use crate::packet::{Packet, DataChunkHeader, NackHeader};
use crate::get_jvm;
use crate::database;
use crate::crypto;
use jni::objects::JValue;

// We enforce a hard limit on unacknowledged Android Characteristic writes
const MAX_IN_FLIGHT_CHUNKS: usize = 3;
const TTL_TIMEOUT_MS: u64 = 5000;

struct OutboundQueue {
    pub in_flight: usize,
    pub queued_chunks: VecDeque<Vec<u8>>,
}

struct ReassemblyBuffer {
    pub sender_id: String,
    pub total_chunks: u16,
    pub chunks: Vec<Option<Vec<u8>>>,
    pub last_updated_ms: u64,
}

lazy_static! {
    /// Tracks chunks waiting to be written to a peer over BLE
    static ref OUTBOUND_QUEUES: Arc<Mutex<HashMap<String, OutboundQueue>>> = Arc::new(Mutex::new(HashMap::new()));
    
    /// Tracks inbound messages currently being reconstructed
    static ref INBOUND_BUFFERS: Arc<Mutex<HashMap<u32, ReassemblyBuffer>>> = Arc::new(Mutex::new(HashMap::new()));
}

fn current_time_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Dispatches a chunk to the Kotlin layer via JNI to be written to the BLE hardware.
fn jni_write_chunk_to_ble(peer_id: &str, chunk: &[u8]) {
    if let Some(jvm) = get_jvm() {
        match jvm.attach_current_thread_as_daemon() {
            Ok(mut env) => {
                let peer_jstr = match env.new_string(peer_id) {
                    Ok(s) => s,
                    Err(e) => { println!("JNI ERROR: Failed to create peer_id string: {:?}", e); return; }
                };
                let chunk_jbarray = match env.byte_array_from_slice(chunk) {
                    Ok(b) => b,
                    Err(e) => { println!("JNI ERROR: Failed to create chunk byte array: {:?}", e); return; }
                };

                if let Err(e) = env.call_static_method(
                    "com/flowdrop/core/RustCore",
                    "writeChunkToBle",
                    "(Ljava/lang/String;[B)V",
                    &[JValue::from(&peer_jstr), JValue::from(&chunk_jbarray)],
                ) {
                    println!("JNI ERROR: writeChunkToBle call failed: {:?}", e);
                }
            }
            Err(e) => println!("JNI ERROR: Failed to attach thread to JVM: {:?}", e),
        }
    }
}

/// Pushes a fully reassembled and decrypted message to the Kotlin UI layer.
fn jni_on_message_received(peer_id: &str, text: &str) {
    if let Some(jvm) = get_jvm() {
        match jvm.attach_current_thread_as_daemon() {
            Ok(mut env) => {
                let peer_jstr = match env.new_string(peer_id) {
                    Ok(s) => s,
                    Err(e) => { println!("JNI ERROR: Failed to create peer_id string: {:?}", e); return; }
                };
                let text_jstr = match env.new_string(text) {
                    Ok(s) => s,
                    Err(e) => { println!("JNI ERROR: Failed to create text string: {:?}", e); return; }
                };

                if let Err(e) = env.call_static_method(
                    "com/flowdrop/core/RustCore",
                    "onMessageReceived",
                    "(Ljava/lang/String;Ljava/lang/String;)V",
                    &[JValue::from(&peer_jstr), JValue::from(&text_jstr)],
                ) {
                    println!("JNI ERROR: onMessageReceived call failed: {:?}", e);
                }
            }
            Err(e) => println!("JNI ERROR: Failed to attach thread to JVM: {:?}", e),
        }
    }
}

/// Encrypts (stub) and chunks a payload, queuing it for dispatch to a peer
pub fn queue_outbound_message(peer_id: &str, msg_id: u32, payload: &[u8], mtu: usize) {
    let header_size = 9;
    let chunk_payload_size = if mtu > header_size { mtu - header_size } else { 20 };
    
    let total_chunks = (payload.len() + chunk_payload_size - 1) / chunk_payload_size;
    let mut chunks = VecDeque::new();

    for i in 0..total_chunks {
        let start = i * chunk_payload_size;
        let end = std::cmp::min(start + chunk_payload_size, payload.len());
        let slice = &payload[start..end];

        let p = Packet::Data {
            header: DataChunkHeader {
                msg_id,
                total_chunks: total_chunks as u16,
                chunk_index: i as u16,
            },
            payload: slice.to_vec(),
        };
        chunks.push_back(p.encode());
    }

    let mut queues = OUTBOUND_QUEUES.lock().unwrap();
    let queue = queues.entry(peer_id.to_string()).or_insert(OutboundQueue {
        in_flight: 0,
        queued_chunks: VecDeque::new(),
    });

    queue.queued_chunks.extend(chunks);
    drop(queues);

    // Attempt to pump the queue immediately
    pump_outbound_queue(peer_id);
}

/// Dispatches up to MAX_IN_FLIGHT_CHUNKS to the Android BLE Stack
pub fn pump_outbound_queue(peer_id: &str) {
    let mut queues = OUTBOUND_QUEUES.lock().unwrap();
    if let Some(queue) = queues.get_mut(peer_id) {
        while queue.in_flight < MAX_IN_FLIGHT_CHUNKS {
            if let Some(chunk) = queue.queued_chunks.pop_front() {
                queue.in_flight += 1;
                // Dispatch across FFI boundary to Android Hardware
                jni_write_chunk_to_ble(peer_id, &chunk);
            } else {
                break;
            }
        }
    }
}

/// Called by Kotlin via JNI when a `BluetoothGattCallback.onCharacteristicWrite` fires.
/// This frees up the throttle slot to push the next chunk.
pub fn on_chunk_write_completed(peer_id: &str) {
    let mut queues = OUTBOUND_QUEUES.lock().unwrap();
    if let Some(queue) = queues.get_mut(peer_id) {
        if queue.in_flight > 0 {
            queue.in_flight -= 1;
        }
    }
    drop(queues);
    pump_outbound_queue(peer_id);
}

/// Parses raw bytes pulled off the `BluetoothGattServerCallback` characteristic.
pub fn handle_inbound_bytes(peer_id: &str, raw_bytes: &[u8]) {
    match Packet::decode(raw_bytes) {
        Ok(Packet::Data { header, payload }) => {
            let mut buffers = INBOUND_BUFFERS.lock().unwrap();
            let buffer = buffers.entry(header.msg_id).or_insert_with(|| ReassemblyBuffer {
                sender_id: peer_id.to_string(),
                total_chunks: header.total_chunks,
                chunks: vec![None; header.total_chunks as usize],
                last_updated_ms: current_time_ms(),
            });

            buffer.last_updated_ms = current_time_ms();
            if (header.chunk_index as usize) < buffer.chunks.len() {
                buffer.chunks[header.chunk_index as usize] = Some(payload);
            }

            // Check if fully reassembled
            if buffer.chunks.iter().all(|c| c.is_some()) {
                let reassembled: Vec<u8> = buffer.chunks.iter()
                    .filter_map(|c| c.as_ref())
                    .flatten()
                    .cloned()
                    .collect();
                
                // Clear the buffer
                buffers.remove(&header.msg_id);
                drop(buffers);

                // Phase 2: Decryption (NIP-44)
                match crypto::decrypt_nip44(&reassembled, peer_id) {
                    Ok(plaintext) => {
                        println!("Successfully reassembled and decrypted message from {}!", peer_id);
                        
                        // Save to Database
                        let now = current_time_ms();
                        let _ = database::save_message(peer_id, peer_id, &plaintext, now);

                        jni_on_message_received(peer_id, &plaintext);
                    },
                    Err(e) => {
                        println!("Failed to decrypt reassembled message from {}: {}", peer_id, e);
                    }
                }
            }
        }
        Ok(Packet::Nack { header }) => {
            // A remote peer dropped our chunks, we need to requeue specifically requested frames.
            println!("Received NACK for msg {} asking for {} lost frames", header.msg_id, header.missing_indices.len());
            // Implementation mapping would requeue just these indices to the front of OutboundQueue
        }
        Err(e) => {
            println!("Failed to parse incoming packet: {}", e);
        }
    }
}

/// Inbound entry point for the Nostr WebSocket transport.
/// Events received via relay are fed here; we treat them exactly like a single-chunk mesh payload.
pub fn handle_inbound_nostr_event(peer_id: &str, payload: &[u8]) {
    match crypto::decrypt_nip44(payload, peer_id) {
        Ok(plaintext) => {
            println!("Nostr: Received and decrypted message from {}!", peer_id);
            
            // Save to Database
            let now = current_time_ms();
            let _ = database::save_message(peer_id, peer_id, &plaintext, now);

            jni_on_message_received(peer_id, &plaintext);
        },
        Err(e) => println!("Nostr Decryption failed for {}: {}", peer_id, e),
    }
}

/// Background daemon sweep to look for stalled messages and dispatch NACK requests.
/// NOTE: This will be called globally every 5 seconds from MeshForegroundService.kt in Milestone 8.
pub fn sweep_all_stalled_inbound_buffers() {
    let mut buffers = INBOUND_BUFFERS.lock().unwrap();
    let now = current_time_ms();

    let mut nacks_to_send = Vec::new();

    for (msg_id, buffer) in buffers.iter_mut() {
        if now.saturating_sub(buffer.last_updated_ms) > TTL_TIMEOUT_MS {
            let missing: Vec<u16> = buffer.chunks.iter().enumerate()
                .filter_map(|(idx, chunk)| if chunk.is_none() { Some(idx as u16) } else { None })
                .collect();

            if !missing.is_empty() {
                nacks_to_send.push((buffer.sender_id.clone(), *msg_id, missing));
            }
            buffer.last_updated_ms = now;
        }
    }
    drop(buffers);

    // Queue outbound NACK packets
    let mut queues = OUTBOUND_QUEUES.lock().unwrap();
    for (sender_id, msg_id, missing) in nacks_to_send {
        let nack = Packet::Nack {
            header: NackHeader { msg_id, missing_indices: missing }
        };
        let encoded = nack.encode();

        if let Some(queue) = queues.get_mut(&sender_id) {
            queue.queued_chunks.push_front(encoded); // push to front for priority
        }
    }
    drop(queues);
    // Note: We don't pump all queues here, they will pump on next chunk-write-completed or manual pump.
}
