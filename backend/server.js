const express = require('express');
const cors    = require('cors');
const axios   = require('axios');
const nlp     = require('compromise');
const { v4: uuidv4 } = require('uuid');
const db      = require('../database/schema');

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

const PORT           = process.env.PORT || 3000;
const NLP_SERVICE_URL = process.env.NLP_URL || 'http://localhost:8001';

// ─── Auth Middleware ────────────────────────────────────────────────────────
// Validates the Firebase ID token in Authorization header.
// For local dev without Firebase Admin SDK, uid is inferred from token payload.
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    // In production: admin.auth().verifyIdToken(token)
    // For dev, we decode the payload naively (no signature check) to extract uid
    const payloadBase64 = token.split('.')[1];
    if (payloadBase64) {
      const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
      req.user = { uid: payload.user_id || payload.sub || 'dev_user' };
    } else {
      req.user = { uid: 'dev_user' };
    }
    next();
  } catch (e) {
    req.user = { uid: 'dev_user' };
    next();
  }
}

function recordLoginEvent(userId, email, req) {
  return new Promise((resolve, reject) => {
    const id = uuidv4();
    const loginTime = new Date().toISOString();
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ipAddress = (req.headers['x-forwarded-for'] || req.ip || 'unknown').toString().split(',')[0].trim();

    db.run(
      `INSERT INTO login_events (id, user_id, email, login_time, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, email, loginTime, userAgent, ipAddress],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

// ─── Health ────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// ═══════════════════════════════════════════════════════════════════════════
// AI / NLP  (proxy to Python microservice)
// ═══════════════════════════════════════════════════════════════════════════

app.post('/api/ai/summarize', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || text.length < 10)
      return res.status(400).json({ error: 'Text too short.' });
    try {
      const r = await axios.post(`${NLP_SERVICE_URL}/api/summarize`, { text });
      res.json({ success: true, summary: r.data.summary });
    } catch (apiErr) {
      console.warn('NLP service offline, using Node.js fallback summarizer');
      // Simple Node.js compromise-based summary fallback: select first 3 sentences
      const sentences = nlp(text).sentences().out('array');
      const summary = sentences.slice(0, 3).join(' ');
      res.json({ success: true, summary });
    }
  } catch (err) {
    console.error('NLP summarize error:', err.message);
    res.status(500).json({ error: 'Failed to summarize text' });
  }
});

app.post('/api/ai/extract-entities', async (req, res) => {
  try {
    const { text } = req.body;
    try {
      const r = await axios.post(`${NLP_SERVICE_URL}/api/extract-entities`, { text });
      res.json({ success: true, entities: r.data.entities });
    } catch (apiErr) {
      console.warn('NLP service offline, using Node.js fallback entity extractor');
      // Simple compromise-based entity extractor fallback:
      const people = nlp(text).people().out('array');
      const places = nlp(text).places().out('array');
      const organizations = nlp(text).organizations().out('array');
      const entities = [
        ...people.map(p => ({ text: p, label: 'PERSON' })),
        ...places.map(p => ({ text: p, label: 'LOCATION' })),
        ...organizations.map(o => ({ text: o, label: 'ORGANIZATION' }))
      ];
      res.json({ success: true, entities });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to extract entities' });
  }
});

// ─── Flashcard Generator (Node NLP — no Python dependency) ──────────────────
app.post('/api/ai/extract-flashcards', authenticateToken, (req, res) => {
  try {
    const { text, deck_name } = req.body;
    const userId = req.user.uid;

    if (!text || text.length < 10)
      return res.status(400).json({ error: 'Text too short to generate flashcards.' });

    const sentences = nlp(text).sentences().out('array');
    let cards = [];

    sentences.forEach((sentence, i) => {
      const nouns = nlp(sentence).nouns().out('array');
      if (nouns.length > 0) {
        const target = nouns.sort((a, b) => b.length - a.length)[0];
        cards.push({
          id:          uuidv4(),
          note_id:     null,
          question:    sentence.replace(target, '______'),
          answer:      target,
          review_date: new Date().toISOString().split('T')[0]
        });
      }
    });

    cards = cards.slice(0, 10);

    // Persist to SQLite
    const stmt = db.prepare(
      `INSERT OR IGNORE INTO flashcards (id, note_id, user_id, question, answer, review_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    cards.forEach(c => stmt.run(c.id, c.note_id, req.user.uid, c.question, c.answer, c.review_date));
    stmt.finalize();

    res.json({ success: true, flashcards: cards });
  } catch (err) {
    console.error('Flashcard error:', err.message);
    res.status(500).json({ error: 'Failed to generate flashcards' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// NOTES  — full CRUD
// ═══════════════════════════════════════════════════════════════════════════

// GET all notes for user
app.get('/api/notes', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM notes WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.uid],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, notes: rows });
    }
  );
});

// POST create note
app.post('/api/notes', authenticateToken, (req, res) => {
  const { title, content, tags } = req.body;
  if (!content) return res.status(400).json({ error: 'Content required.' });
  const id = uuidv4();
  db.run(
    `INSERT INTO notes (id, user_id, title, content, tags) VALUES (?, ?, ?, ?, ?)`,
    [id, req.user.uid, title || 'Untitled', content, tags || ''],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, note: { id, user_id: req.user.uid, title, content, tags } });
    }
  );
});

// PUT update note
app.put('/api/notes/:id', authenticateToken, (req, res) => {
  const { title, content, tags } = req.body;
  db.run(
    `UPDATE notes SET title=?, content=?, tags=? WHERE id=? AND user_id=?`,
    [title, content, tags || '', req.params.id, req.user.uid],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, changes: this.changes });
    }
  );
});

// DELETE note
app.delete('/api/notes/:id', authenticateToken, (req, res) => {
  db.run(
    `DELETE FROM notes WHERE id=? AND user_id=?`,
    [req.params.id, req.user.uid],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// EVENTS  — full CRUD
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/events', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM events WHERE user_id = ? ORDER BY date ASC`,
    [req.user.uid],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, events: rows });
    }
  );
});

app.post('/api/events', authenticateToken, (req, res) => {
  const { title, description, date, type, linked_note_id } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'Title and date required.' });
  const id = uuidv4();
  db.run(
    `INSERT INTO events (id, user_id, title, description, date, type, linked_note_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.user.uid, title, description || '', date, type || 'study', linked_note_id || null],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, event: { id, title, description, date, type: type || 'study' } });
    }
  );
});

app.delete('/api/events/:id', authenticateToken, (req, res) => {
  db.run(
    `DELETE FROM events WHERE id=? AND user_id=?`,
    [req.params.id, req.user.uid],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// FLASHCARDS — review queue
// ═══════════════════════════════════════════════════════════════════════════

app.get('/api/flashcards/review', authenticateToken, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  db.all(
    `SELECT f.* FROM flashcards f
     LEFT JOIN notes n ON f.note_id = n.id
     WHERE (f.user_id = ? OR n.user_id = ?) AND f.review_date <= ?
     ORDER BY f.review_date ASC LIMIT 20`,
    [req.user.uid, req.user.uid, today],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, due_flashcards: rows });
    }
  );
});

app.put('/api/flashcards/:id', authenticateToken, (req, res) => {
  const { review_date } = req.body;
  if (!review_date) return res.status(400).json({ error: 'review_date is required.' });
  
  // Verify ownership
  db.get(
    `SELECT f.id FROM flashcards f
     LEFT JOIN notes n ON f.note_id = n.id
     WHERE f.id = ? AND (f.user_id = ? OR n.user_id = ?)`,
    [req.params.id, req.user.uid, req.user.uid],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(403).json({ error: 'Unauthorized to update this flashcard' });
      
      db.run(
        `UPDATE flashcards SET review_date = ? WHERE id = ?`,
        [review_date, req.params.id],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          res.json({ success: true, changes: this.changes });
        }
      );
    }
  );
});

app.post('/api/sync', authenticateToken, (req, res) => {
  const { last_sync_timestamp, changes } = req.body || {};
  const noteChanges = changes?.notes || {};
  const eventChanges = changes?.events || {};
  const flashcardChanges = changes?.flashcards || {};

  const notesUpdated = [
    ...(Array.isArray(noteChanges.created) ? noteChanges.created : []),
    ...(Array.isArray(noteChanges.updated) ? noteChanges.updated : [])
  ];
  const eventsUpdated = [
    ...(Array.isArray(eventChanges.created) ? eventChanges.created : []),
    ...(Array.isArray(eventChanges.updated) ? eventChanges.updated : [])
  ];
  const flashcardsUpdated = [
    ...(Array.isArray(flashcardChanges.created) ? flashcardChanges.created : []),
    ...(Array.isArray(flashcardChanges.updated) ? flashcardChanges.updated : [])
  ];

  const serverActiveIds = {
    notes: notesUpdated.map(item => item.client_id).filter(Boolean),
    events: eventsUpdated.map(item => item.client_id).filter(Boolean),
    flashcards: flashcardsUpdated.map(item => item.client_id).filter(Boolean)
  };

  res.json({
    success: true,
    sync_timestamp: new Date().toISOString(),
    server_changes: {
      notes: { updated: notesUpdated },
      events: { updated: eventsUpdated },
      flashcards: { updated: flashcardsUpdated }
    },
    server_active_ids: serverActiveIds
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PDF-ALIGNED Endpoints (Page 27) & NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════
app.post('/api/users/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  
  const id = uuidv4();
  db.run(
    `INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)`,
    [id, email.split('@')[0], email, 'mock_hash'],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      
      const notifId = uuidv4();
      db.run(
        `INSERT INTO notifications (id, user_id, message) VALUES (?, ?, ?)`,
        [notifId, id, 'Welcome to Cognify! Your account has been created.'],
        function(err2) {
          if (err2) return res.status(500).json({ error: err2.message });
          const mockToken = Buffer.from(JSON.stringify({ user_id: id })).toString('base64');
          res.json({ success: true, token: `mock.${mockToken}.signature`, user: { uid: id, email } });
        }
      );
    }
  );
});

app.post('/api/users/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const row = await new Promise((resolve, reject) => {
      db.get(`SELECT id FROM users WHERE email = ?`, [email], (err, userRow) => {
        if (err) return reject(err);
        resolve(userRow);
      });
    });

    if (!row) return res.status(401).json({ error: 'User not found' });

    await recordLoginEvent(row.id, email, req);

    const mockToken = Buffer.from(JSON.stringify({ user_id: row.id })).toString('base64');
    res.json({ success: true, token: `mock.${mockToken}.signature`, user: { uid: row.id, email } });
  } catch (error) {
    console.error('Login tracking failed:', error.message);
    res.status(500).json({ error: 'Login failed while recording activity' });
  }
});

app.get('/api/notifications', authenticateToken, (req, res) => {
  db.all(
    `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC`,
    [req.user.uid],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, notifications: rows });
    }
  );
});

app.put('/api/notifications/:id/read', authenticateToken, (req, res) => {
  db.run(
    `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?`,
    [req.params.id, req.user.uid],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true });
    }
  );
});

// ─── Start ────────────────────────────────────────────────────────────────
function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`🚀 Cognify Backend running → http://localhost:${port}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} is busy. Trying ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  });
}

startServer(PORT);
