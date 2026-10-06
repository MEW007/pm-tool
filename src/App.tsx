import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'

type ConnectionState = 'checking' | 'ok' | 'error'

function App() {
  const [state, setState] = useState<ConnectionState>('checking')
  const [message, setMessage] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ error }) => {
      if (error) {
        setState('error')
        setMessage(error.message)
      } else {
        setState('ok')
      }
    })
  }, [])

  return (
    <main style={{ fontFamily: 'sans-serif', padding: '2rem' }}>
      <h1>PM Tool</h1>
      <p>Hello world — Phase 1 scaffold.</p>
      <p>
        Supabase connection:{' '}
        {state === 'checking' && 'checking…'}
        {state === 'ok' && '✅ connected'}
        {state === 'error' && `❌ ${message}`}
      </p>
    </main>
  )
}

export default App
