import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Provider } from 'react-redux'
import store from './store/store'
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

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);