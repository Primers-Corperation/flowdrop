use serde::{Serialize, Deserialize};
use serde_json::{json, Value};
use sha2::{Sha256, Digest};
use crate::crypto;
use crate::relay_pool::RelayPool;
use crate::mesh_router;
use tokio_util::sync::CancellationToken;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct NostrEvent {
    pub id: String,
    pub pubkey: String,
    pub created_at: u64,
    pub kind: u32,
    pub tags: Vec<Vec<String>>,
    pub content: String,
    pub sig: String,
}

impl NostrEvent {
    pub fn new(
        privkey_hex: &str,
        pubkey_hex: &str,
        kind: u32,
        tags: Vec<Vec<String>>,
        content: String,
    ) -> Result<Self, String> {
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();

        let serialized = json!([0, pubkey_hex, created_at, kind, tags, content]).to_string();

        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let hash: [u8; 32] = hasher.finalize().into();
        let id_hex = hex::encode(hash);

        let sig_hex = crypto::sign_message_hash(privkey_hex, &hash)?;

        Ok(Self {
            id: id_hex,
            pubkey: pubkey_hex.to_string(),
            created_at,
            kind,
            tags,
            content,
            sig: sig_hex,
        })
    }

    pub fn to_json(&self) -> Result<String, String> {
        serde_json::to_string(self).map_err(|e| e.to_string())
    }

    /// Verifies the crypto signature and id hash of the event.
    pub fn verify(&self) -> bool {
        // 1. Verify ID Hash
        let serialized = json!([0, self.pubkey, self.created_at, self.kind, self.tags, self.content]).to_string();
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        let hash: [u8; 32] = hasher.finalize().into();
        let id_hex = hex::encode(hash);
        
        if id_hex != self.id { return false; }

        // 2. Verify Signature
        crypto::verify_message_signature(&self.pubkey, &hash, &self.sig)
    }
}

pub async fn publish_to_relay(pool: &RelayPool, privkey: &str, pubkey: &str, mesh_payload: String) {
    let event = NostrEvent::new(privkey, pubkey, 20000, vec![], mesh_payload);

    if let Ok(e) = event {
        if let Ok(json_str) = e.to_json() {
            let msg = json!(["EVENT", e]).to_string();
            pool.broadcast(msg).await;
        }
    }
}

/// Parses an inbound Nostr message from a relay and routes mesh events.
pub fn handle_relay_message(_url: &str, text: &str) {
    let v: Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    if v[0] == "EVENT" {
        let event_val = &v[2];
        let event: NostrEvent = match serde_json::from_value(event_val.clone()) {
            Ok(e) => e,
            Err(_) => return,
        };

        // Mesh Filter: Kind 20000
        if event.kind == 20000 {
            if event.verify() {
                // Handoff to Mesh Router
                let payload = match hex::decode(&event.content) {
                    Ok(b) => b,
                    Err(_) => event.content.as_bytes().to_vec(), // fallback for plaintext stubs
                };
                mesh_router::handle_inbound_nostr_event(&event.pubkey, &payload);
            } else {
                println!("Nostr: Invalid signature on event {}", event.id);
            }
        }
    }
}

pub async fn subscribe_loop(pool: &RelayPool, pubkey: &str, cancel_token: CancellationToken) {
    println!("Nostr: Initiating REQ for pubkey: {}", pubkey);
    
    // NIP-01 Subscription: ["REQ", "flowdrop_sub", {"kinds": [20000], "#p": [pubkey]}]
    let req = json!([
        "REQ",
        "flowdrop_sub",
        {
            "kinds": [20000],
            "#p": [pubkey]
        }
    ]).to_string();

    pool.broadcast(req).await;
    
    while !cancel_token.is_cancelled() {
        tokio::time::sleep(tokio::time::Duration::from_secs(30)).await;
        if cancel_token.is_cancelled() { break; }
    }
}
