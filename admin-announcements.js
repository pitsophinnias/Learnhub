// Admin Announcements Management Script
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadAnnouncements();
    setupForm();
    setupWebSocket();
});

let currentDeleteId = null;
let ws = null;
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'admin_login.html';
        return;
    }
    
    // Verify token is still valid
    try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 < Date.now()) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
        }
    } catch (error) {
        localStorage.removeItem('adminToken');
        window.location.href = 'admin_login.html';
    }
}

// Load announcements from server
async function loadAnnouncements() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/announcements`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        const announcements = await response.json();
        displayAnnouncements(announcements);
    } catch (error) {
        console.error('Error loading announcements:', error);
        showNotification('Error loading announcements', 'error');
    }
}

// Display announcements in grid
function displayAnnouncements(announcements) {
    const container = document.getElementById('announcementsList');
    
    if (announcements.length === 0) {
        container.innerHTML = `
            <div class="announcement-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <i class="fas fa-bullhorn" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                <h3>No Announcements Yet</h3>
                <p>Create your first announcement using the form above.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = announcements.map(announcement => `
        <div class="announcement-card" data-id="${announcement.id}">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 10px;">
                <h3>${escapeHtml(announcement.title)}</h3>
                <div style="display: flex; gap: 5px;">
                    <button onclick="editAnnouncement(${announcement.id})" class="btn" style="padding: 5px 10px; font-size: 0.9rem;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="openDeleteModal(${announcement.id})" class="btn" style="background: #e74c3c; padding: 5px 10px; font-size: 0.9rem;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="announcement-date">
                <i class="far fa-calendar"></i> ${formatDate(announcement.created_at)}
                ${announcement.author ? ` • <i class="fas fa-user"></i> ${escapeHtml(announcement.author)}` : ''}
            </div>
            <p>${escapeHtml(announcement.content)}</p>
        </div>
    `).join('');
}

// Setup announcement form
function setupForm() {
    const form = document.getElementById('announcementForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const title = document.getElementById('announcementTitle').value.trim();
        const content = document.getElementById('announcementContent').value.trim();
        
        if (!title || !content) {
            showNotification('Please fill in all fields', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_BASE}/api/announcements`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });
            
            if (response.status === 401) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
                return;
            }
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification('Announcement published successfully!', 'success');
                form.reset();
                loadAnnouncements();
            } else {
                showNotification(result.error || 'Error creating announcement', 'error');
            }
        } catch (error) {
            console.error('Error creating announcement:', error);
            showNotification('Error creating announcement', 'error');
        }
    });
}

// Edit announcement
function editAnnouncement(id) {
    const card = document.querySelector(`.announcement-card[data-id="${id}"]`);
    const title = card.querySelector('h3').textContent;
    const content = card.querySelector('p').textContent;
    
    // Fill form with existing data
    document.getElementById('announcementTitle').value = title;
    document.getElementById('announcementContent').value = content;
    
    // Change form to update mode
    const form = document.getElementById('announcementForm');
    const submitBtn = form.querySelector('button[type="submit"]');
    
    // Store the ID we're editing
    form.dataset.editingId = id;
    submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Announcement';
    submitBtn.style.background = '#f39c12';
    
    // Remove old submit handler
    form.removeEventListener('submit', form.submitHandler);
    
    // Add update handler
    form.submitHandler = async function(e) {
        e.preventDefault();
        
        const title = document.getElementById('announcementTitle').value.trim();
        const content = document.getElementById('announcementContent').value.trim();
        
        if (!title || !content) {
            showNotification('Please fill in all fields', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_BASE}/api/announcements/${id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ title, content })
            });
            
            if (response.status === 401) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
                return;
            }
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification('Announcement updated successfully!', 'success');
                form.reset();
                delete form.dataset.editingId;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Publish Announcement';
                submitBtn.style.background = '';
                loadAnnouncements();
                
                // Restore original handler
                form.removeEventListener('submit', form.submitHandler);
                setupForm();
            } else {
                showNotification(result.error || 'Error updating announcement', 'error');
            }
        } catch (error) {
            console.error('Error updating announcement:', error);
            showNotification('Error updating announcement', 'error');
        }
    };
    
    form.addEventListener('submit', form.submitHandler);
}

// Delete announcement
function openDeleteModal(id) {
    currentDeleteId = id;
    document.getElementById('deleteModal').style.display = 'block';
}

function closeDeleteModal() {
    currentDeleteId = null;
    document.getElementById('deleteModal').style.display = 'none';
}

async function confirmDelete() {
    if (!currentDeleteId) return;
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/announcements/${currentDeleteId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        if (response.ok) {
            showNotification('Announcement deleted successfully!', 'success');
            closeDeleteModal();
            loadAnnouncements();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Error deleting announcement', 'error');
        }
    } catch (error) {
        console.error('Error deleting announcement:', error);
        showNotification('Error deleting announcement', 'error');
    }
}

// WebSocket for real-time notifications
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('WebSocket connected');
        // Send admin login message if we have an ID
        const token = localStorage.getItem('adminToken');
        if (token) {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                ws.send(JSON.stringify({
                    type: 'admin_login',
                    adminId: payload.id
                }));
            } catch (error) {
                console.error('Error parsing token:', error);
            }
        }
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'announcement' || data.type === 'announcement_deleted') {
            loadAnnouncements(); // Refresh list
        }
        if (data.isBrowserNotification && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(data.message);
        }
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = function() {
        console.log('WebSocket disconnected');
        // Try to reconnect after 5 seconds
        setTimeout(setupWebSocket, 5000);
    };
}

// Utility functions
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    // Create new notification
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        ${message}
        <span class="close" onclick="this.parentElement.remove()">&times;</span>
    `;
    
    // Style based on type
    if (type === 'success') {
        notification.style.background = '#2ecc71';
    } else if (type === 'error') {
        notification.style.background = '#e74c3c';
    } else if (type === 'warning') {
        notification.style.background = '#f39c12';
    }
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Request notification permission
if ('Notification' in window) {
    Notification.requestPermission();
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('deleteModal');
    if (event.target === modal) {
        closeDeleteModal();
    }
};