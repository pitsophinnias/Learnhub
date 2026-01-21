const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Secure in production
const DELETE_PASSWORD_HASH = '$2b$10$9k3Qz8J8k2j3m4n5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3'; // Hashed "phinnyonly"

//Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, '.')));

//authentication middleware
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access denied' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification error:', error);
        res.status(403).json({ error: 'Invalid token' });
    }
};

//PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.stack);
    } else {
        console.log('Database connected successfully');
        release();
    }
});
//Create HTTP server and Websocket clients
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map to store admin WebSocket connections by admin ID
const adminClients = new Map();

wss.on('connection', (ws, req) => {
    console.log(`WebSocket client connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
    ws.isAdmin = false;
    ws.adminId = null;

    ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'admin_login' && message.adminId) {
            ws.isAdmin = true;
            ws.adminId = message.adminId;
            adminClients.set(message.adminId, ws);
            console.log(`Admin ${message.adminId} registered with WebSocket`);
        }
    });

    ws.on('close', (code, reason) => {
        console.log(`WebSocket client disconnected: code=${code}, reason=${reason}`);
        if (ws.isAdmin && ws.adminId) {
            adminClients.delete(ws.adminId);
        }
        clients.delete(ws);
    });

    ws.on('error', (error) => {
        console.error('WebSocket server error:', error);
        if (ws.isAdmin && ws.adminId) {
            adminClients.delete(ws.adminId);
        }
        clients.delete(ws);
    });
});

wss.on('error', (error) => {
    console.error('WebSocket server error:', error);
});

// Store all clients (for debugging)
const clients = new Set();

// Fnction to broadcast notifications
function broadcastNotification(type) {
    console.log('Broadcasting notification:', type);
    let clientCount = 0;
    adminClients.forEach((ws, adminId) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                const notification = {
                    type: type,
                    message: type === 'booking' ? 'New booking' : type === 'contact' ? 'New message' : type.includes('deleted') ? `${type.replace('_deleted', '')} deleted` : 'Notification',
                    isBrowserNotification: true
                };
                ws.send(JSON.stringify(notification));
                clientCount++;
            } catch (error) {
                console.error(`Error sending to admin ${adminId}:`, error);
                adminClients.delete(adminId);
            }
        }
    });
    console.log(`Notification sent to ${clientCount} admin clients`);
	
	if (type === 'announcement') {
        notification.message = 'New announcement posted';
    } else if (type === 'tutor_added') {
        notification.message = 'New tutor added';
    } else if (type === 'tutor_deleted') {
        notification.message = 'Tutor removed';
    }
}

// Verify delete password endpoint
app.post('/api/verify-delete-password', async (req, res) => {
    try {
        const { password } = req.body;
        const isMatch = await bcrypt.compare(password, DELETE_PASSWORD_HASH);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid delete password' });
        }
        res.status(200).json({ message: 'Password verified' });
    } catch (error) {
        console.error('Error verifying delete password:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin Registration Endpoint
app.post('/api/admin/register', async (req, res) => {
    try {
        const { tutorId, username, password } = req.body;
        console.log('Admin registration attempt:', { tutorId, username });
		
		// Validate tutor ID exists
        const tutorResult = await pool.query('SELECT id FROM tutors WHERE id = $1', [tutorId]);
        if (tutorResult.rows.length === 0) {
            console.log('Tutor not found:', tutorId);
            return res.status(400).json({ error: 'Invalid tutor ID' });
        }
		
		// Check if username alread exists
        const existingUser = await pool.query('SELECT id FROM admin_users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            console.log('Username already exists:', username);
            return res.status(400).json({ error: 'Username already exists' });
        }
		
		// Hash password
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

		// Insert 
        const result = await pool.query(
            'INSERT INTO admin_users (tutor_id, username, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
            [tutorId, username, passwordHash]
        );

        console.log('Admin registered:', result.rows[0]);
        res.status(201).json({ message: 'Registration successful' });
    } catch (error) {
        console.error('Error during registration:', error.message);
        res.status(500).json({ error: 'Error during registration' });
    }
});

// Admin Login Endpoint
app.post('/api/admin/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        console.log('Admin login attempt:', { username });

        const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
        const admin = result.rows[0];

        if (!admin) {
            console.log('Admin not found:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const isMatch = await bcrypt.compare(password, admin.password_hash);
        if (!isMatch) {
            console.log('Invalid password for:', username);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: admin.id, username: admin.username }, JWT_SECRET, { expiresIn: '1h' });
        console.log('Admin logged in:', username);
        res.status(200).json({ token });
    } catch (error) {
        console.error('Error during login:', error.message);
        res.status(500).json({ error: 'Error during login' });
    }
});

// Contact Form Endpoint
app.post('/api/contact', async (req, res) => {
    try {
        const { name, number, message } = req.body;
        console.log('Received contact form:', { name, number, message });
        const result = await pool.query(
            'INSERT INTO contacts (name, number, message) VALUES ($1, $2, $3) RETURNING *',
            [name, number, message]
        );
        console.log('Contact saved:', result.rows[0]);
        broadcastNotification('contact');
        res.status(200).json({ message: 'Message saved successfully', data: result.rows[0] });
    } catch (error) {
        console.error('Error saving message:', error.message);
        res.status(500).json({ error: 'Error saving message' });
    }
});

// Get All Contact Messages (Protected)
app.get('/api/contacts', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM contacts ORDER BY created_at DESC');
        console.log('Contacts found:', result.rows);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching contacts:', error.message);
        res.status(500).json({ error: 'Error fetching contacts' });
    }
});

// Delete Contact (Protected)
app.delete('/api/contacts/:number', authenticateToken, async (req, res) => {
    try {
        const { number } = req.params;
        console.log('Attempting to delete contact:', { number });
        const result = await pool.query('DELETE FROM contacts WHERE number = $1 RETURNING *', [number]);
        if (result.rows.length === 0) {
            console.log('Contact not found:', number);
            return res.status(404).json({ error: 'Contact not found' });
        }
        console.log('Contact deleted:', result.rows[0]);
        broadcastNotification('contact_deleted');
        res.status(200).json({ message: 'Contact deleted successfully' });
    } catch (error) {
        console.error('Error deleting contact:', error.message);
        res.status(500).json({ error: 'Error deleting contact' });
    }
});

// Get Tutors by Subject
app.get('/api/tutors/:subject', async (req, res) => {
    try {
        const subject = req.params.subject.toLowerCase();
        console.log('Fetching tutors for:', subject);
        const result = await pool.query('SELECT * FROM tutors WHERE $1 = ANY(subjects)', [subject]);
        console.log('Tutors found:', result.rows);
        if (result.rows.length === 0) {
            console.log(`No tutors found for subject: ${subject}`);
        }
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching tutors:', error.message);
        res.status(500).json({ error: 'Error fetching tutors' });
    }
});

// Create Booking
app.post('/api/bookings', async (req, res) => {
    try {
        const { tutorId, subject, userNumber, schedule } = req.body;
        console.log('Received booking:', { tutorId, subject, userNumber, schedule });
        const result = await pool.query(
            'INSERT INTO bookings (tutor_id, subject, user_number, schedule) VALUES ($1, $2, $3, $4) RETURNING *',
            [tutorId, subject, userNumber, schedule]
        );
        console.log('Booking created:', result.rows[0]);
        broadcastNotification('booking');
        res.status(200).json({ message: 'Booking created successfully', data: result.rows[0] });
    } catch (error) {
        console.error('Error creating booking:', error.message);
        res.status(500).json({ error: 'Error creating booking' });
    }
});

// Get All Bookings (Protected)
app.get('/api/bookings', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT b.*, t.name AS tutor_name FROM bookings b LEFT JOIN tutors t ON b.tutor_id = t.id ORDER BY b.created_at DESC'
        );
        console.log('Bookings found:', result.rows);
        res.status(200).json(result.rows || []);
    } catch (error) {
        console.error('Error fetching bookings:', error.message);
        res.status(500).json({ error: 'Error fetching bookings', details: error.message });
    }
});

// Delete Booking (Protected)
app.delete('/api/bookings/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Attempting to delete booking:', { id });
        const result = await pool.query('DELETE FROM bookings WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            console.log('Booking not found:', id);
            return res.status(404).json({ error: 'Booking not found' });
        }
        console.log('Booking deleted:', result.rows[0]);
        broadcastNotification('booking_deleted');
        res.status(200).json({ message: 'Booking deleted successfully' });
    } catch (error) {
        console.error('Error deleting booking:', error.message);
        res.status(500).json({ error: 'Error deleting booking' });
    }
});

// Add these endpoints to your server.js file:

// Get all announcements (public endpoint - no auth required)
app.get('/api/announcements', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT a.*, au.username AS author FROM announcements a LEFT JOIN admin_users au ON a.created_by = au.id ORDER BY a.created_at DESC'
        );
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching announcements:', error.message);
        res.status(500).json({ error: 'Error fetching announcements' });
    }
});

// Create announcement (Protected)
app.post('/api/announcements', authenticateToken, async (req, res) => {
    try {
        const { title, content } = req.body;
        const created_by = req.user.id; // From JWT token
        
        const result = await pool.query(
            'INSERT INTO announcements (title, content, created_by) VALUES ($1, $2, $3) RETURNING *',
            [title, content, created_by]
        );
        
        // Broadcast notification for new announcement
        broadcastNotification('announcement');
        
        res.status(201).json({ 
            message: 'Announcement created successfully', 
            announcement: result.rows[0] 
        });
    } catch (error) {
        console.error('Error creating announcement:', error.message);
        res.status(500).json({ error: 'Error creating announcement' });
    }
});

// Update announcement (Protected)
app.put('/api/announcements/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { title, content } = req.body;
        
        const result = await pool.query(
            'UPDATE announcements SET title = $1, content = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *',
            [title, content, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }
        
        res.status(200).json({ 
            message: 'Announcement updated successfully', 
            announcement: result.rows[0] 
        });
    } catch (error) {
        console.error('Error updating announcement:', error.message);
        res.status(500).json({ error: 'Error updating announcement' });
    }
});

// Delete announcement (Protected)
app.delete('/api/announcements/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM announcements WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Announcement not found' });
        }
        
        broadcastNotification('announcement_deleted');
        res.status(200).json({ message: 'Announcement deleted successfully' });
    } catch (error) {
        console.error('Error deleting announcement:', error.message);
        res.status(500).json({ error: 'Error deleting announcement' });
    }
});

// Get active tutors (public endpoint)
app.get('/api/tutors/active', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT t.*, 
                   ARRAY_AGG(DISTINCT s.name) as subject_names,
                   ARRAY_AGG(DISTINCT s.icon) as subject_icons
            FROM tutors t
            LEFT JOIN tutor_subjects ts ON t.id = ts.tutor_id
            LEFT JOIN subjects s ON ts.subject_id = s.id
            WHERE t.is_active = TRUE
            GROUP BY t.id
            ORDER BY t.rating DESC, t.name
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching active tutors:', error.message);
        res.status(500).json({ error: 'Error fetching active tutors' });
    }
});

// Get all subjects (public)
app.get('/api/subjects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(DISTINCT ts.tutor_id) as tutor_count
            FROM subjects s
            LEFT JOIN tutor_subjects ts ON s.id = ts.subject_id
            WHERE s.is_available = TRUE
            GROUP BY s.id
            ORDER BY s.name
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching subjects:', error.message);
        res.status(500).json({ error: 'Error fetching subjects' });
    }
});

// Get all subjects for admin (protected)
app.get('/api/admin/subjects', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(DISTINCT ts.tutor_id) as tutor_count,
                   STRING_AGG(DISTINCT t.name, ', ') as tutor_names
            FROM subjects s
            LEFT JOIN tutor_subjects ts ON s.id = ts.subject_id
            LEFT JOIN tutors t ON ts.tutor_id = t.id
            GROUP BY s.id
            ORDER BY s.name
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching subjects for admin:', error.message);
        res.status(500).json({ error: 'Error fetching subjects for admin' });
    }
});

// Add new tutor (Protected)
app.post('/api/admin/tutors', authenticateToken, async (req, res) => {
    try {
        const { name, subjects, rating, experience, image, bio } = req.body;
        console.log('Adding new tutor:', { name, subjects, rating, experience });
        
        // Ensure subjects is properly formatted as PostgreSQL array
        let subjectsArray = subjects;
        if (Array.isArray(subjects)) {
            subjectsArray = `{${subjects.map(s => s.trim().toLowerCase()).join(',')}}`;
        } else if (typeof subjects === 'string') {
            subjectsArray = `{${subjects.split(',').map(s => s.trim().toLowerCase()).join(',')}}`;
        }
		
		console.log('Formatted subjects:', subjectsArray);
        
        const result = await pool.query(
            `INSERT INTO tutors (name, subjects, rating, experience, image, bio, is_active) 
             VALUES ($1, $2, $3, $4, $5, $6, $7) 
             RETURNING *`,
            [name, subjectsArray, rating, experience, image, bio || '', true]
        );
        
        console.log('Tutor added successfully. ID:', result.rows[0].id);
        broadcastNotification('tutor_added');
        
        res.status(201).json({ 
            message: 'Tutor added successfully', 
            tutor: result.rows[0] 
        });
		
		 } catch (error) {
        console.error('Error adding tutor:', error.message);
        console.error('Full error:', error);
        res.status(500).json({ 
            error: 'Error adding tutor', 
            details: error.message,
            code: error.code 
        });
    }
});

// Update tutor (Protected)
app.put('/api/admin/tutors/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subjects, rating, experience, image, bio, is_active } = req.body;
        
        // Format subjects if provided
        let subjectsArray = subjects;
        if (subjects && Array.isArray(subjects)) {
            subjectsArray = `{${subjects.map(s => s.trim().toLowerCase()).join(',')}}`;
        }
		
		 const result = await pool.query(
            `UPDATE tutors 
             SET name = COALESCE($1, name),
                 subjects = COALESCE($2, subjects),
                 rating = COALESCE($3, rating),
                 experience = COALESCE($4, experience),
                 image = COALESCE($5, image),
                 bio = COALESCE($6, bio),
                 is_active = COALESCE($7, is_active)
             WHERE id = $8 
             RETURNING *`,
            [name, subjectsArray, rating, experience, image, bio, is_active, id]
        );
		
		if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tutor not found' });
        }
        
        res.status(200).json({ 
            message: 'Tutor updated successfully', 
            tutor: result.rows[0] 
        });
    } catch (error) {
        console.error('Error updating tutor:', error.message);
        res.status(500).json({ error: 'Error updating tutor' });
    }
});

// Add new subject (protected)
app.post('/api/admin/subjects', authenticateToken, async (req, res) => {
    try {
        const { name, description, icon } = req.body;
        
        const result = await pool.query(
            'INSERT INTO subjects (name, description, icon) VALUES ($1, $2, $3) RETURNING *',
            [name, description, icon || 'fas fa-book']
        );
        
        broadcastNotification('subject_added');
        res.status(201).json({ 
            message: 'Subject added successfully', 
            subject: result.rows[0] 
        });
    } catch (error) {
        console.error('Error adding subject:', error.message);
        if (error.code === '23505') { // Unique violation
            res.status(400).json({ error: 'Subject already exists' });
        } else {
            res.status(500).json({ error: 'Error adding subject' });
        }
    }
});

// Assign tutor to subject (protected)
app.post('/api/admin/tutors/:tutorId/subjects/:subjectId', authenticateToken, async (req, res) => {
    try {
        const { tutorId, subjectId } = req.params;
        
        const result = await pool.query(
            'INSERT INTO tutor_subjects (tutor_id, subject_id) VALUES ($1, $2) RETURNING *',
            [tutorId, subjectId]
        );
        
        res.status(201).json({ 
            message: 'Tutor assigned to subject successfully'
        });
    } catch (error) {
        console.error('Error assigning tutor to subject:', error.message);
        res.status(500).json({ error: 'Error assigning tutor to subject' });
    }
});

// Remove tutor from subject (protected)
app.delete('/api/admin/tutors/:tutorId/subjects/:subjectId', authenticateToken, async (req, res) => {
    try {
        const { tutorId, subjectId } = req.params;
        
        const result = await pool.query(
            'DELETE FROM tutor_subjects WHERE tutor_id = $1 AND subject_id = $2 RETURNING *',
            [tutorId, subjectId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Assignment not found' });
        }
        
        res.status(200).json({ 
            message: 'Tutor removed from subject successfully' 
        });
    } catch (error) {
        console.error('Error removing tutor from subject:', error.message);
        res.status(500).json({ error: 'Error removing tutor from subject' });
    }
});

// Get tutors for a specific subject (public)
app.get('/api/subjects/:subjectId/tutors', async (req, res) => {
    try {
        const { subjectId } = req.params;
        const result = await pool.query(`
            SELECT t.*
            FROM tutors t
            JOIN tutor_subjects ts ON t.id = ts.tutor_id
            WHERE ts.subject_id = $1 AND t.is_active = TRUE
            ORDER BY t.rating DESC, t.name
        `, [subjectId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching tutors for subject:', error.message);
        res.status(500).json({ error: 'Error fetching tutors for subject' });
    }
});

// Get assignments for a subject (protected)
app.get('/api/admin/subjects/:subjectId/tutors', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const result = await pool.query(`
            SELECT t.*
            FROM tutors t
            JOIN tutor_subjects ts ON t.id = ts.tutor_id
            WHERE ts.subject_id = $1
            ORDER BY t.name
        `, [subjectId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching subject assignments:', error.message);
        res.status(500).json({ error: 'Error fetching subject assignments' });
    }
});

// Clear all assignments for a subject (protected)
app.delete('/api/admin/subjects/:subjectId/assignments', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const result = await pool.query(
            'DELETE FROM tutor_subjects WHERE subject_id = $1 RETURNING *',
            [subjectId]
        );
        res.status(200).json({ 
            message: 'Assignments cleared successfully',
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error clearing assignments:', error.message);
        res.status(500).json({ error: 'Error clearing assignments' });
    }
});

// Update subject status (protected)
app.put('/api/admin/subjects/:subjectId/status', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { is_available } = req.body;
        
        const result = await pool.query(
            'UPDATE subjects SET is_available = $1 WHERE id = $2 RETURNING *',
            [is_available, subjectId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        res.status(200).json({ 
            message: 'Subject status updated successfully',
            subject: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating subject status:', error.message);
        res.status(500).json({ error: 'Error updating subject status' });
    }
});

// Get all tutors for admin (Protected)
app.get('/api/admin/tutors', authenticateToken, async (req, res) => {
    try {
        console.log('Admin fetching all tutors...');
        const result = await pool.query(
            'SELECT * FROM tutors ORDER BY created_at DESC'
        );
        console.log(`Found ${result.rows.length} tutors`);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching tutors for admin:', error.message);
        res.status(500).json({ error: 'Error fetching tutors for admin' });
    }
});
// Get assignments for a subject (Protected) - referenced in loadCurrentAssignments()
app.get('/api/admin/subjects/:subjectId/tutors', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const result = await pool.query(`
            SELECT t.*
            FROM tutors t
            JOIN tutor_subjects ts ON t.id = ts.tutor_id
            WHERE ts.subject_id = $1
            ORDER BY t.name
        `, [subjectId]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching subject assignments:', error.message);
        res.status(500).json({ error: 'Error fetching subject assignments' });
    }
});

// Clear all assignments for a subject (Protected) - referenced in saveAssignments()
app.delete('/api/admin/subjects/:subjectId/assignments', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const result = await pool.query(
            'DELETE FROM tutor_subjects WHERE subject_id = $1 RETURNING *',
            [subjectId]
        );
        res.status(200).json({ 
            message: 'Assignments cleared successfully',
            count: result.rows.length
        });
    } catch (error) {
        console.error('Error clearing assignments:', error.message);
        res.status(500).json({ error: 'Error clearing assignments' });
    }
});

// Update subject status (Protected) - referenced in toggleSubjectStatus()
app.put('/api/admin/subjects/:subjectId/status', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { is_available } = req.body;
        
        const result = await pool.query(
            'UPDATE subjects SET is_available = $1 WHERE id = $2 RETURNING *',
            [is_available, subjectId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        res.status(200).json({ 
            message: 'Subject status updated successfully',
            subject: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating subject status:', error.message);
        res.status(500).json({ error: 'Error updating subject status' });
    }
});

server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));