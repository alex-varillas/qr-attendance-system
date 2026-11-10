import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'
import { ProtectedRoute, PublicRoute, SetupGate } from './components/layout/ProtectedRoute'
import Login from './pages/auth/Login'
import Setup from './pages/auth/Setup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import AcceptInvite from './pages/auth/AcceptInvite'
import Home from './pages/Home'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* First run of a new installation */}
          <Route path="/setup" element={<Setup />} />

          {/* Public pages */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/reset-password" element={<SetupGate><ResetPassword /></SetupGate>} />
          <Route path="/accept-invite" element={<SetupGate><AcceptInvite /></SetupGate>} />

          {/* Signed-in pages */}
          <Route path="/dashboard" element={<ProtectedRoute><Home /></ProtectedRoute>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
