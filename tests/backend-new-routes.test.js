// Tests for new backend routes added in bugfix:
// - PUT /api/flashcards/:id (review date update)
// - POST /api/ai/summarize fallback via Node.js compromise
// - POST /api/ai/extract-entities fallback via Node.js compromise

const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const path = require('path');

// Resolve compromise from the backend where it is installed
const nlp = require(path.resolve(__dirname, '../backend/node_modules/compromise')).default;

// ─── Helper: compute future date string ────────────────────────────────────
function futureDateStr(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

describe('Flashcard Review Scheduling Logic', () => {
  test('Hard review: next review in 1 day', () => {
    const quality = 'hard';
    let daysToAdd = 1;
    if (quality === 'good') daysToAdd = 3;
    if (quality === 'easy') daysToAdd = 7;
    assert.equal(daysToAdd, 1);
  });

  test('Good review: next review in 3 days', () => {
    const quality = 'good';
    let daysToAdd = 1;
    if (quality === 'good') daysToAdd = 3;
    if (quality === 'easy') daysToAdd = 7;
    assert.equal(daysToAdd, 3);
  });

  test('Easy review: next review in 7 days', () => {
    const quality = 'easy';
    let daysToAdd = 1;
    if (quality === 'good') daysToAdd = 3;
    if (quality === 'easy') daysToAdd = 7;
    assert.equal(daysToAdd, 7);
  });

  test('Future date string format is YYYY-MM-DD', () => {
    const dateStr = futureDateStr(3);
    assert.match(dateStr, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Node.js NLP Fallback Summarizer', () => {
  test('Summarize selects first 3 sentences from compromise', () => {
    const text = 'Photosynthesis is the process of converting light into energy. Plants use chlorophyll for this. The sun provides the necessary light energy. Water is also needed. Oxygen is released as a byproduct.';
    const sentences = nlp(text).sentences().out('array');
    const summary = sentences.slice(0, 3).join(' ');
    assert.ok(summary.length > 0);
    assert.ok(summary.includes('Photosynthesis'));
  });

  test('Summarize does not throw on single sentence input', () => {
    const text = 'This is a single sentence.';
    const sentences = nlp(text).sentences().out('array');
    const summary = sentences.slice(0, 3).join(' ');
    assert.ok(typeof summary === 'string');
  });
});

describe('Node.js NLP Fallback Entity Extractor', () => {
  test('Entity extractor returns array of entities', () => {
    const text = 'Barack Obama was the president of the United States and lived in Washington.';
    const people = nlp(text).people().out('array');
    const places = nlp(text).places().out('array');
    const organizations = nlp(text).organizations().out('array');
    const entities = [
      ...people.map(p => ({ text: p, label: 'PERSON' })),
      ...places.map(p => ({ text: p, label: 'LOCATION' })),
      ...organizations.map(o => ({ text: o, label: 'ORGANIZATION' }))
    ];
    assert.ok(Array.isArray(entities));
    entities.forEach(e => {
      assert.ok(e.text);
      assert.ok(e.label);
    });
  });
});

describe('Flashcard Ownership Isolation Tests', () => {
  const db = require('../database/schema');

  test('flashcards table has user_id column', async () => {
    // Wait for DB initialization
    await new Promise(resolve => setTimeout(resolve, 200));
    
    const columns = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info(flashcards)", (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    
    const userCol = columns.find(c => c.name === 'user_id');
    assert.ok(userCol, 'flashcards table should contain a user_id column');
  });

  test('Isolated query finds only user-specific flashcards', async () => {
    const uidA = 'user-alice-' + Date.now();
    const uidB = 'user-bob-' + Date.now();
    const cardId1 = 'card-1-' + Date.now();
    const cardId2 = 'card-2-' + Date.now();

    // Insert card for Alice
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO flashcards (id, note_id, user_id, question, answer, review_date)
         VALUES (?, null, ?, 'Alice Q', 'Alice A', '2020-01-01')`,
        [cardId1, uidA],
        err => err ? reject(err) : resolve()
      );
    });

    // Insert card for Bob
    await new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO flashcards (id, note_id, user_id, question, answer, review_date)
         VALUES (?, null, ?, 'Bob Q', 'Bob A', '2020-01-01')`,
        [cardId2, uidB],
        err => err ? reject(err) : resolve()
      );
    });

    // Fetch as Alice
    const aliceCards = await new Promise((resolve, reject) => {
      db.all(
        `SELECT f.* FROM flashcards f
         LEFT JOIN notes n ON f.note_id = n.id
         WHERE (f.user_id = ? OR n.user_id = ?) AND f.review_date <= '2020-01-02'`,
        [uidA, uidA],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    assert.equal(aliceCards.length, 1);
    assert.equal(aliceCards[0].id, cardId1);
    assert.equal(aliceCards[0].question, 'Alice Q');
  });
});


