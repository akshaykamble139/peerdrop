// src/hooks/useSocket.js
import { useRef, useState, useEffect } from 'react';
import io from 'socket.io-client';
import { toast } from 'react-toastify';

export function useSocket(onRoomJoinedCallback, onPeerJoinedCallback, onInvalidRoomCallback, onRoomFullCallback, onSignalCallback, onPeerLeftCallback) {
    const socketRef = useRef(null);
    const [roomId, setRoomId] = useState(null);
    const [username, setUsername] = useState('');
    const roomIdRef = useRef(roomId);
    const activePeersRef = useRef([]);
    const peersInitiatedConnectionWithRef = useRef([]);

    useEffect(() => {
        roomIdRef.current = roomId;
    }, [roomId]);

    const joinRoom = (
        room,
        isCreator = false,
        onInvalidRoom = onInvalidRoomCallback,
        onRoomJoined = onRoomJoinedCallback,
        onPeerJoined = onPeerJoinedCallback,
        onCreateOffer
    ) => {
        if (!socketRef.current) {
            const socket = io(import.meta.env.VITE_BACKEND_URL);
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
                onRoomFullCallback();
            });

            socket.on('room-joined', ({ roomId, username }) => {
                console.log(`✅ Joined room ${roomId} as ${username}`);
                setUsername(username);
                setRoomId(roomId);
                activePeersRef.current = [];
                onRoomJoined(username);
            });

            socket.on('peer-joined', ({ username, socketId }) => {
                console.log(`🎉 Peer joined: ${username} (${socketId})`);
                if (socketId === socketRef.current.id) return;

                if (!activePeersRef.current.includes(socketId)) {
                    activePeersRef.current.push(socketId);
                }

                if (!peersInitiatedConnectionWithRef.current.includes(socketId)) {
                    console.log(`🤝 Attempting to connect with peer: ${socketId}`);
                    onCreateOffer(socketId);
                    peersInitiatedConnectionWithRef.current.push(socketId);
                }
                onPeerJoinedCallback(username, socketId);
            });

            socket.on('signal', ({ from, data }) => {
                console.log(`Received signal on receiver:`, { from, data }); // Added log
                onSignalCallback({ from, data });
            });

            socket.on('peer-left', ({ username, socketId }) => {
                console.log(`👋 Peer ${username} (${socketId}) left.`);
                activePeersRef.current = activePeersRef.current.filter(id => id !== socketId);
                onPeerLeftCallback(socketId);
            });
        } else {
            if (isCreator) {
                socketRef.current.emit('create-room', room);
            } else {
                socketRef.current.emit('join', room);
            }
        }

        setRoomId(room);
        activePeersRef.current = [];
    };

    const emitSignal = (payload) => {
        if (socketRef.current) {
            socketRef.current.emit('signal', payload);
        }
    };

    return {
        socketRef,
        roomId,
        username,
        joinRoom,
        emitSignal,
        activePeersRef,
        peersInitiatedConnectionWithRef,
    };
}