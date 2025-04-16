// src/hooks/useWebRTC.js
import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import { usePeerConnection } from './usePeerConnection';
import { useDataChannel } from './useDataChannel';
import { useFileTransfer } from './useFileTransfer';

export function useWebRTC() {
    const [sentFiles, setSentFiles] = useState([]);

    const handleICECandidate = (payload) => {
        emitSignal(payload);
    };

    const handleDataChannel = (socketId, dataChannel) => {
        setDataChannel(socketId, dataChannel);
    };

    const handleFileSent = (fileInfo) => {
        setSentFiles((prev) => [...prev, fileInfo]);
    };

    const handlePeerLeft = (socketId) => {
        closePeerConnection(socketId);
        closeDataChannel(socketId);
    };

    const handleCreateOffer = (peerId) => {
        createAndSendOffer(peerId, handleDataChannelCreated);
    };

    const handleDataChannelCreated = (peerId, dataChannel) => {
        setDataChannel(peerId, dataChannel);
    };

    const handleIncomingSignal = (signal) => {
        // Determine the type of signal and handle accordingly
        if (signal.data.type === 'offer' || signal.data.type === 'answer' || signal.data.candidate) {
            peerConnectionHandleIncomingSignal(signal);
        } else {
            console.log('Unknown signal type:', signal);
        }
    };

    const {
        socketRef,
        roomId,
        username,
        joinRoom,
        emitSignal,
        activePeersRef,
        peersInitiatedConnectionWithRef,
    } = useSocket(
        (assignedUsername) => console.log('Room joined:', assignedUsername),
        (peerUsername, socketId) => console.log('Peer joined:', peerUsername, socketId),
        () => console.warn('Invalid room'),
        () => console.warn('Room full'),
        handleIncomingSignal,
        handlePeerLeft
    );

    const {
        peerConnectionsRef,
        handleIncomingSignal: peerConnectionHandleIncomingSignal,
        createAndSendOffer,
        closePeerConnection,
    } = usePeerConnection(socketRef, handleICECandidate, handleDataChannel);

    const {
        dataChannelsRef,
        receivedFiles,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        setDataChannel,
        closeDataChannel,
    } = useDataChannel();

    const {
        selectedFile,
        setSelectedFile,
        handleSendFile,
        isTransferring,
        transferProgress,
        sendingFileName,
    } = useFileTransfer(dataChannelsRef, handleFileSent);

    useEffect(() => {
        if (socketRef.current) {
            socketRef.current.on('peer-left', ({ socketId }) => {
                handlePeerLeft(socketId);
            });
        }
        return () => {
            if (socketRef.current) {
                socketRef.current.off('peer-left', () => {});
            }
        };
    }, [socketRef, handlePeerLeft]);

    return {
        roomId,
        username,
        joinRoom: (room, isCreator, onInvalidRoom, onRoomJoined) =>
            joinRoom(room, isCreator, onInvalidRoom, onRoomJoined, undefined, handleCreateOffer),
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
        sendingFileName,
    };
}