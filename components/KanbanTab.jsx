import { useMemo, useState, useRef } from 'react';

const COLUMNAS = [
  { key: 'entrante', title: 'ENTRANTE', color: '#f43f5e', statuses: ['Entrante', 'Nuevo Lead'] },
  { key: 'faltan_datos', title: 'FALTAN DATOS', color: '#f59e0b', statuses: ['Faltan Datos', 'Cotización Pendiente'] },
  { key: 'cotizado', title: 'COTIZADO', color: '#8b5cf6', statuses: ['Cotizado'] },
  { key: 'pre_cierre', title: 'PRE-CIERRE', color: '#06b6d4', statuses: ['Pre-Cierre', 'Esperando Pago'] },
  { key: 'cliente_cerrado', title: 'CLIENTE CERRADO', color: '#f97316', statuses: ['Cliente Cerrado', 'Carga en Tránsito'] },
  { key: 'cliente_finalizado', title: 'CLIENTE FINALIZADO', color: '#22c55e', statuses: ['Cliente Finalizado', 'Cerrado'] },
];

export default function KanbanTab({ conversations }) {
  const [hoveredCard, setHoveredCard] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const tooltipRef = useRef(null);

  const grouped = useMemo(() => {
    const groups = {
      entrante: [],
      faltan_datos: [],
      cotizado: [],
      pre_cierre: [],
      cliente_cerrado: [],
      cliente_finalizado: [],
    };

    conversations.forEach((c) => {
      const status = c.status || 'Entrante';
      const col = COLUMNAS.find((col) => col.statuses.includes(status));
      if (col) {
        groups[col.key].push(c);
      } else {
        groups.entrante.push(c);
      }
    });

    return groups;
  }, [conversations]);

  const handleMouseMove = (e) => {
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  // Calcula si el tooltip se debe abrir a la izquierda o derecha
  const getTooltipPosition = () => {
    const tooltipWidth = 340;
    const tooltipHeight = 500; // estimado
    const padding = 20;

    let left = mousePos.x + 16;
    let top = mousePos.y + 16;

    // Si se sale por la derecha, abrir a la izquierda
    if (left + tooltipWidth > window.innerWidth - padding) {
      left = mousePos.x - tooltipWidth - 16;
    }

    // Si se sale por abajo, subir
    if (top + tooltipHeight > window.innerHeight - padding) {
      top = Math.max(padding, window.innerHeight - tooltipHeight - padding);
    }

    // Si se sale por arriba
    if (top < padding) top = padding;

    // Si se sale por la izquierda
    if (left < padding) left = padding;

    return { left, top };
  };

  const tooltipPos = hoveredCard ? getTooltipPosition() : { left: 0, top: 0 };

  const count = k => grouped[k].length;
  return (
    <div className="dcam-board-wrap">
      <div className="dcam-kpi-grid">
        {[['👥','Total de leads',conversations.length],['📃','Cotizados',count('cotizado')],['🤝','Pre-Cierre',count('pre_cierre')],['🏆','Clientes cerrados',count('cliente_cerrado')]].map(([icon,label,value])=><div className="dcam-kpi" key={label}><span className="kpi-icon">{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>)}
      </div>
      <div className="dcam-board-head"><div><h2>📊 Tablero comercial</h2><p>Seguimiento de prospectos por etapa</p></div><span className="dcam-muted">{conversations.length} contactos en total</span></div>
      <div style={styles.board}>
      {COLUMNAS.map((col) => (
        <div key={col.key} style={styles.column}>
          <div style={{ ...styles.columnHeader, borderTopColor: col.color }}>
            <span style={styles.columnTitle}>{col.title}</span>
            <span style={styles.columnCount}>{grouped[col.key].length}</span>
          </div>
          <div style={styles.columnBody}>
            {grouped[col.key].map((conv) => {
              const q = conv.quoteData || {};
              const total = q.totalLogisticsUSD || 0;
              return (
                <div
                  key={conv.id}
                  style={styles.card}
                  onMouseEnter={(e) => {
                    setHoveredCard(conv);
                    handleMouseMove(e);
                  }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredCard(null)}
                >
                  <div style={styles.cardHeader}>
                    <div style={styles.avatar}>
                      {(conv.name || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <strong style={styles.cardName}>{conv.name || conv.phone}</strong>
                      <div style={styles.cardDate}>{conv.time}</div>
                    </div>
                  </div>
                  <p style={styles.cardMsg}>{conv.lastMessage || 'Sin mensajes'}</p>
                  {q.product && (
                    <div style={styles.cardProduct}>📦 {q.product}</div>
                  )}
                  {total > 0 && (
                    <div style={styles.cardTotals}>
                      <div style={styles.totalRow}>
                        <span>FOB:</span>
                        <span>USD {q.goodsValue || 0}</span>
                      </div>
                      <div style={styles.totalRow}>
                        <span>Flete:</span>
                        <span>USD {q.freightUSD || 0}</span>
                      </div>
                      <div style={{ ...styles.totalRow, fontWeight: 700, color: '#fbbf24' }}>
                        <span>Total:</span>
                        <span>USD {total}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {grouped[col.key].length === 0 && (
              <div style={styles.emptyCol}>Sin leads</div>
            )}
          </div>
        </div>
      ))}

      {/* TOOLTIP FLOTANTE */}
      {hoveredCard && (
        <div
          ref={tooltipRef}
          style={{
            ...styles.tooltip,
            top: tooltipPos.top,
            left: tooltipPos.left,
          }}
        >
          <div style={styles.tooltipHeader}>
            <strong style={styles.tooltipName}>
              {hoveredCard.name || hoveredCard.phone}
            </strong>
            <span style={styles.tooltipPhone}>+{hoveredCard.phone}</span>
          </div>

          <div style={styles.tooltipDivider} />

          <div style={styles.tooltipSection}>
            <div style={styles.tooltipLabel}>PRODUCTO</div>
            <div style={styles.tooltipValue}>
              {hoveredCard.quoteData?.product || 'Sin definir'}
            </div>
          </div>

          {hoveredCard.quoteData?.hscode && (
            <div style={styles.tooltipSection}>
              <div style={styles.tooltipLabel}>PA (VUCE)</div>
              <div style={{ ...styles.tooltipValue, color: '#34d399', fontWeight: 700 }}>
                {hoveredCard.quoteData.hscode}
              </div>
            </div>
          )}

          <div style={styles.tooltipDivider} />

          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Peso:</span>
            <span style={styles.tooltipValue}>
              {hoveredCard.quoteData?.weightKg ? `${hoveredCard.quoteData.weightKg} kg` : '-'}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Volumen:</span>
            <span style={styles.tooltipValue}>
              {hoveredCard.quoteData?.cbm ? `${hoveredCard.quoteData.cbm} m³` : '-'}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Modalidad:</span>
            <span style={styles.tooltipValue}>
              {hoveredCard.quoteData?.shippingMode || '-'}
            </span>
          </div>

          <div style={styles.tooltipDivider} />

          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>FOB:</span>
            <span style={styles.tooltipValue}>
              USD {hoveredCard.quoteData?.goodsValue || 0}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Flete:</span>
            <span style={styles.tooltipValue}>
              USD {hoveredCard.quoteData?.freightUSD || 0}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Seguro:</span>
            <span style={styles.tooltipValue}>
              USD {hoveredCard.quoteData?.insuranceUSD || 0}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Derechos (DI):</span>
            <span style={styles.tooltipValue}>
              USD {hoveredCard.quoteData?.dutiesUSD || 0}
            </span>
          </div>
          <div style={styles.tooltipRow}>
            <span style={styles.tooltipLabel}>Impuestos:</span>
            <span style={styles.tooltipValue}>
              USD {hoveredCard.quoteData?.taxesUSD || 0}
            </span>
          </div>

          <div style={styles.tooltipDivider} />

          <div style={styles.tooltipRow}>
            <span style={{ ...styles.tooltipLabel, color: '#fbbf24', fontWeight: 700 }}>
              TOTAL:
            </span>
            <span style={{ ...styles.tooltipValue, color: '#fbbf24', fontWeight: 800, fontSize: '14px' }}>
              USD {hoveredCard.quoteData?.totalLogisticsUSD || 0}
            </span>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

const styles = {
  board: {
    flex: 1,
    display: 'flex',
    gap: '12px',
    padding: '16px',
    overflowX: 'auto',
    overflowY: 'hidden',
    background: 'rgba(5,7,13,0.4)',
    position: 'relative',
  },
  column: {
    minWidth: '245px',
    maxWidth: '330px',
    background: 'linear-gradient(180deg,#0b1731,#081326)',
    backdropFilter: 'blur(10px)',
    borderRadius: '12px',
    border: '1px solid rgba(51,65,85,0.4)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '100%',
  },
  columnHeader: {
    padding: '12px 14px',
    borderTop: '3px solid',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'rgba(30,41,59,0.5)',
    borderRadius: '12px 12px 0 0',
  },
  columnTitle: {
    fontSize: '10.5px',
    fontWeight: 800,
    color: '#94a3b8',
    letterSpacing: '0.5px',
  },
  columnCount: {
    fontSize: '10px',
    background: 'rgba(51,65,85,0.6)',
    color: '#cbd5e1',
    padding: '2px 8px',
    borderRadius: '10px',
    fontWeight: 700,
  },
  columnBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  card: {
    background: 'linear-gradient(145deg,#172744,#101b35)',
    border: '1px solid #2d4169',
    borderRadius: '10px',
    padding: '12px',
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  cardHeader: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    marginBottom: '8px',
  },
  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: '13px',
    flexShrink: 0,
  },
  cardName: {
    fontSize: '12.5px',
    color: '#f1f5f9',
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardDate: { fontSize: '10px', color: '#64748b' },
  cardMsg: {
    margin: '0 0 6px 0',
    fontSize: '11.5px',
    color: '#94a3b8',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardProduct: {
    fontSize: '11px',
    color: '#38bdf8',
    marginBottom: '8px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardTotals: {
    borderTop: '1px solid rgba(51,65,85,0.4)',
    paddingTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  totalRow: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10.5px',
    color: '#cbd5e1',
  },
  emptyCol: {
    padding: '20px',
    textAlign: 'center',
    fontSize: '11px',
    color: '#475569',
  },
  tooltip: {
    position: 'fixed',
    zIndex: 9999,
    background: 'rgba(15,23,42,0.98)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(139,92,246,0.4)',
    borderRadius: '12px',
    padding: '14px 16px',
    width: '340px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.2)',
    pointerEvents: 'none',
    animation: 'fadeIn 0.15s ease-out',
  },
  tooltipHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginBottom: '8px',
  },
  tooltipName: {
    fontSize: '13.5px',
    color: '#f1f5f9',
    fontWeight: 700,
  },
  tooltipPhone: {
    fontSize: '11px',
    color: '#64748b',
  },
  tooltipDivider: {
    height: '1px',
    background: 'rgba(51,65,85,0.5)',
    margin: '8px 0',
  },
  tooltipSection: {
    marginBottom: '8px',
  },
  tooltipLabel: {
    fontSize: '10px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    fontWeight: 600,
  },
  tooltipValue: {
    fontSize: '12px',
    color: '#e2e8f0',
    marginTop: '2px',
  },
  tooltipRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    padding: '3px 0',
  },
};