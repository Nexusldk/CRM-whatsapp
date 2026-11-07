import { useState, useRef, useEffect } from 'react';

export default function AsistenteIATab() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMsg }),
      });

      const data = await res.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: 'ai', text: data.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: 'ai', text: 'Error: ' + (data.error || 'sin respuesta') }]);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Error de conexión' }]);
    } finally {
      setLoading(false);
    }
  };

  const quick=[['🧮','Calcular CBM','Calculame el CBM de una caja de 50x40x30 cm'],['📃','Consultar PA / NCM','¿Cuál es la posición arancelaria de un motor eléctrico?'],['✉️','Mail al proveedor','Redactame un mail para un proveedor en China pidiendo proforma'],['📋','Resumen de cotización','Ayudame a resumir una cotización de importación'],['🌐','Traducir mensaje','Traducí al chino: buenos días, necesito una cotización'],['💡','Otras consultas','Explicame la diferencia entre FOB y CIF']];
  return <div className="dcam-assistant">
    <aside className="dcam-assistant-left"><div className="dcam-surface dcam-assistant-actions"><strong>⚡ Acciones rápidas</strong><small className="dcam-muted">Elegí una tarea comercial</small>{quick.map(([icon,label,prompt])=><button key={label} className="dcam-assistant-action" onClick={()=>setInput(prompt)}>{icon} &nbsp; {label} <span style={{float:'right'}}>›</span></button>)}</div><div className="dcam-surface" style={{padding:15}}><strong>📖 Ejemplos de uso</strong><p className="dcam-muted" style={{fontSize:12,marginTop:10}}>CBM, clasificación arancelaria, traducciones y correos para proveedores.</p></div></aside>
    <section className="dcam-surface dcam-assistant-center"><header style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:16,borderBottom:'1px solid #263958'}}><div><strong>✨ Asistente Gemini</strong><div className="dcam-muted" style={{fontSize:11,marginTop:4}}>Consultas rápidas de comercio internacional</div></div><button className="dcam-assistant-action" style={{padding:9}} onClick={()=>setMessages([])} disabled={loading}>Limpiar chat</button></header><div className="dcam-assistant-history">{messages.length===0&&<div style={{margin:'auto',textAlign:'center',color:'#8da4cb'}}><div style={{fontSize:40}}>✨</div><strong>¿En qué te puedo ayudar?</strong><p style={{fontSize:12,marginTop:8}}>Elegí una acción rápida o escribí tu consulta.</p></div>}{messages.map((m,i)=><div key={i} style={{maxWidth:'84%',alignSelf:m.role==='user'?'flex-end':'flex-start',padding:14,borderRadius:13,whiteSpace:'pre-wrap',fontSize:13,lineHeight:1.6,background:m.role==='user'?'linear-gradient(135deg,#7934ef,#581fc7)':'#142342',border:'1px solid #334669'}}>{m.text}</div>)}{loading&&<p className="dcam-muted">Gemini está preparando la respuesta…</p>}<div ref={bottomRef}/></div><form className="dcam-assistant-input" onSubmit={handleSend}><input value={input} onChange={e=>setInput(e.target.value)} placeholder="Escribí tu consulta…" disabled={loading}/><button className="dcam-btn" disabled={loading||!input.trim()}>➤</button></form></section>
    <aside className="dcam-assistant-right"><div className="dcam-surface" style={{padding:16}}><strong>🎯 Herramientas comerciales</strong><p className="dcam-muted" style={{fontSize:12,margin:'9px 0'}}>Gestioná tus importaciones con respuestas rápidas.</p>{quick.slice(0,5).map(([icon,label,prompt])=><button className="dcam-assistant-action" key={label} style={{width:'100%',marginTop:8}} onClick={()=>setInput(prompt)}>{icon} {label}</button>)}</div><div className="dcam-surface" style={{padding:16}}><strong>🔒 Asistencia privada</strong><p className="dcam-muted" style={{fontSize:12,marginTop:10}}>Las respuestas se generan al solicitarlo. Revisá clasificaciones y condiciones antes de compartirlas.</p></div></aside>
  </div>;
}
