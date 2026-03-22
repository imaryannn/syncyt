let socket;
let player;
let currentRoom = null;
let isHost = false;
let isFullscreen = false;
let fullscreenChatOverlay;
let bubbleCounter = 0;

// Initialize socket connection
function initSocket() {
    // Use the current domain for socket connection in production
    const socketUrl = window.location.hostname === 'localhost' 
        ? 'http://localhost:3001' 
        : window.location.origin;
    
    console.log('Connecting to socket server:', socketUrl);
    socket = io(socketUrl);
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
    
    console.log('Player state changed:', {
        state: state,
        stateName: getStateName(state),
        currentTime: currentTime,
        videoId: videoId,
        room: currentRoom
    });
    
    if (state === YT.PlayerState.PLAYING) {
        console.log('Video played - syncing to other users');
        socket.emit('video-action', {
            roomId: currentRoom,
            action: 'play',
            videoId,
            currentTime
        });
    } else if (state === YT.PlayerState.PAUSED) {
        console.log('Video paused - syncing to other users');
        socket.emit('video-action', {
            roomId: currentRoom,
            action: 'pause',
            videoId,
            currentTime
        });
    } else if (state === YT.PlayerState.BUFFERING) {
        console.log('Video buffering');
    } else if (state === YT.PlayerState.ENDED) {
        console.log('Video ended - syncing to other users');
        socket.emit('video-action', {
            roomId: currentRoom,
            action: 'pause',
            videoId,
            currentTime
        });
    }
}

// Helper function to get readable state names
function getStateName(state) {
    const states = {
        [-1]: 'UNSTARTED',
        [0]: 'ENDED',
        [1]: 'PLAYING',
        [2]: 'PAUSED',
        [3]: 'BUFFERING',
        [5]: 'CUED'
    };
    return states[state] || 'UNKNOWN';
}

// Socket events
function setupSocketEvents() {
    socket.on('room-state', (state) => {
        if (state.videoId) {
            loadVideo(state.videoId, state.currentTime, state.isPlaying);
        }
    });

    socket.on('sync-video', (data) => {
        console.log('Received video sync command:', data);
        const { action, videoId, currentTime } = data;
        
        if (!player) {
            console.log('Player not ready, ignoring sync command');
            return;
        }
        
        const currentVideoId = getVideoId();
        console.log('Current video ID:', currentVideoId, 'Sync video ID:', videoId);
        
        // If different video, load the new one
        if (videoId && currentVideoId !== videoId) {
            console.log('Loading different video:', videoId);
            player.loadVideoById(videoId, currentTime);
        } else if (currentTime !== undefined) {
            // Sync to the same position
            const playerTime = Math.floor(player.getCurrentTime());
            const timeDiff = Math.abs(playerTime - currentTime);
            
            console.log('Time sync - Player:', playerTime, 'Target:', currentTime, 'Diff:', timeDiff);
            
            // Only seek if there's a significant difference (more than 2 seconds)
            if (timeDiff > 2) {
                console.log('Seeking to sync time:', currentTime);
                player.seekTo(currentTime, true);
            }
        }
        
        // Apply the action
        if (action === 'play') {
            console.log('Playing video due to sync');
            player.playVideo();
        } else if (action === 'pause') {
            console.log('Pausing video due to sync');
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

    socket.on('user-count-update', (data) => {
        updateUserCount(data.userCount);
    });

    socket.on('chat-message', (data) => {
        console.log('Received chat message:', data);
        addChatMessage(data.message, data.userId);
    });

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        // Test if chat elements exist
        console.log('Chat elements check:', {
            chatMessages: !!chatMessages,
            messageInput: !!messageInput,
            sendMessageBtn: !!sendMessageBtn
        });
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
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
        console.log('Loading video:', videoId);
        loadVideo(videoId);
        youtubeUrl.value = '';
        
        // Notify other users about the new video
        if (currentRoom && socket) {
            socket.emit('video-action', {
                roomId: currentRoom,
                action: 'load',
                videoId,
                currentTime: 0
            });
        }
    } else {
        console.error('Invalid YouTube URL:', url);
        alert('Please enter a valid YouTube URL');
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
    if (message && currentRoom && socket) {
        console.log('Sending message:', message, 'to room:', currentRoom);
        socket.emit('chat-message', {
            roomId: currentRoom,
            message,
            userId: socket.id
        });
        addChatMessage(message, socket.id, true);
        messageInput.value = '';
    } else {
        console.log('Cannot send message:', {
            message: !!message,
            currentRoom: !!currentRoom,
            socket: !!socket
        });
    }
}

function addChatMessage(message, userId, isOwn = false) {
    console.log('Adding chat message:', message, 'from:', userId, 'isOwn:', isOwn);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message';
    messageDiv.innerHTML = `<strong>${isOwn ? 'You' : userId.substring(0, 6)}:</strong> ${message}`;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    console.log('Chat message added to DOM. Total messages:', chatMessages.children.length);
    
    // Show floating bubble if in fullscreen
    if (isFullscreen) {
        showFloatingChatBubble(message, isOwn ? 'You' : userId.substring(0, 6), false);
    }
}

function addSystemMessage(message) {
    console.log('Adding system message:', message);
    
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message system-message';
    messageDiv.textContent = message;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    console.log('System message added to DOM. Total messages:', chatMessages.children.length);
    
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
    
    // Debug: Check if all elements are found
    console.log('DOM elements check:', {
        joinModal: !!joinModal,
        chatMessages: !!chatMessages,
        messageInput: !!messageInput,
        sendMessageBtn: !!sendMessageBtn,
        roomIdDisplay: !!roomIdDisplay,
        userCountDisplay: !!userCountDisplay
    });
});

// Test chat functionality
window.testChat = function() {
    console.log('=== TESTING CHAT FUNCTIONALITY ===');
    
    // Test 1: Check if we're in a room
    console.log('Current room:', currentRoom);
    console.log('Socket connected:', socket && socket.connected);
    
    // Test 2: Try to add a message directly to chat
    if (chatMessages) {
        addChatMessage('Test message from console', 'TestUser', false);
        console.log('✓ Direct message added to chat');
    } else {
        console.error('✗ Chat messages container not found');
    }
    
    // Test 3: Try to send a message through socket
    if (currentRoom && socket) {
        socket.emit('chat-message', {
            roomId: currentRoom,
            message: 'Test socket message',
            userId: 'TestUser'
        });
        console.log('✓ Socket message sent');
    } else {
        console.error('✗ Cannot send socket message - no room or socket');
    }
    
    // Test 4: Check chat input functionality
    if (messageInput) {
        messageInput.value = 'Test input message';
        sendMessage();
        console.log('✓ Input message sent');
    } else {
        console.error('✗ Message input not found');
    }
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