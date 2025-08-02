const { generateUniqueUsername } = require('./userName');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const { RateLimiterMemory } = require('rate-limiter-flexible');
const MAX_CONNECTIONS_PER_IP_PER_MINUTE = 10;
const MAX_MESSAGES_PER_SECOND_PER_SOCKET = 20;

const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || '*';
const MAX_USERS_PER_ROOM = parseInt(process.env.MAX_USERS_PER_ROOM, 10) || 5;

const app = express();
app.use(cors({
  origin: CLIENT_ORIGIN,
  methods: ['GET', 'POST'],
  credentials: true
}));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CLIENT_ORIGIN,
    methods: ['GET', 'POST']
  }
});

const connectionLimiter = new RateLimiterMemory({
  points: MAX_CONNECTIONS_PER_IP_PER_MINUTE,
  duration: 60,
});

const messageLimiter = new RateLimiterMemory({
  points: MAX_MESSAGES_PER_SECOND_PER_SOCKET,
  duration: 1,
  keyPrefix: 'msg_limit',
});

io.use(async (socket, next) => {
  const ip = socket.handshake.address;
  try {
    await connectionLimiter.consume(ip);
    next();
  } catch (rejRes) {
    next(new Error('Too many connections from this IP. Please try again later.'));
  }
});

const rooms = new Map();
const activeUsersInRooms = new Map();

io.on('connection', (socket) => {
  socket.use(async (packet, next) => {
    try {
      await messageLimiter.consume(socket.id);
      next();
    } catch (rejRes) {
      next(new Error('Too many messages. Please slow down.'));
    }
  });
  console.log(`🔌 New client connected: ${socket.id}`);

  socket.on('create-room', (roomId) => {
    rooms.set(roomId, new Set([socket.id]));
    const username = generateUniqueUsername(new Set());
    activeUsersInRooms.set(roomId, new Map([[socket.id, username]]));
    socket.join(roomId);
    socket.emit('room-joined', { roomId, username, existingPeers: [] });
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

    const existingPeers = Array.from(roomSockets).map(existingSocketId => ({
      socketId: existingSocketId,
      username: usernamesMap.get(existingSocketId)
    }));

    roomSockets.add(socket.id);
    usernamesMap.set(socket.id, username);

    socket.join(roomId);
    socket.emit('room-joined', { roomId, username, existingPeers });
    socket.to(roomId).emit('peer-joined', { username, socketId: socket.id });

    console.log(`👤 ${username} (${socket.id}) joined room ${roomId}`);
  });

  socket.on('signal', ({ to, from, data }) => {
    const isValidSignal = (signalData) => {
      if (typeof signalData !== 'object' || signalData === null) return false;
      const type = signalData.type;
      if (type === 'offer' || type === 'answer') {
        return typeof signalData.sdp === 'string' && signalData.sdp.length > 0;
      } else if (type === 'candidate') {
        return typeof signalData.candidate === 'object' && signalData.candidate !== null;
      }
      return false;
    };

    if (!isValidSignal(data)) {
      console.warn(`Attempted to send invalid signal data from ${from} to ${to}`);
      return;
    }

    console.log(`🔁 Relaying signal from ${from} to ${to}:`, data);
    io.to(to).emit('signal', { from, data });
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
          socket.to(roomId).emit('peer-left', { username, socketId: socket.id });
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

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on port ${PORT}`);
});
