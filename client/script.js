let socket;
let player;
let currentRoom = null;
let isHost = false;
let isFullscreen = false;
let fullscreenChatOverlay;
let bubbleCounter = 0;

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
    setupFullscreenDetection();
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
    
    // Show floating bubble if in fullscreen
    if (isFullscreen) {
        showFloatingChatBubble(message, isOwn ? 'You' : userId.substring(0, 6), false);
    }
}

function addSystemMessage(message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.textContent = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Show floating bubble if in fullscreen
    if (isFullscreen) {
        showFloatingChatBubble(message, '', true);
    }
}

function updateUserCount(count) {
    userCountDisplay.textContent = `👥 ${count}`;
}

// Fullscreen chat functionality
function setupFullscreenDetection() {
    fullscreenChatOverlay = document.getElementById('fullscreen-chat');
    
    // Listen for fullscreen changes
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
}

function handleFullscreenChange() {
    const fullscreenElement = document.fullscreenElement || 
                             document.webkitFullscreenElement || 
                             document.mozFullScreenElement || 
                             document.msFullscreenElement;
    
    isFullscreen = !!fullscreenElement;
    console.log('Fullscreen state changed:', isFullscreen);
    console.log('Fullscreen element:', fullscreenElement);
    
    if (isFullscreen) {
        console.log('Fullscreen chat overlay activated');
        
        // Since the fullscreen element is an iframe, we need to create overlay outside it
        // but positioned to cover the same area
        if (!document.querySelector('.syncyt-chat-overlay')) {
            const overlay = document.createElement('div');
            overlay.className = 'syncyt-chat-overlay';
            overlay.style.cssText = `
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                pointer-events: none !important;
                z-index: 2147483647 !important;
                background: transparent !important;
            `;
            
            // Add to body, not to iframe
            document.body.appendChild(overlay);
            fullscreenChatOverlay = overlay;
            console.log('Created overlay covering fullscreen area');
        }
    } else {
        console.log('Fullscreen chat overlay deactivated and bubbles cleared');
        // Clean up when exiting fullscreen
        const existingBubbles = document.querySelectorAll('.chat-bubble');
        existingBubbles.forEach(bubble => {
            if (bubble.parentNode) {
                bubble.parentNode.removeChild(bubble);
            }
        });
        
        // Remove our overlay
        const overlay = document.querySelector('.syncyt-chat-overlay');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        fullscreenChatOverlay = null;
    }
}

function showFloatingChatBubble(message, username, isSystem = false) {
    if (!isFullscreen) {
        console.log('Not in fullscreen mode');
        return;
    }
    
    console.log('Creating floating chat bubble:', message, username);
    
    // Since visual elements aren't working, let's try browser notifications
    // or use the document title to show messages
    
    // Method 1: Change document title (visible in browser tab)
    const originalTitle = document.title;
    document.title = `💬 ${username}: ${message}`;
    
    // Method 2: Try browser notification (if permitted)
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`${username} says:`, {
            body: message,
            icon: '/favicon.ico',
            tag: 'chat-message'
        });
    } else if ('Notification' in window && Notification.permission !== 'denied') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                new Notification(`${username} says:`, {
                    body: message,
                    icon: '/favicon.ico',
                    tag: 'chat-message'
                });
            }
        });
    }
    
    // Method 3: Console styling (visible in dev tools)
    console.log(
        `%c💬 CHAT MESSAGE %c${username}: ${message}`,
        'background: #ff6b35; color: white; padding: 5px 10px; border-radius: 3px; font-weight: bold;',
        'background: #ffd700; color: black; padding: 5px 10px; border-radius: 3px; margin-left: 5px;'
    );
    
    // Method 4: Try to overlay on the iframe itself (last resort)
    const iframe = document.getElementById('player');
    if (iframe && iframe.parentNode) {
        const overlay = document.createElement('div');
        overlay.innerHTML = `${username}: ${message}`;
        overlay.style.cssText = `
            position: fixed !important;
            top: 50px !important;
            right: 50px !important;
            background: rgba(255, 107, 53, 0.95) !important;
            color: white !important;
            padding: 15px 20px !important;
            border-radius: 25px !important;
            font-size: 18px !important;
            font-weight: bold !important;
            z-index: 2147483647 !important;
            pointer-events: none !important;
            font-family: Arial, sans-serif !important;
            border: 3px solid #FFD700 !important;
            box-shadow: 0 4px 15px rgba(0, 0, 0, 0.8) !important;
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
        `;
        
        // Add to body instead of iframe parent
        document.body.appendChild(overlay);
        
        console.log('Added overlay to body with fixed positioning');
        console.log('Overlay rect:', overlay.getBoundingClientRect());
        
        // Make it blink to ensure visibility
        let blinkCount = 0;
        const blinkInterval = setInterval(() => {
            overlay.style.background = overlay.style.background.includes('255, 107, 53') 
                ? 'rgba(255, 0, 0, 0.95) !important' 
                : 'rgba(255, 107, 53, 0.95) !important';
            blinkCount++;
            if (blinkCount >= 6) {
                clearInterval(blinkInterval);
                overlay.style.background = 'rgba(255, 107, 53, 0.95) !important';
            }
        }, 300);
        
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
                console.log('Overlay removed after 2 seconds');
            }
        }, 2000);
    }
    
    // Restore title after 2 seconds
    setTimeout(() => {
        document.title = originalTitle;
    }, 2000);
}

// Initialize
window.addEventListener('load', () => {
    initTheme();
    initSocket();
    joinModal.style.display = 'flex';
});

// Ultimate test - try to modify existing elements
window.testExistingElements = function() {
    console.log('Testing modification of existing elements...');
    
    // Try to modify the body background
    document.body.style.background = 'red !important';
    document.body.style.border = '20px solid blue !important';
    
    // Try to modify the container
    const container = document.querySelector('.container');
    if (container) {
        container.style.background = 'yellow !important';
        container.style.border = '10px solid green !important';
        console.log('Modified container');
    }
    
    // Try to create element outside fullscreen
    const testDiv = document.createElement('div');
    testDiv.innerHTML = 'OUTSIDE FULLSCREEN TEST';
    testDiv.style.cssText = `
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        background: purple !important;
        color: white !important;
        padding: 20px !important;
        z-index: 999999 !important;
        font-size: 20px !important;
    `;
    document.body.appendChild(testDiv);
    
    setTimeout(() => {
        document.body.style.background = '';
        document.body.style.border = '';
        if (container) {
            container.style.background = '';
            container.style.border = '';
        }
        if (testDiv.parentNode) {
            testDiv.parentNode.removeChild(testDiv);
        }
    }, 3000);
};

// Test if we can see elements when NOT in fullscreen
window.testNonFullscreen = function() {
    console.log('Testing bubble when NOT in fullscreen...');
    
    const bubble = document.createElement('div');
    bubble.innerHTML = 'NON-FULLSCREEN TEST BUBBLE';
    bubble.style.cssText = `
        position: fixed !important;
        top: 100px !important;
        left: 100px !important;
        background: #FF0000 !important;
        color: #FFFFFF !important;
        padding: 30px !important;
        font-size: 24px !important;
        border: 5px solid #00FF00 !important;
        z-index: 999999 !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `;
    
    document.body.appendChild(bubble);
    console.log('Non-fullscreen bubble added');
    
    setTimeout(() => {
        if (bubble.parentNode) {
            bubble.parentNode.removeChild(bubble);
        }
    }, 3000);
};