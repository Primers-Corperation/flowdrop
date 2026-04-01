package com.flowdrop.ui.chat

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import com.flowdrop.core.RustCore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.*

data class Message(
    val id: String,
    val sender: String,
    val text: String,
    val timestamp: Long,
    val isMe: Boolean
)

class ChatViewModel : ViewModel() {
    private val _messages = MutableStateFlow<List<Message>>(emptyList())
    val messages: StateFlow<List<Message>> = _messages.asStateFlow()

    fun initChat(peerId: String) {
        val jsonStr = RustCore.getMessages(peerId) ?: return
        try {
            val arr = JSONArray(jsonStr)
            val list = mutableListOf<Message>()
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                list.add(Message(
                    id = obj.getString("id"),
                    sender = obj.getString("sender"),
                    text = obj.getString("text"),
                    timestamp = obj.getLong("timestamp"),
                    isMe = obj.getBoolean("isMe")
                ))
            }
            _messages.value = list
        } catch (e: Exception) {
            // Log parse failure
        }
    }

    fun sendMessage(peerId: String, text: String) {
        if (text.isBlank()) return
        
        // 1. Rust Interop: Push to native chunking + radio queue
        // We use a dummy MTU of 512 for now; this is updated during real GATT negotiation
        RustCore.sendMessage(peerId, text, 512)

        // 2. UI Update (Immediate Optimistic Local Display)
        val newMessage = Message(
            id = UUID.randomUUID().toString(),
            sender = "me",
            text = text,
            timestamp = System.currentTimeMillis(),
            isMe = true
        )
        _messages.value = _messages.value + newMessage
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    peerId: String,
    viewModel: ChatViewModel = viewModel()
) {
    var inputText by remember { mutableStateOf("") }
    val messages by viewModel.messages.collectAsState()

    LaunchedEffect(peerId) {
        viewModel.initChat(peerId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(peerId.take(8) + "...") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            )
        },
        bottomBar = {
            ChatInput(
                text = inputText,
                onTextChange = { inputText = it },
                onSend = {
                    viewModel.sendMessage(peerId, inputText)
                    inputText = ""
                }
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            reverseLayout = false,
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            items(messages) { message ->
                ChatBubble(message)
            }
        }
    }
}

@Composable
fun ChatBubble(message: Message) {
    val alignment = if (message.isMe) Alignment.End else Alignment.Start
    val color = if (message.isMe) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.secondaryContainer
    val contentColor = if (message.isMe) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSecondaryContainer
    val shape = if (message.isMe) {
        RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp)
    } else {
        RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp)
    }

    Column(modifier = Modifier.fillMaxWidth(), horizontalAlignment = alignment) {
        Surface(
            color = color,
            contentColor = contentColor,
            shape = shape,
            tonalElevation = 2.dp
        ) {
            Text(
                text = message.text,
                modifier = Modifier.padding(12.dp),
                style = MaterialTheme.typography.bodyLarge
            )
        }
        Text(
            text = SimpleDateFormat("h:mm a", Locale.getDefault()).format(Date(message.timestamp)),
            style = MaterialTheme.typography.labelSmall,
            modifier = Modifier.padding(top = 4.dp),
            color = MaterialTheme.colorScheme.outline
        )
    }
}

@Composable
fun ChatInput(
    text: String,
    onTextChange: (String) -> Unit,
    onSend: () -> Unit
) {
    Surface(tonalElevation = 8.dp) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp)
                .navigationBarsPadding()
                .imePadding(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextField(
                value = text,
                onValueChange = onTextChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Message...") },
                colors = TextFieldDefaults.colors(
                    focusedContainerColor = Color.Transparent,
                    unfocusedContainerColor = Color.Transparent
                )
            )
            IconButton(onClick = onSend, enabled = text.isNotBlank()) {
                Icon(Icons.AutoMirrored.Filled.Send, contentDescription = "Send")
            }
        }
    }
}
