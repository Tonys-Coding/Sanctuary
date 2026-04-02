import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout'; 
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GiversPage from './pages/GiversPage';
import OfferingsPage from './pages/Offeringspage';
import DashboardPage from './pages/DashboardPage';

import './App.css'

// Protected route component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return user ? <>{children}</> : <Navigate to="/login" />;
};

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route 
        path="/dashboard" 
        element={
        <ProtectedRoute>
          <Layout>
          <DashboardPage />
         </Layout>
        </ProtectedRoute>
      } 
      />
       <Route 
       path="/givers"
        element={
          <ProtectedRoute>
            <Layout>
            <GiversPage />
           </Layout>
          </ProtectedRoute>
        } 
        />
        <Route
          path="/offerings"
          element={
            <ProtectedRoute>
              <Layout>
              <OfferingsPage />
             </Layout>
            </ProtectedRoute>
          }
          />
    <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  );
}

export default App;