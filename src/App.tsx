import type { ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import ComingSoon from './components/ComingSoon'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import ProjectSelect from './pages/ProjectSelect'
import ProjectShell from './pages/ProjectShell'

function RequireAuth({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <main style={{ padding: '2rem' }}>Loading…</main>
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function LoginRoute() {
  const { session, loading } = useAuth()
  if (loading) return <main style={{ padding: '2rem' }}>Loading…</main>
  if (session) return <Navigate to="/projects" replace />
  return <Login />
}

function SignOutButton() {
  return (
    <button
      onClick={() => supabase.auth.signOut()}
      style={{ position: 'fixed', top: '1rem', right: '1rem' }}
    >
      Sign out
    </button>
  )
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginRoute />} />
          <Route
            path="/projects"
            element={
              <RequireAuth>
                <SignOutButton />
                <ProjectSelect />
              </RequireAuth>
            }
          />
          <Route
            path="/projects/:projectId"
            element={
              <RequireAuth>
                <SignOutButton />
                <ProjectShell />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<ComingSoon title="Dashboard" phase="Phase 8" />} />
            <Route path="meetings" element={<ComingSoon title="Meetings" phase="Phase 5" />} />
            <Route path="actions" element={<ComingSoon title="Actions" phase="Phase 6" />} />
            <Route path="decisions" element={<ComingSoon title="Decisions" phase="Phase 7" />} />
            <Route path="risks" element={<ComingSoon title="Risks" phase="Phase 7" />} />
            <Route path="team" element={<ComingSoon title="Team" phase="Phase 4" />} />
            <Route path="settings" element={<ComingSoon title="Settings" phase="a later phase" />} />
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  )
}
