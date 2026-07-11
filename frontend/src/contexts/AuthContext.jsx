import { createContext, useContext, useEffect, useState } from 'react';
// import { initializeApp } from 'firebase/app';
// import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
// import { getStorage } from 'firebase/storage';

// export const storage = null; // Mock storage

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for token on mount
    const savedToken = localStorage.getItem('cognify_token');
    const userStr = localStorage.getItem('cognify_user');
    if (savedToken && userStr) {
      setCurrentUser(JSON.parse(userStr));
      setToken(savedToken);
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const res = await fetch('http://localhost:3000/api/users/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to login');
    
    localStorage.setItem('cognify_token', data.token);
    localStorage.setItem('cognify_user', JSON.stringify(data.user));
    setCurrentUser(data.user);
    setToken(data.token);
  }

  async function register(email, password) {
    const res = await fetch('http://localhost:3000/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed to register');
    
    localStorage.setItem('cognify_token', data.token);
    localStorage.setItem('cognify_user', JSON.stringify(data.user));
    setCurrentUser(data.user);
    setToken(data.token);
  }

  function logout() {
    localStorage.removeItem('cognify_token');
    localStorage.removeItem('cognify_user');
    setCurrentUser(null);
    setToken(null);
  }

  const value = {
    currentUser,
    token,
    login,
    register,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}
