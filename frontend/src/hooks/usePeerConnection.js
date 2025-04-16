// src/hooks/usePeerConnection.js
import { useRef } from 'react';

export function usePeerConnection(socketRef, onICECandidate, onDataChannel) {
    const peerConnectionsRef = useRef({});
    const iceCandidateBufferRef = useRef({});

    const handleIncomingSignal = async ({ from, data }) => {
        console.log(`📥 Received signaling data from ${from}:`, data); // Added log

        if (!peerConnectionsRef.current[from]) {
            peerConnectionsRef.current[from] = createPeerConnection(from);
            iceCandidateBufferRef.current[from] = [];
        }

        const pc = peerConnectionsRef.current[from];

        if (data.type === 'offer') {
            console.log(`Received offer from ${from}`); // Added log
            const peerConnection = createPeerConnection(from);
            peerConnectionsRef.current[from] = peerConnection;

            peerConnection.ondatachannel = (event) => {
                console.log(`📥 Received data channel from ${from}`);
                onDataChannel(from, event.channel);
            };

            try {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
                console.log('Setting remote description...'); // Added log
                const answer = await peerConnection.createAnswer();
                console.log('Setting local description...'); // Added log
                await peerConnection.setLocalDescription(answer);
                console.log('✅ Local description set'); // Added log

                onICECandidate({
                    to: from,
                    from: socketRef.current.id,
                    data: peerConnection.localDescription,
                });
                console.log(`📤 Sent answer to ${from}`); // Added log
            } catch (err) {
                console.error('❌ Error handling offer:', err);
            }
        } else if (data.type === 'answer') {
            try {
                const peerConnection = peerConnectionsRef.current[from];
                if (peerConnection && !peerConnection.currentRemoteDescription) {
                    await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
                    console.log(`✅ Answer applied from ${from}`);
                }
            } catch (err) {
                console.error('❌ Error handling answer:', err);
            }
        } else if (data.candidate) {
            try {
                console.log(`🧊 Adding ICE candidate from ${from}`);
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    console.log(`🧊 Buffering ICE candidate from ${from} (pc or remote description not ready)`);
                    if (!iceCandidateBufferRef.current[from]) {
                        iceCandidateBufferRef.current[from] = [];
                    }
                    iceCandidateBufferRef.current[from].push(data.candidate);
                }
            } catch (err) {
                console.error(`❌ Failed to add ICE candidate from ${from}:`, err);
            }
        }
    };

    const createPeerConnection = (remoteSocketId) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`🧊 Sending ICE candidate to ${remoteSocketId}`);
                onICECandidate({
                    to: remoteSocketId,
                    from: socketRef.current.id,
                    data: {
                        type: "candidate",
                        candidate: event.candidate,
                    },
                });
            }
        };

        pc.ondatachannel = (event) => {
            const dc = event.channel;
            const peerId = remoteSocketId;
            console.log(`📥 Received data channel from ${peerId}`);
            onDataChannel(peerId, dc);
        };

        return pc;
    };

    const createAndSendOffer = async (peerId, onDataChannelCreated) => {
        const peerConnection = createPeerConnection(peerId);
        peerConnectionsRef.current[peerId] = peerConnection;

        const dataChannel = peerConnection.createDataChannel("fileTransfer");
        onDataChannelCreated(peerId, dataChannel);
        dataChannel.onopen = () => {
            console.log(`🟢 Data channel open with ${peerId}`);
        };

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            console.log(`📤 Sent offer to ${peerId}`);
            onICECandidate({
                to: peerId,
                from: socketRef.current.id,
                data: offer,
            });
        } catch (err) {
            console.error("❌ Error creating and sending offer:", err);
        }
    };

    const closePeerConnection = (socketId) => {
        if (peerConnectionsRef.current[socketId]) {
            peerConnectionsRef.current[socketId].close();
            delete peerConnectionsRef.current[socketId];
        }
    };

    return {
        peerConnectionsRef,
        handleIncomingSignal,
        createAndSendOffer,
        closePeerConnection,
    };
}