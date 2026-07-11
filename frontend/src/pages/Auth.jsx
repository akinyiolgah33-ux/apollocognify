import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function Auth() {
  const { login, register } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await register(email, password);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="auth-overlay active">
      <div className="auth-modal">
        <h2>{isLogin ? 'Login to Cognify' : 'Join Cognify'}</h2>
        {error && <div className="error-alert">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Email</label>
            <input 
              type="email" 
              required 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input 
              type="password" 
              required 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="primary-btn">
            {isLogin ? 'Login' : 'Register'}
          </button>
        </form>
        <p className="auth-switch">
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setIsLogin(!isLogin); }}>
            {isLogin ? 'Sign up' : 'Log in'}
          </a>
        </p>
      </div>
    </div>
  );
}
