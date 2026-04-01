import AsyncStorage from '@react-native-async-storage/async-storage';
import MeshCrypto from './MeshCrypto';
import { Contact, Message, Profile, Peer } from '../types';

// In a production app with high volume offline mesh data,
// we would use SQLite or WatermelonDB here. For this prototype,
// we will wrap AsyncStorage to simulate the DTN (Delay Tolerant Network) queue.

const MESSAGES_KEY = '@messages_v2';
const PEERS_KEY = '@peers_cache';
const PROFILE_KEY = '@my_profile_v2';

class MeshStorage {
  async getMyProfile(): Promise<Profile> {
    let profileStr = await AsyncStorage.getItem(PROFILE_KEY);
    if (!profileStr) {
      // Generate immutable Node ID and Keypair
      const identity = await MeshCrypto.generateIdentity();
      const newId = 'node_' + identity.publicKey.substring(0, 10);
      
      const profile: Profile = { 
        id: newId, 
        name: 'Ghost Node',
        publicKey: identity.publicKey,
        privateKey: identity.privateKey
      };
      await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      return profile;
    }
    return JSON.parse(profileStr);
  }

  async updateMyProfile(name: string): Promise<Profile> {
    const profile = await this.getMyProfile();
    profile.name = name;
    await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    return profile;
  }

  // Store peer info (like public keys) once discovered
  async savePeerInfo(peer: Peer): Promise<void> {
      const peers = await this.getPeers();
      const index = peers.findIndex(p => p.id === peer.id);
      if (index >= 0) {
          peers[index] = { ...peers[index], ...peer };
      } else {
          peers.push(peer);
      }
      await AsyncStorage.setItem(PEERS_KEY, JSON.stringify(peers));
  }

  async getPeers(): Promise<Peer[]> {
      const data = await AsyncStorage.getItem(PEERS_KEY);
      return data ? JSON.parse(data) : [];
  }

  // Auto-cleanup old mesh traffic to save space
  async pruneHistory(): Promise<void> {
      const messages = await this.getMessages();
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      
      // Only keep recent or undelivered relay traffic
      const filtered = messages.filter(m => m.timestamp > thirtyDaysAgo || !m.delivered);
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(filtered));
  }

  async clearMessagesWithContact(contactId: string): Promise<void> {
      const messages = await this.getMessages();
      const filtered = messages.filter(m => 
          !(m.senderId === contactId || m.recipientId === contactId)
      );
      await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(filtered));
  }

  async getMessages(recipientId?: string): Promise<Message[]> {
    const data = await AsyncStorage.getItem(MESSAGES_KEY);
    const msgs: Message[] = data ? JSON.parse(data) : [];
    if (recipientId) {
        return msgs.filter(m => m.recipientId === recipientId);
    }
    return msgs;
  }

  async saveMessage(msg: Message): Promise<Message[]> {
    const messages = await this.getMessages();
    // Deduplicate before saving
    if (!messages.find(m => m.id === msg.id)) {
        messages.push(msg);
        await AsyncStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    }
    return messages;
  }

  // Gets messages that have a Time-To-Live > 0 and haven't been successfully delivered yet
  async getMessagesToRelay(): Promise<Message[]> {
    const messages = await this.getMessages();
    return messages.filter(m => m.ttl > 0 && !m.delivered);
  }

  async getContacts(): Promise<Contact[]> {
    const data = await AsyncStorage.getItem('@contacts');
    return data ? JSON.parse(data) : [];
  }

  async addContact(contact: Contact): Promise<Contact[]> {
    const contacts = await this.getContacts();
    if (!contacts.find(c => c.id === contact.id)) {
      contacts.push(contact);
      await AsyncStorage.setItem('@contacts', JSON.stringify(contacts));
    }
    return contacts;
  }
}

export default new MeshStorage();
