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
    
    if (isFullscreen) {
        console.log('Entered fullscreen mode - chat will use audio/title notifications');
        // Clear any existing messages queue
        window.fullscreenMessages = [];
    } else {
        console.log('Exited fullscreen mode - showing missed messages');
        
        // Show any messages that were received during fullscreen
        if (window.fullscreenMessages && window.fullscreenMessages.length > 0) {
            console.log(`Showing ${window.fullscreenMessages.length} missed messages`);
            
            window.fullscreenMessages.forEach((msg, index) => {
                setTimeout(() => {
                    showNormalChatBubble(msg.message, msg.username, msg.isSystem);
                }, index * 500); // Stagger the messages
            });
            
            // Clear the messages after showing them
            window.fullscreenMessages = [];
        }
        
        // Clean up any existing overlays
        const existingBubbles = document.querySelectorAll('.chat-bubble');
        existingBubbles.forEach(bubble => {
            if (bubble.parentNode) {
                bubble.parentNode.removeChild(bubble);
            }
        });
        
        // Remove our overlay if it exists
        const overlay = document.querySelector('.syncyt-chat-overlay');
        if (overlay && overlay.parentNode) {
            overlay.parentNode.removeChild(overlay);
        }
        fullscreenChatOverlay = null;
    }
}

function showFloatingChatBubble(message, username, isSystem = false) {
    console.log('Chat message received:', username, message);
    
    if (isFullscreen) {
        // During fullscreen: Use alternative notifications
        console.log('In fullscreen mode - using alternative notifications');
        
        // Method 1: Audio notification
        try {
            const audio = new Audio();
            audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
            audio.volume = 0.3;
            audio.play().catch(e => console.log('Audio play failed:', e));
        } catch (e) {
            console.log('Audio notification failed:', e);
        }
        
        // Method 2: Browser tab title notification
        const originalTitle = document.title;
        document.title = `💬 ${username}: ${message}`;
        setTimeout(() => {
            document.title = originalTitle;
        }, 3000);
        
        // Method 3: Console notification with styling
        console.log(
            `%c💬 FULLSCREEN CHAT %c${username}: ${message}`,
            'background: #ff6b35; color: white; padding: 8px 12px; border-radius: 4px; font-weight: bold; font-size: 14px;',
            'background: #ffd700; color: black; padding: 8px 12px; border-radius: 4px; margin-left: 5px; font-size: 14px;'
        );
        
        // Method 4: Store message for display when exiting fullscreen
        if (!window.fullscreenMessages) {
            window.fullscreenMessages = [];
        }
        window.fullscreenMessages.push({
            username,
            message,
            timestamp: Date.now(),
            isSystem
        });
        
    } else {
        // Not in fullscreen: Show normal floating bubble
        console.log('Not in fullscreen - showing normal bubble');
        showNormalChatBubble(message, username, isSystem);
    }
}

// Function to show normal chat bubbles when not in fullscreen
function showNormalChatBubble(message, username, isSystem = false) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${isSystem ? 'system' : ''}`;
    
    if (isSystem) {
        bubble.textContent = message;
    } else {
        bubble.innerHTML = `<span class="username">${username}:</span>${message}`;
    }
    
    // Position bubble on the right side of the screen
    const topPosition = Math.random() * 50 + 25;
    
    bubble.style.cssText = `
        position: fixed !important;
        top: ${topPosition}vh !important;
        right: 40px !important;
        z-index: 999999 !important;
        background: rgba(255, 215, 0, 0.95) !important;
        color: #000000 !important;
        padding: 15px 20px !important;
        border-radius: 25px !important;
        font-size: 16px !important;
        font-weight: 600 !important;
        max-width: 350px !important;
        border: 3px solid #FF6B35 !important;
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3) !important;
        pointer-events: none !important;
        font-family: Arial, sans-serif !important;
        display: block !important;
        visibility: visible !important;
        opacity: 0 !important;
        transform: translateX(100px) !important;
        transition: all 0.4s ease-out !important;
    `;
    
    document.body.appendChild(bubble);
    
    // Animate in
    setTimeout(() => {
        bubble.style.opacity = '1 !important';
        bubble.style.transform = 'translateX(0) !important';
    }, 50);
    
    // Remove after 3 seconds
    setTimeout(() => {
        bubble.style.opacity = '0 !important';
        bubble.style.transform = 'translateX(100px) !important';
    }, 3000);
    
    setTimeout(() => {
        if (bubble.parentNode) {
            bubble.parentNode.removeChild(bubble);
        }
    }, 3500);
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

// Ultimate basic test - try the simplest possible approach
window.testBasicFunction = function() {
    console.log('=== BASIC FUNCTION TEST ===');
    
    // Test 1: Can we modify the page at all?
    try {
        document.body.style.backgroundColor = 'red';
        console.log('✓ Body background changed to red');
        
        setTimeout(() => {
            document.body.style.backgroundColor = '';
            console.log('✓ Body background reset');
        }, 2000);
    } catch (e) {
        console.error('✗ Failed to change body background:', e);
    }
    
    // Test 2: Can we create and show an alert?
    try {
        alert('TEST ALERT - Can you see this?');
        console.log('✓ Alert shown');
    } catch (e) {
        console.error('✗ Failed to show alert:', e);
    }
    
    // Test 3: Can we create a simple element?
    try {
        const testDiv = document.createElement('div');
        testDiv.innerHTML = 'BASIC TEST DIV';
        testDiv.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            background: blue;
            color: white;
            padding: 20px;
            z-index: 999999;
            font-size: 20px;
        `;
        document.body.appendChild(testDiv);
        console.log('✓ Test div created and added');
        
        setTimeout(() => {
            if (testDiv.parentNode) {
                testDiv.parentNode.removeChild(testDiv);
                console.log('✓ Test div removed');
            }
        }, 3000);
    } catch (e) {
        console.error('✗ Failed to create test div:', e);
    }
    
    // Test 4: Check if our chat functions exist
    console.log('Chat functions check:');
    console.log('- showFloatingChatBubble exists:', typeof showFloatingChatBubble);
    console.log('- addChatMessage exists:', typeof addChatMessage);
    console.log('- isFullscreen value:', isFullscreen);
    console.log('- currentRoom value:', currentRoom);
};

// Test if messages are actually being sent
window.testChatMessage = function() {
    console.log('=== TESTING CHAT MESSAGE MANUALLY ===');
    
    // Bypass all checks and force a message
    const testMessage = 'MANUAL TEST MESSAGE';
    const testUser = 'TestUser';
    
    console.log('Calling showFloatingChatBubble directly...');
    showFloatingChatBubble(testMessage, testUser, false);
    
    console.log('Also calling addChatMessage...');
    addChatMessage(testMessage, testUser, true);
};