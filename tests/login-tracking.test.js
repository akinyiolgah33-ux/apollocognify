const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../database/schema');

function waitForSetup() {
  return new Promise((resolve) => setTimeout(resolve, 200));
}

test('login tracking table is created and can record login events', async () => {
  await waitForSetup();

  const tableCheck = await new Promise((resolve, reject) => {
    db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='login_events'",
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });

  assert.ok(tableCheck, 'login_events table should exist');

  const loginId = 'login-test-' + Date.now();
  await new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO login_events (id, user_id, email, login_time, user_agent, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [loginId, 'user-123', 'test@example.com', new Date().toISOString(), 'test-agent', '127.0.0.1'],
      function(err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });

  const saved = await new Promise((resolve, reject) => {
    db.get('SELECT id, user_id, email FROM login_events WHERE id = ?', [loginId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

  assert.equal(saved.id, loginId);
  assert.equal(saved.user_id, 'user-123');
  assert.equal(saved.email, 'test@example.com');
});
