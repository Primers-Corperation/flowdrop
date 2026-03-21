import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, FlatList, 
    TextInput, KeyboardAvoidingView, Platform, Image 
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Send, Paperclip, ShieldCheck, ShieldAlert, Lock, CheckCheck } from 'lucide-react-native';
import MeshRouter from '../core/MeshRouter';
import MeshStorage from '../core/MeshStorage';
import { Contact, Message } from '../types';

interface ChatViewProps {
    contact: Contact & { publicKey?: string };
    onBack: () => void;
}

export default function ChatView({ contact, onBack }: ChatViewProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [myUserId, setMyUserId] = useState<string>('');

    useEffect(() => {
        async function init() {
            const profile = await MeshStorage.getMyProfile();
            setMyUserId(profile.id);
            loadMessages();
        }
        init();
        
        MeshRouter.setOnMessageReceived(() => {
            loadMessages();
        });

        return () => {
            MeshRouter.setOnMessageReceived(() => {});
        };
    }, [contact]);

    const loadMessages = async () => {
        const allMsgs = await MeshStorage.getMessages();
        const filtered = allMsgs.filter(m => 
            m.senderId === contact.id || m.recipientId === contact.id
        );
        setMessages(filtered.sort((a,b) => a.timestamp - b.timestamp));
    };

    const handleSend = async () => {
        if (!inputText.trim()) return;
        await MeshRouter.createMessage(contact.id, inputText, contact.publicKey);
        setInputText('');
        loadMessages();
    };

    const handlePickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            base64: true,
            quality: 0.3, // Compressed for mesh transfer
        });

        if (!result.canceled && result.assets[0].base64) {
            const base64Img = `data:image/jpeg;base64,${result.assets[0].base64}`;
            await MeshRouter.createMessage(contact.id, '[Photo]', contact.publicKey, base64Img);
            loadMessages();
        }
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={24} />
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{contact.name.substring(0,1).toUpperCase()}</Text>
                    </View>
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.contactName}>{contact.name}</Text>
                    <View style={styles.statusRow}>
                        <Text style={styles.status}>Direct Mesh-Link</Text>
                        {contact.publicKey ? (
                            <ShieldCheck color="#00A884" size={12} style={{marginLeft: 5}} />
                        ) : (
                            <ShieldAlert color="#8696A0" size={12} style={{marginLeft: 5}} />
                        )}
                    </View>
                </View>
            </View>

            {/* Premium Security Header */}
            <View style={styles.securityBanner}>
                <Lock size={12} color="#8696A0" />
                <Text style={styles.securityText}>MESSAGES ARE END-TO-END ENCRYPTED</Text>
            </View>

            {/* Messages */}
            <FlatList
                data={messages}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                    const isMe = item.senderId === myUserId;
                    return (
                        <View style={[styles.msgWrapper, isMe ? styles.mine : styles.other]}>
                            <View style={[styles.msgBubble, isMe ? styles.bubbleMine : styles.bubbleOther]}>
                                {item.image && (
                                    <Image source={{uri: item.image}} style={styles.bubbleImage} />
                                )}
                                <Text style={styles.msgText}>{item.text}</Text>
                                <View style={styles.msgFooter}>
                                    <Text style={styles.msgTime}>
                                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                    {isMe && (
                                        <CheckCheck size={14} color={item.delivered ? '#53bdeb' : '#8696A0'} style={{marginLeft: 4}} />
                                    )}
                                </View>
                            </View>
                        </View>
                    );
                }}
            />

            {/* Input Area */}
            <View style={styles.inputArea}>
                <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage}>
                    <Paperclip color="#8696A0" size={24} />
                </TouchableOpacity>
                <TextInput 
                    style={styles.input}
                    placeholder="Message..."
                    placeholderTextColor="#8696A0"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                />
                <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
                    <Send color="#fff" size={20} />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0B141A' },
    header: {
        height: 60,
        backgroundColor: '#202C33',
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        elevation: 4,
    },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
        width: 38,
        height: 38,
        borderRadius: 19,
        backgroundColor: '#6b7c85',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
    headerInfo: { marginLeft: 12 },
    contactName: { color: '#E9EDEF', fontSize: 16, fontWeight: 'bold' },
    actionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 15,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    status: { color: '#8696A0', fontSize: 11 },
    securityBanner: {
        backgroundColor: '#182229',
        paddingVertical: 8,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        borderBottomWidth: 1,
        borderBottomColor: '#222d34',
    },
    securityText: {
        color: '#8696A0',
        fontSize: 10,
        fontWeight: '600',
        marginLeft: 6,
        letterSpacing: 0.5,
    },
    listContent: { padding: 15, paddingBottom: 30 },
    msgWrapper: { marginBottom: 12, flexDirection: 'row' },
    mine: { justifyContent: 'flex-end' },
    other: { justifyContent: 'flex-start' },
    msgBubble: {
        maxWidth: '85%',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 12,
    },
    bubbleMine: { 
        backgroundColor: '#005C4B',
        borderTopRightRadius: 2,
    },
    bubbleOther: { 
        backgroundColor: '#202C33',
        borderTopLeftRadius: 2,
    },
    msgText: { color: '#E9EDEF', fontSize: 15, lineHeight: 20 },
    bubbleImage: {
      width: 250,
      height: 180,
      borderRadius: 8,
      marginBottom: 8,
      backgroundColor: '#111B21'
    },
    msgFooter: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-end',
        marginTop: 4,
    },
    msgTime: {
        color: '#8696A0',
        fontSize: 10,
    },
    inputArea: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 8,
        backgroundColor: '#202C33',
    },
    input: {
        flex: 1,
        backgroundColor: '#2A3942',
        borderRadius: 24,
        paddingHorizontal: 18,
        paddingVertical: 10,
        color: '#E9EDEF',
        maxHeight: 120,
        marginHorizontal: 8,
        fontSize: 15,
    },
    sendBtn: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: '#00A884',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachBtn: { padding: 5 }
});
