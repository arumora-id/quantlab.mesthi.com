import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth/context'
import { useI18n } from './i18n/context'
import AuthPage from './pages/AuthPage'

// charts and the backtest engine load only after sign-in
const Workspace = lazy(() => import('./pages/Workspace'))

function RequireUser({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? children : <Navigate to="/login" replace />
}

function WorkspaceFallback() {
  const { t } = useI18n()
  return <div className="empty">{t.common.loadingWorkspace}</div>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <Navigate to="/app" replace /> : children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<GuestOnly><AuthPage mode="login" /></GuestOnly>} />
      <Route path="/register" element={<GuestOnly><AuthPage mode="register" /></GuestOnly>} />
      <Route
        path="/app"
        element={
          <RequireUser>
            <Suspense fallback={<WorkspaceFallback />}>
              <Workspace />
            </Suspense>
          </RequireUser>
        }
      />
      <Route path="*" element={<Navigate to="/app" replace />} />
    </Routes>
  )
}
