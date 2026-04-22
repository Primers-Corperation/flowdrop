package com.flowdrop.core

import android.util.Log

object RustCore {
    private const val TAG = "RustCoreFFI"

    init {
        try {
            System.loadLibrary("flowdrop_core")
            Log.i(TAG, "Successfully loaded native Rust library: libflowdrop_core.so")
        } catch (e: UnsatisfiedLinkError) {
            Log.e(TAG, "CRITICAL ERROR: Failed to load libflowdrop_core.so. Ensure cargo-ndk compilation and ABI paths are correct.", e)
            throw e
        }
    }

    // =========================================================
    // JNI INBOUND: KOTLIN TO RUST (M1 Scaffolds)
    // =========================================================
    
    @JvmStatic
    external fun initEngine(dbPath: String): String
    
    @JvmStatic
    external fun generateIdentity(): String

    @JvmStatic
    external fun sendMessage(peerId: String, text: String, mtu: Int)

    @JvmStatic
    external fun onBleChunkReceived(peerId: String, chunk: ByteArray)

    @JvmStatic
    external fun onChunkWriteCompleted(peerId: String)

    // =========================================================
    // JNI OUTBOUND: RUST CALLBACKS TO KOTLIN
    // =========================================================

    @JvmStatic
    fun writeChunkToBle(peerId: String, chunk: ByteArray) {
        val address = BluetoothScanner.getAddressForNodeId(peerId)
        if (address != null) {
            FlowDropGattClient.writeChunk(peerId, address, chunk)
        } else {
            Log.w(TAG, "Cannot write chunk to $peerId: No known MAC address (peer not recently scanned).")
        }
    }
    @JvmStatic
    fun onMessageReceived(peerId: String, text: String) {
        Log.i(TAG, "New message from $peerId: $text")
        // Trigger UI event / Notification
    }

    @JvmStatic
    external fun onPeerDiscovered(nodeId: String)

    @JvmStatic
    external fun getThreads(): String?

    @JvmStatic
    external fun getMessages(peerId: String): String?

    @JvmStatic
    external fun encodeGeohash(lat: Double, lon: Double, precision: Int): String?

    @JvmStatic
    external fun handleIrcCommand(input: String): String?

    @JvmStatic
    external fun sweepInboundBuffers()

    @JvmStatic
    external fun resolveBeaconToIdentity(beacon: ByteArray): String?

    @JvmStatic
    external fun registerBeaconForIdentity(beacon: ByteArray, pubkey: String)

    @JvmStatic
    external fun requestIdentityPacket(beacon: ByteArray): ByteArray?

    @JvmStatic
    external fun shutdownEngine()
}
