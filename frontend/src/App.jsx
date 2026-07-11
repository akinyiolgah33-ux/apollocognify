import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Notes from './pages/Notes';
import Flashcards from './pages/Flashcards';
import Plan from './pages/Plan';
import Settings from './pages/Settings';
import Auth from './pages/Auth';
import ThreeBackground from './components/ThreeBackground';
import ApolloChat from './components/ApolloChat';
import { useAuth } from './contexts/AuthContext';
import './App.css';

const LIVE_DARK_THEME = { id: 'dark-live', primary: '#6366f1', type: 'live' };

function App() {
  const { currentUser } = useAuth();

  // Load and apply the single Live Dark theme on startup
  useEffect(() => {
    const applyTheme = (theme) => {
      document.documentElement.setAttribute('data-theme', theme.id);
      document.documentElement.style.setProperty('--primary', theme.primary);
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

    const saved = localStorage.getItem('cognify_settings');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Only one theme is currently supported; resolve from id.
        const theme = parsed.theme === LIVE_DARK_THEME.id ? LIVE_DARK_THEME : LIVE_DARK_THEME;
        applyTheme(theme);
      } catch (e) {
        console.error('Failed to initialize saved theme on startup', e);
        applyTheme(LIVE_DARK_THEME);
      }
    } else {
      applyTheme(LIVE_DARK_THEME);
    }
  }, []);

  return (
    <Router>
      <ThreeBackground />

      {!currentUser ? (
        <Auth />
      ) : (
        <div className="app-container">
          <Sidebar />
          
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/notes" element={<Notes />} />
              <Route path="/flashcards" element={<Flashcards />} />
              <Route path="/plan" element={<Plan />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
          
          <ApolloChat />
        </div>
      )}
    </Router>
  );
}

export default App;
