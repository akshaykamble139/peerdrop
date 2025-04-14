import { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import FileInput from './components/FileInput';
import TransferStatus from './components/TransferStatus';
import ReceivedFiles from './components/ReceivedFiles';
import SentFiles from './components/SentFiles';
import RoomEntry from './components/RoomEntry';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');

  const {
    isTransferring,
    transferProgress,
    downloadProgress,
    showSuccessCheck,
    receivedFiles,
    sentFiles,
    selectedFile,
    setSelectedFile,
    handleSendFile,
    receivingFileName,
    sendingFileName,
    joinRoom
  } = useWebRTC();

  const handleJoin = (id) => {
    if (id.trim()) {
      setRoomId(id);
      joinRoom(
        id,
        false,
        () => {
          toast.error("Room doesn't exist or is inactive.");
        },
        (assignedUsername) => {
          setUsername(assignedUsername);
          setJoined(true);
        }
      );
    }
  };

  const handleCreate = () => {
    const newRoomId = crypto.randomUUID().slice(0, 12);
    setRoomId(newRoomId);
    joinRoom(
      newRoomId,
      true,
      () => { }, // no invalid room callback for create
      (assignedUsername) => {
        setUsername(assignedUsername);
        setJoined(true);
      }
    );
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Room ID copied to clipboard!');
  };

  return (
    <>
      <ToastContainer position="top-center" autoClose={1500} />
      {!joined ?

        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 to-white p-6">
          <RoomEntry
            onJoinRoom={(id) => { handleJoin(id); }}
            onCreateRoom={() => { handleCreate(); }}
          />
        </div>
        :
        <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-white flex items-center justify-center p-6 relative">

          <div
            className="absolute top-4 right-4 bg-indigo-600 text-white px-4 py-2 rounded-2xl shadow-lg text-sm font-mono cursor-pointer hover:bg-indigo-700 transition-all"
            onClick={() => copyToClipboard(roomId)}
            title="Click to copy Room ID"
          >
            <div>👤 {username}</div>
            <div>📎 Room: {roomId}</div>
          </div>

          <div className="bg-white shadow-xl rounded-2xl p-8 max-w-2xl w-full">
            <h1 className="text-3xl font-bold text-indigo-700 mb-2">📁 PeerDrop</h1>
            <p className="text-gray-600 mb-4">Secure peer-to-peer file sharing in your browser.</p>

            <FileInput
              selectedFile={selectedFile}
              setSelectedFile={setSelectedFile}
              onSendFile={handleSendFile}
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
        </div>}
    </>
  );

}

export default App;