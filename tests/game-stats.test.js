const test = require('node:test');
const assert = require('node:assert/strict');
const { readGameStats, bumpGameSession, updateBestScore } = require('../game-stats');

function createStorage(initial = {}) {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key) { return store.has(key) ? store.get(key) : null; },
    setItem(key, value) { store.set(key, String(value)); },
    removeItem(key) { store.delete(key); },
    clear() { store.clear(); }
  };
}

test('readGameStats returns numeric progress values', () => {
  const storage = createStorage({
    'snake_hs': '42',
    'snake_sessions': '7',
    'stickman_wins': '3',
    'stickman_sessions': '5'
  });

  const stats = readGameStats(storage, '');

  assert.equal(stats.snakeBest, 42);
  assert.equal(stats.snakeSessions, 7);
  assert.equal(stats.stickmanWins, 3);
  assert.equal(stats.stickmanSessions, 5);
});

test('bumpGameSession and updateBestScore persist numeric values', () => {
  const storage = createStorage();

  bumpGameSession(storage, '', 'snake');
  bumpGameSession(storage, '', 'stickman');
  updateBestScore(storage, '', 'snake', 28);
  updateBestScore(storage, '', 'snake', 35);

  const stats = readGameStats(storage, '');

  assert.equal(stats.snakeSessions, 1);
  assert.equal(stats.stickmanSessions, 1);
  assert.equal(stats.snakeBest, 35);
  assert.equal(storage.getItem('stickman_wins'), null);
});
