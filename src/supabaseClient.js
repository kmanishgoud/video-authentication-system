// Import the Supabase library
import { createClient } from '@supabase/supabase-js';

// Your Supabase project details
const supabaseUrl = 'https://uopfghtmyrilxtgdoerb.supabase.co';
const supabaseKey = 'sb_publishable_8JspF2r0Ey99BrhfPmlmYw_VBQJ36vt';

// Create a Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);