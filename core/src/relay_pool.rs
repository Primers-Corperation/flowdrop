use std::sync::{Arc, Mutex};
use std::collections::HashMap;
use tokio::net::TcpStream;
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message, WebSocketStream, MaybeTlsStream};
use futures_util::{StreamExt, SinkExt};
use tokio_util::sync::CancellationToken;
use tokio::sync::mpsc;
use url::Url;

use crate::get_runtime;

pub type RelayStream = WebSocketStream<MaybeTlsStream<TcpStream>>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RelayStatus {
    Connecting,
    Connected,
    Disconnected,
}

pub struct RelayPool {
    /// Maps relay URL to its current status and its outbound message channel.
    relays: Arc<Mutex<HashMap<String, (RelayStatus, mpsc::Sender<String>)>>>,
}

impl RelayPool {
    pub fn new() -> Self {
        Self {
            relays: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Adds a Nostr relay to the pool and initializes the background connection task.
    pub fn add_relay(&self, url_str: String, cancel_token: CancellationToken) {
        let (tx, mut rx) = mpsc::channel::<String>(100);
        let relays_clone = self.relays.clone();
        
        // Initial insert in connecting state
        {
            let mut r = relays_clone.lock().unwrap();
            r.insert(url_str.clone(), (RelayStatus::Connecting, tx));
        }

        if let Some(runtime) = get_runtime() {
            runtime.spawn(async move {
                let url = match Url::parse(&url_str) {
                    Ok(u) => u,
                    Err(e) => {
                        println!("FATAL: Invalid Relay URL {}: {:?}", url_str, e);
                        return;
                    }
                };

                loop {
                    if cancel_token.is_cancelled() { break; }

                    match connect_async(url.clone()).await {
                        Ok((mut ws_stream, _)) => {
                            {
                                let mut r = relays_clone.lock().unwrap();
                                if let Some(entry) = r.get_mut(&url_str) {
                                    entry.0 = RelayStatus::Connected;
                                }
                                println!("Relay Connected: {}", url_str);
                            }

                            // Loop to maintain connection and handle bidirectional traffic
                            while !cancel_token.is_cancelled() {
                                tokio::select! {
                                    // Inbound messages from Relay
                                    msg = ws_stream.next() => {
                                        match msg {
                                            Some(Ok(Message::Text(text))) => {
                                                crate::nostr::handle_relay_message(&url_str, &text);
                                            }
                                            Some(Ok(Message::Ping(p))) => {
                                                let _ = ws_stream.send(Message::Pong(p)).await;
                                            }
                                            None | Some(Err(_)) => break, // Socket closed
                                            _ => {}
                                        }
                                    }
                                    // Outbound messages from Rust core (queued via broadcast)
                                    Some(outbound_text) = rx.recv() => {
                                        if let Err(e) = ws_stream.send(Message::Text(outbound_text)).await {
                                            println!("Relay Write Error to {}: {:?}", url_str, e);
                                            break;
                                        }
                                    }
                                    _ = cancel_token.cancelled() => break,
                                }
                            }
                        }
                        Err(e) => {
                            println!("Relay Reconnect Error {}: {:?}", url_str, e);
                        }
                    }

                    // Reset status to disconnected before retry
                    {
                        let mut r = relays_clone.lock().unwrap();
                        if let Some(entry) = r.get_mut(&url_str) {
                            entry.0 = RelayStatus::Disconnected;
                        }
                    }
                    
                    if cancel_token.is_cancelled() { break; }
                    tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
                }
            });
        }
    }

    /// Broadcasts an encoded Nostr event string to all currently connected relays.
    /// This uses the per-relay MPSC channels to avoid blocking during network IO.
    pub async fn broadcast(&self, event_json: String) {
        let relays = self.relays.lock().unwrap();
        for (url, (status, sender)) in relays.iter() {
            if *status == RelayStatus::Connected {
                let tx = sender.clone();
                let payload = event_json.clone();
                match tx.try_send(payload) {
                    Ok(_) => {},
                    Err(e) => println!("Relay Buffer Full for {}: {:?}", url, e),
                }
            }
        }
    }
}
