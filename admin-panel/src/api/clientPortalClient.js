import axios from 'axios';

const TOKEN_KEY = 'zjai_client_token';

export const clientPortalApi = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  timeout: 15000,
});

clientPortalApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

clientPortalApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      window.dispatchEvent(new Event('zjai:client-unauthorized'));
    }
    return Promise.reject(error);
  }
);

export { TOKEN_KEY };
