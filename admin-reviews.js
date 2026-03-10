// Admin Reviews Management Script
// ==============================================

document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('adminToken');
    
    if (!token) {
        window.location.href = 'admin_login.html';
        return;
    }

    // Initialize the page
    initializeReviewsPage();
});

// Main initialization function
async function initializeReviewsPage() {
    await fetchReviews();
    setupFormSubmission();
    // Note: mobile menu is handled by admin-common.js, so we don't need to call it here
}

// Fetch all reviews
async function fetchReviews() {
    const token = localStorage.getItem('adminToken');
    
    try {
        const response = await fetch('/api/admin/reviews', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('adminToken');
            window.location.href = 'admin_login.html';
            return;
        }

        if (!response.ok) {
            // If it's a 500 error, the table might not exist
            if (response.status === 500) {
                console.log('Reviews table might not exist yet');
                displayNoReviewsTable();
                return;
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        
        // Ensure data is an array
        const reviews = Array.isArray(data) ? data : [];
        displayReviews(reviews);
        
    } catch (error) {
        console.error('Error fetching reviews:', error);
        showNotification('Error loading reviews', 'error');
        
        const tbody = document.getElementById('reviews-table-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 40px;">
                        <i class="fas fa-exclamation-triangle" style="color: #e74c3c; font-size: 2rem;"></i>
                        <p>Error loading reviews. Please try again.</p>
                        <button onclick="window.fetchReviews()" class="btn" style="margin-top: 10px;">
                            <i class="fas fa-sync-alt"></i> Retry
                        </button>
                    </td>
                </tr>
            `;
        }
    }
}

// Display message when reviews table doesn't exist
function displayNoReviewsTable() {
    const tbody = document.getElementById('reviews-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = `
        <tr>
            <td colspan="9" style="text-align: center; padding: 40px;">
                <i class="fas fa-database" style="font-size: 3rem; color: #f39c12; margin-bottom: 10px;"></i>
                <h3>Reviews Table Not Found</h3>
                <p>The reviews table hasn't been created in the database yet.</p>
                <p style="color: #666; font-size: 0.9rem; margin-top: 10px;">
                    Please run the SQL migration to create the reviews table.
                </p>
                <button onclick="window.fetchReviews()" class="btn" style="margin-top: 10px;">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </td>
        </tr>
    `;
}

// Display reviews in table
function displayReviews(reviews) {
    const tbody = document.getElementById('reviews-table-body');
    
    if (!tbody) return;
    
    if (!reviews || reviews.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 40px;">
                    <i class="fas fa-star" style="font-size: 3rem; color: #ddd; margin-bottom: 10px;"></i>
                    <p>No reviews yet. Add your first review!</p>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = reviews.map(review => {
        // Safely handle subjects array
        let subjectsDisplay = '';
        if (Array.isArray(review.subjects)) {
            subjectsDisplay = review.subjects.join(', ');
        } else if (typeof review.subjects === 'string') {
            subjectsDisplay = review.subjects;
        } else {
            subjectsDisplay = '';
        }

        // Truncate comments if too long
        const commentsDisplay = review.comments && review.comments.length > 50 
            ? review.comments.substring(0, 50) + '...' 
            : (review.comments || '');

        return `
            <tr>
                <td>
                    <input type="number" value="${review.display_order || 0}" 
                           style="width: 60px;" min="0" 
                           onchange="window.updateOrder(${review.id}, this.value)">
                </td>
                <td>
                    ${review.image_path 
                        ? `<img src="${review.image_path}" alt="${escapeHtml(review.full_name)}" 
                               style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; 
                                      border: 2px solid #3498db;">` 
                        : `<i class="fas fa-user-circle" style="font-size: 2.5rem; color: #ccc;"></i>`
                    }
                </td>
                <td>${escapeHtml(review.full_name || '')}</td>
                <td>${escapeHtml(review.school || '')}</td>
                <td>${escapeHtml(review.grade || '')}</td>
                <td>${escapeHtml(subjectsDisplay)}</td>
                <td>${escapeHtml(commentsDisplay)}</td>
                <td>
                    <span style="padding: 3px 8px; border-radius: 3px; 
                                 background: ${review.is_approved ? '#2ecc71' : '#f39c12'}; 
                                 color: white; font-size: 0.8rem;">
                        ${review.is_approved ? 'Approved' : 'Pending'}
                    </span>
                </td>
                <td>
                    <button class="btn" onclick='window.editReview(${JSON.stringify(review).replace(/'/g, "\\'")})' 
                            style="padding: 5px 10px; background: #3498db; margin-right: 5px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="delete-btn" onclick="window.deleteReview(${review.id})" 
                            style="padding: 5px 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Setup form submission
function setupFormSubmission() {
    const form = document.getElementById('review-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const token = localStorage.getItem('adminToken');
        const reviewId = document.getElementById('review-id').value;
        
        // Get and validate form data
        const fullName = document.getElementById('full-name').value.trim();
        const school = document.getElementById('school').value.trim();
        const grade = document.getElementById('grade').value.trim();
        const subjectsInput = document.getElementById('subjects').value.trim();
        const comments = document.getElementById('comments').value.trim();
        const imagePath = document.getElementById('image-path').value.trim();
        const displayOrder = parseInt(document.getElementById('display-order').value) || 0;
        const isApproved = document.getElementById('is-approved').checked;

        // Validate required fields
        if (!fullName) {
            showNotification('Please enter full name', 'error');
            return;
        }
        if (!school) {
            showNotification('Please enter school name', 'error');
            return;
        }
        if (!subjectsInput) {
            showNotification('Please enter subjects', 'error');
            return;
        }
        if (!comments) {
            showNotification('Please enter comments', 'error');
            return;
        }

        // Process subjects into array
        const subjectsArray = subjectsInput.split(',').map(s => s.trim()).filter(s => s);

        const reviewData = {
            full_name: fullName,
            school: school,
            grade: grade || null,
            subjects: subjectsArray,
            comments: comments,
            image_path: imagePath || null,
            display_order: displayOrder,
            is_approved: isApproved
        };

        console.log('Submitting review data:', reviewData);

        try {
            const url = reviewId ? `/api/admin/reviews/${reviewId}` : '/api/admin/reviews';
            const method = reviewId ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(reviewData)
            });

            const data = await response.json();

            if (response.ok) {
                showNotification(reviewId ? 'Review updated successfully' : 'Review added successfully', 'success');
                resetForm();
                await fetchReviews(); // Refresh the list
            } else {
                showNotification(data.error || 'Error saving review', 'error');
            }
        } catch (error) {
            console.error('Error saving review:', error);
            showNotification('Network error. Please try again.', 'error');
        }
    });
}

// Reset form to add new review
function resetForm() {
    document.getElementById('form-title').innerHTML = '<i class="fas fa-plus-circle"></i> Add New Review';
    document.getElementById('review-id').value = '';
    document.getElementById('review-form').reset();
    document.getElementById('is-approved').checked = true;
    
    // Scroll to form
    document.getElementById('review-form-section').scrollIntoView({ behavior: 'smooth' });
}

// Edit review - populate form with review data
function editReview(review) {
    document.getElementById('form-title').innerHTML = '<i class="fas fa-edit"></i> Edit Review';
    document.getElementById('review-id').value = review.id;
    document.getElementById('full-name').value = review.full_name || '';
    document.getElementById('school').value = review.school || '';
    document.getElementById('grade').value = review.grade || '';
    
    // Handle subjects display
    if (Array.isArray(review.subjects)) {
        document.getElementById('subjects').value = review.subjects.join(', ');
    } else {
        document.getElementById('subjects').value = review.subjects || '';
    }
    
    document.getElementById('comments').value = review.comments || '';
    document.getElementById('image-path').value = review.image_path || '';
    document.getElementById('display-order').value = review.display_order || 0;
    document.getElementById('is-approved').checked = review.is_approved !== false;
    
    // Scroll to form
    document.getElementById('review-form-section').scrollIntoView({ behavior: 'smooth' });
}

// Delete review
async function deleteReview(id) {
    if (!confirm('Are you sure you want to delete this review?')) return;

    const token = localStorage.getItem('adminToken');
    
    try {
        const response = await fetch(`/api/admin/reviews/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
            showNotification('Review deleted successfully', 'success');
            await fetchReviews(); // Refresh the list
        } else {
            const data = await response.json();
            showNotification(data.error || 'Error deleting review', 'error');
        }
    } catch (error) {
        console.error('Error deleting review:', error);
        showNotification('Network error. Please try again.', 'error');
    }
}

// Update review display order
async function updateOrder(id, order) {
    const token = localStorage.getItem('adminToken');
    
    try {
        const response = await fetch(`/api/admin/reviews/${id}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ display_order: parseInt(order) })
        });

        if (!response.ok) {
            showNotification('Error updating order', 'error');
        } else {
            console.log('Order updated successfully');
        }
    } catch (error) {
        console.error('Error updating order:', error);
        showNotification('Error updating order', 'error');
    }
}

// Utility function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Show notification function
function showNotification(message, type = 'info') {
    // Remove existing notification
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.className = 'notification';
    
    const colors = {
        success: '#2ecc71',
        error: '#e74c3c',
        warning: '#f39c12',
        info: '#3498db'
    };
    
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        background: ${colors[type] || colors.info};
        z-index: 1000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease-out;
    `;
    
    notification.innerHTML = `
        ${message}
        <span style="margin-left: 10px; cursor: pointer; font-weight: bold; 
                     float: right;" onclick="this.parentElement.remove()">&times;</span>
    `;
    
    document.body.appendChild(notification);
    
    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (notification.parentElement) {
            notification.remove();
        }
    }, 5000);
}

// Add CSS animation if not exists
if (!document.querySelector('#notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// Make functions globally available for onclick events
window.fetchReviews = fetchReviews;
window.resetForm = resetForm;
window.editReview = editReview;
window.deleteReview = deleteReview;
window.updateOrder = updateOrder;