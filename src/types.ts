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
  timestamp: number;
  ttl: number;
  delivered: boolean;
  isEncrypted: boolean;
}
