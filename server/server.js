const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const clientPath = path.resolve(__dirname, '../client');
console.log('Serving static files from:', clientPath);
app.use(express.static(clientPath));

// Add a health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.resolve(__dirname, '../client/index.html'));
});

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
    io.to(roomId).emit('user-count-update', { userCount: room.users.size });
    
    console.log(`User ${socket.id} joined room ${roomId}. Room now has ${room.users.size} users.`);
  });

  socket.on('video-action', (data) => {
    const { roomId, action, videoId, currentTime } = data;
    const room = rooms.get(roomId);
    
    if (room) {
      // Update room state
      room.videoState = { 
        videoId, 
        currentTime, 
        isPlaying: action === 'play' 
      };
      
      // Broadcast to all other users in the room
      socket.to(roomId).emit('sync-video', { action, videoId, currentTime });
      
      console.log(`Video ${action} in room ${roomId}:`, {
        videoId,
        currentTime,
        isPlaying: action === 'play',
        usersInRoom: room.users.size
      });
    } else {
      console.log(`Room ${roomId} not found for video action`);
    }
  });

  socket.on('chat-message', (data) => {
    const { roomId, message, userId } = data;
    console.log(`Chat message in room ${roomId} from ${userId}:`, message);
    socket.to(roomId).emit('chat-message', { message, userId });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', { userId: socket.id, userCount: room.users.size });
        io.to(roomId).emit('user-count-update', { userCount: room.users.size });
        
        console.log(`User ${socket.id} left room ${roomId}. Room now has ${room.users.size} users.`);
        
        if (room.users.size === 0) {
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted (empty)`);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Client directory: ${clientPath}`);
});