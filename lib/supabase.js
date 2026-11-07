import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jcnsepbalxyscxrsyade.supabase.co';
const supabaseAnonKey = 'sb_publishable_kVLvltX-K4yGF2VRPaGDaA_KBkmT78W';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);