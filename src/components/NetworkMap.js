import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Share2 } from 'lucide-react-native';

const { width } = Dimensions.get('window');

// This component visualizes the mesh nodes as a simple nodes-and-edges graph.
// In a real app, this would use a physics engine or SVG lines to show actual hops.

export default function NetworkMap({ peers }) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Mesh Topography</Text>
            
            <View style={styles.mapArea}>
                {/* Self Node */}
                <View style={[styles.node, styles.selfNode]}>
                    <Text style={styles.nodeLabel}>ME</Text>
                </View>

                {/* Peer Nodes arranged in a circle */}
                {peers.map((peer, index) => {
                    const angle = (index / peers.length) * 2 * Math.PI;
                    const radius = 100;
                    const x = Math.cos(angle) * radius;
                    const y = Math.sin(angle) * radius;

                    return (
                        <View key={peer.id} style={styles.peerContainer}>
                            {/* Connection line (simulated) */}
                            <View style={[styles.line, { 
                                width: radius,
                                transform: [{ rotate: `${angle}rad` }, { translateX: radius/2 }]
                            }]} />
                            
                            <View style={[styles.node, { transform: [{ translateX: x }, { translateY: y }] }]}>
                                <Share2 color="#fff" size={16} />
                            </View>
                            <Text style={[styles.peerLabel, { transform: [{ translateX: x }, { translateY: y + 25 }] }]}>
                                {peer.name || 'Peer'}
                            </Text>
                        </View>
                    );
                })}
            </View>

            <View style={styles.legend}>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, {backgroundColor: '#00A884'}]} />
                    <Text style={styles.legendText}>Direct Peer</Text>
                </View>
                <View style={styles.legendItem}>
                    <View style={[styles.legendDot, {backgroundColor: '#8696A0'}]} />
                    <Text style={styles.legendText}>Relay Node</Text>
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 20 },
    title: { color: '#00A884', fontSize: 16, fontWeight: 'bold', marginBottom: 40 },
    mapArea: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    node: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#00A884',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        zIndex: 2,
    },
    selfNode: {
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: '#005C4B',
        borderWidth: 2,
        borderColor: '#00A884',
    },
    nodeLabel: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
    peerContainer: {
        position: 'absolute',
        justifyContent: 'center',
        alignItems: 'center',
    },
    line: {
        height: 1,
        backgroundColor: '#30404C',
        position: 'absolute',
        zIndex: 1,
    },
    peerLabel: {
        color: '#8696A0',
        fontSize: 10,
        position: 'absolute',
        textAlign: 'center',
        width: 80,
    },
    legend: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 15,
    },
    legendDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        marginRight: 8,
    },
    legendText: {
        color: '#8696A0',
        fontSize: 12,
    }
});
