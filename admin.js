document.addEventListener('DOMContentLoaded', () => {
    const token = localStorage.getItem('adminToken');
    const ws = new WebSocket(`ws${window.location.protocol === 'https:' ? 's' : ''}://${window.location.host}`);
    let adminId = null;

    // Redirect to login if no token
    if (!token) {
        window.location.href = 'admin_login.html';
        return;
    }

    // Decode token to get admin ID
    try {
        const decoded = JSON.parse(atob(token.split('.')[1]));
        adminId = decoded.id;
    } catch (error) {
        console.error('Error decoding token:', error);
        localStorage.removeItem('adminToken');
        window.location.href = 'admin_login.html';
        return;
    }

    // WebSocket setup
    ws.onopen = () => {
        console.log('WebSocket connected on admin');
        ws.send(JSON.stringify({ type: 'admin_login', adminId }));
    };

    ws.onmessage = (event) => {
        const notification = JSON.parse(event.data);
        console.log('Received notification:', notification);
        if (notification.isBrowserNotification) {
            showNotification(notification.message);
            
            // Refresh relevant sections based on notification type
            if (notification.type === 'booking' || notification.type === 'booking_deleted') {
                fetchBookings();
                updateStats();
            } else if (notification.type === 'contact' || notification.type === 'contact_deleted') {
                fetchContacts();
                updateStats();
            } else if (notification.type === 'announcement' || notification.type === 'announcement_deleted') {
                updateStats();
            } else if (notification.type === 'tutor_added' || notification.type === 'tutor_deleted') {
                updateStats();
            }
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
            location.reload();
        }, 5000);
    };

    // Show browser notification
    function showNotification(message) {
        // Browser notifications
        if ('Notification' in window && Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification('LearnHub Admin', { body: message });
                }
            });
        } else if (Notification.permission === 'granted') {
            new Notification('LearnHub Admin', { body: message });
        }

        // On-page notification
        const notificationDiv = document.createElement('div');
        notificationDiv.className = 'notification';
        notificationDiv.innerHTML = `${message} <span class="close">×</span>`;
        document.body.appendChild(notificationDiv);

        notificationDiv.querySelector('.close').addEventListener('click', () => {
            notificationDiv.remove();
        });

        setTimeout(() => {
            if (notificationDiv.parentNode) {
                notificationDiv.remove();
            }
        }, 5000);
    }

    // Fetch and display bookings
    async function fetchBookings() {
        try {
            const response = await fetch('/api/bookings', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                showNotification('Session expired. Please log in again.');
                window.location.href = 'admin_login.html';
                return;
            }
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const bookings = await response.json();
            const tbody = document.querySelector('#bookings-table tbody');
            tbody.innerHTML = '';
            
            if (!Array.isArray(bookings) || bookings.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align: center; padding: 20px;">
                            <i class="fas fa-calendar-times" style="font-size: 2rem; color: #ddd; margin-bottom: 10px;"></i>
                            <p>No bookings found</p>
                        </td>
                    </tr>
                `;
                return;
            }
            
            bookings.forEach(booking => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${booking.id}</td>
                    <td>${booking.tutor_name || 'Unknown'}</td>
                    <td>${booking.subject}</td>
                    <td>${booking.user_number}</td>
                    <td>${new Date(booking.schedule).toLocaleString()}</td>
                    <td>${new Date(booking.created_at).toLocaleString()}</td>
                    <td>
                        <button class="delete-btn" data-type="booking" data-id="${booking.id}" style="padding: 5px 10px;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
            
            // Update stats
            document.getElementById('total-bookings').textContent = bookings.length;
            
        } catch (error) {
            console.error('Error fetching bookings:', error);
            showNotification('Error fetching bookings');
        }
    }

    // Fetch and display contacts
    async function fetchContacts() {
        try {
            const response = await fetch('/api/contacts', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                window.location.href = 'admin_login.html';
                return;
            }
            
            const contacts = await response.json();
            const tbody = document.querySelector('#contacts-table tbody');
            tbody.innerHTML = '';
            
            if (!Array.isArray(contacts) || contacts.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 20px;">
                            <i class="fas fa-envelope-open" style="font-size: 2rem; color: #ddd; margin-bottom: 10px;"></i>
                            <p>No messages found</p>
                        </td>
                    </tr>
                `;
                return;
            }
            
            contacts.forEach(contact => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${contact.name}</td>
                    <td>${contact.number}</td>
                    <td>${contact.message.length > 50 ? contact.message.substring(0, 50) + '...' : contact.message}</td>
                    <td>${new Date(contact.created_at).toLocaleString()}</td>
                    <td>
                        <button class="delete-btn" data-type="contact" data-id="${contact.number}" style="padding: 5px 10px;">
                            <i class="fas fa-trash"></i> Delete
                        </button>
                    </td>
                `;
                tbody.appendChild(row);
            });
            
            // Update stats
            document.getElementById('total-contacts').textContent = contacts.length;
            
        } catch (error) {
            console.error('Error fetching contacts:', error);
            showNotification('Error fetching contacts');
        }
    }

    // Update all stats
    async function updateStats() {
        try {
            // Fetch bookings count
            const bookingsRes = await fetch('/api/bookings', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (bookingsRes.ok) {
                const bookings = await bookingsRes.json();
                document.getElementById('total-bookings').textContent = Array.isArray(bookings) ? bookings.length : 0;
            }
            
            // Fetch contacts count
            const contactsRes = await fetch('/api/contacts', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (contactsRes.ok) {
                const contacts = await contactsRes.json();
                document.getElementById('total-contacts').textContent = Array.isArray(contacts) ? contacts.length : 0;
            }
            
            // Fetch announcements count
            const announcementsRes = await fetch('/api/announcements');
            if (announcementsRes.ok) {
                const announcements = await announcementsRes.json();
                document.getElementById('total-announcements').textContent = Array.isArray(announcements) ? announcements.length : 0;
            }
            
            // Fetch tutors count
            const tutorsRes = await fetch('/api/admin/tutors', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (tutorsRes.ok) {
                const tutors = await tutorsRes.json();
                const activeTutors = Array.isArray(tutors) ? tutors.filter(t => t.is_active !== false).length : 0;
                document.getElementById('total-tutors').textContent = activeTutors;
            }
            
        } catch (error) {
            console.error('Error updating stats:', error);
        }
    }

    // Handle delete button clicks
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-btn') || e.target.closest('.delete-btn')) {
            const btn = e.target.classList.contains('delete-btn') ? e.target : e.target.closest('.delete-btn');
            const type = btn.getAttribute('data-type');
            const id = btn.getAttribute('data-id');
            
            const password = prompt(`Enter delete password to remove this ${type}:`);
            if (!password) return;

            try {
                // Verify delete password
                const verifyResponse = await fetch('/api/verify-delete-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password }),
                });
                
                const verifyData = await verifyResponse.json();
                if (!verifyResponse.ok) {
                    alert(`Error: ${verifyData.error}`);
                    return;
                }

                // Perform deletion
                const endpoint = type === 'booking' ? `/api/bookings/${id}` : `/api/contacts/${id}`;
                const response = await fetch(endpoint, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` },
                });
                
                const data = await response.json();
                if (response.ok) {
                    showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} deleted successfully`);
                    if (type === 'booking') {
                        fetchBookings();
                    } else {
                        fetchContacts();
                    }
                    updateStats();
                } else {
                    alert(`Error: ${data.error}`);
                }
            } catch (error) {
                console.error('Error deleting:', error);
                alert('Error deleting record');
            }
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
            localStorage.removeItem('adminToken');
            ws.close();
            window.location.href = 'admin_login.html';
        }
    });

    // Smooth scrolling for navigation
    document.querySelectorAll('nav a:not(#logout-btn)').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            if (anchor.getAttribute('href').startsWith('#')) {
                e.preventDefault();
                const targetId = anchor.getAttribute('href');
                const targetElement = document.querySelector(targetId);
                if (targetElement) {
                    window.scrollTo({
                        top: targetElement.offsetTop - 100,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // Request notification permission on page load
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }

    // Initial fetch and stats update
    fetchBookings();
    fetchContacts();
    updateStats();
    
    // Refresh stats every 30 seconds
    setInterval(updateStats, 30000);
});