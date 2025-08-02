import { useState } from 'react';
import { toast } from 'react-toastify';

function RoomEntry({ onJoinRoom, onCreateRoom, isConnecting, connectionError }) {
  const [inputRoomId, setInputRoomId] = useState('');

  const handleJoin = () => {
    const roomId = inputRoomId.trim();
    const roomIdRegex = /^[a-f0-9]{12}$/;
    if (roomId && roomIdRegex.test(roomId)) {
      onJoinRoom(roomId);
    } else {
      toast.error("Invalid Room ID format.");
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && inputRoomId.trim() && !isConnecting) {
      event.preventDefault();
      handleJoin();
    }
  };

  return (
    <div className="bg-white shadow-xl rounded-2xl p-8 max-w-md w-full">
      <h1 className="text-3xl font-bold text-indigo-700 mb-4">PeerDrop 📁</h1>
      <p className="text-gray-600 mb-6">Create or join a room to start sharing files securely.</p>

      <input
        type="text"
        placeholder="Enter Room ID"
        className="border rounded w-full p-2 mb-4"
        value={inputRoomId}
        autoFocus
        onChange={(e) => setInputRoomId(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isConnecting}
      />
      <div className="flex gap-4">
        <button
          onClick={handleJoin}
          disabled={!inputRoomId.trim() || isConnecting}
          className={`w-full px-4 py-2 rounded text-white
            ${(!inputRoomId.trim() || isConnecting)
              ? 'bg-indigo-300 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700'} 
          `}
        >
          {isConnecting ? 'Connecting...' : 'Join Room'}
        </button>
        <button
          onClick={onCreateRoom}
          disabled={isConnecting}
          className={`w-full px-4 py-2 rounded text-white
            ${isConnecting
              ? 'bg-emerald-300 cursor-not-allowed'
              : 'bg-emerald-500 text-white px-4 py-2 rounded hover:bg-emerald-600 w-full'} 
          `}
        >
          {isConnecting ? 'Creating...' : 'Create Room'}
        </button>
      </div>

      {isConnecting && (
        <p className="text-center text-indigo-600 mt-4 animate-pulse">
          Establishing connection... (This may take a moment)
        </p>
      )}
    </div>
  );
}

export default RoomEntry;