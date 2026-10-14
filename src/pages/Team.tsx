import { useEffect, useState, type FormEvent } from 'react'
import { useProject } from '../lib/ProjectContext'
import { supabase } from '../lib/supabase'

type Member = {
  id: string
  profile_id: string | null
  name: string
  email: string | null
  role: string | null
  company: string | null
  access_level: 'admin' | 'editor' | null
  is_active: boolean
}

export default function Team() {
  const { project, isAdmin } = useProject()
  const [members, setMembers] = useState<Member[] | null>(null)
  const [error, setError] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)

  async function loadMembers() {
    const { data, error } = await supabase
      .from('project_members')
      .select('id, profile_id, name, email, role, company, access_level, is_active')
      .eq('project_id', project!.id)
      .order('name')
    if (error) setError(error.message)
    else setMembers(data)
  }

  useEffect(() => {
    if (project) loadMembers()
  }, [project])

  if (members === null) return <p>Loading…</p>

  return (
    <div>
      <h1>Team</h1>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Company</th>
            <th>Access</th>
            <th>Active</th>
            {isAdmin && <th></th>}
          </tr>
        </thead>
        <tbody>
          {members.map((m) =>
            editingId === m.id ? (
              <EditRow
                key={m.id}
                member={m}
                onDone={() => {
                  setEditingId(null)
                  loadMembers()
                }}
              />
            ) : linkingId === m.id ? (
              <LinkRow
                key={m.id}
                member={m}
                onDone={() => {
                  setLinkingId(null)
                  loadMembers()
                }}
              />
            ) : (
              <tr key={m.id} style={{ borderBottom: '1px solid #eee' }}>
                <td>{m.name}</td>
                <td>{m.email}</td>
                <td>{m.role}</td>
                <td>{m.company}</td>
                <td>{m.access_level ?? (m.profile_id ? '—' : 'no login')}</td>
                <td>{m.is_active ? 'Yes' : 'No'}</td>
                {isAdmin && (
                  <td>
                    <button onClick={() => setEditingId(m.id)}>Edit</button>{' '}
                    {!m.profile_id && <button onClick={() => setLinkingId(m.id)}>Link login</button>}
                  </td>
                )}
              </tr>
            ),
          )}
        </tbody>
      </table>

      {isAdmin &&
        (showAdd ? (
          <AddForm
            projectId={project!.id}
            onDone={() => {
              setShowAdd(false)
              loadMembers()
            }}
            onCancel={() => setShowAdd(false)}
          />
        ) : (
          <p>
            <button onClick={() => setShowAdd(true)}>+ Add team member</button>
          </p>
        ))}
    </div>
  )
}

function AddForm({
  projectId,
  onDone,
  onCancel,
}: {
  projectId: string
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('')
  const [company, setCompany] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('project_members').insert({
      project_id: projectId,
      name,
      email: email || null,
      role: role || null,
      company: company || null,
    })
    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      onDone()
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ marginTop: '1rem', maxWidth: 400 }}>
      <h2>Add team member</h2>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      <label>
        Name
        <br />
        <input required value={name} onChange={(e) => setName(e.target.value)} style={{ width: '100%' }} />
      </label>
      <br />
      <label>
        Email
        <br />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: '100%' }} />
      </label>
      <br />
      <label>
        Role
        <br />
        <input value={role} onChange={(e) => setRole(e.target.value)} style={{ width: '100%' }} />
      </label>
      <br />
      <label>
        Company
        <br />
        <input value={company} onChange={(e) => setCompany(e.target.value)} style={{ width: '100%' }} />
      </label>
      <br />
      <button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Add'}
      </button>{' '}
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
    </form>
  )
}

function EditRow({ member, onDone }: { member: Member; onDone: () => void }) {
  const [name, setName] = useState(member.name)
  const [email, setEmail] = useState(member.email ?? '')
  const [role, setRole] = useState(member.role ?? '')
  const [company, setCompany] = useState(member.company ?? '')
  const [accessLevel, setAccessLevel] = useState(member.access_level ?? '')
  const [isActive, setIsActive] = useState(member.is_active)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('project_members')
      .update({
        name,
        email: email || null,
        role: role || null,
        company: company || null,
        access_level: member.profile_id ? accessLevel || null : null,
        is_active: isActive,
      })
      .eq('id', member.id)
    if (error) {
      setError(error.message)
      setSaving(false)
    } else {
      onDone()
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td colSpan={7}>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />{' '}
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />{' '}
        <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role" />{' '}
        <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" />{' '}
        {member.profile_id && (
          <select value={accessLevel} onChange={(e) => setAccessLevel(e.target.value)}>
            <option value="">no access level</option>
            <option value="editor">editor</option>
            <option value="admin">admin</option>
          </select>
        )}{' '}
        <label>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Active
        </label>{' '}
        <button onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>{' '}
        <button onClick={onDone}>Cancel</button>
      </td>
    </tr>
  )
}

function LinkRow({ member, onDone }: { member: Member; onDone: () => void }) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleLink() {
    setSaving(true)
    setError('')

    const { data: profile, error: findError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email.trim())
      .maybeSingle()

    if (findError) {
      setError(findError.message)
      setSaving(false)
      return
    }
    if (!profile) {
      setError('No one has signed in with that email yet. They need to log in once first (even without a project), then you can link them.')
      setSaving(false)
      return
    }

    const { error: updateError } = await supabase
      .from('project_members')
      .update({ profile_id: profile.id, access_level: 'editor' })
      .eq('id', member.id)

    if (updateError) {
      setError(updateError.message)
      setSaving(false)
    } else {
      onDone()
    }
  }

  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td colSpan={7}>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <p>
          Link {member.name} to a login. They must have signed in at least once already (sign-in creates their
          account automatically).
        </p>
        <input
          type="email"
          placeholder="Their email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />{' '}
        <button onClick={handleLink} disabled={saving}>
          {saving ? 'Linking…' : 'Link'}
        </button>{' '}
        <button onClick={onDone}>Cancel</button>
      </td>
    </tr>
  )
}
