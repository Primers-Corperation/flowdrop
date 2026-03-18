import React, { useState, useEffect } from 'react';
import { 
    View, Text, StyleSheet, TouchableOpacity, FlatList, 
    TextInput, KeyboardAvoidingView, Platform 
} from 'react-native';
import { ArrowLeft, Send, Paperclip, ShieldCheck, ShieldAlert } from 'lucide-react-native';
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

    useEffect(() => {
        loadMessages();
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
        
        // Pass the contact's public key for E2EE if we have it
        await MeshRouter.createMessage(contact.id, inputText, contact.publicKey);
        setInputText('');
        loadMessages();
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
        >
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={onBack} style={styles.backBtn}>
                    <ArrowLeft color="#fff" size={24} />
                    <View style={styles.avatar}>
                        <Text style={styles.avatarText}>{contact.name.substring(0,2).toUpperCase()}</Text>
                    </View>
                </TouchableOpacity>
                <View style={styles.headerInfo}>
                    <Text style={styles.name}>{contact.name}</Text>
                    <View style={styles.statusRow}>
                        <Text style={styles.status}>Mesh Active</Text>
                        {contact.publicKey ? (
                            <ShieldCheck color="#00A884" size={12} style={{marginLeft: 5}} />
                        ) : (
                            <ShieldAlert color="#8696A0" size={12} style={{marginLeft: 5}} />
                        )}
                    </View>
                </View>
            </View>

            {/* Messages */}
            <FlatList 
                data={messages}
                keyExtractor={item => item.id}
                renderItem={({ item }) => {
                    const isMine = item.senderId !== contact.id;
                    return (
                        <View style={[styles.msgWrapper, isMine ? styles.mine : styles.other]}>
                            <View style={[styles.msgBubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                                <Text style={styles.msgText}>{item.text}</Text>
                                <View style={styles.msgFooter}>
                                    {item.isEncrypted && (
                                        <ShieldCheck color="#8696A0" size={10} style={{marginRight: 4}} />
                                    )}
                                    <Text style={styles.msgTime}>
                                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    );
                }}
                contentContainerStyle={styles.listContent}
            />

            {/* Input */}
            <View style={styles.inputArea}>
                <TouchableOpacity style={styles.attachBtn}>
                    <Paperclip color="#8696A0" size={24} />
                </TouchableOpacity>
                <TextInput 
                    style={styles.input}
                    placeholder="Type an offline message..."
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
    },
    backBtn: { flexDirection: 'row', alignItems: 'center' },
    avatar: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: '#00A884',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 8,
    },
    avatarText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    headerInfo: { marginLeft: 12 },
    name: { color: '#E9EDEF', fontSize: 16, fontWeight: 'bold' },
    statusRow: { flexDirection: 'row', alignItems: 'center' },
    status: { color: '#00A884', fontSize: 11 },
    listContent: { padding: 15 },
    msgWrapper: { marginBottom: 10, flexDirection: 'row' },
    mine: { justifyContent: 'flex-end' },
    other: { justifyContent: 'flex-start' },
    msgBubble: {
        maxWidth: '80%',
        padding: 10,
        borderRadius: 10,
    },
    bubbleMine: { backgroundColor: '#005C4B' },
    bubbleOther: { backgroundColor: '#202C33' },
    msgText: { color: '#E9EDEF', fontSize: 15 },
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
        padding: 10,
        backgroundColor: '#202C33',
    },
    input: {
        flex: 1,
        backgroundColor: '#2A3942',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 8,
        color: '#E9EDEF',
        maxHeight: 100,
        marginHorizontal: 10,
    },
    sendBtn: {
        width: 45,
        height: 45,
        borderRadius: 22.5,
        backgroundColor: '#00A884',
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachBtn: { padding: 5 }
});
