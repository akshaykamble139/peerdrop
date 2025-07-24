// src/components/HomePage.jsx
import React, { useState, useEffect } from 'react';
import { usePeerDropLogic } from '../hooks/usePeerDropLogic';
import FileInput from './FileInput';
import TransferStatus from './TransferStatus';
import ReceivedFiles from './ReceivedFiles';
import SentFiles from './SentFiles';
import RoomEntry from './RoomEntry';
import { toast } from 'react-toastify';
import QRCode from 'react-qr-code';

function HomePage() {
    const {
        roomId,
        username,
        isConnecting,
        connectionError,
        activePeers,
        joinRoom,
        receivedFiles,
        downloadProgress,
        showSuccessCheck,
        receivingFileName,
        selectedFile,
        setSelectedFile,
        handleSendFile,
        isTransferring,
        transferProgress,
        sendingFileName,
        sentFiles,
    } = usePeerDropLogic();

    const [initialAttemptMade, setInitialAttemptMade] = useState(false);
    const [showQR, setShowQR] = useState(false);

    const handleInvalidRoom = () => {
        toast.error("Room doesn't exist or is inactive.");
        window.history.pushState({}, document.title, window.location.origin + window.location.pathname.split('/')[0]);
    };

    const handleRoomJoined = (assignedUsername) => {
        toast.success(`Joined room as ${assignedUsername}!`);
    };

    const handleRoomFull = () => {
        toast.error('Room is full! Max users reached.');
        window.history.pushState({}, document.title, window.location.origin + window.location.pathname.split('/')[0]);
    };

    const handleConnectionError = (message) => {
        toast.error(message);
        window.history.pushState({}, document.title, window.location.origin + window.location.pathname.split('/')[0]);
    };

    const handleManualJoin = (id) => {
        if (id.trim()) {
            joinRoom(
                id,
                false,
                handleInvalidRoom,
                handleRoomJoined,
                handleRoomFull,
                handleConnectionError
            );
        }
    };

    const handleCreate = () => {
        const newRoomId = crypto.randomUUID().slice(-12);
        joinRoom(
            newRoomId,
            true,
            handleInvalidRoom,
            handleRoomJoined,
            handleRoomFull,
            handleConnectionError
        );
    };

    useEffect(() => {
        if (!initialAttemptMade && !roomId && !isConnecting) {
            const pathSegments = window.location.pathname.split('/').filter(Boolean);
            const initialRoomIdFromUrl = pathSegments.length > 0 ? pathSegments[0] : null;

            if (initialRoomIdFromUrl) {
                joinRoom(
                    initialRoomIdFromUrl,
                    false,
                    handleInvalidRoom,
                    handleRoomJoined,
                    handleRoomFull,
                    handleConnectionError
                );
            }
            setInitialAttemptMade(true);
        }
    }, [initialAttemptMade, roomId, isConnecting, joinRoom, handleInvalidRoom, handleRoomJoined, handleRoomFull, handleConnectionError]);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Room ID copied to clipboard!');
    };

    const copyRoomUrl = () => {
        const roomUrl = `${window.location.origin}/${roomId}`;
        navigator.clipboard.writeText(roomUrl);
        toast.success('Room URL copied to clipboard!');
    };

    const isInRoom = roomId !== null;
    const hasOpenDataChannel = activePeers.some(peer => peer.dataChannelOpen);

    return (
        <>
            {isInRoom && (
                <>
                    <div
                        className="fixed top-6 md:top-24 left-6 z-50 bg-indigo-600 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-all border-2 border-white"
                        onClick={() => setShowQR(true)}
                        title="Show QR Code for room"
                    >
                        <svg className="w-5 h-5 md:w-6 md:h-6" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h2v2h-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 19h2v2h-2zM19 17h2v2h-2zM21 15h2v2h-2zM19 21h2v2h-2z"/>
                        </svg>
                    </div>

                    {showQR && (
                        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                            <div className="bg-white rounded-2xl p-6 max-w-sm w-full">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold text-gray-800">Scan to Join Room</h3>
                                    <button
                                        onClick={() => setShowQR(false)}
                                        className="text-gray-500 hover:text-gray-700 text-2xl"
                                    >
                                        ×
                                    </button>
                                </div>
                                <div className="flex justify-center mb-4">
                                    <QRCode
                                        value={`${window.location.origin}/${roomId}`}
                                        size={200}
                                        level="M"
                                        className="border-4 border-gray-100 rounded-lg"
                                    />
                                </div>
                                <p className="text-sm text-gray-600 text-center">
                                    Scan this QR code with a camera app to join the room directly
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="hidden md:block">
                        <div
                            className="fixed top-24 right-6 z-50 bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-mono cursor-pointer hover:bg-indigo-700 transition-all"
                            onClick={() => copyToClipboard(roomId)}
                            title="Click to copy Room ID"
                        >
                            <div>👤 {username}</div>
                            <div>📎 Room: {roomId}</div>
                            {activePeers.length > 0 && (
                                <div className="mt-2 text-xs">
                                    Peers: {activePeers.map(peer => (
                                        <span key={peer.socketId} className={`mr-2 ${peer.dataChannelOpen ? 'text-green-300' : 'text-yellow-300'}`}>
                                            {peer.username} {peer.dataChannelOpen ? '🟢' : '🟡'}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {activePeers.length === 0 && (
                                <div className="mt-2 text-xs text-indigo-200">
                                    Waiting for peers...
                                </div>
                            )}
                        </div>
                        <div
                            className="fixed top-48 right-6 z-50 bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-mono cursor-pointer hover:bg-indigo-700 transition-all"
                            onClick={copyRoomUrl}
                            title="Click to copy Room URL"
                        >
                            <div>🔗 Copy Room URL</div>
                        </div>
                    </div>
                </>
            )}
            <div className="w-full flex justify-center">
                {!isInRoom ? (
                    <RoomEntry
                        onJoinRoom={handleManualJoin}
                        onCreateRoom={handleCreate}
                        isConnecting={isConnecting}
                        connectionError={connectionError}
                    />
                ) : (
                    <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-2xl">
                        <div className="md:hidden mb-4 bg-indigo-50 p-4 rounded-xl border border-indigo-200">
                            <div className="flex items-center justify-between mb-2">
                                <div className="text-sm text-indigo-700 font-medium">
                                    👤 {username} | 📎 Room: {roomId}
                                </div>
                            </div>
                            {activePeers.length > 0 && (
                                <div className="text-xs text-indigo-600 mb-2">
                                    Peers: {activePeers.map(peer => (
                                        <span key={peer.socketId} className={`mr-2 ${peer.dataChannelOpen ? 'text-green-600' : 'text-yellow-600'}`}>
                                            {peer.username} {peer.dataChannelOpen ? '🟢' : '🟡'}
                                        </span>
                                    ))}
                                </div>
                            )}
                            {activePeers.length === 0 && (
                                <div className="text-xs text-indigo-500 mb-2">
                                    Waiting for peers...
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => copyToClipboard(roomId)}
                                    className="flex-1 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-all"
                                >
                                    Copy Room ID
                                </button>
                                <button
                                    onClick={copyRoomUrl}
                                    className="flex-1 bg-indigo-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-indigo-700 transition-all"
                                >
                                    Copy Room URL
                                </button>
                            </div>
                        </div>

                        <h1 className="text-3xl font-bold text-indigo-700 mb-2">📁 PeerDrop</h1>
                        <p className="text-gray-600 mb-4">Secure peer-to-peer file sharing in your browser.</p>

                        <FileInput
                            selectedFile={selectedFile}
                            setSelectedFile={setSelectedFile}
                            onSendFile={() => handleSendFile(selectedFile)}
                            disableSend={!hasOpenDataChannel || isTransferring}
                        />

                        <TransferStatus
                            isTransferring={isTransferring}
                            transferProgress={transferProgress}
                            downloadProgress={downloadProgress}
                            showSuccessCheck={showSuccessCheck}
                            receivingFileName={receivingFileName}
                            sendingFileName={sendingFileName}
                        />

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-gray-300 pt-6 mt-6">
                            <ReceivedFiles files={receivedFiles} />
                            <div className="border-t md:border-t-0 md:border-l border-gray-300 pt-6 md:pt-0 md:pl-6">
                                <SentFiles files={sentFiles} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}

export default HomePage;