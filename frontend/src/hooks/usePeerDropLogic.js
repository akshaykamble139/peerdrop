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
    const dataChannelsRef = {};
    const fileBufferRef = useRef({});

    const [receivedFiles, setReceivedFiles] = useState([]);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showSuccessCheck, setShowSuccessCheck] = useState(false);
    const [receivingFileName, setReceivingFileName] = useState('');

    const CHUNK_SIZE = 16 * 1024;
    const CHUNK_WINDOW_SIZE = 10;

    const [selectedFile, setSelectedFile] = useState(null);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [sendingFileName, setSendingFileName] = useState('');
    const [sentFiles, setSentFiles] = useState([]);
    const [isProcessingFile, setIsProcessingFile] = useState(false);

    const pendingTransfersRef = useRef({});
    const [transferStatus, setTransferStatus] = useState({});

    const shouldAttemptReconnectRef = useRef(true);

    const calculateFileHash = useCallback(async (fileBuffer) => {
        const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }, []);

    const closeDataChannel = useCallback((socketId) => {
        if (dataChannelsRef[socketId]) {
            dataChannelsRef[socketId].close();
            delete dataChannelsRef[socketId];
            console.log(`Closed data channel with ${socketId}`);
        }
    }, []);

    const handleIncomingMessage = useCallback(async (event, fromSocketId) => {
        const data = event.data;

        if (typeof data === 'string' && data.startsWith('metadata:')) {
            const metadata = JSON.parse(data.replace('metadata:', ''));
            fileBufferRef.current[fromSocketId] = {
                buffer: new Array(metadata.totalChunks).fill(null),
                metadata: metadata,
                receivedChunks: 0
            };

            setDownloadProgress(0);
            setReceivingFileName(metadata.name);
            setShowSuccessCheck(false);
        } else if (typeof data === 'string' && data.startsWith('chunk-ack:')) {
            const ackData = JSON.parse(data.replace('chunk-ack:', ''));
            const { fileId, chunkIndex } = ackData;
            if (pendingTransfersRef.current[fileId]) {
                const transfer = pendingTransfersRef.current[fileId];
                transfer.ackedChunks.add(chunkIndex);
                while (transfer.lowestUnackedChunk < transfer.totalChunks && transfer.ackedChunks.has(transfer.lowestUnackedChunk)) {
                    transfer.lowestUnackedChunk++;
                }

                transfer.sendWindowOfChunks();

                const progress = Math.round((transfer.lowestUnackedChunk / transfer.totalChunks) * 100);
                setTransferProgress(progress);
            }
        } else if (typeof data === 'string' && data.startsWith('file-received-confirmation:')) {
            const confirmationData = JSON.parse(data.replace('file-received-confirmation:', ''));
            const { fileId, fileName, isValid } = confirmationData;

            if (pendingTransfersRef.current[fileId]) {
                const transfer = pendingTransfersRef.current[fileId];
                if (isValid) {
                    transfer.confirmedPeers.add(fromSocketId);
                } else {
                    console.error(`File validation failed for peer ${fromSocketId}`);
                    toast.error(`File validation failed for peer ${fromSocketId}`);
                    transfer.remainingPeersCount--;
                }

                const confirmedCount = transfer.confirmedPeers.size;
                const totalPeersForCompletion = transfer.remainingPeersCount;

                setTransferStatus(prev => ({
                    ...prev,
                    [fileId]: { confirmed: confirmedCount, total: totalPeersForCompletion }
                }));

                if (confirmedCount === totalPeersForCompletion && transfer) {
                    setSentFiles((prev) => [...prev, {
                        name: fileName,
                        recipients: Array.from(transfer.confirmedPeers)
                    }]);

                    const initialTotalPeers = transfer.initialPeerIds.length;
                    let successMessage = `File "${fileName}" sent successfully`;
                    if (confirmedCount === initialTotalPeers) {
                        if (initialTotalPeers === 1) {
                            successMessage += ` to ${initialTotalPeers} peer!`;
                        }
                        else {
                            successMessage += ` to all ${initialTotalPeers} peers!`;
                        }
                    } else if (confirmedCount > 0) {
                        successMessage += ` to ${confirmedCount} of ${initialTotalPeers} initial peers!`;
                    } else {
                        successMessage += ` but no peers confirmed receipt.`;
                    }
                    toast.success(successMessage);

                    delete pendingTransfersRef.current[fileId];
                    setTransferStatus(prev => {
                        const newStatus = { ...prev };
                        delete newStatus[fileId];
                        return newStatus;
                    });

                    if (Object.keys(pendingTransfersRef.current).length === 0) {
                        setIsTransferring(false);
                        setSelectedFile(null);
                        setTimeout(() => setSendingFileName(''), 3000);
                    }
                }
            }
        } else if (data === 'end') {
            const fileBuffer = fileBufferRef.current[fromSocketId];
            if (!fileBuffer || !fileBuffer.metadata) {
                console.error('Error: Metadata is missing when processing the end message!');
                toast.error('File reception error: Metadata missing.');
                return;
            }

            const validChunks = fileBuffer.buffer.filter(chunk => chunk !== null);
            if (validChunks.length !== fileBuffer.metadata.totalChunks) {
                console.error(`Missing chunks: expected ${fileBuffer.metadata.totalChunks}, got ${validChunks.length}`);
                toast.error('File reception error: Missing chunks.');
                return;
            }

            const blob = new Blob(fileBuffer.buffer);
            const arrayBuffer = await blob.arrayBuffer();
            const receivedHash = await calculateFileHash(arrayBuffer);
            const isValid = receivedHash === fileBuffer.metadata.hash;

            if (isValid) {
                const url = URL.createObjectURL(blob);
                const name = fileBuffer.metadata.name;

                setReceivedFiles((files) => [
                    ...files,
                    { name, url, sender: fromSocketId },
                ]);

                setDownloadProgress(100);
                setShowSuccessCheck(true);
                setTimeout(() => setShowSuccessCheck(false), 3000);
                setTimeout(() => {
                    setDownloadProgress(0);
                    setReceivingFileName('');
                }, 3000);
            } else {
                console.error('File integrity check failed');
                toast.error('File corruption detected. Transfer failed.');
            }

            if (dataChannelsRef[fromSocketId]) {
                const confirmationMessage = `file-received-confirmation:${JSON.stringify({
                    fileId: fileBuffer.metadata.fileId,
                    fileName: fileBuffer.metadata.name,
                    isValid
                })}`;
                dataChannelsRef[fromSocketId].send(confirmationMessage);
            }

            delete fileBufferRef.current[fromSocketId];
        } else if (data instanceof ArrayBuffer) {
            if (!fileBufferRef.current[fromSocketId]) {
                return;
            }

            const view = new DataView(data);
            const chunkIndex = view.getUint32(0, true);
            const chunkData = data.slice(4);

            const fileBuffer = fileBufferRef.current[fromSocketId];
            if (chunkIndex < fileBuffer.buffer.length && fileBuffer.buffer[chunkIndex] === null) {
                fileBuffer.buffer[chunkIndex] = chunkData;
                fileBuffer.receivedChunks++;
                const percent = Math.round((fileBuffer.receivedChunks / fileBuffer.metadata.totalChunks) * 100);
                setDownloadProgress(percent);

                const chunkAck = `chunk-ack:${JSON.stringify({
                    fileId: fileBuffer.metadata.fileId,
                    chunkIndex,
                    totalChunks: fileBuffer.metadata.totalChunks
                })}`;
                if (dataChannelsRef[fromSocketId]) {
                    dataChannelsRef[fromSocketId].send(chunkAck);
                }
            }
        }
    }, [calculateFileHash]);

    const setDataChannel = useCallback((socketId, dataChannel) => {
        dataChannelsRef[socketId] = dataChannel;
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
                    return [...prevPeers, { socketId: socketId, username: socketId.substring(0, 8), dataChannelOpen: true }];
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

    const handleSendFile = useCallback(async (file) => {
        if (!file) {
            console.warn('No file selected');
            toast.warn('Please select a file to send.');
            return;
        }

        const activeChannelIds = Object.keys(dataChannelsRef).filter(
            (id) => dataChannelsRef[id] && dataChannelsRef[id].readyState === 'open'
        );

        if (activeChannelIds.length === 0) {
            console.warn('No active data channels to send file to.');
            toast.warn('No peers connected to send file to.');
            return;
        }

        setIsProcessingFile(true);

        const fileId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const arrayBuffer = await file.arrayBuffer();
        const hash = await calculateFileHash(arrayBuffer);

        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        pendingTransfersRef.current[fileId] = {
            fileName: file.name,
            initialPeerIds: activeChannelIds,
            remainingPeersCount: activeChannelIds.length,
            confirmedPeers: new Set(),
            totalChunks,
            currentChunkToSend: 0,
            lowestUnackedChunk: 0,
            sentChunks: new Set(),
            ackedChunks: new Set(),
            file: file,
            sendWindowOfChunks: null
        };

        setTransferStatus(prev => ({
            ...prev,
            [fileId]: { confirmed: 0, total: activeChannelIds.length }
        }));

        setIsTransferring(true);
        setTransferProgress(0);
        setSendingFileName(file.name);

        const metadata = JSON.stringify({
            name: file.name,
            size: file.size,
            fileId,
            totalChunks,
            hash
        });

        activeChannelIds.forEach(socketId => {
            const channel = dataChannelsRef[socketId];
            if (channel && channel.readyState === 'open') {
                channel.send(`metadata:${metadata}`);
            }
        });

        const sendChunkToChannels = (chunkIndex) => {
            const transfer = pendingTransfersRef.current[fileId];
            if (!transfer || transfer.sentChunks.has(chunkIndex) || chunkIndex >= totalChunks) return;

            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunkData = arrayBuffer.slice(start, end);

            const chunkWithIndex = new ArrayBuffer(chunkData.byteLength + 4);
            const view = new DataView(chunkWithIndex);
            view.setUint32(0, chunkIndex, true);
            new Uint8Array(chunkWithIndex, 4).set(new Uint8Array(chunkData));

            transfer.initialPeerIds.forEach(socketId => {
                const channel = dataChannelsRef[socketId];
                if (channel && channel.readyState === 'open') {
                    channel.send(chunkWithIndex);
                }
            });

            transfer.sentChunks.add(chunkIndex);
        };

        pendingTransfersRef.current[fileId].sendWindowOfChunks = () => {
            const transfer = pendingTransfersRef.current[fileId];
            while (
                transfer.currentChunkToSend < transfer.totalChunks &&
                (transfer.currentChunkToSend - transfer.lowestUnackedChunk) < CHUNK_WINDOW_SIZE
            ) {
                sendChunkToChannels(transfer.currentChunkToSend);
                transfer.currentChunkToSend++;
            }
            if (transfer.lowestUnackedChunk === transfer.totalChunks && transfer.currentChunkToSend === transfer.totalChunks) {
                transfer.initialPeerIds.forEach(socketId => {
                    const channel = dataChannelsRef[socketId];
                    if (channel && channel.readyState === 'open') {
                        channel.send('end');
                    }
                });
            }
        };

        setIsProcessingFile(false);
        pendingTransfersRef.current[fileId].sendWindowOfChunks();

    }, [calculateFileHash]);

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

        socket.on('error', (error) => {
            console.error('Socket error:', error.message);
            setConnectionError(error.message);
            toast.error(error.message);
            if (error.message.includes('Too many')) {
                shouldAttemptReconnectRef.current = false;
                socket.disconnect();
                socketRef.current = null;
            }
        });

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
            for (const fileId in pendingTransfersRef.current) {
                delete pendingTransfersRef.current[fileId];
            }
            setTransferStatus({});
            setIsTransferring(false);
            setSendingFileName('');
            setSelectedFile(null);


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
            toast.info(`${leftUsername} left the room.`);
            setActivePeers((prevPeers) => prevPeers.filter(peer => peer.socketId !== leftSocketId));
            peersInitiatedConnectionWithRef.current = peersInitiatedConnectionWithRef.current.filter(id => id !== leftSocketId);
            closePeerConnection(leftSocketId);

            if (fileBufferRef.current[leftSocketId]) {
                toast.error('File transfer interrupted: Sender disconnected.');
                delete fileBufferRef.current[leftSocketId];
                setDownloadProgress(0);
                setReceivingFileName('');
                setShowSuccessCheck(false);
            }

            for (const fileId in pendingTransfersRef.current) {
                const transfer = pendingTransfersRef.current[fileId];
                if (transfer.initialPeerIds.includes(leftSocketId)) {
                    transfer.remainingPeersCount--;

                    transfer.confirmedPeers.delete(leftSocketId);

                    setTransferStatus(prev => ({
                        ...prev,
                        [fileId]: { confirmed: transfer.confirmedPeers.size, total: transfer.remainingPeersCount }
                    }));

                    const fileName = transfer.fileName;
                    const initialTotalPeers = transfer.initialPeerIds.length;
                    const confirmedCount = transfer.confirmedPeers.size;
                    const totalPeersForCompletion = transfer.remainingPeersCount;

                    if (confirmedCount === totalPeersForCompletion) {
                        if (confirmedCount > 0) {
                            setSentFiles((prev) => [...prev, {
                                name: fileName,
                                recipients: Array.from(transfer.confirmedPeers)
                            }]);
                            let successMessage = `File "${fileName}" sent successfully`;
                            if (confirmedCount === initialTotalPeers) {
                                successMessage += ` to all ${initialTotalPeers} peers!`;
                            } else {
                                successMessage += ` to ${confirmedCount} of ${initialTotalPeers} initial peers!`;
                            }
                            toast.success(successMessage);
                        } else {
                            toast.error(`File "${fileName}" transfer failed: All recipients disconnected or failed validation.`);
                        }

                        delete pendingTransfersRef.current[fileId];
                        setTransferStatus(prev => {
                            const newStatus = { ...prev };
                            delete newStatus[fileId];
                            return newStatus;
                        });

                        if (Object.keys(pendingTransfersRef.current).length === 0) {
                            setIsTransferring(false);
                            setSelectedFile(null);
                            setTimeout(() => setSendingFileName(''), 3000);
                        }
                    }
                }
            }
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
    }, [closeDataChannel]);

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
        transferStatus,
        isProcessingFile,
    };
}