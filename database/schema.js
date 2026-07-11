const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Resolve db path to database/cognify.db
const dbPath = path.resolve(__dirname, 'cognify.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to SQLite database', err);
    } else {
        console.log('Connected to SQLite database at', dbPath);
        initDb();
    }
});

function initDb() {
    db.serialize(() => {
        // Users: id, username, email, password_hash
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT,
            email TEXT,
            password_hash TEXT
        )`);

        // Login events: id, user_id, email, login_time, user_agent, ip_address
        db.run(`CREATE TABLE IF NOT EXISTS login_events (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            email TEXT,
            login_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_agent TEXT,
            ip_address TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Notes: id, user_id, title, content, tags, created_at
        db.run(`CREATE TABLE IF NOT EXISTS notes (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT,
            content TEXT,
            tags TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Events: id, user_id, title, description, date, linked_note_id, type
        db.run(`CREATE TABLE IF NOT EXISTS events (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            title TEXT,
            description TEXT,
            date TEXT,
            type TEXT DEFAULT 'study',
            linked_note_id TEXT,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (linked_note_id) REFERENCES notes (id)
        )`);

        // FlashCards: id, note_id, user_id, question, answer, review_date
        db.run(`CREATE TABLE IF NOT EXISTS flashcards (
            id TEXT PRIMARY KEY,
            note_id TEXT,
            user_id TEXT,
            question TEXT,
            answer TEXT,
            review_date TEXT,
            FOREIGN KEY (note_id) REFERENCES notes (id),
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Images: id, note_id, file_url
        db.run(`CREATE TABLE IF NOT EXISTS images (
            id TEXT PRIMARY KEY,
            note_id TEXT,
            file_url TEXT,
            FOREIGN KEY (note_id) REFERENCES notes (id)
        )`);

        // Notifications: id, user_id, message, is_read, created_at
        db.run(`CREATE TABLE IF NOT EXISTS notifications (
            id TEXT PRIMARY KEY,
            user_id TEXT,
            message TEXT,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )`);

        // Run auto-migration to add type column to existing events tables
        db.run(`ALTER TABLE events ADD COLUMN type TEXT DEFAULT 'study'`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error migrating events table:', err.message);
            }
        });

        // Run auto-migration to add user_id column to existing flashcards tables
        db.run(`ALTER TABLE flashcards ADD COLUMN user_id TEXT`, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error('Error migrating flashcards table:', err.message);
            }
        });
        
        console.log("Database schema successfully strictly aligned to Cognify PDF.");
    });
}

module.exports = db;
