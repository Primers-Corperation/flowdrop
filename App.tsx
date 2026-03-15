import React, { useState, useEffect } from 'react';
import { 
    SafeAreaView, StyleSheet, View, Text, TouchableOpacity, 
    FlatList, TextInput, StatusBar 
} from 'react-native';
import { MessageSquare, Users, Globe, Settings } from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import MeshManager from './src/core/MeshManager';
import MeshRouter from './src/core/MeshRouter';
import MeshStorage from './src/core/MeshStorage';

import ChatView from './src/components/ChatView';
import NetworkMap from './src/components/NetworkMap';

function AppContent() {
  const [activeTab, setActiveTab] = useState('chats');
  const [selectedContact, setSelectedContact] = useState(null);
  const [peers, setPeers] = useState([]);
  const [profile, setProfile] = useState({ name: 'Loading...', id: '' });
  const [hasPermissions, setHasPermissions] = useState(false);
  const [recentChats, setRecentChats] = useState([]);

  useEffect(() => {
    async function init() {
      const p = await MeshStorage.getMyProfile();
      setProfile(p);

      const granted = await MeshManager.requestPermissions();
      setHasPermissions(granted);

      if (granted) {
        MeshManager.onDeviceFound = (foundPeers) => {
          setPeers(foundPeers);
        };
        MeshManager.startScanning();
      }

      loadRecentChats();
    }
    init();

    return () => {
      MeshManager.stopScanning();
    };
  }, []);

  const loadRecentChats = async () => {
      const contacts = await MeshStorage.getContacts();
      setRecentChats(contacts);
  };

  const openChat = (contact) => {
      setSelectedContact(contact);
  };

  if (selectedContact) {
      return (
          <ChatView 
            contact={selectedContact} 
            onBack={() => {
                setSelectedContact(null);
                loadRecentChats();
            }} 
          />
      );
  }

  const renderContent = () => {
    switch(activeTab) {
      case 'chats':
        return <ChatsView chats={recentChats} onOpenChat={openChat} />
      case 'network':
        return <NetworkView peers={peers} permissions={hasPermissions} onOpenChat={openChat}/>
      case 'profile':
        return <ProfileView profile={profile} />
      default:
        return <ChatsView chats={recentChats} onOpenChat={openChat} />
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#111B21" />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>FlowDrop</Text>
        <TouchableOpacity>
          <Settings color="#fff" size={24} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {renderContent()}
      </View>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('chats')}>
          <MessageSquare color={activeTab === 'chats' ? '#00A884' : '#8696A0'} />
          <Text style={[styles.navText, activeTab === 'chats' && styles.activeNavText]}>Chats</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('network')}>
          <Globe color={activeTab === 'network' ? '#00A884' : '#8696A0'} />
          <Text style={[styles.navText, activeTab === 'network' && styles.activeNavText]}>Network</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('profile')}>
           <Users color={activeTab === 'profile' ? '#00A884' : '#8696A0'} />
          <Text style={[styles.navText, activeTab === 'profile' && styles.activeNavText]}>Profile</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

// ============== Sub-Views ============== //

function ChatsView({ chats, onOpenChat }) {
    if (chats.length === 0) {
        return (
            <View style={styles.centeredView}>
                <MessageSquare color="#8696A0" size={64} style={{marginBottom: 20}} />
                <Text style={styles.emptyText}>No recent messages.</Text>
                <Text style={styles.subText}>Find peers in the Network tab to chat offline.</Text>
            </View>
        );
    }

    return (
        <View style={styles.panel}>
            <Text style={styles.panelTitle}>Recent Chats</Text>
            <FlatList 
                data={chats}
                keyExtractor={item => item.id}
                renderItem={({item}) => (
                    <TouchableOpacity style={styles.peerItem} onPress={() => onOpenChat(item)}>
                        <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{item.name.substring(0,2).toUpperCase()}</Text>
                        </View>
                        <View style={styles.peerInfo}>
                            <Text style={styles.peerName}>{item.name}</Text>
                            <Text style={styles.peerId}>Offline Relay Active</Text>
                        </View>
                    </TouchableOpacity>
                )}
            />
        </View>
    );
}

function NetworkView({ peers, permissions, onOpenChat }) {
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'map'

    if (!permissions) {
        return (
            <View style={styles.centeredView}>
                <Text style={styles.emptyText}>Permissions Required</Text>
                <Text style={styles.subText}>Please enable Bluetooth and Location to scan for peers.</Text>
            </View>
        );
    }

    return (
        <View style={styles.panel}>
            <View style={styles.panelHeader}>
                <Text style={styles.panelTitle}>Local Mesh Nodes ({peers.length})</Text>
                <View style={styles.toggleGroup}>
                    <TouchableOpacity 
                        style={[styles.toggleBtn, viewMode === 'list' && styles.toggleActive]}
                        onPress={() => setViewMode('list')}
                    >
                        <Text style={[styles.toggleText, viewMode === 'list' && styles.toggleTextActive]}>List</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.toggleBtn, viewMode === 'map' && styles.toggleActive]}
                        onPress={() => setViewMode('map')}
                    >
                        <Text style={[styles.toggleText, viewMode === 'map' && styles.toggleTextActive]}>Map</Text>
                    </TouchableOpacity>
                </View>
            </View>
           
           {viewMode === 'map' ? (
               <NetworkMap peers={peers} />
           ) : (
               peers.length === 0 ? (
                    <View style={styles.centeredView}>
                            <Text style={styles.subText}>Scanning for nearby devices via Bluetooth Low Energy...</Text>
                    </View>
                ) : (
                    <FlatList 
                        data={peers}
                        keyExtractor={item => item.id}
                        renderItem={({item}) => (
                            <View style={styles.peerItem}>
                                <View style={styles.avatar}>
                                    <Text style={styles.avatarText}>{item.name ? item.name.substring(0,2).toUpperCase() : '?'}</Text>
                                </View>
                                <View style={styles.peerInfo}>
                                    <Text style={styles.peerName}>{item.name || 'Unknown Device'}</Text>
                                    <Text style={styles.peerId}>{item.id}</Text>
                                </View>
                                <TouchableOpacity 
                                    style={styles.connectBtn}
                                    onPress={async () => {
                                        const contact = { id: item.id, name: item.name || 'Peer' };
                                        await MeshStorage.addContact(contact);
                                        onOpenChat(contact);
                                    }}
                                >
                                    <Text style={styles.connectBtnText}>Chat</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    />
                )
           )}
        </View>
    )
}

function ProfileView({ profile }) {
    return (
        <View style={styles.panel}>
            <Text style={styles.panelTitle}>Identity (Public Key Hash)</Text>
            
            <View style={styles.profileHeader}>
                <View style={styles.largeAvatar}>
                    <Text style={styles.largeAvatarText}>{profile.name.substring(0,2).toUpperCase()}</Text>
                </View>
                <Text style={styles.profileId}>{profile.id}</Text>
                <Text style={styles.subText}>This is your persistent offline identity.</Text>
            </View>

            <Text style={styles.label}>Display Name</Text>
            <TextInput 
                style={styles.input}
                value={profile.name}
                editable={false} 
            />
        </View>
    )
}

// ============== Styles ============== //

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  header: {
    height: 60,
    backgroundColor: '#202C33',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    elevation: 4,
  },
  headerTitle: {
    color: '#E9EDEF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    backgroundColor: '#0B141A',
  },
  panel: {
    flex: 1,
    padding: 20,
  },
  panelHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
  },
  panelTitle: {
      color: '#00A884',
      fontSize: 16,
      fontWeight: 'bold',
  },
  toggleGroup: {
      flexDirection: 'row',
      backgroundColor: '#202C33',
      borderRadius: 15,
      padding: 4,
  },
  toggleBtn: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
  },
  toggleActive: {
      backgroundColor: '#00A884',
  },
  toggleText: {
      color: '#8696A0',
      fontSize: 12,
      fontWeight: 'bold',
  },
  toggleTextActive: {
      color: '#fff',
  },
  bottomNav: {
    flexDirection: 'row',
    height: 70,
    backgroundColor: '#202C33',
    borderTopWidth: 1,
    borderTopColor: '#30404C',
  },
  navItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navText: {
    color: '#8696A0',
    fontSize: 12,
    marginTop: 5,
    fontWeight: '500',
  },
  activeNavText: {
    color: '#00A884',
  },
  centeredView: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
  },
  emptyText: {
      color: '#E9EDEF',
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 10,
  },
  subText: {
      color: '#8696A0',
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
  },
  peerItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: '#202C33',
  },
  avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      backgroundColor: '#00A884',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 15,
  },
  avatarText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
  },
  peerInfo: {
      flex: 1,
  },
  peerName: {
      color: '#E9EDEF',
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 4,
  },
  peerId: {
      color: '#8696A0',
      fontSize: 12,
  },
  connectBtn: {
      backgroundColor: '#00A884',
      paddingHorizontal: 15,
      paddingVertical: 8,
      borderRadius: 20,
  },
  connectBtnText: {
      color: '#fff',
      fontWeight: 'bold',
      fontSize: 13,
  },
  label: {
      color: '#8696A0',
      fontSize: 14,
      marginBottom: 10,
      marginTop: 30,
  },
  input: {
      backgroundColor: '#202C33',
      color: '#E9EDEF',
      padding: 15,
      borderRadius: 10,
      fontSize: 16,
  },
  profileHeader: {
      alignItems: 'center',
      marginTop: 20,
  },
  largeAvatar: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: '#00A884',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 20,
  },
  largeAvatarText: {
      color: '#fff',
      fontSize: 40,
      fontWeight: 'bold',
  },
  profileId: {
      color: '#E9EDEF',
      fontSize: 16,
      fontFamily: 'monospace',
      marginBottom: 10,
  }
});
