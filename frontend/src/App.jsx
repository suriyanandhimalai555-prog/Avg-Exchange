// frontend/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import ForgotPassword from './pages/ForgotPassword';
import Navbar     from './components/Navbar';
import Footer     from './components/Footer';
import ScrollToTop from './components/ScrollToTop';

// Footer only on public/marketing pages — not on app pages like Trade, Wallet, Dashboard, Admin
const FOOTER_PAGES = new Set(['/', '/markets', '/login', '/signup', '/forgot-password']);

function AppShell() {
  const user     = useSelector((s) => s.auth.user);
  const dispatch = useDispatch();
  const { pathname } = useLocation();

  useEffect(() => { dispatch(refreshUser()); }, [dispatch]);

  const showFooter = FOOTER_PAGES.has(pathname);

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
            path="/wallet/:tab"
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
            path="/admin/:tab"
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
          <Route
            path="/forgot-password"
            element={!user ? <ForgotPassword /> : <Navigate to="/" replace />}
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {showFooter && <Footer />}
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
