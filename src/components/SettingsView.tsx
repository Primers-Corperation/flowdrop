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
    theme: 'diamond' | 'solaris' | 'neon' | 'ocean' | 'midnight';
    setTheme: (t: any) => void;
    font: 'system' | 'inter' | 'monospace';
    setFont: (f: any) => void;
    onBack: () => void;
}

export default function SettingsView({ theme, setTheme, font, setFont, onBack }: SettingsViewProps) {
    const [profile, setProfile] = useState<Profile | null>(null);
    const [name, setName] = useState('');
    const [stealthMode, setStealthMode] = useState(false);
    const [relayEnabled, setRelayEnabled] = useState(true);

    const themes = {
        diamond: { bg: '#0B141A', accent: '#00A884', text: '#E9EDEF', sub: '#8696A0', card: '#111B21' },
        solaris: { bg: '#F8F9FA', accent: '#0088CC', text: '#1C1F23', sub: '#667781', card: '#FFFFFF' },
        neon: { bg: '#0A0A0F', accent: '#FF00FB', text: '#E0E0FF', sub: '#7A7A9E', card: '#14141F' },
        ocean: { bg: '#0D1117', accent: '#2F81F7', text: '#C9D1D9', sub: '#8B949E', card: '#161B22' },
        midnight: { bg: '#000000', accent: '#39FF14', text: '#FFFFFF', sub: '#444444', card: '#080808' }
    };
    const c = themes[theme];


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

    const SettingItem = ({ icon: Icon, title, subtitle, value, onToggle, c }: any) => (
        <View style={[styles.item, {borderBottomColor: c.bg}]}>
            <View style={styles.itemIcon}>
                <Icon color={c.sub} size={22} />
            </View>
            <View style={styles.itemContent}>
                <Text style={[styles.itemTitle, {color: c.text}]}>{title}</Text>
                {subtitle && <Text style={[styles.itemSubtitle, {color: c.sub}]}>{subtitle}</Text>}
            </View>
            {onToggle !== undefined ? (
                <Switch 
                    value={value} 
                    onValueChange={onToggle}
                    trackColor={{ false: '#334049', true: c.accent }}
                    thumbColor={value ? '#fff' : '#8696A0'}
                />
            ) : null}
        </View>
    );

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={[styles.header, {backgroundColor: c.card}]}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <ArrowLeft color={c.accent} size={24} />
                    <Text style={[styles.headerTitle, {color: c.text}]}>Settings</Text>
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

                {/* Visual Appearance */}
                <Text style={[styles.sectionTitle, {color: c.accent}]}>DISPLAY & THEMES</Text>
                <View style={[styles.section, {backgroundColor: c.card}]}>
                    <View style={{padding: 15}}>
                        <Text style={[styles.itemTitle, {color: c.text, marginBottom: 10}]}>Choose Theme</Text>
                        <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                            {Object.keys(themes).map((t: any) => (
                                <TouchableOpacity 
                                    key={t}
                                    onPress={() => setTheme(t)}
                                    style={{
                                        width: 45, height: 45, borderRadius: 22,
                                        backgroundColor: (themes as any)[t].bg,
                                        borderWidth: theme === t ? 3 : 0,
                                        borderColor: c.accent,
                                        justifyContent: 'center', alignItems: 'center'
                                    }}
                                >
                                    <View style={{width: 20, height: 20, borderRadius: 10, backgroundColor: (themes as any)[t].accent}} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                    <View style={{padding: 15, borderTopWidth: 0.5, borderTopColor: c.bg}}>
                        <Text style={[styles.itemTitle, {color: c.text, marginBottom: 10}]}>App Font</Text>
                        <View style={{flexDirection: 'row'}}>
                            {['system', 'monospace'].map((f: any) => (
                                <TouchableOpacity 
                                    key={f}
                                    onPress={() => setFont(f)}
                                    style={{
                                        paddingHorizontal: 15, paddingVertical: 8, 
                                        borderRadius: 20, marginRight: 10,
                                        backgroundColor: font === f ? c.accent : c.bg
                                    }}
                                >
                                    <Text style={{color: font === f ? '#fff' : c.text, textTransform: 'capitalize'}}>{f}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>

                {/* Mesh Performance Section */}
                <Text style={[styles.sectionTitle, {color: c.accent}]}>CONNECTIVITY</Text>
                <View style={[styles.section, {backgroundColor: c.card}]}>
                    <SettingItem 
                        icon={Radio} 
                        title="Stealth Mode" 
                        subtitle="Only show up to people you know."
                        value={stealthMode}
                        onToggle={setStealthMode}
                        c={c}
                    />
                    <SettingItem 
                        icon={Cpu} 
                        title="Mesh Booster" 
                        subtitle="Help strengthen the network."
                        value={relayEnabled}
                        onToggle={setRelayEnabled}
                        c={c}
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
                        c={c}
                    />
                    <TouchableOpacity style={styles.actionItem} onPress={() => MeshStorage.pruneHistory()}>
                        <Info color="#00A884" size={22} />
                        <View style={{marginLeft: 15}}>
                            <Text style={[styles.itemTitle, {color: '#00A884'}]}>Clean Cache Now</Text>
                        </View>
                    </TouchableOpacity>
                </View>

                {/* Footer info */}
                <View style={[styles.footer, {backgroundColor: c.bg}]}>
                    <Text style={[styles.footerText, {color: c.sub}]}>FlowDrop v1.2.0 (Diamond Mesh)</Text>
                    <Text style={[styles.footerText, {color: c.accent}]}>Made by Primers Corporation</Text>
                    <Text style={[styles.footerText, {color: c.sub}]}>Self-Sovereign Messaging</Text>
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
