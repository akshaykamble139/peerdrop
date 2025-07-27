import { useRef, useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import { toast } from 'react-toastify';

export function usePeerDropLogic() {
    const socketRef = useRef(null);
    const [roomId, setRoomId] = useState(null);
    const [username, setUsername] = useState('');
    const [isConnecting, setIsConnecting] = useState(false);
    const [connectionError, setConnectionError] = useState(null);
    const [activePeers, setActivePeers] = useState([]);
    const peersInitiatedConnectionWithRef = useRef([]);

    const peerConnectionsRef = useRef({});
    const iceCandidateBufferRef = useRef({});
    const dataChannelsRef = useRef({});
    const fileBufferRef = useRef({});

    const [receivedFiles, setReceivedFiles] = useState([]);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showSuccessCheck, setShowSuccessCheck] = useState(false);
    const [receivingFileName, setReceivingFileName] = useState('');

    const CHUNK_SIZE = 16 * 1024;
    const [selectedFile, setSelectedFile] = useState(null);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [sendingFileName, setSendingFileName] = useState('');
    const [sentFiles, setSentFiles] = useState([]);

    const shouldAttemptReconnectRef = useRef(true);

    const closeDataChannel = useCallback((socketId) => {
        if (dataChannelsRef.current[socketId]) {
            dataChannelsRef.current[socketId].close();
            delete dataChannelsRef.current[socketId];
            console.log(`Closed data channel with ${socketId}`);
        }
    }, []);

    const handleIncomingMessage = useCallback((event, fromSocketId) => {
        const data = event.data;

        if (typeof data === 'string' && data.startsWith('metadata:')) {
            const metadata = JSON.parse(data.replace('metadata:', ''));
            fileBufferRef.current[fromSocketId] = { buffer: [], metadata: metadata };
            setDownloadProgress(0);
            setReceivingFileName(metadata.name);
            setShowSuccessCheck(false);
        } else if (data === 'end') {
            const blob = new Blob(fileBufferRef.current[fromSocketId].buffer);
            const url = URL.createObjectURL(blob);
            const name = fileBufferRef.current[fromSocketId].metadata.name;
            if (fileBufferRef.current[fromSocketId] && fileBufferRef.current[fromSocketId].metadata) {
                setReceivedFiles((files) => [
                    ...files,
                    { name, url, sender: fromSocketId },
                ]);
            } else {
                console.error('Error: Metadata is missing when processing the end message!');
                toast.error('File reception error: Metadata missing.');
            }
            setDownloadProgress(100);
            setShowSuccessCheck(true);
            setTimeout(() => setShowSuccessCheck(false), 3000);
            delete fileBufferRef.current[fromSocketId];
        } else {
            if (!fileBufferRef.current[fromSocketId]) {
                fileBufferRef.current[fromSocketId] = { buffer: [] };
            }
            fileBufferRef.current[fromSocketId].buffer.push(data);
            const totalReceived = fileBufferRef.current[fromSocketId].buffer.reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const totalSize = fileBufferRef.current[fromSocketId].metadata?.size || 1;
            const percent = Math.round((totalReceived / totalSize) * 100);
            setDownloadProgress(percent);
        }
    }, []);

    const setDataChannel = useCallback((socketId, dataChannel) => {
        dataChannelsRef.current[socketId] = dataChannel;
        dataChannel.onmessage = (event) => handleIncomingMessage(event, socketId);
        dataChannel.onopen = () => {
            console.log(`Data channel open with ${socketId}`);
            setActivePeers(prevPeers => {
                const existingPeer = prevPeers.find(p => p.socketId === socketId);
                if (existingPeer) {
                    return prevPeers.map(peer =>
                        peer.socketId === socketId ? { ...peer, dataChannelOpen: true } : peer
                    );
                } else {
                    console.warn(`Data channel opened for unknown peer ${socketId}. Adding as placeholder.`);
                    return [...prevPeers, { socketId: socketId, username: socketId.substring(0,8), dataChannelOpen: true }];
                }
            });
        };
        dataChannel.onclose = () => {
            console.log(`Data channel closed with ${socketId}`);
            setActivePeers(prevPeers => prevPeers.map(peer =>
                peer.socketId === socketId ? { ...peer, dataChannelOpen: false } : peer
            ));
        };
        dataChannel.onerror = (error) => {
            console.error(`Data channel error with ${socketId}:`, error);
            toast.error(`Data channel error with peer ${socketId}.`);
        };
    }, [handleIncomingMessage]);

    const handleICECandidate = useCallback((payload) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('signal', payload);
        } else {
            console.warn("Socket not connected, cannot emit ICE candidate signal.");
            toast.warn("Connection lost. Cannot send signaling data.");
        }
    }, []);

    const createPeerConnection = useCallback((remoteSocketId) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`Sending ICE candidate to ${remoteSocketId}`);
                handleICECandidate({
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
            console.log(`Received data channel from ${remoteSocketId}`);
            setDataChannel(remoteSocketId, event.channel);
        };

        pc.onerror = (error) => {
            console.error(`Peer connection error with ${remoteSocketId}:`, error);
            toast.error(`Peer connection error with peer ${remoteSocketId}.`);
        };

        return pc;
    }, [handleICECandidate, setDataChannel]);

    const handleIncomingSignal = useCallback(async ({ from, data }) => {
        console.log(`Received signaling data from ${from}:`, data);

        if (!peerConnectionsRef.current[from]) {
            peerConnectionsRef.current[from] = createPeerConnection(from);
            iceCandidateBufferRef.current[from] = [];
        }

        const pc = peerConnectionsRef.current[from];

        if (data.type === 'offer') {
            console.log(`Received offer from ${from}`);
            pc.ondatachannel = (event) => {
                console.log(`Received data channel from ${from} (via offer)`);
                setDataChannel(from, event.channel);
            };

            try {
                await pc.setRemoteDescription(new RTCSessionDescription(data));
                console.log('Setting remote description...');
                const answer = await pc.createAnswer();
                console.log('Setting local description...');
                await pc.setLocalDescription(answer);
                console.log('Local description set');

                handleICECandidate({
                    to: from,
                    from: socketRef.current.id,
                    data: pc.localDescription,
                });
                console.log(`Sent answer to ${from}`);

                if (iceCandidateBufferRef.current[from]) {
                    for (const candidate of iceCandidateBufferRef.current[from]) {
                        await pc.addIceCandidate(new RTCIceCandidate(candidate));
                    }
                    iceCandidateBufferRef.current[from] = [];
                }

            } catch (err) {
                console.error('Error handling offer:', err);
                toast.error(`WebRTC error with peer ${from}: Failed to process offer.`);
            }
        } else if (data.type === 'answer') {
            try {
                if (pc && !pc.currentRemoteDescription) {
                    await pc.setRemoteDescription(new RTCSessionDescription(data));
                    console.log(`Answer applied from ${from}`);

                    if (iceCandidateBufferRef.current[from]) {
                        for (const candidate of iceCandidateBufferRef.current[from]) {
                            await pc.addIceCandidate(new RTCIceCandidate(candidate));
                        }
                        iceCandidateBufferRef.current[from] = [];
                    }
                }
            } catch (err) {
                console.error('Error handling answer:', err);
                toast.error(`WebRTC error with peer ${from}: Failed to process answer.`);
            }
        } else if (data.candidate) {
            try {
                console.log(`Adding ICE candidate from ${from}`);
                if (pc && pc.remoteDescription) {
                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                } else {
                    console.log(`Buffering ICE candidate from ${from} (pc or remote description not ready)`);
                    if (!iceCandidateBufferRef.current[from]) {
                        iceCandidateBufferRef.current[from] = [];
                    }
                    iceCandidateBufferRef.current[from].push(data.candidate);
                }
            } catch (err) {
                console.error(`Failed to add ICE candidate from ${from}:`, err);
                toast.error(`WebRTC error with peer ${from}: Failed to add ICE candidate.`);
            }
        }
    }, [createPeerConnection, handleICECandidate, setDataChannel]);


    const createAndSendOffer = useCallback(async (peerId) => {
        const peerConnection = createPeerConnection(peerId);
        peerConnectionsRef.current[peerId] = peerConnection;

        const dataChannel = peerConnection.createDataChannel("fileTransfer");
        setDataChannel(peerId, dataChannel);

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            console.log(`Sent offer to ${peerId}`);
            handleICECandidate({
                to: peerId,
                from: socketRef.current.id,
                data: offer,
            });
        } catch (err) {
            console.error("Error creating and sending offer:", err);
            toast.error(`WebRTC error: Failed to create or send offer to peer ${peerId}.`);
        }
    }, [createPeerConnection, handleICECandidate, setDataChannel]);


    const closePeerConnection = useCallback((socketId) => {
        if (peerConnectionsRef.current[socketId]) {
            peerConnectionsRef.current[socketId].close();
            delete peerConnectionsRef.current[socketId];
            console.log(`Closed peer connection with ${socketId}`);
        }
        closeDataChannel(socketId);
    }, [closeDataChannel]);


    const handleSendFile = useCallback((file) => {
        if (!file) {
            console.warn('No file selected');
            toast.warn('Please select a file to send.');
            return;
        }

        const activeDataChannels = Object.values(dataChannelsRef.current).filter(
            (channel) => channel.readyState === 'open'
        );

        if (activeDataChannels.length === 0) {
            console.warn('No active data channels to send file to.');
            toast.warn('No peers connected to send file to.');
            return;
        }

        setIsTransferring(true);
        setTransferProgress(0);
        setSendingFileName(file.name);

        const metadata = JSON.stringify({ name: file.name, size: file.size });

        const reader = new FileReader();
        let offset = 0;

        const sendChunk = (channel, chunkToSend) => {
            if (channel.readyState === 'open') {
                channel.send(chunkToSend);
            }
        };

        reader.onload = () => {
            try {
                if (reader.result) {
                    const chunk = reader.result;

                    if (offset === 0) {
                        activeDataChannels.forEach(channel => {
                            sendChunk(channel, `metadata:${metadata}`);
                        });
                    }

                    activeDataChannels.forEach(channel => {
                        if (channel.bufferedAmount < channel.bufferedAmountLowThreshold || channel.bufferedAmount === 0) {
                            sendChunk(channel, chunk);
                        } else {
                            channel.onbufferedamountlow = () => {
                                channel.onbufferedamountlow = null;
                                sendChunk(channel, chunk);
                            };
                        }
                    });

                    offset += chunk.byteLength;
                    setTransferProgress(Math.round((offset / file.size) * 100));

                    if (offset < file.size) {
                        readSlice(offset);
                    } else {
                        activeDataChannels.forEach(channel => {
                            sendChunk(channel, 'end');
                        });
                        setIsTransferring(false);
                        setSelectedFile(null);
                        setTimeout(() => setSendingFileName(''), 3000);
                        setSentFiles((prev) => [...prev, { name: file.name, recipients: Object.keys(dataChannelsRef.current) }]);
                        toast.success(`File "${file.name}" sent successfully!`);
                    }
                }
            } catch (e) {
                console.error("Error while transferring file:", e);
                toast.error(`Failed to send file "${file.name}".`);
                setIsTransferring(false);
            }
        };

        reader.onerror = (error) => {
            console.error('Error reading file:', error);
            toast.error(`Failed to read file "${file.name}".`);
            setIsTransferring(false);
        };

        const readSlice = (o) => {
            const slice = file.slice(o, o + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        readSlice(0);
    }, [dataChannelsRef, setSelectedFile, setSentFiles]);


    const joinRoom = useCallback((
        room,
        isCreator,
        onInvalidRoom,
        onRoomJoined,
        onRoomFull,
        onConnectionError
    ) => {
        setIsConnecting(true);
        setConnectionError(null);
        shouldAttemptReconnectRef.current = true;

        if (socketRef.current) {
            shouldAttemptReconnectRef.current = false;
            socketRef.current.disconnect();
            socketRef.current = null;
        }

        const socket = io(import.meta.env.VITE_BACKEND_URL, {
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 20000,
            reconnectionDelayMax: 50000,
            randomizationFactor: 0.5
        });
        socketRef.current = socket;

        socket.on('connect', () => {
            console.log("Socket connected, attempting to join/create room.");
            shouldAttemptReconnectRef.current = true;
            if (isCreator) {
                socket.emit('create-room', room);
            } else {
                socket.emit('join', room);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            if (shouldAttemptReconnectRef.current) {
                onConnectionError("Failed to connect to server. Retrying connection...");
                setConnectionError("Failed to connect to server. Retrying...");
            } else {
                setIsConnecting(false);
                onConnectionError("Failed to connect to server.");
                setConnectionError("Failed to connect to server.");
            }
        });

        socket.on('disconnect', (reason) => {
            console.log(`Socket disconnected: ${reason}`);
            setRoomId(null);
            setUsername('');
            setActivePeers([]);
            peersInitiatedConnectionWithRef.current = [];
            for (const peerId in peerConnectionsRef.current) {
                closePeerConnection(peerId);
            }

            if (shouldAttemptReconnectRef.current) {
                setIsConnecting(true);
                onConnectionError(`Disconnected: ${reason}. Retrying connection...`);
                setConnectionError(`Disconnected: ${reason}. Retrying...`);
            } else {
                setIsConnecting(false);
                onConnectionError(`Disconnected from server.`);
                setConnectionError(null);
            }
        });

        socket.on('invalid-room', () => {
            console.warn('❌ Invalid room!');
            shouldAttemptReconnectRef.current = false;
            socket.disconnect();
            socketRef.current = null;
            onInvalidRoom();
        });

        socket.on('room-full', () => {
            console.warn('🚫 Room is full!');
            shouldAttemptReconnectRef.current = false;
            socket.disconnect();
            socketRef.current = null;
            onRoomFull();
        });

        socket.on('room-joined', ({ roomId: assignedRoomId, username: assignedUsername, existingPeers = [] }) => {
            console.log(`✅ Joined room ${assignedRoomId} as ${assignedUsername}`);
            setUsername(assignedUsername);
            setRoomId(assignedRoomId);
            setActivePeers(existingPeers.map(peer => ({ ...peer, dataChannelOpen: false })));
            peersInitiatedConnectionWithRef.current = [];
            onRoomJoined(assignedUsername);
            setIsConnecting(false);
            setConnectionError(null);

            existingPeers.forEach(peer => {
                if (socketRef.current.id < peer.socketId) {
                    console.log(`🤝 Attempting to connect with existing peer: ${peer.socketId}`);
                    createAndSendOffer(peer.socketId);
                    peersInitiatedConnectionWithRef.current.push(peer.socketId);
                }
            });
        });

        socket.on('peer-joined', ({ username: peerUsername, socketId: peerSocketId }) => {
            console.log(`🎉 Peer joined: ${peerUsername} (${peerSocketId})`);
            if (peerSocketId === socketRef.current.id) return;

            setActivePeers((prevPeers) => {
                if (!prevPeers.some(p => p.socketId === peerSocketId)) {
                    return [...prevPeers, { socketId: peerSocketId, username: peerUsername, dataChannelOpen: false }];
                }
                return prevPeers;
            });

            if (!peersInitiatedConnectionWithRef.current.includes(peerSocketId) && socketRef.current.id < peerSocketId) {
                console.log(`🤝 Attempting to connect with peer: ${peerSocketId}`);
                createAndSendOffer(peerSocketId);
                peersInitiatedConnectionWithRef.current.push(peerSocketId);
            }
        });

        socket.on('signal', ({ from, data }) => {
            console.log(`Received signal from ${from}:`, data);
            handleIncomingSignal({ from, data });
        });

        socket.on('peer-left', ({ username: leftUsername, socketId: leftSocketId }) => {
            console.log(`👋 Peer ${leftUsername} (${leftSocketId}) left.`);
            setActivePeers((prevPeers) => prevPeers.filter(peer => peer.socketId !== leftSocketId));
            peersInitiatedConnectionWithRef.current = peersInitiatedConnectionWithRef.current.filter(id => id !== leftSocketId);
            closePeerConnection(leftSocketId);
        });

    }, [closePeerConnection, createAndSendOffer, handleIncomingSignal, username]);

    useEffect(() => {
        return () => {
            if (socketRef.current) {
                shouldAttemptReconnectRef.current = false;
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            for (const peerId in peerConnectionsRef.current) {
                closePeerConnection(peerId);
            }
        };
    }, [closePeerConnection]);

    const emitSignal = useCallback((payload) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('signal', payload);
        } else {
            console.warn("Socket not connected, cannot emit signal.");
            toast.warn("Connection lost. Cannot send signaling data.");
        }
    }, []);

    return {
        socketRef,
        roomId,
        username,
        isConnecting,
        connectionError,
        activePeers,
        joinRoom,
        emitSignal,
        receivedFiles,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        dataChannelsRef,
        selectedFile,
        setSelectedFile,
        handleSendFile,
        isTransferring,
        transferProgress,
        sendingFileName,
        sentFiles,
    };
}