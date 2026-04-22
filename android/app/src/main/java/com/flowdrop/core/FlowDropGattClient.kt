package com.flowdrop.core

import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCallback
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothProfile
import android.content.Context
import android.os.Build
import android.util.Log
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.ConcurrentLinkedQueue

object FlowDropGattClient {
    private const val TAG = "FlowDropGattClient"

    private var appContext: Context? = null
    private var bluetoothManager: BluetoothManager? = null
    private val activeConnections = ConcurrentHashMap<String, BluetoothGatt>()
    
    // Buffer chunks while waiting for connection and service discovery to finish
    private val pendingChunks = ConcurrentHashMap<String, ConcurrentLinkedQueue<ByteArray>>()

    fun init(context: Context) {
        this.appContext = context.applicationContext
        this.bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
    }

    /**
     * Entry point for Rust to request a physical hardware write.
     * Maps to the writeChunkToBle callback in RustCore.
     */
    fun writeChunk(nodeId: String, address: String, chunk: ByteArray) {
        val context = appContext ?: return
        val gatt = activeConnections[nodeId] ?: run {
            // Initiate a connection and queue the chunk
            pendingChunks.getOrPut(nodeId) { ConcurrentLinkedQueue() }.add(chunk)
            
            val device = bluetoothManager?.adapter?.getRemoteDevice(address)
            if (device != null) {
                Log.i(TAG, "Connecting to new peer: $nodeId ($address)")
                val newGatt = device.connectGatt(context, false, gattCallback)
                activeConnections[nodeId] = newGatt
            }
            return
        }

        val service = gatt.getService(FlowDropGattServer.SERVICE_UUID)
        val char = service?.getCharacteristic(FlowDropGattServer.RX_WRITE_CHAR_UUID)
        
        if (char != null) {
            performWrite(gatt, char, chunk)
        } else {
            // Service not yet discovered or characteristic missing; queue the chunk
            pendingChunks.getOrPut(nodeId) { ConcurrentLinkedQueue() }.add(chunk)
            if (gatt.getService(FlowDropGattServer.SERVICE_UUID) == null) {
                gatt.discoverServices()
            }
        }
    }

    private fun performWrite(gatt: BluetoothGatt, char: BluetoothGattCharacteristic, chunk: ByteArray) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            gatt.writeCharacteristic(char, chunk, BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE)
        } else {
            @Suppress("DEPRECATION")
            char.value = chunk
            @Suppress("DEPRECATION")
            char.writeType = BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE
            gatt.writeCharacteristic(char)
        }
    }

    private fun flushPendingChunks(nodeId: String, gatt: BluetoothGatt) {
        val queue = pendingChunks[nodeId] ?: return
        val service = gatt.getService(FlowDropGattServer.SERVICE_UUID) ?: return
        val char = service.getCharacteristic(FlowDropGattServer.RX_WRITE_CHAR_UUID) ?: return

        while (queue.isNotEmpty()) {
            val chunk = queue.poll() ?: break
            performWrite(gatt, char, chunk)
            // Note: In production, we'd wait for onCharacteristicWrite before pushing more,
            // but but for flush we might need careful throttle management.
        }
    }

    private val gattCallback = object : BluetoothGattCallback() {
        override fun onConnectionStateChange(gatt: BluetoothGatt, status: Int, newState: Int) {
            val addr = gatt.device.address
            val nodeId = BluetoothScanner.getNodeIdForAddress(addr) ?: addr

            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, "Connected to GATT Server: $nodeId")
                gatt.discoverServices()
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.i(TAG, "Disconnected from $nodeId")
                activeConnections.remove(nodeId)
                pendingChunks.remove(nodeId)
                gatt.close()
            }
        }

        override fun onServicesDiscovered(gatt: BluetoothGatt, status: Int) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                val addr = gatt.device.address
                val nodeId = BluetoothScanner.getNodeIdForAddress(addr) ?: addr
                Log.i(TAG, "Services discovered for $nodeId. Reading identity characteristic.")
                
                // Always try to read the full identity upon discovery
                val service = gatt.getService(FlowDropGattServer.SERVICE_UUID)
                val idChar = service?.getCharacteristic(FlowDropGattServer.NODE_ID_CHAR_UUID)
                if (idChar != null) {
                    gatt.readCharacteristic(idChar)
                }

                flushPendingChunks(nodeId, gatt)
            }
        }

        override fun onCharacteristicRead(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            if (status == BluetoothGatt.GATT_SUCCESS && characteristic.uuid == FlowDropGattServer.NODE_ID_CHAR_UUID) {
                val addr = gatt.device.address
                val beaconHex = BluetoothScanner.getNodeIdForAddress(addr) ?: ""
                
                if (beaconHex.isNotEmpty()) {
                    val pubkey = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        characteristic.value?.let { String(it) } ?: ""
                    } else {
                        @Suppress("DEPRECATION")
                        characteristic.value?.let { String(it) } ?: ""
                    }
                    
                    if (pubkey.isNotEmpty()) {
                        val beaconBytes = (0 until beaconHex.length step 2)
                            .map { beaconHex.substring(it, it + 2).toInt(16).toByte() }
                            .toByteArray()
                        
                        IdentityResolutionManager.storeIdentity(beaconBytes, pubkey)
                    }
                }
            }
        }

        override fun onCharacteristicWrite(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            status: Int
        ) {
            val addr = gatt.device.address
            val nodeId = BluetoothScanner.getNodeIdForAddress(addr) ?: addr
            
            // Release the backpressure throttle in Rust
            RustCore.onChunkWriteCompleted(nodeId)
        }

        // Android 13+ Callback
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            handleCharacteristicChange(gatt, characteristic, value)
        }

        // Legacy Callback
        @Suppress("DEPRECATION")
        override fun onCharacteristicChanged(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic
        ) {
            handleCharacteristicChange(gatt, characteristic, characteristic.value)
        }

        private fun handleCharacteristicChange(
            gatt: BluetoothGatt,
            characteristic: BluetoothGattCharacteristic,
            value: ByteArray
        ) {
            if (characteristic.uuid == FlowDropGattServer.NACK_NOTIFY_CHAR_UUID) {
                val addr = gatt.device.address
                val nodeId = BluetoothScanner.getNodeIdForAddress(addr) ?: addr
                Log.w(TAG, "Received NACK notification from $nodeId")
                
                // Pass the NACK packet back to the Rust reliability engine
                RustCore.onBleChunkReceived(nodeId, value)
            }
        }
    }
}
