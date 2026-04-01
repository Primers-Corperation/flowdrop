package com.flowdrop.core

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import android.util.Log
import org.json.JSONObject

class MeshForegroundService : Service() {
    private val TAG = "MeshService"
    private val NOTIFICATION_ID = 1001
    private val CHANNEL_ID = "mesh_channel"
    
    private val handler = Handler(Looper.getMainLooper())
    private val sweepRunnable = object : Runnable {
        override fun run() {
            RustCore.sweepInboundBuffers()
            handler.postDelayed(this, 5000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "Starting FlowDrop Mesh Service...")
        
        // 1. Initialize Rust Core with DB Path
        val dbPath = getDatabasePath("flowdrop.db").absolutePath
        RustCore.initEngine(dbPath)

        // 2. Load or Generate Mesh Identity (Nostr Pubkey)
        val prefs = getSharedPreferences("mesh_prefs", Context.MODE_PRIVATE)
        var localNodeId = prefs.getString("local_node_id", null)
        
        if (localNodeId == null) {
            val identityJson = RustCore.generateIdentity()
            if (identityJson != null) {
                try {
                    val jsonObj = JSONObject(identityJson)
                    localNodeId = jsonObj.getString("public_key")
                    prefs.edit().putString("local_node_id", localNodeId).apply()
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to parse identity JSON", e)
                }
            }
        }

        // 3. Initialize & Activate Hardware Layers
        BluetoothScanner.init(this)
        BluetoothScanner.startAdvertising(this, localNodeId)
        BluetoothScanner.startScanning(this)
        
        FlowDropGattServer.start(this)

        // 4. Start Background Sweep Loop (NACK Support)
        handler.post(sweepRunnable)

        // 5. Elevate to Foreground
        startForeground(NOTIFICATION_ID, createNotification())
        
        return START_STICKY
    }

    override fun onDestroy() {
        Log.i(TAG, "Shutting down Mesh Service...")
        handler.removeCallbacks(sweepRunnable)
        
        BluetoothScanner.stopAdvertising(this)
        BluetoothScanner.stopScanning(this)
        FlowDropGattServer.stop()

        RustCore.shutdownEngine()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun createNotification(): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("FlowDrop Mesh Active")
            .setContentText("P2P routing and Nostr fallback enabled.")
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Mesh Network Service",
                NotificationManager.IMPORTANCE_LOW
            )
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }
}
