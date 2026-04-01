use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;

#[derive(Debug, Clone)]
pub struct PeerNode {
    pub node_id: String,
    pub last_seen_ms: u64,
}

lazy_static! {
    /// Thread-safe global peer routing table.
    pub static ref PEER_TABLE: Arc<Mutex<HashMap<String, PeerNode>>> = Arc::new(Mutex::new(HashMap::new()));
}

/// Helper to get current epoch MS
fn current_time_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64
}

/// Invoked when Android triggers `onPeerDiscovered(nodeId)`
pub fn handle_peer_discovered(node_id: &str) {
    let mut table = PEER_TABLE.lock().unwrap();
    let now = current_time_ms();

    table.insert(node_id.to_string(), PeerNode {
        node_id: node_id.to_string(),
        last_seen_ms: now,
    });
}

/// Returns a list of currently active peers in range.
pub fn get_active_peers() -> Vec<PeerNode> {
    let table = PEER_TABLE.lock().unwrap();
    table.values().cloned().collect()
}

/// Periodic job to clear peers that haven't been seen in the last 30 seconds.
pub fn prune_stale_peers(timeout_ms: u64) {
    let mut table = PEER_TABLE.lock().unwrap();
    let now = current_time_ms();
    
    table.retain(|_, node| {
        now.saturating_sub(node.last_seen_ms) <= timeout_ms
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread::sleep;
    use std::time::Duration;

    #[test]
    fn test_peer_discovery_and_pruning() {
        // Clear table
        PEER_TABLE.lock().unwrap().clear();

        handle_peer_discovered("node_A");
        handle_peer_discovered("node_B");
        
        let active = get_active_peers();
        assert_eq!(active.len(), 2);

        // Sleep 1 second, prune everything older than 500ms
        sleep(Duration::from_millis(1000));
        prune_stale_peers(500);

        let active_after_prune = get_active_peers();
        assert_eq!(active_after_prune.len(), 0);
    }
}
