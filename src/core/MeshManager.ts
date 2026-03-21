import { BleManager, Device, Characteristic } from 'react-native-ble-plx';
import { PermissionsAndroid, Platform } from 'react-native';
import { io, Socket } from 'socket.io-client';
import Peripheral, { Service, Characteristic as PCharacteristic } from 'react-native-peripheral';
import MeshStorage from './MeshStorage';
import { 
  initialize, 
  startDiscoveringPeers, 
  stopDiscoveringPeers, 
  subscribeOnPeersUpdates, 
  connect as wifiConnect
} from 'react-native-wifi-p2p';

const MESH_SERVICE_UUID = 'A1B2C3D4-E5F6-7890-1234-567890ABCDEF';
const CHAT_CHARACTERISTIC_UUID = 'B1B2C3D4-E5F6-7890-1234-567890ABCDEF';

const manager = new BleManager();

class MeshManager {
  private _devices: Map<string, any>;
  private _connectedPeers: Map<string, Device>;
  private isScanning: boolean;
  public onDeviceFound: ((peers: any[]) => void) | null;

  constructor() {
    this._devices = new Map();
    this._connectedPeers = new Map();
    this.isScanning = false;
    this.onDeviceFound = null;

    if (Platform.OS === 'android') {
        initialize().catch(e => console.log('WiFi P2P Error', e));
        subscribeOnPeersUpdates(({ devices }: { devices: any[] }) => {
            devices.forEach(d => {
                const id = d.deviceAddress || d.id;
                if (!this._devices.has(id)) {
                  this._devices.set(id, { id, name: d.deviceName || 'Wi-Fi Peer', type: 'wifi' });
                  // AUTO-LINK WiFi
                  wifiConnect(d.deviceAddress).catch(e => console.log('WiFi Link Error', e));
                }
            });
            if (this.onDeviceFound) this.onDeviceFound(this.devices);
        });
    }
  }

  public get devices(): any[] {
    return Array.from(this._devices.values());
  }

  async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.CAMERA,
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE
      ]);
      return Object.values(granted).every(status => status === PermissionsAndroid.RESULTS.GRANTED);
    }
    return true;
  }

  async startScanning(): Promise<void> {
    if (this.isScanning) return;
    this.isScanning = true;

    // 1. BECOME THE LIGHTHOUSE (Advertise)
    const ch = new PCharacteristic({
        uuid: CHAT_CHARACTERISTIC_UUID,
        properties: ['read', 'write', 'notify'],
        permissions: ['readable', 'writable'],
    });

    const meshService = new Service({
        uuid: MESH_SERVICE_UUID,
        characteristics: [ch],
    });

    Peripheral.addService(meshService).then(() => {
        Peripheral.startAdvertising({
            name: 'FlowDrop-Node',
            serviceUuids: [MESH_SERVICE_UUID],
        });
        console.log("Mesh Lighthouse Active.");
    });

    // 2. SEARCH FOR PEERS (Scan)
    manager.startDeviceScan([MESH_SERVICE_UUID], null, (error, device) => {
        if (device && !this._devices.has(device.id)) {
            console.log(`Found Peer: ${device.id}`);
            this._devices.set(device.id, { id: device.id, name: device.name || 'Mesh Node', type: 'ble' });
            if (this.onDeviceFound) this.onDeviceFound(this.devices);
            this.connectToPeer(device.id);
        }
    });

    // 3. WiFi Search
    if (Platform.OS === 'android') startDiscoveringPeers();
  }

  async connectToPeer(id: string): Promise<void> {
      try {
          const device = await manager.connectToDevice(id);
          await device.discoverAllServicesAndCharacteristics();
          this._connectedPeers.set(id, device);

          const profile = await MeshStorage.getMyProfile();
          const intro = JSON.stringify({ type: 'intro', profile });
          const introB64 = require('base-64').encode(intro);
          await device.writeCharacteristicWithResponseForService(
              MESH_SERVICE_UUID, CHAT_CHARACTERISTIC_UUID, introB64
          );

          // Monitor for incoming data from this peer
          device.monitorCharacteristicForService(MESH_SERVICE_UUID, CHAT_CHARACTERISTIC_UUID, (error, char) => {
              if (char?.value) {
                  try {
                      const payload = require('base-64').decode(char.value);
                      const MeshRouter = require('./MeshRouter').default;
                      MeshRouter.receiveMessage(JSON.parse(payload), id);
                  } catch (e) {
                      console.warn("Incoming Mesh Data Error", e);
                  }
              }
          });

          // SYNC: Push everything we have to this new peer instantly
          const MeshRouter = require('./MeshRouter').default;
          MeshRouter.flushQueue();
      } catch (err) {
          console.warn(`P2P Link Failed for ${id}`);
      }
  }

  public sendMessage(recipientId: string, message: any): void {
      const payload = JSON.stringify(message);
      const dataB64 = require('base-64').encode(payload);

      if (recipientId === 'mesh') {
          // GOSSIP: Send to EVERYONE we are currently connected to
          this._connectedPeers.forEach(async (device, id) => {
              try {
                  await device.writeCharacteristicWithResponseForService(
                      MESH_SERVICE_UUID, CHAT_CHARACTERISTIC_UUID, dataB64
                  );
              } catch (e) { console.log(`Gossip fail for ${id}`); }
          });
      } else {
          // Direct Send
          const device = this._connectedPeers.get(recipientId);
          if (device) {
              device.writeCharacteristicWithResponseForService(
                  MESH_SERVICE_UUID, CHAT_CHARACTERISTIC_UUID, dataB64
              ).catch(e => console.log('Direct Send Fail', e));
          }
      }
  }

  async stopScanning(): Promise<void> {
    manager.stopDeviceScan();
    Peripheral.stopAdvertising();
    if (Platform.OS === 'android') stopDiscoveringPeers();
    this.isScanning = false;
  }
}

export default new MeshManager();
