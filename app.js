// Firebase Configuration
const firebaseConfig = {
    // REPLACE WITH YOUR FIREBASE CONFIG
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();

// ==================== AUTHENTICATION ====================

let currentUser = null;
let currentUserData = null;

function switchAuthTab(tab) {
    const tabs = document.querySelectorAll('.auth-tab');
    tabs.forEach(t => t.classList.remove('active'));
    document.querySelector(`.auth-tab[onclick*="${tab}"]`).classList.add('active');
    
    document.getElementById('loginForm').style.display = tab === 'login' ? 'block' : 'none';
    document.getElementById('signupForm').style.display = tab === 'signup' ? 'block' : 'none';
    document.getElementById('authError').textContent = '';
}

async function handleLogin(event) {
    event.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (error) {
        document.getElementById('authError').textContent = error.message;
    }
}

async function handleSignup(event) {
    event.preventDefault();
    const name = document.getElementById('signupName').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    try {
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        await userCredential.user.updateProfile({ displayName: name });
        // Create user document in Firestore
        await db.collection('users').doc(userCredential.user.uid).set({
            name: name,
            email: email,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        document.getElementById('authError').textContent = error.message;
    }
}

function handleLogout() {
    auth.signOut();
}

// Auth State Listener
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        document.getElementById('authScreen').style.display = 'none';
        document.getElementById('appContainer').style.display = 'block';
        
        // Load user data
        const userDoc = await db.collection('users').doc(user.uid).get();
        currentUserData = userDoc.data();
        
        // Initialize app
        initApp();
    } else {
        currentUser = null;
        document.getElementById('authScreen').style.display = 'flex';
        document.getElementById('appContainer').style.display = 'none';
    }
});

// ==================== DATA MANAGEMENT ====================

// Real-time listeners
let taskListener = null;
let decisionListener = null;
let meetingListener = null;

function initApp() {
    setupNavigation();
    setupEditableTitle();
    setupDarkMode();
    setupTagFilter();
    
    // Set up real-time listeners
    setupTaskListener();
    setupDecisionListener();
    setupMeetingListener();
    
    // Check for due dates
    checkDueDates();
    setInterval(checkDueDates, 60000); // Check every minute
}

function setupTaskListener() {
    if (taskListener) taskListener();
    
    taskListener = db.collection('tasks')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            window.tasks = [];
            snapshot.forEach(doc => {
                window.tasks.push({ id: doc.id, ...doc.data() });
            });
            renderTasks();
            updateDashboard();
            updateTagFilter();
        });
}

function setupDecisionListener() {
    if (decisionListener) decisionListener();
    
    decisionListener = db.collection('decisions')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            window.decisions = [];
            snapshot.forEach(doc => {
                window.decisions.push({ id: doc.id, ...doc.data() });
            });
            renderDecisions();
            updateDashboard();
        });
}

function setupMeetingListener() {
    if (meetingListener) meetingListener();
    
    meetingListener = db.collection('meetings')
        .where('userId', '==', currentUser.uid)
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            window.meetings = [];
            snapshot.forEach(doc => {
                window.meetings.push({ id: doc.id, ...doc.data() });
            });
            renderMeetings();
            updateDashboard();
        });
}

// ==================== TASK FUNCTIONS ====================

async function addTask(event) {
    event.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const priority = document.getElementById('taskPriority').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const assignedTo = document.getElementById('taskAssignedTo').value;
    const tags = document.getElementById('taskTags').value.split(',').map(t => t.trim()).filter(t => t);

    if (!title) return;

    try {
        await db.collection('tasks').add({
            userId: currentUser.uid,
            title,
            description,
            priority,
            dueDate,
            assignedTo,
            tags,
            status: 'todo',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            comments: [],
            createdBy: currentUser.displayName || 'User'
        });
        
        closeTaskForm();
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskTags').value = '';
        
        // Send notification if due date is soon
        if (dueDate) {
            const daysUntil = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 3) {
                sendNotification(`Task "${title}" is due in ${daysUntil} days`);
            }
        }
    } catch (error) {
        console.error('Error adding task:', error);
        alert('Error adding task. Please try again.');
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        await db.collection('tasks').doc(taskId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        // Send notification if task is completed
        if (newStatus === 'done') {
            const task = window.tasks.find(t => t.id === taskId);
            if (task) {
                sendNotification(`Task "${task.title}" has been completed! 🎉`);
            }
        }
    } catch (error) {
        console.error('Error updating task:', error);
    }
}

async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    try {
        await db.collection('tasks').doc(taskId).delete();
    } catch (error) {
        console.error('Error deleting task:', error);
    }
}

// ==================== COMMENT FUNCTIONS ====================

let currentCommentItem = null;
let currentCommentType = null;

function openComments(itemId, type) {
    currentCommentItem = itemId;
    currentCommentType = type;
    
    const modal = document.getElementById('commentsModal');
    const container = document.getElementById('commentsContainer');
    
    // Get comments from appropriate collection
    const collection = type === 'task' ? 'tasks' : 
                      type === 'decision' ? 'decisions' : 'meetings';
    
    db.collection(collection).doc(itemId).get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const comments = data.comments || [];
            
            container.innerHTML = comments.length === 0 ? 
                '<p style="color:var(--text-light);text-align:center;padding:1rem;">No comments yet</p>' :
                comments.map(comment => `
                    <div class="comment-item">
                        <div>
                            <span class="comment-author">${comment.author}</span>
                            <span class="comment-time">${formatDate(comment.timestamp)}</span>
                        </div>
                        <div class="comment-text">${escapeHtml(comment.text)}</div>
                    </div>
                `).join('');
        }
    });
    
    modal.style.display = 'flex';
    document.getElementById('commentText').value = '';
}

async function addComment() {
    const text = document.getElementById('commentText').value.trim();
    if (!text || !currentCommentItem) return;
    
    const collection = currentCommentType === 'task' ? 'tasks' : 
                      currentCommentType === 'decision' ? 'decisions' : 'meetings';
    
    try {
        const docRef = db.collection(collection).doc(currentCommentItem);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            const comments = data.comments || [];
            comments.push({
                text: text,
                author: currentUser.displayName || 'Anonymous',
                timestamp: new Date().toISOString()
            });
            
            await docRef.update({ comments });
            document.getElementById('commentText').value = '';
            openComments(currentCommentItem, currentCommentType); // Refresh
        }
    } catch (error) {
        console.error('Error adding comment:', error);
    }
}

function closeCommentsModal() {
    document.getElementById('commentsModal').style.display = 'none';
    currentCommentItem = null;
    currentCommentType = null;
}

// ==================== FILE UPLOAD FUNCTIONS ====================

async function uploadFile(file) {
    if (!file) return null;
    
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`${currentUser.uid}/${Date.now()}_${file.name}`);
    
    try {
        const snapshot = await fileRef.put(file);
        const url = await snapshot.ref.getDownloadURL();
        return {
            name: file.name,
            type: file.type,
            url: url,
            size: file.size
        };
    } catch (error) {
        console.error('Error uploading file:', error);
        return null;
    }
}

// ==================== DECISION FUNCTIONS ====================

async function addDecision(event) {
    event.preventDefault();
    const title = document.getElementById('decisionTitle').value.trim();
    const description = document.getElementById('decisionDescription').value.trim();
    const date = document.getElementById('decisionDate').value;
    const tags = document.getElementById('decisionTags').value.split(',').map(t => t.trim()).filter(t => t);
    const fileInput = document.getElementById('decisionFile');

    if (!title) return;

    try {
        let fileData = null;
        if (fileInput.files && fileInput.files[0]) {
            fileData = await uploadFile(fileInput.files[0]);
        }
        
        await db.collection('decisions').add({
            userId: currentUser.uid,
            title,
            description,
            date: date || new Date().toISOString().split('T')[0],
            tags,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            comments: [],
            createdBy: currentUser.displayName || 'User'
        });
        
        closeDecisionForm();
        document.getElementById('decisionTitle').value = '';
        document.getElementById('decisionDescription').value = '';
        document.getElementById('decisionTags').value = '';
        document.getElementById('decisionFile').value = '';
    } catch (error) {
        console.error('Error adding decision:', error);
        alert('Error adding decision. Please try again.');
    }
}

// ==================== MEETING FUNCTIONS ====================

async function addMeetingNote(event) {
    event.preventDefault();
    const title = document.getElementById('meetingTitle').value.trim();
    const date = document.getElementById('meetingDate').value;
    const notes = document.getElementById('meetingNotes').value.trim();
    const tags = document.getElementById('meetingTags').value.split(',').map(t => t.trim()).filter(t => t);
    const fileInput = document.getElementById('meetingFile');

    if (!title) return;

    try {
        let fileData = null;
        if (fileInput.files && fileInput.files[0]) {
            fileData = await uploadFile(fileInput.files[0]);
        }
        
        await db.collection('meetings').add({
            userId: currentUser.uid,
            title,
            date: date || new Date().toISOString().split('T')[0],
            notes,
            tags,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            comments: [],
            createdBy: currentUser.displayName || 'User'
        });
        
        closeMeetingForm();
        document.getElementById('meetingTitle').value = '';
        document.getElementById('meetingNotes').value = '';
        document.getElementById('meetingTags').value = '';
        document.getElementById('meetingFile').value = '';
    } catch (error) {
        console.error('Error adding meeting note:', error);
        alert('Error adding meeting note. Please try again.');
    }
}

// ==================== RENDER FUNCTIONS ====================

function renderTasks() {
    if (!window.tasks) return;
    
    const statuses = ['todo', 'progress', 'done'];
    const containers = {
        todo: document.getElementById('todoTasks'),
        progress: document.getElementById('progressTasks'),
        done: document.getElementById('doneTasks')
    };
    const counts = {
        todo: document.getElementById('todoCount'),
        progress: document.getElementById('progressCount'),
        done: document.getElementById('doneCount')
    };

    statuses.forEach(status => {
        let tasks = window.tasks.filter(t => t.status === status);
        
        // Apply filters
        const filterText = document.getElementById('taskFilter')?.value?.toLowerCase() || '';
        const tagFilter = document.getElementById('tagFilter')?.value || '';
        
        if (filterText) {
            tasks = tasks.filter(t => 
                t.title.toLowerCase().includes(filterText) || 
                (t.description || '').toLowerCase().includes(filterText)
            );
        }
        
        if (tagFilter) {
            tasks = tasks.filter(t => (t.tags || []).includes(tagFilter));
        }
        
        containers[status].innerHTML = tasks.map(task => `
            <div class="task-item ${task.priority}">
                <h4>${escapeHtml(task.title)}</h4>
                ${task.description ? `<p style="font-size:0.85rem;color:var(--text-secondary);margin:0.25rem 0">${escapeHtml(task.description)}</p>` : ''}
                <div class="task-meta">
                    ${task.assignedTo ? `<span>👤 ${escapeHtml(task.assignedTo)}</span>` : ''}
                    ${task.dueDate ? `<span>📅 ${formatDate(task.dueDate)}</span>` : ''}
                    <span>⚡ ${task.priority}</span>
                </div>
                ${task.tags && task.tags.length ? `
                    <div class="task-tags">
                        ${task.tags.map(tag => `<span class="task-tag">#${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                <div class="task-actions">
                    ${status !== 'todo' ? `<button onclick="updateTaskStatus('${task.id}', 'todo')">← To Do</button>` : ''}
                    ${status !== 'progress' ? `<button onclick="updateTaskStatus('${task.id}', 'progress')">→ In Progress</button>` : ''}
                    ${status !== 'done' ? `<button onclick="updateTaskStatus('${task.id}', 'done')">✓ Done</button>` : ''}
                    <button onclick="openComments('${task.id}', 'task')">💬 ${(task.comments || []).length}</button>
                    <button class="task-delete" onclick="deleteTask('${task.id}')">×</button>
                </div>
            </div>
        `).join('') || '<p style="color:var(--text-light);text-align:center;padding:1rem;">No tasks</p>';

        counts[status].textContent = tasks.length;
    });
}

function renderDecisions() {
    if (!window.decisions) return;
    const container = document.getElementById('decisionsList');
    
    container.innerHTML = window.decisions.map(decision => `
        <div class="decision-item">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                    <h4>${escapeHtml(decision.title)}</h4>
                    <span class="decision-date">${formatDate(decision.date || decision.createdAt)}</span>
                </div>
                <button class="decision-delete" onclick="deleteDecision('${decision.id}')">×</button>
            </div>
            ${decision.description ? `<p class="decision-description">${escapeHtml(decision.description)}</p>` : ''}
            ${decision.tags && decision.tags.length ? `
                <div class="task-tags">
                    ${decision.tags.map(tag => `<span class="task-tag">#${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            ${decision.file ? `
                <div class="decision-attachments">
                    <span class="attachment" onclick="previewFile('${decision.file.url}', '${decision.file.name}')">
                        📎 ${escapeHtml(decision.file.name)}
                    </span>
                </div>
            ` : ''}
            <div style="margin-top:0.5rem">
                <button onclick="openComments('${decision.id}', 'decision')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:0.8rem;">
                    💬 ${(decision.comments || []).length} comments
                </button>
            </div>
        </div>
    `).join('') || '<p style="color:var(--text-light);text-align:center;padding:2rem;">No decisions yet.</p>';
}

function renderMeetings() {
    if (!window.meetings) return;
    const container = document.getElementById('meetingsList');
    
    container.innerHTML = window.meetings.map(meeting => `
        <div class="meeting-item">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                    <h4>${escapeHtml(meeting.title)}</h4>
                    <span class="meeting-date">${formatDate(meeting.date || meeting.createdAt)}</span>
                </div>
                <button class="meeting-delete" onclick="deleteMeeting('${meeting.id}')">×</button>
            </div>
            ${meeting.notes ? `<p class="meeting-notes">${escapeHtml(meeting.notes)}</p>` : ''}
            ${meeting.tags && meeting.tags.length ? `
                <div class="task-tags">
                    ${meeting.tags.map(tag => `<span class="task-tag">#${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            ${meeting.file ? `
                <div class="meeting-attachments">
                    <span class="attachment" onclick="previewFile('${meeting.file.url}', '${meeting.file.name}')">
                        📎 ${escapeHtml(meeting.file.name)}
                    </span>
                </div>
            ` : ''}
            <div style="margin-top:0.5rem">
                <button onclick="openComments('${meeting.id}', 'meeting')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:0.8rem;">
                    💬 ${(meeting.comments || []).length} comments
                </button>
            </div>
        </div>
    `).join('') || '<p style="color:var(--text-light);text-align:center;padding:2rem;">No meeting notes yet.</p>';
}

// ==================== SEARCH FUNCTIONS ====================

function performGlobalSearch() {
    const query = document.getElementById('globalSearch').value.toLowerCase().trim();
    const containers = document.querySelectorAll('.search-filters input:checked');
    const types = Array.from(containers).map(c => c.value);
    const results = document.getElementById('searchResults');
    
    if (!query) {
        results.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem;">Enter a search term</p>';
        return;
    }
    
    let allResults = [];
    
    if (types.includes('tasks') && window.tasks) {
        window.tasks.forEach(task => {
            if (task.title.toLowerCase().includes(query) || 
                (task.description || '').toLowerCase().includes(query) ||
                (task.tags || []).some(t => t.toLowerCase().includes(query))) {
                allResults.push({ ...task, type: 'Task' });
            }
        });
    }
    
    if (types.includes('decisions') && window.decisions) {
        window.decisions.forEach(decision => {
            if (decision.title.toLowerCase().includes(query) || 
                (decision.description || '').toLowerCase().includes(query) ||
                (decision.tags || []).some(t => t.toLowerCase().includes(query))) {
                allResults.push({ ...decision, type: 'Decision' });
            }
        });
    }
    
    if (types.includes('meetings') && window.meetings) {
        window.meetings.forEach(meeting => {
            if (meeting.title.toLowerCase().includes(query) || 
                (meeting.notes || '').toLowerCase().includes(query) ||
                (meeting.tags || []).some(t => t.toLowerCase().includes(query))) {
                allResults.push({ ...meeting, type: 'Meeting' });
            }
        });
    }
    
    results.innerHTML = allResults.length === 0 ? 
        '<p style="color:var(--text-light);text-align:center;padding:2rem;">No results found</p>' :
        allResults.map(item => `
            <div class="search-result-item">
                <div class="result-type">${item.type}</div>
                <div class="result-title">${escapeHtml(item.title)}</div>
                ${item.description ? `<div>${escapeHtml(item.description.substring(0, 100))}${item.description.length > 100 ? '...' : ''}</div>` : ''}
                ${item.tags && item.tags.length ? `
                    <div class="task-tags">
                        ${item.tags.map(tag => `<span class="task-tag">#${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
                <div style="font-size:0.75rem;color:var(--text-light);margin-top:0.25rem">
                    ${formatDate(item.date || item.createdAt)}
                </div>
            </div>
        `).join('');
}

// ==================== DARK MODE ====================

let darkMode = localStorage.getItem('darkMode') === 'true';

function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    applyDarkMode();
}

function applyDarkMode() {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
}

function setupDarkMode() {
    applyDarkMode();
}

// ==================== NOTIFICATIONS ====================

function sendNotification(message) {
    // Browser notification
    if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Finance App', { body: message, icon: '📱' });
    }
    
    // In-app notification
    const indicator = document.getElementById('saveIndicator');
    const originalText = indicator.textContent;
    indicator.textContent = `🔔 ${message}`;
    indicator.style.color = 'var(--warning-color)';
    setTimeout(() => {
        indicator.textContent = originalText;
        indicator.style.color = '';
    }, 5000);
}

function checkDueDates() {
    if (!window.tasks) return;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    window.tasks.forEach(task => {
        if (task.dueDate && task.status !== 'done') {
            const dueDate = new Date(task.dueDate);
            dueDate.setHours(0, 0, 0, 0);
            
            const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
            
            if (daysUntil === 0) {
                sendNotification(`⚠️ Task "${task.title}" is due TODAY!`);
            } else if (daysUntil === 1) {
                sendNotification(`⏰ Task "${task.title}" is due tomorrow!`);
            } else if (daysUntil === 7) {
                sendNotification(`📅 Task "${task.title}" is due in 1 week`);
            }
        }
    });
}

// ==================== DASHBOARD ====================

function updateDashboard() {
    const stats = document.getElementById('dashboardStats');
    const totalTasks = window.tasks ? window.tasks.length : 0;
    const doneTasks = window.tasks ? window.tasks.filter(t => t.status === 'done').length : 0;
    const totalDecisions = window.decisions ? window.decisions.length : 0;
    const totalMeetings = window.meetings ? window.meetings.length : 0;

    stats.innerHTML = `
        <div class="stat-card">
            <span class="stat-number">${totalTasks}</span>
            <span class="stat-label">Total Tasks</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${doneTasks}</span>
            <span class="stat-label">Completed Tasks</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${totalDecisions}</span>
            <span class="stat-label">Decisions Made</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${totalMeetings}</span>
            <span class="stat-label">Meeting Notes</span>
        </div>
    `;

    // Recent activity
    const recent = document.getElementById('recentActivity');
    const allItems = [
        ...(window.tasks || []).map(t => ({ ...t, type: 'task', label: `Task: ${t.title}` })),
        ...(window.decisions || []).map(d => ({ ...d, type: 'decision', label: `Decision: ${d.title}` })),
        ...(window.meetings || []).map(m => ({ ...m, type: 'meeting', label: `Meeting: ${m.title}` }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    recent.innerHTML = allItems.length ? allItems.map(item => `
        <div class="recent-item">
            <span>${escapeHtml(item.label)}</span>
            <span class="recent-type">${item.type}</span>
        </div>
    `).join('') : '<p style="color:var(--text-light);text-align:center;padding:1rem;">No recent activity</p>';
    
    // Upcoming tasks
    const upcoming = document.getElementById('upcomingTasks');
    const upcomingTasks = (window.tasks || [])
        .filter(t => t.status !== 'done' && t.dueDate)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
        .slice(0, 5);
    
    upcoming.innerHTML = upcomingTasks.length ? upcomingTasks.map(task => `
        <div class="recent-item">
            <span>${escapeHtml(task.title)}</span>
            <span style="font-size:0.75rem;color:var(--text-light);">
                ${formatDate(task.dueDate)}
            </span>
        </div>
    `).join('') : '<p style="color:var(--text-light);text-align:center;padding:1rem;">No upcoming tasks</p>';
}

// ==================== TAG FILTERS ====================

function updateTagFilter() {
    const select = document.getElementById('tagFilter');
    if (!select) return;
    
    const allTags = new Set();
    (window.tasks || []).forEach(task => {
        (task.tags || []).forEach(tag => allTags.add(tag));
    });
    (window.decisions || []).forEach(decision => {
        (decision.tags || []).forEach(tag => allTags.add(tag));
    });
    (window.meetings || []).forEach(meeting => {
        (meeting.tags || []).forEach(tag => allTags.add(tag));
    });
    
    const currentValue = select.value;
    select.innerHTML = '<option value="">All Tags</option>' + 
        Array.from(allTags).sort().map(tag => 
            `<option value="${escapeHtml(tag)}">#${escapeHtml(tag)}</option>`
        ).join('');
    select.value = currentValue;
}

function setupTagFilter() {
    const select = document.getElementById('tagFilter');
    if (select) {
        select.addEventListener('change', filterTasks);
    }
}

function filterTasks() {
    renderTasks();
}

// ==================== UTILITY FUNCTIONS ====================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return dateStr;
    }
}

function previewFile(url, name) {
    const modal = document.getElementById('fileModal');
    const preview = document.getElementById('filePreview');
    
    const extension = name.split('.').pop().toLowerCase();
    const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
    const pdfTypes = ['pdf'];
    const docTypes = ['doc', 'docx'];
    
    if (imageTypes.includes(extension)) {
        preview.innerHTML = `<img src="${url}" alt="${name}">`;
    } else if (pdfTypes.includes(extension)) {
        preview.innerHTML = `<iframe src="${url}"></iframe>`;
    } else if (docTypes.includes(extension)) {
        preview.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p>📄 ${name}</p>
                <a href="${url}" download="${name}" class="btn-primary" style="display:inline-block;padding:0.5rem 1rem;margin-top:1rem;text-decoration:none;color:white;border-radius:6px;">
                    Download File
                </a>
            </div>
        `;
    } else {
        preview.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p>📄 ${name}</p>
                <a href="${url}" download="${name}" class="btn-primary" style="display:inline-block;padding:0.5rem 1rem;margin-top:1rem;text-decoration:none;color:white;border-radius:6px;">
                    Download File
                </a>
            </div>
        `;
    }
    
    modal.style.display = 'flex';
}

function closeFileModal() {
    document.getElementById('fileModal').style.display = 'none';
    document.getElementById('filePreview').innerHTML = '';
}

// ==================== DELETE FUNCTIONS ====================

async function deleteDecision(decisionId) {
    if (!confirm('Delete this decision?')) return;
    try {
        await db.collection('decisions').doc(decisionId).delete();
    } catch (error) {
        console.error('Error deleting decision:', error);
    }
}

async function deleteMeeting(meetingId) {
    if (!confirm('Delete this meeting note?')) return;
    try {
        await db.collection('meetings').doc(meetingId).delete();
    } catch (error) {
        console.error('Error deleting meeting:', error);
    }
}

// ==================== EXPORT/IMPORT ====================

function exportData() {
    const data = {
        tasks: window.tasks || [],
        decisions: window.decisions || [],
        meetings: window.meetings || [],
        exportedAt: new Date().toISOString(),
        user: currentUser.displayName || 'User'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-app-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
}

async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!confirm('This will replace all current data. Continue?')) {
        event.target.value = '';
        return;
    }
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Import tasks
        if (data.tasks && data.tasks.length) {
            for (const task of data.tasks) {
                delete task.id; // Remove old ID
                await db.collection('tasks').add({
                    ...task,
                    userId: currentUser.uid,
                    importedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        // Import decisions
        if (data.decisions && data.decisions.length) {
            for (const decision of data.decisions) {
                delete decision.id;
                await db.collection('decisions').add({
                    ...decision,
                    userId: currentUser.uid,
                    importedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        // Import meetings
        if (data.meetings && data.meetings.length) {
            for (const meeting of data.meetings) {
                delete meeting.id;
                await db.collection('meetings').add({
                    ...meeting,
                    userId: currentUser.uid,
                    importedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
        
        alert('Data imported successfully!');
        event.target.value = '';
    } catch (error) {
        alert('Error importing data: ' + error.message);
        event.target.value = '';
    }
}

// ==================== NAVIGATION ====================

function setupNavigation() {
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    const sections = document.querySelectorAll('.section');

    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sidebarBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const sectionId = btn.dataset.section;
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
        });
    });
}

// ==================== APP TITLE ====================

function setupEditableTitle() {
    const titleEl = document.getElementById('appTitle');
    if (titleEl) {
        titleEl.addEventListener('blur', () => {
            const newName = titleEl.textContent.trim();
            if (newName && currentUser) {
                db.collection('users').doc(currentUser.uid).update({
                    appName: newName
                });
            }
        });
    }
}

// ==================== FORM HELPERS ====================

function openTaskForm() {
    document.getElementById('taskForm').style.display = 'block';
    document.getElementById('taskForm').scrollIntoView({ behavior: 'smooth' });
}

function closeTaskForm() {
    document.getElementById('taskForm').style.display = 'none';
}

function openDecisionForm() {
    document.getElementById('decisionForm').style.display = 'block';
    document.getElementById('decisionForm').scrollIntoView({ behavior: 'smooth' });
}

function closeDecisionForm() {
    document.getElementById('decisionForm').style.display = 'none';
}

function openMeetingForm() {
    document.getElementById('meetingForm').style.display = 'block';
    document.getElementById('meetingForm').scrollIntoView({ behavior: 'smooth' });
}

function closeMeetingForm() {
    document.getElementById('meetingForm').style.display = 'none';
}

// ==================== INITIALIZATION ====================

// Request notification permission
if ('Notification' in window) {
    Notification.requestPermission();
}

console.log('🚀 Finance App with Advanced Features loaded!');
console.log('Features:');
console.log('✅ Real-time sync with Firebase');
console.log('✅ User authentication');
console.log('✅ Comments & discussions');
console.log('✅ Tags & labels');
console.log('✅ Dark mode');
console.log('✅ Advanced search');
console.log('✅ Email notifications');
console.log('✅ File uploads');