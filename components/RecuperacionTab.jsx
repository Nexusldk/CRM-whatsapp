import {useMemo,useState} from 'react';
const panel={background:'#111827',border:'1px solid #293449',borderRadius:12,padding:16};
const button={background:'#6d28d9',color:'#fff',border:0,borderRadius:9,padding:'10px 14px',cursor:'pointer',fontWeight:700};
export default function RecuperacionTab({conversations=[],onOpenChat}){
  const [search,setSearch]=useState('');
  const [status,setStatus]=useState('Todos');
  const [selected,setSelected]=useState(null);
  const [loading,setLoading]=useState(false);
  const [analysis,setAnalysis]=useState({});
  const [draft,setDraft]=useState('');
  const [error,setError]=useState('');
  const statuses=['Todos',...new Set(conversations.map(c=>c.status).filter(Boolean))];
  const rows=useMemo(()=>conversations.filter(c=>(status==='Todos'||c.status===status)&&(`${c.name||''} ${c.phone||''} ${c.lastMessage||''}`.toLowerCase().includes(search.toLowerCase()))),[conversations,status,search]);
  const chosen=conversations.find(c=>String(c.id)===String(selected));
  const result=analysis[String(selected)];
  async function analyze(c){
    setSelected(c.id);setLoading(true);setError('');setDraft('');
    try{
      const r=await fetch('/api/recovery-analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contactId:c.id})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'Error analizando');
      setAnalysis(p=>({...p,[String(c.id)]:d}));setDraft(d.mensaje_sugerido||'');
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  const input={background:'#09101e',color:'#e2e8f0',border:'1px solid #334155',borderRadius:8,padding:10,minWidth:0};
  return <div className="dcam-recovery">
    <div className="dcam-recovery-head">
      <div><h2 style={{margin:0}}>✨ Recuperación de prospectos</h2><p style={{fontSize:12,color:'#94a3b8'}}>Analizá el historial y prepará seguimientos. Nunca se envían automáticamente.</p></div>
      <a href="/api/export-chats" download style={{...button,textDecoration:'none'}}>⬇ Exportar todos los chats (CSV)</a>
    </div>
    <div className="dcam-recovery-stats">
      <div className="dcam-recovery-stat"><span>👥</span><div><small>Contactos visibles</small><strong>{conversations.length}</strong></div></div>
      <div className="dcam-recovery-stat"><span>🔎</span><div><small>Analizados en esta sesión</small><strong>{Object.keys(analysis).length}</strong></div></div>
      <div className="dcam-recovery-stat"><span>🎯</span><div><small>Prioridad alta detectada</small><strong>{Object.values(analysis).filter(a=>a.prioridad==='alta').length}</strong></div></div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(340px,1.35fr) minmax(300px,1fr)',gap:14}} className="recovery-layout">
      <div style={panel}>
        <div style={{display:'flex',gap:8,marginBottom:12,flexWrap:'wrap'}}><input aria-label="Buscar prospecto" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar contacto o mensaje..." style={{...input,flex:1}}/><select value={status} onChange={e=>setStatus(e.target.value)} style={input}>{statuses.map(s=><option key={s}>{s}</option>)}</select></div>
        <div style={{maxHeight:'min(66vh,750px)',overflowY:'auto'}}><div className="dcam-recovery-row dcam-recovery-tablehead"><span>Cliente / Razón Social</span><span>Estado</span><span>Último mensaje</span><span>Acciones</span></div>{rows.map(c=><div key={c.id} className="dcam-recovery-row" style={{background:String(c.id)===String(selected)?'#241c51':'transparent',borderLeft:String(c.id)===String(selected)?'3px solid #9255ff':'3px solid transparent'}}>
          <div style={{minWidth:0}}><b>{c.name||c.phone}</b><div className="dcam-muted" style={{fontSize:10}}>{c.phone}</div></div><span className="r-status" style={{fontSize:11,color:'#c6b1ff'}}>{c.status||'Sin estado'}</span><p className="r-last dcam-muted" style={{overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',fontSize:11}}>{String(c.lastMessage||'Sin mensajes').slice(0,80)}</p><div className="actions"><button style={{...button,background:'#253853',padding:'8px'}} onClick={()=>onOpenChat(c.id)}>Ver chat</button><button style={{...button,padding:'8px'}} disabled={loading} onClick={()=>analyze(c)}>✨ Analizar</button></div>
        </div>)}{!rows.length&&<p>No hay coincidencias.</p>}</div>
      </div>
      <div className="dcam-recovery-side" style={{...panel,alignSelf:'start',background:'#0b1730',borderColor:'#314366',padding:18}}>
        <h3 style={{marginTop:0,fontSize:18}}>✨ Análisis de Sol</h3>
        {!chosen&&<p style={{color:'#94a3b8'}}>Elegí «Analizar» en un contacto para ver la evaluación y el mensaje sugerido.</p>}
        {chosen&&<><p style={{fontSize:12,color:'#94a3b8'}}>Contacto: {chosen.name||chosen.phone}</p>{loading&&<p>Analizando historial…</p>}{error&&<p role="alert" style={{color:'#fca5a5'}}>{error}</p>}
          {result&&<><div className="dcam-recovery-section"><b>🎯 Prioridad:</b> {result.prioridad}</div><div className="dcam-recovery-section"><b>📋 Resumen del historial</b><p>{result.resumen}</p></div><div className="dcam-recovery-section"><b>⚠️ Posible objeción</b><p>{result.objecion||'No identificada'}</p></div><div className="dcam-recovery-section"><b>💡 Estrategia sugerida</b><p>{result.estrategia}</p></div>
            {result.no_contactar?<p style={{color:'#fca5a5'}}>⛔ Este cliente no debe recibir mensajes de recuperación.</p>:<><b>Borrador sugerido (editable)</b><textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={6} style={{...input,width:'100%',boxSizing:'border-box',marginTop:8,resize:'vertical'}}/><div style={{display:'flex',gap:8,flexWrap:'wrap',marginTop:10}}><button style={button} onClick={()=>navigator.clipboard.writeText(draft)}>Copiar borrador</button><button style={{...button,background:'#293449'}} onClick={()=>onOpenChat(chosen.id,draft)}>Usar en chat (sin enviar)</button></div></>}
            <p style={{fontSize:11,color:'#94a3b8'}}>Basado en {result.mensajesAnalizados} mensajes disponibles. Verificá la propuesta antes de contactar al cliente.</p>
          </>}</>}
      </div>
    </div>
    <style jsx>{`@media(max-width:850px){.recovery-layout{grid-template-columns:1fr!important}}`}</style>
  </div>;
}
