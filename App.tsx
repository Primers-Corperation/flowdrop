import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, View, Text, TouchableOpacity, FlatList, 
  SafeAreaView, Platform, StatusBar, Modal, ScrollView, Switch, Alert, Image 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { 
    MessageSquare, Users, Globe, Settings, 
    Share2, CircleDashed, MessageCircle, Radio 
} from 'lucide-react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Web-only: Ensure the root container takes up the full screen height
if (Platform.OS === 'web') {
  const style = document.createElement('style');
  style.textContent = `
    html, body, #root { height: 100%; margin: 0; padding: 0; overflow: hidden; background-color: #0B141A; }
    #root > div { height: 100%; display: flex; flex-direction: column; }
  `;
  document.head.append(style);
}

import MeshManager from './src/core/MeshManager';
import MeshRouter from './src/core/MeshRouter';
import MeshStorage from './src/core/MeshStorage';
import NostrManager from './src/core/NostrManager';
import ChatView from './src/components/ChatView';
import NetworkMap from './src/components/NetworkMap';
import SettingsView from './src/components/SettingsView';
import { Contact, Peer, Profile, Message } from './src/types';

function AppContent() {
  const [activeTab, setActiveTab] = useState<'chats' | 'network' | 'profile' | 'status'>('chats');
  const [peers, setPeers] = useState<Peer[]>([]);
  const [recentChats, setRecentChats] = useState<Contact[]>([]);
  const [selectedChat, setSelectedChat] = useState<Contact | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [hasPermissions, setHasPermissions] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stories, setStories] = useState<Message[]>([]);
  const [theme, setTheme] = useState<'diamond' | 'solaris' | 'neon' | 'ocean' | 'midnight'>('diamond');
  const [font, setFont] = useState<'system' | 'inter' | 'monospace'>('system');

  const themes = {
    diamond: { bg: '#0B141A', accent: '#00A884', text: '#E9EDEF', sub: '#8696A0', card: '#111B21' },
    solaris: { bg: '#F8F9FA', accent: '#0088CC', text: '#1C1F23', sub: '#667781', card: '#FFFFFF' },
    neon: { bg: '#0A0A0F', accent: '#FF00FB', text: '#E0E0FF', sub: '#7A7A9E', card: '#14141F' },
    ocean: { bg: '#0D1117', accent: '#2F81F7', text: '#C9D1D9', sub: '#8B949E', card: '#161B22' },
    midnight: { bg: '#000000', accent: '#39FF14', text: '#FFFFFF', sub: '#444444', card: '#080808' }
  };

  const currentTheme = themes[theme];
  const fontStyle = font === 'monospace' ? { fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' } : {};


  useEffect(() => {
    async function init() {
      try {
        console.log("PWA: Initializing FlowDrop Core...");
        const p = await MeshStorage.getMyProfile();
        setProfile(p);

        const granted = await MeshManager.requestPermissions();
        setHasPermissions(granted);

        if (granted || Platform.OS === 'web') {
          MeshManager.onDeviceFound = (foundDevices: any[]) => {
            const mappedPeers: Peer[] = foundDevices.map(d => ({
              id: d.id,
              name: d.name || 'Unknown Node'
            }));
            setPeers(mappedPeers);
          };
          // On Web, startScanning handles the simulation if Bluetooth fails
          MeshManager.startScanning();
          NostrManager.init();
        }

        loadRecentChats();
        loadStories();
      } catch (err) {
        console.error("Initialization error:", err);
        setProfile({ id: 'demo-user', name: 'Web User' });
      }
    }
    init();

    MeshRouter.setOnMessageReceived((msg) => {
        if (msg.type === 'status') {
            setStories(prev => [msg, ...prev.filter(s => s.senderId !== msg.senderId)]);
        } else {
            loadRecentChats();
        }
    });

    const interval = setInterval(() => {
        MeshRouter.flushQueue();
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  const loadRecentChats = async () => {
    const contacts = await MeshStorage.getContacts();
    setRecentChats(contacts);
  };

  const loadStories = async () => {
      const msgs = await MeshStorage.getMessages('mesh');
      const latestStories = msgs
          .filter(m => m.type === 'status')
          .reverse();
      setStories(latestStories);
  };

  if (!profile) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={{color: '#00A884'}}>Loading FlowDrop...</Text>
      </View>
    );
  }

  if (isSettingsOpen) {
    return <SettingsView 
      theme={theme} 
      setTheme={setTheme} 
      font={font} 
      setFont={setFont} 
      onBack={() => setIsSettingsOpen(false)} 
    />;
  }

  if (selectedChat) {
    return (
      <ChatView 
        contact={selectedChat} 
        onBack={() => {
          setSelectedChat(null);
          loadRecentChats();
        }} 
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={currentTheme.card} />
      
      {/* Header */}
      <View style={[styles.header, {backgroundColor: currentTheme.card}]}>
        <View>
          <Text style={[styles.logo, {color: currentTheme.accent}]}>FlowDrop</Text>
          <View style={{flexDirection: 'row', alignItems: 'center', marginTop: 3}}>
            <View style={[styles.pulseCircle, {backgroundColor: hasPermissions ? currentTheme.accent : '#E94242'}]} />
            <Text style={{color: currentTheme.sub, fontSize: 11, fontWeight: '700', letterSpacing: 0.5}}>
                {hasPermissions ? 'SECURE MESH ACTIVE' : 'RADIO ACCESS REQUIRED'}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.settingsBtn}
          onPress={() => setIsSettingsOpen(true)}
        >
          <Settings color={currentTheme.sub} size={24} />
        </TouchableOpacity>
      </View>

      {/* Main Area */}
      {activeTab === 'chats' && (
        <View style={{flex: 1}}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Chats</Text>
          </View>
          <FlatList 
            data={recentChats}
            keyExtractor={item => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity 
                style={[styles.chatItem, {borderBottomColor: currentTheme.bg}]}
                onPress={() => setSelectedChat(item)}
              >
                <View style={[styles.avatar, {backgroundColor: currentTheme.accent}]}>
                    <Text style={styles.avatarText}>{(item.name || '??').substring(0,2).toUpperCase()}</Text>
                </View>
                <View style={styles.chatInfo}>
                    <Text style={[styles.chatName, {color: currentTheme.text}]}>{item.name}</Text>
                    <Text style={[styles.lastMsg, {color: currentTheme.sub}]}>Ready to Chat</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={[styles.emptyText, {color: currentTheme.text}]}>No one nearby right now.</Text>
                <Text style={[styles.emptySub, {color: currentTheme.sub}]}>Try moving to a more crowded area!</Text>
              </View>
            }
          />
        </View>
      )}

        {/* Status Tab (Stories) */}
        {activeTab === 'status' && (
            <ScrollView style={{flex: 1, padding: 15}}>
                <Text style={styles.sectionTitle}>MY STATUS</Text>
                <TouchableOpacity 
                    style={styles.statusTile}
                    onPress={async () => {
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ImagePicker.MediaTypeOptions.Images,
                            allowsEditing: true,
                            base64: true,
                            quality: 0.2, // Tiny as status is shared wide
                        });
                        if (!result.canceled && result.assets[0].base64) {
                            const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
                            await MeshRouter.createStatus('Check out my Ripple!', b64);
                            Alert.alert('Ripple Sent!', 'Your status is now ripples through the local mesh.');
                        }
                    }}
                >
                    <View style={[styles.avatar, {backgroundColor: '#2A3942'}]}>
                        <MessageCircle color="#00A884" size={20} />
                    </View>
                    <View style={{marginLeft: 15}}>
                        <Text style={styles.contactName}>My Mesh Ripple</Text>
                        <Text style={styles.lastMsg}>Tap to update status</Text>
                    </View>
                </TouchableOpacity>

                <Text style={[styles.sectionTitle, {marginTop: 20, color: currentTheme.accent}]}>LATEST RIPPLES</Text>
                {stories.length > 0 ? (
                    stories.map(story => (
                        <TouchableOpacity key={story.id} style={styles.statusTile}>
                            <View style={[styles.avatar, {backgroundColor: currentTheme.bg, borderWidth: 2, borderColor: currentTheme.accent, width: 54, height: 54, borderRadius: 27}]}>
                                {story.image ? (
                                    <Image source={{uri: story.image}} style={{width: 50, height: 50, borderRadius: 25}} />
                                ) : (
                                    <Text style={[styles.avatarText, {color: currentTheme.accent}]}>{story.senderName.substring(0,1)}</Text>
                                )}
                            </View>
                            <View style={{marginLeft: 15, flex: 1}}>
                                <Text style={[styles.contactName, {color: currentTheme.text}]}>{story.senderName}</Text>
                                <Text style={[styles.lastMsg, {color: currentTheme.sub}]}>Posted {new Date(story.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</Text>
                            </View>
                        </TouchableOpacity>
                    ))
                ) : (
                    <View style={styles.emptyState}>
                        <Radio color={currentTheme.sub} size={48} />
                        <Text style={[styles.emptyText, {color: currentTheme.text}]}>No stories shared nearby yet.</Text>
                        <Text style={[styles.emptySub, {color: currentTheme.sub}]}>Be the first to share a Ripple!</Text>
                    </View>
                )}
            </ScrollView>
        )}

        {/* Network Hub Tab */}
      {activeTab === 'network' && (
        <NetworkMap 
          peers={peers} 
          onPeerSelect={(peer) => {
            setSelectedChat({ id: peer.id, name: peer.name || 'Unknown' });
            setActiveTab('chats');
          }}
        />
      )}

      {activeTab === 'profile' && (
        <View style={styles.centered}>
          <View style={[styles.avatar, {width: 100, height: 100, borderRadius: 50, marginBottom: 20}]}>
            <Text style={{fontSize: 40, color: '#fff'}}>{(profile.name || '??').substring(0,2).toUpperCase()}</Text>
          </View>
          <Text style={styles.chatName}>{profile.name}</Text>
          <Text style={styles.emptySub}>ID: {profile.id}</Text>
          
          <View style={{marginTop: 30, width: '80%'}}>
            <TouchableOpacity 
                style={[styles.actionItem, {backgroundColor: '#00A884', borderRadius: 12, marginTop: 10, justifyContent: 'center'}]}
                onPress={() => {
                    const manager = MeshManager; 
                    if ('scanBluetooth' in manager) {
                        (manager as any).scanBluetooth();
                    }
                }}
            >
                <Text style={{color: '#fff', fontWeight: 'bold'}}>LINK VIA BLUETOOTH (PWA)</Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.emptySub, {marginTop: 40}]}>Made by Primers Corporation</Text>
          <Text style={[styles.emptySub, {marginTop: 5}]}>FlowDrop v1.2.0 (Diamond Mesh)</Text>
        </View>
      )}

      {/* Tab Bar */}
         <View style={[styles.tabBar, {backgroundColor: currentTheme.card, borderTopColor: currentTheme.bg}]}>
        <TouchableOpacity onPress={() => setActiveTab('chats')} style={styles.tab}>
          <MessageSquare color={activeTab === 'chats' ? currentTheme.accent : currentTheme.sub} size={24} />
          <Text style={[styles.tabLabel, activeTab === 'chats' ? {color: currentTheme.accent} : {color: currentTheme.sub}]}>Chats</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('status')} style={styles.tab}>
          <CircleDashed color={activeTab === 'status' ? currentTheme.accent : currentTheme.sub} size={24} />
          <Text style={[styles.tabLabel, activeTab === 'status' ? {color: currentTheme.accent} : {color: currentTheme.sub}]}>Status</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('network')} style={styles.tab}>
          <Share2 color={activeTab === 'network' ? currentTheme.accent : currentTheme.sub} size={24} />
          <Text style={[styles.tabLabel, activeTab === 'network' ? {color: currentTheme.accent} : {color: currentTheme.sub}]}>Network</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('profile')} style={styles.tab}>
          <Users color={activeTab === 'profile' ? currentTheme.accent : currentTheme.sub} />
           <Text style={[styles.tabLabel, activeTab === 'profile' ? {color: currentTheme.accent} : {color: currentTheme.sub}]}>Profile</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B141A' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pulseCircle: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: 6,
      shadowColor: '#00A884',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 1,
      shadowRadius: 4,
  },
  header: { 
    height: 60, 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    backgroundColor: '#111B21' 
  },
  logo: { color: '#00A884', fontSize: 24, fontWeight: 'bold' },
  settingsBtn: { padding: 5 },
  sectionHeader: { padding: 15 },
  sectionTitle: { color: '#8696A0', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  chatItem: { 
    flexDirection: 'row', 
    padding: 15, 
    borderBottomWidth: 0.5, 
    borderBottomColor: '#202C33',
    alignItems: 'center'
  },
  avatar: { 
    width: 48, 
    height: 48, 
    borderRadius: 24, 
    backgroundColor: '#00A884', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  chatInfo: { marginLeft: 15, flex: 1 },
  chatName: { color: '#E9EDEF', fontSize: 16, fontWeight: 'bold' },
  lastMsg: { color: '#8696A0', fontSize: 14, marginTop: 2 },
  tabBar: { 
    height: 70, 
    flexDirection: 'row', 
    backgroundColor: '#202C33', 
    borderTopWidth: 0.5, 
    borderTopColor: '#303C44',
    paddingBottom: Platform.OS === 'ios' ? 20 : 0
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  tabLabel: { color: '#8696A0', fontSize: 12, marginTop: 4 },
  activeTabLabel: { color: '#00A884' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#E9EDEF', fontSize: 16, marginTop: 15, textAlign: 'center' },
  emptySub: { color: '#8696A0', fontSize: 14, textAlign: 'center', marginTop: 8 },
  statusTile: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 10,
  },
  contactName: { color: '#E9EDEF', fontSize: 16, fontWeight: 'bold' },
  actionItem: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 15,
  },
});
