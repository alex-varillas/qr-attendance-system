import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth.jsx'
import { OwnerRoute, PermissionRoute, ProtectedRoute, PublicRoute, SetupGate } from './components/layout/ProtectedRoute'
import Login from './pages/auth/Login'
import Setup from './pages/auth/Setup'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import AcceptInvite from './pages/auth/AcceptInvite'
import AppLayout from './components/layout/AppLayout'
import { ToastProvider } from './components/ui/Toast'
import Employees from './pages/employees/Employees'
import Checkin from './pages/checkin/Checkin'
import QrCode from './pages/qr/QrCode'
import Locations from './pages/locations/Locations'
import Settings from './pages/settings/Settings'
import Dashboard from './pages/dashboard/Dashboard'

function AppPage({ children }) {
  return (
    <ProtectedRoute>
      <ToastProvider>
        <AppLayout>{children}</AppLayout>
      </ToastProvider>
    </ProtectedRoute>
  )
}

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

          {/* The screen employees open by scanning the QR code (no account needed) */}
          <Route path="/checkin/:checkinId" element={<Checkin />} />

          {/* Signed-in pages */}
          <Route path="/dashboard" element={<AppPage><Dashboard /></AppPage>} />
          <Route path="/employees" element={<AppPage><Employees /></AppPage>} />

          {/* Owner only */}
          <Route path="/qr" element={<AppPage><OwnerRoute><QrCode /></OwnerRoute></AppPage>} />
          <Route path="/locations" element={<AppPage><OwnerRoute><Locations /></OwnerRoute></AppPage>} />

          {/* The owner, or an administrator with the settings or holidays permission */}
          <Route path="/settings" element={<AppPage><PermissionRoute anyOf={['manage_settings', 'manage_holidays']}><Settings /></PermissionRoute></AppPage>} />

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
