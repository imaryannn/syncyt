let player = null;
let currentRoom = null;
let isUpdating = false;
let socket = null;

// Initialize theme
const savedTheme = localStorage.getItem('theme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Socket.IO with proper URL
    const socketUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:3001'
        : window.location.origin;
    
    console.log('Connecting to socket server:', socketUrl);
    socket = io(socketUrl, {
        transports: ['polling', 'websocket'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5
    });
    
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
    });
    
    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
    });
    
    socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
    });
    // Theme Toggle
    const themeToggle = document.getElementById('theme-toggle');
    updateThemeButton(savedTheme);
    
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateThemeButton(newTheme);
    });
    
    // Modal handlers
    document.getElementById('join-room').addEventListener('click', () => {
        const roomId = document.getElementById('room-input').value.trim();
        if (roomId) {
            joinRoom(roomId);
        } else {
            addSystemMessage('⚠️ Please enter a room ID');
        }
    });
    
    document.getElementById('create-room').addEventListener('click', () => {
        const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
        joinRoom(roomId);
    });
    
    document.getElementById('room-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const roomId = e.target.value.trim();
            if (roomId) {
                joinRoom(roomId);
            } else {
                const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
                joinRoom(newRoomId);
            }
        }
    });
    
    // Load video
    document.getElementById('load-video').addEventListener('click', () => {
        const url = document.getElementById('youtube-url').value.trim();
        const videoId = getVideoId(url);
        
        if (videoId && player) {
            player.loadVideoById(videoId);
            socket.emit('video-action', {
                roomId: currentRoom,
                action: 'load',
                videoId,
                currentTime: 0
            });
            addSystemMessage('🎉 Video loaded successfully!');
        } else {
            addSystemMessage('⚠️ Invalid YouTube URL');
        }
    });
    
    // Chat functionality
    document.getElementById('send-message').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Socket events
    socket.on('room-state', (state) => {
        if (state.videoId && player) {
            isUpdating = true;
            player.loadVideoById(state.videoId, state.currentTime);
            if (!state.isPlaying) {
                setTimeout(() => player.pauseVideo(), 500);
            }
            isUpdating = false;
        }
    });
    
    socket.on('sync-video', (data) => {
        if (!player) return;
        
        isUpdating = true;
        
        if (data.action === 'load' && data.videoId) {
            player.loadVideoById(data.videoId, data.currentTime);
        } else if (data.action === 'play') {
            player.seekTo(data.currentTime, true);
            player.playVideo();
        } else if (data.action === 'pause') {
            player.seekTo(data.currentTime, true);
            player.pauseVideo();
        }
        
        setTimeout(() => { isUpdating = false; }, 500);
    });
    
    socket.on('user-joined', (data) => {
        document.getElementById('user-count').textContent = `👥 ${data.userCount}`;
        addSystemMessage('Someone joined the room');
    });
    
    socket.on('user-left', (data) => {
        document.getElementById('user-count').textContent = `👥 ${data.userCount}`;
        addSystemMessage('Someone left the room');
    });
});

function updateThemeButton(theme) {
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.textContent = theme === 'light' ? '🌙 DARK' : '☀️ LIGHT';
    }
}

// YouTube API Ready
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            'playsinline': 1,
            'controls': 1,
            'rel': 0
        },
        events: {
            'onStateChange': onPlayerStateChange
        }
    });
}

// Player state change handler
function onPlayerStateChange(event) {
    if (isUpdating) return;

    const state = event.data;
    const currentTime = player.getCurrentTime();
    const videoId = getVideoId();

    if (state === YT.PlayerState.PLAYING) {
        socket.emit('video-action', {
            roomId: currentRoom,
            action: 'play',
            videoId,
            currentTime
        });
    } else if (state === YT.PlayerState.PAUSED) {
        socket.emit('video-action', {
            roomId: currentRoom,
            action: 'pause',
            videoId,
            currentTime
        });
    }
}

// Extract YouTube video ID
function getVideoId(url = null) {
    if (!url && player && player.getVideoData) {
        return player.getVideoData().video_id;
    }
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}



// Join room
function joinRoom(roomId) {
    currentRoom = roomId;
    socket.emit('join-room', roomId);
    document.getElementById('join-modal').style.display = 'none';
    document.getElementById('room-id').textContent = `🏠 ${roomId}`;
    addSystemMessage(`Joined room ${roomId}`);
}







function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message) {
        addMessage(message);
        input.value = '';
    }
}

function addMessage(text, isOwn = true) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = isOwn ? 'message own-message' : 'message';
    const time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    messageEl.innerHTML = `<span class="message-time">${time}</span> ${text}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message system-message';
    messageEl.innerHTML = `✨ ${text}`;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}