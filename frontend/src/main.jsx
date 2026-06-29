import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Provider } from 'react-redux';
import store from './store/store';
import { sessionExpired } from './features/authSlice';
import { setUnauthorizedHandler } from './api/client';

// Wire 401 handler: clears session on any unauthorized response
setUnauthorizedHandler(() => {
  const hasUser = !!store.getState().auth.user;
  if (hasUser) store.dispatch(sessionExpired());
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
