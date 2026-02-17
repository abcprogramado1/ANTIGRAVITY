
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ewpmmjgizixhrjfrjede.supabase.co'
const supabaseKey = 'sb_publishable_NIGr1btBcpVAfyFNWmP8eQ_2c_IxgVP' // Note: This is an Anon Key, safe for client-side.

export const supabase = createClient(supabaseUrl, supabaseKey)
