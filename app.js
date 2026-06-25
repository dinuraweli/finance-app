// Data Management Module
const AppData = {
    data: null,
    saveTimeout: null,

    // Initialize with default data if none exists
    init() {
        const saved = localStorage.getItem('financeAppData');
        if (saved) {
            try {
                this.data = JSON.parse(saved);
            } catch (e) {
                console.error('Error parsing saved data:', e);
                this.setDefaultData();
            }
        } else {
            this.setDefaultData();
        }
        this.save();
    },

    setDefaultData() {
        this.data = {
            appName: 'Finance App',
            tasks: [],
            decisions: [],
            meetings: [],
            files: {},
            nextId: 1
        };
    },

    // Save to localStorage with debounce
    save() {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            localStorage.setItem('financeAppData', JSON.stringify(this.data));
            this.updateSaveIndicator(true);
        }, 300);
    },

    // Force immediate save
    saveImmediate() {
        localStorage.setItem('financeAppData', JSON.stringify(this.data));
        this.updateSaveIndicator(true);
    },

    // Update save indicator
    updateSaveIndicator(saved) {
        const indicator = document.getElementById('saveIndicator');
        if (indicator) {
            indicator.textContent = saved ? '● Saved' : '● Saving...';
            indicator.className = 'save-indicator' + (saved ? '' : ' saving');
            if (saved) {
                setTimeout(() => {
                    indicator.style.opacity = '0.6';
                    setTimeout(() => {
                        indicator.style.opacity = '1';
                    }, 200);
                }, 500);
            }
        }
    },

    // Get next ID
    getNextId() {
        return this.data.nextId++;
    },

    // Task methods
    addTask(taskData) {
        const task = {
            id: this.getNextId(),
            ...taskData,
            createdAt: new Date().toISOString(),
            status: 'todo'
        };
        this.data.tasks.push(task);
        this.save();
        renderTasks();
        updateDashboard();
        return task;
    },

    updateTaskStatus(taskId, newStatus) {
        const task = this.data.tasks.find(t => t.id === taskId);
        if (task) {
            task.status = newStatus;
            this.save();
            renderTasks();
            updateDashboard();
        }
    },

    deleteTask(taskId) {
        this.data.tasks = this.data.tasks.filter(t => t.id !== taskId);
        this.save();
        renderTasks();
        updateDashboard();
    },

    getTasksByStatus(status) {
        return this.data.tasks.filter(t => t.status === status);
    },

    // Decision methods
    addDecision(decisionData) {
        const decision = {
            id: this.getNextId(),
            ...decisionData,
            createdAt: new Date().toISOString()
        };
        this.data.decisions.push(decision);
        this.save();
        renderDecisions();
        updateDashboard();
        return decision;
    },

    deleteDecision(decisionId) {
        // Also remove any associated files
        const decision = this.data.decisions.find(d => d.id === decisionId);
        if (decision && decision.fileId) {
            delete this.data.files[decision.fileId];
        }
        this.data.decisions = this.data.decisions.filter(d => d.id !== decisionId);
        this.save();
        renderDecisions();
        updateDashboard();
    },

    // Meeting methods
    addMeeting(meetingData) {
        const meeting = {
            id: this.getNextId(),
            ...meetingData,
            createdAt: new Date().toISOString()
        };
        this.data.meetings.push(meeting);
        this.save();
        renderMeetings();
        updateDashboard();
        return meeting;
    },

    deleteMeeting(meetingId) {
        const meeting = this.data.meetings.find(m => m.id === meetingId);
        if (meeting && meeting.fileId) {
            delete this.data.files[meeting.fileId];
        }
        this.data.meetings = this.data.meetings.filter(m => m.id !== meetingId);
        this.save();
        renderMeetings();
        updateDashboard();
    },

    // File methods
    storeFile(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const fileId = 'file_' + Date.now() + '_' + file.name;
                this.data.files[fileId] = {
                    name: file.name,
                    type: file.type,
                    data: e.target.result
                };
                this.save();
                resolve(fileId);
            };
            reader.readAsDataURL(file);
        });
    },

    getFile(fileId) {
        return this.data.files[fileId];
    },

    // Export data
    exportData() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finance-app-data-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    },

    // Import data
    importData(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    // Validate data structure
                    if (data.tasks && data.decisions && data.meetings) {
                        this.data = data;
                        this.saveImmediate();
                        this.refreshAll();
                        resolve();
                    } else {
                        reject(new Error('Invalid data format'));
                    }
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    },

    // Refresh all UI
    refreshAll() {
        updateAppTitle();
        renderTasks();
        renderDecisions();
        renderMeetings();
        updateDashboard();
    }
};

// ==================== UI Functions ====================

// Navigation
function setupNavigation() {
    const sidebarBtns = document.querySelectorAll('.sidebar-btn');
    const sections = document.querySelectorAll('.section');

    sidebarBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active button
            sidebarBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Show corresponding section
            const sectionId = btn.dataset.section;
            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(sectionId).classList.add('active');
        });
    });
}

// App Title
function updateAppTitle() {
    const titleEl = document.getElementById('appTitle');
    if (titleEl) {
        titleEl.textContent = AppData.data.appName || 'Finance App';
    }
}

function setupEditableTitle() {
    const titleEl = document.getElementById('appTitle');
    if (titleEl) {
        titleEl.addEventListener('blur', () => {
            const newName = titleEl.textContent.trim();
            if (newName) {
                AppData.data.appName = newName;
                AppData.save();
            } else {
                titleEl.textContent = AppData.data.appName || 'Finance App';
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

// ==================== Task Functions ====================

function openTaskForm() {
    document.getElementById('taskForm').style.display = 'block';
    document.getElementById('taskForm').scrollIntoView({ behavior: 'smooth' });
}

function closeTaskForm() {
    document.getElementById('taskForm').style.display = 'none';
    document.getElementById('taskForm').reset();
}

function addTask(event) {
    event.preventDefault();
    const title = document.getElementById('taskTitle').value.trim();
    const description = document.getElementById('taskDescription').value.trim();
    const priority = document.getElementById('taskPriority').value;
    const dueDate = document.getElementById('taskDueDate').value;
    const assignedTo = document.getElementById('taskAssignedTo').value;

    if (!title) return;

    AppData.addTask({
        title,
        description,
        priority,
        dueDate,
        assignedTo
    });

    closeTaskForm();
    document.getElementById('taskTitle').value = '';
    document.getElementById('taskDescription').value = '';
}

function renderTasks() {
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
        const tasks = AppData.getTasksByStatus(status);
        containers[status].innerHTML = tasks.map(task => `
            <div class="task-item ${task.priority}">
                <h4>${escapeHtml(task.title)}</h4>
                ${task.description ? `<p style="font-size:0.85rem;color:var(--text-secondary);margin:0.25rem 0">${escapeHtml(task.description)}</p>` : ''}
                <div class="task-meta">
                    ${task.assignedTo ? `<span>👤 ${escapeHtml(task.assignedTo)}</span>` : ''}
                    ${task.dueDate ? `<span>📅 ${formatDate(task.dueDate)}</span>` : ''}
                    <span>⚡ ${task.priority}</span>
                </div>
                <div class="task-actions">
                    ${status !== 'todo' ? `<button onclick="AppData.updateTaskStatus(${task.id}, 'todo')">← To Do</button>` : ''}
                    ${status !== 'progress' ? `<button onclick="AppData.updateTaskStatus(${task.id}, 'progress')">→ In Progress</button>` : ''}
                    ${status !== 'done' ? `<button onclick="AppData.updateTaskStatus(${task.id}, 'done')">✓ Done</button>` : ''}
                    <button class="task-delete" onclick="if(confirm('Delete this task?')) AppData.deleteTask(${task.id})">×</button>
                </div>
            </div>
        `).join('');

        counts[status].textContent = tasks.length;
    });
}

// ==================== Decision Functions ====================

function openDecisionForm() {
    document.getElementById('decisionForm').style.display = 'block';
    document.getElementById('decisionForm').scrollIntoView({ behavior: 'smooth' });
}

function closeDecisionForm() {
    document.getElementById('decisionForm').style.display = 'none';
    document.getElementById('decisionForm').reset();
}

async function addDecision(event) {
    event.preventDefault();
    const title = document.getElementById('decisionTitle').value.trim();
    const description = document.getElementById('decisionDescription').value.trim();
    const date = document.getElementById('decisionDate').value;
    const fileInput = document.getElementById('decisionFile');

    if (!title) return;

    let fileId = null;
    if (fileInput.files && fileInput.files[0]) {
        fileId = await AppData.storeFile(fileInput.files[0]);
    }

    AppData.addDecision({
        title,
        description,
        date: date || new Date().toISOString().split('T')[0],
        fileId
    });

    closeDecisionForm();
    document.getElementById('decisionTitle').value = '';
    document.getElementById('decisionDescription').value = '';
    document.getElementById('decisionFile').value = '';
}

function renderDecisions() {
    const container = document.getElementById('decisionsList');
    const decisions = AppData.data.decisions.sort((a, b) => 
        new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
    );

    container.innerHTML = decisions.map(decision => `
        <div class="decision-item">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                    <h4>${escapeHtml(decision.title)}</h4>
                    <span class="decision-date">${formatDate(decision.date || decision.createdAt)}</span>
                </div>
                <button class="decision-delete" onclick="if(confirm('Delete this decision?')) AppData.deleteDecision(${decision.id})">×</button>
            </div>
            ${decision.description ? `<p class="decision-description">${escapeHtml(decision.description)}</p>` : ''}
            ${decision.fileId ? `
                <div class="decision-attachments">
                    <span class="attachment" onclick="previewFile('${decision.fileId}')">
                        📎 ${escapeHtml(AppData.getFile(decision.fileId)?.name || 'Attachment')}
                    </span>
                </div>
            ` : ''}
        </div>
    `).join('') || '<p style="color:var(--text-light);text-align:center;padding:2rem;">No decisions yet. Start by adding one!</p>';
}

// ==================== Meeting Functions ====================

function openMeetingForm() {
    document.getElementById('meetingForm').style.display = 'block';
    document.getElementById('meetingForm').scrollIntoView({ behavior: 'smooth' });
}

function closeMeetingForm() {
    document.getElementById('meetingForm').style.display = 'none';
    document.getElementById('meetingForm').reset();
}

async function addMeetingNote(event) {
    event.preventDefault();
    const title = document.getElementById('meetingTitle').value.trim();
    const date = document.getElementById('meetingDate').value;
    const notes = document.getElementById('meetingNotes').value.trim();
    const fileInput = document.getElementById('meetingFile');

    if (!title) return;

    let fileId = null;
    if (fileInput.files && fileInput.files[0]) {
        fileId = await AppData.storeFile(fileInput.files[0]);
    }

    AppData.addMeeting({
        title,
        date: date || new Date().toISOString().split('T')[0],
        notes,
        fileId
    });

    closeMeetingForm();
    document.getElementById('meetingTitle').value = '';
    document.getElementById('meetingNotes').value = '';
    document.getElementById('meetingFile').value = '';
}

function renderMeetings() {
    const container = document.getElementById('meetingsList');
    const meetings = AppData.data.meetings.sort((a, b) => 
        new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
    );

    container.innerHTML = meetings.map(meeting => `
        <div class="meeting-item">
            <div style="display:flex;justify-content:space-between;align-items:start">
                <div>
                    <h4>${escapeHtml(meeting.title)}</h4>
                    <span class="meeting-date">${formatDate(meeting.date || meeting.createdAt)}</span>
                </div>
                <button class="meeting-delete" onclick="if(confirm('Delete this meeting note?')) AppData.deleteMeeting(${meeting.id})">×</button>
            </div>
            ${meeting.notes ? `<p class="meeting-notes">${escapeHtml(meeting.notes)}</p>` : ''}
            ${meeting.fileId ? `
                <div class="meeting-attachments">
                    <span class="attachment" onclick="previewFile('${meeting.fileId}')">
                        📎 ${escapeHtml(AppData.getFile(meeting.fileId)?.name || 'Attachment')}
                    </span>
                </div>
            ` : ''}
        </div>
    `).join('') || '<p style="color:var(--text-light);text-align:center;padding:2rem;">No meeting notes yet. Start by adding one!</p>';
}

// ==================== File Preview ====================

function previewFile(fileId) {
    const file = AppData.getFile(fileId);
    if (!file) return;

    const modal = document.getElementById('fileModal');
    const preview = document.getElementById('filePreview');

    if (file.type.startsWith('image/')) {
        preview.innerHTML = `<img src="${file.data}" alt="${file.name}">`;
    } else if (file.type === 'application/pdf') {
        preview.innerHTML = `<iframe src="${file.data}"></iframe>`;
    } else {
        preview.innerHTML = `
            <div style="text-align:center;padding:2rem;">
                <p>📄 ${file.name}</p>
                <p style="font-size:0.85rem;color:var(--text-light);">File type: ${file.type}</p>
                <a href="${file.data}" download="${file.name}" class="btn-primary" style="display:inline-block;padding:0.5rem 1rem;margin-top:1rem;text-decoration:none;color:white;border-radius:6px;">
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

// ==================== Dashboard ====================

function updateDashboard() {
    const stats = document.getElementById('dashboardStats');
    const totalTasks = AppData.data.tasks.length;
    const doneTasks = AppData.getTasksByStatus('done').length;
    const totalDecisions = AppData.data.decisions.length;
    const totalMeetings = AppData.data.meetings.length;

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
        ...AppData.data.tasks.map(t => ({ ...t, type: 'task', label: `Task: ${t.title}` })),
        ...AppData.data.decisions.map(d => ({ ...d, type: 'decision', label: `Decision: ${d.title}` })),
        ...AppData.data.meetings.map(m => ({ ...m, type: 'meeting', label: `Meeting: ${m.title}` }))
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);

    recent.innerHTML = allItems.length ? allItems.map(item => `
        <div class="recent-item">
            <span>${escapeHtml(item.label)}</span>
            <span class="recent-type">${item.type}</span>
        </div>
    `).join('') : '<p style="color:var(--text-light);text-align:center;padding:1rem;">No recent activity</p>';
}

// ==================== Utility Functions ====================

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
            day: 'numeric' 
        });
    } catch (e) {
        return dateStr;
    }
}

// ==================== Export/Import ====================

function exportData() {
    AppData.exportData();
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (confirm('This will replace all current data. Continue?')) {
        AppData.importData(file).then(() => {
            alert('Data imported successfully!');
            event.target.value = '';
        }).catch(err => {
            alert('Error importing data: ' + err.message);
            event.target.value = '';
        });
    } else {
        event.target.value = '';
    }
}

// ==================== Auto-save & Periodic Backup ====================

// Auto-save when leaving the page
window.addEventListener('beforeunload', () => {
    AppData.saveImmediate();
});

// Periodic backup every 30 seconds
setInterval(() => {
    AppData.save();
}, 30000);

// ==================== Initialization ====================

function init() {
    // Initialize data
    AppData.init();
    
    // Setup UI
    setupNavigation();
    setupEditableTitle();
    
    // Render everything
    updateAppTitle();
    renderTasks();
    renderDecisions();
    renderMeetings();
    updateDashboard();
    
    // Auto-save title changes
    const titleEl = document.getElementById('appTitle');
    if (titleEl) {
        titleEl.addEventListener('input', () => {
            AppData.data.appName = titleEl.textContent.trim() || 'Finance App';
            AppData.save();
        });
    }

    // Close modal on outside click
    document.getElementById('fileModal').addEventListener('click', (e) => {
        if (e.target === e.currentTarget) {
            closeFileModal();
        }
    });

    console.log('Finance App initialized successfully!');
    console.log(`📊 ${AppData.data.tasks.length} tasks, ${AppData.data.decisions.length} decisions, ${AppData.data.meetings.length} meetings`);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}