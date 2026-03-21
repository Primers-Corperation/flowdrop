import { io, Socket } from 'socket.io-client';
import MeshStorage from './MeshStorage';

export interface Device {
    id: string;
    name: string | null;
}

const MESH_SERVICE_UUID = 'a1b2c3d4-e5f6-7890-1234-567890abcdef'.toLowerCase();

class MeshManager {
    private _devices: Map<string, Device>;
    private isScanning: boolean;
    public onDeviceFound: ((peers: Device[]) => void) | null;
    private socket: Socket | null = null;

    constructor() {
        this._devices = new Map();
        this.isScanning = false;
        this.onDeviceFound = null;
    }

    public get devices(): Device[] {
        return Array.from(this._devices.values());
    }

    async requestPermissions(): Promise<boolean> {
        // In Web, permissions are handled per-device during the scan selection.
        // We check if Web Bluetooth is even available.
        return !!(navigator as any).bluetooth;
    }

    // NOTE: Web Bluetooth REQUIRES a user gesture to start scanning.
    // This will be called via the UI button.
    async startScanning(): Promise<void> {
        if (this.isScanning) return;
        this.isScanning = true;

        // Connect to the Node server for peer discovery (no user gesture needed)
        this.initSocket();

        // Skip auto Bluetooth scan - it requires a user gesture
        console.log("PWA: Socket discovery initialized. Bluetooth requires user gesture.");
    }

    // Call this from a button press to trigger Bluetooth scanning
    async scanBluetooth(): Promise<void> {
        console.log("Requesting Web Bluetooth device selection...");

        try {
            const bluetooth = (navigator as any).bluetooth;
            if (!bluetooth) {
                console.warn("Web Bluetooth not supported");
                return;
            }

            const device = await bluetooth.requestDevice({
                filters: [{ services: [MESH_SERVICE_UUID] }],
                optionalServices: ['battery_service']
            });

            console.log(`Web Bluetooth: Found ${device.name}`);
            this._devices.set(device.id, { id: device.id, name: device.name });

            if (this.onDeviceFound) {
                this.onDeviceFound(this.devices);
            }

        } catch (e) {
            console.warn("Web Bluetooth Scan Cancelled or Failed: ", e);
        }
    }

    private initSocket() {
        if (this.socket) return;

        // Dynamically find the socket server on port 3000 (same host as current PWA)
        const serverUrl = `${window.location.protocol}//${window.location.hostname}:3000`;
        console.log(`PWA: Connecting to mesh server at ${serverUrl}...`);

        this.socket = io(serverUrl);

        this.socket.on('connect', async () => {
            const profile = await MeshStorage.getMyProfile();
            this.socket?.emit('set profile', { name: profile.name, userId: profile.id });
        });

        this.socket.on('online users', (users: any[]) => {
            users.forEach(u => {
                if (u.userId) {
                    this._devices.set(u.userId, { id: u.userId, name: u.name });
                }
            });
            if (this.onDeviceFound) {
                this.onDeviceFound(this.devices);
            }
        });
    }

    private simulateWebDiscovery() {
        if (this.isScanning) return;
        this.isScanning = true;
        console.log("Simulating local PWA discovery...");

        // Add a mock peer after a delay to show the PWA UI works
        setTimeout(() => {
            const mockDevice = { id: 'web-peer-01', name: 'Browser Node Alpha' };
            this._devices.set(mockDevice.id, mockDevice);
            if (this.onDeviceFound) {
                this.onDeviceFound(this.devices);
            }
        }, 1500);
    }

    stopScanning(): void {
        this.isScanning = false;
    }

    async sendMessage(recipientId: string, message: any): Promise<void> {
        if (this.socket) {
            console.log(`PWA: Sending message to ${recipientId} via server...`);
            // Find the socket ID for this user ID from our local map if needed?
            // No, the server handles routing by persistent userId if we update the server logic!
            // BUT wait, currently the server uses 'to: socketID'.
            // I'll update the server to handle persistent IDs!
            this.socket.emit('private message', { ...message, to: recipientId, isByUserId: true });
        }
    }

    async connectToDevice(device: Device): Promise<void> {
        console.log(`PWA: Attempting connection to ${device.id}...`);
        // Connection over Web Bluetooth or WebRTC would go here.
    }
}

export default new MeshManager();
