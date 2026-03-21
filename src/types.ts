export interface Contact {
  id: string;
  name: string;
}

export interface Peer {
  id: string;
  name?: string | null;
}

export interface Profile {
  id: string;
  name: string;
  publicKey?: string;
  privateKey?: string;
}

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  text: string;
  image?: string; // Base64 URI for photos over mesh
  timestamp: number;
  ttl: number;
  delivered: boolean;
  isEncrypted: boolean;
  type: 'chat' | 'status' | 'ack';
}

export interface Story {
    id: string;
    userId: string;
    userName: string;
    imageUrl: string;
    caption?: string;
    timestamp: number;
}
