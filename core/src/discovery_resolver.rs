use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;
use crate::packet::{Packet, IdentityRequestHeader};

lazy_static! {
    /// Maps 6-byte beacon arrays to full hex-encoded Nostr pubkeys.
    pub static ref BEACON_TO_PUBKEY: Arc<Mutex<HashMap<[u8; 6], String>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// Generates a binary IdentityRequest packet to send over BLE.
pub fn request_full_identity(peer_beacon: &[u8; 6]) -> Result<Vec<u8>, String> {
    let packet = Packet::IdentityRequest {
        header: IdentityRequestHeader {
            beacon: *peer_beacon,
            request_id: rand::random::<u32>(),
        },
    };
    Ok(packet.encode())
}

/// Resolves a 6-byte beacon to a known full pubkey string.
pub fn resolve_beacon_to_identity(beacon: &[u8; 6]) -> Option<String> {
    let map = BEACON_TO_PUBKEY.lock().unwrap();
    map.get(beacon).cloned()
}

/// Registers a mapping from beacon to pubkey when successfully resolved via GATT.
pub fn register_beacon_for_identity(beacon: &[u8; 6], pubkey: &str) {
    let mut map = BEACON_TO_PUBKEY.lock().unwrap();
    map.insert(*beacon, pubkey.to_string());
}
