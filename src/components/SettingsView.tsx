import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, ScrollView, 
    Switch, TextInput, Alert, Platform 
} from 'react-native';
import { 
    Settings, User, Shield, HardDrive, Info, 
    ArrowLeft, LogOut, Cpu, Radio, Hash 
} from 'lucide-react-native';
import MeshStorage from '../core/MeshStorage';
import { Profile } from '../types';

interface SettingsViewProps {
    onBack: () => void;
}

export default function SettingsView({ onBack }: SettingsViewProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [name, setName] = useState('');
    const [stealthMode, setStealthMode] = useState(false);
    const [relayEnabled, setRelayEnabled] = useState(true);

    useEffect(() => {
        loadProfile();
    }, []);

    const loadProfile = async () => {
        const p = await MeshStorage.getMyProfile();
        setProfile(p);
        setName(p.name);
    };

    const handleSaveProfile = async () => {
        if (!name.trim()) return;
        await MeshStorage.updateMyProfile(name);
        Alert.alert('Profile Updated', 'Your changes have been broadcasted to the mesh.');
    };

    const SettingItem = ({ icon: Icon, title, subtitle, value, onToggle }: any) => (
        <View style={styles.item}>
            <View style={styles.itemIcon}>
                <Icon color="#8696A0" size={22} />
            </View>
            <View style={styles.itemContent}>
                <Text style={styles.itemTitle}>{title}</Text>
                {subtitle && <Text style={styles.itemSubtitle}>{subtitle}</Text>}
            </View>
            {onToggle !== undefined ? (
                <Switch 
                    value={value} 
                    onValueChange={onToggle}
                    trackColor={{ false: '#334049', true: '#00A884' }}
                    thumbColor={value ? '#fff' : '#8696A0'}
                />
            ) : null}
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={24} />
                    <Text style={styles.headerTitle}>Settings</Text>
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content}>
                {/* Profile Section */}
                <View style={styles.section}>
                    <View style={styles.profileBox}>
                        <View style={styles.avatarBig}>
                            <Text style={styles.avatarTextBig}>{name.substring(0,1).toUpperCase() || '?'}</Text>
                        </View>
                        <TextInput 
                            style={styles.nameInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Display Name"
                            placeholderTextColor="#8696A0"
                            onBlur={handleSaveProfile}
                        />
                        <Text style={styles.idText}>{profile?.id}</Text>
                    </View>
                </View>

                {/* Mesh Performance Section */}
                <Text style={styles.sectionTitle}>MESH NETWORK</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon={Radio} 
                        title="Stealth Mode" 
                        subtitle="Remain invisible to non-contacts."
                        value={stealthMode}
                        onToggle={setStealthMode}
                    />
                    <SettingItem 
                        icon={Cpu} 
                        title="Active Relaying" 
                        subtitle="Help route messages for others."
                        value={relayEnabled}
                        onToggle={setRelayEnabled}
                    />
                </View>

                {/* Identity & Export */}
                <Text style={styles.sectionTitle}>SECURITY & PRIVACY</Text>
                <View style={styles.section}>
                    <TouchableOpacity style={styles.actionItem}>
                        <Shield color="#8696A0" size={22} />
                        <View style={{marginLeft: 15}}>
                            <Text style={styles.itemTitle}>Export Identity Keys</Text>
                            <Text style={styles.itemSubtitle}>Backup your unique mesh signature.</Text>
                        </View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionItem}>
                        <Hash color="#8696A0" size={22} />
                        <View style={{marginLeft: 15}}>
                            <Text style={styles.itemTitle}>Encryption Protocols</Text>
                            <Text style={styles.itemSubtitle}>Using FD-v1 (Xor-Envelope)</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Storage Diagnostics */}
                <Text style={styles.sectionTitle}>DATA & STORAGE</Text>
                <View style={styles.section}>
                    <SettingItem 
                        icon={HardDrive} 
                        title="Aggressive Pruning" 
                        subtitle="Auto-cleanup relay traffic weekly."
                        value={true}
                        onToggle={() => {}}
                    />
                    <TouchableOpacity style={styles.actionItem} onPress={() => MeshStorage.pruneHistory()}>
                        <Info color="#00A884" size={22} />
                        <View style={{marginLeft: 15}}>
                            <Text style={[styles.itemTitle, {color: '#00A884'}]}>Clean Cache Now</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Footer info */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>FlowDrop v1.2.0 (Diamond Mesh)</Text>
                    <Text style={styles.footerText}>Made by Primers Corporation</Text>
                    <Text style={styles.footerText}>Self-Sovereign Messaging</Text>
                </View>
                <View style={{height: 50}} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B141A' },
    header: {
        height: 65,
        backgroundColor: '#202C33',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        elevation: 4,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 15 },
    content: { flex: 1 },
    section: { backgroundColor: '#111B21', marginBottom: 20 },
    sectionTitle: { color: '#00A884', fontSize: 13, fontWeight: '700', marginLeft: 15, marginBottom: 8, marginTop: 10 },
    profileBox: { alignItems: 'center', paddingVertical: 25, backgroundColor: '#111B21' },
    avatarBig: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#00A884', justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    avatarTextBig: { color: '#fff', fontSize: 32, fontWeight: 'bold' },
    nameInput: { color: '#E9EDEF', fontSize: 20, fontWeight: 'bold', borderBottomWidth: 1, borderBottomColor: '#3B4A54', minWidth: 200, textAlign: 'center', paddingBottom: 5 },
    idText: { color: '#8696A0', fontSize: 11, marginTop: 10, letterSpacing: 0.5 },
    item: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#222d34' },
    itemIcon: { width: 30, alignItems: 'center' },
    itemContent: { flex: 1, marginLeft: 15 },
    itemTitle: { color: '#E9EDEF', fontSize: 16 },
    itemSubtitle: { color: '#8696A0', fontSize: 13, marginTop: 2 },
    actionItem: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 0.5, borderBottomColor: '#222d34' },
    footer: { padding: 40, alignItems: 'center' },
    footerText: { color: '#3B4A54', fontSize: 12, marginBottom: 5, letterSpacing: 1 }
});
