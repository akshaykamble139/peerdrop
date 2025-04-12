import { useWebRTC } from './hooks/useWebRTC';
import FileInput from './components/FileInput';
import TransferStatus from './components/TransferStatus';
import ReceivedFiles from './components/ReceivedFiles';
import SentFiles from './components/SentFiles';

function App() {
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
    sendingFileName
  } = useWebRTC();

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-white flex items-center justify-center p-6">
      {/* Increase max-width from max-w-xl to max-w-2xl */}
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
    </div>
  );

}

export default App;