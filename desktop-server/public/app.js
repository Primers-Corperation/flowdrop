const socket = io();

// UI Elements: Views & Navigation
const homeView = document.getElementById('home-view');
const chatView = document.getElementById('chat-view');
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const backBtn = document.getElementById('back-btn');

// UI Elements: Modals
const profileBtn = document.getElementById('profile-btn');
const profileModal = document.getElementById('profile-modal');
const usernameInput = document.getElementById('username-input');
const saveProfileBtn = document.getElementById('save-profile-btn');
const myAvatar = document.getElementById('my-avatar');
const closeBtns = document.querySelectorAll('.close-modal');

// UI Elements: Upload
const attachBtn = document.getElementById('attach-btn');
const uploadModal = document.getElementById('upload-modal');
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const filePreview = document.getElementById('file-preview');
const previewFilename = document.getElementById('preview-filename');
const removeFileBtn = document.getElementById('remove-file-btn');
const uploadSubmitBtn = document.getElementById('upload-submit-btn');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const dropArea = document.getElementById('drop-area');

// UI Elements: Lists & Chat
const networkList = document.getElementById('network-list');
const onlineCount = document.getElementById('online-count');
const chatsTab = document.getElementById('chats-tab');
const friendsList = document.getElementById('friends-list');

const privateChatForm = document.getElementById('private-chat-form');
const privateMessageInput = document.getElementById('private-message-input');
const privateMessagesContainer = document.getElementById('private-messages-container');
const activeChatAvatar = document.getElementById('active-chat-avatar');
const activeChatName = document.getElementById('active-chat-name');
const activeChatStatus = document.getElementById('active-chat-status');

// Toast
const toast = document.getElementById('toast');

// Application State
let myProfile = {
    userId: localStorage.getItem('userId') || 'user_' + Date.now().toString(36) + Math.random().toString(36).substr(2),
    name: localStorage.getItem('userName') || 'Anonymous'
};
// Save initial generated ID
if (!localStorage.getItem('userId')) localStorage.setItem('userId', myProfile.userId);

let activeChatUserId = null;
let networkUsersCount = 0;
let networkUsersMap = new Map(); // socket.id -> { ...user }

// ==========================================
// IndexedDB Database Wrapper for Local Storage
// ==========================================
const dbName = "LocalChatDB";
const dbVersion = 1;
let db;

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName, dbVersion);
        request.onerror = (e) => reject("DB Error");
        request.onsuccess = (e) => {
            db = e.target.result;
            resolve();
        };
        request.onupgradeneeded = (e) => {
            const tempDb = e.target.result;
            // Store friends/contacts: { id, name, lastSeen }
            if(!tempDb.objectStoreNames.contains('contacts')) {
                tempDb.createObjectStore('contacts', { keyPath: 'id' });
            }
            // Store messages: { id, fromId, toId, text, timestamp, file }
            if(!tempDb.objectStoreNames.contains('messages')) {
                const msgStore = tempDb.createObjectStore('messages', { keyPath: 'id' });
                msgStore.createIndex('conversation', 'conversationId', { unique: false }); // conversationId = "userA_userB" (alphabetically sorted)
            }
        };
    });
}

function getConversationId(id1, id2) {
    return [id1, id2].sort().join('_');
}

// Database helper functions
const DB = {
    saveMessage: (msg) => {
        return new Promise((resolve) => {
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            store.put(msg);
            tx.oncomplete = () => resolve();
        });
    },
    getMessages: (contactId) => {
        return new Promise((resolve) => {
            const tx = db.transaction('messages', 'readonly');
            const store = tx.objectStore('messages');
            const index = store.index('conversation');
            const convId = getConversationId(myProfile.userId, contactId);
            const request = index.getAll(convId);
            request.onsuccess = () => resolve(request.result || []);
        });
    },
    saveContact: (contact) => {
        return new Promise((resolve) => {
            const tx = db.transaction('contacts', 'readwrite');
            tx.objectStore('contacts').put(contact);
            tx.oncomplete = () => resolve();
        });
    },
    getContacts: () => {
        return new Promise((resolve) => {
            const tx = db.transaction('contacts', 'readonly');
            const request = tx.objectStore('contacts').getAll();
            request.onsuccess = () => resolve(request.result || []);
        });
    },
    getLastMessageForContact: (contactId) => {
        return new Promise((resolve) => {
            DB.getMessages(contactId).then(msgs => {
                if(msgs.length === 0) resolve(null);
                else {
                    // Sort by timestamp desc and get latest
                    msgs.sort((a,b) => b.timestampMs - a.timestampMs);
                    resolve(msgs[0]);
                }
            });
        });
    }
};

// ==========================================
// Initialization & Socket Connections
// ==========================================

async function initializeApp() {
    await initDB();
    
    // Theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Profile
    usernameInput.value = myProfile.name;
    updateAvatarUI(myProfile.name, myAvatar);

    // Initial renders
    renderChatsList();
    renderFriendsList();

    // Connect to server and identify self
    socket.emit('set profile', { name: myProfile.name, userId: myProfile.userId });
    socket.emit('get online users');
}

initializeApp();

// ==========================================
// Socket Events
// ==========================================

socket.on('online users', (users) => {
    networkUsersMap.clear();
    const networkListHTML = [];
    
    let onlineOthers = 0;

    users.forEach(user => {
        if (user.id !== socket.id) { // Don't show self in network
            networkUsersMap.set(user.id, user); // Maps socket.id to user obj
            onlineOthers++;
            
            networkListHTML.push(`
                <li class="list-item" onclick="openChat('${user.userId}', '${escapeHTML(user.name)}', '${user.id}')">
                    <div class="avatar bg-blue">${(user.name || '??').substring(0,2).toUpperCase()}</div>
                    <div class="info">
                        <div class="name-row">
                            <span class="name">${escapeHTML(user.name)}</span>
                            <span class="time" style="color:var(--success)">Online</span>
                        </div>
                        <span class="last-msg">Tap to chat / add friend</span>
                    </div>
                </li>
            `);
        }
    });

    onlineCount.textContent = `${onlineOthers} Online`;
    
    if (onlineOthers === 0) {
        networkList.innerHTML = `<div class="empty-state"><p>No one else on the hotspot.</p></div>`;
    } else {
        networkList.innerHTML = networkListHTML.join('');
    }

    // Also update UI in chat if we are currently chatting with someone who went online/offline
    if (activeChatUserId) {
        updateActiveChatStatus();
    }
});

socket.on('private message', async (data) => {
    // data.senderId is their user id, data.fromSocket is their socket
    
    // Save to DB
    await DB.saveContact({ id: data.senderId, name: data.senderName, lastSeen: Date.now() });
    await DB.saveMessage(data);

    // If we are currently talking to them, show msg
    if (activeChatUserId === data.senderId) {
        appendMessage(data, false);
    } else {
        showToast(`New message from ${data.senderName}`);
        renderChatsList(); // Update recent chats list
    }
});

socket.on('private file', async (data) => {
    await DB.saveContact({ id: data.senderId, name: data.senderName, lastSeen: Date.now() });
    await DB.saveMessage(data);

    if (activeChatUserId === data.senderId) {
        appendFileMessage(data, false);
    } else {
        showToast(`File received from ${data.senderName}`);
        renderChatsList();
    }
});

socket.on('friend request', (data) => {
    // Basic Friend Sync logic: when someone messages you, they automatically become a local contact.
    // For a deeper friend system, you'd add an Accept/Reject flow. For simplicity, we auto-save as contact.
    DB.saveContact({ id: data.fromId, name: data.fromName, lastSeen: Date.now() }).then(() => {
        showToast(`${data.fromName} added you as a friend.`);
        renderFriendsList();
    });
});

// ==========================================
// UI Interactions & Navigation
// ==========================================

// Tabs
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        
        // Add active
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');

        // Re-render when switching tabs
        if (btn.dataset.tab === 'chats') renderChatsList();
        if (btn.dataset.tab === 'friends') renderFriendsList();
    });
});

// Theme
themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    lucide.createIcons();
});

// Profile Modal
profileBtn.addEventListener('click', () => {
    profileModal.classList.add('active');
});

closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        profileModal.classList.remove('active');
        uploadModal.classList.remove('active');
    });
});

saveProfileBtn.addEventListener('click', () => {
    const newName = usernameInput.value.trim() || 'Anonymous';
    myProfile.name = newName;
    localStorage.setItem('userName', newName);
    updateAvatarUI(newName, myAvatar);
    
    // Tell server
    socket.emit('set profile', { name: myProfile.name, userId: myProfile.userId });
    
    profileModal.classList.remove('active');
    showToast('Profile updated');
});

function updateAvatarUI(name, element) {
    if(element) element.textContent = (name || '??').substring(0, 2).toUpperCase();
}

function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ==========================================
// Chat Logic
// ==========================================

// Open a chat with someone
async function openChat(userId, userName, currentSocketId = null) {
    activeChatUserId = userId;
    
    // Update Header
    if(activeChatName) activeChatName.textContent = userName;
    updateAvatarUI(userName, activeChatAvatar);
    
    // Save as contact immediately
    await DB.saveContact({ id: userId, name: userName, lastSeen: Date.now() });

    // Transition View
    chatView.classList.add('active');
    updateActiveChatStatus();

    // Load Messages
    privateMessagesContainer.innerHTML = '';
    const msgs = await DB.getMessages(userId);
    
    // Sort by timestamp asc
    msgs.sort((a,b) => a.timestampMs - b.timestampMs);
    
    if (msgs.length === 0) {
        privateMessagesContainer.innerHTML = `<div class="system-msg-container"><div class="system-message">Send a message to start the conversation securely on the local network.</div></div>`;
    } else {
        msgs.forEach(msg => {
            const isMine = msg.senderId === myProfile.userId;
            if (msg.file) appendFileMessage(msg, isMine);
            else appendMessage(msg, isMine);
        });
    }

    // Scroll
    scrollToBottom();
}

backBtn.addEventListener('click', () => {
    chatView.classList.remove('active');
    activeChatUserId = null;
    renderChatsList(); // refresh list to show newest msgs
});

function updateActiveChatStatus() {
    if (!activeChatUserId) return;
    
    if (activeChatStatus) {
        // Find if this user is in the networkMap by checking mapping
        let isOnline = false;
        for (let user of networkUsersMap.values()) {
            if (user.userId === activeChatUserId) {
                isOnline = true;
                break;
            }
        }
        
        if (isOnline) {
            activeChatStatus.textContent = 'Online';
            activeChatStatus.style.color = 'var(--success)';
        } else {
            activeChatStatus.textContent = 'Offline';
            activeChatStatus.style.color = 'var(--text-secondary)';
        }
    }
}

function getActiveChatSocketId() {
    for (let [socketId, user] of networkUsersMap.entries()) {
        if (user.userId === activeChatUserId) return socketId;
    }
    return null;
}

// Sending Messages
privateChatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeChatUserId) return;

    const text = privateMessageInput.value.trim();
    if (!text) return;

    const targetSocketId = getActiveChatSocketId();
    
    const msgData = {
        id: myProfile.userId + '_' + Date.now(),
        conversationId: getConversationId(myProfile.userId, activeChatUserId),
        senderId: myProfile.userId,
        senderName: myProfile.name,
        targetId: activeChatUserId, // the persistent ID of the receiver
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timestampMs: Date.now()
    };

    // We save our own message immediately
    await DB.saveMessage(msgData);
    appendMessage(msgData, true);
    privateMessageInput.value = '';

    // If they are online on the hotspot, route via socket.
    if (targetSocketId) {
        // Augment with delivery info
        msgData.to = targetSocketId;
        socket.emit('private message', msgData);
    } else {
        showToast("User is offline. Message saved locally.");
    }
});

function appendMessage(data, isMine) {
    // Remove "No messages" system message if it exists
    const sysMsg = privateMessagesContainer.querySelector('.system-msg-container');
    if (sysMsg) sysMsg.remove();

    const messageEl = document.createElement('div');
    messageEl.className = `message ${isMine ? 'mine' : 'other'}`;
    
    messageEl.innerHTML = `
        <div class="message-content">
            <div class="message-text">${escapeHTML(data.text)}</div>
            <div class="message-time">${data.timestamp}</div>
        </div>
    `;
    
    privateMessagesContainer.appendChild(messageEl);
    scrollToBottom();
}

function appendFileMessage(data, isMine) {
    const sysMsg = privateMessagesContainer.querySelector('.system-msg-container');
    if (sysMsg) sysMsg.remove();

    const messageEl = document.createElement('div');
    messageEl.className = `message ${isMine ? 'mine' : 'other'}`;
    
    let icon = 'file';
    if(data.file.type.startsWith('image/')) icon = 'image';
    if(data.file.type.startsWith('video/')) icon = 'video';
    if(data.file.type.startsWith('audio/')) icon = 'music';
    if(data.file.type.includes('pdf')) icon = 'file-text';
    if(data.file.type.includes('zip') || data.file.type.includes('tar')) icon = 'archive';

    const fileSize = formatBytes(data.file.size);

    messageEl.innerHTML = `
        <div class="message-content">
            <a href="${data.file.url}" download="${data.file.filename}" class="file-message" target="_blank">
                <div class="file-icon-wrapper">
                    <i data-lucide="${icon}"></i>
                </div>
                <div class="file-info">
                    <span class="file-name" title="${data.file.filename}">${data.file.filename}</span>
                    <span class="file-size">${fileSize}</span>
                </div>
            </a>
            <div class="message-time">${data.timestamp}</div>
        </div>
    `;
    
    privateMessagesContainer.appendChild(messageEl);
    lucide.createIcons({root: messageEl});
    scrollToBottom();
}

function scrollToBottom() {
    privateMessagesContainer.scrollTop = privateMessagesContainer.scrollHeight;
}

// ==========================================
// Rendering Lists (Chats & Friends)
// ==========================================

async function renderChatsList() {
    console.log("Rendering Chats Tab");
    const contacts = await DB.getContacts();
    if (contacts.length === 0) {
        chatsTab.innerHTML = `
            <div class="empty-state">
                <i data-lucide="message-square"></i>
                <p>No recent chats.</p>
                <p class="sub-text">Go to Network to find people nearby.</p>
            </div>
        `;
        lucide.createIcons({root: chatsTab});
        return;
    }

    const htmlList = [];
    
    for (let contact of contacts) {
        const lastMsg = await DB.getLastMessageForContact(contact.id);
        if (lastMsg) {
            let msgPreview = lastMsg.text ? lastMsg.text : '📎 File shared';
            htmlList.push(`
                <li class="list-item" onclick="openChat('${contact.id}', '${escapeHTML(contact.name)}')">
                    <div class="avatar bg-primary">${(contact.name || '??').substring(0,2).toUpperCase()}</div>
                    <div class="info">
                        <div class="name-row">
                            <span class="name">${escapeHTML(contact.name)}</span>
                            <span class="time">${lastMsg.timestamp}</span>
                        </div>
                        <span class="last-msg">${escapeHTML(msgPreview)}</span>
                    </div>
                </li>
            `);
        }
    }

    if (htmlList.length > 0) {
        chatsTab.innerHTML = `<ul class="user-list">${htmlList.join('')}</ul>`;
    }
}

async function renderFriendsList() {
    const contacts = await DB.getContacts();
    if (contacts.length === 0) {
        friendsList.innerHTML = `<div class="empty-state"><p>No friends added yet.</p></div>`;
        return;
    }

    const htmlList = contacts.map(c => `
        <li class="list-item" onclick="openChat('${c.id}', '${escapeHTML(c.name)}')">
            <div class="avatar bg-primary">${(c.name || '??').substring(0,2).toUpperCase()}</div>
            <div class="info">
                <div class="name-row">
                    <span class="name">${escapeHTML(c.name)}</span>
                </div>
            </div>
        </li>
    `);
    
    friendsList.innerHTML = htmlList.join('');
}

// ==========================================
// File Upload logic
// ==========================================

attachBtn.addEventListener('click', () => {
    if(!activeChatUserId) {
        showToast("Open a chat to send files.");
        return;
    }
    uploadModal.classList.add('active');
    resetUploadForm();
});

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }

['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.add('is-active'), false);
});
['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, () => dropArea.classList.remove('is-active'), false);
});

dropArea.addEventListener('drop', (e) => {
    handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    if (files.length > 0) {
        const file = files[0];
        fileInput.files = files; 
        previewFilename.textContent = file.name;
        dropArea.style.display = 'none';
        filePreview.style.display = 'flex';
        uploadSubmitBtn.disabled = false;
    }
}

removeFileBtn.addEventListener('click', () => { resetUploadForm(); });

function resetUploadForm() {
    fileInput.value = '';
    dropArea.style.display = 'block';
    filePreview.style.display = 'none';
    uploadSubmitBtn.disabled = true;
    progressContainer.style.display = 'none';
    progressBar.style.width = '0%';
}

uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!activeChatUserId) return;
    
    const file = fileInput.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    
    uploadSubmitBtn.disabled = true;
    uploadSubmitBtn.textContent = 'Sending...';
    progressContainer.style.display = 'block';
    removeFileBtn.style.display = 'none';

    const xhr = new XMLHttpRequest();
    
    xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
            progressBar.style.width = ((e.loaded / e.total) * 100) + '%';
        }
    });
    
    xhr.addEventListener('load', async () => {
        if (xhr.status === 200) {
            const fileData = JSON.parse(xhr.responseText);
            const targetSocketId = getActiveChatSocketId();
            
            const fileMessageData = {
                id: myProfile.userId + '_' + Date.now(),
                conversationId: getConversationId(myProfile.userId, activeChatUserId),
                senderId: myProfile.userId,
                senderName: myProfile.name,
                targetId: activeChatUserId,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                timestampMs: Date.now(),
                file: fileData
            };
            
            await DB.saveMessage(fileMessageData);
            appendFileMessage(fileMessageData, true);
            
            if(targetSocketId) {
                fileMessageData.to = targetSocketId;
                socket.emit('private file', fileMessageData);
            }
            
            uploadModal.classList.remove('active');
            resetUploadForm();
            uploadSubmitBtn.textContent = 'Send File';
        } else {
            alert('Upload failed.');
            resetUploadForm();
        }
    });

    xhr.open('POST', '/upload');
    xhr.send(formData);
});

// Utils
function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function escapeHTML(str) {
    return (str||"").replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
        }[tag] || tag)
    );
}

// Icon init
lucide.createIcons();
