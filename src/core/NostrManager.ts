import { SimplePool, finalizeEvent, Event } from 'nostr-tools';
import 'react-native-get-random-values';
import { Buffer } from 'buffer';
declare var global: any;
(global as any).Buffer = Buffer;

import MeshStorage from './MeshStorage';
import { Message } from '../types';

const RELAYS = [
    'wss://relay.damus.io',
    'wss://relay.primal.net',
    'wss://nos.lol',
    'wss://offchain.social'
];

class NostrManager {
    private pool = new SimplePool();
    private profile: any = null;

    async init() {
        this.profile = await MeshStorage.getMyProfile();
        console.log("Nostr initialized with global identity:", this.profile.publicKey);
        this.subscribeToGlobal();
    }

    // Publish a mesh-ripple to the global global relays
    async broadcastStatus(message: Message) {
        if (!this.profile?.privateKey) return;

        const event = finalizeEvent({
            kind: 1, // Standard status event
            created_at: Math.floor(Date.now() / 1000),
            tags: [['t', 'flowdrop_ripple'], ['content_type', 'mesh_status']],
            content: JSON.stringify({
                text: message.text,
                image: message.image,
                sender: message.senderName
            }),
        }, Buffer.from(this.profile.privateKey, 'hex'));

        const pub = this.pool.publish(RELAYS, event);
        console.log("Ripple broadcasted to Global Nostr Mesh.");
    }

    // Direct encrypted bridge could be added here (NIP-04)

    private subscribeToGlobal() {
        if (!this.profile) return;

        // Listen for statuses from the global network
        const sub = this.pool.subscribeMany(
            RELAYS,
            [{
                kinds: [1],
                '#t': ['flowdrop_ripple'],
                since: Math.floor(Date.now() / 1000) - 3600
            }] as any,
            {
                onevent: (event: any) => {
                    try {
                        const data = JSON.parse(event.content);
                        const MeshRouter = require('./MeshRouter').default;
                        
                        // Bridge Nostr event back into our local mesh processing
                        MeshRouter.receiveMessage({
                            id: event.id,
                            senderId: event.pubkey,
                            senderName: data.sender || 'Nostr Peer',
                            recipientId: 'mesh',
                            text: data.text,
                            image: data.image,
                            timestamp: event.created_at * 1000,
                            type: 'status',
                            ttl: 0, // Global messages don't need mesh relay
                            delivered: true
                        }, 'nostr');
                    } catch (e) {
                        console.log("Nostr sync error", e);
                    }
                }
            }
        );
    }
}

export default new NostrManager();
