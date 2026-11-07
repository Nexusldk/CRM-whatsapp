import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await signIn('credentials', {
        email: user,
        password,
        redirect: false,
      });

      if (res?.error) {
        setError('Usuario o contraseña incorrectos');
        setLoading(false);
        return;
      }

      router.push('/');
    } catch (err) {
      setError('Error de conexión');
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />

      <div style={styles.card}>
        <div style={styles.logoBox}>
          <img src="/logo.png" alt="DCAM" style={styles.logo} />
        </div>

        <h1 style={styles.title}>De China al Mundo</h1>
        <p style={styles.subtitle}>Acceso al sistema</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.field}>
            <label style={styles.label}>Usuario</label>
            <input
              type="text"
              value={user}
              onChange={(e) => setUser(e.target.value)}
              style={styles.input}
              placeholder="Ingresá tu usuario"
              autoFocus
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="Ingresá tu contraseña"
              disabled={loading}
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button type="submit" style={styles.button} disabled={loading}>
            {loading ? '⏳ Ingresando...' : '🔓 Ingresar'}
          </button>
        </form>

        <p style={styles.footer}>CRM interno · DCAM © 2026</p>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, #05070d 0%, #0a0f1c 100%)',
    position: 'relative',
    overflow: 'hidden',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  bgGlow1: {
    position: 'absolute',
    top: '-20%',
    left: '-10%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.15), transparent 70%)',
    filter: 'blur(60px)',
    pointerEvents: 'none',
  },
  bgGlow2: {
    position: 'absolute',
    bottom: '-20%',
    right: '-10%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(6,182,212,0.12), transparent 70%)',
    filter: 'blur(60px)',
    pointerEvents: 'none',
  },
  card: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: '400px',
    background: 'rgba(15,23,42,0.7)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(51,65,85,0.5)',
    borderRadius: '20px',
    padding: '40px 32px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  logoBox: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  logo: {
    height: '90px',
    objectFit: 'contain',
    filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.4))',
  },
  title: {
    fontSize: '22px',
    fontWeight: 800,
    color: '#f1f5f9',
    textAlign: 'center',
    margin: '0 0 4px 0',
    letterSpacing: '-0.5px',
  },
  subtitle: {
    fontSize: '13px',
    color: '#64748b',
    textAlign: 'center',
    margin: '0 0 28px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  label: {
    fontSize: '11.5px',
    fontWeight: 600,
    color: '#94a3b8',
    letterSpacing: '0.3px',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: 'rgba(30,41,59,0.6)',
    border: '1px solid rgba(51,65,85,0.7)',
    borderRadius: '10px',
    color: '#f1f5f9',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.2s',
  },
  error: {
    padding: '10px 14px',
    background: 'rgba(127,29,29,0.3)',
    border: '1px solid rgba(239,68,68,0.4)',
    borderRadius: '8px',
    color: '#fca5a5',
    fontSize: '12.5px',
    textAlign: 'center',
  },
  button: {
    marginTop: '8px',
    padding: '13px',
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontWeight: 700,
    fontSize: '14px',
    cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(139,92,246,0.35)',
    transition: 'all 0.2s',
  },
  footer: {
    marginTop: '24px',
    fontSize: '11px',
    color: '#475569',
    textAlign: 'center',
  },
};