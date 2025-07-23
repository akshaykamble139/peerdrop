import { useState } from 'react';
import { usePeerDropLogic } from './hooks/usePeerDropLogic';
import FileInput from './components/FileInput';
import TransferStatus from './components/TransferStatus';
import ReceivedFiles from './components/ReceivedFiles';
import SentFiles from './components/SentFiles';
import RoomEntry from './components/RoomEntry';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
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

  const handleInvalidRoom = () => {
    toast.error("Room doesn't exist or is inactive.");
  };

  const handleRoomJoined = (assignedUsername) => {
    toast.success(`Joined room as ${assignedUsername}!`);
  };

  const handleRoomFull = () => {
    toast.error('Room is full! Max users reached.');
  };

  const handleConnectionError = (message) => {
    toast.error(message);
  };

  const handleJoin = (id) => {
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

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Room ID copied to clipboard!');
  };

  const isInRoom = roomId !== null;

  const hasOpenDataChannel = activePeers.some(peer => peer.dataChannelOpen);

  return (
    <>
      <ToastContainer position="top-center" autoClose={1500} />
      {!isInRoom ? (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-white p-6">
          <RoomEntry
            onJoinRoom={handleJoin}
            onCreateRoom={handleCreate}
            isConnecting={isConnecting}
            connectionError={connectionError}
          />
        </div>
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-white flex items-center justify-center p-6 relative">

          <div
            className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-mono cursor-pointer hover:bg-indigo-700 transition-all"
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

          <div className="bg-white shadow-xl rounded-2xl p-8 max-w-2xl w-full">
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
        </div>
      )}
    </>
  );
}

export default App;