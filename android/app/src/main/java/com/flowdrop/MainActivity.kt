package com.flowdrop

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.app.ActivityCompat
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.flowdrop.core.MeshForegroundService
import com.flowdrop.ui.conversations.ConversationListScreen
import com.flowdrop.ui.chat.ChatScreen
import com.flowdrop.ui.channels.LocationChannelScreen
import com.flowdrop.ui.status.NodeStatusScreen
import com.flowdrop.ui.network.NetworkMapScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        // 1. Request Global Mesh Permissions
        val permissions = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            permissions.add(Manifest.permission.BLUETOOTH_SCAN)
            permissions.add(Manifest.permission.BLUETOOTH_CONNECT)
            permissions.add(Manifest.permission.BLUETOOTH_ADVERTISE)
        }
        ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 101)

        // 2. Lifecycle: Ensure the Native Rust runtime is persistent
        val serviceIntent = Intent(this, MeshForegroundService::class.java)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }

        // 3. Mount Centralized Navigation UI
        setContent {
            FlowDropApp()
        }
    }
}

@Composable
fun FlowDropApp() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    Scaffold(
        bottomBar = {
            // Hide bottom bar when deep in a chat
            if (currentRoute != "chat/{peerId}") {
                NavigationBar {
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Message, contentDescription = null) },
                        label = { Text("Chats") },
                        selected = currentRoute == "conversations",
                        onClick = {
                            navController.navigate("conversations") {
                                popUpTo(navController.graph.startDestinationId) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Public, contentDescription = null) },
                        label = { Text("Channels") },
                        selected = currentRoute == "channels",
                        onClick = { navController.navigate("channels") }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.Share, contentDescription = null) },
                        label = { Text("Network") },
                        selected = currentRoute == "network",
                        onClick = { navController.navigate("network") }
                    )
                    NavigationBarItem(
                        icon = { Icon(Icons.Default.MonitorHeart, contentDescription = null) },
                        label = { Text("Status") },
                        selected = currentRoute == "status",
                        onClick = { navController.navigate("status") }
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = "conversations",
            modifier = Modifier.padding(innerPadding)
        ) {
            // Screen 1: Conversation List
            composable("conversations") {
                ConversationListScreen(
                    onNavigateToChat = { peerId ->
                        navController.navigate("chat/$peerId")
                    }
                )
            }

            // Screen 2: Detailed Chat View
            composable(
                route = "chat/{peerId}",
                arguments = listOf(navArgument("peerId") { type = NavType.StringType })
            ) { backStackEntry ->
                val peerId = backStackEntry.arguments?.getString("peerId") ?: ""
                ChatScreen(
                    peerId = peerId
                )
            }

            // Screen 3: Location-Aware Geohash Channels
            composable("channels") {
                LocationChannelScreen()
            }

            // Screen 4: Real-time Topology Map
            composable("network") {
                NetworkMapScreen()
            }

            // Screen 5: Node & Relay Health Status
            composable("status") {
                NodeStatusScreen()
            }
        }
    }
}
