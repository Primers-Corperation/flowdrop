package com.flowdrop.ui.status

import androidx.compose.foundation.layout.*
import androidx.compose.runtime.LaunchedEffect
import kotlinx.coroutines.delay
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CellTower
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class RelayStatus(
    val url: String,
    val isConnected: Boolean,
    val latencyMs: Int
)

data class PeerStatus(
    val nodeId: String,
    val rssi: Int,
    val transport: String // "BLE" or "Nostr"
)

class NodeStatusViewModel : ViewModel() {
    private val _relays = MutableStateFlow<List<RelayStatus>>(emptyList())
    val relays: StateFlow<List<RelayStatus>> = _relays.asStateFlow()

    private val _peers = MutableStateFlow<List<PeerStatus>>(emptyList())
    val peers: StateFlow<List<PeerStatus>> = _peers.asStateFlow()

    init {
        // Mocking real-time monitoring until Milestone 8's background loop is wired
        _relays.value = listOf(
            RelayStatus("wss://relay.damus.io", true, 120),
            RelayStatus("wss://nos.lol", false, 0)
        )
        _peers.value = listOf(
            PeerStatus("npub1...5v8z", -65, "BLE"),
            PeerStatus("npub1...xm2p", -80, "Nostr")
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NodeStatusScreen(
    viewModel: NodeStatusViewModel = viewModel()
) {
    val relays by viewModel.relays.collectAsState()
    val peers by viewModel.peers.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Node Status") })
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                StatusCard(
                    title = "Mesh Peers",
                    count = peers.size.toString(),
                    icon = Icons.Default.CellTower
                )
            }
            item {
                StatusCard(
                    title = "Nostr Relays",
                    count = relays.count { it.isConnected }.toString() + "/" + relays.size,
                    icon = Icons.Default.CloudDone
                )
            }
            
            item {
                Text("Connected Peers", style = MaterialTheme.typography.titleMedium)
            }
            items(peers) { peer ->
                ListItem(
                    headlineContent = { Text(peer.nodeId.take(16)) },
                    supportingContent = { Text("Transport: ${peer.transport} | RSSI: ${peer.rssi} dBm") },
                    leadingContent = { Icon(Icons.Default.Info, contentDescription = null) }
                )
            }

            item {
                Text("Relay Health", style = MaterialTheme.typography.titleMedium)
            }
            items(relays) { relay ->
                ListItem(
                    headlineContent = { Text(relay.url) },
                    supportingContent = { 
                        Text(if (relay.isConnected) "Connected (${relay.latencyMs}ms)" else "Disconnected") 
                    },
                    trailingContent = {
                        val color = if (relay.isConnected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.error
                        Badge(containerColor = color)
                    }
                )
            }
        }
    }
}

@Composable
fun StatusCard(title: String, count: String, icon: ImageVector) {
    ElevatedCard(
        modifier = Modifier.fillMaxWidth()
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(32.dp))
            Spacer(modifier = Modifier.width(16.dp))
            Column {
                Text(text = title, style = MaterialTheme.typography.labelMedium)
                Text(text = count, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
            }
        }
    }
}
