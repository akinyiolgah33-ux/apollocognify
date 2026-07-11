import axios from 'axios';

const api = axios.create({
  headers: {
    'Content-Type': 'application/json'
  }
});

// Dynamically resolve base URL from local settings on every request
api.interceptors.request.use((config) => {
  const saved = localStorage.getItem('cognify_settings');
  let backendUrl = 'http://localhost:3000';
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.backendUrl) {
        backendUrl = parsed.backendUrl.replace(/\/$/, '');
      }
    } catch (e) {
      console.error('Failed to parse backendUrl from settings', e);
    }
  }
  config.baseURL = `${backendUrl}/api`;
  return config;
});

export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common['Authorization'];
  }
};

export const apiRegisterUser = async (username, password) => {
  const response = await api.post('/users/register', { username, password });
  return response.data;
};

export const apiLoginUser = async (username, password) => {
  const response = await api.post('/users/login', { username, password });
  return response.data;
};

export const apiCreateNote = async (title, content, tags) => {
  const response = await api.post('/notes', { title, content, tags });
  return response.data;
};

export const apiGetDueFlashcards = async () => {
  const response = await api.get('/flashcards/review');
  return response.data;
};

export const apiUpdateFlashcard = async (id, review_date) => {
  const response = await api.put(`/flashcards/${id}`, { review_date });
  return response.data;
};

export const apiExtractFlashcards = async (text, deck_name) => {
  const response = await api.post('/ai/extract-flashcards', { text, deck_name });
  return response.data;
};

export const apiSummarize = async (text) => {
  const response = await api.post('/ai/summarize', { text });
  return response.data;
};

export default api;
