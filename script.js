document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    const modal = document.getElementById('tutorModal');
    const closeBtn = document.querySelector('.close-btn');
    const modalTitle = document.getElementById('modalTitle');
    const tutorList = document.getElementById('tutor-list');
    const confirmBookingBtn = document.getElementById('confirmBookingBtn');
    const contactForm = document.getElementById('contact-form');
    const nav = document.getElementById('main-nav');
    const navMenu = document.getElementById('nav-menu');
    const menuToggle = document.getElementById('menu-toggle');
    const ws = new WebSocket(`ws${window.location.protocol === 'https:' ? 's' : ''}://${window.location.host}`);

    ws.onopen = () => {
        console.log('WebSocket connected on index');
    };

    ws.onmessage = (event) => {
        const notification = JSON.parse(event.data);
        console.log('Received notification on index:', notification);
        if (notification.isBrowserNotification) {
            if ('Notification' in window && Notification.permission !== 'denied') {
                Notification.requestPermission().then(permission => {
                    if (permission === 'granted') {
                        new Notification(notification.message);
                    }
                });
            } else if (Notification.permission === 'granted') {
                new Notification(notification.message);
            }
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error on index:', error);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected on index');
    };

    let currentSubject = '';

    // Debug DOM elements
    console.log('Modal:', modal);
    console.log('Close Button:', closeBtn);
    console.log('Modal Title:', modalTitle);
    console.log('Tutor List:', tutorList);
    console.log('Confirm Booking Button:', confirmBookingBtn);
    console.log('Contact Form:', contactForm);

    // Debug Admin Login button click
    const adminLoginBtn = document.querySelector('.admin-login-btn');
    if (adminLoginBtn) {
        adminLoginBtn.addEventListener('click', (e) => {
            console.log('Admin Login button clicked, href:', adminLoginBtn.getAttribute('href'));
        });
    }

    // Navigation menu toggle
    let isSideMenu = false;
    let lastScrollTop = 0;
    const navHeight = nav.offsetHeight;

    menuToggle.addEventListener('click', () => {
        navMenu.classList.toggle('active');
        nav.classList.toggle('active');
    });

    window.addEventListener('scroll', () => {
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

        if (scrollTop > navHeight && !isSideMenu) {
            nav.classList.add('side-menu');
            isSideMenu = true;
            navMenu.classList.remove('active');
        } else if (scrollTop <= navHeight && isSideMenu) {
            nav.classList.remove('side-menu');
            isSideMenu = false;
            navMenu.classList.remove('active');
        }

        lastScrollTop = scrollTop;
    });

    // Add click event to select buttons
    document.querySelectorAll('.select-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const subject = btn.closest('.subject-card').getAttribute('data-subject');
            console.log('Selected subject:', subject);
            showTutors(subject);
        });
    });

    // Close modal
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    // Close modal when clicking outside
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Contact form submission
    if (contactForm) {
        contactForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            console.log('Contact form submitted');

            const name = document.getElementById('name').value;
            const number = document.getElementById('number').value;
            const message = document.getElementById('message').value;

            console.log('Form data:', { name, number, message });

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name, number, message }),
                });

                console.log('Contact response:', response);
                const data = await response.json();

                if (response.ok) {
                    alert('Thank you for your message! We will get back to you soon.');
                    contactForm.reset();
                } else {
                    console.error('Contact error:', data);
                    alert(`Error sending message: ${data.error || 'Please try again later.'}`);
                }
            } catch (error) {
                console.error('Error sending message:', error);
                alert('Error sending message. Please check your connection and try again.');
            }
        });
    }

    // Show tutors for a subject
    async function showTutors(subject) {
        currentSubject = subject;
        console.log('Fetching tutors for:', subject);
        try {
            const response = await fetch(`/api/tutors/${subject.toLowerCase()}`);
            console.log('Fetch response:', response);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const subjectTutors = await response.json();
            console.log('Tutors received:', subjectTutors);
            modalTitle.textContent = `Select Your ${subject.charAt(0).toUpperCase() + subject.slice(1)} Tutor`;
            tutorList.innerHTML = '';
            if (!subjectTutors || subjectTutors.length === 0) {
                console.log('No tutors found for subject:', subject);
                tutorList.innerHTML = '<p>No tutors available for this subject at the moment.</p>';
            } else {
                subjectTutors.forEach(tutor => {
                    console.log('Rendering tutor:', tutor.name);
                    const tutorCard = document.createElement('div');
                    tutorCard.className = 'tutor-card';
                    tutorCard.innerHTML = `
                        <img src="${tutor.image || 'default-tutor.png'}" alt="${tutor.name}">
                        <div class="tutor-info">
                            <h4>${tutor.name}</h4>
                            <p>${tutor.experience}</p>
                        </div>
                        <div class="tutor-rating">
                            <i class="fas fa-star"></i> ${tutor.rating}
                        </div>
                        <input type="radio" name="tutor" value="${tutor.id}">
                    `;
                    tutorList.appendChild(tutorCard);
                });
            }
            modal.style.display = 'block';
        } catch (error) {
            console.error('Error fetching tutors:', error);
            tutorList.innerHTML = '<p>Error loading tutors. Please try again later.</p>';
            modal.style.display = 'block';
        }
    }

    // Confirm booking
    if (confirmBookingBtn) {
        confirmBookingBtn.addEventListener('click', async () => {
            const selectedTutor = document.querySelector('input[name="tutor"]:checked');
            const schedule = document.getElementById('schedule').value;

            console.log('Booking data:', { selectedTutor, schedule });

            if (!selectedTutor) {
                alert('Please select a tutor');
                return;
            }

            if (!schedule) {
                alert('Please select a date and time');
                return;
            }

            const tutorId = selectedTutor.value;
            const tutorName = selectedTutor.closest('.tutor-card').querySelector('h4').textContent;
            const userNumber = prompt('Please enter your mobile number to confirm the booking:');

            if (!userNumber) {
                alert('Mobile number is required to confirm the booking');
                return;
            }

            try {
                const response = await fetch('/api/bookings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        tutorId,
                        subject: currentSubject,
                        userNumber,
                        schedule,
                    }),
                });

                console.log('Booking response:', response);
                const data = await response.json();

                if (response.ok) {
                    alert(`Booking confirmed!\n\nTutor: ${tutorName}\nSubject: ${currentSubject}\nDate: ${new Date(schedule).toLocaleString()}`);
                    modal.style.display = 'none';
                } else {
                    console.error('Booking error:', data);
                    alert(`Error creating booking: ${data.error || 'Please try again later.'}`);
                }
            } catch (error) {
                console.error('Error creating booking:', error);
                alert('Error creating booking. Please check your connection and try again.');
            }
        });
    }

    // Exam dates data
    const examDates = [
        { subject: "Mathematics Paper 1 ", date: "2025-10-13" },
        { subject: "Mathematics Paper 2 ", date: "2025-10-13" },
        { subject: "Mathematics Paper 3 ", date: "2025-10-14" },
        { subject: "Mathematics Paper 4 ", date: "2025-10-14" },
        { subject: "Physics Paper 1", date: "2025-10-21" },
        { subject: "Physics Paper 2", date: "2025-10-22" },
        { subject: "Physics Paper 3", date: "2025-10-22" },
        { subject: "Chemistry Paper 1", date: "2025-10-20" },
        { subject: "Chemistry Paper 2", date: "2025-10-23" },
        { subject: "Chemistry Paper 3", date: "2025-10-20" },
        { subject: "Biology Paper 1", date: "2025-10-30" },
        { subject: "Biology Paper 3", date: "2025-10-30" },
        { subject: "Biology Paper 2", date: "2025-11-04" },
        { subject: "Literature in English Paper 1", date: "2025-10-16" },
        { subject: "ICT Paper 1 ", date: "2025-10-15" },
        { subject: "ICT Paper 2 (Practical)", date: "2025-10-07" },
        { subject: "ICT Paper 3 (Practical)", date: "2025-10-10" },
        { subject: "Design & Technology Paper 1", date: "2025-10-24" },
        { subject: "Design & Technology Coursework", date: "2025-10-13" }
    ];

    // Populate exam list
    const examList = document.getElementById('exam-list');
    if (examList) {
        examDates.forEach(exam => {
            const li = document.createElement('li');
            li.textContent = `${exam.subject}: ${new Date(exam.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
            examList.appendChild(li);
        });
    }

    // Set next exam date
    const nextExamDate = new Date(examDates[0].date);
    const nextExamDateEl = document.getElementById('next-exam-date');
    if (nextExamDateEl) {
        nextExamDateEl.textContent = nextExamDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    }

    // Countdown timer
    function updateCountdown() {
        const now = new Date();
        const diff = nextExamDate - now;

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');

        if (daysEl && hoursEl && minutesEl && secondsEl) {
            daysEl.textContent = days.toString().padStart(2, '0');
            hoursEl.textContent = hours.toString().padStart(2, '0');
            minutesEl.textContent = minutes.toString().padStart(2, '0');
            secondsEl.textContent = seconds.toString().padStart(2, '0');
        }

        if (diff < 0) {
            clearInterval(countdownInterval);
            const countdownTitle = document.querySelector('.countdown-container h3');
            if (countdownTitle) {
                countdownTitle.textContent = "Final Exams Have Started!";
            }
        }
    }

    updateCountdown();
    const countdownInterval = setInterval(updateCountdown, 1000);

    // Calendar functionality
    let currentMonth = new Date(examDates[0].date).getMonth();
    let currentYear = new Date(examDates[0].date).getFullYear();

    function renderCalendar() {
        const monthNames = ["January", "February", "March", "April", "May", "June",
                            "July", "August", "September", "October", "November", "December"];
        const currentMonthEl = document.getElementById('current-month');
        if (currentMonthEl) {
            currentMonthEl.textContent = `${monthNames[currentMonth]} ${currentYear}`;
        }

        const firstDay = new Date(currentYear, currentMonth, 1).getDay();
        const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
        const calendarDays = document.getElementById('calendar-days');
        if (calendarDays) {
            calendarDays.innerHTML = '';

            // Previous month days
            for (let i = firstDay - 1; i >= 0; i--) {
                const dayElement = document.createElement('div');
                dayElement.className = 'prev-month';
                dayElement.textContent = daysInPrevMonth - i;
                calendarDays.appendChild(dayElement);
            }

            // Current month days
            const today = new Date();
            for (let i = 1; i <= daysInMonth; i++) {
                const dayElement = document.createElement('div');
                dayElement.textContent = i;

                if (i === today.getDate() && currentMonth === today.getMonth() && currentYear === today.getFullYear()) {
                    dayElement.classList.add('today');
                }

                examDates.forEach(exam => {
                    const examDate = new Date(exam.date);
                    if (i === examDate.getDate() && currentMonth === examDate.getMonth() && currentYear === examDate.getFullYear()) {
                        dayElement.classList.add('exam-day');
                        dayElement.title = `${exam.subject} Exam`;
                    }
                });

                calendarDays.appendChild(dayElement);
            }

            // Next month days
            const totalCells = firstDay + daysInMonth;
            const nextMonthDays = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
            for (let i = 1; i <= nextMonthDays; i++) {
                const dayElement = document.createElement('div');
                dayElement.className = 'next-month';
                dayElement.textContent = i;
                calendarDays.appendChild(dayElement);
            }
        }
    }

    // Navigation buttons
    const prevMonthBtn = document.getElementById('prev-month');
    const nextMonthBtn = document.getElementById('next-month');
    if (prevMonthBtn) {
        prevMonthBtn.addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) {
                currentMonth = 11;
                currentYear--;
            }
            renderCalendar();
        });
    }
    if (nextMonthBtn) {
        nextMonthBtn.addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) {
                currentMonth = 0;
                currentYear++;
            }
            renderCalendar();
        });
    }

    renderCalendar();

    // Smooth scrolling for navigation
    document.querySelectorAll('nav a').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = anchor.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 70,
                    behavior: 'smooth'
                });
                if (isSideMenu) {
                    navMenu.classList.remove('active');
                    nav.classList.remove('active');
                }
            }
        });
    });
});

// Load announcements from server
async function loadAnnouncements() {
    try {
        const response = await fetch('/api/announcements');
        const announcements = await response.json();
        
        const container = document.getElementById('announcements-container');
        
        if (!announcements || announcements.length === 0) {
            container.innerHTML = `
                <div class="announcement-card">
                    <h3>No Announcements Yet</h3>
                    <p class="announcement-date">Check back later for updates</p>
                    <p>Our team will post important updates here soon.</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = announcements.map(announcement => `
            <div class="announcement-card">
                <h3>${escapeHtml(announcement.title)}</h3>
                <p class="announcement-date">
                    <i class="far fa-calendar"></i> ${formatAnnouncementDate(announcement.created_at)}
                    ${announcement.author ? ` • <i class="fas fa-user"></i> ${escapeHtml(announcement.author)}` : ''}
                </p>
                <p>${escapeHtml(announcement.content)}</p>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading announcements:', error);
        const container = document.getElementById('announcements-container');
        container.innerHTML = `
            <div class="announcement-card">
                <h3>Error Loading Announcements</h3>
                <p>Please check back later.</p>
            </div>
        `;
    }
}

// Format date for announcements
function formatAnnouncementDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Call this function when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // ... your existing code ...
    loadAnnouncements(); // Add this line
    
    // Also add WebSocket for real-time updates
    setupAnnouncementWebSocket();
});

// WebSocket for real-time announcement updates
function setupAnnouncementWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = function() {
        console.log('Connected to announcements WebSocket');
    };
    
    ws.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'announcement' || data.type === 'announcement_deleted') {
            loadAnnouncements(); // Refresh announcements
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
// Load subjects from server
async function loadSubjects() {
    try {
        const response = await fetch('/api/subjects');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const subjects = await response.json();
        console.log('Subjects loaded:', subjects); // Debug log
        
        const container = document.getElementById('subjects-container');
        
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
        
        // Filter only available subjects
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
        
        container.innerHTML = availableSubjects.map(subject => `
            <div class="subject-card" data-subject="${subject.name.toLowerCase()}">
                <i class="${subject.icon || 'fas fa-book'}"></i>
                <h3>${escapeHtml(subject.name)}</h3>
                <p>${escapeHtml(subject.description || 'Expert tutoring available')}</p>
                <p><small><i class="fas fa-users"></i> ${subject.tutor_count || 0} tutor(s) available</small></p>
                <button class="select-btn" onclick="selectSubject('${escapeHtml(subject.name)}')">
                    Select
                </button>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error loading subjects:', error);
        const container = document.getElementById('subjects-container');
        container.innerHTML = `
            <div class="subject-card" style="grid-column: 1 / -1; text-align: center; padding: 40px;">
                <i class="fas fa-exclamation-triangle" style="color: #e74c3c; font-size: 3rem; margin-bottom: 20px;"></i>
                <h3>Error Loading Subjects</h3>
                <p>Please try again later.</p>
                <button onclick="loadSubjects()" class="btn" style="margin-top: 10px;">
                    <i class="fas fa-sync-alt"></i> Retry
                </button>
            </div>
        `;
    }
}

// Select subject function
function selectSubject(subjectName) {
    console.log('Selected subject:', subjectName);
    // Your existing subject selection logic here
    // For now, just show the tutor modal
    showTutorModal(subjectName);
}

async function loadSubjects() {
    try {
        console.log('Loading subjects from API...');
        
        // ADD CACHE BUSTING
        const response = await fetch(`/api/subjects?t=${Date.now()}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const subjects = await response.json();
        console.log('Subjects received:', subjects);
        
        const container = document.getElementById('subjects-container');
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
                    <button class="select-btn" onclick="selectSubject('${subjectName}')">
                        Select
                    </button>
                </div>
            `;
        }).join('');
        
        console.log(`Displayed ${availableSubjects.length} subjects`);
        
    } catch (error) {
        console.error('Error loading subjects:', error);
        const container = document.getElementById('subjects-container');
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

function selectSubject(subjectName) {
    console.log('Selected subject:', subjectName);
    // Your existing subject selection logic
    // This should trigger your tutor modal
    fetchTutorsBySubject(subjectName);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make sure this function exists for fetching tutors
async function fetchTutorsBySubject(subject) {
    // Your existing code for fetching tutors by subject
    console.log('Fetching tutors for:', subject);
    // ... your existing modal logic ...
}

// ==============================================
// INITIALIZATION
// ==============================================

document.addEventListener('DOMContentLoaded', function() {
    // ... your existing initialization code ...
    
    // Load dynamic content
    loadAnnouncements();
    loadSubjects(); // Add this line here
    
    // ... rest of your existing code ...
});
// Show tutor modal (you might already have this)
function showTutorModal(subject) {
    // Your existing modal logic
    console.log('Opening tutor modal for:', subject);
    // ... existing code ...
}

// Escape HTML function
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}


// Call this in your DOMContentLoaded
document.addEventListener('DOMContentLoaded', function() {
    // ... existing code ...
    loadSubjects(); // Add this line
    loadActiveTutors(); // Add this to show active tutors somewhere
});

// Load active tutors for display
async function loadActiveTutors() {
    try {
        const response = await fetch('/api/tutors/active');
        const tutors = await response.json();
        
        // You can display these tutors in a section if you want
        console.log('Active tutors:', tutors);
        
    } catch (error) {
        console.error('Error loading active tutors:', error);
    }
}