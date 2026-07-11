import { createContext, useContext, useState, useCallback } from 'react';
import api, { setAuthToken } from '../services/api';
import { useAuth } from './AuthContext';
import { useEffect } from 'react';

const DataContext = createContext();
export const useData = () => useContext(DataContext);

export function DataProvider({ children }) {
  const { currentUser, token } = useAuth();
  const [notes,      setNotes]      = useState([]);
  const [events,     setEvents]     = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [syncing,    setSyncing]    = useState(false);
  const [stats,      setStats]      = useState({ streak: 1, cardsReviewed: 0, focusMinutes: 0 });

  const fetchAll = useCallback(async () => {
    setSyncing(true);
    try {
      const [noteRes, fcRes] = await Promise.all([
        api.get('/notes').catch(() => ({ data: { notes: [] } })),
        api.get('/flashcards/review').catch(() => ({ data: { due_flashcards: [] } }))
      ]);
      setNotes(noteRes.data.notes || []);
      setFlashcards(fcRes.data.due_flashcards || []);
    } catch (err) {
      console.error('Fetch error:', err.message);
    } finally {
      setSyncing(false);
    }
  }, []);

  // Whenever the user changes, update the axios token
  useEffect(() => {
    if (currentUser && token) {
      setAuthToken(token);
      fetchAll();
    } else {
      setAuthToken(null);
      setNotes([]);
      setEvents([]);
      setFlashcards([]);
    }
  }, [currentUser, token, fetchAll]);

  // Load stats when user changes
  useEffect(() => {
    if (currentUser) {
      const statsKey = `cognify_stats_${currentUser.uid}`;
      const savedStats = localStorage.getItem(statsKey);
      const todayStr = new Date().toISOString().split('T')[0];
      
      let parsed = { streak: 1, cardsReviewed: 0, focusMinutes: 0, lastActiveDate: todayStr };
      if (savedStats) {
        try {
          parsed = JSON.parse(savedStats);
          
          // Calculate streak
          if (parsed.lastActiveDate) {
            const lastActive = new Date(parsed.lastActiveDate);
            const today = new Date(todayStr);
            const diffTime = today - lastActive;
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
              parsed.streak = (parsed.streak || 0) + 1;
            } else if (diffDays > 1) {
              parsed.streak = 1;
            }
          } else {
            parsed.streak = 1;
          }
          parsed.lastActiveDate = todayStr;
        } catch (e) {
          console.error('Failed to parse saved stats', e);
        }
      } else {
        parsed.lastActiveDate = todayStr;
      }
      
      localStorage.setItem(statsKey, JSON.stringify(parsed));
      setStats(parsed);
    } else {
      setStats({ streak: 1, cardsReviewed: 0, focusMinutes: 0 });
    }
  }, [currentUser]);

  // Focus time interval tracking (1 minute)
  useEffect(() => {
    if (!currentUser) return;
    const interval = setInterval(() => {
      const statsKey = `cognify_stats_${currentUser.uid}`;
      setStats(prev => {
        const next = { ...prev, focusMinutes: (prev.focusMinutes || 0) + 1 };
        localStorage.setItem(statsKey, JSON.stringify({ ...next, lastActiveDate: new Date().toISOString().split('T')[0] }));
        return next;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const incrementCardsReviewed = useCallback(() => {
    if (!currentUser) return;
    const statsKey = `cognify_stats_${currentUser.uid}`;
    setStats(prev => {
      const next = { ...prev, cardsReviewed: (prev.cardsReviewed || 0) + 1 };
      localStorage.setItem(statsKey, JSON.stringify({ ...next, lastActiveDate: new Date().toISOString().split('T')[0] }));
      return next;
    });
  }, [currentUser]);

  // ---- Notes CRUD ----
  const addNote = async (title, content, tags = '') => {
    const res = await api.post('/notes', { title, content, tags });
    if (res.data.note) setNotes(prev => [res.data.note, ...prev]);
    return res.data;
  };

  const updateNote = async (id, title, content, tags = '') => {
    const res = await api.put(`/notes/${id}`, { title, content, tags });
    setNotes(prev => prev.map(n => n.id === id ? { ...n, title, content, tags } : n));
    return res.data;
  };

  const deleteNote = async (id) => {
    await api.delete(`/notes/${id}`);
    setNotes(prev => prev.filter(n => n.id !== id));
  };

  // ---- Events CRUD ----
  const addEvent = async (title, description, date, type = 'study') => {
    const res = await api.post('/events', { title, description, date, type });
    if (res.data.event) setEvents(prev => [...prev, res.data.event]);
    return res.data;
  };

  // ---- Flashcards ----
  const fetchDueFlashcards = async () => {
    const res = await api.get('/flashcards/review');
    setFlashcards(res.data.due_flashcards || []);
  };

  const value = {
    notes, events, flashcards,
    syncing, fetchAll,
    addNote, updateNote, deleteNote,
    addEvent,
    fetchDueFlashcards,
    stats, incrementCardsReviewed
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

