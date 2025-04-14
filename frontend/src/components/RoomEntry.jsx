import { useState } from 'react';

function RoomEntry({ onJoinRoom, onCreateRoom }) {
  const [inputRoomId, setInputRoomId] = useState('');

  const handleJoin = () => {
    if (inputRoomId.trim()) {
      onJoinRoom(inputRoomId.trim());
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleJoin();
    }
  };

  return (
    <div className="bg-white shadow-xl rounded-2xl p-8 max-w-md w-full">
      <h1 className="text-3xl font-bold text-indigo-700 mb-4">📁 PeerDrop</h1>
      <p className="text-gray-600 mb-6">Create or join a room to start sharing files securely.</p>

      <input
        type="text"
        placeholder="Enter Room ID"
        className="border rounded w-full p-2 mb-4"
        value={inputRoomId}
        onChange={(e) => setInputRoomId(e.target.value)}
        onKeyDown={handleKeyDown} 
      />
      <div className="flex gap-4">
        <button
          onClick={handleJoin}
          disabled={!inputRoomId.trim()}
          className={`w-full px-4 py-2 rounded text-white 
            ${!inputRoomId.trim()
              ? 'bg-indigo-300 cursor-not-allowed'
              : 'bg-indigo-600 hover:bg-indigo-700'}
          `}
          // className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 w-full"
        >
          Join Room
        </button>
        <button
          onClick={onCreateRoom}
          className="bg-emerald-500 text-white px-4 py-2 rounded hover:bg-emerald-600 w-full"
        >
          Create Room
        </button>
      </div>
    </div>
  );
}

export default RoomEntry;
