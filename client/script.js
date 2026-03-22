let socket;
let player;
let currentRoom = null;
let isHost = false;

// Initialize socket connection
function initSocket() {
    socket = io('http://localhost:3001');
    setupSocketEvents();
}

// YouTube API ready
function onYouTubeIframeAPIReady() {
    player = new YT.Player('player', {
        height: '100%',
        width: '100%',
        playerVars: {
            'origin': window.location.origin,
            'enablejsapi': 1,
            'rel': 0,
            'modestbranding': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady(event) {
    console.log('Player ready');
}

function onPlayerStateChange(event) {
    if (!currentRoom || !player) return;
    
    const state = event.data;
    const currentTime = Math.floor(player.getCurrentTime());
    const videoId = getVideoId();
    
    // Only sync if we have a valid video
    if (!videoId) return;
    
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

// Socket events
function setupSocketEvents() {
    socket.on('room-state', (state) => {
        if (state.videoId) {
            loadVideo(state.videoId, state.currentTime, state.isPlaying);
        }
    });

    socket.on('sync-video', (data) => {
        const { action, videoId, currentTime } = data;
        
        if (videoId && getVideoId() !== videoId) {
            player.loadVideoById(videoId, currentTime);
        } else {
            player.seekTo(currentTime, true);
        }
        
        if (action === 'play') {
            player.playVideo();
        } else if (action === 'pause') {
            player.pauseVideo();
        }
    });

    socket.on('user-joined', (data) => {
        updateUserCount(data.userCount);
        addSystemMessage(`User joined the room`);
    });

    socket.on('user-left', (data) => {
        updateUserCount(data.userCount);
        addSystemMessage(`User left the room`);
    });

    socket.on('chat-message', (data) => {
        addChatMessage(data.message, data.userId);
    });
}

// DOM elements
const joinModal = document.getElementById('join-modal');
const roomInput = document.getElementById('room-input');
const joinRoomBtn = document.getElementById('join-room');
const createRoomBtn = document.getElementById('create-room');
const youtubeUrl = document.getElementById('youtube-url');
const loadVideoBtn = document.getElementById('load-video');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message');
const chatMessages = document.getElementById('chat-messages');
const roomIdDisplay = document.getElementById('room-id');
const userCountDisplay = document.getElementById('user-count');
const themeToggle = document.getElementById('theme-toggle');

// Theme functionality
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcon(newTheme);
}

function updateThemeIcon(theme) {
    themeToggle.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// Event listeners
joinRoomBtn.addEventListener('click', () => {
    const roomId = roomInput.value.trim();
    if (roomId) {
        joinRoom(roomId);
    }
});

createRoomBtn.addEventListener('click', () => {
    const roomId = generateRoomId();
    joinRoom(roomId);
    isHost = true;
});

loadVideoBtn.addEventListener('click', () => {
    const url = youtubeUrl.value.trim();
    const videoId = extractVideoId(url);
    if (videoId) {
        loadVideo(videoId);
        youtubeUrl.value = '';
    }
});

sendMessageBtn.addEventListener('click', sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

themeToggle.addEventListener('click', toggleTheme);

// Functions
function joinRoom(roomId) {
    currentRoom = roomId;
    socket.emit('join-room', roomId);
    joinModal.style.display = 'none';
    roomIdDisplay.textContent = `Room: ${roomId}`;
}

function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function extractVideoId(url) {
    const regex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function getVideoId() {
    if (!player || !player.getVideoData) return null;
    return player.getVideoData().video_id;
}

function loadVideo(videoId, startTime = 0, autoplay = false) {
    if (player && player.loadVideoById && videoId) {
        try {
            player.loadVideoById({
                videoId: videoId,
                startSeconds: startTime
            });
            if (!autoplay) {
                setTimeout(() => {
                    if (player && player.pauseVideo) {
                        player.pauseVideo();
                    }
                }, 1000);
            }
        } catch (error) {
            console.error('Error loading video:', error);
            addSystemMessage('Error loading video. Please try again.');
        }
    }
}

function sendMessage() {
    const message = messageInput.value.trim();
    if (message && currentRoom) {
        socket.emit('chat-message', {
            roomId: currentRoom,
            message,
            userId: socket.id
        });
        addChatMessage(message, socket.id, true);
        messageInput.value = '';
    }
}

function addChatMessage(message, userId, isOwn = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `<strong>${isOwn ? 'You' : userId.substring(0, 6)}:</strong> ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.textContent = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateUserCount(count) {
    userCountDisplay.textContent = `👥 ${count}`;
}

// Initialize
window.addEventListener('load', () => {
    initTheme();
    initSocket();
    joinModal.style.display = 'flex';
});