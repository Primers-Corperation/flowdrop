import MeshStorage from './MeshStorage';
import MeshManager from './MeshManager';
import MeshCrypto from './MeshCrypto';
import { Message, Profile } from '../types';
import { Device } from 'react-native-ble-plx';

class MeshRouter {
  
  // Create a new message meant for the mesh network
  async createMessage(recipientId: string, text: string, recipientPublicKey?: string): Promise<Message> {
    const profile = await MeshStorage.getMyProfile();
    
    // Encrypt the payload if we have the recipient's public key
    const payload = recipientPublicKey 
        ? await MeshCrypto.encrypt(text, recipientPublicKey) 
        : text;

    const message: Message = {
      id: profile.id + '_' + Date.now(),
      senderId: profile.id,
      senderName: profile.name,
      recipientId: recipientId,
      text: payload, // This is now potentially encrypted
      timestamp: Date.now(),
      ttl: 5, // Max number of hops
      delivered: false,
      isEncrypted: !!recipientPublicKey
    };

    // Save locally
    await MeshStorage.saveMessage(message);
    
    // Attempt to broadcast immediately if peers are connected
    this.broadcastMessageToConnectedPeers(message);
    
    return message;
  }

  // Called when we receive a message from the BLE network
  async receiveMessage(message: Message, fromPeerId?: string): Promise<void> {
    const profile = await MeshStorage.getMyProfile();
    const existingMessages = await MeshStorage.getMessages();

    // Prevent broadcast storms (don't process messages we've already seen or sent)
    if (existingMessages.find(m => m.id === message.id) || message.senderId === profile.id) {
        return;
    }

    // Is it for me?
    if (message.recipientId === profile.id) {
        // YES: Deliver locally!
        message.delivered = true;
        
        // Decrypt if necessary
        if (message.isEncrypted && profile.privateKey) {
            message.text = await MeshCrypto.decrypt(message.text, profile.privateKey);
        }

        await MeshStorage.saveMessage(message);
        
        // Notify UI layer
        console.log(`Received private message from ${message.senderName}: ${message.text}`);
        
    } else {
        // NO: It's for someone else. 
        // We act as a relay node. (Store and Forward)
        
        if (message.ttl > 0) {
            message.ttl -= 1; // Decrement Time-To-Live
            await MeshStorage.saveMessage(message);
            console.log(`Relaying message from ${message.senderName} to ${message.recipientId}. TTL is now ${message.ttl}`);
            
            // Re-broadcast to anyone we are connected to (except the person who gave it to us)
            this.broadcastMessageToConnectedPeers(message, fromPeerId);
        }
    }
  }

  // Periodic background task to flush the pending DTN queue
  async flushQueue(): Promise<void> {
    console.log("Flushing DTN Queue to any connected peers...");
    const pending = await MeshStorage.getMessagesToRelay();
    
    for (const msg of pending) {
        this.broadcastMessageToConnectedPeers(msg);
    }
  }

  // Send over BLE characteristics
  broadcastMessageToConnectedPeers(message: Message, excludePeerId: string | null = null): void {
      // In a full implementation, you'd iterate MeshManager.connectedDevices
      // and write the `message` JSON string to their RX characteristic.
      
      const peers = MeshManager.devices;
      for (const peer of peers) {
          if (peer.id !== excludePeerId) {
              // TODO: Write to BLE Characteristic
              console.log(`Simulating broadcast of ${message.id} to BLE Device ${peer.id}`);
          }
      }
  }
}

export default new MeshRouter();
