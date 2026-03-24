const socket = io('http://localhost:3001');
let player;
let currentRoom = null;
let isUpdating = false;

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

// Modal handlers
document.getElementById('join-room').addEventListener('click', () => {
    const roomId = document.getElementById('room-input').value.trim();
    if (roomId) {
        joinRoom(roomId);
    }
});

document.getElementById('create-room').addEventListener('click', () => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    document.getElementById('room-input').value = roomId;
    joinRoom(roomId);
});

document.getElementById('room-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const roomId = e.target.value.trim();
        if (roomId) joinRoom(roomId);
    }
});

// Join room
function joinRoom(roomId) {
    currentRoom = roomId;
    socket.emit('join-room', roomId);
    document.getElementById('join-modal').style.display = 'none';
    document.getElementById('room-id').textContent = `Room: ${roomId}`;
    addSystemMessage(`Joined room ${roomId}`);
}

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
        addSystemMessage('Video loaded');
    }
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

// Chat functionality
document.getElementById('send-message').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message) {
        addMessage(message);
        input.value = '';
    }
}

function addMessage(text) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    messageEl.textContent = text;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
    const messagesDiv = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message system-message';
    messageEl.textContent = text;
    messagesDiv.appendChild(messageEl);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}