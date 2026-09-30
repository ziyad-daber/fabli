import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

export const createClient = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are not set. ' +
        'Add them to .env.local before using the Supabase client.'
    )
  }

  return createBrowserClient(supabaseUrl, supabaseKey)
}