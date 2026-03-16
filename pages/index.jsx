import { useState, useCallback, useEffect } from "react";
import { CATEGORIES, SEEDS } from "../lib/seeds";

const ALL_SEED_URLS = new Set(Object.values(SEEDS).flat().map(r => r.url));

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCSV(rows) {
  const lines = ["Name,URL,File Type,Records,Columns,Source Org,Login Required,Category,Source,Status,Size MB"];
  rows.forEach(r => {
    const cells = [
      r.name, r.url, r.file_type || "", r.records || "",
      (r.columns || []).join(" | "), r.source_org || "",
      r.login ? "Yes" : "No", r.cat || "",
      r.source || "seed", r.status || "unverified", r.size_mb || "",
    ].map(v => `"${String(v || "").replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  });
  const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n"));
  const a = document.createElement("a");
  a.href = uri;
  a.download = "nanu-datasets.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function App() {
  const [mounted,   setMounted]   = useState(false);
  const [active,    setActive]    = useState("uap");
  const [filter,    setFilter]    = useState("all");
  const [expanded,  setExpanded]  = useState({});
  const [aiItems,   setAiItems]   = useState({});
  const [statuses,  setStatuses]  = useState({});
  const [validating,setValidating]= useState({});
  const [fetching,  setFetching]  = useState({});
  const [aiLoading, setAiLoading] = useState({});
  const [aiError,   setAiError]   = useState({});

  // Fix hydration: only render dynamic content after mount
  useEffect(() => { setMounted(true); }, []);

  const cat = CATEGORIES.find(c => c.id === active);
  const seedRows = SEEDS[active].map(r => ({ ...r, source: "seed" }));
  const aiRows   = (aiItems[active] || []).map(r => ({ ...r, source: "ai" }));

  const seen = new Set();
  const allRows = [...seedRows, ...aiRows].filter(r => {
    const k = r.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  const isLive  = url => statuses[url]?.status === "live";
  const isDead  = url => ["dead","error","timeout"].includes(statuses[url]?.status);

  const nVerCat  = allRows.filter(r => isLive(r.url)).length;
  const nDeadCat = allRows.filter(r => isDead(r.url)).length;
  const nPendCat = allRows.filter(r => !statuses[r.url]).length;
  const nNoLogin = allRows.filter(r => !r.login).length;

  const filteredRows = allRows.filter(r => {
    if (filter === "all")        return true;
    if (filter === "live")       return isLive(r.url);
    if (filter === "dead")       return isDead(r.url);
    if (filter === "unverified") return !statuses[r.url];
    if (filter === "no-login")   return !r.login;
    if (filter === "seed")       return r.source === "seed";
    if (filter === "ai")         return r.source === "ai";
    return true;
  });

  // Validate single URL
  const validate = useCallback(async (row) => {
    setValidating(p => ({ ...p, [row.url]: true }));
    try {
      const res  = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: row.url }),
      });
      const data = await res.json();
      setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], ...data } }));
    } catch {
      setStatuses(p => ({ ...p, [row.url]: { status: "dead" } }));
    } finally {
      setValidating(p => ({ ...p, [row.url]: false }));
    }
  }, []);

  // Validate all in current tab
  const validateTab = useCallback(async () => {
    for (const row of allRows) await validate(row);
  }, [allRows, validate]);

  // Fetch real column headers
  const fetchHeaders = useCallback(async (row) => {
    setFetching(p => ({ ...p, [row.url]: true }));
    try {
      const res  = await fetch("/api/headers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: row.url, file_type: row.file_type }),
      });
      const data = await res.json();
      if (data.columns && data.columns.length > 0) {
        setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], real_columns: data.columns } }));
      }
    } catch (_) {}
    finally { setFetching(p => ({ ...p, [row.url]: false })); }
  }, []);

  // AI suggestions
  const fetchAI = useCallback(async (catId) => {
    setAiLoading(p => ({ ...p, [catId]: true }));
    setAiError(p   => ({ ...p, [catId]: null }));
    try {
      const existing = [
        ...SEEDS[catId].map(r => r.url),
        ...(aiItems[catId] || []).map(r => r.url),
      ];
      const res  = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ catId, existingUrls: existing }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const newItems = (data.items || []).filter(r => !ALL_SEED_URLS.has(r.url));
      setAiItems(p => ({ ...p, [catId]: [...(p[catId] || []), ...newItems] }));
    } catch (e) {
      setAiError(p => ({ ...p, [catId]: e.message }));
    } finally {
      setAiLoading(p => ({ ...p, [catId]: false }));
    }
  }, [aiItems]);

  // Export
  const handleExport = () => {
    const rows = [];
    CATEGORIES.forEach(c => {
      const cRows = [
        ...SEEDS[c.id].map(r => ({ ...r, source: "seed" })),
        ...(aiItems[c.id] || []).map(r => ({ ...r, source: "ai" })),
      ];
      cRows.forEach(r => {
        rows.push({
          ...r, cat: c.label,
          status: statuses[r.url]?.status || "unverified",
          size_mb: statuses[r.url]?.size_mb || "",
          columns: statuses[r.url]?.real_columns || r.columns || [],
        });
      });
    });
    exportCSV(rows);
  };

  const totalAll    = Object.values(SEEDS).reduce((n,a) => n+a.length,0) + Object.values(aiItems).reduce((n,a) => n+a.length,0);
  const nVerAll     = Object.values(statuses).filter(s => s?.status === "live").length;
  const nNoLoginAll = [...Object.values(SEEDS).flat(), ...Object.values(aiItems).flat()].filter(r => !r.login).length;

  if (!mounted) return (
    <div style={{ minHeight:"100vh", background:"#050C0F", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"monospace", color:"#1FC2C2" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#050C0F", fontFamily:"'Space Mono',monospace", color:"#E2F0F0" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@700;800&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:#1FC2C2;border-radius:2px}
        ::-webkit-scrollbar-track{background:#0D1B21}
        .btn{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-weight:700;letter-spacing:.08em;border-radius:2px;transition:all .15s}
        .btn:hover:not(:disabled){filter:brightness(1.2);transform:translateY(-1px)}
        .btn:disabled{opacity:.4;cursor:not-allowed}
        .ctab{cursor:pointer;border:none;background:none;font-family:'Space Mono',monospace;transition:all .15s;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0}
        .ftab{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.06em;border-radius:2px;padding:3px 8px;transition:all .15s}
        .drow{transition:background .1s}
        .drow:hover{background:rgba(31,194,194,.04)!important}
        .mbtn{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;border-radius:2px;padding:3px 7px;transition:all .12s;letter-spacing:.05em;white-space:nowrap}
        .mbtn:hover{filter:brightness(1.3)}
        .cpill{display:inline-block;background:#0D1B21;border:1px solid #1A3A3A;border-radius:2px;padding:2px 7px;font-size:9px;color:#82F9F6;margin:2px 3px 2px 0;letter-spacing:.04em}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{display:inline-block;animation:spin .7s linear infinite}
        @keyframes sd{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        .sd{animation:sd .2s ease forwards}
      `}</style>

      {/* Header */}
      <div style={{borderBottom:"1px solid #1FC2C2",padding:"18px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(180deg,#0D1B21,#050C0F)",gap:"16px",flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"3px"}}>
            <span style={{fontFamily:"Syne,sans-serif",fontSize:"17px",fontWeight:800,letterSpacing:".1em",color:"#1FC2C2"}}>NANU</span>
            <span style={{fontSize:"9px",color:"#82F9F6",opacity:.4,letterSpacing:".14em"}}>//&nbsp;DATASET REGISTRY</span>
          </div>
          <div style={{fontFamily:"Syne,sans-serif",fontSize:"20px",fontWeight:700,color:"#fff"}}>CSV &amp; XLSX Dataset Discovery</div>
          <div style={{fontSize:"9px",color:"#82F9F6",opacity:.4,marginTop:"3px"}}>
            {totalAll} datasets · {nNoLoginAll} no login · {nVerAll} validated live
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
          <button className="btn" onClick={validateTab}
            style={{padding:"9px 16px",fontSize:"10px",background:"transparent",color:"#1FC2C2",border:"1px solid #1FC2C2"}}>
            ◈ VALIDATE TAB
          </button>
          <button className="btn" onClick={handleExport}
            style={{padding:"9px 16px",fontSize:"10px",background:"#1FC2C2",color:"#050C0F"}}>
            ↓ EXPORT CSV
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{display:"flex",overflowX:"auto",borderBottom:"1px solid #0D2A2A",background:"#060F12",padding:"0 28px"}}>
        {CATEGORIES.map(c => {
          const isActive = c.id === active;
          const cAll = (SEEDS[c.id]?.length||0)+(aiItems[c.id]?.length||0);
          const cV   = [...(SEEDS[c.id]||[]),...(aiItems[c.id]||[])].filter(r=>statuses[r.url]?.status==="live").length;
          return (
            <button key={c.id} className="ctab"
              onClick={() => { setActive(c.id); setFilter("all"); }}
              style={{padding:"11px 13px",borderBottom:isActive?`2px solid ${c.color}`:"2px solid transparent",color:isActive?c.color:"#82F9F6",fontSize:"10px",letterSpacing:".06em",fontWeight:isActive?700:400,opacity:isActive?1:.45}}>
              {c.icon} {c.label.toUpperCase()}
              <span style={{fontSize:"9px",color:cV>0?"#10B981":c.color,opacity:.7}}>{cV>0?`✓${cV}/${cAll}`:cAll}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{padding:"20px 28px"}}>

        {/* Controls */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"10px"}}>
          <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
            <span style={{fontFamily:"Syne,sans-serif",fontSize:"15px",fontWeight:700,color:cat.color}}>{cat.icon} {cat.label}</span>
            <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
              {[
                {key:"all",        label:`ALL (${allRows.length})`,          color:"#82F9F6"},
                {key:"no-login",   label:`NO LOGIN (${nNoLogin})`,           color:"#1FC2C2"},
                {key:"live",       label:`✓ LIVE (${nVerCat})`,              color:"#10B981"},
                {key:"dead",       label:`✗ DEAD (${nDeadCat})`,             color:"#EF4444"},
                {key:"unverified", label:`? PENDING (${nPendCat})`,          color:"#F59E0B"},
                {key:"seed",       label:`CURATED (${seedRows.length})`,     color:"#1FC2C2"},
                {key:"ai",         label:`AI (${aiRows.length})`,            color:"#9333EA"},
              ].map(f => (
                <button key={f.key} className="ftab" onClick={() => setFilter(f.key)}
                  style={{background:filter===f.key?`${f.color}20`:"transparent",color:f.color,border:`1px solid ${filter===f.key?f.color:f.color+"28"}`,opacity:filter===f.key?1:.5}}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={() => fetchAI(active)} disabled={!!aiLoading[active]}
            style={{padding:"7px 13px",fontSize:"9px",background:"transparent",color:"#9333EA",border:"1px solid #9333EA"}}>
            {aiLoading[active] ? <span className="spin">◉</span> : "◎"} FIND MORE DATASETS
          </button>
        </div>

        {aiError[active] && (
          <div style={{background:"#1A0A0A",border:"1px solid #C23A3A",padding:"9px 14px",borderRadius:"2px",marginBottom:"10px",fontSize:"10px",color:"#F87171"}}>
            ⚠ {aiError[active]}
          </div>
        )}

        {/* Instruction banner */}
        <div style={{background:"#060F12",border:"1px solid #0D2A2A",borderRadius:"2px",padding:"9px 14px",marginBottom:"14px",fontSize:"9px",color:"#82F9F6",opacity:.5,lineHeight:1.7}}>
          <span style={{color:"#1FC2C2",opacity:1,fontWeight:700}}>HOW TO USE: </span>
          <strong>◈ CHECK</strong> — validates URL is live + returns file size ·&nbsp;
          <strong>▾ COLS</strong> — fetches real column headers from the file ·&nbsp;
          <strong>◈ VALIDATE TAB</strong> — checks all rows in current tab ·&nbsp;
          <span style={{color:"#F59E0B",opacity:1}}>AI sources need verification before passing to Alex.</span>
        </div>

        {/* Table */}
        <div style={{border:"1px solid #0D2A2A",borderRadius:"2px",overflow:"hidden"}}>
          {filteredRows.length === 0 && (
            <div style={{padding:"32px",textAlign:"center",opacity:.3}}>
              <div style={{fontFamily:"Syne,sans-serif",fontSize:"12px",color:"#82F9F6"}}>No datasets match this filter</div>
            </div>
          )}

          {filteredRows.map((row, i) => {
            const stData    = statuses[row.url];
            const live      = stData?.status === "live";
            const dead      = ["dead","error","timeout"].includes(stData?.status);
            const isExpanded= expanded[row.url];
            const checking  = validating[row.url];
            const fetchingC = fetching[row.url];
            const realCols  = stData?.real_columns;
            const dispCols  = realCols || row.columns || [];

            const stInfo = live
              ? {bg:"#0D2E1A",color:"#10B981",border:"#10B98135",label:`✓ LIVE${stData?.size_mb?" · "+stData.size_mb+"MB":""}`}
              : dead
              ? {bg:"#1A0A0A",color:"#EF4444",border:"#EF444435",label:"✗ DEAD"}
              : {bg:"#0D1B21",color:"#F59E0B",border:"#F59E0B30",label:"? PENDING"};

            const ftBadge = row.file_type === "xlsx"
              ? {bg:"#0D1F0D",color:"#22C55E",border:"#22C55E30",label:"XLSX"}
              : {bg:"#071A1A",color:"#1FC2C2",border:"#1FC2C230",label:"CSV"};

            return (
              <div key={row.url} style={{borderBottom:i<filteredRows.length-1?"1px solid #0D2A2A":"none"}}>
                <div className="drow" style={{display:"grid",gridTemplateColumns:"24px 60px 1fr auto",padding:"10px 14px",gap:"10px",background:i%2===0?"#060F12":"#070D10",alignItems:"center"}}>

                  {/* Index */}
                  <div style={{fontSize:"9px",color:cat.color,opacity:.3,fontWeight:700}}>{String(i+1).padStart(2,"0")}</div>

                  {/* Badges */}
                  <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                    <span style={{fontSize:"9px",fontWeight:700,padding:"2px 7px",borderRadius:"2px",background:ftBadge.bg,color:ftBadge.color,border:`1px solid ${ftBadge.border}`,letterSpacing:".08em"}}>{ftBadge.label}</span>
                    <span style={{fontSize:"9px",fontWeight:700,padding:"2px 7px",borderRadius:"2px",
                      background:row.source==="seed"?"#071A1A":"#12071A",
                      color:row.source==="seed"?"#1FC2C2":"#9333EA",
                      border:row.source==="seed"?"1px solid #1FC2C218":"1px solid #9333EA20",
                      letterSpacing:".06em"}}>
                      {row.source==="seed"?"CURATED":"AI"}
                    </span>
                  </div>

                  {/* Name + meta */}
                  <div>
                    <div style={{fontSize:"11px",fontWeight:700,color:dead?"#555":"#fff",lineHeight:1.3,textDecoration:dead?"line-through":"none",marginBottom:"3px"}}>
                      {row.name}
                      {row.login && <span style={{marginLeft:"6px",fontSize:"8px",color:"#F59E0B",background:"#1A1400",border:"1px solid #F59E0B25",borderRadius:"2px",padding:"1px 5px",fontWeight:700}}>LOGIN REQ</span>}
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                      <span style={{fontSize:"9px",color:dead?"#444":cat.color,maxWidth:"380px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={row.url}>
                        {row.url.replace(/^https?:\/\//,"")}
                      </span>
                      {row.records && <span style={{fontSize:"9px",color:"#82F9F6",opacity:.4}}>{row.records} records</span>}
                      {row.source_org && <span style={{fontSize:"9px",color:"#82F9F6",opacity:.3}}>{row.source_org}</span>}
                      {realCols && <span style={{fontSize:"9px",color:"#10B981",opacity:.8}}>✓ real headers</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"nowrap"}}>
                    <a href={row.url} target="_blank" rel="noopener noreferrer"
                      style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",background:"#0D1B21",color:cat.color,border:`1px solid ${cat.color}30`,borderRadius:"2px",fontSize:"9px",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}
                      onMouseOver={e=>e.currentTarget.style.borderColor=cat.color}
                      onMouseOut={e=>e.currentTarget.style.borderColor=cat.color+"30"}>
                      ↗ OPEN
                    </a>
                    <button className="mbtn" onClick={() => validate(row)} disabled={checking}
                      style={{background:"#071A1A",color:"#1FC2C2",border:"1px solid #1FC2C230"}}>
                      {checking ? <span className="spin">◉</span> : "◈ CHECK"}
                    </button>
                    <button className="mbtn"
                      onClick={() => {
                        setExpanded(p => ({...p, [row.url]: !p[row.url]}));
                        if (!realCols && !isExpanded) fetchHeaders(row);
                      }}
                      style={{background:isExpanded?"#071A1A":"#0D1B21",color:cat.color,border:`1px solid ${cat.color}30`}}>
                      {fetchingC ? <span className="spin">◉</span> : (isExpanded ? "▴ COLS" : "▾ COLS")}
                    </button>
                    <button className="mbtn"
                      onClick={() => setStatuses(p => ({...p, [row.url]: {...p[row.url], status: live ? undefined : "live"}}))}
                      style={{background:live?"#0D2E1A":"#0D1B21",color:"#10B981",border:"1px solid #10B98135"}} title="Mark live">✓</button>
                    <button className="mbtn"
                      onClick={() => setStatuses(p => ({...p, [row.url]: {...p[row.url], status: dead ? undefined : "dead"}}))}
                      style={{background:dead?"#1A0A0A":"#0D1B21",color:"#EF4444",border:"1px solid #EF444435"}} title="Mark dead">✗</button>
                    <span style={{fontSize:"9px",fontWeight:700,padding:"3px 8px",borderRadius:"2px",background:stInfo.bg,color:stInfo.color,border:`1px solid ${stInfo.border}`,whiteSpace:"nowrap"}}>
                      {stInfo.label}
                    </span>
                  </div>
                </div>

                {/* Column preview */}
                {isExpanded && (
                  <div className="sd" style={{background:"#040A0D",borderTop:`1px solid ${cat.color}20`,padding:"12px 14px 12px 94px"}}>
                    <div style={{fontSize:"9px",color:cat.color,letterSpacing:".1em",fontWeight:700,marginBottom:"8px",opacity:.7}}>
                      {realCols ? `✓ REAL COLUMNS FROM FILE (${dispCols.length})` : `ESTIMATED COLUMNS (${dispCols.length})`}
                    </div>
                    {dispCols.length === 0
                      ? <span style={{fontSize:"9px",color:"#82F9F6",opacity:.3}}>No column data available</span>
                      : dispCols.map((col, ci) => <span key={ci} className="cpill">{col}</span>)
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{borderTop:"1px solid #0D2A2A",padding:"10px 28px",display:"flex",justifyContent:"space-between",fontSize:"9px",color:"#82F9F6",opacity:.25,letterSpacing:".1em"}}>
        <span>UNKNOWN SYSTEMS LTD // NANU DATASET REGISTRY</span>
        <span>DISCOVER • DISCUSS • DISCLOSE</span>
      </div>
    </div>
  );
}
