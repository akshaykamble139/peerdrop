# PeerDrop - File Transfer App

A self-hosted, private web app for fast peer-to-peer file sharing using WebRTC. Files are transferred directly between browsers with no server storage.

## Features

- Create or join rooms
- Transfer files directly between peers (browser to browser)
- Multiple file support
- Real-time transfer progress
- "Sent Files" and "Received Files" tracking
- Optional room passcode
- QR code and shortcode sharing

## Tech Stack

- **Frontend**: React, TailwindCSS
- **Backend**: Node.js, Express (for signaling only)
- **Realtime Communication**: WebRTC + WebSocket (Signaling)
