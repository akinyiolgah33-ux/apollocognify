(function (root) {
    function readGameStats(storage, keyPrefix = '') {
        const prefix = String(keyPrefix || '');
        const getNumber = (name, fallback = 0) => {
            const raw = storage && typeof storage.getItem === 'function' ? storage.getItem(prefix + name) : null;
            const parsed = Number(raw);
            return Number.isFinite(parsed) ? parsed : fallback;
        };

        return {
            snakeBest: getNumber('snake_hs', 0),
            snakeSessions: getNumber('snake_sessions', 0),
            stickmanWins: getNumber('stickman_wins', 0),
            stickmanSessions: getNumber('stickman_sessions', 0)
        };
    }

    function bumpGameSession(storage, keyPrefix = '', gameType) {
        const prefix = String(keyPrefix || '');
        const key = gameType === 'stickman' ? prefix + 'stickman_sessions' : prefix + 'snake_sessions';
        const current = Number(storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null) || 0;
        const next = current + 1;
        if (storage && typeof storage.setItem === 'function') {
            storage.setItem(key, String(next));
        }
        return next;
    }

    function updateBestScore(storage, keyPrefix = '', gameType, value) {
        const prefix = String(keyPrefix || '');
        const key = gameType === 'stickman' ? prefix + 'stickman_wins' : prefix + 'snake_hs';
        const current = Number(storage && typeof storage.getItem === 'function' ? storage.getItem(key) : null) || 0;
        const next = Math.max(current, Number(value) || 0);
        if (storage && typeof storage.setItem === 'function') {
            storage.setItem(key, String(next));
        }
        return next;
    }

    const api = { readGameStats, bumpGameSession, updateBestScore };
    root.CognifyGameStats = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
