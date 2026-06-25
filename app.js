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
const db = firebase.firestore();
const storage = firebase.storage();

// ==================== DATA MANAGEMENT ====================

// Single collection for all data
const COLLECTION = 'financeAppData';

// Real-time listeners
let taskListener = null;
let decisionListener = null;
let meetingListener = null;

// Global data stores
window.tasks = [];
window.decisions = [];
window.meetings = [];

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
    
    console.log('🚀 Finance App initialized successfully!');
    console.log('📡 Listening for real-time updates...');
}

function setupTaskListener() {
    if (taskListener) taskListener();
    
    taskListener = db.collection(COLLECTION)
        .where('type', '==', 'task')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            window.tasks = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                window.tasks.push({ 
                    id: doc.id, 
                    ...data,
                    // Ensure comments is always an array
                    comments: data.comments || []
                });
            });
            renderTasks();
            updateDashboard();
            updateTagFilter();
            
            // Update connection status
            document.getElementById('saveIndicator').textContent = '● Connected';
            document.getElementById('saveIndicator').style.color = 'var(--success-color)';
        }, (error) => {
            console.error('Error in task listener:', error);
            document.getElementById('saveIndicator').textContent = '⚠️ Offline';
            document.getElementById('saveIndicator').style.color = 'var(--danger-color)';
        });
}

function setupDecisionListener() {
    if (decisionListener) decisionListener();
    
    decisionListener = db.collection(COLLECTION)
        .where('type', '==', 'decision')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            window.decisions = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                window.decisions.push({ 
                    id: doc.id, 
                    ...data,
                    comments: data.comments || []
                });
            });
            renderDecisions();
            updateDashboard();
        });
}

function setupMeetingListener() {
    if (meetingListener) meetingListener();
    
    meetingListener = db.collection(COLLECTION)
        .where('type', '==', 'meeting')
        .orderBy('createdAt', 'desc')
        .onSnapshot((snapshot) => {
            window.meetings = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                window.meetings.push({ 
                    id: doc.id, 
                    ...data,
                    comments: data.comments || []
                });
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
        const taskData = {
            type: 'task',
            title,
            description,
            priority,
            dueDate,
            assignedTo,
            tags,
            status: 'todo',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            comments: [],
            createdBy: 'User'
        };
        
        await db.collection(COLLECTION).add(taskData);
        
        closeTaskForm();
        document.getElementById('taskTitle').value = '';
        document.getElementById('taskDescription').value = '';
        document.getElementById('taskTags').value = '';
        
        // Show notification
        showNotification(`✅ Task "${title}" added!`);
        
        // Check if due date is soon
        if (dueDate) {
            const daysUntil = Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24));
            if (daysUntil <= 3) {
                showNotification(`⏰ Task "${title}" is due in ${daysUntil} days`);
            }
        }
    } catch (error) {
        console.error('Error adding task:', error);
        alert('Error adding task. Please try again.');
    }
}

async function updateTaskStatus(taskId, newStatus) {
    try {
        await db.collection(COLLECTION).doc(taskId).update({
            status: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        const task = window.tasks.find(t => t.id === taskId);
        if (task && newStatus === 'done') {
            showNotification(`🎉 Task "${task.title}" completed!`);
        }
    } catch (error) {
        console.error('Error updating task:', error);
        alert('Error updating task. Please try again.');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    try {
        await db.collection(COLLECTION).doc(taskId).delete();
        showNotification('🗑️ Task deleted');
    } catch (error) {
        console.error('Error deleting task:', error);
        alert('Error deleting task. Please try again.');
    }
}

// ==================== COMMENT FUNCTIONS ====================

let currentCommentItem = null;
let currentCommentType = null;

function openComments(itemId, type, title) {
    currentCommentItem = itemId;
    currentCommentType = type;
    
    const modal = document.getElementById('commentsModal');
    const container = document.getElementById('commentsContainer');
    
    // Get the item's comments
    db.collection(COLLECTION).doc(itemId).get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            const comments = data.comments || [];
            
            // Set the title
            const titleElement = modal.querySelector('h3');
            titleElement.textContent = `Comments: ${title || 'Item'}`;
            
            container.innerHTML = comments.length === 0 ? 
                '<p style="color:var(--text-light);text-align:center;padding:1rem;">No comments yet. Start the discussion!</p>' :
                comments.map((comment, index) => `
                    <div class="comment-item">
                        <div>
                            <span class="comment-author">${escapeHtml(comment.author || 'Anonymous')}</span>
                            <span class="comment-time">${formatDate(comment.timestamp)}</span>
                        </div>
                        <div class="comment-text">${escapeHtml(comment.text)}</div>
                    </div>
                `).join('');
        }
    });
    
    modal.style.display = 'flex';
    document.getElementById('commentText').value = '';
    document.getElementById('commentAuthor').value = '';
}

async function addComment() {
    const text = document.getElementById('commentText').value.trim();
    const author = document.getElementById('commentAuthor').value.trim() || 'Anonymous';
    
    if (!text || !currentCommentItem) return;
    
    try {
        const docRef = db.collection(COLLECTION).doc(currentCommentItem);
        const doc = await docRef.get();
        
        if (doc.exists) {
            const data = doc.data();
            const comments = data.comments || [];
            comments.push({
                text: text,
                author: author,
                timestamp: new Date().toISOString()
            });
            
            await docRef.update({ 
                comments: comments,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            
            document.getElementById('commentText').value = '';
            document.getElementById('commentAuthor').value = '';
            
            // Refresh comments
            openComments(currentCommentItem, currentCommentType, doc.data().title);
            showNotification('💬 Comment added!');
        }
    } catch (error) {
        console.error('Error adding comment:', error);
        alert('Error adding comment. Please try again.');
    }
}

function closeCommentsModal() {
    document.getElementById('commentsModal').style.display = 'none';
    currentCommentItem = null;
    currentCommentType = null;
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
        
        const decisionData = {
            type: 'decision',
            title,
            description,
            date: date || new Date().toISOString().split('T')[0],
            tags,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            comments: [],
            createdBy: 'User'
        };
        
        await db.collection(COLLECTION).add(decisionData);
        
        closeDecisionForm();
        document.getElementById('decisionTitle').value = '';
        document.getElementById('decisionDescription').value = '';
        document.getElementById('decisionTags').value = '';
        document.getElementById('decisionFile').value = '';
        
        showNotification(`💡 Decision "${title}" recorded!`);
    } catch (error) {
        console.error('Error adding decision:', error);
        alert('Error adding decision. Please try again.');
    }
}

async function deleteDecision(decisionId) {
    if (!confirm('Delete this decision?')) return;
    try {
        await db.collection(COLLECTION).doc(decisionId).delete();
        showNotification('🗑️ Decision deleted');
    } catch (error) {
        console.error('Error deleting decision:', error);
        alert('Error deleting decision. Please try again.');
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
        
        const meetingData = {
            type: 'meeting',
            title,
            date: date || new Date().toISOString().split('T')[0],
            notes,
            tags,
            file: fileData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            comments: [],
            createdBy: 'User'
        };
        
        await db.collection(COLLECTION).add(meetingData);
        
        closeMeetingForm();
        document.getElementById('meetingTitle').value = '';
        document.getElementById('meetingNotes').value = '';
        document.getElementById('meetingTags').value = '';
        document.getElementById('meetingFile').value = '';
        
        showNotification(`📝 Meeting note "${title}" saved!`);
    } catch (error) {
        console.error('Error adding meeting note:', error);
        alert('Error adding meeting note. Please try again.');
    }
}

async function deleteMeeting(meetingId) {
    if (!confirm('Delete this meeting note?')) return;
    try {
        await db.collection(COLLECTION).doc(meetingId).delete();
        showNotification('🗑️ Meeting note deleted');
    } catch (error) {
        console.error('Error deleting meeting:', error);
        alert('Error deleting meeting note. Please try again.');
    }
}

// ==================== FILE UPLOAD ====================

async function uploadFile(file) {
    if (!file) return null;
    
    const storageRef = storage.ref();
    const fileRef = storageRef.child(`files/${Date.now()}_${file.name}`);
    
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
        
        containers[status].innerHTML = tasks.map(task => {
            const commentCount = (task.comments || []).length;
            return `
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
                        <button onclick="openComments('${task.id}', 'task', '${escapeHtml(task.title)}')">
                            💬 ${commentCount > 0 ? commentCount : '+'}
                        </button>
                        <button class="task-delete" onclick="deleteTask('${task.id}')">×</button>
                    </div>
                </div>
            `;
        }).join('') || '<p style="color:var(--text-light);text-align:center;padding:1rem;">No tasks in this column</p>';

        counts[status].textContent = tasks.length;
    });
}

function renderDecisions() {
    if (!window.decisions) return;
    const container = document.getElementById('decisionsList');
    
    container.innerHTML = window.decisions.map(decision => {
        const commentCount = (decision.comments || []).length;
        return `
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
                    <button onclick="openComments('${decision.id}', 'decision', '${escapeHtml(decision.title)}')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:0.8rem;">
                        💬 ${commentCount > 0 ? commentCount : 'Add comment'}
                    </button>
                </div>
            </div>
        `;
    }).join('') || '<p style="color:var(--text-light);text-align:center;padding:2rem;">No decisions yet. Start by adding one!</p>';
}

function renderMeetings() {
    if (!window.meetings) return;
    const container = document.getElementById('meetingsList');
    
    container.innerHTML = window.meetings.map(meeting => {
        const commentCount = (meeting.comments || []).length;
        return `
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
                    <button onclick="openComments('${meeting.id}', 'meeting', '${escapeHtml(meeting.title)}')" style="background:none;border:none;color:var(--text-light);cursor:pointer;font-size:0.8rem;">
                        💬 ${commentCount > 0 ? commentCount : 'Add comment'}
                    </button>
                </div>
            </div>
        `;
    }).join('') || '<p style="color:var(--text-light);text-align:center;padding:2rem;">No meeting notes yet. Start by adding one!</p>';
}

// ==================== SEARCH FUNCTIONS ====================

function performGlobalSearch() {
    const query = document.getElementById('globalSearch').value.toLowerCase().trim();
    const containers = document.querySelectorAll('.search-filters input:checked');
    const types = Array.from(containers).map(c => c.value);
    const results = document.getElementById('searchResults');
    
    if (!query) {
        results.innerHTML = '<p style="color:var(--text-light);text-align:center;padding:2rem;">Enter a search term to find tasks, decisions, or meeting notes</p>';
        return;
    }
    
    let allResults = [];
    
    if (types.includes('tasks') && window.tasks) {
        window.tasks.forEach(task => {
            if (task.title.toLowerCase().includes(query) || 
                (task.description || '').toLowerCase().includes(query) ||
                (task.tags || []).some(t => t.toLowerCase().includes(query))) {
                allResults.push({ ...task, type: 'Task', status: task.status });
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
    
    // Sort by date
    allResults.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    results.innerHTML = allResults.length === 0 ? 
        '<p style="color:var(--text-light);text-align:center;padding:2rem;">No results found</p>' :
        allResults.map(item => `
            <div class="search-result-item" style="border-left-color: ${item.type === 'Task' ? 'var(--accent-color)' : item.type === 'Decision' ? 'var(--warning-color)' : 'var(--success-color)'}">
                <div class="result-type">
                    ${item.type}
                    ${item.status ? ` • ${item.status}` : ''}
                </div>
                <div class="result-title">${escapeHtml(item.title)}</div>
                ${item.description ? `<div>${escapeHtml(item.description.substring(0, 150))}${item.description.length > 150 ? '...' : ''}</div>` : ''}
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

// ==================== DASHBOARD ====================

function updateDashboard() {
    const stats = document.getElementById('dashboardStats');
    const totalTasks = window.tasks ? window.tasks.length : 0;
    const doneTasks = window.tasks ? window.tasks.filter(t => t.status === 'done').length : 0;
    const totalDecisions = window.decisions ? window.decisions.length : 0;
    const totalMeetings = window.meetings ? window.meetings.length : 0;
    const inProgress = window.tasks ? window.tasks.filter(t => t.status === 'progress').length : 0;

    stats.innerHTML = `
        <div class="stat-card">
            <span class="stat-number">${totalTasks}</span>
            <span class="stat-label">Total Tasks</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${doneTasks}</span>
            <span class="stat-label">Completed</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${inProgress}</span>
            <span class="stat-label">In Progress</span>
        </div>
        <div class="stat-card">
            <span class="stat-number">${totalDecisions + totalMeetings}</span>
            <span class="stat-label">Notes & Decisions</span>
        </div>
    `;

    // Recent activity
    const recent = document.getElementById('recentActivity');
    const allItems = [
        ...(window.tasks || []).map(t => ({ ...t, type: 'task', label: `Task: ${t.title}` })),
        ...(window.decisions || []).map(d => ({ ...d, type: 'decision', label: `Decision: ${d.title}` })),
        ...(window.meetings || []).map(m => ({ ...m, type: 'meeting', label: `Meeting: ${m.title}` }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 10);

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

// ==================== DARK MODE ====================

let darkMode = localStorage.getItem('darkMode') === 'true';

function toggleDarkMode() {
    darkMode = !darkMode;
    localStorage.setItem('darkMode', darkMode);
    applyDarkMode();
    showNotification(darkMode ? '🌙 Dark mode enabled' : '☀️ Light mode enabled');
}

function applyDarkMode() {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
}

function setupDarkMode() {
    applyDarkMode();
}

// ==================== NOTIFICATIONS ====================

function showNotification(message, duration = 3000) {
    const indicator = document.getElementById('saveIndicator');
    const originalText = indicator.textContent;
    const originalColor = indicator.style.color;
    
    indicator.textContent = message;
    indicator.style.color = 'var(--warning-color)';
    indicator.style.fontWeight = '600';
    
    setTimeout(() => {
        indicator.textContent = originalText;
        indicator.style.color = originalColor;
        indicator.style.fontWeight = '';
    }, duration);
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
                showNotification(`⚠️ Task "${task.title}" is due TODAY!`, 5000);
            } else if (daysUntil === 1) {
                showNotification(`⏰ Task "${task.title}" is due tomorrow!`, 5000);
            } else if (daysUntil === 7) {
                showNotification(`📅 Task "${task.title}" is due in 1 week`, 5000);
            }
        }
    });
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

// ==================== EXPORT/IMPORT ====================

function exportData() {
    const data = {
        tasks: window.tasks || [],
        decisions: window.decisions || [],
        meetings: window.meetings || [],
        exportedAt: new Date().toISOString(),
        version: '1.0'
    };
    
    const dataStr = JSON.stringify(data, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finance-app-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('📤 Data exported successfully!');
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
        
        // Validate data
        if (!data.tasks && !data.decisions && !data.meetings) {
            throw new Error('Invalid data format');
        }
        
        // Clear existing data
        const snapshot = await db.collection(COLLECTION).get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        
        // Import new data
        const importBatch = db.batch();
        const allItems = [
            ...(data.tasks || []).map(t => ({ ...t, type: 'task' })),
            ...(data.decisions || []).map(d => ({ ...d, type: 'decision' })),
            ...(data.meetings || []).map(m => ({ ...m, type: 'meeting' }))
        ];
        
        // Add each item with a new ID
        for (const item of allItems) {
            const newRef = db.collection(COLLECTION).doc();
            // Remove old ID and add import timestamp
            delete item.id;
            item.importedAt = firebase.firestore.FieldValue.serverTimestamp();
            importBatch.set(newRef, item);
        }
        
        await importBatch.commit();
        
        showNotification('✅ Data imported successfully!');
        event.target.value = '';
    } catch (error) {
        alert('Error importing data: ' + error.message);
        event.target.value = '';
    }
}

async function resetAllData() {
    if (!confirm('⚠️ This will DELETE ALL data. Are you sure?')) return;
    if (!confirm('🔴 Really? All tasks, decisions, and meeting notes will be gone forever!')) return;
    
    try {
        const snapshot = await db.collection(COLLECTION).get();
        const batch = db.batch();
        snapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        showNotification('🗑️ All data has been reset');
    } catch (error) {
        console.error('Error resetting data:', error);
        alert('Error resetting data. Please try again.');
    }
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
    
    if (imageTypes.includes(extension)) {
        preview.innerHTML = `<img src="${url}" alt="${name}">`;
    } else if (pdfTypes.includes(extension)) {
        preview.innerHTML = `<iframe src="${url}"></iframe>`;
    } else {
        preview.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p>📄 ${name}</p>
                <p style="font-size:0.85rem;color:var(--text-light);">Click the button below to download</p>
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
        // Load saved title
        const savedTitle = localStorage.getItem('appTitle');
        if (savedTitle) {
            titleEl.textContent = savedTitle;
        }
        
        titleEl.addEventListener('blur', () => {
            const newName = titleEl.textContent.trim();
            if (newName) {
                localStorage.setItem('appTitle', newName);
                showNotification(`📝 App name updated to "${newName}"`);
            } else {
                titleEl.textContent = 'Finance App';
                localStorage.setItem('appTitle', 'Finance App');
            }
        });

        titleEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                titleEl.blur();
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
    document.getElementById('taskForm').reset();
}

function openDecisionForm() {
    document.getElementById('decisionForm').style.display = 'block';
    document.getElementById('decisionForm').scrollIntoView({ behavior: 'smooth' });
}

function closeDecisionForm() {
    document.getElementById('decisionForm').style.display = 'none';
    document.getElementById('decisionForm').reset();
}

function openMeetingForm() {
    document.getElementById('meetingForm').style.display = 'block';
    document.getElementById('meetingForm').scrollIntoView({ behavior: 'smooth' });
}

function closeMeetingForm() {
    document.getElementById('meetingForm').style.display = 'none';
    document.getElementById('meetingForm').reset();
}

// ==================== MODAL CLOSE ON OUTSIDE CLICK ====================

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    const fileModal = document.getElementById('fileModal');
    if (e.target === fileModal) {
        closeFileModal();
    }
    
    const commentsModal = document.getElementById('commentsModal');
    if (e.target === commentsModal) {
        closeCommentsModal();
    }
});

// ==================== INITIALIZATION ====================

// Start the app
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});