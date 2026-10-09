import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

type Project = {
  id: string
  code: string
  name: string
  description: string | null
}

export default function ProjectSelect() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [yourName, setYourName] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  async function loadProjects() {
    const { data, error } = await supabase.from('projects').select('id, code, name, description').order('name')
    if (error) setError(error.message)
    else setProjects(data)
  }

  useEffect(() => {
    loadProjects()
  }, [])

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setError('')

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({ code, name, description: description || null })
      .select()
      .single()

    if (projectError) {
      setError(projectError.message)
      setCreating(false)
      return
    }

    const { error: memberError } = await supabase.from('project_members').insert({
      project_id: project.id,
      profile_id: session!.user.id,
      name: yourName,
      email: session!.user.email,
      access_level: 'admin',
    })

    if (memberError) {
      setError(memberError.message)
      setCreating(false)
      return
    }

    navigate(`/projects/${project.id}`)
  }

  if (projects === null) return <main style={{ padding: '2rem' }}>Loading…</main>

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 500 }}>
      <h1>Your projects</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      {projects.length === 0 && !showCreate && <p>You're not a member of any project yet.</p>}

      <ul style={{ listStyle: 'none', padding: 0 }}>
        {projects.map((p) => (
          <li key={p.id} style={{ margin: '0.5rem 0' }}>
            <button
              onClick={() => navigate(`/projects/${p.id}`)}
              style={{ width: '100%', textAlign: 'left', padding: '0.75rem' }}
            >
              <strong>{p.name}</strong> ({p.code})
              {p.description && <div style={{ fontSize: '0.9em', color: '#666' }}>{p.description}</div>}
            </button>
          </li>
        ))}
      </ul>

      {showCreate ? (
        <form onSubmit={handleCreate} style={{ marginTop: '1rem' }}>
          <h2>New project</h2>
          <label>
            Code (short, e.g. CHIVE)
            <br />
            <input required value={code} onChange={(e) => setCode(e.target.value)} style={{ width: '100%' }} />
          </label>
          <br />
          <label>
            Name
            <br />
            <input required value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
          </label>
          <br />
          <label>
            Description (optional)
            <br />
            <input value={description} onChange={(e) => setDescription(e.target.value)} style={{ width: '100%' }} />
          </label>
          <br />
          <label>
            Your name (shown to the team)
            <br />
            <input required value={yourName} onChange={(e) => setYourName(e.target.value)} style={{ width: '100%' }} />
          </label>
          <br />
          <button type="submit" disabled={creating}>
            {creating ? 'Creating…' : 'Create project'}
          </button>{' '}
          <button type="button" onClick={() => setShowCreate(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button onClick={() => setShowCreate(true)}>+ New project</button>
      )}
    </main>
  )
}
