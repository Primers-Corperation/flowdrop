use std::collections::HashMap;

const BASE32: &[u8] = b"0123456789bcdefghjkmnpqrstuvwxyz";

#[derive(Debug, Clone)]
pub struct Channel {
    pub name: String,
    pub is_geohash: bool,
    pub members: Vec<String>,
}

pub struct GeohashEngine {
    active_channels: HashMap<String, Channel>,
}

impl GeohashEngine {
    pub fn new() -> Self {
        Self {
            active_channels: HashMap::new(),
        }
    }

    /// Converts latitude/longitude into a N-character geohash string.
    /// Used for auto-joining local mesh "rooms".
    pub fn encode(lat: f64, lon: f64, precision: usize) -> String {
        let mut lat_range = (-90.0, 90.0);
        let mut lon_range = (-180.0, 180.0);
        let mut geohash = String::with_capacity(precision);
        let mut is_even = true;
        let mut bit = 0;
        let mut ch = 0;

        while geohash.len() < precision {
            let mid: f64;
            if is_even {
                mid = (lon_range.0 + lon_range.1) / 2.0;
                if lon > mid {
                    ch |= 1 << (4 - bit);
                    lon_range.0 = mid;
                } else {
                    lon_range.1 = mid;
                }
            } else {
                mid = (lat_range.0 + lat_range.1) / 2.0;
                if lat > mid {
                    ch |= 1 << (4 - bit);
                    lat_range.0 = mid;
                } else {
                    lat_range.1 = mid;
                }
            }

            is_even = !is_even;
            if bit < 4 {
                bit += 1;
            } else {
                geohash.push(BASE32[ch] as char);
                bit = 0;
                ch = 0;
            }
        }
        geohash
    }

    /// Parses a raw user input string for IRC-style commands.
    /// Returns (command, target, argument)
    pub fn parse_command(input: &str) -> Option<(&str, &str, &str)> {
        if !input.starts_with('/') {
            return None;
        }

        let parts: Vec<&str> = input[1..].split_whitespace().collect();
        if parts.is_empty() {
            return None;
        }

        let cmd = parts[0];
        match cmd {
            "join" => {
                if parts.len() >= 2 {
                    Some(("JOIN", parts[1], ""))
                } else {
                    None
                }
            }
            "nick" => {
                if parts.len() >= 2 {
                    Some(("NICK", parts[1], ""))
                } else {
                    None
                }
            }
            "msg" => {
                if parts.len() >= 3 {
                    // Extract message content safely
                    let msg_content = input.splitn(3, ' ').nth(2).unwrap_or("");
                    Some(("MSG", parts[1], msg_content))
                } else {
                    None
                }
            }
            _ => None
        }
    }
}

pub fn handle_irc_input(engine: &mut GeohashEngine, input: &str) -> String {
    if let Some((cmd, target, arg)) = GeohashEngine::parse_command(input) {
        match cmd {
            "JOIN" => {
                engine.active_channels.insert(target.to_string(), Channel {
                    name: target.to_string(),
                    is_geohash: target.starts_with('#'),
                    members: vec![],
                });
                format!("Joined channel {}", target)
            }
            "NICK" => {
                // Future: Update local mesh profile
                format!("Nickname set to {}", target)
            }
            "MSG" => {
                format!("Sent message to {}: {}", target, arg)
            }
            _ => "Unknown command".to_string()
        }
    } else {
        "Not an IRC command".to_string()
    }
}
