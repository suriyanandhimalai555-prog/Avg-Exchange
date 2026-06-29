import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { refreshUser, sessionExpired } from './features/authSlice';
import { SESSION_CHECK_INTERVAL_MS } from './constants/theme';
import { ProtectedRoute, AdminRoute, GuestRoute } from './components/common/ProtectedRoute';

import Home            from './pages/Home';
import Login           from './pages/Login';
import Signup          from './pages/Signup';
import Markets         from './pages/Markets';
import Trade           from './pages/Trade';
import Account         from './pages/Account';
import Wallet          from './pages/Wallet';
import Dashboard       from './pages/Dashboard';
import Admin           from './pages/Admin';
import AdminUserDetail from './pages/AdminUserDetail';
import ForgotPassword  from './pages/ForgotPassword';
import Navbar          from './components/Navbar';
import Footer          from './components/Footer';
import ScrollToTop     from './components/ScrollToTop';

const FOOTER_PAGES = new Set(['/', '/markets', '/login', '/signup', '/forgot-password']);

function AppShell() {
  const dispatch     = useDispatch();
  const { pathname } = useLocation();

  useEffect(() => { dispatch(refreshUser()); }, [dispatch]);

  useEffect(() => {
    const check = () => {
      try {
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        if (stored?.tokenExpiresAt && Date.now() >= stored.tokenExpiresAt) {
          dispatch(sessionExpired());
        }
      } catch {}
    };
    check();
    const interval = setInterval(check, SESSION_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-[#0b0c0e] selection:bg-[#00D68F]/30">
      <Navbar />
      <main>
        <Routes>
          <Route path="/"        element={<Home />} />
          <Route path="/markets" element={<Markets />} />
          <Route path="/trade"   element={<Trade />} />

          <Route path="/wallet"     element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          <Route path="/wallet/:tab" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          <Route path="/account"    element={<ProtectedRoute><Account /></ProtectedRoute>} />
          <Route path="/dashboard"  element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />

          <Route path="/admin"                element={<AdminRoute><Admin /></AdminRoute>} />
          <Route path="/admin/users/:userId"  element={<AdminRoute><AdminUserDetail /></AdminRoute>} />
          <Route path="/admin/:tab"           element={<AdminRoute><Admin /></AdminRoute>} />

          <Route path="/login"           element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/signup"          element={<GuestRoute><Signup /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
        </Routes>
      </main>
      {FOOTER_PAGES.has(pathname) && <Footer />}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AppShell />
    </BrowserRouter>
  );
}
