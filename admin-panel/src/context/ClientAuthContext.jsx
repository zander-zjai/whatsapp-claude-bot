import { createContext, useContext, useEffect, useState } from 'react';
import { TOKEN_KEY } from '../api/clientPortalClient';
import { clientLogin, getClientMe } from '../api/clientPortalEndpoints';

const ClientAuthContext = createContext(null);

export function ClientAuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY));
  const [client, setClient] = useState(null);
  const [clientLoading, setClientLoading] = useState(true);

  useEffect(() => {
    const handleUnauthorized = () => {
      setToken(null);
      setClient(null);
    };
    window.addEventListener('zjai:client-unauthorized', handleUnauthorized);
    return () => window.removeEventListener('zjai:client-unauthorized', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (!token) {
      setClient(null);
      setClientLoading(false);
      return undefined;
    }

    let cancelled = false;
    setClientLoading(true);

    getClientMe()
      .then(({ client: c }) => {
        if (!cancelled) setClient(c);
      })
      .catch(() => {
        if (!cancelled) setClient(null);
      })
      .finally(() => {
        if (!cancelled) setClientLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function login(email, password) {
    const { token: newToken, client: c } = await clientLogin(email, password);
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setClient(c);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setClient(null);
  }

  return (
    <ClientAuthContext.Provider
      value={{
        token,
        client,
        clientLoading,
        isAuthenticated: Boolean(token),
        login,
        logout,
        setClient,
      }}
    >
      {children}
    </ClientAuthContext.Provider>
  );
}

export function useClientAuth() {
  const ctx = useContext(ClientAuthContext);
  if (!ctx) throw new Error('useClientAuth must be used within ClientAuthProvider');
  return ctx;
}
