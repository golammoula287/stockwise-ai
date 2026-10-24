import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute({ children, ownerOnly = false }) {
  const { user, initializing } = useAuth();
  if (initializing) return <div className="min-h-[320px] grid place-items-center text-sm text-slate-500" role="status">Loading your account…</div>;
  const token = localStorage.getItem('token');
  if (!token || !user) return <Navigate to="/login" replace />;
  if (ownerOnly && !user.isSuperAdmin) return <Navigate to="/dashboard" replace />;
  if (!ownerOnly && user.isSuperAdmin) return <Navigate to="/management" replace />;
  return children;
}
