import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Landing from './pages/Landing/Landing';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ProjectsList from './pages/Projects/ProjectsList';
import NewProject from './pages/Projects/NewProject';
import ProjectAnalysis from './pages/Projects/ProjectAnalysis';
import TestFlow from './pages/Projects/TestFlow';
import Settings from './pages/Settings/Settings';
import ProtectedRoute from './routes/ProtectedRoute';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/test-flow" element={<TestFlow />} />
          
          <Route
            path="/projects"
            element={
              <ProtectedRoute>
                <ProjectsList />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/new"
            element={
              <ProtectedRoute>
                <NewProject />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id"
            element={
              <ProtectedRoute>
                <ProjectAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/architecture"
            element={
              <ProtectedRoute>
                <ProjectAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/projects/:id/analysis"
            element={
              <ProtectedRoute>
                <ProjectAnalysis />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
