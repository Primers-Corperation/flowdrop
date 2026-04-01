package com.flowdrop.core

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import androidx.core.content.ContextCompat
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.ScanCallback
import android.bluetooth.le.ScanFilter
import android.bluetooth.le.ScanResult
import android.bluetooth.le.ScanSettings
import java.nio.charset.StandardCharsets
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

object BluetoothScanner {
    private const val TAG = "FlowDropBLE"
    
    // The globally unique identifier for FlowDrop peers. 
    // All devices must advertise and scan for this specific UUID to filter out noise.
    val FLOWDROP_SERVICE_UUID: ParcelUuid = ParcelUuid.fromString("F10E0D20-24A2-DB8E-5C80-00BEA1234000")

    private var bluetoothAdapter: BluetoothAdapter? = null
    
    @Volatile
    private var isScanning = false
    
    @Volatile
    private var isAdvertising = false

    // Maps randomized physical MAC addresses to stable mesh Node IDs
    private val addressToNodeId = ConcurrentHashMap<String, String>()
    private val nodeIdToAddress = ConcurrentHashMap<String, String>()

    fun getNodeIdForAddress(address: String): String? = addressToNodeId[address]
    fun getAddressForNodeId(nodeId: String): String? = nodeIdToAddress[nodeId]

    fun init(context: Context) {
        val bluetoothManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
        bluetoothAdapter = bluetoothManager.adapter
        Log.i(TAG, "BluetoothScanner initialized.")
    }

    private fun hasRequiredPermissions(context: Context): Boolean {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val scanPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_SCAN)
            val advPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_ADVERTISE)
            val connPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
            
            if (scanPerm != PackageManager.PERMISSION_GRANTED || 
                advPerm != PackageManager.PERMISSION_GRANTED ||
                connPerm != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Android 12+ BLE permissions missing. Halting radio operations gracefully.")
                return false
            }
        } else {
            val locPerm = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION)
            if (locPerm != PackageManager.PERMISSION_GRANTED) {
                Log.e(TAG, "Legacy Location permission missing. Halting radio operations.")
                return false
            }
        }
        return true
    }

    fun startAdvertising(context: Context, localNodeId: String) {
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Failed to start advertising: BluetoothScanner.init() was never called or Bluetooth is unsupported.")
            return
        }
        
        if (!hasRequiredPermissions(context)) return

        val advertiser = bluetoothAdapter?.bluetoothLeAdvertiser
        if (advertiser == null) {
            Log.e(TAG, "BLE Advertiser not supported on this hardware.")
            return
        }

        val settings = AdvertiseSettings.Builder()
            .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
            .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
            .setConnectable(true)
            .build()

        // BLE manufacturer data payload is capped to roughly 26 bytes. 
        // We ensure localNodeId is cleanly truncated to 20 bytes max to prevent 
        // underlying hardware exceptions during packet broadcast.
        var payloadBytes = localNodeId.toByteArray(StandardCharsets.UTF_8)
        if (payloadBytes.size > 20) {
            payloadBytes = payloadBytes.sliceArray(0 until 20)
        }
        
        val data = AdvertiseData.Builder()
            .setIncludeDeviceName(false)
            .addServiceUuid(FLOWDROP_SERVICE_UUID)
            .addManufacturerData(1337, payloadBytes) 
            .build()

        advertiser.startAdvertising(settings, data, advertiseCallback)
        isAdvertising = true
        Log.i(TAG, "Started BLE Advertising for node payload: ${String(payloadBytes, StandardCharsets.UTF_8)}")
    }

    fun stopAdvertising(context: Context) {
        if (!hasRequiredPermissions(context)) return
        bluetoothAdapter?.bluetoothLeAdvertiser?.stopAdvertising(advertiseCallback)
        isAdvertising = false
        Log.i(TAG, "Stopped BLE Advertising")
    }

    fun startScanning(context: Context) {
        if (bluetoothAdapter == null) {
            Log.e(TAG, "Failed to start scanning: BluetoothScanner.init() was never called or Bluetooth is unsupported.")
            return
        }
        
        if (!hasRequiredPermissions(context) || isScanning) return

        val scanner = bluetoothAdapter?.bluetoothLeScanner
        if (scanner == null) {
            Log.e(TAG, "BLE Scanner not available.")
            return
        }

        // Only wake the CPU when our specific Service UUID is observed in the air
        val filter = ScanFilter.Builder()
            .setServiceUuid(FLOWDROP_SERVICE_UUID)
            .build()

        val settings = ScanSettings.Builder()
            .setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY)
            .build()

        scanner.startScan(listOf(filter), settings, scanCallback)
        isScanning = true
        Log.i(TAG, "Started BLE Scanning for FlowDrop peers.")
    }

    fun stopScanning(context: Context) {
        if (!hasRequiredPermissions(context) || !isScanning) return
        bluetoothAdapter?.bluetoothLeScanner?.stopScan(scanCallback)
        isScanning = false
        Log.i(TAG, "Stopped BLE Scanning.")
    }

    // Callbacks
    private val advertiseCallback = object : AdvertiseCallback() {
        override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
            Log.i(TAG, "Advertising successfully started.")
        }

        override fun onStartFailure(errorCode: Int) {
            Log.e(TAG, "Advertising failed with error code: $errorCode")
            isAdvertising = false
        }
    }

    private val scanCallback = object : ScanCallback() {
        override fun onScanResult(callbackType: Int, result: ScanResult?) {
            result?.scanRecord?.let { record ->
                val manufacturerData = record.getManufacturerSpecificData(1337)
                if (manufacturerData != null) {
                    val nodeId = String(manufacturerData, StandardCharsets.UTF_8)
                    
                    // Track this physical device to avoid randomization issues during GATT writes
                    result.device?.address?.let { addr ->
                        addressToNodeId[addr] = nodeId
                        nodeIdToAddress[nodeId] = addr
                    }

                    // Handoff to Rust core via JNI contract on the centralized RustCore class
                    RustCore.onPeerDiscovered(nodeId)
                }
            }
        }

        override fun onScanFailed(errorCode: Int) {
            Log.e(TAG, "BLE Scan failed with error code: $errorCode")
            isScanning = false
        }
    }
}
