(function (root) {
    function normalizeWord(value) {
        return String(value || '').trim().toLowerCase();
    }

    function findOfflineEntry(dictionaryData, word) {
        const normalized = normalizeWord(word);
        if (!normalized || !dictionaryData || typeof dictionaryData !== 'object') return null;

        if (dictionaryData[normalized]) {
            return { word: normalized, entry: dictionaryData[normalized] };
        }

        const directMatch = Object.entries(dictionaryData).find(([key]) => normalizeWord(key) === normalized);
        if (directMatch) {
            return { word: directMatch[0], entry: directMatch[1] };
        }

        const fallbackMatch = Object.entries(dictionaryData).find(([, entry]) => {
            if (!entry || typeof entry !== 'object') return false;
            const aliases = [entry.word, entry.us_spelling, entry.uk_spelling, entry.term];
            return aliases.some(alias => normalizeWord(alias) === normalized);
        });

        if (fallbackMatch) {
            return { word: fallbackMatch[0], entry: fallbackMatch[1] };
        }

        return null;
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function renderOfflineEntry(entry, dialect = 'en-US', fallbackWord = '') {
        if (!entry) {
            return '<div style="color:var(--text-muted)">No offline definition available.</div>';
        }

        const word = fallbackWord || entry.word || '';
        const isSimpleEntry = entry && typeof entry === 'object' && entry.definition && !Array.isArray(entry.definitions);

        if (isSimpleEntry) {
            const pos = entry.pos ? `<div style="margin-top:0.35rem; font-size:0.8rem; color:var(--neon-accent)">${escapeHtml(entry.pos)}</div>` : '';
            const synonyms = Array.isArray(entry.synonyms) && entry.synonyms.length
                ? `<div style="margin-top:0.45rem; font-size:0.8rem; color:var(--text-muted)">Synonyms: ${entry.synonyms.map(s => `<span style="margin-right:0.35rem">${escapeHtml(s)}</span>`).join('')}</div>`
                : '';
            return `<div><strong style="color:var(--primary-color)">${escapeHtml(word || 'Word')}</strong>${pos}<div style="margin-top:0.35rem; line-height:1.45">${escapeHtml(entry.definition)}</div>${synonyms}</div>`;
        }

        const defs = Array.isArray(entry.definitions) ? entry.definitions.slice(0, 3).map(def => {
            const partOfSpeech = def.partOfSpeech ? `<div style="font-size:0.75rem; color:var(--neon-accent); text-transform:uppercase; letter-spacing:0.05em; margin-top:0.35rem">${escapeHtml(def.partOfSpeech)}</div>` : '';
            const example = def.example ? `<div style="margin-top:0.25rem; color:var(--text-muted); font-size:0.85rem">“${escapeHtml(def.example)}”</div>` : '';
            return `<div style="margin-top:0.35rem">${partOfSpeech}<div>${escapeHtml(def.definition)}</div>${example}</div>`;
        }).join('') : '';

        const phonetic = entry.pronunciation || (dialect && dialect.startsWith('en-GB') ? entry.uk_pron : entry.us_pron) || '';
        return `<div><strong style="color:var(--primary-color)">${escapeHtml(word || 'Word')}</strong>${phonetic ? `<span style="margin-left:0.4rem; color:var(--text-muted); font-size:0.85rem">${escapeHtml(phonetic)}</span>` : ''}<div style="margin-top:0.35rem">${defs || '<div style="color:var(--text-muted)">No definition available.</div>'}</div></div>`;
    }

    const api = { normalizeWord, findOfflineEntry, renderOfflineEntry };
    root.CognifyDictionaryUtils = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
