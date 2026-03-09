require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const DELETE_PASSWORD_HASH = '$2b$10$9k3Qz8J8k2j3m4n5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2g3'; // Hashed "phinnyonly"

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use('/images', express.static(path.join(__dirname, 'images')));
app.use(express.static(path.join(__dirname, '.')));

// Authentication middleware
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

// PostgreSQL Connection
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Database connection error:', err.stack);
    } else {
        console.log('Database connected successfully');
        release();
    }
});

// Create HTTP server and WebSocket clients
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Map to store admin WebSocket connections by admin ID
const adminClients = new Map();
const clients = new Set(); // Store all clients for debugging

wss.on('connection', (ws, req) => {
    console.log(`WebSocket client connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);
    ws.isAdmin = false;
    ws.adminId = null;
    clients.add(ws);

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

// Function to broadcast notifications to all admin clients
function broadcastNotification(type, message = null) {
    console.log('Broadcasting notification:', type);
    let clientCount = 0;
    
    const defaultMessages = {
        'booking': 'New booking',
        'booking_deleted': 'Booking deleted',
        'bookings_archived': 'Bookings archived',
        'booking_restored': 'Booking restored',
        'contact': 'New message',
        'contact_deleted': 'Message deleted',
        'announcement': 'New announcement posted',
        'announcement_deleted': 'Announcement deleted',
        'tutor_added': 'New tutor added',
        'tutor_deleted': 'Tutor removed',
        'subject_added': 'New subject added',
        'subject_updated': 'Subject updated'  // Add this line
    };
    
    const notification = {
        type: type,
        message: message || defaultMessages[type] || 'Notification',
        isBrowserNotification: true
    };
    
    adminClients.forEach((ws, adminId) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(notification));
                clientCount++;
            } catch (error) {
                console.error(`Error sending to admin ${adminId}:`, error);
                adminClients.delete(adminId);
            }
        }
    });
    console.log(`Notification sent to ${clientCount} admin clients`);
}

// ==============================================
// ADMIN AUTHENTICATION ENDPOINTS
// ==============================================

// Verify delete password
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

// Admin Registration
app.post('/api/admin/register', async (req, res) => {
    try {
        const { tutorId, username, password } = req.body;
        console.log('Admin registration attempt:', { tutorId, username });
        
        const tutorResult = await pool.query('SELECT id FROM tutors WHERE id = $1', [tutorId]);
        if (tutorResult.rows.length === 0) {
            console.log('Tutor not found:', tutorId);
            return res.status(400).json({ error: 'Invalid tutor ID' });
        }
        
        const existingUser = await pool.query('SELECT id FROM admin_users WHERE username = $1', [username]);
        if (existingUser.rows.length > 0) {
            console.log('Username already exists:', username);
            return res.status(400).json({ error: 'Username already exists' });
        }
        
        const saltRounds = 10;
        const passwordHash = await bcrypt.hash(password, saltRounds);

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

// Admin Login
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

// ==============================================
// PASSWORD RESET ENDPOINTS
// ==============================================

// Email transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Request reset link
app.post('/api/admin/forgot-password', async (req, res) => {
    try {
        const { username } = req.body;

        if (!username || typeof username !== 'string' || username.trim() === '') {
            return res.status(400).json({ error: 'Username is required' });
        }

        const trimmedUsername = username.trim();
        console.log(`Forgot-password request for username: "${trimmedUsername}"`);

        const result = await pool.query(`
            SELECT 
                au.id AS admin_id,
                au.username,
                t.email AS tutor_email
            FROM admin_users au
            LEFT JOIN tutors t ON au.tutor_id = t.id
            WHERE au.username ILIKE $1
        `, [trimmedUsername]);

        if (result.rows.length === 0 || !result.rows[0].tutor_email) {
            console.log(`No user or no email found for: "${trimmedUsername}"`);
            return res.status(200).json({
                message: 'If an account with that username exists, a reset link has been sent to the associated email.'
            });
        }

        const { admin_id, tutor_email } = result.rows[0];
        console.log(`User found - ID: ${admin_id}, Email: ${tutor_email}`);

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

        await pool.query(`
            INSERT INTO password_reset_tokens (admin_id, token, expires_at)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
        `, [admin_id, token, expiresAt]);

        const baseUrl = process.env.APP_URL || 'http://localhost:3000';
        const resetUrl = `${baseUrl}/reset_password.html?token=${token}`;

        await transporter.sendMail({
            from: `"LearnHub Admin" <${process.env.EMAIL_USER}>`,
            to: tutor_email,
            subject: 'LearnHub Admin Password Reset Request',
            text: `Hello,\n\nA password reset was requested for your LearnHub admin account (${trimmedUsername}).\n\nUse this link to reset your password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not request this reset, please ignore this email or contact support.\n\nBest regards,\nLearnHub Team`,
            html: `
                <h2>Password Reset Request</h2>
                <p>Hello,</p>
                <p>A password reset was requested for your LearnHub admin account (<strong>${trimmedUsername}</strong>).</p>
                <p style="margin: 25px 0;">
                    <a href="${resetUrl}" style="background-color: #3498db; color: white; padding: 12px 28px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Reset Your Password
                    </a>
                </p>
                <p>This link will expire in 1 hour.</p>
                <p>If you did not request this reset, please ignore this email or contact support.</p>
                <p>Best regards,<br>LearnHub Team</p>
            `
        });

        console.log(`Reset email sent to ${tutor_email}`);
        res.status(200).json({
            message: 'If an account with that username exists, a reset link has been sent to the associated email.'
        });

    } catch (err) {
        console.error('Forgot password endpoint error:', err.message);
        res.status(200).json({
            message: 'If an account with that username exists, a reset link has been sent to the associated email.'
        });
    }
});

// Reset password with token
app.post('/api/admin/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) {
            return res.status(400).json({ error: 'Token and new password are required' });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ error: 'Password must be at least 8 characters' });
        }

        const tokenResult = await pool.query(`
            SELECT admin_id 
            FROM password_reset_tokens 
            WHERE token = $1 AND expires_at > NOW()
        `, [token]);

        if (tokenResult.rows.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const adminId = tokenResult.rows[0].admin_id;
        const hashed = await bcrypt.hash(newPassword, 10);

        await pool.query(`
            UPDATE admin_users 
            SET password_hash = $1 
            WHERE id = $2
        `, [hashed, adminId]);

        await pool.query('DELETE FROM password_reset_tokens WHERE token = $1', [token]);

        res.status(200).json({ message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        console.error('Reset password endpoint error:', err);
        res.status(500).json({ error: 'Server error - please try again' });
    }
});

// Test email endpoint
app.get('/test-send-email', async (req, res) => {
    try {
        const info = await transporter.sendMail({
            from: `"Test" <${process.env.EMAIL_USER}>`,
            to: 'pitsophinnias@gmail.com',
            subject: 'Test Email - LearnHub Local',
            text: 'This is a manual test from your server.\nTime: ' + new Date().toISOString(),
            html: '<h2>Test Email</h2><p>This is a manual test from your local server.</p><p>Time: ' + new Date().toISOString() + '</p>'
        });
        console.log('Test email sent - message ID:', info.messageId);
        res.send('Test email sent! Check inbox/spam. Message ID: ' + info.messageId);
    } catch (err) {
        console.error('Test email failed:', err.message);
        res.status(500).send('Failed: ' + err.message);
    }
});

// ==============================================
// CONTACT ENDPOINTS
// ==============================================

// Submit contact form
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

// Get all contacts (Protected)
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

// Delete contact (Protected)
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

// ==============================================
// TUTOR ENDPOINTS
// ==============================================

// Get tutors by subject (public)
app.get('/api/tutors/:subject', async (req, res) => {
    try {
        const subject = req.params.subject.toLowerCase();
        console.log('Fetching tutors for subject:', subject);
        
        const queryFromTutorSubjects = `
            SELECT DISTINCT t.* 
            FROM tutors t
            JOIN tutor_subjects ts ON t.id = ts.tutor_id
            JOIN subjects s ON ts.subject_id = s.id
            WHERE LOWER(s.name) = $1 
              AND t.is_active = true
              AND s.is_available = true
            ORDER BY t.rating DESC
        `;
        
        const queryFromTutorsArray = `
            SELECT DISTINCT t.* 
            FROM tutors t
            WHERE $1 = ANY(LOWER(t.subjects::text)::text[])
              AND t.is_active = true
            ORDER BY t.rating DESC
        `;
        
        const result1 = await pool.query(queryFromTutorSubjects, [subject]);
        
        if (result1.rows.length === 0) {
            console.log('No tutors found in tutor_subjects, checking tutors array...');
            const result2 = await pool.query(queryFromTutorsArray, [subject]);
            console.log(`Found ${result2.rows.length} tutors from array`);
            return res.status(200).json(result2.rows);
        }
        
        console.log(`Found ${result1.rows.length} tutors for subject: ${subject}`);
        res.status(200).json(result1.rows);
        
    } catch (error) {
        console.error('Error fetching tutors:', error.message);
        
        try {
            const subject = req.params.subject.toLowerCase();
            const fallbackResult = await pool.query(
                'SELECT * FROM tutors WHERE $1 = ANY(LOWER(subjects::text)::text[]) AND is_active = true ORDER BY rating DESC',
                [subject]
            );
            console.log(`Fallback found ${fallbackResult.rows.length} tutors`);
            res.status(200).json(fallbackResult.rows);
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError.message);
            res.status(500).json({ error: 'Error fetching tutors' });
        }
    }
});

// Get tutors by subject and level (public)
app.get('/api/tutors/:level/:subject', async (req, res) => {
    try {
        const { level, subject } = req.params;
        console.log(`Fetching ${level} tutors for subject:`, subject);
        
        const query = `
            SELECT DISTINCT t.* 
            FROM tutors t
            JOIN tutor_subjects ts ON t.id = ts.tutor_id
            JOIN subjects s ON ts.subject_id = s.id
            WHERE LOWER(s.name) = $1 
              AND t.is_active = true
              AND s.is_available = true
              AND (
                  (s.level = 'both' AND (t.level = $2 OR t.level = 'both')) OR
                  (s.level = $2 AND (t.level = $2 OR t.level = 'both'))
              )
            ORDER BY t.rating DESC
        `;
        
        const result = await pool.query(query, [subject.toLowerCase(), level]);
        
        if (result.rows.length === 0) {
            // Fallback query for backward compatibility
            const fallbackQuery = `
                SELECT DISTINCT t.* 
                FROM tutors t
                WHERE $1 = ANY(LOWER(t.subjects::text)::text[])
                  AND t.is_active = true
                  AND (t.level = $2 OR t.level = 'both')
                ORDER BY t.rating DESC
            `;
            const fallbackResult = await pool.query(fallbackQuery, [subject.toLowerCase(), level]);
            return res.status(200).json(fallbackResult.rows);
        }
        
        console.log(`Found ${result.rows.length} ${level} tutors for ${subject}`);
        res.status(200).json(result.rows);
        
    } catch (error) {
        console.error('Error fetching tutors:', error.message);
        res.status(500).json({ error: 'Error fetching tutors' });
    }
});

// Get active tutors (public)
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

// Get tutors filtered by level (Protected)
app.get('/api/admin/tutors-by-level', authenticateToken, async (req, res) => {
    try {
        const { level } = req.query;
        
        let query = 'SELECT * FROM tutors WHERE is_active = true';
        let params = [];
        
        if (level === 'primary') {
            query = 'SELECT * FROM tutors WHERE (level = $1 OR level = $2) AND is_active = true ORDER BY name';
            params = ['primary', 'both'];
        } else if (level === 'high') {
            query = 'SELECT * FROM tutors WHERE (level = $1 OR level = $2) AND is_active = true ORDER BY name';
            params = ['high', 'both'];
        } else {
            query = 'SELECT * FROM tutors WHERE is_active = true ORDER BY name';
        }
        
        console.log(`Fetching tutors for level: ${level}`);
        const result = await pool.query(query, params);
        
        console.log(`Found ${result.rows.length} tutors`);
        res.status(200).json(result.rows);
        
    } catch (error) {
        console.error('Error fetching tutors by level:', error.message);
        res.status(500).json({ error: 'Error fetching tutors' });
    }
});

// Add new tutor with level (Protected)
app.post('/api/admin/tutors', authenticateToken, async (req, res) => {
    try {
        const { name, subjects, rating, experience, image, bio, level } = req.body;
        console.log('Adding new tutor:', { name, subjects, rating, experience, level });
        
        if (!level || !['primary', 'high', 'both'].includes(level)) {
            return res.status(400).json({ error: 'Invalid tutor level. Must be primary, high, or both' });
        }
        
        let subjectsArray = subjects;
        if (Array.isArray(subjects)) {
            subjectsArray = `{${subjects.map(s => s.trim().toLowerCase()).join(',')}}`;
        } else if (typeof subjects === 'string') {
            subjectsArray = `{${subjects.split(',').map(s => s.trim().toLowerCase()).join(',')}}`;
        }
        
        const result = await pool.query(
            `INSERT INTO tutors (name, subjects, rating, experience, image, bio, is_active, level) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
             RETURNING *`,
            [name, subjectsArray, rating, experience, image, bio || '', true, level]
        );
        
        console.log('Tutor added successfully. ID:', result.rows[0].id);
        broadcastNotification('tutor_added');
        
        res.status(201).json({ 
            message: 'Tutor added successfully', 
            tutor: result.rows[0] 
        });
        
    } catch (error) {
        console.error('Error adding tutor:', error.message);
        res.status(500).json({ error: 'Error adding tutor', details: error.message });
    }
});

// Update tutor with level (Protected)
app.put('/api/admin/tutors/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, subjects, rating, experience, image, bio, is_active, level } = req.body;
        
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
                 is_active = COALESCE($7, is_active),
                 level = COALESCE($8, level)
             WHERE id = $9 
             RETURNING *`,
            [name, subjectsArray, rating, experience, image, bio, is_active, level, id]
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

// Delete tutor (Protected)
app.delete('/api/admin/tutors/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { deletePassword } = req.body;
        
        const isMatch = await bcrypt.compare(deletePassword, DELETE_PASSWORD_HASH);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid delete password' });
        }
        
        const result = await pool.query(
            'DELETE FROM tutors WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Tutor not found' });
        }
        
        broadcastNotification('tutor_deleted');
        res.status(200).json({ message: 'Tutor deleted successfully' });
        
    } catch (error) {
        console.error('Error deleting tutor:', error.message);
        res.status(500).json({ error: 'Error deleting tutor' });
    }
});

// Sync tutor subjects (Protected)
app.get('/api/admin/sync-tutor-subjects', authenticateToken, async (req, res) => {
    try {
        console.log('Starting tutor subjects synchronization...');
        
        const tutorsResult = await pool.query('SELECT id, subjects FROM tutors WHERE is_active = true');
        const tutors = tutorsResult.rows;
        
        let addedCount = 0;
        let errorCount = 0;
        
        for (const tutor of tutors) {
            if (tutor.subjects && Array.isArray(tutor.subjects) && tutor.subjects.length > 0) {
                for (const subjectName of tutor.subjects) {
                    try {
                        const subjectResult = await pool.query(
                            'SELECT id FROM subjects WHERE LOWER(name) = $1 AND is_available = true',
                            [subjectName.toLowerCase()]
                        );
                        
                        if (subjectResult.rows.length > 0) {
                            const subjectId = subjectResult.rows[0].id;
                            
                            await pool.query(
                                'INSERT INTO tutor_subjects (tutor_id, subject_id) VALUES ($1, $2) ON CONFLICT (tutor_id, subject_id) DO NOTHING',
                                [tutor.id, subjectId]
                            );
                            addedCount++;
                        }
                    } catch (error) {
                        errorCount++;
                        console.error(`Error syncing subject ${subjectName} for tutor ${tutor.id}:`, error.message);
                    }
                }
            }
        }
        
        console.log(`Sync completed: ${addedCount} assignments added, ${errorCount} errors`);
        res.status(200).json({ 
            message: 'Sync completed', 
            added: addedCount, 
            errors: errorCount 
        });
        
    } catch (error) {
        console.error('Error syncing tutor subjects:', error.message);
        res.status(500).json({ error: 'Error syncing tutor subjects' });
    }
});

// ==============================================
// SUBJECT ENDPOINTS
// ==============================================

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

// Get primary school subjects (public)
app.get('/api/primary/subjects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(DISTINCT ts.tutor_id) FILTER (WHERE t.level = 'primary' OR t.level = 'both') as tutor_count
            FROM subjects s
            LEFT JOIN tutor_subjects ts ON s.id = ts.subject_id
            LEFT JOIN tutors t ON ts.tutor_id = t.id AND t.is_active = TRUE
            WHERE s.is_available = TRUE 
              AND (s.level = 'primary' OR s.level = 'both')
            GROUP BY s.id
            ORDER BY s.name
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching primary school subjects:', error.message);
        res.status(500).json({ error: 'Error fetching primary school subjects' });
    }
});

// Get high school subjects (public)
app.get('/api/high/subjects', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(DISTINCT ts.tutor_id) FILTER (WHERE t.level = 'high' OR t.level = 'both') as tutor_count
            FROM subjects s
            LEFT JOIN tutor_subjects ts ON s.id = ts.subject_id
            LEFT JOIN tutors t ON ts.tutor_id = t.id AND t.is_active = TRUE
            WHERE s.is_available = TRUE 
              AND (s.level = 'high' OR s.level = 'both')
            GROUP BY s.id
            ORDER BY s.name
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching high school subjects:', error.message);
        res.status(500).json({ error: 'Error fetching high school subjects' });
    }
});

// Get all subjects for admin (Protected)
app.get('/api/admin/subjects', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT s.*, 
                   COUNT(DISTINCT ts.tutor_id) as total_tutor_count,
                   COUNT(DISTINCT ts.tutor_id) FILTER (WHERE t.level = 'primary' OR t.level = 'both') as primary_tutor_count,
                   COUNT(DISTINCT ts.tutor_id) FILTER (WHERE t.level = 'high' OR t.level = 'both') as high_tutor_count,
                   STRING_AGG(DISTINCT t.name, ', ') as tutor_names
            FROM subjects s
            LEFT JOIN tutor_subjects ts ON s.id = ts.subject_id
            LEFT JOIN tutors t ON ts.tutor_id = t.id AND t.is_active = TRUE
            GROUP BY s.id
            ORDER BY s.name
        `);

        // Transform the result to include a single tutor_count for display
        const transformedRows = result.rows.map(row => ({
            ...row,
            tutor_count: row.total_tutor_count // Keep this for backward compatibility
        }));
        
        res.status(200).json(transformedRows);
    } catch (error) {
        console.error('Error fetching subjects for admin:', error.message);
        res.status(500).json({ error: 'Error fetching subjects' });
    }
});

// Add new subject with level (Protected)
app.post('/api/admin/subjects', authenticateToken, async (req, res) => {
    try {
        const { name, description, icon, level } = req.body;
        
        if (!level || !['primary', 'high', 'both'].includes(level)) {
            return res.status(400).json({ error: 'Invalid subject level. Must be primary, high, or both' });
        }

        const result = await pool.query(
            'INSERT INTO subjects (name, description, icon, level) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, description, icon || 'fas fa-book', level]
        );
        
        broadcastNotification('subject_added');
        res.status(201).json({ 
            message: 'Subject added successfully', 
            subject: result.rows[0] 
        });
    } catch (error) {
        console.error('Error adding subject:', error.message);
        if (error.code === '23505') {
            res.status(400).json({ error: 'Subject already exists' });
        } else {
            res.status(500).json({ error: 'Error adding subject' });
        }
    }
});

// Update subject (Protected) - ADD THIS NEW ENDPOINT
app.put('/api/admin/subjects/:subjectId', authenticateToken, async (req, res) => {
    try {
        const { subjectId } = req.params;
        const { name, description, icon, level } = req.body;
        
        if (!level || !['primary', 'high', 'both'].includes(level)) {
            return res.status(400).json({ error: 'Invalid subject level. Must be primary, high, or both' });
        }

        const result = await pool.query(
            `UPDATE subjects 
             SET name = COALESCE($1, name),
                 description = COALESCE($2, description),
                 icon = COALESCE($3, icon),
                 level = COALESCE($4, level)
             WHERE id = $5 
             RETURNING *`,
            [name, description, icon, level, subjectId]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        broadcastNotification('subject_updated');
        res.status(200).json({ 
            message: 'Subject updated successfully', 
            subject: result.rows[0] 
        });
    } catch (error) {
        console.error('Error updating subject:', error.message);
        if (error.code === '23505') {
            res.status(400).json({ error: 'Subject name already exists' });
        } else {
            res.status(500).json({ error: 'Error updating subject' });
        }
    }
});

// Update subject status (Protected)
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

// ==============================================
// TUTOR-SUBJECT ASSIGNMENT ENDPOINTS
// ==============================================

// Get tutors for a specific subject (public)
app.get('/api/subjects/:subjectId/tutors', async (req, res) => {
    try {
        const { subjectId } = req.params;
        
        const subjectResult = await pool.query(
            'SELECT level FROM subjects WHERE id = $1',
            [subjectId]
        );
        
        if (subjectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        const subjectLevel = subjectResult.rows[0].level;

        const result = await pool.query(`
            SELECT t.*
            FROM tutors t
            JOIN tutor_subjects ts ON t.id = ts.tutor_id
            WHERE ts.subject_id = $1 
              AND t.is_active = TRUE
              AND (t.level = $2 OR t.level = 'both')
            ORDER BY t.rating DESC, t.name
        `, [subjectId, subjectLevel]);
        
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching tutors for subject:', error.message);
        res.status(500).json({ error: 'Error fetching tutors for subject' });
    }
});

// Get assignments for a subject (Protected)
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

// Assign tutor to subject with level validation (Protected)
app.post('/api/admin/tutors/:tutorId/subjects/:subjectId', authenticateToken, async (req, res) => {
    try {
        const { tutorId, subjectId } = req.params;
        
        const tutorCheck = await pool.query(
            'SELECT id, name, level, subjects FROM tutors WHERE id = $1',
            [tutorId]
        );
        
        if (tutorCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Tutor not found' });
        }
        
        const tutor = tutorCheck.rows[0];

        const subjectCheck = await pool.query(
            'SELECT id, name, level FROM subjects WHERE id = $1',
            [subjectId]
        );
        
        if (subjectCheck.rows.length === 0) {
            return res.status(404).json({ error: 'Subject not found' });
        }
        
        const subject = subjectCheck.rows[0];

        // Level validation logic:
        // - If subject level is 'both', any tutor level works
        // - If tutor level is 'both', any subject level works
        // - Otherwise, levels must match
        const isValidAssignment = 
            subject.level === 'both' || 
            tutor.level === 'both' || 
            tutor.level === subject.level;
        
        if (!isValidAssignment) {
            return res.status(400).json({ 
                error: `Level mismatch: ${tutor.name} is a ${tutor.level} level tutor but ${subject.name} is a ${subject.level} level subject` 
            });
        }
        
        await pool.query(
            'INSERT INTO tutor_subjects (tutor_id, subject_id) VALUES ($1, $2) ON CONFLICT (tutor_id, subject_id) DO NOTHING',
            [tutorId, subjectId]
        );

        // Update tutor's subjects array
        let updatedSubjects = [];
        if (tutor.subjects && Array.isArray(tutor.subjects)) {
            if (!tutor.subjects.includes(subject.name.toLowerCase())) {
                updatedSubjects = [...tutor.subjects, subject.name.toLowerCase()];
            } else {
                updatedSubjects = tutor.subjects;
            }
        } else {
            updatedSubjects = [subject.name.toLowerCase()];
        }

        await pool.query(
            'UPDATE tutors SET subjects = $1 WHERE id = $2',
            [updatedSubjects, tutorId]
        );
        
        console.log(`Tutor ${tutor.name} (${tutor.level}) assigned to subject ${subject.name} (${subject.level})`);
        
        res.status(201).json({ 
            message: 'Tutor assigned to subject successfully',
            tutor: { id: tutor.id, name: tutor.name, level: tutor.level },
            subject: { id: subject.id, name: subject.name, level: subject.level }
        });
        
    } catch (error) {
        console.error('Error assigning tutor to subject:', error.message);
        res.status(500).json({ error: 'Error assigning tutor to subject' });
    }
});

// Remove tutor from subject (Protected)
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

// Clear all assignments for a subject (Protected)
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

// ==============================================
// BOOKING ENDPOINTS
// ==============================================

// Create booking with level
app.post('/api/bookings', async (req, res) => {
    try {
        const { tutorId, subject, userNumber, schedule, level } = req.body;
        console.log('Received booking:', { tutorId, subject, userNumber, schedule, level });
        
        const result = await pool.query(
            'INSERT INTO bookings (tutor_id, subject, user_number, schedule, tutor_level) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [tutorId, subject, userNumber, schedule, level || 'high']
        );
        
        console.log('Booking created:', result.rows[0]);
        broadcastNotification('booking');
        res.status(200).json({ message: 'Booking created successfully', data: result.rows[0] });
    } catch (error) {
        console.error('Error creating booking:', error.message);
        res.status(500).json({ error: 'Error creating booking' });
    }
});

// Get all bookings (Protected)
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

// Get bookings by level (Protected)
app.get('/api/admin/bookings/:level', authenticateToken, async (req, res) => {
    try {
        const { level } = req.params;
        const result = await pool.query(
            `SELECT b.*, t.name AS tutor_name 
             FROM bookings b 
             LEFT JOIN tutors t ON b.tutor_id = t.id 
             WHERE b.tutor_level = $1 
             ORDER BY b.created_at DESC`,
            [level]
        );
        res.status(200).json(result.rows || []);
    } catch (error) {
        console.error(`Error fetching ${level} bookings:`, error.message);
        res.status(500).json({ error: `Error fetching ${level} bookings` });
    }
});

// Delete booking (Protected)
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

// ==============================================
// ANNOUNCEMENT ENDPOINTS
// ==============================================

// Get all announcements (public)
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
        const created_by = req.user.id;
        
        const result = await pool.query(
            'INSERT INTO announcements (title, content, created_by) VALUES ($1, $2, $3) RETURNING *',
            [title, content, created_by]
        );
        
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

// ==============================================
// ARCHIVE ENDPOINTS
// ==============================================

// Archive old bookings
app.post('/api/admin/archive-old-bookings', authenticateToken, async (req, res) => {
    try {
        const { days = 7 } = req.body;
        console.log(`Archiving bookings older than ${days} days...`);
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const oldBookings = await client.query(
                `SELECT * FROM bookings 
                 WHERE created_at < NOW() - INTERVAL '${days} days'`
            );
            
            if (oldBookings.rows.length === 0) {
                await client.query('COMMIT');
                return res.status(200).json({ 
                    message: 'No bookings to archive', 
                    archived: 0 
                });
            }
            
            for (const booking of oldBookings.rows) {
                await client.query(
                    `INSERT INTO bookings_archive 
                     (tutor_id, subject, user_number, schedule, created_at, original_id)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [booking.tutor_id, booking.subject, booking.user_number, 
                     booking.schedule, booking.created_at, booking.id]
                );
                
                await client.query('DELETE FROM bookings WHERE id = $1', [booking.id]);
            }
            
            await client.query('COMMIT');
            
            broadcastNotification('bookings_archived');
            
            console.log(`Archived ${oldBookings.rows.length} old bookings`);
            res.status(200).json({ 
                message: 'Old bookings archived successfully', 
                archived: oldBookings.rows.length 
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Error archiving bookings:', error.message);
        res.status(500).json({ error: 'Error archiving bookings' });
    }
});

// Get archived bookings (protected)
app.get('/api/admin/archived-bookings', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;
        
        const countResult = await pool.query('SELECT COUNT(*) FROM bookings_archive');
        const total = parseInt(countResult.rows[0].count);
        
        const result = await pool.query(
            `SELECT ba.*, t.name AS tutor_name 
             FROM bookings_archive ba
             LEFT JOIN tutors t ON ba.tutor_id = t.id
             ORDER BY ba.archived_at DESC, ba.created_at DESC
             LIMIT $1 OFFSET $2`,
            [limit, offset]
        );
        
        res.status(200).json({
            bookings: result.rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: total,
                totalPages: Math.ceil(total / limit)
            }
        });
        
    } catch (error) {
        console.error('Error fetching archived bookings:', error.message);
        res.status(500).json({ error: 'Error fetching archived bookings' });
    }
});

// Restore an archived booking (protected)
app.post('/api/admin/restore-archived-booking/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const archivedBooking = await client.query(
                'SELECT * FROM bookings_archive WHERE id = $1',
                [id]
            );
            
            if (archivedBooking.rows.length === 0) {
                return res.status(404).json({ error: 'Archived booking not found' });
            }
            
            const booking = archivedBooking.rows[0];
            
            const restored = await client.query(
                `INSERT INTO bookings (tutor_id, subject, user_number, schedule, created_at, tutor_level) 
                 VALUES ($1, $2, $3, $4, $5, $6) 
                 RETURNING *`,
                [booking.tutor_id, booking.subject, booking.user_number, 
                 booking.schedule, booking.created_at, booking.tutor_level || 'high']
            );
            
            await client.query('DELETE FROM bookings_archive WHERE id = $1', [id]);
            
            await client.query('COMMIT');
            
            broadcastNotification('booking_restored');
            
            res.status(200).json({ 
                message: 'Booking restored successfully',
                booking: restored.rows[0]
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('Error restoring booking:', error.message);
        res.status(500).json({ error: 'Error restoring booking' });
    }
});

// Delete archived booking permanently (protected)
app.delete('/api/admin/archived-bookings/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM bookings_archive WHERE id = $1 RETURNING *',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Archived booking not found' });
        }
        
        res.status(200).json({ 
            message: 'Archived booking deleted permanently',
            booking: result.rows[0]
        });
        
    } catch (error) {
        console.error('Error deleting archived booking:', error.message);
        res.status(500).json({ error: 'Error deleting archived booking' });
    }
});

// ==============================================
// START SERVER
// ==============================================
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));