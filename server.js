const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Middleware
app.use(cors());
app.use(express.static(path.join(__dirname, 'frontend', 'dist')));

// Socket.IO server setup
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for simplicity
    methods: ["GET", "POST"],
  }
});

// In-memory data stores for rooms and users
const rooms = new Map();
const users = new Map();

// Socket.IO connection handler with all your existing logic
io.on('connection', (socket) => {
  console.log(`New client connected: ${socket.id}`);

  socket.on('joinRoom', ({ roomId, user }) => {
    try {
      socket.join(roomId);
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { id: roomId, users: new Map(), messages: [], questions: [], polls: [] });
      }
      const room = rooms.get(roomId);
      room.users.set(socket.id, { id: socket.id, ...user, joinedAt: new Date() });
      users.set(socket.id, { ...user, roomId, socketId: socket.id });
      socket.to(roomId).emit('userJoined', { user: { id: socket.id, ...user }, users: Array.from(room.users.values()) });
      socket.emit('roomData', { room: { ...room, users: Array.from(room.users.values()), messages: room.messages.slice(-50) } });
      console.log(`User ${user.name} joined room ${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('sendMessage', ({ roomId, message, user }) => {
    try {
      const room = rooms.get(roomId);
      if (!room) return;
      const newMessage = {
        id: Date.now().toString(),
        text: message.text,
        user: { id: user.id, name: user.name, role: user.role },
        timestamp: new Date()
      };
      room.messages.push(newMessage);
      io.to(roomId).emit('newMessage', newMessage);
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  socket.on('disconnect', () => {
    console.log(`Client disconnected: ${socket.id}`);
    const user = users.get(socket.id);
    if (!user) return;
    const { roomId } = user;
    const room = rooms.get(roomId);
    if (room) {
      room.users.delete(socket.id);
      if (room.users.size > 0) {
        socket.to(roomId).emit('userLeft', { userId: socket.id, users: Array.from(room.users.values()) });
      } else {
        setTimeout(() => {
          if (rooms.has(roomId) && rooms.get(roomId).users.size === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} removed (empty)`);
          }
        }, 60000);
      }
    }
    users.delete(socket.id);
  });

  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    rooms: rooms.size,
    users: users.size
  });
});

// Catch-all handler to serve index.html for client-side routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'dist', 'index.html'));
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
