import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { supabase } from './supabase'

type Project = {
  id: string
  code: string
  name: string
  description: string | null
}

type Membership = {
  access_level: 'admin' | 'editor' | null
}

type ProjectState = {
  project: Project | null
  membership: Membership | null
  loading: boolean
  isAdmin: boolean
}

const ProjectContext = createContext<ProjectState | undefined>(undefined)

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { projectId } = useParams()
  const { session } = useAuth()
  const [project, setProject] = useState<Project | null>(null)
  const [membership, setMembership] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!projectId || !session) return
    setLoading(true)

    Promise.all([
      supabase.from('projects').select('id, code, name, description').eq('id', projectId).single(),
      supabase
        .from('project_members')
        .select('access_level')
        .eq('project_id', projectId)
        .eq('profile_id', session.user.id)
        .maybeSingle(),
    ]).then(([projectRes, memberRes]) => {
      setProject(projectRes.data ?? null)
      setMembership(memberRes.data ?? null)
      setLoading(false)
    })
  }, [projectId, session])

  return (
    <ProjectContext.Provider
      value={{ project, membership, loading, isAdmin: membership?.access_level === 'admin' }}
    >
      {children}
    </ProjectContext.Provider>
  )
}

export function useProject() {
  const ctx = useContext(ProjectContext)
  if (!ctx) throw new Error('useProject must be used inside ProjectProvider')
  return ctx
}
