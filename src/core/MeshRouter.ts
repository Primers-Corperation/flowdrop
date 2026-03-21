import MeshStorage from './MeshStorage';
import MeshManager from './MeshManager';
import MeshCrypto from './MeshCrypto';
import { Message } from '../types';

// We use a local Device interface that works for both native and web
interface Device {
  id: string;
  name: string | null;
}

class MeshRouter {
  private onMessageReceived: ((msg: Message) => void) | null = null;
  private seenMessages: Set<string> = new Set();
  private meshCache: Map<string, number> = new Map(); // messageId -> timestamp
  private MAX_CACHE_SIZE = 1000;

  public setOnMessageReceived(callback: (msg: Message) => void | null) {
      this.onMessageReceived = callback;
  }

  // Create a new message meant for the mesh network
  async createMessage(recipientId: string, text: string, recipientPublicKey?: string, image?: string): Promise<Message> {
    const profile = await MeshStorage.getMyProfile();
    
    const payload = recipientPublicKey 
        ? await MeshCrypto.encrypt(text, recipientPublicKey) 
        : text;

    const message: Message = {
      id: profile.id.substring(0,8) + '_' + Date.now().toString(36),
      senderId: profile.id,
      senderName: profile.name,
      recipientId: recipientId,
      text: payload,
      image: image,
      timestamp: Date.now(),
      ttl: 7, // BitChat Golden Number
      delivered: false,
      isEncrypted: !!recipientPublicKey,
      type: 'chat'
    };

    this.addToCache(message.id);
    await MeshStorage.saveMessage(message);
    this.broadcastToMesh(message);
    
    return message;
  }

  // Create a mesh-wide status ripple (WhatsApp Stories)
  async createStatus(text: string, image?: string): Promise<Message> {
      const profile = await MeshStorage.getMyProfile();
      const message: Message = {
          id: `status_${profile.id}_${Date.now()}`,
          senderId: profile.id,
          senderName: profile.name,
          recipientId: 'mesh',
          text: text,
          image: image,
          timestamp: Date.now(),
          ttl: 4,
          delivered: true, // Statues are self-delivering
          isEncrypted: false,
          type: 'status'
      };
      
      this.seenMessages.add(message.id);
      this.meshCache.set(message.id, Date.now());
      await MeshStorage.saveMessage(message);
      this.broadcastToMesh(message);

      // MIRROR: Mirror the result to the worldwide Nostr network
      const NostrManager = require('./NostrManager').default;
      NostrManager.broadcastStatus(message);

      return message;
  }

  // Called when we receive any message from the Bluetooth/Wi-Fi mesh
  async receiveMessage(incoming: any, fromPeerId?: string): Promise<void> {
    let message: Message;

    // 1. DECODE Compact Packet (BitChat Speed)
    if (Array.isArray(incoming)) {
        message = {
            type: incoming[0] === 1 ? 'chat' : incoming[0] === 2 ? 'status' : 'ack',
            id: incoming[1],
            senderId: incoming[2],
            recipientId: incoming[3],
            text: incoming[4],
            image: incoming[5],
            ttl: incoming[6],
            timestamp: incoming[7],
            delivered: true,
            senderName: 'Mesh Node', // Handled by storage lookup later
            isEncrypted: false // Calculated during decryption stage
        };
    } else {
        message = incoming as Message;
    }

    const profile = await MeshStorage.getMyProfile();

    // 2. DEDUPLICATION (Better than Bloom)
    if (this.meshCache.has(message.id)) return;
    this.addToCache(message.id);

    // 2. IS IT FOR ME OR FOR THE MESH?
    const isForMe = message.recipientId === profile.id;
    const isBroadcast = message.recipientId === 'mesh' || message.type === 'status';

    if (isForMe || isBroadcast) {
        if (isForMe) {
            message.delivered = true;
            if (message.isEncrypted && profile.privateKey) {
                try {
                    message.text = await MeshCrypto.decrypt(message.text, profile.privateKey);
                } catch (e) { console.warn("Decryption fail"); }
            }
            this.sendAck(message.id, message.senderId);
        }

        await MeshStorage.saveMessage(message);
        
        if (this.onMessageReceived) {
            this.onMessageReceived(message);
        }
    }

    // 3. RELAY LOGIC (Keep the Ripple going)
    if (message.ttl > 0 && message.senderId !== profile.id) {
        message.ttl -= 1;
        // Don't save it again if we already saved it above
        if (!isForMe && !isBroadcast) {
            await MeshStorage.saveMessage(message);
        }
        console.log(`📡 MESH: Relaying ${message.id} (TTL: ${message.ttl})`);
        this.broadcastToMesh(message, fromPeerId);
    }
  }

  // Send a delivery confirmation back to the sender
  private async sendAck(messageId: string, originalSenderId: string) {
      const profile = await MeshStorage.getMyProfile();
      const ackMessage: Message = {
          id: `ack_${messageId}`,
          senderId: profile.id,
          senderName: profile.name,
          recipientId: originalSenderId,
          text: `CONFIRMED_DELIVERY:${messageId}`,
          timestamp: Date.now(),
          ttl: 4,
          delivered: true,
          isEncrypted: false,
          type: 'ack'
      };
      this.broadcastToMesh(ackMessage);
  }

  // Pure P2P broadcast - now uses compact binary-ready payloads
  broadcastToMesh(message: Message, excludePeerId: string | null = null): void {
      // 1. Binary Compaction (Pseudo-Binary for JS bridge efficiency)
      // BitChat: [type, id, sender, recipient, payload, ttl]
      const compactPacket = [
          message.type === 'chat' ? 1 : message.type === 'status' ? 2 : 3,
          message.id,
          message.senderId,
          message.recipientId,
          message.text,
          message.image || '',
          message.ttl,
          message.timestamp
      ];

      (MeshManager as any).sendMessage('mesh', compactPacket);
  }

  private addToCache(id: string) {
      if (this.meshCache.size > this.MAX_CACHE_SIZE) {
          const firstKey = this.meshCache.keys().next().value;
          if (firstKey) this.meshCache.delete(firstKey);
      }
      this.meshCache.set(id, Date.now());
  }

  async flushQueue(): Promise<void> {
    const pending = await MeshStorage.getMessagesToRelay();
    for (const msg of pending) {
        this.broadcastToMesh(msg);
    }
  }
}

export default new MeshRouter();
