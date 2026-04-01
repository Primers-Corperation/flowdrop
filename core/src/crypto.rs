use secp256k1::{Secp256k1, SecretKey, PublicKey};
use secp256k1::ecdh::SharedSecret;
use rand::rngs::OsRng;
use rand::RngCore;
use chacha20poly1305::{ChaCha20Poly1305, Key, Nonce, KeyInit};
use chacha20poly1305::aead::Aead;
use hkdf::Hkdf;
use sha2::Sha256;
use hex;
use std::str::FromStr;
use crate::database;

pub fn generate_keypair_hex() -> String {
    let secp = Secp256k1::new();
    let (secret_key, public_key) = secp.generate_keypair(&mut OsRng);
    
    format!(
        "{{\"private_key\":\"{}\",\"public_key\":\"{}\"}}",
        hex::encode(secret_key.secret_bytes()),
        hex::encode(public_key.serialize())
    )
}

pub fn sign_message_hash(secret_key_hex: &str, hash: &[u8; 32]) -> Result<String, String> {
    let secp = Secp256k1::new();
    let secret_key = SecretKey::from_str(secret_key_hex).map_err(|e| e.to_string())?;
    let message = secp256k1::Message::from_slice(hash).map_err(|e| e.to_string())?;
    let sig = secp.sign_ecdsa(&message, &secret_key);
    
    Ok(hex::encode(sig.serialize_compact()))
}

pub fn verify_message_signature(pubkey_hex: &str, hash: &[u8; 32], sig_hex: &str) -> bool {
    let secp = Secp256k1::new();
    let pubkey = match PublicKey::from_str(pubkey_hex) {
        Ok(pk) => pk,
        Err(_) => return false,
    };
    let signature = match secp256k1::ecdsa::Signature::from_compact(&hex::decode(sig_hex).unwrap_or_default()) {
        Ok(s) => s,
        Err(_) => return false,
    };
    let message = match secp256k1::Message::from_slice(hash) {
        Ok(m) => m,
        Err(_) => return false,
    };
    
    secp.verify_ecdsa(&message, &signature, &pubkey).is_ok()
}

pub fn encrypt_nip44(payload: &str, recipient_pubkey: &str) -> Result<Vec<u8>, String> {
    // 1. Get Local Secret from Database
    let (sk_hex, _) = database::get_local_keys().ok_or("Local identity not found")?;
    encrypt_nip44_with_sk(payload, recipient_pubkey, &sk_hex)
}

pub fn encrypt_nip44_with_sk(payload: &str, recipient_pubkey: &str, sk_hex: &str) -> Result<Vec<u8>, String> {
    let sk = SecretKey::from_str(sk_hex).map_err(|e| e.to_string())?;
    
    // 2. Parse Recipient Pubkey
    let pk = PublicKey::from_str(recipient_pubkey).map_err(|e| e.to_string())?;
    
    // 3. Derive Shared Secret (ECDH)
    let shared_point = SharedSecret::new(&pk, &sk);
    
    // 4. HKDF Key Derivation (NIP-44 style)
    let hk = Hkdf::<Sha256>::new(None, &shared_point.secret_bytes());
    let mut key = [0u8; 32];
    hk.expand(b"nip44-v2-chacha20-poly1305", &mut key).map_err(|_| "HKDF expansion failed")?;
    
    // 5. Encrypt with ChaCha20Poly1305
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    
    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let mut ciphertext = cipher.encrypt(nonce, payload.as_bytes())
        .map_err(|_| "Encryption failed")?;
        
    // 6. Prepend Nonce to Ciphertext (NIP-44 standard behavior)
    let mut final_payload = nonce_bytes.to_vec();
    final_payload.append(&mut ciphertext);
        
    Ok(final_payload)
}

pub fn decrypt_nip44(payload: &[u8], sender_pubkey: &str) -> Result<String, String> {
    // 1. Get Local Secret from Database
    let (sk_hex, _) = database::get_local_keys().ok_or("Local identity not found")?;
    decrypt_nip44_with_sk(payload, sender_pubkey, &sk_hex)
}

pub fn decrypt_nip44_with_sk(payload: &[u8], sender_pubkey: &str, sk_hex: &str) -> Result<String, String> {
    if payload.len() < 12 {
        return Err("Payload too short for nonce".to_string());
    }

    let sk = SecretKey::from_str(sk_hex).map_err(|e| e.to_string())?;
    
    // 2. Parse Sender Pubkey
    let pk = PublicKey::from_str(sender_pubkey).map_err(|e| e.to_string())?;
    
    // 3. Derive Shared Secret
    let shared_point = SharedSecret::new(&pk, &sk);
    
    // 4. HKDF Key Derivation
    let hk = Hkdf::<Sha256>::new(None, &shared_point.secret_bytes());
    let mut key = [0u8; 32];
    hk.expand(b"nip44-v2-chacha20-poly1305", &mut key).map_err(|_| "HKDF expansion failed")?;
    
    // 5. Split Nonce and Ciphertext
    let (nonce_bytes, ciphertext) = payload.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    // 6. Decrypt
    let cipher = ChaCha20Poly1305::new(Key::from_slice(&key));
    
    let plaintext_bytes = cipher.decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed")?;
        
    String::from_utf8(plaintext_bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_keygen() {
        let keys = generate_keypair_hex();
        assert!(keys.contains("private_key"));
    }

    #[test]
    fn test_sign_verify() {
        let hash = [0u8; 32];
        let secp = Secp256k1::new();
        let (sk, pk) = secp.generate_keypair(&mut OsRng);
        let sk_hex = hex::encode(sk.secret_bytes());
        let pk_hex = hex::encode(pk.serialize());

        let sig = sign_message_hash(&sk_hex, &hash).unwrap();
        assert!(verify_message_signature(&pk_hex, &hash, &sig));
    }

    #[test]
    fn test_nip44_roundtrip() {
        let alice_json = generate_keypair_hex();
        let bob_json = generate_keypair_hex();

        let alice: serde_json::Value = serde_json::from_str(&alice_json).unwrap();
        let bob: serde_json::Value = serde_json::from_str(&bob_json).unwrap();

        let alice_sk = alice["private_key"].as_str().unwrap();
        let alice_pk = alice["public_key"].as_str().unwrap();
        
        let bob_sk = bob["private_key"].as_str().unwrap();
        let bob_pk = bob["public_key"].as_str().unwrap();

        let msg = "Secure Mesh Message 101";
        
        // Alice encrypts for Bob
        let ciphertext = encrypt_nip44_with_sk(msg, bob_pk, alice_sk).expect("Encryption failed");
        
        // Bob decrypts from Alice
        let decrypted = decrypt_nip44_with_sk(&ciphertext, alice_pk, bob_sk).expect("Decryption failed");
        
        assert_eq!(msg, decrypted);
        
        // Ensure ciphertext is different every time (nonce sanity)
        let ciphertext2 = encrypt_nip44_with_sk(msg, bob_pk, alice_sk).expect("Encryption failed");
        assert_ne!(ciphertext, ciphertext2);
    }
}
