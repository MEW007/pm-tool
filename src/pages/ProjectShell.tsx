import { NavLink, Outlet } from 'react-router-dom'
import { ProjectProvider, useProject } from '../lib/ProjectContext'

const linkStyle = ({ isActive }: { isActive: boolean }) => ({
  display: 'block',
  padding: '0.5rem 0',
  fontWeight: isActive ? 'bold' : 'normal',
})

function Shell() {
  const { project, loading, isAdmin } = useProject()

  if (loading) return <main style={{ padding: '2rem' }}>Loading…</main>
  if (!project) return <main style={{ padding: '2rem' }}>Project not found, or you're not a member.</main>

  return (
    <div style={{ display: 'flex', fontFamily: 'sans-serif', minHeight: '100vh' }}>
      <nav style={{ width: 200, borderRight: '1px solid #ddd', padding: '1rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <NavLink to="/projects">← All projects</NavLink>
        </div>
        <h2 style={{ fontSize: '1.1em' }}>{project.name}</h2>
        <NavLink to="dashboard" style={linkStyle}>
          Dashboard
        </NavLink>
        <NavLink to="meetings" style={linkStyle}>
          Meetings
        </NavLink>
        <NavLink to="actions" style={linkStyle}>
          Actions
        </NavLink>
        <NavLink to="decisions" style={linkStyle}>
          Decisions
        </NavLink>
        <NavLink to="risks" style={linkStyle}>
          Risks
        </NavLink>
        <NavLink to="team" style={linkStyle}>
          Team
        </NavLink>
        {isAdmin && (
          <NavLink to="settings" style={linkStyle}>
            Settings
          </NavLink>
        )}
      </nav>
      <div style={{ flex: 1, padding: '2rem' }}>
        <Outlet />
      </div>
    </div>
  )
}

export default function ProjectShell() {
  return (
    <ProjectProvider>
      <Shell />
    </ProjectProvider>
  )
}
