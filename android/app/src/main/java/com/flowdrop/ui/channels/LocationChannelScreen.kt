package com.flowdrop.ui.channels

import android.annotation.SuppressLint
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import com.flowdrop.core.RustCore
import com.google.android.gms.location.FusedLocationProviderClient
import com.google.android.gms.location.LocationServices
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

class ChannelsViewModel : ViewModel() {
    private val _joinedChannels = MutableStateFlow<List<String>>(listOf("global"))
    val joinedChannels: StateFlow<List<String>> = _joinedChannels.asStateFlow()

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

    fun handleCommand(input: String) {
        val result = RustCore.handleIrcCommand(input)
        _statusMessage.value = result
        
        if (input.startsWith("/join", ignoreCase = true)) {
            val channelName = input.substringAfter("/join").trim()
            if (channelName.isNotEmpty() && !_joinedChannels.value.contains(channelName)) {
                _joinedChannels.value = _joinedChannels.value + channelName
            }
        }
    }

    fun joinByCoords(lat: Double, lon: Double) {
        val geohash = RustCore.encodeGeohash(lat, lon, 5) // 5 chars ~ 2.4km accuracy
        if (geohash != null) {
            handleCommand("/join #$geohash")
        }
    }
}

@SuppressLint("MissingPermission")
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LocationChannelScreen(
    viewModel: ChannelsViewModel = androidx.lifecycle.viewmodel.compose.viewModel()
) {
    val context = LocalContext.current
    val channels by viewModel.joinedChannels.collectAsState()
    val status by viewModel.statusMessage.collectAsState()
    var inputText by remember { mutableStateOf("") }
    
    val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }

    LaunchedEffect(Unit) {
        fusedLocationClient.lastLocation.addOnSuccessListener { location ->
            if (location != null) {
                viewModel.joinByCoords(location.latitude, location.longitude)
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Mesh Channels") })
        },
        floatingActionButton = {
            FloatingActionButton(onClick = { /* Future: Manual Join */ }) {
                Icon(Icons.Default.Add, contentDescription = "Join")
            }
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Channel List
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    Text("Joined Channels", style = MaterialTheme.typography.titleMedium)
                }
                items(channels) { channel ->
                    Card(
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        ListItem(
                            headlineContent = { Text(channel) },
                            leadingContent = { Icon(Icons.Default.LocationOn, contentDescription = null) }
                        )
                    }
                }
            }

            // Command Input / Status
            Surface(tonalElevation = 4.dp) {
                Column(modifier = Modifier.padding(16.dp)) {
                    status?.let {
                        Text(
                            text = it,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier.padding(bottom = 8.dp)
                        )
                    }
                    
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.fillMaxWidth(),
                        placeholder = { Text("Enter IRC command (e.g. /join #nyc)") },
                        trailingIcon = {
                            TextButton(onClick = {
                                viewModel.handleCommand(inputText)
                                inputText = ""
                            }) {
                                Text("EXECUTE")
                            }
                        }
                    )
                }
            }
        }
    }
}
