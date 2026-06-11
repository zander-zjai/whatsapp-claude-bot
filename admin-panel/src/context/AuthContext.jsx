import { createContext, useContext, useEffect, useState } from 'react';
import { TOKEN_KEY } from '../api/client';
import { login as loginRequest } from '../api/endpoints';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));

  useEffect(() => {
    const handleUnauthorized = () => setToken(null);
    window.addEventListener('zjai:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('zjai:unauthorized', handleUnauthorized);
  }, []);

  async function login(username, password) {
    const { token: newToken } = await loginRequest(username, password);
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }

  return (
    <AuthContext.Provider value={{ token, isAuthenticated: Boolean(token), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
