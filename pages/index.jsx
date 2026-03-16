import { useState, useCallback } from "react";
import { CATEGORIES, SEEDS } from "../lib/seeds";

const ALL_SEED_URLS = new Set(Object.values(SEEDS).flat().map(r => r.url));

function downloadCSV(rows) {
  const lines = ["Name,URL,File Type,Records,Columns,Source Org,Login Required,Category,Source,Status,Size MB"];
  rows.forEach(r => {
    const cols = (r.columns || []).join(" | ");
    const cells = [r.name, r.url, r.file_type || "", r.records || "", cols, r.source_org || "",
      r.login ? "Yes" : "No", r.cat || "", r.source || "seed", r.status || "unverified", r.size_mb || ""];
    lines.push(cells.map(v => `"${String(v || "").replace(/"/g, '""')}"`).join(","));
  });
  const uri = "data:text/csv;charset=utf-8," + encodeURIComponent(lines.join("\n"));
  const a = document.createElement("a");
  a.href = uri;
  a.download = `nanu-datasets-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

export default function App() {
  const [active,    setActive]    = useState("uap");
  const [filter,    setFilter]    = useState("all");
  const [expanded,  setExpanded]  = useState({});
  const [aiItems,   setAiItems]   = useState({});
  const [statuses,  setStatuses]  = useState({});  // url → {status, size_mb, real_columns}
  const [validating,setValidating]= useState({});  // url → bool
  const [fetching,  setFetching]  = useState({});  // url → bool
  const [aiLoading, setAiLoading] = useState({});
  const [aiError,   setAiError]   = useState({});

  const cat = CATEGORIES.find(c => c.id === active);

  // Build row list for active tab
  const seedRows = SEEDS[active].map(r => ({ ...r, source: "seed" }));
  const aiRows   = (aiItems[active] || []).map(r => ({ ...r, source: "ai" }));
  const seen = new Set();
  const allRows = [...seedRows, ...aiRows].filter(r => {
    const k = r.url.replace(/\/$/, "").toLowerCase();
    if (seen.has(k)) return false; seen.add(k); return true;
  });

  const nVerifiedCat   = allRows.filter(r => statuses[r.url]?.status === "live").length;
  const nDeadCat       = allRows.filter(r => ["dead","error","timeout"].includes(statuses[r.url]?.status)).length;
  const nUnverifiedCat = allRows.filter(r => !statuses[r.url]).length;
  const nNoLogin       = allRows.filter(r => !r.login).length;

  const filteredRows = allRows.filter(r => {
    const st = statuses[r.url]?.status;
    const isDead = ["dead","error","timeout"].includes(st);
    if (filter === "all")        return true;
    if (filter === "live")       return st === "live";
    if (filter === "dead")       return isDead;
    if (filter === "unverified") return !st;
    if (filter === "no-login")   return !r.login;
    if (filter === "seed")       return r.source === "seed";
    if (filter === "ai")         return r.source === "ai";
    return true;
  });

  // Validate a single URL
  const validate = useCallback(async (row) => {
    setValidating(p => ({ ...p, [row.url]: true }));
    try {
      const res  = await fetch("/api/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: row.url }) });
      const data = await res.json();
      setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], status: data.status, http_status: data.http_status, size_mb: data.size_mb, content_type: data.content_type } }));
    } catch (e) {
      setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], status: "dead" } }));
    } finally {
      setValidating(p => ({ ...p, [row.url]: false }));
    }
  }, []);

  // Validate all in current tab
  const validateAll = useCallback(async () => {
    for (const row of allRows) await validate(row);
  }, [allRows, validate]);

  // Fetch real column headers
  const fetchHeaders = useCallback(async (row) => {
    setFetching(p => ({ ...p, [row.url]: true }));
    try {
      const res  = await fetch("/api/headers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: row.url, file_type: row.file_type }) });
      const data = await res.json();
      if (data.columns?.length) {
        setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], real_columns: data.columns } }));
      }
    } catch (_) {}
    finally { setFetching(p => ({ ...p, [row.url]: false })); }
  }, []);

  // AI suggest
  const fetchAI = useCallback(async (catId) => {
    setAiLoading(p => ({ ...p, [catId]: true }));
    setAiError(p   => ({ ...p, [catId]: null }));
    try {
      const existing = [...SEEDS[catId].map(r => r.url), ...(aiItems[catId] || []).map(r => r.url)];
      const res  = await fetch("/api/suggest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catId, existingUrls: existing }) });
      const data = await res.json();
      setAiItems(p => ({ ...p, [catId]: [...(p[catId] || []), ...(data.items || []).filter(r => !ALL_SEED_URLS.has(r.url))] }));
    } catch (e) {
      setAiError(p => ({ ...p, [catId]: e.message }));
    } finally { setAiLoading(p => ({ ...p, [catId]: false })); }
  }, [aiItems]);

  // Export
  const handleExport = () => {
    const rows = [];
    CATEGORIES.forEach(c => {
      [...SEEDS[c.id].map(r => ({ ...r, source: "seed" })), ...(aiItems[c.id] || []).map(r => ({ ...r, source: "ai" }))].forEach(r => {
        const st = statuses[r.url];
        rows.push({ ...r, cat: c.label, status: st?.status || "unverified", size_mb: st?.size_mb || "" });
      });
    });
    downloadCSV(rows);
  };

  // Stats
  const totalAll   = Object.values(SEEDS).reduce((n,a) => n+a.length,0) + Object.values(aiItems).reduce((n,a) => n+a.length,0);
  const nVerified  = Object.values(statuses).filter(s => s?.status === "live").length;
  const nNoLoginAll= [...Object.values(SEEDS).flat(), ...Object.values(aiItems).flat()].filter(r => !r.login).length;

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
        .tab{cursor:pointer;border:none;background:none;font-family:'Space Mono',monospace;transition:all .15s;display:flex;align-items:center;gap:5px;white-space:nowrap;flex-shrink:0}
        .ftab{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.06em;border-radius:2px;padding:3px 8px;transition:all .15s}
        .row{transition:background .1s}
        .row:hover{background:rgba(31,194,194,.04)!important}
        .mbtn{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;border-radius:2px;padding:3px 7px;transition:all .12s;letter-spacing:.05em;white-space:nowrap}
        .mbtn:hover{filter:brightness(1.3)}
        .col-pill{display:inline-block;background:#0D1B21;border:1px solid #1A3A3A;border-radius:2px;padding:2px 7px;font-size:9px;color:#82F9F6;margin:2px 3px 2px 0;letter-spacing:.04em}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{display:inline-block;animation:spin .8s linear infinite}
        @keyframes slideDown{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        .slide{animation:slideDown .2s ease forwards}
      `}</style>

      {/* Header */}
      <div style={{ borderBottom:"1px solid #1FC2C2", padding:"18px 28px", display:"flex", alignItems:"center", justifyContent:"space-between", background:"linear-gradient(180deg,#0D1B21,#050C0F)", gap:"16px", flexWrap:"wrap" }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"3px" }}>
            <span style={{ fontFamily:"Syne,sans-serif", fontSize:"17px", fontWeight:800, letterSpacing:".1em", color:"#1FC2C2" }}>NANU</span>
            <span style={{ fontSize:"9px", color:"#82F9F6", opacity:.4, letterSpacing:".14em" }}>// DATASET REGISTRY</span>
          </div>
          <div style={{ fontFamily:"Syne,sans-serif", fontSize:"20px", fontWeight:700, color:"#fff" }}>CSV & XLSX Dataset Discovery</div>
          <div style={{ fontSize:"9px", color:"#82F9F6", opacity:.4, marginTop:"3px" }}>
            {totalAll} datasets · {nNoLoginAll} no login required · {nVerified} validated live
          </div>
        </div>
        <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
          <button className="btn" onClick={validateAll}
            style={{ padding:"9px 16px", fontSize:"10px", background:"transparent", color:"#1FC2C2", border:"1px solid #1FC2C2" }}>
            ◈ VALIDATE TAB
          </button>
          <button className="btn" onClick={handleExport}
            style={{ padding:"9px 16px", fontSize:"10px", background:"#1FC2C2", color:"#050C0F" }}>
            ↓ EXPORT CSV
          </button>
        </div>
      </div>

      {/* Category tabs */}
      <div style={{ display:"flex", overflowX:"auto", borderBottom:"1px solid #0D2A2A", background:"#060F12", padding:"0 28px" }}>
        {CATEGORIES.map(c => {
          const isActive = c.id === active;
          const cAll = (SEEDS[c.id]?.length||0) + (aiItems[c.id]?.length||0);
          const cV = [...(SEEDS[c.id]||[]),...(aiItems[c.id]||[])].filter(r => statuses[r.url]?.status === "live").length;
          return (
            <button key={c.id} className="tab" onClick={() => { setActive(c.id); setFilter("all"); }}
              style={{ padding:"11px 13px", borderBottom:isActive?`2px solid ${c.color}`:"2px solid transparent", color:isActive?c.color:"#82F9F6", fontSize:"10px", letterSpacing:".06em", fontWeight:isActive?700:400, opacity:isActive?1:.45 }}>
              {c.icon} {c.label.toUpperCase()}
              <span style={{ fontSize:"9px", color:cV>0?"#10B981":c.color, opacity:.7 }}>{cV>0?`✓${cV}/${cAll}`:cAll}</span>
            </button>
          );
        })}
      </div>

      {/* Main */}
      <div style={{ padding:"20px 28px" }}>
        {/* Controls */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"12px", flexWrap:"wrap", gap:"10px" }}>
          <div style={{ display:"flex", alignItems:"center", gap:"8px", flexWrap:"wrap" }}>
            <span style={{ fontFamily:"Syne,sans-serif", fontSize:"15px", fontWeight:700, color:cat.color }}>{cat.icon} {cat.label}</span>
            <div style={{ display:"flex", gap:"4px", flexWrap:"wrap" }}>
              {[
                { key:"all",        label:`ALL (${allRows.length})`,          color:"#82F9F6" },
                { key:"no-login",   label:`NO LOGIN (${nNoLogin})`,           color:"#1FC2C2" },
                { key:"live",       label:`✓ LIVE (${nVerifiedCat})`,         color:"#10B981" },
                { key:"dead",       label:`✗ DEAD (${nDeadCat})`,             color:"#EF4444" },
                { key:"unverified", label:`? PENDING (${nUnverifiedCat})`,    color:"#F59E0B" },
                { key:"seed",       label:`CURATED (${seedRows.length})`,     color:"#1FC2C2" },
                { key:"ai",         label:`AI (${aiRows.length})`,            color:"#9333EA" },
              ].map(f => (
                <button key={f.key} className="ftab" onClick={() => setFilter(f.key)}
                  style={{ background:filter===f.key?`${f.color}20`:"transparent", color:f.color, border:`1px solid ${filter===f.key?f.color:f.color+"25"}`, opacity:filter===f.key?1:.5 }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn" onClick={() => fetchAI(active)} disabled={!!aiLoading[active]}
            style={{ padding:"7px 13px", fontSize:"9px", background:"transparent", color:"#9333EA", border:"1px solid #9333EA" }}>
            {aiLoading[active] ? <span className="spin">◉</span> : "◎"} FIND MORE DATASETS
          </button>
        </div>

        {aiError[active] && (
          <div style={{ background:"#1A0A0A", border:"1px solid #C23A3A", padding:"9px 14px", borderRadius:"2px", marginBottom:"10px", fontSize:"10px", color:"#F87171" }}>
            ⚠ {aiError[active]}
          </div>
        )}

        {/* Info */}
        <div style={{ background:"#060F12", border:"1px solid #0D2A2A", borderRadius:"2px", padding:"9px 14px", marginBottom:"14px", fontSize:"9px", color:"#82F9F6", opacity:.5, lineHeight:1.7 }}>
          <span style={{ color:"#1FC2C2", opacity:1, fontWeight:700 }}>HOW TO USE: </span>
          <strong>◈ CHECK</strong> validates the URL is live and reads the file size ·
          <strong> ▾ COLS</strong> fetches real column headers from the file ·
          Mark <strong>✓ / ✗</strong> manually after reviewing ·
          <span style={{ color:"#F59E0B", opacity:1 }}> AI-suggested sources need verification before passing to Alex.</span>
        </div>

        {/* Table */}
        <div style={{ border:"1px solid #0D2A2A", borderRadius:"2px", overflow:"hidden" }}>
          {filteredRows.length === 0 && (
            <div style={{ padding:"32px", textAlign:"center", opacity:.3 }}>
              <div style={{ fontFamily:"Syne,sans-serif", fontSize:"12px", color:"#82F9F6" }}>No datasets match this filter</div>
            </div>
          )}

          {filteredRows.map((row, i) => {
            const stData     = statuses[row.url];
            const st         = stData?.status;
            const isLive     = st === "live";
            const isDead     = ["dead","error","timeout"].includes(st);
            const isExpanded = expanded[row.url];
            const isChecking = validating[row.url];
            const isFetching = fetching[row.url];
            const realCols   = stData?.real_columns;
            const displayCols = realCols || row.columns || [];

            const statusInfo = isLive
              ? { bg:"#0D2E1A", color:"#10B981", border:"#10B98135", label:`✓ LIVE${stData?.size_mb ? " · "+stData.size_mb+"MB" : ""}` }
              : isDead
              ? { bg:"#1A0A0A", color:"#EF4444", border:"#EF444435", label:"✗ DEAD" }
              : st === null || !st
              ? { bg:"#0D1B21", color:"#F59E0B", border:"#F59E0B30", label:"? PENDING" }
              : { bg:"#0D1B21", color:"#F59E0B", border:"#F59E0B30", label:"? PENDING" };

            const ftBadge = row.file_type === "xlsx"
              ? { bg:"#0D1F0D", color:"#22C55E", border:"#22C55E30", label:"XLSX" }
              : { bg:"#071A1A", color:"#1FC2C2", border:"#1FC2C230", label:"CSV" };

            return (
              <div key={row.url} style={{ borderBottom:i<filteredRows.length-1?"1px solid #0D2A2A":"none" }}>
                <div className="row" style={{ display:"grid", gridTemplateColumns:"24px 60px 1fr auto", padding:"10px 14px", gap:"10px", background:i%2===0?"#060F12":"#070D10", alignItems:"center" }}>

                  {/* Index */}
                  <div style={{ fontSize:"9px", color:cat.color, opacity:.3, fontWeight:700 }}>{String(i+1).padStart(2,"0")}</div>

                  {/* Badges */}
                  <div style={{ display:"flex", flexDirection:"column", gap:"4px" }}>
                    <span style={{ fontSize:"9px", fontWeight:700, padding:"2px 7px", borderRadius:"2px", background:ftBadge.bg, color:ftBadge.color, border:`1px solid ${ftBadge.border}`, letterSpacing:".08em" }}>{ftBadge.label}</span>
                    <span style={{ fontSize:"9px", fontWeight:700, padding:"2px 7px", borderRadius:"2px",
                      background:row.source==="seed"?"#071A1A":"#12071A",
                      color:row.source==="seed"?"#1FC2C2":"#9333EA",
                      border:row.source==="seed"?"1px solid #1FC2C218":"1px solid #9333EA20",
                      letterSpacing:".06em" }}>{row.source==="seed"?"CURATED":"AI"}</span>
                  </div>

                  {/* Name + meta */}
                  <div>
                    <div style={{ fontSize:"11px", fontWeight:700, color:isDead?"#555":"#fff", lineHeight:1.3, textDecoration:isDead?"line-through":"none", marginBottom:"3px" }}>
                      {row.name}
                      {row.login && <span style={{ marginLeft:"6px", fontSize:"8px", color:"#F59E0B", background:"#1A1400", border:"1px solid #F59E0B25", borderRadius:"2px", padding:"1px 5px", fontWeight:700, letterSpacing:".06em" }}>LOGIN REQ</span>}
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
                      <span style={{ fontSize:"9px", color:isDead?"#444":cat.color, maxWidth:"380px", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"block" }} title={row.url}>
                        {row.url.replace(/^https?:\/\//, "")}
                      </span>
                      {row.records && <span style={{ fontSize:"9px", color:"#82F9F6", opacity:.4 }}>{row.records} records</span>}
                      {row.source_org && <span style={{ fontSize:"9px", color:"#82F9F6", opacity:.3 }}>{row.source_org}</span>}
                      {realCols && <span style={{ fontSize:"9px", color:"#10B981", opacity:.7 }}>✓ real headers fetched</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display:"flex", alignItems:"center", gap:"4px", flexWrap:"nowrap" }}>
                    <a href={row.url} target="_blank" rel="noopener noreferrer"
                      style={{ display:"inline-flex", alignItems:"center", padding:"4px 9px", background:"#0D1B21", color:cat.color, border:`1px solid ${cat.color}30`, borderRadius:"2px", fontSize:"9px", fontWeight:700, textDecoration:"none", whiteSpace:"nowrap" }}
                      onMouseOver={e => e.currentTarget.style.borderColor=cat.color}
                      onMouseOut={e  => e.currentTarget.style.borderColor=cat.color+"30"}>
                      ↗ OPEN
                    </a>
                    <button className="mbtn" onClick={() => validate(row)} disabled={isChecking}
                      style={{ background:"#071A1A", color:"#1FC2C2", border:"1px solid #1FC2C230" }}>
                      {isChecking ? <span className="spin">◉</span> : "◈ CHECK"}
                    </button>
                    <button className="mbtn" onClick={() => { setExpanded(p => ({ ...p, [row.url]: !p[row.url] })); if (!realCols && !isExpanded) fetchHeaders(row); }}
                      style={{ background:isExpanded?"#071A1A":"#0D1B21", color:cat.color, border:`1px solid ${cat.color}30` }}>
                      {isFetching ? <span className="spin">◉</span> : (isExpanded ? "▴ COLS" : "▾ COLS")}
                    </button>
                    <button className="mbtn" onClick={() => setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], status: isLive ? undefined : "live" } }))}
                      style={{ background:isLive?"#0D2E1A":"#0D1B21", color:"#10B981", border:"1px solid #10B98135" }} title="Mark verified">✓</button>
                    <button className="mbtn" onClick={() => setStatuses(p => ({ ...p, [row.url]: { ...p[row.url], status: isDead ? undefined : "dead" } }))}
                      style={{ background:isDead?"#1A0A0A":"#0D1B21", color:"#EF4444", border:"1px solid #EF444435" }} title="Mark dead">✗</button>
                    <span style={{ fontSize:"9px", fontWeight:700, padding:"3px 8px", borderRadius:"2px", background:statusInfo.bg, color:statusInfo.color, border:`1px solid ${statusInfo.border}`, whiteSpace:"nowrap" }}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>

                {/* Column preview */}
                {isExpanded && (
                  <div className="slide" style={{ background:"#040A0D", borderTop:`1px solid ${cat.color}20`, padding:"12px 14px 12px 94px" }}>
                    <div style={{ fontSize:"9px", color:cat.color, letterSpacing:".1em", fontWeight:700, marginBottom:"8px", opacity:.7 }}>
                      {realCols ? `✓ REAL COLUMNS FROM FILE (${displayCols.length})` : `ESTIMATED COLUMNS (${displayCols.length})`}
                    </div>
                    {displayCols.length === 0
                      ? <span style={{ fontSize:"9px", color:"#82F9F6", opacity:.3 }}>No column data — open file to inspect</span>
                      : displayCols.map((col, ci) => <span key={ci} className="col-pill">{col}</span>)
                    }
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ borderTop:"1px solid #0D2A2A", padding:"10px 28px", display:"flex", justifyContent:"space-between", fontSize:"9px", color:"#82F9F6", opacity:.25, letterSpacing:".1em" }}>
        <span>UNKNOWN SYSTEMS LTD // NANU DATASET REGISTRY</span>
        <span>DISCOVER • DISCUSS • DISCLOSE</span>
      </div>
    </div>
  );
}
