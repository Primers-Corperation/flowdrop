import { BleManager, Device } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

const MESH_SERVICE_UUID = 'A1B2C3D4-E5F6-7890-1234-567890ABCDEF';
const manager = new BleManager();

export interface Peer {
  id: string;
  name?: string | null;
}

class MeshManager {
  private _devices: Map<string, Device>;
  private isScanning: boolean;
  public onDeviceFound: ((peers: Device[]) => void) | null;

  constructor() {
    this._devices = new Map();
    this.isScanning = false;
    this.onDeviceFound = null; // Callback for UI
  }

  public get devices(): Device[] {
    return Array.from(this._devices.values());
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ]);
      return Object.values(granted).every(status => status === PermissionsAndroid.RESULTS.GRANTED);
    }
    return true; // iOS handles automatically via plist
  }

  startScanning(): void {
    if (this.isScanning) return;
    this.isScanning = true;

    manager.startDeviceScan(
      [MESH_SERVICE_UUID], 
      { allowDuplicates: false }, 
      (error, device) => {
        if (error) {
          console.warn('BLE Scan Error:', error);
          this.isScanning = false;
          return;
        }

        if (device && !this._devices.has(device.id)) {
            console.log(`Found Peer: ${device.name || 'Unknown'} (${device.id})`);
            this._devices.set(device.id, device);

            // Notify UI
            if (this.onDeviceFound) {
                this.onDeviceFound(this.devices);
            }

            // In a real mesh, we would attempt to connect here:
            // this.connectToDevice(device);
        }
      }
    );
  }

  async connectToDevice(device: Device): Promise<void> {
    try {
      const connectedDevice = await manager.connectToDevice(device.id);
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log(`Successfully connected to ${device.id}`);
      
      // Start listening for messages from this characteristics
      // ...
    } catch (e) {
        console.error(`Failed to connect to ${device.id}: `, e);
        this._devices.delete(device.id);
    }
  }

  stopScanning(): void {
    manager.stopDeviceScan();
    this.isScanning = false;
  }
}

export default new MeshManager();
