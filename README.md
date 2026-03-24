# 🎬 Syncyt - Watch Together

A real-time video synchronization platform that allows users to watch YouTube videos together in synchronized rooms with live chat.

## Features

- 🎥 **Synchronized Video Playback** - Watch YouTube videos in perfect sync with friends
- 💬 **Real-time Chat** - Chat with other viewers in the room
- 🏠 **Room System** - Create or join rooms with unique IDs
- 📱 **Responsive Design** - Works on desktop and mobile devices
- 🎨 **Modern UI** - Beautiful gradient design with glassmorphism effects

## Quick Start

### Prerequisites
- Node.js (v14 or higher)
- Python 3 (for client development server)

### Installation

1. **Install all dependencies:**
   ```bash
   npm run install-all
   ```

2. **Start the development servers:**
   ```bash
   npm run dev
   ```

   This will start:
   - Server on `http://localhost:3001`
   - Client on `http://localhost:3000`

### Manual Setup

If you prefer to run servers separately:

1. **Start the server:**
   ```bash
   cd server
   npm install
   npm run dev
   ```

2. **Start the client (in a new terminal):**
   ```bash
   cd client
   python3 -m http.server 3000
   ```

## Usage

1. Open `http://localhost:3000` in your browser
2. Create a new room or join an existing one with a room ID
3. Paste a YouTube URL and click "Load Video"
4. Share the room ID with friends to watch together
5. Use the chat to communicate while watching

## How It Works

- **Socket.io** handles real-time communication between users
- **YouTube IFrame API** manages video playback and synchronization
- **Express.js** serves the application and handles room management
- **Responsive CSS** ensures great experience across devices

## Project Structure

```
syncyt/
├── client/           # Frontend files
│   ├── index.html   # Main HTML file
│   ├── style.css    # Styling and responsive design
│   ├── script.js    # Client-side JavaScript
│   └── package.json # Client dependencies
├── server/          # Backend files
│   ├── server.js    # Express + Socket.io server
│   └── package.json # Server dependencies
└── package.json     # Root package with scripts
```

## Technologies Used

- **Frontend:** HTML5, CSS3, JavaScript, YouTube IFrame API
- **Backend:** Node.js, Express.js, Socket.io
- **Real-time:** WebSocket connections via Socket.io
- **Styling:** CSS Grid, Flexbox, Glassmorphism effects

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details
