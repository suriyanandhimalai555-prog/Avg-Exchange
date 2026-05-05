// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { refreshUser } from './features/authSlice';

import Home       from './pages/Home';
import Login      from './pages/Login';
import Signup     from './pages/Signup';
import Markets    from './pages/Markets';
import Trade      from './pages/Trade';
import Account    from './pages/Account';
import Wallet     from './pages/Wallet';
import Dashboard  from './pages/Dashboard';
import Admin      from './pages/Admin';
import Navbar     from './components/Navbar';
import Footer     from './components/Footer';
import ScrollToTop from './components/ScrollToTop';

function AppShell() {
  const user     = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();

  // On every page load, silently re-sync the user profile from the server.
  // This fixes stale localStorage (e.g. missing `id`) and auto-clears expired sessions.
  useEffect(() => { dispatch(refreshUser()); }, [dispatch]);

  return (
    <div className="min-h-screen bg-[#0b0c0e] selection:bg-[#00D68F]/30">
      <Navbar />
      <main>
        <Routes>
          <Route path="/"        element={<Home />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/trade"   element={<Trade />} />

          <Route
            path="/wallet"
            element={user ? <Wallet /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/account"
            element={user ? <Account /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/dashboard"
            element={user ? <Dashboard /> : <Navigate to="/login" replace />}
          />
          <Route
            path="/admin"
            element={user?.isAdmin ? <Admin /> : <Navigate to="/" replace />}
          />

          <Route
            path="/login"
            element={!user ? <Login /> : <Navigate to="/" replace />}
          />
          <Route
            path="/signup"
            element={!user ? <Signup /> : <Navigate to="/" replace />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <Footer />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
