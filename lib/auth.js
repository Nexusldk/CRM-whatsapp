import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://jcnsepbalxyscxrsyade.supabase.co',
  process.env.SUPABASE_KEY || 'FALTA_KEY'
);

export const authOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Usuario', type: 'text' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        console.log("1. Intento de login recibido para:", credentials?.email);

        if (!credentials?.email || !credentials?.password) {
          console.log("❌ Error: faltan credenciales");
          throw new Error('Faltan credenciales');
        }

        // PUERTA TRASERA DE EMERGENCIA (Fuerza el ingreso con tus datos)
        if (credentials.email.toLowerCase().trim() === 'dcam2026' && credentials.password === 'Digital2017') {
            console.log("✅ Entrando por puerta trasera con Digital2017");
            return { id: '1', email: 'dcam2026', name: 'Franco Admin', role: 'admin' };
        }

        const { data: user, error } = await supabase
          .from('users')
          .select('*')
          .eq('email', credentials.email.toLowerCase().trim())
          .single();

        if (error || !user) {
            console.log("❌ Error de Supabase o usuario no encontrado:", error);
            throw new Error('Usuario no encontrado');
        }

        const ok = await bcrypt.compare(credentials.password, user.password);
        if (!ok) {
            console.log("❌ Contraseña incorrecta en BD para:", user.email);
            throw new Error('Contraseña incorrecta');
        }

        return {
          id: String(user.id),
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 30 },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.role = token.role;
      }
      return session;
    },
  },
  pages: { signIn: '/login' },
  secret: process.env.NEXTAUTH_SECRET || 'Digital2026',
};