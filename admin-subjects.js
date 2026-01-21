// Admin Subjects Management Script
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadSubjects();
    setupForm();
    setupWebSocket();
});

let currentSubjectId = null;
let currentAssignments = new Set();
let allTutors = [];
const API_BASE = window.location.hostname === 'localhost' ? 'http://localhost:3000' : '';

// Check authentication
function checkAuth() {
    const token = localStorage.getItem('adminToken');
    if (!token) {
        window.location.href = 'admin_login.html';
        return;
    }
    
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

// Load subjects from server
async function loadSubjects() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        const subjects = await response.json();
        displaySubjects(subjects);
    } catch (error) {
        console.error('Error loading subjects:', error);
        showNotification('Error loading subjects', 'error');
    }
}

// Display subjects in table
function displaySubjects(subjects) {
    const tbody = document.getElementById('subjectsList');
    
    if (!subjects || subjects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px;">
                    <i class="fas fa-book" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>No Subjects Found</h3>
                    <p>Add your first subject using the form above.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = subjects.map(subject => `
        <tr data-id="${subject.id}">
            <td>${subject.id}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="${subject.icon || 'fas fa-book'}" style="font-size: 1.5rem; color: #3498db;"></i>
                    <div>
                        <strong>${escapeHtml(subject.name)}</strong>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(subject.description || 'No description')}</td>
            <td>
                <div>
                    <strong>${subject.tutor_count || 0} tutors</strong>
                    ${subject.tutor_names ? `<br><small>${escapeHtml(subject.tutor_names)}</small>` : ''}
                </div>
            </td>
            <td>
                <span class="status-badge ${subject.is_available === false ? 'inactive' : 'active'}">
                    ${subject.is_available === false ? 'Inactive' : 'Active'}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                    <button onclick="openAssignModal(${subject.id}, '${escapeHtml(subject.name)}')" class="btn" style="padding: 5px 10px; font-size: 0.9rem;">
                        <i class="fas fa-user-plus"></i> Assign
                    </button>
                    <button onclick="toggleSubjectStatus(${subject.id}, ${subject.is_available !== false})" class="btn" style="padding: 5px 10px; font-size: 0.9rem; background: ${subject.is_available === false ? '#2ecc71' : '#f39c12'};">
                        <i class="fas fa-power-off"></i> ${subject.is_available === false ? 'Enable' : 'Disable'}
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Setup subject form
function setupForm() {
    const form = document.getElementById('subjectForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('subjectName').value.trim();
        const description = document.getElementById('subjectDescription').value.trim();
        const icon = document.getElementById('subjectIcon').value.trim();
        
        if (!name) {
            showNotification('Subject name is required', 'error');
            return;
        }
        
        try {
            const token = localStorage.getItem('adminToken');
            const response = await fetch(`${API_BASE}/api/admin/subjects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name, description, icon })
            });
            
            if (response.status === 401) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
                return;
            }
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification('Subject added successfully!', 'success');
                form.reset();
                document.getElementById('subjectIcon').value = 'fas fa-book';
                loadSubjects();
            } else {
                showNotification(result.error || 'Error adding subject', 'error');
            }
        } catch (error) {
            console.error('Error adding subject:', error);
            showNotification('Error adding subject', 'error');
        }
    });
}

// Open assign tutors modal
async function openAssignModal(subjectId, subjectName) {
    currentSubjectId = subjectId;
    currentAssignments.clear();
    
    document.getElementById('modalSubjectName').textContent = subjectName;
    document.getElementById('assignModal').style.display = 'block';
    
    try {
        await loadAvailableTutors();
        await loadCurrentAssignments();
        updateAvailableTutorsList();
    } catch (error) {
        console.error('Error loading data for assignment:', error);
        showNotification('Error loading tutor data', 'error');
    }
}

// Load available tutors
async function loadAvailableTutors() {
    try {
        console.log('Loading available tutors for assignment...');
        const token = localStorage.getItem('adminToken');
        
        if (!token) {
            console.error('No token found');
            window.location.href = 'admin_login.html';
            return;
        }
        
        // Debug: Log the token (first few chars)
        console.log('Token exists:', token.substring(0, 20) + '...');
        
        const url = `${API_BASE}/api/admin/tutors?nocache=${Date.now()}`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        console.log('Response status:', response.status);
        
        if (response.status === 401) {
            console.log('Unauthorized, redirecting to login');
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        if (!response.ok) {
            console.error('API error:', response.status, response.statusText);
            const errorText = await response.text();
            console.error('Error response:', errorText);
            throw new Error(`API error: ${response.status}`);
        }
        
        const tutors = await response.json();
        console.log(`Received ${tutors.length} tutors:`, tutors.map(t => ({id: t.id, name: t.name})));
        
        allTutors = tutors;
        
        // Update the UI
        updateAvailableTutorsList();
        
    } catch (error) {
        console.error('Error loading tutors:', error);
        showNotification('Error loading tutors: ' + error.message, 'error');
        allTutors = [];
    }
}

// Load current assignments for this subject
async function loadCurrentAssignments() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/subjects/${currentSubjectId}/tutors`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
            const assignments = await response.json();
            assignments.forEach(tutor => {
                currentAssignments.add(tutor.id.toString());
            });
        }
    } catch (error) {
        console.error('Error loading assignments:', error);
    }
}

// Update available tutors list
function updateAvailableTutorsList() {
    const container = document.getElementById('availableTutors');
    const searchTerm = document.getElementById('tutorSearch').value.toLowerCase();
    
    const filteredTutors = allTutors.filter(tutor => 
        tutor.name.toLowerCase().includes(searchTerm) ||
        (tutor.experience && tutor.experience.toLowerCase().includes(searchTerm))
    );
    
    if (filteredTutors.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: #666;">
                <i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 10px;"></i>
                <p>No tutors found</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTutors.map(tutor => `
        <div class="tutor-assign-item ${currentAssignments.has(tutor.id.toString()) ? 'assigned' : ''}" 
             data-id="${tutor.id}"
             onclick="toggleTutorAssignment(${tutor.id})">
            <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #eee; border-radius: 5px; margin-bottom: 5px; cursor: pointer;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user"></i>
                </div>
                <div style="flex: 1;">
                    <strong>${escapeHtml(tutor.name)}</strong><br>
                    <small style="color: #666;">${escapeHtml(tutor.experience || 'No experience listed')}</small>
                </div>
                <div>
                    ${renderStars(tutor.rating || 0)}
                    <span style="font-weight: bold; color: #f39c12;">${tutor.rating || 0}</span>
                </div>
                <div>
                    <i class="fas fa-check-circle" style="color: ${currentAssignments.has(tutor.id.toString()) ? '#2ecc71' : '#ddd'};"></i>
                </div>
            </div>
        </div>
    `).join('');
}

// Toggle tutor assignment
function toggleTutorAssignment(tutorId) {
    const idStr = tutorId.toString();
    if (currentAssignments.has(idStr)) {
        currentAssignments.delete(idStr);
    } else {
        currentAssignments.add(idStr);
    }
    updateAvailableTutorsList();
}

// Save assignments
async function saveAssignments() {
    if (!currentSubjectId) return;
    
    try {
        const token = localStorage.getItem('adminToken');
        const assignments = Array.from(currentAssignments);
        
        // First, remove all existing assignments for this subject
        await fetch(`${API_BASE}/api/admin/subjects/${currentSubjectId}/assignments`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Then add new assignments
        for (const tutorId of assignments) {
            await fetch(`${API_BASE}/api/admin/tutors/${tutorId}/subjects/${currentSubjectId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
        }
        
        showNotification('Assignments saved successfully!', 'success');
        closeAssignModal();
        loadSubjects();
    } catch (error) {
        console.error('Error saving assignments:', error);
        showNotification('Error saving assignments', 'error');
    }
}

// Toggle subject status
async function toggleSubjectStatus(subjectId, isCurrentlyActive) {
    if (!confirm(`Are you sure you want to ${isCurrentlyActive ? 'disable' : 'enable'} this subject?`)) {
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/subjects/${subjectId}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ is_available: !isCurrentlyActive })
        });
        
        if (response.ok) {
            showNotification(`Subject ${isCurrentlyActive ? 'disabled' : 'enabled'} successfully!`, 'success');
            loadSubjects();
        } else {
            const result = await response.json();
            showNotification(result.error || 'Error updating subject status', 'error');
        }
    } catch (error) {
        console.error('Error toggling subject status:', error);
        showNotification('Error updating subject status', 'error');
    }
}

// Close assign modal
function closeAssignModal() {
    currentSubjectId = null;
    currentAssignments.clear();
    document.getElementById('assignModal').style.display = 'none';
    document.getElementById('tutorSearch').value = '';
}

// Setup WebSocket
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
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
        if (data.type === 'subject_added') {
            loadSubjects();
        }
    };
}

// Search tutors in real-time
document.getElementById('tutorSearch')?.addEventListener('input', updateAvailableTutorsList);

// Utility functions
function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            stars += '<i class="fas fa-star" style="color: #f39c12; font-size: 0.8rem;"></i>';
        } else if (i === Math.ceil(rating) && rating % 1 > 0) {
            stars += '<i class="fas fa-star-half-alt" style="color: #f39c12; font-size: 0.8rem;"></i>';
        } else {
            stars += '<i class="far fa-star" style="color: #ddd; font-size: 0.8rem;"></i>';
        }
    }
    return stars;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showNotification(message, type = 'info') {
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        ${message}
        <span class="close" onclick="this.parentElement.remove()">&times;</span>
    `;
    
    if (type === 'success') {
        notification.style.background = '#2ecc71';
    } else if (type === 'error') {
        notification.style.background = '#e74c3c';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('assignModal');
    if (event.target === modal) {
        closeAssignModal();
    }
};

// Temporary workaround - fetch all data
async function loadAllData() {
    try {
        // Try to get tutors from a public endpoint first
        const publicResponse = await fetch('/api/tutors/all');
        if (publicResponse.ok) {
            allTutors = await publicResponse.json();
            console.log('Got tutors from public endpoint:', allTutors.length);
            return;
        }
        
        // If that fails, try to get from your existing bookings endpoint
        const token = localStorage.getItem('adminToken');
        if (token) {
            const bookingsResponse = await fetch('/api/bookings', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (bookingsResponse.ok) {
                const bookings = await bookingsResponse.json();
                // Extract unique tutors from bookings
                const tutorNames = [...new Set(bookings.map(b => b.tutor_name))];
                allTutors = tutorNames.map(name => ({ id: name, name: name }));
                console.log('Extracted tutors from bookings:', allTutors.length);
            }
        }
    } catch (error) {
        console.error('Error in workaround:', error);
    }
}

// Add this function to manually sync
async function syncTutorSubjects() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/sync-tutor-subjects`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(`Sync completed: ${result.added} assignments added`, 'success');
            // Reload subjects to show updated counts
            loadSubjects();
        } else {
            showNotification(result.error || 'Sync failed', 'error');
        }
    } catch (error) {
        console.error('Error syncing:', error);
        showNotification('Error syncing tutor subjects', 'error');
    }
}

// Add a sync button to your HTML (in admin-subjects.html, add this near the top):
// <button onclick="syncTutorSubjects()" class="btn" style="float: right; margin-top: 20px;">
//     <i class="fas fa-sync-alt"></i> Sync Tutor Subjects
// </button>

// Add CSS for the page
const style = document.createElement('style');
style.textContent = `
    .status-badge {
        display: inline-block;
        padding: 3px 8px;
        border-radius: 12px;
        font-size: 0.8rem;
        font-weight: bold;
    }
    
    .status-badge.active {
        background: #d4edda;
        color: #155724;
    }
    
    .status-badge.inactive {
        background: #f8d7da;
        color: #721c24;
    }
    
    .tutor-assign-item {
        cursor: pointer;
        transition: all 0.3s ease;
    }
    
    .tutor-assign-item:hover {
        background: #f5f5f5;
    }
    
    .tutor-assign-item.assigned {
        background: #e8f5e9;
    }
    
    .tutor-assign-item.assigned:hover {
        background: #dcedc8;
    }
`;
document.head.appendChild(style);