/**
 * api/client.js — Configured axios instance with auth interceptors.
 *
 * All API calls should use this client instead of importing axios directly.
 * Interceptors handle Bearer token injection and 401 session expiry.
 */

import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const client = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Inject Bearer token from localStorage (iOS Safari blocks cross-site cookies)
client.interceptors.request.use((config) => {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    if (user?.token) {
      config.headers = config.headers || {};
      config.headers['Authorization'] = `Bearer ${user.token}`;
    }
  } catch (_) {}
  return config;
});

// 401 handler — configured by main.jsx after store is created
let onUnauthorized = null;

export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && onUnauthorized) {
      onUnauthorized();
    }
    return Promise.reject(error);
  }
);

export { API_URL };
export default client;
