import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Provider } from 'react-redux'
import store from './store/store'
import { sessionExpired } from './features/authSlice'
import axios from 'axios';

// Attach Bearer token to every axios request — fixes iOS Safari which blocks
// cross-site cookies (SameSite=None) due to Intelligent Tracking Prevention.
axios.interceptors.request.use((config) => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user?.token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${user.token}`;
    }
  } catch (_) {}
  return config;
});

// Clear session immediately on any 401 response — catches mid-session token
// expiry without waiting for the 60s interval check.
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const hasUser = !!store.getState().auth.user;
      if (hasUser) store.dispatch(sessionExpired());
    }
    return Promise.reject(error);
  }
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);