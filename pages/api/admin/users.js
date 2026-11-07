import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../../lib/auth';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  
  // Validamos que solo los administradores puedan usar esta ruta
  if (!session || session.user.role !== 'admin') {
    return res.status(401).json({ error: 'No autorizado' });
  }

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, commission_pct')
      .order('id');
      
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { email, password, name, role, commission_pct } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Faltan email o password' });

    // Encriptamos la contraseña antes de guardarla
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const { error } = await supabase.from('users').insert([{
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      name,
      role,
      commission_pct
    }]);

    if (error) return res.status(400).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'PATCH') {
    const { id, password, ...fields } = req.body;
    if (!id) return res.status(400).json({ error: 'Falta id' });

    const payload = { ...fields };
    // Si el admin decide cambiar la contraseña, la encriptamos de nuevo
    if (password) {
      payload.password = await bcrypt.hash(password, 10);
    }

    const { error } = await supabase.from('users').update(payload).eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'Falta id' });

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ success: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
}