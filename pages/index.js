import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/router';
import KanbanTab from '../components/KanbanTab';
import AsistenteIATab from '../components/AsistenteIATab';
import RecuperacionTab from '../components/RecuperacionTab';

const ESTADOS = [
  'Entrante', 'Faltan Datos', 'Cotizado', 'Pre-Cierre', 'Cliente Cerrado', 'Cliente Finalizado',
];

const STATUS_COLORS = {
  'Entrante': { bg: 'rgba(244,63,94,0.12)', color: '#fb7185', border: 'rgba(244,63,94,0.4)' },
  'Faltan Datos': { bg: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: 'rgba(245,158,11,0.4)' },
  'Cotizado': { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.4)' },
  'Pre-Cierre': { bg: 'rgba(6,182,212,0.12)', color: '#22d3ee', border: 'rgba(6,182,212,0.4)' },
  'Cliente Cerrado': { bg: 'rgba(249,115,22,0.12)', color: '#fb923c', border: 'rgba(249,115,22,0.4)' },
  'Cliente Finalizado': { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' },
};

function useIsMobile(breakpoint = 900) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [breakpoint]);
  return isMobile;
}

export default function CRM() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const isMobile = useIsMobile(900);

  const [activeTab, setActiveTab] = useState('chat');
  const [recoveryDraft, setRecoveryDraft] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [inputReply, setInputReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingAi, setLoadingAi] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState({});
  const [hoveredId, setHoveredId] = useState(null);

  const [mobileView, setMobileView] = useState('inbox');
  const [mobileFormOpen, setMobileFormOpen] = useState(false);

  const chatBottomRef = useRef(null);
  const attachmentInputRef = useRef(null);
  const [sendingFile, setSendingFile] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login');
  }, [status, router]);

  const selectedConv = useMemo(
    () => conversations.find((c) => String(c.id) === String(selectedId)) || conversations[0] || null,
    [conversations, selectedId]
  );

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data);
        if (!selectedId && data.length > 0) setSelectedId(String(data[0].id));
      }
    } catch (err) {
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const fetchVendedores = useCallback(async () => {
    try {
      const res = await fetch('/api/vendedores');
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setVendedores(data);
    } catch (err) {}
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetchConversations();
    fetchVendedores();
    const interval = setInterval(fetchConversations, 3000);
    return () => clearInterval(interval);
  }, [status, fetchConversations, fetchVendedores]);

  useEffect(() => {
    if (selectedConv) setFormData(selectedConv.quoteData || {});
  }, [selectedConv?.id]);

  useEffect(() => {
    // Timeout para asegurar que el DOM se haya actualizado antes de scrollear
    setTimeout(() => {
      chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [selectedConv?.messages?.length, selectedId]);

  const handleOpenRecoveryChat = (id, draft) => {
    setSelectedId(String(id));
    setActiveTab('chat');
    if (typeof draft === 'string') { setInputReply(draft); setRecoveryDraft(draft); }
    if (isMobile) setMobileView('chat');
  };

  const handleSelectConv = (id) => {
    setSelectedId(String(id));
    if (isMobile) setMobileView('chat');
  };

  // --- DISYUNTOR GLOBAL ---
  const isGlobalBotActive = conversations.some((c) => c.botActive !== false);

  const handleGlobalKillSwitch = async () => {
    const turnOff = isGlobalBotActive;
    const msg = turnOff
      ? "🛑 DISYUNTOR GENERAL: Esto va a APAGAR la IA para TODOS los clientes al mismo tiempo. ¿Estás seguro?"
      : "▶️ REACTIVAR IA: Esto va a volver a encender la IA para todos. ¿Avanzamos?";

    if (!window.confirm(msg)) return;

    // Actualizamos la UI al instante
    setConversations((prev) => prev.map((c) => ({ ...c, botActive: !turnOff })));

    // Mandamos la orden masiva a la base de datos
    try {
      const updates = conversations.map((c) =>
        fetch('/api/conversations', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: c.id, botActive: !turnOff }),
        })
      );
      await Promise.all(updates);
    } catch (error) {
      console.error("Error en disyuntor global:", error);
      alert("Hubo un error al aplicar el disyuntor global.");
    }
  };

  const handleTriggerSolAI = async () => {
    if (!selectedConv?.messages || selectedConv.messages.length === 0) return;
    setLoadingAi(true);
    try {
      const res = await fetch('/api/ai-extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationHistory: selectedConv.messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en Sol AI');

      if (data.extractedData) {
        const cleanedData = Object.fromEntries(
          Object.entries(data.extractedData).filter(([_, v]) => v !== null && v !== '')
        );
        const mergedData = { ...formData, ...cleanedData };
        setFormData(mergedData);
        updateContact({ quoteData: mergedData, status: data.suggestedStatus || selectedConv.status });
      }
      if (data.replyMessage) setInputReply(data.replyMessage);
    } catch (err) {
      alert('Detalle: ' + err.message);
    } finally {
      setLoadingAi(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!inputReply.trim() || !selectedConv) return;

    const text = inputReply.trim();
    setInputReply('');
    const targetPhone = selectedConv.phone || selectedConv.jid;
    const targetJid = selectedConv.jid;
    const now = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

    setConversations((prev) =>
      prev.map((c) =>
        String(c.id) === String(selectedConv.id)
          ? {
              ...c,
              lastMessage: text,
              messages: [...(c.messages || []), { id: Date.now(), sender: 'me', text, time: now }],
            }
          : c
      )
    );

    try {
      await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: targetPhone, jid: targetJid, message: text, contactId: selectedConv.id }),
      });
      await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedConv.id, lastMessage: text }),
      });
    } catch (err) {
      console.error('Error enviando:', err);
    }
  };

  const sendAttachment = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedConv) return;
    if (file.size > 8 * 1024 * 1024) {
      alert('El archivo supera 8 MB. Elegí uno más pequeño.');
      return;
    }
    setSendingFile(true);
    try {
      const encoded = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/api/media-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: selectedConv.id, phone: selectedConv.phone, jid: selectedConv.jid,
          filename: file.name, mimeType: file.type || 'application/octet-stream',
          data: encoded,
          caption: inputReply.trim()
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo enviar el archivo');
      setInputReply('');
      await fetchConversations();
    } catch (error) {
      alert(`Error adjuntando archivo: ${error.message}`);
    } finally {
      setSendingFile(false);
    }
  };

  const updateContact = async (fields) => {
    if (!selectedConv) return;
    try {
      await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedConv.id, ...fields }),
      });
      fetchConversations();
    } catch (err) {
      console.error(err);
    }
  };

  const handleRename = async (conv, e) => {
    e?.stopPropagation();
    const currentName = conv.name || conv.phone;
    const newName = prompt(`Nuevo nombre para "${currentName}":`, currentName);
    if (!newName || !newName.trim() || newName.trim() === currentName) return;
    try {
      await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conv.id, name: newName.trim() }),
      });
      fetchConversations();
    } catch (err) {}
  };

  const handleDelete = async (conv, e) => {
    e?.stopPropagation();
    const confirmacion = prompt(`⚠️ ¿Borrar "${conv.name || conv.phone}" definitivamente?\nEscribí "BORRAR" para confirmar:`);
    if (confirmacion !== 'BORRAR') return;
    try {
      await fetch('/api/conversations', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: conv.id }),
      });
      if (String(selectedId) === String(conv.id)) setSelectedId(null);
      fetchConversations();
    } catch (err) {}
  };

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.lastMessage || '').toLowerCase().includes(q)
    );
  }, [conversations, searchQuery]);

  const getVendedorName = (userId) => {
    if (!userId) return 'Sin asignar';
    const v = vendedores.find((v) => v.id === userId);
    return v ? (v.name || v.email) : `#${userId}`;
  };

  if (status === 'loading' || !session) {
    return <div style={styles.loadingScreen}>Cargando...</div>;
  }

  const renderInbox = () => (
    <aside
      className="col-inbox dcam-inbox"
      style={{
        ...styles.colInboxBg,
        display: isMobile && mobileView !== 'inbox' ? 'none' : 'flex',
      }}
    >
      <div style={styles.inboxHeader}>
        <div className="dcam-section-title"><span>💬</span><div><strong>Conversaciones</strong><small>Gestioná tus contactos en un solo lugar</small></div><b>{conversations.length}</b></div>
        <input
          type="text"
          placeholder="🔍  Buscar contactos..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />
      </div>
      <div className="dcam-inbox-list" style={styles.list}>
        {loading && conversations.length === 0 && <div style={styles.emptyState}>Cargando...</div>}
        {!loading && filteredConversations.length === 0 && (
          <div style={styles.emptyState}>
            <div style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4 }}>📭</div>
            <span>No hay conversaciones</span>
          </div>
        )}
        {filteredConversations.map((conv) => {
          const isSelected = String(conv.id) === String(selectedId);
          const isHovered = hoveredId === conv.id;
          return (
            <div
              key={conv.id}
              onClick={() => handleSelectConv(conv.id)}
              onMouseEnter={() => setHoveredId(conv.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                ...styles.convItem,
                background: isSelected ? 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(6,182,212,0.06))' : 'transparent',
                borderLeft: isSelected ? '3px solid #8b5cf6' : '3px solid transparent',
              }}
            >
              <div style={styles.avatar}>{(conv.name || 'C').charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={styles.convTop}>
                  <strong style={styles.convName}>
                    <span
                      style={{
                        display: 'inline-block',
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: conv.botActive !== false ? '#22c55e' : '#ef4444',
                        marginRight: '6px',
                      }}
                    />
                    {conv.name || conv.phone}
                  </strong>
                  <span style={styles.convTime}>{conv.time}</span>
                </div>
                <div style={styles.convPhone}>{conv.phone?.includes('+') ? conv.phone : `+${conv.phone}`}</div>
                <p style={styles.convSnippet}>{conv.lastMessage || 'Sin mensajes'}</p>
                <div style={{ marginTop: '5px', display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      ...styles.statusBadge,
                      background: STATUS_COLORS[conv.status]?.bg || 'rgba(51,65,85,0.4)',
                      color: STATUS_COLORS[conv.status]?.color || '#94a3b8',
                      border: `1px solid ${STATUS_COLORS[conv.status]?.border || 'rgba(51,65,85,0.6)'}`,
                    }}
                  >
                    {conv.status}
                  </span>
                  {conv.assignedTo && <span style={styles.assignedBadge}>👤 {getVendedorName(conv.assignedTo)}</span>}
                </div>
              </div>
              {isMobile ? (
                <div style={styles.convActions}>
                  <button onClick={(e) => handleRename(conv, e)} style={styles.actionBtn}>✏️</button>
                  <button onClick={(e) => handleDelete(conv, e)} style={{ ...styles.actionBtn, ...styles.actionBtnDanger }}>🗑️</button>
                </div>
              ) : (
                isHovered && (
                  <div style={styles.convActions}>
                    <button onClick={(e) => handleRename(conv, e)} style={styles.actionBtn}>✏️</button>
                    <button onClick={(e) => handleDelete(conv, e)} style={{ ...styles.actionBtn, ...styles.actionBtnDanger }}>🗑️</button>
                  </div>
                )
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );

  const renderChat = () => (
    <section
      className="col-chat dcam-chat"
      style={{
        ...styles.colChatBg,
        display: isMobile && mobileView !== 'chat' ? 'none' : 'flex',
      }}
    >
      {selectedConv ? (
        <>
          <div className="dcam-conv-header" style={styles.chatHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
              {isMobile && (
                <button onClick={() => setMobileView('inbox')} style={styles.btnBack} aria-label="Volver">
                  ←
                </button>
              )}
              <div style={{ ...styles.avatar, width: '38px', height: '38px', fontSize: '15px', flexShrink: 0 }}>
                {(selectedConv.name || 'C').charAt(0).toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <h3 style={styles.chatTitle}>{selectedConv.name || selectedConv.phone}</h3>
                <span style={styles.chatPhone}>{selectedConv.phone?.includes('+') ? selectedConv.phone : `+${selectedConv.phone}`}</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {!isMobile && (
                <button onClick={(e) => handleRename(selectedConv, e)} style={styles.btnRename}>✏️</button>
              )}
              <button title="Analizar y recuperar prospecto" onClick={() => setActiveTab('recuperacion')} style={styles.btnRename}>🎯</button>
              <button
                onClick={() => updateContact({ botActive: !(selectedConv.botActive !== false) })}
                style={{
                  ...styles.btnToggleBot,
                  background: selectedConv.botActive !== false ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  borderColor: selectedConv.botActive !== false ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)',
                  color: selectedConv.botActive !== false ? '#4ade80' : '#f87171',
                }}
              >
                {selectedConv.botActive !== false ? (isMobile ? '🤖' : '🤖 IA Activa') : (isMobile ? '⏸️' : '⏸️ IA Pausada')}
              </button>
              {isMobile && (
                <button onClick={() => setMobileFormOpen(true)} style={styles.btnRename} aria-label="Ficha">
                  📋
                </button>
              )}
            </div>
          </div>

          {/* ÁREA DE MENSAJES CORREGIDA */}
          <div className="dcam-messages" style={styles.messagesArea}>
            {(!selectedConv.messages || selectedConv.messages.length === 0) && (
              <div style={styles.emptyChat}>
                <div style={{ fontSize: '44px', opacity: 0.15 }}>💬</div>
                <div style={{ color: '#475569', fontSize: '13px', marginTop: '10px' }}>Sin mensajes todavía</div>
              </div>
            )}
            {(selectedConv.messages || []).map((m) => (
              <div
                key={m.id}
                style={{
                  ...styles.bubble,
                  alignSelf: m.sender === 'me' ? 'flex-end' : 'flex-start',
                  background:
                    m.sender === 'me'
                      ? 'linear-gradient(135deg, #7c3aed, #6d28d9)'
                      : 'linear-gradient(135deg, rgba(30,41,59,0.9), rgba(15,23,42,0.9))',
                  border:
                    m.sender === 'me'
                      ? '1px solid rgba(139,92,246,0.3)'
                      : '1px solid rgba(51,65,85,0.6)',
                }}
              >
                {m.mediaType === 'audio' && m.mediaId && (
                  <audio controls preload="none" style={{ width: 'min(280px, 68vw)', maxWidth: '100%' }}
                    src={`/api/media-file?id=${encodeURIComponent(m.id)}`} />
                )}
                {m.mediaType === 'image' && m.mediaId && (
                  <a href={`/api/media-file?id=${encodeURIComponent(m.id)}`} target="_blank" rel="noreferrer">
                    <img src={`/api/media-file?id=${encodeURIComponent(m.id)}`} alt={m.mediaName || 'Imagen adjunta'}
                      style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 9, display: 'block', marginBottom: 6 }} />
                  </a>
                )}
                {m.text && <p style={{ margin: '5px 0', fontSize: '13.5px', lineHeight: 1.5, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>{m.text}</p>}
                {m.mediaId && (
                  <a href={`/api/media-file?id=${encodeURIComponent(m.id)}&download=1`}
                    style={{ display: 'inline-flex', gap: 7, color: '#bfdbfe', fontSize: 12, marginTop: 6, alignItems: 'center', overflowWrap: 'anywhere' }}>
                    ⬇ {m.mediaName || (m.mediaType === 'audio' ? 'Descargar audio' : 'Descargar archivo')}
                  </a>
                )}
                <span style={styles.bubbleTime}>{m.time}</span>
              </div>
            ))}
            <div ref={chatBottomRef} style={{ height: 1, flexShrink: 0 }} />
          </div>

          <form onSubmit={handleSend} style={styles.chatInputBar}>
            <input ref={attachmentInputRef} type="file" hidden
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip"
              onChange={sendAttachment} />
            <button type="button" title="Adjuntar imagen, audio o documento"
              onClick={() => attachmentInputRef.current?.click()}
              disabled={sendingFile} style={{ ...styles.btnSend, width: 39, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.4)' }}>
              {sendingFile ? '…' : '📎'}
            </button>
            <input
              type="text"
              placeholder="Escribí un mensaje..."
              value={inputReply}
              onChange={(e) => setInputReply(e.target.value)}
              style={styles.inputMessage}
            />
            <button type="submit" style={styles.btnSend} disabled={!inputReply.trim()}>
              ➤
            </button>
          </form>
        </>
      ) : (
        <div style={styles.emptyChat}>
          <div style={{ fontSize: '56px', opacity: 0.15 }}>👈</div>
          <div style={{ color: '#475569', marginTop: '10px' }}>Seleccioná una conversación</div>
        </div>
      )}
    </section>
  );

  const renderForm = () => (
    <aside
      className="col-form dcam-quote"
      style={{
        ...styles.colFormBg,
        display: isMobile && !mobileFormOpen ? 'none' : 'flex',
        position: isMobile ? 'fixed' : 'relative',
        top: isMobile ? 0 : undefined,
        left: isMobile ? 0 : undefined,
        right: isMobile ? 0 : undefined,
        bottom: isMobile ? 0 : undefined,
        zIndex: isMobile ? 100 : undefined,
      }}
    >
      <div className="dcam-form-header" style={styles.formHeader}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            {isMobile && (
              <button onClick={() => setMobileFormOpen(false)} style={styles.btnBack} aria-label="Cerrar">
                ←
              </button>
            )}
            <span style={styles.formIcon}>📋</span>
            <strong style={styles.formTitle}>FICHA DE COTIZACIÓN</strong>
          </div>
          <button
            onClick={handleTriggerSolAI}
            disabled={loadingAi}
            style={{
              background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
              color: '#c7d2fe',
              border: '1px solid #4338ca',
              padding: '6px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: loadingAi ? 'wait' : 'pointer',
              opacity: loadingAi ? 0.7 : 1,
              flexShrink: 0,
            }}
          >
            {loadingAi ? '⏳ ...' : isMobile ? '⚡ Sol' : '⚡ Sol: Autocompletar'}
          </button>
        </div>
      </div>
      <div className="dcam-form-scroll" style={styles.formScroll}>
        <Field label="Cliente / Razón Social">
          <input
            type="text"
            value={formData.clientName || ''}
            onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
            style={styles.fieldInput}
            placeholder="Nombre del cliente"
          />
        </Field>
        <Field label="Producto / Mercadería">
          <input
            type="text"
            value={formData.product || ''}
            onChange={(e) => setFormData({ ...formData, product: e.target.value })}
            style={styles.fieldInput}
            placeholder="Descripción del producto"
          />
        </Field>
        <div style={styles.twoCols}>
          <Field label="Peso (kg)">
            <input
              type="number"
              value={formData.weightKg || ''}
              onChange={(e) => setFormData({ ...formData, weightKg: e.target.value })}
              style={styles.fieldInput}
              placeholder="kg"
            />
          </Field>
          <Field label="CBM (m³)">
            <input
              type="number"
              value={formData.cbm || ''}
              onChange={(e) => setFormData({ ...formData, cbm: e.target.value })}
              style={styles.fieldInput}
              placeholder="m³"
            />
          </Field>
        </div>
        <Field label="Valor FOB (USD)">
          <input
            type="number"
            value={formData.goodsValue || ''}
            onChange={(e) => setFormData({ ...formData, goodsValue: e.target.value })}
            style={styles.fieldInput}
            placeholder="USD"
          />
        </Field>
        <Field label="Notas Operativas">
          <textarea
            value={formData.notes || ''}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            style={styles.fieldTextarea}
            placeholder="Detalles adicionales..."
          />
        </Field>

        <button onClick={() => updateContact({ quoteData: formData })} style={styles.btnSave}>
          💾 Guardar Ficha
        </button>

        <div style={styles.divider} />

        <Field label="Estado del Lead">
          <select
            value={selectedConv?.status || 'Entrante'}
            onChange={(e) => updateContact({ status: e.target.value })}
            style={styles.fieldSelect}
          >
            {ESTADOS.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Asignado a">
          <select
            value={selectedConv?.assignedTo || ''}
            onChange={(e) => updateContact({ assignedTo: e.target.value ? Number(e.target.value) : null })}
            style={styles.fieldSelect}
          >
            <option value="">Sin asignar</option>
            {vendedores.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name || v.email}
              </option>
            ))}
          </select>
        </Field>

        {isMobile && (
          <button onClick={() => setMobileFormOpen(false)} style={styles.btnSave}>
            ✓ Listo
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <div style={styles.container}>
      <style jsx global>{`
        html, body {
          height: 100%;
          overflow: hidden;
          overscroll-behavior-y: none;
        }
        #__next {
          height: 100%;
          display: flex;
          flex-direction: column;
        }
        input, select, textarea {
          font-size: 16px !important;
        }
        @media (min-width: 901px) {
          input, select, textarea {
            font-size: 12.5px !important;
          }
        }
        * {
          -webkit-tap-highlight-color: transparent;
        }
      `}</style>

      <div style={styles.bgGlow1} />
      <div style={styles.bgGlow2} />

      <header style={{ ...styles.header, ...(isMobile ? styles.headerMobile : {}) }}>
        <div style={{ ...styles.brand, gap: isMobile ? '10px' : '14px' }}>
          <div style={{ ...styles.logoBox, width: isMobile ? '36px' : '44px', height: isMobile ? '36px' : '44px' }}>
            <img src="/logo.png" alt="DCAM" style={styles.logo} />
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ ...styles.title, fontSize: isMobile ? '13px' : '15px' }}>CRM DCAM</h1>
            {!isMobile && (
              <span style={styles.subtitle}>
                {session?.user?.name || session?.user?.email} · {session?.user?.role}
              </span>
            )}
          </div>
        </div>

        <nav style={{ ...styles.tabs, gap: isMobile ? '4px' : '6px' }}>
          <button
            onClick={() => setActiveTab('chat')}
            style={{ ...(activeTab === 'chat' ? styles.tabActive : styles.tab), ...(isMobile ? styles.tabMobile : {}) }}
          >
            {isMobile ? '💬' : '💬 Chat'}
          </button>
          <button
            onClick={() => setActiveTab('kanban')}
            style={{ ...(activeTab === 'kanban' ? styles.tabActive : styles.tab), ...(isMobile ? styles.tabMobile : {}) }}
          >
            {isMobile ? '📊' : '📊 Kanban'}
          </button>
          <button
            onClick={() => setActiveTab('asistente')}
            style={{ ...(activeTab === 'asistente' ? styles.tabActive : styles.tab), ...(isMobile ? styles.tabMobile : {}) }}
          >
            {isMobile ? '✨' : '✨ Asistente IA'}
          </button>
          <button
            onClick={() => setActiveTab('recuperacion')}
            style={{ ...(activeTab === 'recuperacion' ? styles.tabActive : styles.tab), ...(isMobile ? styles.tabMobile : {}) }}
          >
            {isMobile ? '🎯' : '🎯 Recuperación'}
          </button>
        </nav>

        <div style={styles.headerRight}>
          <button
            onClick={handleGlobalKillSwitch}
            style={{
              ...styles.btnDisyuntor,
              background: isGlobalBotActive ? '#ef4444' : '#10b981',
              boxShadow: isGlobalBotActive ? '0 0 12px rgba(239, 68, 68, 0.6)' : 'none',
              ...(isMobile ? styles.btnMobile : {})
            }}
          >
            {isGlobalBotActive ? (isMobile ? '🛑' : '🛑 FRENAR IA (GLOBAL)') : (isMobile ? '▶️' : '▶️ REACTIVAR IA')}
          </button>

          {!isMobile && (
            <div style={styles.statPill}>
              <span style={styles.statDot} />
              <span>{conversations.length} contactos</span>
            </div>
          )}
          {session?.user?.role === 'admin' && (
            <button onClick={() => router.push('/admin')} style={{ ...styles.btnAdmin, ...(isMobile ? styles.btnMobile : {}) }}>
              {isMobile ? '👥' : '👥 Usuarios'}
            </button>
          )}
          <button onClick={() => signOut({ callbackUrl: '/login' })} style={{ ...styles.btnLogout, ...(isMobile ? styles.btnMobile : {}) }}>
            {isMobile ? '⏏️' : 'Salir'}
          </button>
        </div>
      </header>

      {activeTab === 'chat' && (
        <main className="dcam-chat-layout" style={styles.responsiveGrid}>
          {renderInbox()}
          {renderChat()}
          {renderForm()}
        </main>
      )}

      {activeTab === 'kanban' && <KanbanTab conversations={conversations} />}
      {activeTab === 'asistente' && <AsistenteIATab />}
      {activeTab === 'recuperacion' && <RecuperacionTab conversations={conversations} onOpenChat={handleOpenRecoveryChat} />}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '10.5px', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.3px' }}>{label}</label>
      {children}
    </div>
  );
}

const styles = {
  loadingScreen: {
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#05070d',
    color: '#64748b',
  },
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'linear-gradient(130deg, #060d20 0%, #070e20 55%, #090a23 100%)',
    color: '#e2e8f0',
    overflow: 'hidden',
    position: 'relative',
  },
responsiveGrid: {
  flex: 1,
  display: 'flex',
  flexDirection: 'row',
  minHeight: 0,
  overflow: 'hidden',
  zIndex: 1,
  position: 'relative',
},
  bgGlow1: {
    position: 'fixed',
    top: '-20%',
    left: '-10%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)',
    filter: 'blur(60px)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  bgGlow2: {
    position: 'fixed',
    bottom: '-20%',
    right: '-10%',
    width: '600px',
    height: '600px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(6,182,212,0.1), transparent 70%)',
    filter: 'blur(60px)',
    pointerEvents: 'none',
    zIndex: 0,
  },
  header: {
    height: '64px',
    background: 'rgba(8,16,37,0.95)',
    backdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(51,65,85,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    flexShrink: 0,
    zIndex: 10,
    position: 'relative',
  },
  headerMobile: {
    padding: '8px 10px',
    gap: '8px',
    height: 'auto',
    minHeight: '60px',
    flexWrap: 'nowrap',
  },
  brand: { display: 'flex', alignItems: 'center' },
  logoBox: {
    borderRadius: '12px',
    background: 'rgba(15,23,42,0.7)',
    border: '1px solid rgba(139,92,246,0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  logo: { width: '100%', height: '100%', objectFit: 'contain', padding: '4px' },
  title: { fontWeight: 800, margin: 0, color: '#f1f5f9' },
  subtitle: { fontSize: '10.5px', color: '#64748b' },
  tabs: { display: 'flex' },
  tab: {
    background: 'rgba(30,41,59,0.6)',
    color: '#94a3b8',
    border: '1px solid rgba(51,65,85,0.6)',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  tabActive: {
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    color: '#fff',
    border: '1px solid rgba(139,92,246,0.5)',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(139,92,246,0.3)',
  },
  tabMobile: {
    padding: '8px 10px',
    fontSize: '16px',
  },
  headerRight: { display: 'flex', gap: '10px', alignItems: 'center' },
  statPill: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11.5px',
    fontWeight: 600,
    background: 'rgba(30,41,59,0.6)',
    color: '#94a3b8',
    padding: '6px 14px',
    borderRadius: '20px',
    border: '1px solid rgba(51,65,85,0.6)',
  },
  statDot: { width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' },
  btnAdmin: {
    background: 'rgba(6,182,212,0.15)',
    color: '#67e8f9',
    border: '1px solid rgba(6,182,212,0.3)',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnLogout: {
    background: 'rgba(239,68,68,0.15)',
    color: '#f87171',
    border: '1px solid rgba(239,68,68,0.3)',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnDisyuntor: {
    color: '#ffffff',
    border: 'none',
    padding: '6px 14px',
    borderRadius: '8px',
    fontSize: '11.5px',
    fontWeight: 800,
    cursor: 'pointer',
  },
  btnMobile: { padding: '8px 10px', fontSize: '16px' },

  colInboxBg: { 
    background: 'rgba(10,15,28,0.6)', 
    backdropFilter: 'blur(10px)', 
    flexDirection: 'column',
    width: 'clamp(270px,23vw,370px)',
    borderRight: '1px solid rgba(51,65,85,0.4)'
  },
colChatBg: { 
  background: 'rgba(5,7,13,0.4)', 
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  minHeight: 0,
  borderRight: '1px solid rgba(51,65,85,0.4)',
  overflow: 'hidden'
},
  colFormBg: { 
    background: 'rgba(10,15,28,0.6)', 
    backdropFilter: 'blur(10px)', 
    flexDirection: 'column',
    width: 'clamp(310px,26vw,410px)'
  },

  inboxHeader: { padding: '14px', borderBottom: '1px solid rgba(51,65,85,0.3)', flexShrink: 0 },
  searchInput: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(30,41,59,0.5)',
    border: '1px solid rgba(51,65,85,0.6)',
    borderRadius: '10px',
    color: '#e2e8f0',
    outline: 'none',
    boxSizing: 'border-box',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    minHeight: 0,
  },
  emptyState: { padding: '60px 20px', textAlign: 'center', fontSize: '13px', color: '#64748b' },
  convItem: {
    display: 'flex',
    gap: '12px',
    padding: '14px',
    cursor: 'pointer',
    borderBottom: '1px solid rgba(51,65,85,0.25)',
    transition: 'background 0.15s',
    position: 'relative',
  },
  convActions: { position: 'absolute', top: '10px', right: '15px', display: 'flex', gap: '5px', zIndex: 10 },
  actionBtn: {
    width: '30px',
    height: '30px',
    borderRadius: '6px',
    background: 'rgba(30,41,59,0.9)',
    border: '1px solid rgba(51,65,85,0.7)',
    cursor: 'pointer',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    color: '#e2e8f0',
  },
  actionBtnDanger: { background: 'rgba(127,29,29,0.9)', border: '1px solid rgba(239,68,68,0.5)' },
  avatar: {
    width: '42px',
    height: '42px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '16px',
    flexShrink: 0,
  },
  convTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' },
  convName: {
    fontSize: '13px',
    color: '#f1f5f9',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '180px',
  },
  convTime: { fontSize: '10px', color: '#64748b' },
  convPhone: { fontSize: '11px', color: '#64748b', marginBottom: '3px' },
  convSnippet: { margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  statusBadge: { fontSize: '9.5px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px', display: 'inline-block' },
  assignedBadge: {
    fontSize: '9.5px',
    fontWeight: 600,
    padding: '3px 8px',
    borderRadius: '20px',
    background: 'rgba(6,182,212,0.12)',
    color: '#67e8f9',
    border: '1px solid rgba(6,182,212,0.3)',
    display: 'inline-block',
  },
  chatHeader: {
    padding: '14px 20px',
    background: 'rgba(15,23,42,0.7)',
    borderBottom: '1px solid rgba(51,65,85,0.4)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    height: '65px'
  },
  btnBack: {
    background: 'rgba(30,41,59,0.8)',
    border: '1px solid rgba(51,65,85,0.6)',
    color: '#e2e8f0',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '16px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  chatTitle: { margin: 0, fontSize: '14.5px', color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  chatPhone: { fontSize: '11.5px', color: '#64748b' },
  btnRename: {
    background: 'rgba(139,92,246,0.15)',
    border: '1px solid rgba(139,92,246,0.4)',
    color: '#c4b5fd',
    padding: '7px 12px',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  btnToggleBot: { border: '1px solid', padding: '7px 14px', borderRadius: '8px', fontSize: '11.5px', fontWeight: 700, cursor: 'pointer' },
messagesArea: {
  flex: '1 1 0',
  minHeight: 0,
  overflowY: 'scroll',
  overflowX: 'hidden',
  WebkitOverflowScrolling: 'touch',
  padding: '20px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
},
  emptyChat: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b' },
  bubble: { maxWidth: '78%', padding: '11px 15px', borderRadius: '16px' },
  bubbleTime: { display: 'block', textAlign: 'right', fontSize: '9.5px', color: 'rgba(255,255,255,0.5)', marginTop: '5px' },
  chatInputBar: {
    padding: '12px 16px',
    paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
    background: 'rgba(15,23,42,0.7)',
    borderTop: '1px solid rgba(51,65,85,0.4)',
    display: 'flex',
    gap: '12px',
    flexShrink: 0,
    height: '70px'
  },
  inputMessage: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(30,41,59,0.5)',
    border: '1px solid rgba(51,65,85,0.6)',
    borderRadius: '12px',
    color: '#e2e8f0',
    outline: 'none',
    minWidth: 0,
  },
  btnSend: {
    width: '46px',
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '16px',
    flexShrink: 0,
  },
  formHeader: { padding: '14px 20px', borderBottom: '1px solid rgba(51,65,85,0.4)', flexShrink: 0 },
  formIcon: { fontSize: '16px' },
  formTitle: { fontSize: '11.5px', color: '#f1f5f9', letterSpacing: '0.8px' },
  formScroll: {
    flex: 1,
    overflowY: 'auto',
    overflowX: 'hidden',
    WebkitOverflowScrolling: 'touch',
    padding: '18px 20px',
    paddingBottom: 'calc(24px + env(safe-area-inset-bottom, 0px))',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    minHeight: 0,
  },
  fieldInput: {
    width: '100%',
    padding: '10px 13px',
    background: 'rgba(30,41,59,0.5)',
    border: '1px solid rgba(51,65,85,0.6)',
    borderRadius: '10px',
    color: '#f1f5f9',
    outline: 'none',
    boxSizing: 'border-box',
  },
  fieldSelect: {
    width: '100%',
    padding: '10px 13px',
    background: 'rgba(30,41,59,0.5)',
    border: '1px solid rgba(51,65,85,0.6)',
    borderRadius: '10px',
    color: '#f1f5f9',
    outline: 'none',
  },
  fieldTextarea: {
    width: '100%',
    padding: '10px 13px',
    background: 'rgba(30,41,59,0.5)',
    border: '1px solid rgba(51,65,85,0.6)',
    borderRadius: '10px',
    color: '#f1f5f9',
    outline: 'none',
    resize: 'vertical',
    minHeight: '70px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
  },
  twoCols: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' },
  btnSave: {
    padding: '12px',
    background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '4px',
  },
  divider: { height: '1px', background: 'rgba(51,65,85,0.4)', margin: '6px 0' },
};
