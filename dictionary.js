function initOfflineDictionaryUI() {
    let dictionaryData = null;

    async function loadDictionary() {
        try {
            const res = await fetch('offline-dictionary.json');
            dictionaryData = await res.json();
        } catch (e) {
            console.error('Failed to load offline dictionary', e);
        }
    }

    function renderResults(query, container) {
        if (!query) {
            container.innerHTML = '';
            return;
        }

        if (!dictionaryData) {
            container.innerHTML = '<div style="color:var(--text-muted);">Dictionary is loading...</div>';
            return;
        }

        const helpers = window.CognifyDictionaryUtils;
        const matches = Object.entries(dictionaryData).filter(([word]) => word.toLowerCase().includes(query));

        if (matches.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);">No results found in offline dictionary.</div>';
            return;
        }

        container.innerHTML = matches.slice(0, 8).map(([word, data]) => {
            const html = helpers && typeof helpers.renderOfflineEntry === 'function'
                ? helpers.renderOfflineEntry(data, 'en-US', word)
                : `<div class="dict-result" style="margin-top:0; margin-bottom:1rem;"><div class="dict-word">${word}</div><div class="dict-def">${data.definition || 'No definition available.'}</div></div>`;
            return `<div class="dict-result" style="margin-top:0; margin-bottom:1rem;">${html}</div>`;
        }).join('');
    }

    const searchInput = document.getElementById('plan-dict-search') || document.getElementById('dashboard-dict-search');
    const resultsContainer = document.getElementById('plan-dict-results') || document.getElementById('dashboard-dict-result');

    if (searchInput && resultsContainer) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            renderResults(query, resultsContainer);
        });
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && searchInput.value.trim()) {
                renderResults(searchInput.value.trim().toLowerCase(), resultsContainer);
            }
        });
    }

    loadDictionary();
}

if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', initOfflineDictionaryUI);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { initOfflineDictionaryUI };
}

