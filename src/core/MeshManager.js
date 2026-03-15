import { BleManager } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';

const MESH_SERVICE_UUID = 'A1B2C3D4-E5F6-7890-1234-567890ABCDEF';
const manager = new BleManager();

class MeshManager {
  constructor() {
    this.devices = new Map();
    this.isScanning = false;
    this.onDeviceFound = null; // Callback for UI
  }

  async requestPermissions() {
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

  startScanning() {
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

        if (device && !this.devices.has(device.id)) {
            console.log(`Found Peer: ${device.name || 'Unknown'} (${device.id})`);
            this.devices.set(device.id, device);

            // Notify UI
            if (this.onDeviceFound) {
                this.onDeviceFound(Array.from(this.devices.values()));
            }

            // In a real mesh, we would attempt to connect here:
            // this.connectToDevice(device);
        }
      }
    );
  }

  async connectToDevice(device) {
    try {
      const connectedDevice = await manager.connectToDevice(device.id);
      await connectedDevice.discoverAllServicesAndCharacteristics();
      console.log(`Successfully connected to ${device.id}`);
      
      // Start listening for messages from this characteristics
      // ...
    } catch (e) {
        console.error(`Failed to connect to ${device.id}: `, e);
        this.devices.delete(device.id);
    }
  }

  stopScanning() {
    manager.stopDeviceScan();
    this.isScanning = false;
  }
}

export default new MeshManager();
