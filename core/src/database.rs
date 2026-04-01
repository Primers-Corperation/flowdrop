use rusqlite::{params, Connection, Result};
use std::sync::{Arc, Mutex};
use lazy_static::lazy_static;

lazy_static! {
    static ref DB_CONN: Arc<Mutex<Option<Connection>>> = Arc::new(Mutex::new(None));
}

pub fn init(db_path: &str) -> Result<()> {
    let conn = Connection::open(db_path)?;
    
    // 1. Identity Table (Local Keys)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS identity (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            private_key TEXT NOT NULL,
            public_key TEXT NOT NULL
        )",
        [],
    )?;

    // 2. Messages Table
    conn.execute(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            peer_id TEXT NOT NULL,
            sender_id TEXT NOT NULL,
            content TEXT NOT NULL,
            timestamp INTEGER NOT NULL
        )",
        [],
    )?;

    // 3. Threads Table (List View cache)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS threads (
            peer_id TEXT PRIMARY KEY,
            last_msg TEXT NOT NULL,
            timestamp INTEGER NOT NULL,
            unread_count INTEGER DEFAULT 0
        )",
        [],
    )?;

    let mut db = DB_CONN.lock().unwrap();
    *db = Some(conn);
    Ok(())
}

pub fn save_message(peer_id: &str, sender_id: &str, content: &str, timestamp: u64) -> Result<()> {
    let db = DB_CONN.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        let msg_id = format!("{}-{}", peer_id, timestamp);
        
        // Save the message
        conn.execute(
            "INSERT OR REPLACE INTO messages (id, peer_id, sender_id, content, timestamp) VALUES (?, ?, ?, ?, ?)",
            params![msg_id, peer_id, sender_id, content, timestamp],
        )?;

        // Update the Thread preview
        conn.execute(
            "INSERT INTO threads (peer_id, last_msg, timestamp, unread_count) 
             VALUES (?, ?, ?, 1)
             ON CONFLICT(peer_id) DO UPDATE SET 
             last_msg = excluded.last_msg,
             timestamp = excluded.timestamp,
             unread_count = unread_count + 1",
            params![peer_id, content, timestamp],
        )?;
    }
    Ok(())
}

pub fn get_threads_json() -> String {
    let db = DB_CONN.lock().expect("DB Mutex poisoned");
    if let Some(conn) = db.as_ref() {
        let mut stmt = match conn.prepare("SELECT peer_id, last_msg, timestamp, unread_count FROM threads ORDER BY timestamp DESC") {
            Ok(s) => s,
            Err(_) => return "[]".to_string(),
        };
        
        let rows = match stmt.query_map([], |row| {
            Ok(serde_json::json!({
                "peerId": row.get::<_, String>(0)?,
                "lastMessage": row.get::<_, String>(1)?,
                "timestamp": row.get::<_, u64>(2)?,
                "unreadCount": row.get::<_, i32>(3)?
            }))
        }) {
            Ok(r) => r,
            Err(_) => return "[]".to_string(),
        };

        let threads: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        return serde_json::to_string(&threads).unwrap_or_else(|_| "[]".to_string());
    }
    "[]".to_string()
}

pub fn get_messages_json(peer_id: &str) -> String {
    let db = DB_CONN.lock().expect("DB Mutex poisoned");
    if let Some(conn) = db.as_ref() {
        // Reset unread count when opening chat
        let _ = conn.execute("UPDATE threads SET unread_count = 0 WHERE peer_id = ?", [peer_id]);

        let mut stmt = match conn.prepare("SELECT id, sender_id, content, timestamp FROM messages WHERE peer_id = ? ORDER BY timestamp ASC") {
            Ok(s) => s,
            Err(_) => return "[]".to_string(),
        };
        
        let rows = match stmt.query_map([peer_id], |row| {
            let sender = row.get::<_, String>(1)?;
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "sender": sender,
                "text": row.get::<_, String>(2)?,
                "timestamp": row.get::<_, u64>(3)?,
                "isMe": sender == "me" // Dummy logic for now
            }))
        }) {
            Ok(r) => r,
            Err(_) => return "[]".to_string(),
        };

        let msgs: Vec<_> = rows.filter_map(|r| r.ok()).collect();
        return serde_json::to_string(&msgs).unwrap_or_else(|_| "[]".to_string());
    }
    "[]".to_string()
}

pub fn get_local_keys() -> Option<(String, String)> {
    let db = DB_CONN.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        let mut stmt = conn.prepare("SELECT private_key, public_key FROM identity LIMIT 1").ok()?;
        let mut rows = stmt.query([]).ok()?;
        if let Some(row) = rows.next().ok().flatten() {
            return Some((row.get(0).ok()?, row.get(1).ok()?));
        }
    }
    None
}

pub fn store_local_keys(sk: &str, pk: &str) -> Result<()> {
    let db = DB_CONN.lock().unwrap();
    if let Some(conn) = db.as_ref() {
        conn.execute("INSERT OR REPLACE INTO identity (id, private_key, public_key) VALUES (1, ?, ?)", params![sk, pk])?;
    }
    Ok(())
}
