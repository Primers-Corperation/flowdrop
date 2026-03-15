import AsyncStorage from '@react-native-async-storage/async-storage';
import MeshCrypto from './MeshCrypto';

// In a production app with high volume offline mesh data,
// we would use SQLite or WatermelonDB here. For this prototype,
// we will wrap AsyncStorage to simulate the DTN (Delay Tolerant Network) queue.

class MeshStorage {
  async getMyProfile() {
    let profile = await AsyncStorage.getItem('@my_profile');
    if (!profile) {
      // Generate immutable Node ID and Keypair
      const identity = await MeshCrypto.generateIdentity();
      const newId = 'node_' + identity.publicKey.substring(0, 12);
      
      profile = JSON.stringify({ 
        id: newId, 
        name: 'Anonymous Node',
        publicKey: identity.publicKey,
        privateKey: identity.privateKey
      });
      await AsyncStorage.setItem('@my_profile', profile);
    }
    return JSON.parse(profile);
  }

  async updateMyProfile(name) {
    const profile = await this.getMyProfile();
    profile.name = name;
    await AsyncStorage.setItem('@my_profile', JSON.stringify(profile));
    return profile;
  }

  async getMessages() {
    const data = await AsyncStorage.getItem('@messages');
    return data ? JSON.parse(data) : [];
  }

  async saveMessage(msg) {
    const messages = await this.getMessages();
    messages.push(msg);
    await AsyncStorage.setItem('@messages', JSON.stringify(messages));
    return messages;
  }

  // Gets messages that have a Time-To-Live > 0 and haven't been successfully delivered yet
  async getMessagesToRelay() {
    const messages = await this.getMessages();
    return messages.filter(m => m.ttl > 0 && !m.delivered);
  }

  async getContacts() {
    const data = await AsyncStorage.getItem('@contacts');
    return data ? JSON.parse(data) : [];
  }

  async addContact(contact) {
    const contacts = await this.getContacts();
    if (!contacts.find(c => c.id === contact.id)) {
      contacts.push(contact);
      await AsyncStorage.setItem('@contacts', JSON.stringify(contacts));
    }
    return contacts;
  }
}

export default new MeshStorage();
