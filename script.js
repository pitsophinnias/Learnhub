// LearnHub Main Script - Browser Version
// ==============================================

// Global variables
let currentDate = new Date();
let selectedDeadline = null;
let paymentDeadlines = [
    {
        name: "June 2026 LGCSE Private Candidates",
        date: new Date('2026-03-30T23:59:59'),
        fee: "M910.00 - M1,950.00 (depending on subjects)",
        type: "private"
    },
    {
        name: "Oct/Nov 2026 School Candidates",
        date: new Date('2026-04-30T23:59:59'),
        fee: "M2,120.00 - M3,370.00 (depending on subjects)",
        type: "school"
    },
    {
        name: "Oct/Nov 2026 Private Candidates",
        date: new Date('2026-04-30T23:59:59'),
        fee: "M910.00 - M2,730.00 (depending on subjects)",
        type: "private"
    },
    {
        name: "2026 DELF Candidates",
        date: new Date('2026-04-30T23:59:59'),
        fee: "M615.00 per subject",
        type: "delf"
    }
];
let currentDeadlineIndex = 0;
let ws = null;

// Main initialization
document.addEventListener('DOMContentLoaded', function() {
    console.log('LearnHub initialized');
    
    // Mobile menu toggle
    const menuToggle = document.getElementById('menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    const mainNav = document.getElementById('main-nav');
    
    if (menuToggle && navMenu) {
        menuToggle.addEventListener('click', function() {
            mainNav.classList.toggle('side-menu');
            mainNav.classList.toggle('active');
        });
    }
    
    // Calendar initialization
    initializeCalendar();
    startCountdown();
    
    // Contact form submission
    const contactForm = document.getElementById('contact-form');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const name = document.getElementById('name').value.trim();
            const number = document.getElementById('number').value.trim();
            const message = document.getElementById('message').value.trim();
            
            if (!name || !number || !message) {
                showNotification('Please fill in all fields', 'error');
                return;
            }
            
            if (number.length < 8) {
                showNotification('Please enter a valid phone number', 'error');
                return;
            }
            
            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ name, number, message })
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    showNotification('Message sent successfully! We\'ll contact you soon.', 'success');
                    contactForm.reset();
                } else {
                    showNotification(result.error || 'Error sending message', 'error');
                }
            } catch (error) {
                console.error('Error sending message:', error);
                showNotification('Network error. Please try again.', 'error');
            }
        });
    }
    
    // Load dynamic content
    loadAnnouncements();
    loadSubjects();
    
    // Initialize tutor modal
    initializeTutorModal();
    
    // Setup document download and preview
    setupDocumentDownload();
    setupPreviewButton();
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
    
    // Setup WebSocket for real-time updates
    setupAnnouncementWebSocket();
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (mainNav && mainNav.classList.contains('active') && 
            !event.target.closest('nav') && 
            !event.target.closest('.menu-toggle')) {
            mainNav.classList.remove('active');
            mainNav.classList.remove('side-menu');
        }
    });
});

// ==============================================
// PAYMENT DEADLINE FUNCTIONS
// ==============================================

// Initialize countdown for payment deadlines
function startCountdown() {
    // Find the next upcoming deadline
    const now = new Date();
    const upcomingDeadlines = paymentDeadlines
        .filter(deadline => deadline.date > now)
        .sort((a, b) => a.date - b.date);
    
    if (upcomingDeadlines.length > 0) {
        selectedDeadline = upcomingDeadlines[0];
        currentDeadlineIndex = paymentDeadlines.findIndex(d => d.name === selectedDeadline.name);
    } else {
        // If all deadlines have passed, use the last one and add a year
        selectedDeadline = {
            ...paymentDeadlines[0],
            date: new Date(paymentDeadlines[0].date.getFullYear() + 1, 
                          paymentDeadlines[0].date.getMonth(), 
                          paymentDeadlines[0].date.getDate())
        };
    }
    
    updateDeadlineDisplay();
    updateCountdown();
    setInterval(updateCountdown, 1000);
    
    // Setup deadline navigation
    setupDeadlineNavigation();
}

function updateDeadlineDisplay() {
    const currentDeadlineEl = document.getElementById('current-deadline');
    const deadlineFeeEl = document.getElementById('deadline-fee');
    
    if (currentDeadlineEl && selectedDeadline) {
        currentDeadlineEl.textContent = `${selectedDeadline.name} - ${selectedDeadline.date.toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })}`;
    }
    
    if (deadlineFeeEl && selectedDeadline) {
        deadlineFeeEl.textContent = selectedDeadline.fee;
    }
    
    updateDeadlineList();
}

function updateDeadlineList() {
    const deadlineList = document.getElementById('deadline-list');
    if (!deadlineList) return;
    
    deadlineList.innerHTML = paymentDeadlines.map(deadline => {
        const isPast = deadline.date < new Date();
        const isCurrent = selectedDeadline && deadline.name === selectedDeadline.name;
        
        return `
            <li class="${isPast ? 'past-deadline' : ''} ${isCurrent ? 'current-deadline' : ''}">
                <strong>${deadline.name}</strong><br>
                <span>Due: ${deadline.date.toLocaleDateString()}</span><br>
                <small>${deadline.fee}</small>
            </li>
        `;
    }).join('');
}

function setupDeadlineNavigation() {
    // Optional: Add navigation buttons if needed
    const prevBtn = document.getElementById('prev-deadline');
    const nextBtn = document.getElementById('next-deadline');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentDeadlineIndex = (currentDeadlineIndex - 1 + paymentDeadlines.length) % paymentDeadlines.length;
            selectedDeadline = paymentDeadlines[currentDeadlineIndex];
            updateDeadlineDisplay();
            updateCountdown();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentDeadlineIndex = (currentDeadlineIndex + 1) % paymentDeadlines.length;
            selectedDeadline = paymentDeadlines[currentDeadlineIndex];
            updateDeadlineDisplay();
            updateCountdown();
        });
    }
}

function updateCountdown() {
    if (!selectedDeadline) return;
    
    const now = new Date();
    const timeDiff = selectedDeadline.date.getTime() - now.getTime();
    
    if (timeDiff <= 0) {
        // Find next deadline
        const upcomingDeadlines = paymentDeadlines
            .filter(deadline => deadline.date > now)
            .sort((a, b) => a.date - b.date);
        
        if (upcomingDeadlines.length > 0) {
            selectedDeadline = upcomingDeadlines[0];
            currentDeadlineIndex = paymentDeadlines.findIndex(d => d.name === selectedDeadline.name);
        } else {
            // Add one year to all deadlines
            paymentDeadlines.forEach(deadline => {
                deadline.date.setFullYear(deadline.date.getFullYear() + 1);
            });
            selectedDeadline = paymentDeadlines[0];
        }
        
        updateDeadlineDisplay();
    }
    
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    
    if (daysEl) daysEl.textContent = days.toString().padStart(2, '0');
    if (hoursEl) hoursEl.textContent = hours.toString().padStart(2, '0');
    if (minutesEl) minutesEl.textContent = minutes.toString().padStart(2, '0');
    if (secondsEl) secondsEl.textContent = seconds.toString().padStart(2, '0');
    
    // Update color based on urgency
    updateCountdownColor(days);
}

function updateCountdownColor(days) {
    const countdownItems = document.querySelectorAll('.countdown-item');
    
    countdownItems.forEach(item => {
        item.style.backgroundColor = '';
    });
    
    if (days <= 7) {
        countdownItems.forEach(item => {
            item.style.backgroundColor = '#e74c3c'; // Red for urgent
        });
    } else if (days <= 30) {
        countdownItems.forEach(item => {
            item.style.backgroundColor = '#f39c12'; // Orange for warning
        });
    }
}

// ==============================================
// DOCUMENT DOWNLOAD & PREVIEW FUNCTIONS
// ==============================================

function setupDocumentDownload() {
    const downloadBtn = document.getElementById('download-fees-btn');
    if (downloadBtn) {
        downloadBtn.addEventListener('click', async function() {
            try {
                const imagePath = '/images/Exam Fees 2026.jpg';
                
                // Method 1: Direct download (works for same-origin files)
                const link = document.createElement('a');
                link.href = imagePath;
                link.download = 'Exam_Fees_2026.jpg';
                
                // For some browsers, we need to append to body first
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                
                // Method 2: Fallback - open in new tab if direct download fails
                const fallbackTimeout = setTimeout(() => {
                    showNotification('Opening document in new tab...', 'info');
                    window.open(imagePath, '_blank');
                }, 1500);
                
                // Clear fallback if download seems successful
                setTimeout(() => {
                    clearTimeout(fallbackTimeout);
                    showNotification('Exam fees document downloaded!', 'success');
                }, 1000);
                
            } catch (error) {
                console.error('Download error:', error);
                showNotification('Opening document instead...', 'warning');
                window.open('/images/Exam Fees 2026.jpg', '_blank');
            }
        });
    }
}

function setupPreviewButton() {
    const previewBtn = document.getElementById('preview-fees-btn');
    if (previewBtn) {
        previewBtn.addEventListener('click', function() {
            showNotification('Opening fee schedule in new tab...', 'info');
            window.open('/images/Exam Fees 2026.jpg', '_blank');
        });
    }
}

// ==============================================
// ANNOUNCEMENTS FUNCTIONS
// ==============================================

async function loadAnnouncements() {
    try {
        console.log('Loading announcements...');
        const response = await fetch('/api/announcements');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const announcements = await response.json();
        console.log('Announcements received:', announcements);
        
        // Check which container exists
        let container = document.getElementById('announcements-container');
        if (!container) {
            container = document.querySelector('.announcements-grid');
        }
        
        if (!container) {
            console.error('Announcements container not found!');
            return;
        }
        
        if (!announcements || announcements.length === 0) {
            container.innerHTML = `
                <div class="announcement-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-bullhorn" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>No Announcements Yet</h3>
                    <p>Check back later for updates from our team.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = announcements.map(announcement => `
            <div class="announcement-card">
                <h3>${escapeHtml(announcement.title)}</h3>
                <p class="announcement-date">
                    <i class="far fa-calendar"></i> ${formatDate(announcement.created_at)}
                    ${announcement.author ? ` • <i class="fas fa-user"></i> ${escapeHtml(announcement.author)}` : ''}
                </p>
                <p>${escapeHtml(announcement.content)}</p>
            </div>
        `).join('');
        
        console.log(`Displayed ${announcements.length} announcements`);
        
    } catch (error) {
        console.error('Error loading announcements:', error);
        const container = document.getElementById('announcements-container') || document.querySelector('.announcements-grid');
        if (container) {
            container.innerHTML = `
                <div class="announcement-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="color: #e74c3c; font-size: 3rem; margin-bottom: 20px;"></i>
                    <h3>Error Loading Announcements</h3>
                    <p>Please try again later.</p>
                </div>
            `;
        }
    }
}

// ==============================================
// SUBJECTS FUNCTIONS
// ==============================================

async function loadSubjects() {
    try {
        console.log('Loading subjects...');
        const response = await fetch('/api/subjects');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const subjects = await response.json();
        console.log('Subjects received:', subjects);
        
        // Check which container exists
        let container = document.getElementById('subjects-container');
        if (!container) {
            container = document.querySelector('.subjects-grid');
        }
        
        if (!container) {
            console.error('Subjects container not found!');
            return;
        }
        
        if (!subjects || subjects.length === 0) {
            container.innerHTML = `
                <div class="subject-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-book" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>No Subjects Available</h3>
                    <p>Check back later for available subjects.</p>
                </div>
            `;
            return;
        }
        
        // Filter available subjects
        const availableSubjects = subjects.filter(subject => subject.is_available !== false);
        
        if (availableSubjects.length === 0) {
            container.innerHTML = `
                <div class="subject-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-book" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                    <h3>No Subjects Available</h3>
                    <p>All subjects are currently unavailable.</p>
                </div>
            `;
            return;
        }
        
        // Create subject cards
        container.innerHTML = availableSubjects.map(subject => {
            const subjectName = subject.name.toLowerCase();
            return `
                <div class="subject-card" data-subject="${subjectName}">
                    <i class="${subject.icon || 'fas fa-book'}"></i>
                    <h3>${escapeHtml(subject.name)}</h3>
                    <p>${escapeHtml(subject.description || 'Expert tutoring available')}</p>
                    <p><small><i class="fas fa-users"></i> ${subject.tutor_count || 0} tutor(s) available</small></p>
                    <button class="select-btn" onclick="fetchTutorsBySubject('${subjectName}')">
                        Select
                    </button>
                </div>
            `;
        }).join('');
        
        console.log(`Displayed ${availableSubjects.length} subjects`);
        
    } catch (error) {
        console.error('Error loading subjects:', error);
        const container = document.getElementById('subjects-container') || document.querySelector('.subjects-grid');
        if (container) {
            container.innerHTML = `
                <div class="subject-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                    <i class="fas fa-exclamation-triangle" style="color: #e74c3c; font-size: 3rem; margin-bottom: 20px;"></i>
                    <h3>Error Loading Subjects</h3>
                    <p>${error.message}</p>
                    <button onclick="loadSubjects()" class="btn" style="margin-top: 10px;">
                        <i class="fas fa-sync-alt"></i> Retry
                    </button>
                </div>
            `;
        }
    }
}

async function fetchTutorsBySubject(subject) {
    console.log('Fetching tutors for subject:', subject);
    
    try {
        const cleanSubject = subject.toLowerCase().trim();
        const response = await fetch(`/api/tutors/${cleanSubject}`);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch tutors: ${response.status}`);
        }
        
        const tutors = await response.json();
        console.log(`Found ${tutors.length} tutors for ${subject}`);
        
        if (tutors.length === 0) {
            showNotification(`No tutors available for ${subject} at the moment.`, 'info');
            return;
        }
        
        showTutorModalWithData(subject, tutors);
        
    } catch (error) {
        console.error('Error fetching tutors by subject:', error);
        showNotification('Error loading tutors. Please try again.', 'error');
        showTutorModalWithData(subject, []);
    }
}

// ==============================================
// TUTOR MODAL FUNCTIONS
// ==============================================

function initializeTutorModal() {
    const modal = document.getElementById('tutorModal');
    if (!modal) return;
    
    // Modal close button
    const closeBtn = modal.querySelector('.close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            clearModalSelection();
        });
    }
    
    // Confirm booking button
    const confirmBtn = document.getElementById('confirmBookingBtn');
    if (confirmBtn) {
        confirmBtn.addEventListener('click', function() {
            confirmBooking();
        });
    }
}

function showTutorModalWithData(subject, tutors) {
    const modal = document.getElementById('tutorModal');
    const modalTitle = document.getElementById('modalTitle');
    const tutorList = document.getElementById('tutor-list');
    const scheduleInput = document.getElementById('schedule');
    const confirmBtn = document.getElementById('confirmBookingBtn');
    
    if (!modal || !modalTitle || !tutorList) {
        console.error('Modal elements not found');
        return;
    }
    
    // Set modal title
    modalTitle.textContent = `Select Tutor for ${subject.charAt(0).toUpperCase() + subject.slice(1)}`;
    
    // Clear previous selection
    clearModalSelection();
    
    // Store current subject
    modal.dataset.currentSubject = subject;
    
    if (tutors.length === 0) {
        tutorList.innerHTML = `
            <div style="text-align: center; padding: 40px;">
                <i class="fas fa-user-slash" style="font-size: 3rem; color: #ddd; margin-bottom: 20px;"></i>
                <h3>No Tutors Available</h3>
                <p>No tutors are currently available for ${subject}.</p>
                <p>Please check back later or contact us.</p>
            </div>
        `;
        
        if (scheduleInput) scheduleInput.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
    } else {
        // Populate tutor list
        tutorList.innerHTML = tutors.map(tutor => `
            <div class="tutor-card" data-tutor-id="${tutor.id}">
                <img src="${tutor.image || 'https://via.placeholder.com/60?text=Tutor'}" 
                     alt="${tutor.name}"
                     onerror="this.src='https://via.placeholder.com/60?text=Tutor'">
                <div class="tutor-info">
                    <h4>${escapeHtml(tutor.name)}</h4>
                    <p>${escapeHtml(tutor.experience || 'Experienced tutor')}</p>
                    <p style="color: #f39c12;">
                        ${renderStars(tutor.rating || 0)} 
                        <strong>${tutor.rating || 'N/A'}</strong>
                    </p>
                    <small style="color: #666;">
                        Subjects: ${Array.isArray(tutor.subjects) ? tutor.subjects.join(', ') : tutor.subjects}
                    </small>
                </div>
                <div class="tutor-rating">
                    <button class="select-tutor-btn btn" 
                            data-tutor-id="${tutor.id}"
                            data-tutor-name="${escapeHtml(tutor.name)}"
                            style="padding: 8px 15px; font-size: 0.9rem;">
                        <i class="fas fa-check"></i> Select
                    </button>
                </div>
            </div>
        `).join('');
        
        // Attach event listeners to tutor select buttons
        setTimeout(() => {
            document.querySelectorAll('.select-tutor-btn').forEach(btn => {
                btn.addEventListener('click', function() {
                    const tutorId = this.dataset.tutorId;
                    const tutorName = this.dataset.tutorName;
                    
                    console.log('Selected tutor:', tutorName, 'ID:', tutorId);
                    
                    // Store selected tutor
                    modal.dataset.selectedTutorId = tutorId;
                    modal.dataset.selectedTutorName = tutorName;
                    
                    // Show schedule input and confirm button
                    if (scheduleInput) {
                        scheduleInput.style.display = 'block';
                        scheduleInput.min = new Date().toISOString().slice(0, 16);
                    }
                    if (confirmBtn) confirmBtn.style.display = 'block';
                    
                    // Highlight selected tutor
                    document.querySelectorAll('.tutor-card').forEach(card => {
                        card.style.background = '';
                    });
                    this.closest('.tutor-card').style.background = '#e8f5e9';
                });
            });
        }, 100);
        
        if (scheduleInput) scheduleInput.style.display = 'none';
        if (confirmBtn) confirmBtn.style.display = 'none';
    }
    
    // Show modal
    modal.style.display = 'block';
}

function clearModalSelection() {
    const modal = document.getElementById('tutorModal');
    if (modal) {
        delete modal.dataset.selectedTutorId;
        delete modal.dataset.selectedTutorName;
        delete modal.dataset.currentSubject;
    }
    const scheduleInput = document.getElementById('schedule');
    if (scheduleInput) {
        scheduleInput.value = '';
        scheduleInput.style.display = 'none';
    }
    const confirmBtn = document.getElementById('confirmBookingBtn');
    if (confirmBtn) confirmBtn.style.display = 'none';
}

async function confirmBooking() {
    const modal = document.getElementById('tutorModal');
    const tutorId = modal.dataset.selectedTutorId;
    const tutorName = modal.dataset.selectedTutorName;
    const subject = modal.dataset.currentSubject;
    const scheduleInput = document.getElementById('schedule');
    
    if (!tutorId || !subject) {
        showNotification('Please select a tutor first', 'error');
        return;
    }
    
    if (!scheduleInput || !scheduleInput.value) {
        showNotification('Please select a date and time for your session', 'error');
        return;
    }
    
    const userNumber = prompt('Please enter your phone number for confirmation:');
    if (!userNumber) {
        showNotification('Phone number is required for booking', 'error');
        return;
    }
    
    if (userNumber.length < 8) {
        showNotification('Please enter a valid phone number', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/bookings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                tutorId: parseInt(tutorId),
                subject: subject,
                userNumber: userNumber,
                schedule: scheduleInput.value
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(`Booking confirmed with ${tutorName}! We'll contact you soon.`, 'success');
            modal.style.display = 'none';
            clearModalSelection();
        } else {
            showNotification(result.error || 'Booking failed. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Error confirming booking:', error);
        showNotification('Network error. Please check your connection and try again.', 'error');
    }
}

// ==============================================
// CALENDAR FUNCTIONS
// ==============================================

function initializeCalendar() {
    updateCalendar();
    
    const prevBtn = document.getElementById('prev-month');
    const nextBtn = document.getElementById('next-month');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() - 1);
            updateCalendar();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            currentDate.setMonth(currentDate.getMonth() + 1);
            updateCalendar();
        });
    }
}

function updateCalendar() {
    const monthYear = document.getElementById('current-month');
    const daysContainer = document.getElementById('calendar-days');
    
    if (!monthYear || !daysContainer) return;
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    monthYear.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    
    daysContainer.innerHTML = '';
    
    // Previous month days
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDay - 1; i >= 0; i--) {
        const day = document.createElement('div');
        day.className = 'prev-month';
        day.textContent = prevMonthLastDay - i;
        daysContainer.appendChild(day);
    }
    
    // Current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const dayElement = document.createElement('div');
        dayElement.textContent = day;
        
        const currentDateObj = new Date(year, month, day);
        if (currentDateObj.toDateString() === today.toDateString()) {
            dayElement.classList.add('today');
        }
        
        // Mark payment deadline days
        paymentDeadlines.forEach(deadline => {
            if (currentDateObj.getDate() === deadline.date.getDate() &&
                currentDateObj.getMonth() === deadline.date.getMonth()) {
                dayElement.classList.add('exam-day'); // Using existing class for styling
                dayElement.title = deadline.name;
            }
        });
        
        daysContainer.appendChild(dayElement);
    }
}

// ==============================================
// WEBSOCKET FUNCTIONS
// ==============================================

function setupAnnouncementWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('WebSocket connected for announcements');
    };
    
    ws.onmessage = function(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('WebSocket message:', data);
            
            if (data.type === 'announcement' || data.type === 'announcement_deleted') {
                loadAnnouncements(); // Refresh announcements
            }
            
            if (data.isBrowserNotification && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('LearnHub Update', { body: data.message });
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };
    
    ws.onerror = function(error) {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = function() {
        console.log('WebSocket disconnected');
        // Try to reconnect after 5 seconds
        setTimeout(setupAnnouncementWebSocket, 5000);
    };
}

// ==============================================
// UTILITY FUNCTIONS
// ==============================================

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function renderStars(rating) {
    let stars = '';
    const numericRating = parseFloat(rating) || 0;
    
    for (let i = 1; i <= 5; i++) {
        if (i <= Math.floor(numericRating)) {
            stars += '<i class="fas fa-star"></i>';
        } else if (i === Math.ceil(numericRating) && numericRating % 1 > 0) {
            stars += '<i class="fas fa-star-half-alt"></i>';
        } else {
            stars += '<i class="far fa-star"></i>';
        }
    }
    return stars;
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString;
    }
}

function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existing = document.querySelector('.notification');
    if (existing) existing.remove();
    
    // Create notification
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        z-index: 1000;
        max-width: 300px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease-out;
    `;
    
    // Set color based on type
    if (type === 'success') {
        notification.style.background = '#2ecc71';
    } else if (type === 'error') {
        notification.style.background = '#e74c3c';
    } else if (type === 'warning') {
        notification.style.background = '#f39c12';
    } else {
        notification.style.background = '#3498db';
    }
    
    notification.innerHTML = `
        ${message}
        <span style="margin-left: 10px; cursor: pointer; font-weight: bold;" 
              onclick="this.parentElement.remove()">&times;</span>
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

// Make functions globally available
window.loadAnnouncements = loadAnnouncements;
window.loadSubjects = loadSubjects;
window.fetchTutorsBySubject = fetchTutorsBySubject;
window.confirmBooking = confirmBooking;