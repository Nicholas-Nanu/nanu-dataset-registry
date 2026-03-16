import { useState, useCallback, useEffect, useRef } from "react";
import { CATEGORIES, SEEDS } from "../lib/seeds";

const ALL_SEED_URLS = new Set(Object.values(SEEDS).flat().map(r => r.url));
const LS_STATUSES  = "nanu_statuses_v1";
const LS_AI_ITEMS  = "nanu_ai_items_v1";

function loadLS(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
  catch (_) { return fallback; }
}
function saveLS(key, value) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
}

function buildExportRows(cats, seeds, aiItems, statuses) {
  const rows = [];
  cats.forEach(c => {
    [...seeds[c.id].map(r => ({...r,source:"seed"})), ...(aiItems[c.id]||[]).map(r => ({...r,source:"ai"}))].forEach(r => {
      const st = statuses[r.url];
      rows.push({ ...r, cat:c.label, status:st?.status||"unverified", size_mb:st?.size_mb||"", columns:st?.real_columns||r.columns||[] });
    });
  });
  return rows;
}

function toCSV(rows) {
  const lines = ["Name,URL,File Type,Records,Columns,Source Org,Login Required,Category,Source,Status,Size MB"];
  rows.forEach(r => {
    lines.push([r.name,r.url,r.file_type||"",r.records||"",(r.columns||[]).join(" | "),r.source_org||"",r.login?"Yes":"No",r.cat||"",r.source||"seed",r.status||"unverified",r.size_mb||""].map(v=>`"${String(v||"").replace(/"/g,'""')}"`).join(","));
  });
  return lines.join("\n");
}

function triggerDownload(csv, filename) {
  const a = document.createElement("a");
  a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
  a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function catStats(catId, seeds, aiItems, statuses) {
  const rows = [...seeds[catId].map(r=>({...r,source:"seed"})),...(aiItems[catId]||[]).map(r=>({...r,source:"ai"}))];
  return {
    total:      rows.length,
    live:       rows.filter(r=>statuses[r.url]?.status==="live").length,
    dead:       rows.filter(r=>["dead","error","timeout"].includes(statuses[r.url]?.status)).length,
    unverified: rows.filter(r=>!statuses[r.url]).length,
    noLogin:    rows.filter(r=>!r.login).length,
    aiCount:    rows.filter(r=>r.source==="ai").length,
  };
}

export default function App() {
  const [mounted,    setMounted]    = useState(false);
  const [view,       setView]       = useState("registry");
  const [active,     setActive]     = useState("uap");
  const [filter,     setFilter]     = useState("all");
  const [expanded,   setExpanded]   = useState({});
  const [aiItems,    setAiItems]    = useState({});
  const [statuses,   setStatuses]   = useState({});
  const [validating, setValidating] = useState({});
  const [fetching,   setFetching]   = useState({});
  const [aiLoading,  setAiLoading]  = useState({});
  const [aiError,    setAiError]    = useState({});
  const [exportMenu, setExportMenu] = useState(false);
  const [aiPlatform,    setAiPlatform]    = useState("github");
  const [liveLoading,   setLiveLoading]   = useState({});   // key → bool
  const [liveError,     setLiveError]     = useState({});
  const [ckanPortal,    setCkanPortal]    = useState("data.gov");
  const exportRef = useRef(null);

  useEffect(() => {
    setStatuses(loadLS(LS_STATUSES, {}));
    setAiItems(loadLS(LS_AI_ITEMS, {}));
    setMounted(true);
  }, []);

  useEffect(() => { if (mounted) saveLS(LS_STATUSES, statuses); }, [statuses, mounted]);
  useEffect(() => { if (mounted) saveLS(LS_AI_ITEMS,  aiItems);  }, [aiItems,  mounted]);

  useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportMenu(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const cat      = CATEGORIES.find(c => c.id === active);
  const seedRows = SEEDS[active].map(r => ({...r, source:"seed"}));
  const aiRows   = (aiItems[active]||[]).map(r => ({...r, source:"ai"}));
  const seen     = new Set();
  const allRows  = [...seedRows,...aiRows].filter(r => { const k=r.url.replace(/\/$/,"").toLowerCase(); if(seen.has(k))return false; seen.add(k); return true; });

  const isLive = url => statuses[url]?.status === "live";
  const isDead = url => ["dead","error","timeout"].includes(statuses[url]?.status);

  const nVerCat  = allRows.filter(r=>isLive(r.url)).length;
  const nDeadCat = allRows.filter(r=>isDead(r.url)).length;
  const nPendCat = allRows.filter(r=>!statuses[r.url]).length;
  const nNoLogin = allRows.filter(r=>!r.login).length;

  const filteredRows = allRows.filter(r => {
    if (filter==="all")        return true;
    if (filter==="live")       return isLive(r.url);
    if (filter==="dead")       return isDead(r.url);
    if (filter==="unverified") return !statuses[r.url];
    if (filter==="no-login")   return !r.login;
    if (filter==="seed")       return r.source==="seed";
    if (filter==="ai")         return r.source==="ai";
    return true;
  });

  const validate = useCallback(async row => {
    setValidating(p=>({...p,[row.url]:true}));
    try {
      const res = await fetch("/api/validate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:row.url})});
      const d = await res.json();
      setStatuses(p=>({...p,[row.url]:{...p[row.url],...d}}));
    } catch { setStatuses(p=>({...p,[row.url]:{status:"dead"}})); }
    finally { setValidating(p=>({...p,[row.url]:false})); }
  }, []);

  const validateTab = useCallback(async () => { for (const row of allRows) await validate(row); }, [allRows, validate]);

  const fetchHeaders = useCallback(async row => {
    setFetching(p=>({...p,[row.url]:true}));
    try {
      const res = await fetch("/api/headers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:row.url,file_type:row.file_type})});
      const d = await res.json();
      if (d.columns?.length) setStatuses(p=>({...p,[row.url]:{...p[row.url],real_columns:d.columns}}));
    } catch (_) {}
    finally { setFetching(p=>({...p,[row.url]:false})); }
  }, []);

  const fetchAI = useCallback(async (catId, platform) => {
    setAiLoading(p=>({...p,[catId]:true}));
    setAiError(p=>({...p,[catId]:null}));
    try {
      const existing = [...SEEDS[catId].map(r=>r.url),...(aiItems[catId]||[]).map(r=>r.url)];
      const res = await fetch("/api/suggest",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({catId,existingUrls:existing,platform:platform||"github"})});
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const newItems = (d.items||[]).filter(r=>!ALL_SEED_URLS.has(r.url));
      setAiItems(p=>({...p,[catId]:[...(p[catId]||[]),...newItems]}));
    } catch (e) { setAiError(p=>({...p,[catId]:e.message})); }
    finally { setAiLoading(p=>({...p,[catId]:false})); }
  }, [aiItems]);

  const liveSearchZenodo = useCallback(async (catId) => {
    const key = `zenodo_${catId}`;
    setLiveLoading(p => ({...p, [key]: true}));
    setLiveError(p   => ({...p, [key]: null}));
    try {
      const res  = await fetch("/api/search-zenodo", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ catId }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const existing = new Set([
        ...SEEDS[catId].map(r => r.url),
        ...(aiItems[catId] || []).map(r => r.url),
      ]);
      const fresh = (d.items || []).filter(r => r.url && !existing.has(r.url));
      setAiItems(p => ({...p, [catId]: [...(p[catId]||[]), ...fresh]}));
    } catch (e) { setLiveError(p => ({...p, [key]: e.message})); }
    finally { setLiveLoading(p => ({...p, [`zenodo_${catId}`]: false})); }
  }, [aiItems]);

  const liveSearchCKAN = useCallback(async (catId, portal) => {
    const key = `ckan_${portal}_${catId}`;
    setLiveLoading(p => ({...p, [key]: true}));
    setLiveError(p   => ({...p, [key]: null}));
    try {
      const res  = await fetch("/api/search-ckan", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ catId, portal }),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      const existing = new Set([
        ...SEEDS[catId].map(r => r.url),
        ...(aiItems[catId] || []).map(r => r.url),
      ]);
      const fresh = (d.items || []).filter(r => r.url && !existing.has(r.url));
      setAiItems(p => ({...p, [catId]: [...(p[catId]||[]), ...fresh]}));
    } catch (e) { setLiveError(p => ({...p, [key]: e.message})); }
    finally { setLiveLoading(p => ({...p, [key]: false})); }
  }, [aiItems]);

  const handleExport = mode => {    setExportMenu(false);
    const all = buildExportRows(CATEGORIES, SEEDS, aiItems, statuses);
    const map = {
      "live-nologin":     [all.filter(r=>r.status==="live"&&!r.login),          "nanu-live-nologin.csv"],
      "live":             [all.filter(r=>r.status==="live"),                     "nanu-live.csv"],
      "usable-nologin":   [all.filter(r=>r.status!=="dead"&&!r.login),           "nanu-usable-nologin.csv"],
      "tab":              [buildExportRows(CATEGORIES.filter(c=>c.id===active),SEEDS,aiItems,statuses), `nanu-${active}.csv`],
      "all":              [all,                                                   "nanu-all.csv"],
    };
    const [rows, filename] = map[mode] || [all,"nanu-all.csv"];
    if (!rows.length) { alert("No rows match that filter. Try validating some datasets first."); return; }
    triggerDownload(toCSV(rows), filename);
  };

  const clearAll = () => {
    if (!confirm("Clear all saved validation results and AI suggestions?")) return;
    setStatuses({}); setAiItems({});
    saveLS(LS_STATUSES,{}); saveLS(LS_AI_ITEMS,{});
  };

  const allDatasets = [...Object.values(SEEDS).flat(),...Object.values(aiItems).flat()];
  const totalAll    = allDatasets.length;
  const nVerAll     = Object.values(statuses).filter(s=>s?.status==="live").length;
  const nDeadAll    = Object.values(statuses).filter(s=>["dead","error","timeout"].includes(s?.status)).length;
  const nNoLoginAll = allDatasets.filter(r=>!r.login).length;
  const nChecked    = Object.keys(statuses).length;

  if (!mounted) return (
    <div style={{minHeight:"100vh",background:"#050C0F",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"monospace",color:"#1FC2C2",fontSize:"12px",letterSpacing:".1em"}}>
      LOADING…
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#050C0F",fontFamily:"'Space Mono',monospace",color:"#E2F0F0"}}>
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
        .vtab{cursor:pointer;border:none;background:none;font-family:'Space Mono',monospace;font-weight:700;letter-spacing:.08em;transition:all .15s;padding:11px 18px;font-size:10px;white-space:nowrap}
        .ftab{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;letter-spacing:.06em;border-radius:2px;padding:3px 8px;transition:all .15s}
        .drow{transition:background .1s}
        .drow:hover{background:rgba(31,194,194,.04)!important}
        .mbtn{cursor:pointer;border:none;font-family:'Space Mono',monospace;font-size:9px;font-weight:700;border-radius:2px;padding:3px 7px;transition:all .12s;letter-spacing:.05em;white-space:nowrap}
        .mbtn:hover{filter:brightness(1.3)}
        .cpill{display:inline-block;background:#0D1B21;border:1px solid #1A3A3A;border-radius:2px;padding:2px 7px;font-size:9px;color:#82F9F6;margin:2px 3px 2px 0;letter-spacing:.04em}
        .emenu{position:absolute;top:calc(100% + 6px);right:0;background:#0D1B21;border:1px solid #1FC2C2;border-radius:2px;z-index:100;min-width:240px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.6)}
        .eitem{display:block;width:100%;text-align:left;padding:10px 14px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.06em;cursor:pointer;border:none;background:transparent;color:#E2F0F0;transition:background .12s}
        .eitem:hover{background:rgba(31,194,194,.12)}
        .srow{cursor:pointer;transition:border-color .15s}
        @keyframes spin{to{transform:rotate(360deg)}}
        .spin{display:inline-block;animation:spin .7s linear infinite}
        @keyframes sd{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
        .sd{animation:sd .2s ease forwards}
        @keyframes fi{from{opacity:0}to{opacity:1}}
        .fi{animation:fi .25s ease forwards}
      `}</style>

      {/* ── Header ── */}
      <div style={{borderBottom:"1px solid #1FC2C2",padding:"18px 28px",display:"flex",alignItems:"center",justifyContent:"space-between",background:"linear-gradient(180deg,#0D1B21,#050C0F)",gap:"16px",flexWrap:"wrap"}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"3px"}}>
            <span style={{fontFamily:"Syne,sans-serif",fontSize:"17px",fontWeight:800,letterSpacing:".1em",color:"#1FC2C2"}}>NANU</span>
            <span style={{fontSize:"9px",color:"#82F9F6",opacity:.4,letterSpacing:".14em"}}>//&nbsp;DATASET REGISTRY</span>
            <span style={{fontSize:"9px",background:"#0D2A2A",color:"#1FC2C2",border:"1px solid #1FC2C230",borderRadius:"2px",padding:"1px 6px",letterSpacing:".08em"}}>v3</span>
          </div>
          <div style={{fontFamily:"Syne,sans-serif",fontSize:"20px",fontWeight:700,color:"#fff"}}>CSV &amp; XLSX Dataset Discovery</div>
          <div style={{fontSize:"9px",color:"#82F9F6",opacity:.4,marginTop:"3px"}}>
            {totalAll} datasets · {nNoLoginAll} no login · {nVerAll} live · {nChecked} checked · {nDeadAll} dead
            <span style={{marginLeft:"10px",color:"#10B981",opacity:.8}}>● Saved to browser</span>
          </div>
        </div>
        <div style={{display:"flex",gap:"8px",alignItems:"center",flexWrap:"wrap"}}>
          <div style={{position:"relative"}} ref={exportRef}>
            <button className="btn" onClick={() => setExportMenu(p=>!p)}
              style={{padding:"9px 16px",fontSize:"10px",background:"#1FC2C2",color:"#050C0F"}}>
              ↓ EXPORT ▾
            </button>
            {exportMenu && (
              <div className="emenu sd">
                {[
                  {mode:"live-nologin",   label:"✓ Live + No Login",              sub:"Best for Alex — confirmed, no account needed", color:"#10B981"},
                  {mode:"live",           label:"✓ All Live",                      sub:"Everything validated as live",                  color:"#10B981"},
                  {mode:"usable-nologin", label:"◈ Usable + No Login",             sub:"Live or unverified, no login needed",           color:"#1FC2C2"},
                  {mode:"tab",            label:`◎ Current Tab (${cat.label})`,    sub:"Export this category only",                    color:"#F59E0B"},
                  {mode:"all",            label:"⊞ Everything",                    sub:"All datasets, all statuses",                   color:"#82F9F6"},
                ].map(opt => (
                  <button key={opt.mode} className="eitem" onClick={() => handleExport(opt.mode)}>
                    <span style={{color:opt.color}}>{opt.label}</span>
                    <div style={{fontSize:"8px",color:"#82F9F6",opacity:.4,marginTop:"2px",fontWeight:400,letterSpacing:".02em"}}>{opt.sub}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn" onClick={clearAll}
            style={{padding:"9px 14px",fontSize:"10px",background:"transparent",color:"#EF4444",border:"1px solid #EF444435"}}>
            ✕ CLEAR SAVED
          </button>
        </div>
      </div>

      {/* ── View tabs ── */}
      <div style={{display:"flex",borderBottom:"1px solid #0D2A2A",background:"#060F12",padding:"0 28px"}}>
        {[{key:"registry",label:"REGISTRY"},{key:"summary",label:"◎ SUMMARY"}].map(v=>(
          <button key={v.key} className="vtab" onClick={()=>setView(v.key)}
            style={{borderBottom:view===v.key?"2px solid #1FC2C2":"2px solid transparent",color:view===v.key?"#1FC2C2":"#82F9F6",opacity:view===v.key?1:.45}}>
            {v.label}
          </button>
        ))}
      </div>

      {/* ══ SUMMARY VIEW ══ */}
      {view==="summary" && (
        <div className="fi" style={{padding:"24px 28px"}}>

          {/* Global stats */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"12px",marginBottom:"28px"}}>
            {[
              {label:"TOTAL DATASETS", value:totalAll,             color:"#82F9F6"},
              {label:"VALIDATED LIVE", value:nVerAll,              color:"#10B981"},
              {label:"CONFIRMED DEAD", value:nDeadAll,             color:"#EF4444"},
              {label:"NO LOGIN REQ",   value:nNoLoginAll,          color:"#1FC2C2"},
              {label:"YET TO CHECK",   value:totalAll-nChecked,    color:"#F59E0B"},
            ].map(s=>(
              <div key={s.label} style={{background:"#060F12",border:"1px solid #0D2A2A",borderRadius:"2px",padding:"16px 18px"}}>
                <div style={{fontFamily:"Syne,sans-serif",fontSize:"28px",fontWeight:800,color:s.color,lineHeight:1}}>{s.value}</div>
                <div style={{fontSize:"8px",color:"#82F9F6",opacity:.45,letterSpacing:".12em",marginTop:"5px"}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Per-category table */}
          <div style={{fontFamily:"Syne,sans-serif",fontSize:"13px",fontWeight:700,color:"#fff",marginBottom:"14px"}}>Per-Category Breakdown</div>
          <div style={{border:"1px solid #0D2A2A",borderRadius:"2px",overflow:"hidden",marginBottom:"28px"}}>
            <div style={{display:"grid",gridTemplateColumns:"180px repeat(6,1fr) 130px",background:"#060F12",borderBottom:"2px solid #1FC2C2",padding:"8px 16px",gap:"8px"}}>
              {["CATEGORY","TOTAL","LIVE","DEAD","PENDING","NO LOGIN","AI ADDED","PROGRESS"].map(h=>(
                <div key={h} style={{fontSize:"8px",color:"#1FC2C2",letterSpacing:".12em",fontWeight:700}}>{h}</div>
              ))}
            </div>
            {CATEGORIES.map((c,i)=>{
              const s = catStats(c.id,SEEDS,aiItems,statuses);
              const checked   = s.total-s.unverified;
              const checkPct  = s.total>0?Math.round((checked/s.total)*100):0;
              const livePct   = s.total>0?Math.round((s.live/s.total)*100):0;
              return (
                <div key={c.id} className="srow"
                  style={{display:"grid",gridTemplateColumns:"180px repeat(6,1fr) 130px",padding:"10px 16px",gap:"8px",background:i%2===0?"#060F12":"#070D10",borderBottom:i<CATEGORIES.length-1?"1px solid #0D2A2A":"none",alignItems:"center"}}
                  onClick={()=>{setView("registry");setActive(c.id);setFilter("all");}}
                  onMouseOver={e=>e.currentTarget.style.background="rgba(31,194,194,.04)"}
                  onMouseOut={e=>e.currentTarget.style.background=i%2===0?"#060F12":"#070D10"}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px"}}>
                    <span style={{color:c.color,fontSize:"12px"}}>{c.icon}</span>
                    <span style={{fontSize:"10px",fontWeight:700,color:c.color}}>{c.label}</span>
                  </div>
                  <div style={{fontSize:"12px",fontWeight:700,color:"#fff"}}>{s.total}</div>
                  <div style={{fontSize:"12px",fontWeight:700,color:s.live>0?"#10B981":"#444"}}>{s.live}</div>
                  <div style={{fontSize:"12px",fontWeight:700,color:s.dead>0?"#EF4444":"#444"}}>{s.dead}</div>
                  <div style={{fontSize:"12px",fontWeight:700,color:s.unverified>0?"#F59E0B":"#444"}}>{s.unverified}</div>
                  <div style={{fontSize:"12px",fontWeight:700,color:"#1FC2C2"}}>{s.noLogin}</div>
                  <div style={{fontSize:"12px",fontWeight:700,color:s.aiCount>0?"#9333EA":"#444"}}>{s.aiCount}</div>
                  <div>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:"3px"}}>
                      <span style={{fontSize:"8px",color:"#82F9F6",opacity:.4}}>CHECKED</span>
                      <span style={{fontSize:"8px",color:c.color,fontWeight:700}}>{checkPct}%</span>
                    </div>
                    <div style={{height:"4px",background:"#0D2A2A",borderRadius:"2px",overflow:"hidden"}}>
                      <div style={{width:`${checkPct}%`,height:"100%",background:c.color,borderRadius:"2px",transition:"width .5s ease"}}/>
                    </div>
                    {s.live>0&&<div style={{fontSize:"8px",color:"#10B981",opacity:.7,marginTop:"2px"}}>{livePct}% live</div>}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action cards */}
          <div style={{fontFamily:"Syne,sans-serif",fontSize:"13px",fontWeight:700,color:"#fff",marginBottom:"14px"}}>What To Do Next</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"12px"}}>
            {CATEGORIES.map(c=>{
              const s = catStats(c.id,SEEDS,aiItems,statuses);
              const actions = [];
              if (s.unverified>0) actions.push(`${s.unverified} datasets unchecked`);
              if (s.live===0&&s.total>0) actions.push("No live datasets — run Validate Tab");
              if (s.aiCount===0) actions.push("No AI suggestions — try Find More");
              if (actions.length===0) actions.push("All checked ✓");
              return (
                <div key={c.id} className="srow"
                  style={{background:"#060F12",border:"1px solid #0D2A2A",borderRadius:"2px",padding:"14px 16px"}}
                  onClick={()=>{setView("registry");setActive(c.id);setFilter("all");}}
                  onMouseOver={e=>e.currentTarget.style.borderColor=c.color+"60"}
                  onMouseOut={e=>e.currentTarget.style.borderColor="#0D2A2A"}>
                  <div style={{display:"flex",alignItems:"center",gap:"6px",marginBottom:"8px"}}>
                    <span style={{color:c.color}}>{c.icon}</span>
                    <span style={{fontFamily:"Syne,sans-serif",fontSize:"12px",fontWeight:700,color:c.color}}>{c.label}</span>
                    <span style={{marginLeft:"auto",fontSize:"9px",color:"#10B981",fontWeight:700}}>{s.live} live</span>
                  </div>
                  {actions.map((a,ai)=>(
                    <div key={ai} style={{fontSize:"9px",color:"#82F9F6",opacity:.55,lineHeight:1.6}}>· {a}</div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ REGISTRY VIEW ══ */}
      {view==="registry" && (
        <div>
          <div style={{display:"flex",overflowX:"auto",borderBottom:"1px solid #0D2A2A",background:"#060F12",padding:"0 28px"}}>
            {CATEGORIES.map(c=>{
              const isA = c.id===active;
              const s   = catStats(c.id,SEEDS,aiItems,statuses);
              return (
                <button key={c.id} className="ctab" onClick={()=>{setActive(c.id);setFilter("all");}}
                  style={{padding:"11px 13px",borderBottom:isA?`2px solid ${c.color}`:"2px solid transparent",color:isA?c.color:"#82F9F6",fontSize:"10px",letterSpacing:".06em",fontWeight:isA?700:400,opacity:isA?1:.45}}>
                  {c.icon} {c.label.toUpperCase()}
                  <span style={{fontSize:"9px",color:s.live>0?"#10B981":c.color,opacity:.7}}>{s.live>0?`✓${s.live}/${s.total}`:s.total}</span>
                </button>
              );
            })}
          </div>

          <div style={{padding:"20px 28px"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:"12px",flexWrap:"wrap",gap:"10px"}}>
              <div style={{display:"flex",alignItems:"center",gap:"8px",flexWrap:"wrap"}}>
                <span style={{fontFamily:"Syne,sans-serif",fontSize:"15px",fontWeight:700,color:cat.color}}>{cat.icon} {cat.label}</span>
                <div style={{display:"flex",gap:"4px",flexWrap:"wrap"}}>
                  {[
                    {key:"all",        label:`ALL (${allRows.length})`,      color:"#82F9F6"},
                    {key:"no-login",   label:`NO LOGIN (${nNoLogin})`,       color:"#1FC2C2"},
                    {key:"live",       label:`✓ LIVE (${nVerCat})`,          color:"#10B981"},
                    {key:"dead",       label:`✗ DEAD (${nDeadCat})`,         color:"#EF4444"},
                    {key:"unverified", label:`? PENDING (${nPendCat})`,      color:"#F59E0B"},
                    {key:"seed",       label:`CURATED (${seedRows.length})`, color:"#1FC2C2"},
                    {key:"ai",         label:`AI (${aiRows.length})`,        color:"#9333EA"},
                  ].map(f=>(
                    <button key={f.key} className="ftab" onClick={()=>setFilter(f.key)}
                      style={{background:filter===f.key?`${f.color}20`:"transparent",color:f.color,border:`1px solid ${filter===f.key?f.color:f.color+"28"}`,opacity:filter===f.key?1:.5}}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn" onClick={validateTab}
                style={{padding:"7px 13px",fontSize:"9px",background:"transparent",color:"#1FC2C2",border:"1px solid #1FC2C2"}}>
                ◈ VALIDATE TAB
              </button>
            </div>

            {/* Search section */}
            <div style={{background:"#060F12",border:"1px solid #0D2A2A",borderRadius:"2px",padding:"12px 14px",marginBottom:"14px"}}>
              <div style={{display:"flex",gap:"16px",flexWrap:"wrap",alignItems:"flex-start"}}>

                {/* AI-assisted search */}
                <div style={{flex:"1",minWidth:"280px"}}>
                  <div style={{fontSize:"8px",color:"#9333EA",letterSpacing:".12em",fontWeight:700,marginBottom:"7px"}}>◎ AI-ASSISTED — Claude suggests based on training data</div>
                  <div style={{display:"flex",gap:"0",border:"1px solid #9333EA30",borderRadius:"2px",overflow:"hidden",flexWrap:"wrap"}}>
                    {[
                      {key:"github",      label:"GitHub"},
                      {key:"zenodo",      label:"Zenodo"},
                      {key:"kaggle",      label:"Kaggle"},
                      {key:"gov",         label:"Gov"},
                      {key:"huggingface", label:"HuggingFace"},
                      {key:"dataverse",   label:"Dataverse"},
                      {key:"osf",         label:"OSF"},
                      {key:"mendeley",    label:"Mendeley"},
                    ].map(p=>(
                      <button key={p.key} onClick={()=>setAiPlatform(p.key)}
                        style={{padding:"5px 9px",fontSize:"8px",fontWeight:700,letterSpacing:".05em",cursor:"pointer",border:"none",fontFamily:"'Space Mono',monospace",background:aiPlatform===p.key?"#9333EA":"transparent",color:aiPlatform===p.key?"#fff":"#9333EA",transition:"all .12s",borderRight:"1px solid #9333EA20",whiteSpace:"nowrap"}}>
                        {p.label}
                      </button>
                    ))}
                    <button className="btn" onClick={()=>fetchAI(active,aiPlatform)} disabled={!!aiLoading[active]}
                      style={{padding:"5px 12px",fontSize:"9px",background:"#9333EA",color:"#fff",border:"none",borderRadius:"0",marginLeft:"auto"}}>
                      {aiLoading[active]?<span className="spin">◉</span>:"◎"} SEARCH
                    </button>
                  </div>
                </div>

                {/* Divider */}
                <div style={{width:"1px",background:"#0D2A2A",alignSelf:"stretch",minHeight:"40px"}}/>

                {/* Live search */}
                <div style={{flex:"1",minWidth:"280px"}}>
                  <div style={{fontSize:"8px",color:"#10B981",letterSpacing:".12em",fontWeight:700,marginBottom:"7px"}}>◈ LIVE SEARCH — Real results from open data APIs, no AI guessing</div>
                  <div style={{display:"flex",gap:"6px",flexWrap:"wrap"}}>
                    {/* Zenodo live */}
                    <button className="btn"
                      onClick={()=>liveSearchZenodo(active)}
                      disabled={!!liveLoading[`zenodo_${active}`]}
                      style={{padding:"5px 11px",fontSize:"9px",background:"transparent",color:"#10B981",border:"1px solid #10B98140"}}>
                      {liveLoading[`zenodo_${active}`]?<span className="spin">◉</span>:"◈"} Zenodo API
                    </button>
                    {/* CKAN portals */}
                    <div style={{display:"flex",gap:"0",border:"1px solid #10B98130",borderRadius:"2px",overflow:"hidden"}}>
                      {["data.gov","data.gov.uk","data.europa.eu","open.canada.ca"].map(p=>(
                        <button key={p} onClick={()=>setCkanPortal(p)}
                          style={{padding:"5px 8px",fontSize:"8px",fontWeight:700,cursor:"pointer",border:"none",fontFamily:"'Space Mono',monospace",background:ckanPortal===p?"#10B981":"transparent",color:ckanPortal===p?"#050C0F":"#10B981",transition:"all .12s",borderRight:"1px solid #10B98120",whiteSpace:"nowrap",letterSpacing:".04em"}}>
                          {p.replace("data.","").replace(".eu","").replace(".ca","")}
                        </button>
                      ))}
                      <button className="btn"
                        onClick={()=>liveSearchCKAN(active,ckanPortal)}
                        disabled={!!liveLoading[`ckan_${ckanPortal}_${active}`]}
                        style={{padding:"5px 10px",fontSize:"9px",background:"#10B981",color:"#050C0F",border:"none",borderRadius:"0"}}>
                        {liveLoading[`ckan_${ckanPortal}_${active}`]?<span className="spin">◉</span>:"◈"} SEARCH
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Errors */}
              {(aiError[active] || liveError[`zenodo_${active}`] || liveError[`ckan_${ckanPortal}_${active}`]) && (
                <div style={{marginTop:"8px",fontSize:"9px",color:"#F87171",background:"#1A0A0A",border:"1px solid #C23A3A30",borderRadius:"2px",padding:"6px 10px"}}>
                  {aiError[active] && <div>◎ AI: {aiError[active]}</div>}
                  {liveError[`zenodo_${active}`] && <div>◈ Zenodo: {liveError[`zenodo_${active}`]}</div>}
                  {liveError[`ckan_${ckanPortal}_${active}`] && <div>◈ CKAN: {liveError[`ckan_${ckanPortal}_${active}`]}</div>}
                </div>
              )}
            </div>

            <div style={{background:"#060F12",border:"1px solid #0D2A2A",borderRadius:"2px",padding:"9px 14px",marginBottom:"14px",fontSize:"9px",color:"#82F9F6",opacity:.5,lineHeight:1.7}}>
              <span style={{color:"#1FC2C2",opacity:1,fontWeight:700}}>HOW TO USE: </span>
              <strong>◈ CHECK</strong> validates URL + file size · <strong>▾ COLS</strong> fetches real column headers ·
              <span style={{color:"#10B981",opacity:1}}> Live Search returns real results from open data APIs.</span>
              <span style={{color:"#9333EA",opacity:1}}> AI Search suggests datasets from training data — always validate.</span>
              Results <span style={{color:"#10B981",opacity:1}}>auto-saved</span>.
            </div>

            <div style={{border:"1px solid #0D2A2A",borderRadius:"2px",overflow:"hidden"}}>
              {filteredRows.length===0&&(
                <div style={{padding:"32px",textAlign:"center",opacity:.3}}>
                  <div style={{fontFamily:"Syne,sans-serif",fontSize:"12px",color:"#82F9F6"}}>No datasets match this filter</div>
                </div>
              )}
              {filteredRows.map((row,i)=>{
                const stData    = statuses[row.url];
                const live      = stData?.status==="live";
                const dead      = ["dead","error","timeout"].includes(stData?.status);
                const isExp     = expanded[row.url];
                const checking  = validating[row.url];
                const fetchingC = fetching[row.url];
                const realCols  = stData?.real_columns;
                const dispCols  = realCols||row.columns||[];

                const stInfo = live
                  ? {bg:"#0D2E1A",color:"#10B981",border:"#10B98135",label:`✓ LIVE${stData?.size_mb?" · "+stData.size_mb+"MB":""}`}
                  : dead
                  ? {bg:"#1A0A0A",color:"#EF4444",border:"#EF444435",label:"✗ DEAD"}
                  : {bg:"#0D1B21",color:"#F59E0B",border:"#F59E0B30",label:"? PENDING"};
                const ftB = row.file_type==="xlsx"
                  ? {bg:"#0D1F0D",color:"#22C55E",border:"#22C55E30",label:"XLSX"}
                  : {bg:"#071A1A",color:"#1FC2C2",border:"#1FC2C230",label:"CSV"};

                return (
                  <div key={row.url} style={{borderBottom:i<filteredRows.length-1?"1px solid #0D2A2A":"none"}}>
                    <div className="drow" style={{display:"grid",gridTemplateColumns:"24px 60px 1fr auto",padding:"10px 14px",gap:"10px",background:i%2===0?"#060F12":"#070D10",alignItems:"center"}}>
                      <div style={{fontSize:"9px",color:cat.color,opacity:.3,fontWeight:700}}>{String(i+1).padStart(2,"0")}</div>
                      <div style={{display:"flex",flexDirection:"column",gap:"4px"}}>
                        <span style={{fontSize:"9px",fontWeight:700,padding:"2px 7px",borderRadius:"2px",background:ftB.bg,color:ftB.color,border:`1px solid ${ftB.border}`,letterSpacing:".08em"}}>{ftB.label}</span>
                        <span style={{fontSize:"9px",fontWeight:700,padding:"2px 7px",borderRadius:"2px",
                          background:row.source==="seed"?"#071A1A": row.platform?.startsWith("ckan")?"#071A13": row.platform?.startsWith("zenodo_live")?"#071A13":"#12071A",
                          color:row.source==="seed"?"#1FC2C2": row.platform?.startsWith("ckan")?"#10B981": row.platform==="zenodo_live"?"#10B981":"#9333EA",
                          border:row.source==="seed"?"1px solid #1FC2C218": (row.platform?.startsWith("ckan")||row.platform==="zenodo_live")?"1px solid #10B98120":"1px solid #9333EA20"}}>
                          {row.source==="seed"?"CURATED": row.platform==="zenodo_live"?"ZENODO LIVE": row.platform?.startsWith("ckan")?(row.portal||"CKAN").replace("data.","").toUpperCase():"AI"}
                        </span>
                      </div>
                      <div>
                        <div style={{fontSize:"11px",fontWeight:700,color:dead?"#555":"#fff",lineHeight:1.3,textDecoration:dead?"line-through":"none",marginBottom:"3px"}}>
                          {row.name}
                          {row.login&&<span style={{marginLeft:"6px",fontSize:"8px",color:"#F59E0B",background:"#1A1400",border:"1px solid #F59E0B25",borderRadius:"2px",padding:"1px 5px",fontWeight:700}}>LOGIN REQ</span>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:"10px",flexWrap:"wrap"}}>
                          <span style={{fontSize:"9px",color:dead?"#444":cat.color,maxWidth:"380px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} title={row.url}>{row.url.replace(/^https?:\/\//,"")}</span>
                          {row.records&&<span style={{fontSize:"9px",color:"#82F9F6",opacity:.4}}>{row.records} records</span>}
                          {row.source_org&&<span style={{fontSize:"9px",color:"#82F9F6",opacity:.3}}>{row.source_org}</span>}
                          {realCols&&<span style={{fontSize:"9px",color:"#10B981",opacity:.8}}>✓ real headers</span>}
                          {row.structural_warning&&<span style={{fontSize:"8px",color:"#F59E0B",background:"#1A1200",border:"1px solid #F59E0B30",borderRadius:"2px",padding:"1px 5px"}}>⚠ {row.structural_warning}</span>}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"4px",flexWrap:"nowrap"}}>
                        <a href={row.url} target="_blank" rel="noopener noreferrer"
                          style={{display:"inline-flex",alignItems:"center",padding:"4px 9px",background:"#0D1B21",color:cat.color,border:`1px solid ${cat.color}30`,borderRadius:"2px",fontSize:"9px",fontWeight:700,textDecoration:"none",whiteSpace:"nowrap"}}
                          onMouseOver={e=>e.currentTarget.style.borderColor=cat.color}
                          onMouseOut={e=>e.currentTarget.style.borderColor=cat.color+"30"}>↗ OPEN</a>
                        <button className="mbtn" onClick={()=>validate(row)} disabled={checking}
                          style={{background:"#071A1A",color:"#1FC2C2",border:"1px solid #1FC2C230"}}>
                          {checking?<span className="spin">◉</span>:"◈ CHECK"}</button>
                        <button className="mbtn"
                          onClick={()=>{setExpanded(p=>({...p,[row.url]:!p[row.url]}));if(!realCols&&!isExp)fetchHeaders(row);}}
                          style={{background:isExp?"#071A1A":"#0D1B21",color:cat.color,border:`1px solid ${cat.color}30`}}>
                          {fetchingC?<span className="spin">◉</span>:(isExp?"▴ COLS":"▾ COLS")}</button>
                        <button className="mbtn"
                          onClick={()=>setStatuses(p=>({...p,[row.url]:{...p[row.url],status:live?undefined:"live"}}))}
                          style={{background:live?"#0D2E1A":"#0D1B21",color:"#10B981",border:"1px solid #10B98135"}}>✓</button>
                        <button className="mbtn"
                          onClick={()=>setStatuses(p=>({...p,[row.url]:{...p[row.url],status:dead?undefined:"dead"}}))}
                          style={{background:dead?"#1A0A0A":"#0D1B21",color:"#EF4444",border:"1px solid #EF444435"}}>✗</button>
                        <span style={{fontSize:"9px",fontWeight:700,padding:"3px 8px",borderRadius:"2px",background:stInfo.bg,color:stInfo.color,border:`1px solid ${stInfo.border}`,whiteSpace:"nowrap"}}>{stInfo.label}</span>
                      </div>
                    </div>
                    {isExp&&(
                      <div className="sd" style={{background:"#040A0D",borderTop:`1px solid ${cat.color}20`,padding:"12px 14px 12px 94px"}}>
                        <div style={{fontSize:"9px",color:cat.color,letterSpacing:".1em",fontWeight:700,marginBottom:"8px",opacity:.7}}>
                          {realCols?`✓ REAL COLUMNS FROM FILE (${dispCols.length})`:`ESTIMATED COLUMNS (${dispCols.length})`}
                        </div>
                        {dispCols.length===0
                          ?<span style={{fontSize:"9px",color:"#82F9F6",opacity:.3}}>No column data available</span>
                          :dispCols.map((col,ci)=><span key={ci} className="cpill">{col}</span>)
                        }
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div style={{borderTop:"1px solid #0D2A2A",padding:"10px 28px",display:"flex",justifyContent:"space-between",fontSize:"9px",color:"#82F9F6",opacity:.25,letterSpacing:".1em"}}>
        <span>UNKNOWN SYSTEMS LTD // NANU DATASET REGISTRY</span>
        <span>DISCOVER • DISCUSS • DISCLOSE</span>
      </div>
    </div>
  );
}
