import AsyncStorage from '@react-native-async-storage/async-storage';
import MeshCrypto from './MeshCrypto';
import { Contact, Message, Profile } from '../types';

// In a production app with high volume offline mesh data,
// we would use SQLite or WatermelonDB here. For this prototype,
// we will wrap AsyncStorage to simulate the DTN (Delay Tolerant Network) queue.

class MeshStorage {
  async getMyProfile(): Promise<Profile> {
    let profileStr = await AsyncStorage.getItem('@my_profile');
    if (!profileStr) {
      // Generate immutable Node ID and Keypair
      const identity = await MeshCrypto.generateIdentity();
      const newId = 'node_' + identity.publicKey.substring(0, 12);
      
      const profile: Profile = { 
        id: newId, 
        name: 'Anonymous Node',
        publicKey: identity.publicKey,
        privateKey: identity.privateKey
      };
      await AsyncStorage.setItem('@my_profile', JSON.stringify(profile));
      return profile;
    }
    return JSON.parse(profileStr);
  }

  async updateMyProfile(name: string): Promise<Profile> {
    const profile = await this.getMyProfile();
    profile.name = name;
    await AsyncStorage.setItem('@my_profile', JSON.stringify(profile));
    return profile;
  }

  async getMessages(): Promise<Message[]> {
    const data = await AsyncStorage.getItem('@messages');
    return data ? JSON.parse(data) : [];
  }

  async saveMessage(msg: Message): Promise<Message[]> {
    const messages = await this.getMessages();
    messages.push(msg);
    await AsyncStorage.setItem('@messages', JSON.stringify(messages));
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
