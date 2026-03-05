// Admin Subjects Management Script
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadSubjects();
    setupForm();
    setupWebSocket();
    addLevelFilter();
});

let currentSubjectId = null;
let currentAssignments = new Set();
let allTutors = [];
let currentSubjectLevel = null;
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

// Display subjects in table with level badges
function displaySubjects(subjects) {
    const tbody = document.getElementById('subjectsList');
    
    if (!subjects || subjects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-book" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>No Subjects Found</h3>
                    <p>Add your first subject using the form above.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = subjects.map(subject => {
        // Determine level badge
        let levelBadge = '';
        if (subject.level === 'primary') {
            levelBadge = '<span class="level-badge primary">Primary</span>';
        } else if (subject.level === 'high') {
            levelBadge = '<span class="level-badge high">High School</span>';
        } else if (subject.level === 'both') {
            levelBadge = '<span class="level-badge both">Both</span>';
        } else {
            levelBadge = '<span class="level-badge high">High School</span>'; // Default
        }
        
        return `
        <tr data-id="${subject.id}">
            <td>${subject.id}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="${subject.icon || 'fas fa-book'}" style="font-size: 1.5rem; color: #3498db;"></i>
                    <div>
                        <strong>${escapeHtml(subject.name)}</strong>
                        <br>${levelBadge}
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
                    <button onclick="openAssignModal(${subject.id}, '${escapeHtml(subject.name)}', '${subject.level || 'high'}')" class="btn" style="padding: 5px 10px; font-size: 0.9rem;">
                        <i class="fas fa-user-plus"></i> Assign
                    </button>
                    <button onclick="toggleSubjectStatus(${subject.id}, ${subject.is_available !== false})" class="btn" style="padding: 5px 10px; font-size: 0.9rem; background: ${subject.is_available === false ? '#2ecc71' : '#f39c12'};">
                        <i class="fas fa-power-off"></i> ${subject.is_available === false ? 'Enable' : 'Disable'}
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// Setup subject form with level
function setupForm() {
    const form = document.getElementById('subjectForm');
    
    // Ensure level field exists
    ensureSubjectLevelField();
    
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('subjectName').value.trim();
        const description = document.getElementById('subjectDescription').value.trim();
        const icon = document.getElementById('subjectIcon').value.trim();
        const level = document.getElementById('subjectLevel').value;
        
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
                body: JSON.stringify({ name, description, icon, level })
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
                document.getElementById('subjectLevel').value = 'high'; // Reset to default
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

// Ensure subject level field exists
function ensureSubjectLevelField() {
    const existingLevel = document.getElementById('subjectLevel');
    if (!existingLevel) {
        const nameGroup = document.querySelector('#subjectName').closest('.form-group');
        const levelGroup = document.createElement('div');
        levelGroup.className = 'form-group';
        levelGroup.innerHTML = `
            <label for="subjectLevel"><i class="fas fa-school"></i> Education Level</label>
            <select id="subjectLevel" required style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px;">
                <option value="high">High School</option>
                <option value="primary">Primary School</option>
                <option value="both">Both (Primary & High School)</option>
            </select>
        `;
        nameGroup.after(levelGroup);
    }
}

// Add level filter to the page
function addLevelFilter() {
    const subjectsSection = document.querySelector('#subjectsTable');
    if (!subjectsSection) return;
    
    const filterDiv = document.createElement('div');
    filterDiv.style.cssText = 'margin-bottom: 20px; display: flex; gap: 10px; align-items: center;';
    filterDiv.innerHTML = `
        <label><i class="fas fa-filter"></i> Filter by Level:</label>
        <select id="levelFilter" style="padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
            <option value="all">All Subjects</option>
            <option value="high">High School</option>
            <option value="primary">Primary School</option>
            <option value="both">Both Levels</option>
        </select>
    `;
    
    subjectsSection.parentNode.insertBefore(filterDiv, subjectsSection);
    
    document.getElementById('levelFilter').addEventListener('change', function() {
        filterSubjectsByLevel(this.value);
    });
}

// Filter subjects by level
function filterSubjectsByLevel(level) {
    const rows = document.querySelectorAll('#subjectsList tr');
    rows.forEach(row => {
        if (level === 'all') {
            row.style.display = '';
            return;
        }
        
        const levelBadge = row.querySelector('.level-badge');
        if (levelBadge) {
            const badgeText = levelBadge.textContent.toLowerCase();
            if (badgeText.includes(level) || (level === 'both' && badgeText.includes('both'))) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        }
    });
}

// Open assign tutors modal (updated to include subject level)
async function openAssignModal(subjectId, subjectName, subjectLevel) {
    currentSubjectId = subjectId;
    currentSubjectLevel = subjectLevel || 'high';
    currentAssignments.clear();
    
    document.getElementById('modalSubjectName').textContent = subjectName;
    document.getElementById('assignModal').style.display = 'block';
    
    // Add level indicator to modal
    const modalHeader = document.querySelector('#assignModal h3');
    const levelDisplay = subjectLevel === 'primary' ? 'Primary' : subjectLevel === 'high' ? 'High School' : 'Both';
    modalHeader.innerHTML = `<i class="fas fa-user-plus"></i> Assign ${levelDisplay} Tutors to ${subjectName}`;
    
    try {
        await loadAvailableTutors(subjectLevel);
        await loadCurrentAssignments();
        updateAvailableTutorsList();
    } catch (error) {
        console.error('Error loading data for assignment:', error);
        showNotification('Error loading tutor data', 'error');
    }
}

// Load available tutors (filtered by level)
async function loadAvailableTutors(level) {
    try {
        console.log(`Loading available tutors for level: ${level}`);
        const token = localStorage.getItem('adminToken');
        
        if (!token) {
            console.error('No token found');
            window.location.href = 'admin_login.html';
            return;
        }
        
        // Fetch tutors filtered by level
        const url = `${API_BASE}/api/admin/tutors-by-level?level=${level}&nocache=${Date.now()}`;
        console.log('Fetching from:', url);
        
        const response = await fetch(url, {
            headers: { 
                'Authorization': `Bearer ${token}`,
                'Cache-Control': 'no-cache'
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const tutors = await response.json();
        console.log(`Received ${tutors.length} tutors for level ${level}`);
        
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

// Update available tutors list with level badges
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
                <p>No tutors found for this level</p>
                <p><small>Try creating a tutor with the matching level first</small></p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredTutors.map(tutor => {
        // Determine level badge for tutor
        let tutorLevelBadge = '';
        if (tutor.level === 'primary') {
            tutorLevelBadge = '<span class="tutor-level-badge primary">Primary</span>';
        } else if (tutor.level === 'high') {
            tutorLevelBadge = '<span class="tutor-level-badge high">High</span>';
        } else if (tutor.level === 'both') {
            tutorLevelBadge = '<span class="tutor-level-badge both">Both</span>';
        }
        
        return `
        <div class="tutor-assign-item ${currentAssignments.has(tutor.id.toString()) ? 'assigned' : ''}" 
             data-id="${tutor.id}"
             onclick="toggleTutorAssignment(${tutor.id})">
            <div style="display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid #eee; border-radius: 5px; margin-bottom: 5px; cursor: pointer;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #f0f0f0; display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-user"></i>
                </div>
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 5px;">
                        <strong>${escapeHtml(tutor.name)}</strong>
                        ${tutorLevelBadge}
                    </div>
                    <small style="color: #666;">${escapeHtml(tutor.experience || 'No experience listed')}</small>
                </div>
                <div>
                    ${renderStars(tutor.rating || 0)}
                    <span style="font-weight: bold; color: #f39c12;">${tutor.rating || 0}</span>
                </div>
                <div>
                    <i class="fas fa-check-circle" style="color: ${currentAssignments.has(tutor.id.toString()) ? '#2ecc71' : '#ddd'}; font-size: 1.2rem;"></i>
                </div>
            </div>
        </div>
    `}).join('');
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
            const response = await fetch(`${API_BASE}/api/admin/tutors/${tutorId}/subjects/${currentSubjectId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                const error = await response.json();
                console.warn(`Warning for tutor ${tutorId}:`, error);
            }
        }
        
        showNotification('Assignments saved successfully!', 'success');
        closeAssignModal();
        loadSubjects(); // Refresh subjects list
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
    currentSubjectLevel = null;
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
        if (data.type === 'subject_added' || data.type === 'tutor_added' || data.type === 'tutor_deleted') {
            loadSubjects(); // Refresh subjects when tutors change
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
    
    .level-badge, .tutor-level-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 0.7rem;
        font-weight: bold;
        margin-left: 5px;
    }
    
    .level-badge.primary, .tutor-level-badge.primary {
        background: #fff3cd;
        color: #856404;
    }
    
    .level-badge.high, .tutor-level-badge.high {
        background: #d1ecf1;
        color: #0c5460;
    }
    
    .level-badge.both, .tutor-level-badge.both {
        background: #d4edda;
        color: #155724;
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