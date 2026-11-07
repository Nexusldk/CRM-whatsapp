import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';

export default function AdminPanel() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    email: '', password: '', name: '', role: 'vendedor', commission_pct: 5,
  });

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
    if (status === 'authenticated' && session?.user?.role !== 'admin') router.push('/');
  }, [status, session, router]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/admin/users');
      if (!res.ok) return;
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'admin') {
      fetchUsers();
    }
  }, [status, session]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const method = editingId ? 'PATCH' : 'POST';
    const body = editingId ? { id: editingId, ...form } : form;

    const res = await fetch('/api/admin/users', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      setForm({ email: '', password: '', name: '', role: 'vendedor', commission_pct: 5 });
      setShowForm(false);
      setEditingId(null);
      fetchUsers();
    } else {
      const data = await res.json();
      alert('Error: ' + (data.error || 'desconocido'));
    }
  };

  const handleEdit = (user) => {
    setForm({
      email: user.email,
      password: '',
      name: user.name || '',
      role: user.role,
      commission_pct: user.commission_pct || 0,
    });
    setEditingId(user.id);
    setShowForm(true);
  };

  const handleDelete = async (user) => {
    if (!confirm(`¿Desactivar a ${user.name || user.email}?`)) return;
    await fetch('/api/admin/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id }),
    });
    fetchUsers();
  };

  if (status === 'loading' || loading) {
    return <div style={styles.loading}>Cargando...</div>;
  }

  return (
    <div style={styles.container}>
      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />

      <header style={styles.header}>
        <div style={styles.brand}>
          <div style={styles.logoBox}>
            <img src="/logo.png" alt="DCAM" style={styles.logo} />
          </div>
          <div>
            <h1 style={styles.title}>Panel de Administración</h1>
            <span style={styles.subtitle}>Gestión de usuarios internos</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => router.push('/')} style={styles.btnSecondary}>
            ← Volver al CRM
          </button>
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={styles.btnLogout}>
            Salir
          </button>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.actionsBar}>
          <div>
            <h2 style={styles.sectionTitle}>Usuarios ({users.length})</h2>
            <p style={styles.sectionSubtitle}>
              Cada usuario recibe leads automáticamente por round-robin
            </p>
          </div>
          <button
            onClick={() => {
              setForm({ email: '', password: '', name: '', role: 'vendedor', commission_pct: 5 });
              setEditingId(null);
              setShowForm(true);
            }}
            style={styles.btnPrimary}
          >
            + Nuevo usuario
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} style={styles.form}>
            <h3 style={styles.formTitle}>
              {editingId ? 'Editar usuario' : 'Nuevo usuario'}
            </h3>

            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>Usuario / Email</label>
                <input
                  type="text"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  style={styles.input}
                  required
                  disabled={editingId !== null}
                  placeholder="Ej: vendedor1"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>
                  {editingId ? 'Nueva contraseña (opcional)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  style={styles.input}
                  required={!editingId}
                  placeholder={editingId ? 'Dejar vacío para no cambiar' : 'Ej: pass123'}
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Nombre</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  style={styles.input}
                  placeholder="Ej: Juan Pérez"
                />
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Rol</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  style={styles.input}
                >
                  <option value="vendedor">Vendedor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Comisión (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={form.commission_pct}
                  onChange={(e) => setForm({ ...form, commission_pct: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  placeholder="Ej: 5"
                />
              </div>
            </div>

            <div style={styles.formActions}>
              <button
                type="button"
                onClick={() => { setShowForm(false); setEditingId(null); }}
                style={styles.btnSecondary}
              >
                Cancelar
              </button>
              <button type="submit" style={styles.btnPrimary}>
                {editingId ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        )}

        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <span>Nombre</span>
            <span>Usuario</span>
            <span>Rol</span>
            <span>Comisión</span>
            <span>Acciones</span>
          </div>
          {users.map((user) => (
            <div key={user.id} style={styles.tableRow}>
              <span>{user.name || '-'}</span>
              <span style={{ color: '#94a3b8' }}>{user.email}</span>
              <span>
                <span style={{
                  ...styles.roleBadge,
                  background: user.role === 'admin' ? 'rgba(139,92,246,0.15)' : 'rgba(6,182,212,0.15)',
                  color: user.role === 'admin' ? '#c4b5fd' : '#67e8f9',
                }}>
                  {user.role}
                </span>
              </span>
              <span>{user.commission_pct || 0}%</span>
              <span style={{ display: 'flex', gap: '6px' }}>
                <button onClick={() => handleEdit(user)} style={styles.btnSmall}>✏️</button>
                <button onClick={() => handleDelete(user)} style={styles.btnSmallDanger}>🗑️</button>
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #05070d 0%, #0a0f1c 100%)',
    color: '#e2e8f0', position: 'relative', overflow: 'auto',
  },
  bgGlow1: {
    position: 'fixed', top: '-20%', left: '-10%', width: '600px', height: '600px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)',
    filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
  },
  bgGlow2: {
    position: 'fixed', bottom: '-20%', right: '-10%', width: '600px', height: '600px',
    borderRadius: '50%', background: 'radial-gradient(circle, rgba(6,182,212,0.1), transparent 70%)',
    filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
  },
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  header: {
    height: '64px', background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(51,65,85,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'space-between', padding: '0 24px',
    position: 'sticky', top: 0, zIndex: 10,
  },
  brand: { display: 'flex', alignItems: 'center', gap: '14px' },
  logoBox: {
    width: '44px', height: '44px', borderRadius: '12px',
    background: 'rgba(15,23,42,0.7)', border: '1px solid rgba(139,92,246,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%', objectFit: 'contain', padding: '4px' },
  title: { fontSize: '15px', fontWeight: 800, margin: 0, color: '#f1f5f9' },
  subtitle: { fontSize: '10.5px', color: '#64748b' },
  main: { maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', position: 'relative', zIndex: 1 },
  actionsBar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: '24px', gap: '16px', flexWrap: 'wrap',
  },
  sectionTitle: { fontSize: '18px', fontWeight: 700, margin: '0 0 4px 0', color: '#f1f5f9' },
  sectionSubtitle: { fontSize: '12px', color: '#64748b', margin: 0 },
  btnPrimary: {
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', color: '#fff',
    border: 'none', padding: '10px 20px', borderRadius: '10px',
    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
  },
  btnSecondary: {
    background: 'rgba(30,41,59,0.6)', color: '#cbd5e1',
    border: '1px solid rgba(51,65,85,0.6)', padding: '10px 20px',
    borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  btnLogout: {
    background: 'rgba(239,68,68,0.15)', color: '#f87171',
    border: '1px solid rgba(239,68,68,0.3)', padding: '10px 20px',
    borderRadius: '10px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
  },
  form: {
    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(51,65,85,0.5)', borderRadius: '12px',
    padding: '24px', marginBottom: '24px',
  },
  formTitle: { fontSize: '14px', fontWeight: 700, margin: '0 0 16px 0', color: '#f1f5f9' },
  formGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' },
  field: { display: 'flex', flexDirection: 'column', gap: '6px' },
  label: { fontSize: '11px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.3px' },
  input: {
    width: '100%', padding: '10px 13px', background: 'rgba(30,41,59,0.6)',
    border: '1px solid rgba(51,65,85,0.6)', borderRadius: '10px',
    color: '#f1f5f9', fontSize: '13px', outline: 'none', boxSizing: 'border-box',
  },
  formActions: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  table: {
    background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(10px)',
    border: '1px solid rgba(51,65,85,0.5)', borderRadius: '12px', overflow: 'hidden',
  },
  tableHeader: {
    display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr',
    padding: '14px 20px', background: 'rgba(30,41,59,0.5)',
    borderBottom: '1px solid rgba(51,65,85,0.4)',
    fontSize: '11px', fontWeight: 700, color: '#94a3b8',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  },
  tableRow: {
    display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr 1fr 1fr',
    padding: '14px 20px', borderBottom: '1px solid rgba(51,65,85,0.25)',
    alignItems: 'center', fontSize: '13px', color: '#cbd5e1',
  },
  roleBadge: {
    fontSize: '11px', fontWeight: 700, padding: '3px 10px',
    borderRadius: '12px', textTransform: 'capitalize',
  },
  btnSmall: {
    background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)',
    color: '#c4b5fd', padding: '5px 10px', borderRadius: '6px',
    cursor: 'pointer', fontSize: '12px',
  },
  btnSmallDanger: {
    background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.4)',
    color: '#f87171', padding: '5px 10px', borderRadius: '6px',
    cursor: 'pointer', fontSize: '12px',
  },
};