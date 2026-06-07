import axios from 'axios';

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api`,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' }
});

// Request interceptor - attach token
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('proctorai-auth');
  if (stored) {
    const { state } = JSON.parse(stored);
    if (state?.accessToken) config.headers.Authorization = `Bearer ${state.accessToken}`;
  }
  return config;
}, (error) => Promise.reject(error));

// Response interceptor - handle 401
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const stored = localStorage.getItem('proctorai-auth');
        if (stored) {
          const { state } = JSON.parse(stored);
          if (state?.refreshToken) {
            const { data } = await axios.post(`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/auth/refresh`, { refreshToken: state.refreshToken });
            original.headers.Authorization = `Bearer ${data.accessToken}`;
            // Update stored token
            const newState = { ...state, accessToken: data.accessToken };
            localStorage.setItem('proctorai-auth', JSON.stringify({ state: newState }));
            return api(original);
          }
        }
      } catch { window.location.href = '/login'; }
    }
    return Promise.reject(error);
  }
);

export default api;
