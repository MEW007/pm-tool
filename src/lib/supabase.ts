import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Set them in .env.local for dev, ' +
      'and as repo variables/secrets for the GitHub Actions build.',
  )
}

// PKCE delivers the magic-link token as a ?code= query param instead of a
// #access_token hash fragment. We need that: the app uses HashRouter (so
// GitHub Pages, which has no server-side rewrite, doesn't 404 on refresh or
// deep links), and a hash-fragment token would collide with React Router
// reading that same fragment as a route.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { flowType: 'pkce' },
})
