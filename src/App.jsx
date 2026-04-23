import { useState, useEffect, useMemo } from "react";

// ── Storage ───────────────────────────────────────────────────────────────────
const SK = { outlets:"tt_outlets_v3", sales:"tt_sales_v3", collections:"tt_collections_v3", targets:"tt_targets_v3", activityLog:"tt_log_v3", pins:"tt_pins_v3" };
const save = async (k,v) => { try { await window.storage.set(k, JSON.stringify(v)); } catch(e){} };
const load = async (k) => { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } };
const fmt = (n) => "৳ " + new Intl.NumberFormat("en-US").format(Math.round(n||0));
const todayStr = () => new Date().toISOString().split("T")[0];
const daysSince = (d) => d ? Math.floor((Date.now()-new Date(d).getTime())/86400000) : 999;
const nowTs = () => new Date().toLocaleString("en-US",{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"});

// ── Helpers ───────────────────────────────────────────────────────────────────
const getStatus = (outlet, collections) => {
  const cols = collections.filter(c=>c.outletId===outlet.id);
  const last = [...cols].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const days = daysSince(last?.date); const due = outlet.totalDue||0;
  if(due===0) return "good";
  if(days>30||due>50000) return "danger";
  if(days>14||due>20000) return "warning";
  return "good";
};
const STATUS_META = {
  danger:  {color:"#ef4444",bg:"#1f0a0a",border:"#7f1d1d",label:"🚨 High Risk"},
  warning: {color:"#f59e0b",bg:"#1c1200",border:"#78350f",label:"⚠️ Needs Attention"},
  good:    {color:"#22c55e",bg:"#0a1f0f",border:"#14532d",label:"✅ Healthy"},
};
const getGrade = (outlet, collections, sales) => {
  const cols = collections.filter(c=>c.outletId===outlet.id);
  const sals = sales.filter(s=>s.outletId===outlet.id);
  const totalSales = sals.reduce((s,x)=>s+x.amount,0);
  const totalCollected = cols.reduce((s,c)=>s+c.amount,0);
  const last = [...cols].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const days = daysSince(last?.date); const due = outlet.totalDue||0;
  const rate = totalSales>0 ? totalCollected/totalSales : due===0?1:0;
  let score = Math.round(rate*40);
  if(days<=7) score+=30; else if(days<=14) score+=22; else if(days<=30) score+=12; else if(days<=60) score+=4;
  if(due===0) score+=30; else if(due<10000) score+=22; else if(due<25000) score+=14; else if(due<50000) score+=6;
  if(score>=85) return {grade:"A+",label:"Excellent",color:"#22c55e"};
  if(score>=70) return {grade:"A", label:"Very Good",color:"#4ade80"};
  if(score>=55) return {grade:"B", label:"Good",     color:"#60a5fa"};
  if(score>=40) return {grade:"C", label:"Average",  color:"#f59e0b"};
  if(score>=25) return {grade:"D", label:"Poor",     color:"#f97316"};
  return              {grade:"F", label:"Critical", color:"#ef4444"};
};

const exportPDF = (outlets, collections, sales) => {
  const fN = (n) => "৳ "+new Intl.NumberFormat("en-US").format(Math.round(n||0));
  const rows = outlets.map(o=>{
    const cols = [...collections].filter(c=>c.outletId===o.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
    const sals = sales.filter(s=>s.outletId===o.id);
    const g = getGrade(o,collections,sales);
    return {...o, totalSales:sals.reduce((s,x)=>s+x.amount,0), totalCollected:cols.reduce((s,c)=>s+c.amount,0), lastPayment:cols[0]?.date||"Never", grade:g};
  }).sort((a,b)=>["A+","A","B","C","D","F"].indexOf(a.grade.grade)-["A+","A","B","C","D","F"].indexOf(b.grade.grade));
  const gc = {"A+":"#16a34a","A":"#22c55e","B":"#3b82f6","C":"#f59e0b","D":"#f97316","F":"#ef4444"};
  const sum = {due:outlets.reduce((s,o)=>s+(o.totalDue||0),0), sales:sales.reduce((s,x)=>s+x.amount,0), col:collections.reduce((s,x)=>s+x.amount,0)};
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>TradeTrack Report</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;font-size:12px;color:#111}
  .hdr{background:linear-gradient(135deg,#1e1b4b,#312e81);color:#fff;padding:24px 32px}.hdr h1{font-size:24px;font-weight:800}
  .hdr p{font-size:11px;opacity:.7;margin-top:3px}.sum{display:flex;gap:12px;padding:16px 32px;background:#f8f8ff;border-bottom:2px solid #e5e5f0}
  .sb{flex:1;background:#fff;border-radius:8px;padding:10px;border:1px solid #e5e5f0;text-align:center}.sb .v{font-size:16px;font-weight:800;color:#312e81}.sb .l{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.5px}
  .leg{display:flex;gap:10px;padding:10px 32px;background:#fafafe;font-size:10px;flex-wrap:wrap;border-bottom:1px solid #e5e5f0}
  .li{display:flex;align-items:center;gap:4px}.ld{width:8px;height:8px;border-radius:50%}
  .st{padding:12px 32px 6px;font-size:12px;font-weight:700;color:#312e81;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e5f0}
  table{width:100%;border-collapse:collapse}th{background:#1e1b4b;color:#fff;padding:9px 10px;font-size:10px;text-align:left;font-weight:600}
  td{padding:8px 10px;border-bottom:1px solid #f0f0f8;font-size:11px;vertical-align:middle}tr:nth-child(even) td{background:#fafafe}
  .gb{display:inline-block;padding:2px 8px;border-radius:20px;font-weight:800;font-size:12px;color:#fff;text-align:center}
  .ftr{padding:16px 32px;font-size:10px;color:#aaa;border-top:1px solid #e5e5f0;display:flex;justify-content:space-between}
  @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>
  <div class="hdr"><h1>◈ TradeTrack Pro</h1><p>Glassware & Ceramics — ${new Date().toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p></div>
  <div class="sum"><div class="sb"><div class="v">${outlets.length}</div><div class="l">Outlets</div></div><div class="sb"><div class="v" style="color:#1d4ed8">${fN(sum.sales)}</div><div class="l">Total Sales</div></div><div class="sb"><div class="v" style="color:#16a34a">${fN(sum.col)}</div><div class="l">Collected</div></div><div class="sb"><div class="v" style="color:#dc2626">${fN(sum.due)}</div><div class="l">Outstanding</div></div></div>
  <div class="leg"><strong>Grades:</strong>${[["A+","#16a34a","Excellent"],["A","#22c55e","Very Good"],["B","#3b82f6","Good"],["C","#f59e0b","Average"],["D","#f97316","Poor"],["F","#ef4444","Critical"]].map(([g,c,l])=>`<div class="li"><div class="ld" style="background:${c}"></div><strong>${g}</strong>–${l}</div>`).join("")}</div>
  <div class="st">All Outlets (${rows.length}) — Sorted by Grade</div>
  <table><thead><tr><th>#</th><th>Outlet</th><th>Area</th><th>Contact</th><th>Total Sales</th><th>Collected</th><th>Outstanding</th><th>Last Payment</th><th>Grade</th><th>Status</th></tr></thead><tbody>
  ${rows.map((o,i)=>`<tr><td style="color:#888">${i+1}</td><td><strong>${o.name}</strong></td><td>${o.area||"—"}</td><td>${o.contact||"—"}</td><td style="color:#1d4ed8;font-weight:600">${fN(o.totalSales)}</td><td style="color:#16a34a;font-weight:600">${fN(o.totalCollected)}</td><td style="color:${o.totalDue>0?"#dc2626":"#16a34a"};font-weight:700">${fN(o.totalDue)}</td><td>${o.lastPayment}</td><td><span class="gb" style="background:${gc[o.grade.grade]}">${o.grade.grade}</span></td><td style="color:${o.grade.color};font-weight:600">${o.grade.label}</td></tr>`).join("")}
  </tbody></table>
  <div class="ftr"><span>TradeTrack Pro — Confidential</span><span>${new Date().toLocaleString()}</span></div></body></html>`;
  const win = window.open("","_blank"); win.document.write(html); win.document.close(); setTimeout(()=>win.print(),600);
};

const backupData = (outlets, sales, collections, activityLog) => {
  const data = {version:3,exportedAt:new Date().toISOString(),outlets,sales,collections,activityLog};
  const blob = new Blob([JSON.stringify(data,null,2)],{type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href=url; a.download=`tradetrack_backup_${todayStr()}.json`; a.click();
};

const sendDailySummary = (outlets, collections, sales, contact) => {
  const t = todayStr();
  const totalCol = collections.filter(c=>c.date===t).reduce((s,c)=>s+c.amount,0);
  const totalSale = sales.filter(s=>s.date===t).reduce((s,x)=>s+x.amount,0);
  const totalDue = outlets.reduce((s,o)=>s+(o.totalDue||0),0);
  const lines = [`📊 *TradeTrack Daily Summary*`,`📅 ${new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}`,``,`💰 Collected Today: ৳${new Intl.NumberFormat("en-US").format(Math.round(totalCol))}`,`📦 Sales Today: ৳${new Intl.NumberFormat("en-US").format(Math.round(totalSale))}`,`📋 Total Outstanding: ৳${new Intl.NumberFormat("en-US").format(Math.round(totalDue))}`,`🏪 Active Outlets: ${outlets.length}`,``,`_Sent from TradeTrack Pro_`];
  window.open(`https://wa.me/${contact?.replace(/\D/g,"")}?text=${encodeURIComponent(lines.join("\n"))}`,"_blank");
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({pins, onLogin}) {
  const [pin,setPin] = useState(""); const [err,setErr] = useState(false);
  const tryLogin = () => {
    if(pin===pins.owner){onLogin("owner");setPin("");}
    else if(pin===pins.staff){onLogin("staff");setPin("");}
    else{setErr(true);setTimeout(()=>setErr(false),1500);setPin("");}
  };
  return (
    <div style={{minHeight:"100vh",background:"#080810",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:24}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Cormorant+Garamond:wght@700&display=swap" rel="stylesheet"/>
      <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:32,color:"#a78bfa",marginBottom:4}}>◈ TradeTrack Pro</div>
      <div style={{fontSize:11,color:"#4b5563",letterSpacing:3,textTransform:"uppercase",marginBottom:40}}>Glassware & Ceramics</div>
      <div style={{background:"#0d0d1f",borderRadius:16,padding:28,width:"100%",maxWidth:320,border:"1px solid #1a1a35"}}>
        <div style={{fontWeight:700,fontSize:16,marginBottom:6,textAlign:"center",color:"#e2e0f0"}}>Enter PIN</div>
        <div style={{fontSize:12,color:"#4b5563",textAlign:"center",marginBottom:20}}>Owner or Staff PIN to continue</div>
        <input type="password" inputMode="numeric" value={pin} onChange={e=>setPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&tryLogin()} placeholder="••••" maxLength={8}
          style={{width:"100%",background:"#080810",border:`1px solid ${err?"#ef4444":"#1a1a35"}`,color:"#e2e0f0",borderRadius:10,padding:"14px",fontSize:22,textAlign:"center",letterSpacing:8,boxSizing:"border-box",outline:"none",marginBottom:err?4:12}}/>
        {err&&<div style={{color:"#ef4444",fontSize:12,textAlign:"center",marginBottom:10}}>Wrong PIN. Try again.</div>}
        <button onClick={tryLogin} style={{width:"100%",background:"#7c3aed",border:"none",color:"#fff",borderRadius:10,padding:13,fontSize:15,fontWeight:700,cursor:"pointer"}}>Login</button>
        <div style={{fontSize:11,color:"#2a2a4a",textAlign:"center",marginTop:16}}>Default: Owner PIN 1234 · Staff PIN 0000</div>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [outlets,setOutlets] = useState([]);
  const [sales,setSales] = useState([]);
  const [collections,setCollections] = useState([]);
  const [targets,setTargets] = useState({daily:0,monthly:0,ownerContact:""});
  const [activityLog,setActivityLog] = useState([]);
  const [pins,setPins] = useState({owner:"1234",staff:"0000"});
  const [role,setRole] = useState(null);
  const [loaded,setLoaded] = useState(false);
  const [tab,setTab] = useState("Dashboard");
  const [search,setSearch] = useState("");
  const [areaFilter,setAreaFilter] = useState("All");
  const [modal,setModal] = useState(null);
  const [editing,setEditing] = useState(null);
  const [toast,setToast] = useState(null);

  useEffect(()=>{
    (async()=>{
      const [o,s,c,t,l,p] = await Promise.all([load(SK.outlets),load(SK.sales),load(SK.collections),load(SK.targets),load(SK.activityLog),load(SK.pins)]);
      if(o) setOutlets(o); if(s) setSales(s); if(c) setCollections(c);
      if(t) setTargets(t); if(l) setActivityLog(l); if(p) setPins(p);
      setLoaded(true);
    })();
  },[]);

  useEffect(()=>{ if(loaded) save(SK.outlets,outlets); },[outlets,loaded]);
  useEffect(()=>{ if(loaded) save(SK.sales,sales); },[sales,loaded]);
  useEffect(()=>{ if(loaded) save(SK.collections,collections); },[collections,loaded]);
  useEffect(()=>{ if(loaded) save(SK.targets,targets); },[targets,loaded]);
  useEffect(()=>{ if(loaded) save(SK.activityLog,activityLog); },[activityLog,loaded]);
  useEffect(()=>{ if(loaded) save(SK.pins,pins); },[pins,loaded]);

  const log = (action,detail) => setActivityLog(p=>[{id:Date.now().toString(),action,detail,role,ts:nowTs(),date:todayStr()},...p].slice(0,300));
  const showToast = (msg,type="success") => { setToast({msg,type}); setTimeout(()=>setToast(null),2500); };
  const isOwner = role==="owner";
  const isStaff = role==="staff";

  const areas = useMemo(()=>["All",...new Set(outlets.map(o=>o.area).filter(Boolean))],[outlets]);
  const filteredOutlets = useMemo(()=>{
    let list = outlets;
    if(search) list=list.filter(o=>o.name.toLowerCase().includes(search.toLowerCase())||(o.contact||"").includes(search)||(o.area||"").toLowerCase().includes(search.toLowerCase()));
    if(areaFilter!=="All") list=list.filter(o=>o.area===areaFilter);
    return list;
  },[outlets,search,areaFilter]);

  const todayCollected = useMemo(()=>collections.filter(c=>c.date===todayStr()).reduce((s,c)=>s+c.amount,0),[collections]);
  const monthCollected = useMemo(()=>{ const m=new Date().toISOString().slice(0,7); return collections.filter(c=>c.date?.startsWith(m)).reduce((s,c)=>s+c.amount,0); },[collections]);
  const totalDue = useMemo(()=>outlets.reduce((s,o)=>s+(o.totalDue||0),0),[outlets]);
  const atRisk = useMemo(()=>outlets.filter(o=>["danger","warning"].includes(getStatus(o,collections))).length,[outlets,collections]);
  const topOutlets = useMemo(()=>[...outlets].sort((a,b)=>{
    const aT=collections.filter(c=>c.outletId===a.id).reduce((s,c)=>s+c.amount,0);
    const bT=collections.filter(c=>c.outletId===b.id).reduce((s,c)=>s+c.amount,0);
    return bT-aT;
  }).slice(0,5),[outlets,collections]);

  const getOutletTrend = (outletId) => {
    const months=[];
    for(let i=2;i>=0;i--){const d=new Date();d.setMonth(d.getMonth()-i);const m=d.toISOString().slice(0,7);months.push(collections.filter(c=>c.outletId===outletId&&c.date?.startsWith(m)).reduce((s,c)=>s+c.amount,0));}
    if(months[2]>months[1]&&months[1]>=months[0]) return {label:"📈 Growing",color:"#22c55e"};
    if(months[2]<months[1]&&months[1]<=months[0]) return {label:"📉 Declining",color:"#ef4444"};
    return {label:"➡️ Stable",color:"#f59e0b"};
  };

  const exportCSV = () => {
    const rows=[["Outlet","Area","Contact","Total Due","Status"]];
    outlets.forEach(o=>rows.push([o.name,o.area||"",o.contact||"",o.totalDue||0,getStatus(o,collections)]));
    const blob=new Blob([rows.map(r=>r.join(",")).join("\n")],{type:"text/csv"});
    const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=`tradetrack_${todayStr()}.csv`; a.click();
    showToast("Exported!");
  };
  const whatsapp = (outlet) => window.open(`https://wa.me/${outlet.contact?.replace(/\D/g,"")}?text=${encodeURIComponent(`Hello ${outlet.name}, your outstanding due is ${fmt(outlet.totalDue)}. Please arrange payment. Thank you.`)}`,"_blank");

  if(!loaded) return <div style={{minHeight:"100vh",background:"#080810",display:"flex",alignItems:"center",justifyContent:"center",color:"#4b5563"}}>Loading...</div>;
  if(!role) return <LoginScreen pins={pins} onLogin={(r)=>{setRole(r);log("Login",`Logged in as ${r}`);setTab("Dashboard");}}/>;

  const TABS = isOwner ? ["Dashboard","Outlets","Sales","Collections","Dues & Alerts","Reports","Activity Log","Settings"] : ["Dashboard","Outlets","Sales","Collections"];

  return (
    <div style={{minHeight:"100vh",background:"#080810",color:"#e2e0f0",fontFamily:"'Sora',sans-serif",paddingBottom:80}}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Cormorant+Garamond:wght@700&display=swap" rel="stylesheet"/>
      {toast&&<div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",background:toast.type==="success"?"#065f46":"#7f1d1d",color:"#fff",padding:"10px 20px",borderRadius:30,fontSize:13,fontWeight:600,zIndex:999,whiteSpace:"nowrap",boxShadow:"0 4px 20px #0008"}}>{toast.msg}</div>}

      {/* Header */}
      <div style={{background:"linear-gradient(180deg,#0d0d1f,#080810)",borderBottom:"1px solid #1a1a35",padding:"12px 16px",position:"sticky",top:0,zIndex:90}}>
        <div style={{maxWidth:860,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontFamily:"'Cormorant Garamond',serif",fontSize:20,color:"#a78bfa",letterSpacing:1}}>◈ TradeTrack Pro</div>
            <div style={{display:"flex",alignItems:"center",gap:5,marginTop:1}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:isOwner?"#a78bfa":"#22c55e"}}/>
              <span style={{fontSize:10,color:"#4b5563",textTransform:"uppercase",letterSpacing:1}}>{isOwner?"Owner":"Staff"}</span>
            </div>
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end"}}>
            {isOwner&&<Btn color="#7c3aed" onClick={()=>{setEditing(null);setModal("outlet");}}>+ Outlet</Btn>}
            <Btn color="#0369a1" onClick={()=>setModal("sale")}>+ Sale</Btn>
            <Btn color="#065f46" onClick={()=>setModal("collection")}>+ Collect</Btn>
            <Btn color="#1a1a2e" onClick={()=>{log("Logout","");setRole(null);setTab("Dashboard");}}>🚪</Btn>
          </div>
        </div>
      </div>

      {isStaff&&<div style={{background:"#1c1200",borderBottom:"1px solid #78350f",padding:"7px 16px",fontSize:12,color:"#f59e0b",textAlign:"center"}}>⚠️ Staff mode — entries only for today. Past records are locked.</div>}

      {/* Tabs */}
      <div style={{background:"#0d0d1f",borderBottom:"1px solid #1a1a35",overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
        <div style={{display:"flex",maxWidth:860,margin:"0 auto",padding:"0 16px",minWidth:"max-content"}}>
          {TABS.map(t=><button key={t} onClick={()=>setTab(t)} style={{background:"none",border:"none",color:tab===t?"#a78bfa":"#4b5563",borderBottom:tab===t?"2px solid #7c3aed":"2px solid transparent",padding:"11px 13px",cursor:"pointer",fontSize:12,fontWeight:tab===t?700:400,whiteSpace:"nowrap"}}>{t}</button>)}
        </div>
      </div>

      <div style={{maxWidth:860,margin:"0 auto",padding:"16px"}}>

        {/* ── DASHBOARD ── */}
        {tab==="Dashboard"&&(
          <div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
              {[{label:"Total Outlets",value:outlets.length,icon:"🏪",color:"#7c3aed"},{label:"At Risk",value:atRisk,icon:"⚠️",color:atRisk>0?"#ef4444":"#22c55e"},{label:"Today Collected",value:fmt(todayCollected),icon:"💰",color:"#22c55e"},{label:"Total Dues",value:fmt(totalDue),icon:"📋",color:totalDue>0?"#ef4444":"#22c55e"}].map(s=>(
                <div key={s.label} style={{background:"#0d0d1f",border:`1px solid ${s.color}22`,borderRadius:12,padding:14}}>
                  <div style={{fontSize:20}}>{s.icon}</div>
                  <div style={{fontSize:18,fontWeight:800,color:s.color,marginTop:6,letterSpacing:-0.5}}>{s.value}</div>
                  <div style={{fontSize:11,color:"#4b5563",marginTop:2}}>{s.label}</div>
                </div>
              ))}
            </div>

            {isOwner&&<>
              <div style={{background:"#0d0d1f",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #1a1a35"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontWeight:700,fontSize:13,color:"#a78bfa"}}>🎯 Collection Targets</span>
                  <button onClick={()=>setModal("target")} style={{background:"none",border:"1px solid #2a2a4a",color:"#6b7280",borderRadius:6,padding:"3px 10px",fontSize:11,cursor:"pointer"}}>Set</button>
                </div>
                <ProgressBar label="Today" current={todayCollected} target={targets.daily} fmt={fmt} color="#22c55e"/>
                <ProgressBar label="This Month" current={monthCollected} target={targets.monthly} fmt={fmt} color="#60a5fa"/>
              </div>
              <div style={{background:"#0d0d1f",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #1a1a35"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:12}}>🏆 Top Outlets</div>
                {topOutlets.length===0&&<div style={{color:"#4b5563",fontSize:13}}>No data yet.</div>}
                {topOutlets.map((o,i)=>{
                  const total=collections.filter(c=>c.outletId===o.id).reduce((s,c)=>s+c.amount,0);
                  const trend=getOutletTrend(o.id);
                  return <div key={o.id} onClick={()=>{setEditing(o);setModal("outletDetail");}} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #111120",cursor:"pointer"}}>
                    <div style={{width:26,height:26,borderRadius:"50%",background:i===0?"#f59e0b":i===1?"#9ca3af":i===2?"#b45309":"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:i<3?"#000":"#6b7280",flexShrink:0}}>{i+1}</div>
                    <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{o.name}</div><div style={{fontSize:11,color:trend.color}}>{trend.label}</div></div>
                    <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:13,color:"#22c55e",fontWeight:600}}>{fmt(total)}</div>{o.totalDue>0&&<div style={{fontSize:10,color:"#ef4444"}}>{fmt(o.totalDue)} due</div>}</div>
                  </div>;
                })}
              </div>
              <div style={{background:"#0d0d1f",borderRadius:12,padding:14,border:"1px solid #1a1a35"}}>
                <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:8}}>💬 Daily WhatsApp Summary</div>
                <div style={{fontSize:12,color:"#6b7280",marginBottom:10}}>Send today's report to owner's WhatsApp in one tap.</div>
                <button onClick={()=>sendDailySummary(outlets,collections,sales,targets.ownerContact)} style={{background:"#1a3a2a",border:"1px solid #14532d",color:"#4ade80",borderRadius:8,padding:"9px 16px",fontSize:13,fontWeight:600,cursor:"pointer",width:"100%"}}>📤 Send Today's Summary</button>
              </div>
            </>}

            {isStaff&&<div style={{background:"#0d0d1f",borderRadius:12,padding:14,border:"1px solid #1a1a35"}}>
              <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:12}}>📋 Your Entries Today</div>
              {[...collections.filter(c=>c.date===todayStr()&&c.role==="staff"),...sales.filter(s=>s.date===todayStr()&&s.role==="staff")].length===0
                ?<div style={{color:"#4b5563",fontSize:13}}>No entries yet today.</div>
                :<>{collections.filter(c=>c.date===todayStr()&&c.role==="staff").map(c=>{const o=outlets.find(x=>x.id===c.outletId);return <div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #111120",fontSize:13}}><span style={{color:"#6b7280"}}>{o?.name} · 💰 collect</span><span style={{color:"#22c55e",fontWeight:600}}>{fmt(c.amount)}</span></div>;})}
                {sales.filter(s=>s.date===todayStr()&&s.role==="staff").map(s=>{const o=outlets.find(x=>x.id===s.outletId);return <div key={s.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #111120",fontSize:13}}><span style={{color:"#6b7280"}}>{o?.name} · 📦 sale</span><span style={{color:"#60a5fa",fontWeight:600}}>{fmt(s.amount)}</span></div>;})}</>}
            </div>}
          </div>
        )}

        {/* ── OUTLETS ── */}
        {tab==="Outlets"&&(
          <div>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search name, area, phone..." style={{...inputSt,marginBottom:10}}/>
            {areas.length>1&&<div style={{display:"flex",gap:6,marginBottom:12,overflowX:"auto",paddingBottom:4}}>{areas.map(a=><button key={a} onClick={()=>setAreaFilter(a)} style={{background:areaFilter===a?"#7c3aed":"#1a1a2e",border:"none",color:areaFilter===a?"#fff":"#6b7280",borderRadius:20,padding:"5px 12px",fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>{a}</button>)}</div>}
            <div style={{fontSize:12,color:"#4b5563",marginBottom:10}}>{filteredOutlets.length} outlets</div>
            {filteredOutlets.length===0&&<Empty icon="🏪" text="No outlets found."/>}
            {filteredOutlets.map(o=><OutletCard key={o.id} outlet={o} collections={collections} fmt={fmt} isOwner={isOwner} trend={getOutletTrend(o.id)}
              onEdit={()=>{setEditing(o);setModal("outlet");}}
              onDelete={()=>{setOutlets(p=>p.filter(x=>x.id!==o.id));setCollections(p=>p.filter(c=>c.outletId!==o.id));setSales(p=>p.filter(s=>s.outletId!==o.id));log("Delete Outlet",o.name);showToast("Deleted");}}
              onCollect={()=>{setEditing(o);setModal("collection");}}
              onSale={()=>{setEditing(o);setModal("sale");}}
              onWhatsapp={()=>whatsapp(o)}
              onView={()=>{setEditing(o);setModal("outletDetail");}}
            />)}
          </div>
        )}

        {/* ── SALES ── */}
        {tab==="Sales"&&(
          <div>
            <div style={{fontSize:12,color:"#4b5563",marginBottom:10}}>{sales.length} records</div>
            {sales.length===0&&<Empty icon="📦" text="No sales yet."/>}
            {[...sales].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(s=>{
              const o=outlets.find(x=>x.id===s.outletId); const frozen=isStaff&&s.date!==todayStr();
              return <div key={s.id} style={{background:"#0d0d1f",borderRadius:10,padding:"12px 14px",marginBottom:8,border:"1px solid #1a1a35",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:frozen?0.45:1}}>
                <div><div style={{fontWeight:600,fontSize:14}}>{o?.name||"?"}</div><div style={{fontSize:11,color:"#4b5563",marginTop:2}}>{s.date}{s.items?` · ${s.items}`:""}{s.deliveryStatus?` · ${s.deliveryStatus==="delivered"?"✅":"🕐"} ${s.deliveryStatus}`:""}</div></div>
                <div style={{textAlign:"right"}}><div style={{color:"#60a5fa",fontWeight:700}}>{fmt(s.amount)}</div>{frozen&&<div style={{fontSize:10,color:"#4b5563"}}>🔒 locked</div>}</div>
              </div>;
            })}
          </div>
        )}

        {/* ── COLLECTIONS ── */}
        {tab==="Collections"&&(
          <div>
            <div style={{fontSize:12,color:"#4b5563",marginBottom:10}}>{collections.length} records</div>
            {collections.length===0&&<Empty icon="💰" text="No collections yet."/>}
            {[...collections].sort((a,b)=>new Date(b.date)-new Date(a.date)).map(c=>{
              const o=outlets.find(x=>x.id===c.outletId); const frozen=isStaff&&c.date!==todayStr();
              return <div key={c.id} style={{background:"#0d0d1f",borderRadius:10,padding:"12px 14px",marginBottom:8,border:"1px solid #1a1a35",display:"flex",justifyContent:"space-between",alignItems:"center",opacity:frozen?0.45:1}}>
                <div><div style={{fontWeight:600,fontSize:14}}>{o?.name||"?"}</div><div style={{fontSize:11,color:"#4b5563",marginTop:2}}>{c.date}{c.payMethod?` · ${c.payMethod}`:""}{c.note?` · ${c.note}`:""}</div></div>
                <div style={{textAlign:"right"}}><div style={{color:"#22c55e",fontWeight:700}}>{fmt(c.amount)}</div>{frozen&&<div style={{fontSize:10,color:"#4b5563"}}>🔒 locked</div>}</div>
              </div>;
            })}
          </div>
        )}

        {/* ── DUES & ALERTS ── */}
        {tab==="Dues & Alerts"&&isOwner&&(
          <div>
            {["danger","warning","good"].map(level=>{
              const list=outlets.filter(o=>getStatus(o,collections)===level); if(!list.length) return null;
              const m=STATUS_META[level];
              return <div key={level} style={{marginBottom:20}}>
                <div style={{fontWeight:700,color:m.color,marginBottom:10,fontSize:13,textTransform:"uppercase",letterSpacing:1}}>{m.label} ({list.length})</div>
                {list.map(o=>{
                  const last=[...collections].filter(c=>c.outletId===o.id).sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
                  return <div key={o.id} style={{background:m.bg,borderRadius:10,padding:"12px 14px",marginBottom:8,border:`1px solid ${m.border}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div><div style={{fontWeight:600,fontSize:14}}>{o.name}</div><div style={{fontSize:11,color:"#6b7280",marginTop:3}}>{o.area&&`📍 ${o.area} · `}{last?`Last paid ${daysSince(last.date)}d ago`:"Never paid"}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontWeight:700,color:m.color,fontSize:15}}>{fmt(o.totalDue)}</div><div style={{fontSize:10,color:"#6b7280"}}>outstanding</div></div>
                    </div>
                    <div style={{display:"flex",gap:6,marginTop:8}}>
                      {o.contact&&<button onClick={()=>whatsapp(o)} style={{background:"#1a3a2a",border:"1px solid #14532d",color:"#4ade80",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer"}}>💬 WhatsApp</button>}
                      {o.mapsUrl&&<button onClick={()=>window.open(o.mapsUrl,"_blank")} style={{background:"#0f2030",border:"1px solid #1e3a5f",color:"#60a5fa",borderRadius:6,padding:"5px 12px",fontSize:11,cursor:"pointer"}}>📍 Maps</button>}
                    </div>
                  </div>;
                })}
              </div>;
            })}
            {outlets.length===0&&<Empty icon="📋" text="Add outlets to see due tracking."/>}
          </div>
        )}

        {/* ── REPORTS ── */}
        {tab==="Reports"&&isOwner&&<ReportsTab outlets={outlets} sales={sales} collections={collections} fmt={fmt} onExport={exportCSV} onExportPDF={()=>exportPDF(outlets,collections,sales)} onBackup={()=>{backupData(outlets,sales,collections,activityLog);showToast("Backup downloaded!");}} getGrade={getGrade} getOutletTrend={getOutletTrend}/>}

        {/* ── ACTIVITY LOG ── */}
        {tab==="Activity Log"&&isOwner&&(
          <div>
            <div style={{fontSize:12,color:"#4b5563",marginBottom:12}}>{activityLog.length} actions logged</div>
            {activityLog.length===0&&<Empty icon="📝" text="No activity yet."/>}
            {activityLog.map(l=>(
              <div key={l.id} style={{background:"#0d0d1f",borderRadius:10,padding:"10px 14px",marginBottom:6,border:"1px solid #1a1a35",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div><div style={{fontSize:13,fontWeight:600}}>{l.action}</div><div style={{fontSize:11,color:"#4b5563",marginTop:1}}>{l.detail}</div></div>
                <div style={{textAlign:"right",flexShrink:0,marginLeft:8}}><div style={{fontSize:11,color:l.role==="owner"?"#a78bfa":"#22c55e"}}>{l.role}</div><div style={{fontSize:10,color:"#4b5563"}}>{l.ts}</div></div>
              </div>
            ))}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab==="Settings"&&isOwner&&<SettingsTab pins={pins} setPins={setPins} targets={targets} setTargets={setTargets} showToast={showToast} log={log}/>}
      </div>

      {/* MODALS */}
      {modal==="outlet"&&isOwner&&<OutletModal outlet={editing} onClose={()=>{setModal(null);setEditing(null);}} onSave={data=>{if(editing){setOutlets(p=>p.map(o=>o.id===editing.id?{...o,...data}:o));log("Edit Outlet",data.name);showToast("Updated!");}else{setOutlets(p=>[...p,{id:Date.now().toString(),createdAt:new Date().toISOString(),totalDue:0,...data}]);log("Add Outlet",data.name);showToast("Added!");}setModal(null);setEditing(null);}}/>}
      {modal==="sale"&&<SaleModal outlets={outlets} preSelected={editing?.id} isStaff={isStaff} onClose={()=>{setModal(null);setEditing(null);}} onSave={data=>{const e={id:Date.now().toString(),role,...data};setSales(p=>[...p,e]);setOutlets(p=>p.map(o=>o.id===data.outletId?{...o,totalDue:(o.totalDue||0)+data.amount}:o));log("Sale",`${outlets.find(o=>o.id===data.outletId)?.name} ${fmt(data.amount)}`);showToast("Sale recorded!");setModal(null);setEditing(null);}}/>}
      {modal==="collection"&&<CollectionModal outlets={outlets} preSelected={editing?.id} isStaff={isStaff} onClose={()=>{setModal(null);setEditing(null);}} onSave={data=>{const e={id:Date.now().toString(),role,...data};setCollections(p=>[...p,e]);setOutlets(p=>p.map(o=>o.id===data.outletId?{...o,totalDue:Math.max(0,(o.totalDue||0)-data.amount)}:o));log("Collection",`${outlets.find(o=>o.id===data.outletId)?.name} ${fmt(data.amount)}`);showToast("Saved!");setModal(null);setEditing(null);}}/>}
      {modal==="target"&&<TargetModal targets={targets} onClose={()=>setModal(null)} onSave={t=>{setTargets(t);showToast("Targets saved!");setModal(null);}}/>}
      {modal==="outletDetail"&&editing&&<OutletDetailModal outlet={editing} collections={collections} sales={sales} fmt={fmt} isOwner={isOwner} onClose={()=>{setModal(null);setEditing(null);}} onCollect={()=>setModal("collection")} onSale={()=>setModal("sale")} onWhatsapp={()=>whatsapp(editing)} grade={getGrade(editing,collections,sales)} trend={getOutletTrend(editing.id)}/>}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
function ProgressBar({label,current,target,fmt,color}){
  const pct=target>0?Math.min(100,(current/target)*100):0;
  return <div style={{marginBottom:10}}>
    <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"#6b7280"}}>{label}</span><span style={{color:"#e2e0f0"}}>{fmt(current)}{target>0?` / ${fmt(target)}`:" (no target)"}</span></div>
    <div style={{height:6,background:"#1a1a2e",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:3,transition:"width 0.5s ease"}}/></div>
    {target>0&&<div style={{fontSize:10,color:pct>=100?"#22c55e":"#6b7280",marginTop:2,textAlign:"right"}}>{Math.round(pct)}%</div>}
  </div>;
}

function OutletCard({outlet,collections,fmt,isOwner,onEdit,onDelete,onCollect,onSale,onWhatsapp,onView,trend}){
  const status=getStatus(outlet,collections); const m=STATUS_META[status];
  const cols=collections.filter(c=>c.outletId===outlet.id);
  const totalCollected=cols.reduce((s,c)=>s+c.amount,0);
  const last=[...cols].sort((a,b)=>new Date(b.date)-new Date(a.date))[0];
  const [open,setOpen]=useState(false);
  return <div style={{background:"#0d0d1f",borderRadius:12,marginBottom:10,border:`1px solid ${m.color}33`,overflow:"hidden"}}>
    <div style={{padding:"12px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
      <div style={{width:8,height:8,borderRadius:"50%",background:m.color,flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{outlet.name}</div><div style={{fontSize:11,color:"#4b5563"}}>{outlet.area||"—"}{outlet.contact&&` · ${outlet.contact}`}</div></div>
      <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:700,color:outlet.totalDue>0?"#ef4444":"#22c55e",fontSize:14}}>{fmt(outlet.totalDue)}</div><div style={{fontSize:10,color:trend.color}}>{trend.label}</div></div>
      <div style={{color:"#4b5563",fontSize:12}}>{open?"▲":"▼"}</div>
    </div>
    {open&&<div style={{padding:"0 14px 14px",borderTop:"1px solid #111120"}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginTop:12}}>
        <Stat label="Collected" value={fmt(totalCollected)} color="#22c55e"/>
        <Stat label="Last Payment" value={last?last.date:"Never"} color="#a78bfa"/>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginTop:12}}>
        <SmBtn color="#065f46" onClick={onCollect}>💰 Collect</SmBtn>
        <SmBtn color="#0369a1" onClick={onSale}>📦 Sale</SmBtn>
        {isOwner&&<SmBtn color="#1e1e35" onClick={onEdit}>✏️ Edit</SmBtn>}
        {outlet.contact&&<SmBtn color="#1a3a2a" onClick={onWhatsapp}>💬 WA</SmBtn>}
        {outlet.mapsUrl&&<SmBtn color="#1a2a3a" onClick={()=>window.open(outlet.mapsUrl,"_blank")}>📍 Maps</SmBtn>}
        <SmBtn color="#1a1a2e" onClick={onView}>👁 Detail</SmBtn>
        {isOwner&&<SmBtn color="#3b0a0a" onClick={onDelete}>🗑</SmBtn>}
      </div>
    </div>}
  </div>;
}

function ReportsTab({outlets,sales,collections,fmt,onExport,onExportPDF,onBackup,getGrade,getOutletTrend}){
  const months=useMemo(()=>{const map={};collections.forEach(c=>{const m=c.date?.slice(0,7);if(m)map[m]=(map[m]||0)+c.amount;});return Object.entries(map).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,6);},[collections]);
  const graded=useMemo(()=>outlets.map(o=>({...o,g:getGrade(o,collections,sales)})).sort((a,b)=>["A+","A","B","C","D","F"].indexOf(a.g.grade)-["A+","A","B","C","D","F"].indexOf(b.g.grade)),[outlets,collections,sales]);
  const gc=useMemo(()=>{const c={"A+":0,"A":0,"B":0,"C":0,"D":0,"F":0};graded.forEach(o=>c[o.g.grade]++);return c;},[graded]);
  const totalSales=sales.reduce((s,x)=>s+x.amount,0); const totalCollected=collections.reduce((s,x)=>s+x.amount,0); const totalDue=outlets.reduce((s,o)=>s+(o.totalDue||0),0);
  return <div>
    <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginBottom:14,flexWrap:"wrap"}}>
      <button onClick={onExportPDF} style={{background:"#7c3aed",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>📄 PDF Report</button>
      <button onClick={onExport} style={{background:"#065f46",border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>⬇ CSV</button>
      <button onClick={onBackup} style={{background:"#1a1a2e",border:"1px solid #2a2a4a",color:"#a78bfa",borderRadius:8,padding:"8px 14px",fontSize:12,fontWeight:600,cursor:"pointer"}}>💾 Backup</button>
    </div>
    <div style={{background:"#0d0d1f",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #1a1a35"}}>
      <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:12}}>🏅 Outlet Grades</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
        {[["A+","#16a34a"],["A","#22c55e"],["B","#3b82f6"],["C","#f59e0b"],["D","#f97316"],["F","#ef4444"]].map(([g,c])=>(
          <div key={g} style={{background:"#080810",borderRadius:8,padding:"8px 10px",textAlign:"center",border:`1px solid ${c}33`}}>
            <div style={{fontSize:18,fontWeight:800,color:c}}>{g}</div>
            <div style={{fontSize:20,fontWeight:700,color:"#e2e0f0",marginTop:2}}>{gc[g]}</div>
            <div style={{fontSize:10,color:"#4b5563"}}>outlets</div>
          </div>
        ))}
      </div>
      {graded.slice(0,8).map(o=>(
        <div key={o.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 0",borderBottom:"1px solid #111120"}}>
          <div><span style={{fontSize:13,fontWeight:600}}>{o.name}</span><span style={{fontSize:11,color:getOutletTrend(o.id).color,marginLeft:8}}>{getOutletTrend(o.id).label}</span></div>
          <span style={{background:o.g.color,color:"#000",borderRadius:20,padding:"2px 9px",fontSize:12,fontWeight:800}}>{o.g.grade}</span>
        </div>
      ))}
      {graded.length>8&&<div style={{fontSize:11,color:"#4b5563",marginTop:8,textAlign:"center"}}>+{graded.length-8} more in PDF</div>}
    </div>
    <div style={{background:"#0d0d1f",borderRadius:12,padding:14,marginBottom:14,border:"1px solid #1a1a35"}}>
      <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:12}}>📊 Summary</div>
      {[{label:"Total Sales",value:fmt(totalSales),color:"#60a5fa"},{label:"Total Collected",value:fmt(totalCollected),color:"#22c55e"},{label:"Outstanding",value:fmt(totalDue),color:"#ef4444"},{label:"Outlets",value:outlets.length,color:"#a78bfa"}].map(r=>(
        <div key={r.label} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #111120",fontSize:13}}>
          <span style={{color:"#6b7280"}}>{r.label}</span><span style={{fontWeight:700,color:r.color}}>{r.value}</span>
        </div>
      ))}
    </div>
    <div style={{background:"#0d0d1f",borderRadius:12,padding:14,border:"1px solid #1a1a35"}}>
      <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:12}}>📅 Monthly Collections</div>
      {months.length===0&&<div style={{color:"#4b5563",fontSize:13}}>No data yet.</div>}
      {months.map(([m,amt])=>(
        <div key={m} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #111120",fontSize:13}}>
          <span style={{color:"#6b7280"}}>{m}</span><span style={{fontWeight:700,color:"#22c55e"}}>{fmt(amt)}</span>
        </div>
      ))}
    </div>
  </div>;
}

function SettingsTab({pins,setPins,targets,setTargets,showToast,log}){
  const [ownerPin,setOwnerPin]=useState(pins.owner); const [staffPin,setStaffPin]=useState(pins.staff); const [ownerContact,setOwnerContact]=useState(targets.ownerContact||"");
  return <div>
    <div style={{background:"#0d0d1f",borderRadius:12,padding:16,marginBottom:14,border:"1px solid #1a1a35"}}>
      <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:14}}>🔐 Change PINs</div>
      <FInput label="Owner PIN" value={ownerPin} onChange={setOwnerPin} placeholder="Min 4 digits" type="password"/>
      <FInput label="Staff PIN" value={staffPin} onChange={setStaffPin} placeholder="Min 4 digits" type="password"/>
      <Btn color="#7c3aed" onClick={()=>{if(ownerPin.length>=4&&staffPin.length>=4){setPins({owner:ownerPin,staff:staffPin});log("Settings","PINs updated");showToast("PINs saved!");}else showToast("Min 4 digits","error");}} style={{width:"100%",padding:11,fontSize:14,marginTop:4}}>Save PINs</Btn>
    </div>
    <div style={{background:"#0d0d1f",borderRadius:12,padding:16,border:"1px solid #1a1a35"}}>
      <div style={{fontWeight:700,fontSize:13,color:"#a78bfa",marginBottom:14}}>📱 Owner WhatsApp</div>
      <FInput label="Owner WhatsApp Number" value={ownerContact} onChange={setOwnerContact} placeholder="e.g. 8801711..." type="tel"/>
      <Btn color="#065f46" onClick={()=>{setTargets(t=>({...t,ownerContact}));log("Settings","Contact updated");showToast("Saved!");}} style={{width:"100%",padding:11,fontSize:14,marginTop:4}}>Save Number</Btn>
    </div>
  </div>;
}

function BottomModal({title,children,onClose}){
  return <div style={{position:"fixed",inset:0,background:"#00000090",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"#0d0d1f",borderRadius:"18px 18px 0 0",width:"100%",maxWidth:500,padding:"20px 16px",maxHeight:"92vh",overflowY:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:16}}>{title}</div>
        <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:22,cursor:"pointer",lineHeight:1}}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}

function OutletModal({outlet,onClose,onSave}){
  const [f,setF]=useState({name:outlet?.name||"",area:outlet?.area||"",contact:outlet?.contact||"",notes:outlet?.notes||"",mapsUrl:outlet?.mapsUrl||""});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return <BottomModal title={outlet?"Edit Outlet":"Add New Outlet"} onClose={onClose}>
    <FInput label="Outlet Name *" value={f.name} onChange={set("name")} placeholder="e.g. Rahman Traders"/>
    <FInput label="Area / Zone" value={f.area} onChange={set("area")} placeholder="e.g. Mirpur, Dhaka"/>
    <FInput label="Contact Number" value={f.contact} onChange={set("contact")} placeholder="e.g. 01711..."/>
    <FInput label="Google Maps Link" value={f.mapsUrl} onChange={set("mapsUrl")} placeholder="Paste Google Maps URL"/>
    <div style={{fontSize:11,color:"#4b5563",marginTop:-8,marginBottom:12}}>Google Maps → Share → Copy Link → Paste above</div>
    <FInput label="Notes" value={f.notes} onChange={set("notes")} placeholder="Any extra info"/>
    <Btn color="#7c3aed" onClick={()=>f.name.trim()&&onSave(f)} style={{width:"100%",padding:12,fontSize:14,marginTop:4}}>{outlet?"Save Changes":"Add Outlet"}</Btn>
  </BottomModal>;
}

function SaleModal({outlets,preSelected,isStaff,onClose,onSave}){
  const [f,setF]=useState({outletId:preSelected||"",amount:"",date:todayStr(),items:"",deliveryStatus:"delivered"});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return <BottomModal title="Record New Sale" onClose={onClose}>
    <FSelect label="Outlet *" value={f.outletId} onChange={set("outletId")} options={outlets.map(o=>({v:o.id,l:o.name}))}/>
    <FInput label="Amount (৳) *" value={f.amount} onChange={set("amount")} placeholder="0" type="number"/>
    <FInput label="Items / Description" value={f.items} onChange={set("items")} placeholder="e.g. 50 glass sets, 20 plates"/>
    {!isStaff&&<FInput label="Date" value={f.date} onChange={set("date")} type="date"/>}
    <div style={{marginBottom:12}}>
      <label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>Delivery Status</label>
      <div style={{display:"flex",gap:8}}>
        {["delivered","pending"].map(s=><button key={s} onClick={()=>set("deliveryStatus")(s)} style={{flex:1,background:f.deliveryStatus===s?"#0369a1":"#080810",border:`1px solid ${f.deliveryStatus===s?"#0369a1":"#1a1a35"}`,color:f.deliveryStatus===s?"#fff":"#6b7280",borderRadius:8,padding:"9px",fontSize:13,cursor:"pointer"}}>{s==="delivered"?"✅ Delivered":"🕐 Pending"}</button>)}
      </div>
    </div>
    <Btn color="#0369a1" onClick={()=>f.outletId&&f.amount&&onSave({...f,amount:parseFloat(f.amount)})} style={{width:"100%",padding:12,fontSize:14,marginTop:4}}>Save Sale</Btn>
  </BottomModal>;
}

function CollectionModal({outlets,preSelected,isStaff,onClose,onSave}){
  const [f,setF]=useState({outletId:preSelected||"",amount:"",date:todayStr(),note:"",payMethod:"Cash"});
  const set=k=>v=>setF(p=>({...p,[k]:v}));
  return <BottomModal title="Record Collection" onClose={onClose}>
    <FSelect label="Outlet *" value={f.outletId} onChange={set("outletId")} options={outlets.map(o=>({v:o.id,l:`${o.name}${o.totalDue>0?` (Due: ৳${Math.round(o.totalDue)})`:""}` }))}/>
    <FInput label="Amount (৳) *" value={f.amount} onChange={set("amount")} placeholder="0" type="number"/>
    <div style={{marginBottom:12}}>
      <label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>Payment Method</label>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {["Cash","Bank Transfer","GPay"].map(m=><button key={m} onClick={()=>set("payMethod")(m)} style={{background:f.payMethod===m?"#065f46":"#080810",border:`1px solid ${f.payMethod===m?"#065f46":"#1a1a35"}`,color:f.payMethod===m?"#fff":"#6b7280",borderRadius:8,padding:"7px 12px",fontSize:12,cursor:"pointer"}}>{m}</button>)}
      </div>
    </div>
    {!isStaff&&<FInput label="Date" value={f.date} onChange={set("date")} type="date"/>}
    <FInput label="Note (optional)" value={f.note} onChange={set("note")} placeholder="e.g. Partial payment"/>
    <Btn color="#065f46" onClick={()=>f.outletId&&f.amount&&onSave({...f,amount:parseFloat(f.amount)})} style={{width:"100%",padding:12,fontSize:14,marginTop:4}}>Save Collection</Btn>
  </BottomModal>;
}

function TargetModal({targets,onClose,onSave}){
  const [f,setF]=useState({daily:targets.daily||"",monthly:targets.monthly||""});
  return <BottomModal title="Set Targets" onClose={onClose}>
    <FInput label="Daily Target (৳)" value={f.daily} onChange={v=>setF(p=>({...p,daily:v}))} placeholder="e.g. 50000" type="number"/>
    <FInput label="Monthly Target (৳)" value={f.monthly} onChange={v=>setF(p=>({...p,monthly:v}))} placeholder="e.g. 1000000" type="number"/>
    <Btn color="#7c3aed" onClick={()=>onSave({...targets,daily:parseFloat(f.daily)||0,monthly:parseFloat(f.monthly)||0})} style={{width:"100%",padding:12,fontSize:14,marginTop:4}}>Save</Btn>
  </BottomModal>;
}

function OutletDetailModal({outlet,collections,sales,fmt,isOwner,onClose,onCollect,onSale,onWhatsapp,grade,trend}){
  const cols=[...collections].filter(c=>c.outletId===outlet.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const sals=[...sales].filter(s=>s.outletId===outlet.id);
  return <BottomModal title={outlet.name} onClose={onClose}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
      <span style={{background:grade.color,color:"#000",borderRadius:20,padding:"3px 12px",fontSize:14,fontWeight:800}}>{grade.grade} · {grade.label}</span>
      <span style={{color:trend.color,fontSize:12}}>{trend.label}</span>
    </div>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}}>
      <Stat label="Total Sales" value={fmt(sals.reduce((s,x)=>s+x.amount,0))} color="#60a5fa"/>
      <Stat label="Collected" value={fmt(cols.reduce((s,c)=>s+c.amount,0))} color="#22c55e"/>
      <Stat label="Outstanding" value={fmt(outlet.totalDue)} color={outlet.totalDue>0?"#ef4444":"#22c55e"}/>
      <Stat label="Area" value={outlet.area||"—"} color="#a78bfa"/>
    </div>
    <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
      <Btn color="#065f46" onClick={onCollect} style={{flex:1,padding:10,fontSize:13}}>💰 Collect</Btn>
      <Btn color="#0369a1" onClick={onSale} style={{flex:1,padding:10,fontSize:13}}>📦 Sale</Btn>
      {outlet.contact&&<Btn color="#1a3a2a" onClick={onWhatsapp} style={{flex:1,padding:10,fontSize:13}}>💬 WA</Btn>}
      {outlet.mapsUrl&&<Btn color="#1a2a3a" onClick={()=>window.open(outlet.mapsUrl,"_blank")} style={{flex:1,padding:10,fontSize:13}}>📍 Maps</Btn>}
    </div>
    <div style={{fontWeight:700,fontSize:12,color:"#4b5563",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>Recent Collections</div>
    {cols.length===0&&<div style={{color:"#4b5563",fontSize:12,marginBottom:12}}>None yet.</div>}
    {cols.slice(0,5).map(c=>(
      <div key={c.id} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #111120",fontSize:13}}>
        <span style={{color:"#6b7280"}}>{c.date}{c.payMethod&&` · ${c.payMethod}`}</span>
        <span style={{color:"#22c55e",fontWeight:600}}>{fmt(c.amount)}</span>
      </div>
    ))}
  </BottomModal>;
}

function Btn({color,onClick,children,style={}}){ return <button onClick={onClick} style={{background:color,border:"none",color:"#fff",borderRadius:8,padding:"8px 14px",fontSize:13,fontWeight:600,cursor:"pointer",...style}}>{children}</button>; }
function SmBtn({color,onClick,children}){ return <button onClick={onClick} style={{background:color,border:"none",color:"#e2e0f0",borderRadius:6,padding:"5px 11px",fontSize:12,cursor:"pointer"}}>{children}</button>; }
function Stat({label,value,color}){ return <div style={{background:"#080810",borderRadius:8,padding:"8px 10px"}}><div style={{fontSize:10,color:"#4b5563"}}>{label}</div><div style={{fontSize:13,fontWeight:600,color:color||"#e2e0f0",marginTop:1}}>{value}</div></div>; }
function FInput({label,value,onChange,placeholder,type="text"}){ return <div style={{marginBottom:12}}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>{label}</label><input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={{width:"100%",background:"#080810",border:"1px solid #1a1a35",color:"#e2e0f0",borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box",outline:"none"}}/></div>; }
function FSelect({label,value,onChange,options}){ return <div style={{marginBottom:12}}><label style={{fontSize:11,color:"#6b7280",display:"block",marginBottom:4,textTransform:"uppercase",letterSpacing:.5}}>{label}</label><select value={value} onChange={e=>onChange(e.target.value)} style={{width:"100%",background:"#080810",border:"1px solid #1a1a35",color:"#e2e0f0",borderRadius:8,padding:"10px 12px",fontSize:14,boxSizing:"border-box"}}><option value="">-- Select --</option>{options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></div>; }
function Empty({icon,text}){ return <div style={{textAlign:"center",padding:"40px 20px",color:"#4b5563"}}><div style={{fontSize:40}}>{icon}</div><div style={{marginTop:8,fontSize:14}}>{text}</div></div>; }
const inputSt={background:"#0d0d1f",border:"1px solid #1a1a35",color:"#e2e0f0",borderRadius:8,padding:"9px 12px",fontSize:13,outline:"none",width:"100%",boxSizing:"border-box"};
