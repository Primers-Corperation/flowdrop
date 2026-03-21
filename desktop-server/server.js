const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const ip = require('ip');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = 3000;

// Ensure uploads directory exists
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});
const upload = multer({ storage: storage });

// Serve static files from the public and uploads directories
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// File upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  // File metadata to broadcast
  const fileData = {
    filename: req.file.originalname,
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    type: req.file.mimetype
  };

  res.json(fileData);
});

// Store connected users. Key: socket ID, Value: User Profile
const connectedUsers = new Map();

// Helper to broadcast current online users
function broadcastOnlineUsers() {
  const usersArray = Array.from(connectedUsers.values());
  io.emit('online users', usersArray);
}

// Socket.io for real-time chat
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);
  
  // Default temp profile
  connectedUsers.set(socket.id, {
    id: socket.id,
    name: 'Anonymous',
    isOnline: true
  });

  // Client updates their profile (Name, Avatar)
  socket.on('set profile', (profileData) => {
    connectedUsers.set(socket.id, {
      ...connectedUsers.get(socket.id),
      name: profileData.name,
      // Allow passing a persistent ID from client if they reconnect
      userId: profileData.userId || socket.id
    });
    broadcastOnlineUsers();
  });

  // Client requests initial list of online users
  socket.on('get online users', () => {
    socket.emit('online users', Array.from(connectedUsers.values()));
  });

  // Private Message logic
  socket.on('private message', (data) => {
    // data: { to: 'socketID' OR 'userId', text: '...', isByUserId: boolean }
    const { to, isByUserId } = data;
    
    if (isByUserId) {
        // Find socket for this persistent USER ID
        for (let [socketId, user] of connectedUsers.entries()) {
            if (user.userId === to) {
                io.to(socketId).emit('private message', data);
                break;
            }
        }
    } else {
        io.to(to).emit('private message', data);
    }
  });

  // Private File Share logic
  socket.on('private file', (data) => {
    const { to } = data;
    io.to(to).emit('private file', data);
  });

  // Friend Request System
  socket.on('friend request', (data) => {
    // data: { to: 'socketId', fromId: 'socketId', fromName: 'name' }
    io.to(data.to).emit('friend request', data);
  });

  socket.on('accept friend', (data) => {
    io.to(data.to).emit('friend accepted', data);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    connectedUsers.delete(socket.id);
    broadcastOnlineUsers();
  });
});

// Start the server
server.listen(PORT, '0.0.0.0', () => {
    const localIp = ip.address();
    console.log(`\n======================================================`);
    console.log(`🚀 Chat server running!`);
    console.log(`📡 To join, connect to the same WiFi/Hotspot and open:`);
    console.log(`   http://${localIp}:${PORT}`);
    console.log(`======================================================\n`);
});
