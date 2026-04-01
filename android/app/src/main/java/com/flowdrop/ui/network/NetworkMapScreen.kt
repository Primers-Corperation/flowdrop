package com.flowdrop.ui.network

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.text.*
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.text.drawText
import com.flowdrop.ui.status.NodeStatusViewModel
import com.flowdrop.ui.status.PeerStatus
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlin.math.*

@OptIn(ExperimentalMaterial3Api::class, ExperimentalTextApi::class)
@Composable
fun NetworkMapScreen(
    viewModel: NodeStatusViewModel = viewModel()
) {
    val peers by viewModel.peers.collectAsState()
    val textMeasurer = rememberTextMeasurer()
    
    val blePeers = peers.filter { it.transport == "BLE" }
    val nostrPeers = peers.filter { it.transport == "Nostr" }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("Mesh Topology") })
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            Canvas(modifier = Modifier.fillMaxSize()) {
                val canvasWidth = size.width
                val canvasHeight = size.height
                val centerX = canvasWidth / 2f
                val centerY = canvasHeight / 2f
                
                val baseRadius = minOf(canvasWidth, canvasHeight)
                val innerCircleRadius = baseRadius * 0.25f
                val outerCircleRadius = baseRadius * 0.42f

                // Phase 1: Draw ALL Lines first (under the nodes)
                
                // BLE lines
                blePeers.forEachIndexed { index, _ ->
                    val angle = (2 * PI * index / blePeers.size.coerceAtLeast(1)).toFloat()
                    val peerX = centerX + innerCircleRadius * cos(angle)
                    val peerY = centerY + innerCircleRadius * sin(angle)
                    
                    drawLine(
                        color = Color(0xFF00A884).copy(alpha = 0.6f),
                        start = Offset(centerX, centerY),
                        end = Offset(peerX, peerY),
                        strokeWidth = 2.dp.toPx()
                    )
                }

                // Nostr lines
                nostrPeers.forEachIndexed { index, _ ->
                    val angle = ((2 * PI * index / nostrPeers.size.coerceAtLeast(1)) + (PI / 4.0)).toFloat()
                    val peerX = centerX + outerCircleRadius * cos(angle.toDouble()).toFloat()
                    val peerY = centerY + outerCircleRadius * sin(angle.toDouble()).toFloat()
                    
                    drawLine(
                        color = Color.Gray.copy(alpha = 0.5f),
                        start = Offset(centerX, centerY),
                        end = Offset(peerX, peerY),
                        strokeWidth = 1.dp.toPx(),
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(10f, 10f), 0f)
                    )
                }

                // Phase 2: Draw Nodes
                
                // Center Node
                drawCircle(
                    color = Color(0xFF1DE9B6),
                    radius = 28.dp.toPx(),
                    center = Offset(centerX, centerY)
                )
                val localText = textMeasurer.measure("YOU", TextStyle(color = Color.Black, fontSize = 10.sp, fontWeight = FontWeight.Bold))
                drawText(localText, topLeft = Offset(centerX - localText.size.width/2f, centerY - localText.size.height/2f))

                // BLE Peers
                blePeers.forEachIndexed { index, peer ->
                    val angle = (2 * PI * index / blePeers.size.coerceAtLeast(1)).toFloat()
                    val peerX = centerX + innerCircleRadius * cos(angle)
                    val peerY = centerY + innerCircleRadius * sin(angle)
                    drawPeerNode(textMeasurer, peer, Offset(peerX, peerY), Color(0xFF00A884))
                }

                // Nostr Peers
                nostrPeers.forEachIndexed { index, peer ->
                    val angle = ((2 * PI * index / nostrPeers.size.coerceAtLeast(1)) + (PI / 4.0)).toFloat()
                    val peerX = centerX + outerCircleRadius * cos(angle.toDouble()).toFloat()
                    val peerY = centerY + outerCircleRadius * sin(angle.toDouble()).toFloat()
                    drawPeerNode(textMeasurer, peer, Offset(peerX, peerY), Color(0xFF3498DB))
                }

                // Phase 3: Empty State Feedback
                if (peers.isEmpty()) {
                    val scanningText = textMeasurer.measure(
                        "Scanning for local mesh peers...", 
                        TextStyle(color = Color.Gray, fontSize = 12.sp)
                    )
                    drawText(
                        scanningText,
                        topLeft = Offset(centerX - scanningText.size.width / 2f, centerY + 48.dp.toPx())
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalTextApi::class)
private fun DrawScope.drawPeerNode(
    textMeasurer: TextMeasurer,
    peer: PeerStatus,
    offset: Offset,
    color: Color
) {
    drawCircle(color = color, radius = 20.dp.toPx(), center = offset)
    
    val label = peer.nodeId.take(6)
    val textLayoutResult = textMeasurer.measure(
        text = AnnotatedString(label),
        style = TextStyle(color = Color.White, fontSize = 9.sp, fontWeight = FontWeight.Medium)
    )
    
    drawText(
        textLayoutResult = textLayoutResult,
        topLeft = Offset(
            offset.x - textLayoutResult.size.width / 2f,
            offset.y - textLayoutResult.size.height / 2f
        )
    )
}
