const { generateUniqueUsername } = require('./userName');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' }));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const MAX_USERS_PER_ROOM = 5; // You can adjust this limit

// Track active rooms
const rooms = new Map(); // key: roomId, value: Set of socket IDs
const activeUsersInRooms = new Map(); // key: roomId, value: Map of socket.id -> username

io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  socket.on('create-room', (roomId) => {
    rooms.set(roomId, new Set([socket.id]));
    const username = generateUniqueUsername(new Set()); // First user, no taken names
    activeUsersInRooms.set(roomId, new Map([[socket.id, username]]));
    socket.join(roomId);
    socket.emit('room-joined', { roomId, username });
    console.log(`✅ Room created: ${roomId} by ${username}`);
  });

  socket.on('join', (roomId) => {
    if (!rooms.has(roomId)) {
      socket.emit('invalid-room');
      console.log(`❌ Join attempt to invalid room: ${roomId}`);
      return;
    }

    const roomSockets = rooms.get(roomId);
    const usernamesMap = activeUsersInRooms.get(roomId);

    if (roomSockets.size >= MAX_USERS_PER_ROOM) {
      socket.emit('room-full');
      console.log(`🚫 Room full: ${roomId}`);
      return;
    }

    const takenUsernames = new Set(Array.from(usernamesMap.values()));
    const username = generateUniqueUsername(takenUsernames);

    roomSockets.add(socket.id);
    usernamesMap.set(socket.id, username);

    socket.join(roomId);
    socket.emit('room-joined', { roomId, username });
    socket.to(roomId).emit('peer-joined', { username, socketId: socket.id }); // Emit to others with socketId

    console.log(`👤 ${username} (${socket.id}) joined room ${roomId}`);
  });

  socket.on('signal', ({ to, from, data }) => { // Changed to expect 'to'
    console.log(`🔁 Relaying signal from ${from} to ${to}:`, data);
    io.to(to).emit('signal', { from, data }); // Emit directly to the 'to' socket
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);

    for (const [roomId, socketSet] of rooms.entries()) {
      if (socketSet.has(socket.id)) {
        socketSet.delete(socket.id);

        const usernamesMap = activeUsersInRooms.get(roomId);
        if (usernamesMap) {
          const username = usernamesMap.get(socket.id);
          usernamesMap.delete(socket.id);
          socket.to(roomId).emit('peer-left', { username });
          console.log(`👋 ${username} left room ${roomId}`);
        }

        if (socketSet.size === 0) {
          rooms.delete(roomId);
          activeUsersInRooms.delete(roomId);
          console.log(`🗑️ Room deleted: ${roomId}`);
        }
        break;
      }
    }
  });
});

server.listen(5000, () => {
  console.log('🚀 Signaling server running on http://localhost:5000');
});
