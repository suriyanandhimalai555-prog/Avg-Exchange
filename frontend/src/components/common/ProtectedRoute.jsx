/**
 * ProtectedRoute — redirects to /login if not authenticated.
 * Optionally requires admin role.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';

export function ProtectedRoute({ children }) {
  const user = useSelector((s) => s.auth.user);
  const { pathname } = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: pathname }} />;
  return children;
}

export function AdminRoute({ children }) {
  const user = useSelector((s) => s.auth.user);

  if (!user?.isAdmin) return <Navigate to="/" replace />;
  return children;
}

export function GuestRoute({ children }) {
  const user = useSelector((s) => s.auth.user);

  if (user) return <Navigate to="/" replace />;
  return children;
}
