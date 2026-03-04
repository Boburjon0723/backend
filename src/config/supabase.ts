import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

let supabaseClient: any;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Supabase credentials missing. Storage will not work correctly.');
    // Export a dummy object to prevent startup crash
    supabaseClient = {
        storage: {
            from: () => ({
                upload: async () => ({ data: null, error: new Error('Supabase not configured') }),
                getPublicUrl: () => ({ data: { publicUrl: '' } })
            })
        }
    };
} else {
    supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            persistSession: false
        }
    });
}

export const supabase = supabaseClient;
