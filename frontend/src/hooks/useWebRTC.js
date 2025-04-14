import { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import { toast } from 'react-toastify';

export function useWebRTC() {
    const socketRef = useRef(null);
    const peerConnectionsRef = useRef({}); // Store multiple RTCPeerConnection objects
    const dataChannelsRef = useRef({});   // Store multiple RTCDataChannel objects
    const fileBufferRef = useRef([]);
    const CHUNK_SIZE = 16 * 1024;

    const [isInitiator, setIsInitiator] = useState(false);
    const [receivedFiles, setReceivedFiles] = useState([]);
    const [isTransferring, setIsTransferring] = useState(false);
    const [transferProgress, setTransferProgress] = useState(0);
    const [downloadProgress, setDownloadProgress] = useState(0);
    const [showSuccessCheck, setShowSuccessCheck] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [sentFiles, setSentFiles] = useState([]);
    const [receivingFileName, setReceivingFileName] = useState('');
    const [sendingFileName, setSendingFileName] = useState('');
    const [roomId, setRoomId] = useState(null);
    const [username, setUsername] = useState('');
    const roomIdRef = useRef(roomId);
    const activePeersRef = useRef([]); // Keep track of peers in the room
    const peersInitiatedConnectionWithRef = useRef([]); // Initialize this ref
    const iceCandidateBufferRef = useRef({}); // Initialize this ref

    useEffect(() => {
        roomIdRef.current = roomId;
    }, [roomId]);

    const joinRoom = (
        room,
        isCreator = false,
        onInvalidRoom = () => { },
        onRoomJoined = (assignedUsername) => { },
        onPeerJoined = (username, socketId) => { } // Add socketId here
    ) => {
        if (!socketRef.current) {
            const socket = io('http://localhost:5000');
            socketRef.current = socket;

            socket.on('connect', () => {
                if (isCreator) {
                    socket.emit('create-room', room);
                } else {
                    socket.emit('join', room);
                }
            });

            socket.on('invalid-room', () => {
                console.warn('❌ Invalid room!');
                onInvalidRoom();
            });

            socket.on('room-full', () => {
                console.warn('🚫 Room is full!');
                toast.error('Room is full! Max users reached.');
                socket.disconnect();
                socketRef.current = null;
            });

            socket.on('room-joined', ({ roomId, username }) => {
                console.log(`✅ Joined room ${roomId} as ${username}`);
                setUsername(username);
                setIsInitiator(false);
                setRoomId(roomId);
                activePeersRef.current = []; // Reset peers on room join/create
                onRoomJoined(username);
            });

            socket.on('peer-joined', ({ username, socketId }) => {
                console.log(`🎉 Peer joined: ${username} (${socketId})`);
                if (socketId === socketRef.current.id) return;

                if (!activePeersRef.current.includes(socketId)) {
                    activePeersRef.current.push(socketId);
                }

                // Initiate connection only if we haven't already for this peer
                if (!peersInitiatedConnectionWithRef.current.includes(socketId)) {
                    console.log(`🤝 Attempting to connect with peer: ${socketId}`);
                    createAndSendOffer(socketId);
                    peersInitiatedConnectionWithRef.current.push(socketId);
                }
            });

            socket.on('signal', async ({ from, data }) => {
                console.log(`📥 Received signaling data from ${from}:`, data);

                if (!peerConnectionsRef.current[from]) {
                    peerConnectionsRef.current[from] = createPeerConnection(from);
                    iceCandidateBufferRef.current[from] = []; // Initialize buffer for this peer
                }

                const pc = peerConnectionsRef.current[from];

                if (data.type === 'offer') {
                    const peerConnection = createPeerConnection(from);
                    peerConnectionsRef.current[from] = peerConnection;

                    // peerConnection.onicecandidate = handleICECandidateEvent;
                    peerConnection.ondatachannel = (event) => {
                        console.log(`📥 Received data channel from ${from}`);
                        dataChannelsRef.current[from] = event.channel;
                        event.channel.onmessage = handleIncomingMessage;
                        event.channel.onopen = () => {
                            console.log(`🟢 Data channel open with ${from}`);
                        };
                    };

                    try {
                        await peerConnection.setRemoteDescription(new RTCSessionDescription(data));
                        const answer = await peerConnection.createAnswer();
                        console.log('Setting local description...');
                        await peerConnection.setLocalDescription(answer);
                        console.log('✅ Local description set');

                        socketRef.current.emit('signal', {
                            to: from,
                            from: socketRef.current.id,
                            data: peerConnection.localDescription,
                        });
                    } catch (err) {
                        console.error('❌ Error handling offer:', err);
                    }
                } else if (data.type === 'answer') {
                    try {
                        // 🛡️ Wait until local description is set before setting remote answer
                        const peerConnection = peerConnectionsRef.current[from];
                        if (!peerConnection.currentRemoteDescription) {
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

            });

            socket.on('peer-left', ({ username, socketId }) => {
                console.log(`👋 Peer ${username} (${socketId}) left.`);
                activePeersRef.current = activePeersRef.current.filter(id => id !== socketId);
                if (peerConnectionsRef.current[socketId]) {
                    peerConnectionsRef.current[socketId].close();
                    delete peerConnectionsRef.current[socketId];
                }
                if (dataChannelsRef.current[socketId]) {
                    delete dataChannelsRef.current[socketId];
                }
            });
        } else {
            if (isCreator) {
                socketRef.current.emit('create-room', room);
            } else {
                socketRef.current.emit('join', room);
            }
        }

        setRoomId(room);
        activePeersRef.current = []; // Reset peers on room join/create
    };

    const createPeerConnection = (remoteSocketId) => {
        const pc = new RTCPeerConnection({
            iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
        });

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                console.log(`🧊 Sending ICE candidate to ${remoteSocketId}`);
                socketRef.current.emit("signal", {
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
            const peerId = remoteSocketId; // Capture the peer ID from the outer scope
            console.log(`📥 Received data channel from ${peerId}`);
            dataChannelsRef.current[peerId] = dc;
            dc.onopen = () => console.log(`🟢 Data channel open with ${peerId}`);
            // Bind the peerId to the handler
            dc.onmessage = (msgEvent) => handleIncomingMessage(msgEvent, peerId); // Pass peerId
        };

        return pc;
    };

    const handleICECandidateEvent = (peerId) => (event) => {
        if (event.candidate) {
            console.log(`🧊 Sending ICE candidate to ${peerId}`);
            socketRef.current.emit("signal", {
                to: peerId,
                from: socketRef.current.id,
                data: {
                    type: "candidate",
                    candidate: event.candidate,
                },
            });
        }
    };

    const createAndSendOffer = async (peerId) => {
        const peerConnection = createPeerConnection(peerId);
        peerConnectionsRef.current[peerId] = peerConnection;

        // ✅ Create data channel before offer
        const dataChannel = peerConnection.createDataChannel("fileTransfer");
        dataChannelsRef.current[peerId] = dataChannel;
        dataChannel.onopen = () => {
            console.log(`🟢 Data channel open with ${peerId}`);
        };
        dataChannel.onmessage = (msgEvent) => handleIncomingMessage(msgEvent, peerId); 

        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);

            console.log(`📤 Sent offer to ${peerId}`);
            socketRef.current.emit("signal", {
                to: peerId,
                from: socketRef.current.id,
                data: offer,
            });
        } catch (err) {
            console.error("❌ Error creating and sending offer:", err);
        }
    };


    const handleIncomingMessage = (event, fromSocketId) => {
        const data = event.data;

        console.log(`Received message from ${fromSocketId}`);

        if (typeof data === 'string' && data.startsWith('metadata:')) {
            const metadata = JSON.parse(data.replace('metadata:', ''));
            fileBufferRef.current[fromSocketId] = []; // Use socketId as key for buffer
            fileBufferRef.current[fromSocketId].metadata = metadata;
            setDownloadProgress(0); // Consider tracking per peer if needed
            setReceivingFileName(metadata.name); // Might need to track per peer
            setShowSuccessCheck(false);
        } else if (data === 'end') {
            const blob = new Blob(fileBufferRef.current[fromSocketId]);
            const url = URL.createObjectURL(blob);
            setReceivedFiles((files) => [
                ...files,
                { name: fileBufferRef.current[fromSocketId].metadata.name, url, sender: fromSocketId },
            ]);
            setDownloadProgress(100); // Consider tracking per peer
            setShowSuccessCheck(true);
            setTimeout(() => setShowSuccessCheck(false), 3000);
        } else {
            if (!fileBufferRef.current[fromSocketId]) {
                fileBufferRef.current[fromSocketId] = [];
            }
            fileBufferRef.current[fromSocketId].push(data);
            const totalReceived = fileBufferRef.current[fromSocketId].reduce((acc, chunk) => acc + chunk.byteLength, 0);
            const totalSize = fileBufferRef.current[fromSocketId].metadata?.size || 1;
            const percent = Math.round((totalReceived / totalSize) * 100);
            setDownloadProgress(percent); // Consider tracking per peer
        }
    };

    const handleSendFile = () => {
        const file = selectedFile;
        if (!file) {
            console.warn('⚠️ No file selected');
            return;
        }

        setIsTransferring(true);
        setTransferProgress(0);
        setSendingFileName(file.name);
        setSentFiles((prev) => [...prev, { name: file.name, recipients: Object.keys(dataChannelsRef.current) }]);

        const metadata = JSON.stringify({ name: file.name, size: file.size });

        const reader = new FileReader();
        let offset = 0;

        reader.onload = () => {
            if (reader.result) {
                for (const socketId in dataChannelsRef.current) {
                    if (dataChannelsRef.current[socketId].readyState === 'open') {
                        if (offset === 0) {
                            dataChannelsRef.current[socketId].send(`metadata:${metadata}`);
                        }
                        dataChannelsRef.current[socketId].send(reader.result);
                    }
                }
                offset += reader.result.byteLength;
                setTransferProgress(Math.round((offset / file.size) * 100));
                if (offset < file.size) {
                    readSlice(offset);
                } else {
                    for (const socketId in dataChannelsRef.current) {
                        if (dataChannelsRef.current[socketId].readyState === 'open') {
                            dataChannelsRef.current[socketId].send('end');
                        }
                    }
                    setIsTransferring(false);
                    setSelectedFile(null);
                    setTimeout(() => setSendingFileName(''), 3000);
                }
            }
        };

        const readSlice = (o) => {
            const slice = file.slice(o, o + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
        };

        readSlice(0);
    };

    return {
        selectedFile,
        setSelectedFile,
        handleSendFile,
        receivedFiles,
        sentFiles,
        isTransferring,
        transferProgress,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        handleFileChange: () => { }, // No direct file change handler needed here as we use selectedFile
        sendingFileName,
        joinRoom,
        username
    };
}