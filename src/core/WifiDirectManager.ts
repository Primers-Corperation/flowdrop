import { 
    initialize, 
    // @ts-ignore
    connect,
    // @ts-ignore
    sendFile 
} from 'react-native-wifi-p2p';

// This manager handles high-bandwidth file transfers.
// Wi-Fi Direct is noisy and battery-hungry, so we only 
// enable it when a file transfer is explicitly requested.

class WifiDirectManager {
    private isInitialized: boolean;

    constructor() {
        this.isInitialized = false;
    }

    async init(): Promise<void> {
        try {
            await initialize();
            this.isInitialized = true;
            console.log("Wi-Fi Direct Initialized");
        } catch (e) {
            console.error("Wi-Code Direct Init Failed: ", e);
        }
    }

    async transferFile(deviceAddress: string, filePath: string): Promise<void> {
        if (!this.isInitialized) await this.init();

        console.log(`Negotiating Wi-Fi Direct connection to ${deviceAddress}...`);
        
        try {
            await connect(deviceAddress);
            console.log("Connected. Sending file...");
            await sendFile(filePath);
            console.log("File sent successfully.");
        } catch (e) {
            console.error("File transfer failed: ", e);
        }
    }
}

export default new WifiDirectManager();
