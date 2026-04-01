use std::convert::TryFrom;

#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum PacketType {
    DataChunk = 0x01,
    Nack = 0x02,
}

impl TryFrom<u8> for PacketType {
    type Error = String;
    fn try_from(value: u8) -> Result<Self, Self::Error> {
        match value {
            0x01 => Ok(PacketType::DataChunk),
            0x02 => Ok(PacketType::Nack),
            _ => Err(format!("Unknown PacketType byte: {:#X}", value)),
        }
    }
}

#[derive(Debug, Clone)]
pub struct DataChunkHeader {
    pub msg_id: u32,
    pub total_chunks: u16,
    pub chunk_index: u16,
}

#[derive(Debug, Clone)]
pub struct NackHeader {
    pub msg_id: u32,
    pub missing_indices: Vec<u16>,
}

#[derive(Debug, Clone)]
pub enum Packet {
    Data {
        header: DataChunkHeader,
        payload: Vec<u8>,
    },
    Nack {
        header: NackHeader,
    },
}

impl Packet {
    /// Serializes the struct into a binary array ready for BLE transmission
    pub fn encode(&self) -> Vec<u8> {
        let mut buffer = Vec::new();
        match self {
            Packet::Data { header, payload } => {
                buffer.push(PacketType::DataChunk as u8);
                buffer.extend_from_slice(&header.msg_id.to_be_bytes());
                buffer.extend_from_slice(&header.total_chunks.to_be_bytes());
                buffer.extend_from_slice(&header.chunk_index.to_be_bytes());
                buffer.extend_from_slice(payload);
            }
            Packet::Nack { header } => {
                buffer.push(PacketType::Nack as u8);
                buffer.extend_from_slice(&header.msg_id.to_be_bytes());
                // encode all missing chunks as 2-byte numbers
                for index in &header.missing_indices {
                    buffer.extend_from_slice(&index.to_be_bytes());
                }
            }
        }
        buffer
    }

    /// Deserializes incoming BLE bytes back into a parsed Packet structure
    pub fn decode(bytes: &[u8]) -> Result<Self, String> {
        if bytes.is_empty() {
            return Err("Packet is empty".to_string());
        }

        let packet_type = PacketType::try_from(bytes[0])?;
        match packet_type {
            PacketType::DataChunk => {
                if bytes.len() < 9 {
                    return Err("DataChunk packet too small for header".to_string());
                }
                let msg_id = u32::from_be_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
                let total_chunks = u16::from_be_bytes([bytes[5], bytes[6]]);
                let chunk_index = u16::from_be_bytes([bytes[7], bytes[8]]);
                let payload = bytes[9..].to_vec();

                Ok(Packet::Data {
                    header: DataChunkHeader {
                        msg_id,
                        total_chunks,
                        chunk_index,
                    },
                    payload,
                })
            }
            PacketType::Nack => {
                if bytes.len() < 5 {
                    return Err("NACK packet too small for header".to_string());
                }
                let msg_id = u32::from_be_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
                
                let mut missing_indices = Vec::new();
                let mut offset = 5;
                while offset + 1 < bytes.len() {
                    let idx = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]);
                    missing_indices.push(idx);
                    offset += 2;
                }

                Ok(Packet::Nack {
                    header: NackHeader { msg_id, missing_indices },
                })
            }
        }
    }
}
