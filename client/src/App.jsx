import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { useAuth } from './context/AuthContext.jsx';

const Home = lazy(() => import('./pages/Home.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Products = lazy(() => import('./pages/Products.jsx'));
const Sales = lazy(() => import('./pages/Sales.jsx'));
const AIInsights = lazy(() => import('./pages/AIInsights.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function PageLoader() {
  return (
    <div className="min-h-[320px] flex items-center justify-center text-xs text-slate-400">
      Loading StockWise AI...
    </div>
  );
}

export default function App() {
  const { user } = useAuth();
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Dashboard />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute>
              <Layout>
                <Products />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales"
          element={
            <ProtectedRoute>
              <Layout>
                <Sales />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="/customers" element={<Navigate to="/sales?tab=customers" replace />} />
        <Route
          path="/ai-insights"
          element={
            <ProtectedRoute>
              <Layout>
                <AIInsights />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <Layout>
                <Settings />
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to={user ? '/dashboard' : '/'} replace />} />
      </Routes>
    </Suspense>
  );
}
