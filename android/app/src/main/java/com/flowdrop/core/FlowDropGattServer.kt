package com.flowdrop.core

import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothDevice
import android.content.Context
import android.os.Build
import android.util.Log
import java.util.UUID

object FlowDropGattServer {
    private const val TAG = "FlowDropGattServer"

    // Service & Characteristic UUIDs
    val SERVICE_UUID: UUID = UUID.fromString("F10E0D20-24A2-DB8E-5C80-00BEA1234000")
    val RX_WRITE_CHAR_UUID: UUID = UUID.fromString("F10E0D21-24A2-DB8E-5C80-00BEA1234000")
    val NACK_NOTIFY_CHAR_UUID: UUID = UUID.fromString("F10E0D22-24A2-DB8E-5C80-00BEA1234000")

    private var gattServer: BluetoothGattServer? = null
    private var rxCharacteristic: BluetoothGattCharacteristic? = null
    private var nackCharacteristic: BluetoothGattCharacteristic? = null

    fun start(context: Context) {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        gattServer = bluetoothManager.openGattServer(context, gattServerCallback)

        if (gattServer == null) {
            Log.e(TAG, "GATT Server failed to open.")
            return
        }

        // 1. RX Write Characteristic (Inbound path)
        rxCharacteristic = BluetoothGattCharacteristic(
            RX_WRITE_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_WRITE or BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE,
            BluetoothGattCharacteristic.PERMISSION_WRITE
        )

        // 2. NACK Notify Characteristic (Reliability path)
        nackCharacteristic = BluetoothGattCharacteristic(
            NACK_NOTIFY_CHAR_UUID,
            BluetoothGattCharacteristic.PROPERTY_NOTIFY,
            BluetoothGattCharacteristic.PERMISSION_READ
        )

        val service = BluetoothGattService(SERVICE_UUID, BluetoothGattService.SERVICE_TYPE_PRIMARY)
        service.addCharacteristic(rxCharacteristic)
        service.addCharacteristic(nackCharacteristic)

        gattServer?.addService(service)
        Log.i(TAG, "GATT Server started with RX Write and NACK Notify characteristics.")
    }

    fun stop() {
        gattServer?.close()
        gattServer = null
        Log.i(TAG, "GATT Server stopped.")
    }

    /**
     * Pushes a NACK packet to a specific connected peer.
     */
    fun notifyNack(device: BluetoothDevice, nackData: ByteArray) {
        nackCharacteristic?.let { char ->
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                gattServer?.notifyCharacteristicChanged(device, char, false, nackData)
            } else {
                @Suppress("DEPRECATION")
                char.value = nackData
                gattServer?.notifyCharacteristicChanged(device, char, false)
            }
        }
    }

    private val gattServerCallback = object : BluetoothGattServerCallback() {
        override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
            Log.d(TAG, "Connection state change: ${device.address} -> $newState")
        }

        override fun onCharacteristicWriteRequest(
            device: BluetoothDevice,
            requestId: Int,
            characteristic: BluetoothGattCharacteristic,
            preparedWrite: Boolean,
            responseNeeded: Boolean,
            offset: Int,
            value: ByteArray
        ) {
            if (characteristic.uuid == RX_WRITE_CHAR_UUID) {
                // Resolve randomized MAC to stable Node ID
                val nodeId = BluetoothScanner.getNodeIdForAddress(device.address) ?: device.address
                
                // IMPORTANT: Immediate hand-off to the Rust core reassembly logic
                RustCore.onBleChunkReceived(nodeId, value)
                
                if (responseNeeded) {
                    gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, null)
                }
            }
        }
        
        override fun onServiceAdded(status: Int, service: BluetoothGattService) {
            Log.i(TAG, "FlowDrop GATT Service added: $status")
        }
    }
}
