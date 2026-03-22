const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.static(path.join(__dirname, '../client')));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);
    
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        videoState: { videoId: null, currentTime: 0, isPlaying: false }
      });
    }
    
    const room = rooms.get(roomId);
    room.users.add(socket.id);
    
    socket.emit('room-state', room.videoState);
    socket.to(roomId).emit('user-joined', { userId: socket.id, userCount: room.users.size });
    
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  socket.on('video-action', (data) => {
    const { roomId, action, videoId, currentTime } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      room.videoState = { videoId, currentTime, isPlaying: action === 'play' };
      socket.to(roomId).emit('sync-video', { action, videoId, currentTime });
    }
  });

  socket.on('chat-message', (data) => {
    const { roomId, message, userId } = data;
    socket.to(roomId).emit('chat-message', { message, userId });
  });

  socket.on('disconnect', () => {
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', { userId: socket.id, userCount: room.users.size });
        
        if (room.users.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});