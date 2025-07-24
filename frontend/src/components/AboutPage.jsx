// src/components/AboutPage.jsx
import React from 'react';

function AboutPage() {
    return (
        <div className="bg-white shadow-xl rounded-2xl p-8 max-w-3xl w-full my-8">
            <h2 className="text-3xl font-bold text-indigo-700 mb-6 text-center">About PeerDrop</h2>
            <div className="text-gray-700 space-y-6 text-lg leading-relaxed">
                <p>
                    <strong>PeerDrop</strong> is a secure, self-hosted web application designed for private, peer-to-peer file sharing directly between browsers. Leveraging the power of <strong>WebRTC</strong>, files are never uploaded to a central server; instead, they are transferred in real-time, directly from one user's browser to another's. This ensures maximum privacy and efficiency.
                </p>
                <p>
                    Think of PeerDrop as a robust, open-source alternative to services like Snapdrop or Wormhole, but with an emphasis on complete privacy and real-time direct connections. It's an ideal solution for quickly and securely sharing files within a local network or with trusted individuals over the internet without intermediaries.
                </p>
                <h3 className="text-2xl font-semibold text-indigo-600 mt-8 mb-4">Key Features:</h3>
                <ul className="list-disc list-inside space-y-3">
                    <li><strong>P2P File Transfers:</strong> Files move directly between browsers, eliminating server-side storage risks.</li>
                    <li><strong>Multi-File Support:</strong> Effortlessly send multiple files in a single session.</li>
                    <li><strong>Real-time Progress Tracking:</strong> Monitor transfer progress, speed, and file size indicators for each transfer.</li>
                    <li><strong>Secure Sessions:</strong> Join rooms securely using unique Room IDs.</li>
                    <li><strong>No Server Storage:</strong> Your files remain private and are never stored on any server.</li>
                    <li><strong>Self-Hosted & Private:</strong> Full control over your data and environment.</li>
                </ul>
                <h3 className="text-2xl font-semibold text-indigo-600 mt-8 mb-4">How It Works:</h3>
                <p>
                    At its core, PeerDrop uses <strong>WebRTC (Web Real-Time Communication)</strong> for direct browser-to-browser data transfer. A lightweight <strong>Node.js</strong> backend with <strong>Socket.IO</strong> acts as a signaling server, facilitating the initial connection setup (like exchanging network information and connection offers/answers). Once the direct peer-to-peer connection is established, the signaling server steps aside, and files are streamed in chunks over a secure <strong>WebRTC DataChannel</strong>.
                </p>
                <p>
                    This architecture ensures that the server only helps in setting up the connection, but never sees or stores your actual file data, making PeerDrop a truly private file-sharing solution.
                </p>
            </div>
        </div>
    );
}

export default AboutPage;