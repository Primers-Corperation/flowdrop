package com.flowdrop.core

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Manages the transition from a 6-byte BLE beacon to a full 32-byte Nostr identity.
 * Using StateFlow for modern Compose observation.
 */
object IdentityResolutionManager {
    private const val TAG = "IdentityResolution"
    
    // Live cache of resolved identities for the UI
    private val resolutionStates = mutableMapOf<String, MutableStateFlow<String>>()

    /**
     * Called when the BluetoothScanner sightings a beacon.
     * Returns true if we already know who this is.
     */
    fun onBeaconReceived(beacon: ByteArray): Boolean {
        val beaconHex = beacon.joinToString("") { "%02x".format(it) }
        val resolvedKey = RustCore.resolveBeaconToIdentity(beacon)
        
        if (resolvedKey != null) {
            Log.d(TAG, "Beacon $beaconHex resolved instantly to $resolvedKey")
            updateFlow(beaconHex, resolvedKey)
            return true
        }

        Log.i(TAG, "New beacon sighted: $beaconHex - initiating identity request")
        triggerIdentityRequest(beacon)
        return false
    }

    /**
     * Triggers the BLE GATT write to request the full identity from the peer.
     */
    private fun triggerIdentityRequest(beacon: ByteArray) {
        val requestPacket = RustCore.requestIdentityPacket(beacon) ?: return
        val beaconHex = beacon.joinToString("") { "%02x".format(it) }
        
        // Find the MAC address associated with this beacon to send the GATT request
        val address = BluetoothScanner.getAddressForBeacon(beaconHex)
        if (address != null) {
            // We use a reserved "id_req" nodeId to route the handshake
            FlowDropGattClient.writeChunk(beaconHex, address, requestPacket)
        }
    }

    /**
     * Called when a peer responds with their full pubkey over GATT.
     */
    fun storeIdentity(beacon: ByteArray, pubkey: String) {
        val beaconHex = beacon.joinToString("") { "%02x".format(it) }
        RustCore.registerBeaconForIdentity(beacon, pubkey)
        updateFlow(beaconHex, pubkey)
        Log.i(TAG, "Successfully resolved and stored identity for $beaconHex: $pubkey")
    }

    private fun updateFlow(beaconHex: String, pubkey: String) {
        val flow = resolutionStates.getOrPut(beaconHex) { MutableStateFlow("") }
        flow.value = pubkey
    }

    fun getIdentityStatus(beaconHex: String): StateFlow<String> {
        return resolutionStates.getOrPut(beaconHex) { MutableStateFlow("") }.asStateFlow()
    }
}
