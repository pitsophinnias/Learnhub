-- LearnHub Database Recreation Script
-- Created: February 5th
-- Purpose: Recreate database structure with data for tutors, subjects, admin_users, and tutor_subjects
-- Bookings, contacts, and announcements will be created empty

-- Drop existing tables if they exist (in reverse order of dependencies)
DROP TABLE IF EXISTS announcements CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS tutor_subjects CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TABLE IF EXISTS subjects CASCADE;
DROP TABLE IF EXISTS tutors CASCADE;

-- Create tutors table
CREATE TABLE tutors (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    subjects TEXT[],
    rating NUMERIC(3,1),
    experience TEXT,
    image VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    bio TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create subjects table
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50) DEFAULT 'fas fa-book',
    is_available BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admin_users table
CREATE TABLE admin_users (
    id SERIAL PRIMARY KEY,
    tutor_id INTEGER,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE
);

-- Create tutor_subjects junction table
CREATE TABLE tutor_subjects (
    tutor_id INTEGER NOT NULL,
    subject_id INTEGER NOT NULL,
    PRIMARY KEY (tutor_id, subject_id),
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE,
    FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
);

-- Create indexes for tutor_subjects
CREATE INDEX idx_tutor_subjects_tutor ON tutor_subjects(tutor_id);
CREATE INDEX idx_tutor_subjects_subject ON tutor_subjects(subject_id);

-- Create bookings table (will be empty)
CREATE TABLE bookings (
    id SERIAL PRIMARY KEY,
    tutor_id INTEGER,
    subject VARCHAR(50) NOT NULL,
    user_number VARCHAR(20) NOT NULL,
    schedule TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (tutor_id) REFERENCES tutors(id) ON DELETE CASCADE
);

-- Create contacts table (will be empty)
CREATE TABLE contacts (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    number VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create announcements table (will be empty)
CREATE TABLE announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    content TEXT NOT NULL,
    created_by INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL
);

-- Insert tutors data
INSERT INTO tutors (id, name, subjects, rating, experience, image, is_active, bio, created_at) VALUES
(6, 'Qebe Qebe', '{ict,design}', 4.1, 'B.A in Economics', '/images/Qebe-Qebe.jpg', true, NULL, '2026-01-21 11:07:52.801838'),
(3, 'Liabiloe Hlasa', '{mathematics,physics,design,english,geography}', 4.5, 'Bsc in Mathematics and Physics', '/images/Liabiloe-Hlasa.jpg', true, NULL, '2026-01-21 11:07:52.801838'),
(1, 'Thabang Ralitjobo', '{mathematics,physics,chemistry,design,ict}', 4.2, 'Bsc in Mathematics and Physics', '/images/Thabang-Ralitjobo.jpg', true, NULL, '2026-01-21 11:07:52.801838'),
(2, 'Mpolai Machesa', '{mathematics,chemistry,biology,accounting}', 4.4, 'Bsc in Biology and Chemistry', '/images/Mpolai-Machesa.jpg', true, NULL, '2026-01-21 11:07:52.801838'),
(10, 'Nthabiseng Ramaqele', '{sesotho}', 4.1, 'BSc. in Nutrion', '/images/Nthabiseng-Ramaqele.jpg', true, 'Also has a Diploma in Home Economics Education', '2026-02-02 20:28:10.669937'),
(9, 'Alotsi Thabelang', '{"english literature",accounting}', 4.2, 'Bachelor of Arts in Social Work', '/images/Alotsi Thabelang.jpg', true, NULL, '2026-02-02 17:47:45.88682'),
(5, 'Lebusa Molibeli', '{english,design,geography,"english literature",ict}', 4.2, 'Bsc in Urban and Regional Planning', '/images/Lebusa-Molibeli.jpg', true, NULL, '2026-01-21 11:07:52.801838'),
(8, 'Tlokotsi Mahlatsi', '{biology,chemistry,mathematics}', 4.2, 'Bsc. in Biology and Chemistry', '/images/Tlokotsi-Mahlatsi.jpg', true, NULL, '2026-01-26 18:48:22.368064'),
(7, 'Lintle Mothiane', '{mathematics,biology,chemistry,physics}', 4.2, 'Bsc. in Mathematics and Statistics', '/images/Lintle-Mothiane.jpg', true, NULL, '2026-01-21 15:16:35.748223'),
(4, 'Pitso Pitso', '{english,ict,design,"english literature"}', 4.3, 'B.Eng in Computer Systems and Networks', '/images/Pitso-Pitso.jpg', true, NULL, '2026-01-21 11:07:52.801838');

-- Reset the sequence for tutors table
SELECT setval('tutors_id_seq', (SELECT MAX(id) FROM tutors));

-- Insert subjects data
INSERT INTO subjects (id, name, description, icon, is_available, created_at) VALUES
(1, 'Mathematics', 'Let everything add up', 'fas fa-calculator', true, '2026-01-21 11:58:17.905714'),
(2, 'ICT', 'Information and Communication Technology skills', 'fas fa-laptop-code', true, '2026-01-21 11:58:17.905714'),
(3, 'Design', 'Creative problem-solving and technical skills', 'fas fa-drafting-compass', true, '2026-01-21 11:58:17.905714'),
(4, 'Physics', 'Understand the laws that govern our universe', 'fas fa-atom', true, '2026-01-21 11:58:17.905714'),
(5, 'Chemistry', 'Master elements, compounds, and reactions', 'fas fa-flask', true, '2026-01-21 11:58:17.905714'),
(6, 'Biology', 'Explore the science of life and living organisms', 'fas fa-dna', true, '2026-01-21 11:58:17.905714'),
(7, 'English', 'Analyze texts and improve your writing skills', 'fas fa-book', true, '2026-01-21 11:58:17.905714'),
(9, 'Accounting', 'Crunch numbers and unlock financial smarts', 'fa-solid fa-chart-line', true, '2026-01-21 13:11:08.302875'),
(8, 'Geography', 'From Lesotho''s mountains to the whole world, discover how it all works', 'fas fa-map', true, '2026-01-21 13:06:34.174516'),
(11, 'English Literature', 'Words that move mountains. Master stories, essays, and poetry with confidence.', 'fa-solid fa-book-open', true, '2026-02-02 17:44:47.323399'),
(12, 'Sesotho', 'Puo ea rona, matla a rona, ithute Sesotho ka botebo: lipuo, lithoko le tsohle tsa Basotho!', 'fa-solid fa-language', true, '2026-02-02 20:06:36.584341');

-- Reset the sequence for subjects table
SELECT setval('subjects_id_seq', (SELECT MAX(id) FROM subjects));

-- Insert admin_users data
INSERT INTO admin_users (id, tutor_id, username, password_hash, created_at) VALUES
(2, 1, 'Thabang', '$2b$10$VCNqIYkjxJxKT97z4kBYpuAfzQ272id5yoEdcOofsxn5W/LXs5Fk2', '2026-01-21 10:48:26.226237'),
(3, 2, 'Mpolai', '$2b$10$3u5TI3ivZJgaLpxBkGKdmO6lUfdbew2bD.lbvSeRr3I/3zWQTkd3.', '2026-01-21 15:49:56.239414'),
(4, 4, 'Pitso', '$2b$10$tiY3MvkBA1FH8t8T6SEg7.tgSKue5k/CEhY.T2hebiefzhi5B4Rz.', '2026-01-21 17:23:55.73905'),
(5, 7, 'Lintle -SciExcel Academy', '$2b$10$19r1K1GRAOatYF9pl5m94uJEGM1CBcipmkMAvnwV7z72LqH6BX/di', '2026-01-21 19:23:22.910586'),
(6, 8, 'Tlokotsi Mahlatsi', '$2b$10$6Je649JfrRXx0fnm.C0yhesKKza4NORRWQ5DcpDT4uTnedQ9d0hP.', '2026-01-26 18:57:27.766479'),
(7, 3, 'Liabiloe Hlasa', '$2b$10$88.MKqodC09a/X6u2.cCrefNbuof0XxGZp1xPDbvyJLMZi2DHhPiW', '2026-01-29 19:34:15.776561'),
(8, 9, 'Thabelang', '$2b$10$JC83VQx1D.NzYHgXk51VF.fl4OAEjaQ5RjzlvI.dhqckdLaS9y/u2', '2026-02-02 18:55:33.724242'),
(9, 10, 'Ramaqele Nthabiseng', '$2b$10$ht8FHGuhH1VmFcjVVADzT.4FPG1Ckmrj0S1nHekyHTE9RhR0ySmSW', '2026-02-02 20:39:35.775014');

-- Reset the sequence for admin_users table
SELECT setval('admin_users_id_seq', (SELECT MAX(id) FROM admin_users));

-- Insert tutor_subjects data
INSERT INTO tutor_subjects (tutor_id, subject_id) VALUES
(3, 4),
(1, 4),
(7, 4),
(7, 6),
(2, 6),
(8, 6),
(2, 5),
(8, 5),
(7, 5),
(5, 3),
(3, 3),
(8, 1),
(7, 1),
(2, 1),
(3, 1),
(3, 8),
(5, 8),
(9, 9),
(9, 11),
(5, 2),
(5, 7),
(4, 7);

-- Reset sequences for other tables (bookings, contacts, announcements will be empty)
SELECT setval('bookings_id_seq', 1, false);
SELECT setval('contacts_id_seq', 1, false);
SELECT setval('announcements_id_seq', 1, false);

-- Output confirmation
SELECT 'Database recreation completed successfully!' as message;
SELECT COUNT(*) as tutors_count FROM tutors;
SELECT COUNT(*) as subjects_count FROM subjects;
SELECT COUNT(*) as admin_users_count FROM admin_users;
SELECT COUNT(*) as tutor_subjects_count FROM tutor_subjects;
SELECT 'bookings, contacts, and announcements tables are empty' as empty_tables_info;