import { copyToClipboard } from "../utils/helper";

const RoomInfo = ({ roomId, username, activePeers, isOnMobile }) => {
    const containerClasses = isOnMobile
        ? "bg-white rounded-2xl shadow-lg border border-indigo-200 overflow-hidden"
        : "fixed top-24 right-6 z-50 bg-white rounded-2xl shadow-lg border border-indigo-200 overflow-hidden min-w-64";

    const peersList = activePeers.length > 0 ? (
        <div className="space-y-2 max-h-32 overflow-y-auto">
            {activePeers.map(peer => (
                <div key={peer.socketId} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <span className="text-sm text-gray-700 font-medium">{peer.username}</span>
                    <div className="flex items-center space-x-1">
                        <div className={`w-2 h-2 rounded-full ${peer.dataChannelOpen ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                        <span className="text-xs text-gray-500">
                            {peer.dataChannelOpen ? 'Ready' : 'Connecting'}
                        </span>
                    </div>
                </div>
            ))}
        </div>
    ) : (
        <div className="text-center py-4">
            <div className="text-gray-400 text-sm">Waiting for peers to join...</div>
        </div>
    );

    return (
        <div className={containerClasses}>
            <div className="bg-indigo-600 text-white px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-sm font-semibold">Room Active</span>
                    </div>
                    <button
                        onClick={() => copyToClipboard(roomId)}
                        className="text-xs bg-indigo-500 hover:bg-indigo-700 px-2 py-1 rounded transition-colors"
                        title="Copy Room ID"
                    >
                        Copy ID
                    </button>
                </div>
            </div>
            <div className="px-4 py-3 space-y-3">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">Username</span>
                    <span className="text-sm font-medium text-gray-800">{username}</span>
                </div>
                <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500 uppercase tracking-wide">Room ID</span>
                    <span className="text-sm font-mono text-gray-800">{roomId}</span>
                </div>
                <div className="border-t border-gray-200 pt-3">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs text-gray-500 uppercase tracking-wide">Connected Peers</span>
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-1 rounded-full font-medium">
                            {activePeers.length}
                        </span>
                    </div>
                    {peersList}
                </div>
            </div>
        </div>
    );
}

export default RoomInfo;