// Admin Tutor Management Script
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    loadTutors();
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

// Load tutors from server
async function loadTutors() {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/tutors`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        const tutors = await response.json();
        displayTutors(tutors);
    } catch (error) {
        console.error('Error loading tutors:', error);
        showNotification('Error loading tutors', 'error');
    }
}

// Display tutors in table
function displayTutors(tutors) {
    const tbody = document.getElementById('tutorsList');
    
    if (tutors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 40px;">
                    <i class="fas fa-chalkboard-teacher" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>No Tutors Found</h3>
                    <p>Add your first tutor using the form above.</p>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = tutors.map(tutor => `
        <tr data-id="${tutor.id}">
            <td>${tutor.id}</td>
            <td>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <img src="${tutor.image}" alt="${escapeHtml(tutor.name)}" 
                         style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover;">
                    <div>
                        <strong>${escapeHtml(tutor.name)}</strong>
                        ${tutor.bio ? `<br><small style="color: #666;">${escapeHtml(tutor.bio.substring(0, 50))}...</small>` : ''}
                    </div>
                </div>
            </td>
            <td>
                ${Array.isArray(tutor.subjects) 
                    ? tutor.subjects.map(sub => `<span class="subject-tag">${sub}</span>`).join('') 
                    : escapeHtml(tutor.subjects)}
            </td>
            <td>
                <div style="display: flex; align-items: center; gap: 5px;">
                    ${renderStars(tutor.rating)}
                    <span style="font-weight: bold; margin-left: 5px;">${tutor.rating}</span>
                </div>
            </td>
            <td>${escapeHtml(tutor.experience)}</td>
            <td>
                <span class="status-badge ${tutor.is_active === false ? 'inactive' : 'active'}">
                    ${tutor.is_active === false ? 'Inactive' : 'Active'}
                </span>
            </td>
            <td>
                <div style="display: flex; gap: 5px;">
                    <button onclick="editTutor(${tutor.id})" class="btn" style="padding: 5px 10px; font-size: 0.9rem;">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button onclick="openDeleteTutorModal(${tutor.id})" class="btn" style="background: #e74c3c; padding: 5px 10px; font-size: 0.9rem;">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Setup tutor form
function setupForm() {
    const form = document.getElementById('tutorForm');
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const name = document.getElementById('tutorName').value.trim();
        const rating = parseFloat(document.getElementById('tutorRating').value);
        const subjectsInput = document.getElementById('tutorSubjects').value.trim();
        const experience = document.getElementById('tutorExperience').value.trim();
        const image = document.getElementById('tutorImage').value.trim();
        const bio = document.getElementById('tutorBio').value.trim();
        
        // Validate inputs
        if (!name || !rating || !subjectsInput || !experience || !image) {
            showNotification('Please fill in all required fields', 'error');
            return;
        }
        
        if (rating < 1 || rating > 5) {
            showNotification('Rating must be between 1 and 5', 'error');
            return;
        }
        
        // Convert subjects string to array
        const subjects = subjectsInput.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        try {
            const token = localStorage.getItem('adminToken');
            const endpoint = form.dataset.editingId 
                ? `${API_BASE}/api/admin/tutors/${form.dataset.editingId}`
                : `${API_BASE}/api/admin/tutors`;
                
            const method = form.dataset.editingId ? 'PUT' : 'POST';
            
            const response = await fetch(endpoint, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    name,
                    subjects,
                    rating,
                    experience,
                    image,
                    bio,
                    is_active: true
                })
            });
            
            if (response.status === 401) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
                return;
            }
            
            const result = await response.json();
            
            if (response.ok) {
                showNotification(
                    form.dataset.editingId 
                        ? 'Tutor updated successfully!' 
                        : 'Tutor added successfully!', 
                    'success'
                );
                form.reset();
                delete form.dataset.editingId;
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.innerHTML = '<i class="fas fa-plus-circle"></i> Add Tutor';
                loadTutors();
            } else {
                showNotification(result.error || 'Error saving tutor', 'error');
            }
        } catch (error) {
            console.error('Error saving tutor:', error);
            showNotification('Error saving tutor', 'error');
        }
    });
}

// Edit tutor
async function editTutor(id) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/tutors`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const tutors = await response.json();
            const tutor = tutors.find(t => t.id === id);
            
            if (tutor) {
                // Fill form with tutor data
                document.getElementById('tutorName').value = tutor.name;
                document.getElementById('tutorRating').value = tutor.rating;
                document.getElementById('tutorSubjects').value = Array.isArray(tutor.subjects) 
                    ? tutor.subjects.join(', ') 
                    : tutor.subjects;
                document.getElementById('tutorExperience').value = tutor.experience;
                document.getElementById('tutorImage').value = tutor.image;
                document.getElementById('tutorBio').value = tutor.bio || '';
                
                // Change form to update mode
                const form = document.getElementById('tutorForm');
                const submitBtn = form.querySelector('button[type="submit"]');
                
                form.dataset.editingId = id;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Tutor';
                submitBtn.style.background = '#f39c12';
                
                // Scroll to form
                form.scrollIntoView({ behavior: 'smooth' });
            }
        }
    } catch (error) {
        console.error('Error loading tutor for edit:', error);
        showNotification('Error loading tutor data', 'error');
    }
}

// Delete tutor
function openDeleteTutorModal(id) {
    currentDeleteId = id;
    document.getElementById('deleteTutorModal').style.display = 'block';
}

function closeDeleteTutorModal() {
    currentDeleteId = null;
    document.getElementById('deletePassword').value = '';
    document.getElementById('deleteTutorModal').style.display = 'none';
}

async function confirmDeleteTutor() {
    if (!currentDeleteId) return;
    
    const password = document.getElementById('deletePassword').value;
    if (!password) {
        showNotification('Please enter the delete password', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`${API_BASE}/api/admin/tutors/${currentDeleteId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ deletePassword: password })
        });
        
        if (response.status === 401) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification('Tutor deleted successfully!', 'success');
            closeDeleteTutorModal();
            loadTutors();
        } else {
            showNotification(result.error || 'Error deleting tutor', 'error');
        }
    } catch (error) {
        console.error('Error deleting tutor:', error);
        showNotification('Error deleting tutor', 'error');
    }
}

// WebSocket for real-time notifications
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('WebSocket connected');
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
        if (data.type === 'tutor_added' || data.type === 'tutor_deleted') {
            loadTutors(); // Refresh list
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
        setTimeout(setupWebSocket, 5000);
    };
}

// Utility functions
function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(rating)) {
            stars += '<i class="fas fa-star" style="color: #f39c12;"></i>';
        } else if (i === Math.ceil(rating) && rating % 1 > 0) {
            stars += '<i class="fas fa-star-half-alt" style="color: #f39c12;"></i>';
        } else {
            stars += '<i class="far fa-star" style="color: #ddd;"></i>';
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
    } else if (type === 'warning') {
        notification.style.background = '#f39c12';
    }
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Add some CSS for tutor display
const style = document.createElement('style');
style.textContent = `
    .subject-tag {
        display: inline-block;
        background: #e3f2fd;
        color: #1976d2;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.8rem;
        margin: 2px;
    }
    
    .status-badge {
        display: inline-block;
        padding: 3px