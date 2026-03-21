const { spawn } = require('child_process');
const path = require('path');

console.log("🚀 Starting FlowDrop Ecosystem...");

// 1. Start Node Server
const server = spawn('node', ['server.js'], { 
    cwd: path.join(__dirname, 'desktop-server'), 
    stdio: 'inherit' 
});

// 2. Start Expo Web
// We use a small delay to ensure the server is up
setTimeout(() => {
    console.log("🔥 Starting React Native Web...");
    const expo = spawn('npx', ['expo', 'start', '--web'], { 
        cwd: __dirname, 
        stdio: 'inherit',
        shell: true 
    });
}, 3000);
