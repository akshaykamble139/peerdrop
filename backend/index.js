// backend/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors({ origin: '*' })); 

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // or 'http://localhost:5173'
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 New client connected: ${socket.id}`);

  socket.on('join', (roomId) => {
    socket.join(roomId);
    socket.to(roomId).emit('peer-joined', socket.id);
    console.log(`Client ${socket.id} joined room ${roomId}`);
  });

  socket.on('signal', ({ roomId, data }) => {
    socket.to(roomId).emit('signal', {
      from: socket.id,
      data,
    });
  });

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });
});

server.listen(5000, () => {
  console.log('🚀 Signaling server running on http://localhost:5000');
}); 