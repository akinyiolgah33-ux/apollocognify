import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const LIVE_DARK_THEME = {
  id: 'dark-live',
  label: 'Live Dark',
  primary: '#6366f1',
  type: 'live'
};

export default function Settings() {
  const { currentUser, logout } = useAuth();
  const [activeTheme, setActiveTheme]   = useState(LIVE_DARK_THEME.id);
  const [apiKey, setApiKey]             = useState('');
  const [nlpUrl, setNlpUrl]             = useState('http://localhost:8001');
  const [backendUrl, setBackendUrl]     = useState('http://localhost:3000');
  const [saved, setSaved]               = useState(false);

  const applyTheme = (theme) => {
    setActiveTheme(theme.id);
    document.documentElement.setAttribute('data-theme', theme.id);
    document.documentElement.style.setProperty('--primary', theme.primary);
    
    // Parse hex to RGB to compute transparency colors matching standard CSS vars
    const r = parseInt(theme.primary.slice(1, 3), 16);
    const g = parseInt(theme.primary.slice(3, 5), 16);
    const b = parseInt(theme.primary.slice(5, 7), 16);
    
    if (theme.type === 'live') {
      document.documentElement.style.setProperty('--bg', 'transparent');
      document.documentElement.style.setProperty('--primary-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
      document.documentElement.style.setProperty('--border', `rgba(${r}, ${g}, ${b}, 0.20)`);
      document.documentElement.style.setProperty('--surface', `rgba(${r}, ${g}, ${b}, 0.04)`);
      document.documentElement.style.setProperty('--surface-2', `rgba(${r}, ${g}, ${b}, 0.08)`);
    } else {
      document.documentElement.style.setProperty('--bg', '#050d12');
      document.documentElement.style.setProperty('--primary-dim', `rgba(${r}, ${g}, ${b}, 0.15)`);
      document.documentElement.style.setProperty('--border', 'rgba(255, 255, 255, 0.10)');
      document.documentElement.style.setProperty('--surface', 'rgba(255, 255, 255, 0.04)');
      document.documentElement.style.setProperty('--surface-2', 'rgba(255, 255, 255, 0.08)');
    }
  };

  useEffect(() => {
    const savedSettings = localStorage.getItem('cognify_settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (parsed.apiKey) setApiKey(parsed.apiKey);
        if (parsed.nlpUrl) setNlpUrl(parsed.nlpUrl);
        if (parsed.backendUrl) setBackendUrl(parsed.backendUrl);
        if (parsed.theme === LIVE_DARK_THEME.id) {
          setActiveTheme(parsed.theme);
          applyTheme(LIVE_DARK_THEME);
        } else {
          applyTheme(LIVE_DARK_THEME);
        }
      } catch (e) {
        console.error("Error loading settings", e);
      }
    } else {
      applyTheme(LIVE_DARK_THEME);
    }
  }, []);

  const handleSave = () => {
    localStorage.setItem('cognify_settings', JSON.stringify({ apiKey, nlpUrl, backendUrl, theme: activeTheme }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="tab-pane active" id="settings">
      <header className="top-header">
        <h1>Settings</h1>
        {saved && <span className="sync-status active">Saved!</span>}
      </header>

      <div className="settings-layout" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', padding: '0' }}>

        {/* Account */}
        <div className="dash-card">
          <h3><i className="ph ph-user"></i> Account</h3>
          <div className="setting-row">
            <span>Email</span>
            <span style={{ color: 'var(--text-muted)' }}>{currentUser?.email || 'Not logged in'}</span>
          </div>
          <div className="setting-row">
            <span>Status</span>
            <span className="sync-status active">Authenticated</span>
          </div>
          <button className="secondary-btn" style={{ marginTop: '1rem', width: '100%' }} onClick={logout}>
            <i className="ph ph-sign-out"></i> Sign Out
          </button>
        </div>

        {/* Theme */}
        <div className="dash-card">
          <h3><i className="ph ph-palette"></i> Appearance</h3>
          <div className="theme-grid" style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
            <button
              onClick={() => applyTheme(LIVE_DARK_THEME)}
              className={`theme-btn ${activeTheme === LIVE_DARK_THEME.id ? 'active' : ''}`}
              style={{
                padding: '0.75rem',
                borderRadius: '8px',
                border: `2px solid ${activeTheme === LIVE_DARK_THEME.id ? LIVE_DARK_THEME.primary : 'var(--border)'}`,
                background: 'var(--surface-2)',
                color: LIVE_DARK_THEME.primary,
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.25s ease',
                textAlign: 'left'
              }}
            >
              <div>{LIVE_DARK_THEME.label}</div>
              <div style={{ fontSize: '0.8rem', opacity: 0.85, marginTop: '0.25rem' }}>Single dark live experience</div>
            </button>
          </div>
        </div>

        {/* API & Services */}
        <div className="dash-card" style={{ gridColumn: '1 / -1' }}>
          <h3><i className="ph ph-plug"></i> API & Services</h3>
          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Gemini API Key</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza..." />
          </div>
          <div className="form-group">
            <label>Python NLP Service URL</label>
            <input type="text" value={nlpUrl} onChange={e => setNlpUrl(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Node.js Backend URL</label>
            <input type="text" value={backendUrl} onChange={e => setBackendUrl(e.target.value)} />
          </div>
          <button className="primary-btn" style={{ marginTop: '0.5rem' }} onClick={handleSave}>
            <i className="ph ph-floppy-disk"></i> Save Settings
          </button>
        </div>

      </div>
    </div>
  );
}
