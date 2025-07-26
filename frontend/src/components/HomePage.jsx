import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePeerDropLogic } from '../hooks/usePeerDropLogic';
import FileInput from './FileInput';
import TransferStatus from './TransferStatus';
import ReceivedFiles from './ReceivedFiles';
import SentFiles from './SentFiles';
import RoomEntry from './RoomEntry';
import QRCode from 'react-qr-code';
import RoomInfo from './RoomInfo';
import { copyToClipboard, handleConnectionError, handleInvalidRoom, handleRoomFull, handleRoomJoined } from '../utils/helper';

function HomePage() {
    const { roomId: roomIdFromUrl } = useParams();
    const navigate = useNavigate();

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
            if (roomIdFromUrl) {
                joinRoom(
                    roomIdFromUrl,
                    false,
                    handleInvalidRoom,
                    handleRoomJoined,
                    handleRoomFull,
                    handleConnectionError
                );
            }
            setInitialAttemptMade(true);
        }
    }, [initialAttemptMade, roomId, isConnecting, roomIdFromUrl, joinRoom, handleInvalidRoom, handleRoomJoined, handleRoomFull, handleConnectionError]);

    useEffect(() => {
        if (roomId && roomIdFromUrl !== roomId) {
            navigate(`/${roomId}`, { replace: true });
        }
    }, [roomId, roomIdFromUrl, navigate]);

    useEffect(() => {
        if (roomId === null && roomIdFromUrl) {
            navigate('/', { replace: true });
        }
    }, [roomId, roomIdFromUrl, navigate]);

    const isInRoom = roomId !== null;
    const hasOpenDataChannel = activePeers.some(peer => peer.dataChannelOpen);

    return (
        <>
            {isInRoom && (
                <>
                    <div
                        className="fixed top-6 md:top-24 left-5 z-50 bg-indigo-600 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-all border-2 border-white md:hidden"
                        onClick={() => setShowQR(true)}
                        title="Show QR Code for room"
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h2v2h-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 19h2v2h-2zM19 17h2v2h-2zM21 15h2v2h-2zM19 21h2v2h-2z" />
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
                        <div className="fixed top-24 left-6 z-50 flex items-center space-x-4">
                            <div
                                className="bg-indigo-600 text-white p-3 rounded-full shadow-lg cursor-pointer hover:bg-indigo-700 transition-all border-2 border-white"
                                onClick={() => setShowQR(true)}
                                title="Show QR Code for room"
                            >
                                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M3 11h8V3H3v8zm2-6h4v4H5V5zM3 21h8v-8H3v8zm2-6h4v4H5v-4zM13 3v8h8V3h-8zm6 6h-4V5h4v4zM19 13h2v2h-2zM13 13h2v2h-2zM15 15h2v2h-2zM13 17h2v2h-2zM15 19h2v2h-2zM17 17h2v2h-2zM17 19h2v2h-2zM19 17h2v2h-2zM21 15h2v2h-2zM19 21h2v2h-2z" />
                                </svg>
                            </div>
                            <span className="text-indigo-700 font-semibold text-lg">or</span>
                            <div
                                className="bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-mono cursor-pointer hover:bg-indigo-700 transition-all"
                                onClick={() => copyToClipboard(`${window.location.origin}/${roomId}`, "url")}
                                title="Click to copy Room URL"
                            >
                                <div>🔗 Copy Room URL</div>
                            </div>
                        </div>
                        <RoomInfo
                            username={username}
                            roomId={roomId}
                            activePeers={activePeers}
                            isOnMobile={false}
                        />
                    </div>
                </>
            )}
            <div className="w-full flex justify-center items-center min-h-[calc(100vh-120px)]">
                {!isInRoom ? (
                    <RoomEntry
                        onJoinRoom={handleManualJoin}
                        onCreateRoom={handleCreate}
                        isConnecting={isConnecting}
                        connectionError={connectionError}
                    />
                ) : (
                    <div className="bg-white shadow-xl rounded-2xl p-4 md:p-8 w-full max-w-2xl mx-4">
                        <div className="md:hidden mb-4 w-full">
                            <div
                                className="bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-mono cursor-pointer hover:bg-indigo-700 transition-all mb-4"
                                onClick={() => copyToClipboard(`${window.location.origin}/${roomId}`, "url")}
                                title="Click to copy Room URL"
                            >
                                <div className="text-center">🔗 Copy Room URL</div>
                            </div>

                            <RoomInfo
                                username={username}
                                roomId={roomId}
                                activePeers={activePeers}
                                isOnMobile={true}
                            />
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