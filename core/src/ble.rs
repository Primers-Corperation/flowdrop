/// Bluetooth trait defining how the Rust Engine tells Kotlin to control the Android radio.
pub trait BluetoothManager {
    fn start_advertising(&self, node_id: &str);
    fn start_scanning(&self);
    fn send_payload(&self, peer_id: &str, payload: &[u8]);
}

/// Incoming events forwarded from Kotlin to Rust JNI
pub enum BleEvent {
    PeerDiscovered { node_id: String },
    PeerLost { node_id: String },
    DataReceived { sender_id: String, payload: Vec<u8> },
}
