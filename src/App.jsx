import { useState, useEffect, useMemo } from "react";
import { db } from "./firebase";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp
} from "firebase/firestore";

// ── Firestore helpers ─────────────────────────────────────────────────────────
const Col = {
  outlets: "outlets",
  sales: "sales",
  collections: "collections",
  targets: "targets",
  activityLog: "activityLog",
  pins: "pins",
  products: "products",           // NEW
  stockMovements: "stockMovements", // NEW
  repaymentPlans: "repaymentPlans", // NEW
  routeVisits: "routeVisits",       // NEW
};

const saveDoc = async (colName, id, data) => {
  try { await setDoc(doc(db, colName, id), { ...data, _updatedAt: serverTimestamp() }); } catch(e) { console.error(e); }
};
const delDoc = async (colName, id) => {
  try { await deleteDoc(doc(db, colName, id)); } catch(e) { console.error(e); }
};
const useCollection = (colName) => {
  const [data, setData] = useState([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(collection(db, colName), snap => {
      setData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    });
    return unsub;
  }, [colName]);
  return [data, loaded];
};
const useSingleDoc = (colName, id, fallback) => {
  const [data, setData] = useState(fallback);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const unsub = onSnapshot(doc(db, colName, id), snap => {
      if (snap.exists()) setData(snap.data());
      setLoaded(true);
    });
    return unsub;
  }, [colName, id]);
  return [data, loaded];
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmt = (n) => "₹ " + new Intl.NumberFormat("en-IN").format(Math.round(n || 0));
const todayStr = () => new Date().toISOString().split("T")[0];
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999;
const nowTs = () => new Date().toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2);

const getStatus = (outlet, collections) => {
  const cols = collections.filter(c => c.outletId === outlet.id);
  const last = [...cols].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const days = daysSince(last?.date); const due = outlet.totalDue || 0;
  if (due === 0) return "good";
  if (days > 30 || due > 50000) return "danger";
  if (days > 14 || due > 20000) return "warning";
  return "good";
};
const STATUS_META = {
  danger:  { color: "#ef4444", bg: "#1f0a0a", border: "#7f1d1d", label: "🚨 High Risk" },
  warning: { color: "#f59e0b", bg: "#1c1200", border: "#78350f", label: "⚠️ Needs Attention" },
  good:    { color: "#22c55e", bg: "#0a1f0f", border: "#14532d", label: "✅ Healthy" },
};
const getGrade = (outlet, collections, sales) => {
  const cols = collections.filter(c => c.outletId === outlet.id);
  const sals = sales.filter(s => s.outletId === outlet.id);
  const totalSales = sals.reduce((s, x) => s + x.amount, 0);
  const totalCollected = cols.reduce((s, c) => s + c.amount, 0);
  const last = [...cols].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const days = daysSince(last?.date); const due = outlet.totalDue || 0;
  const rate = totalSales > 0 ? totalCollected / totalSales : due === 0 ? 1 : 0;
  let score = Math.round(rate * 40);
  if (days <= 7) score += 30; else if (days <= 14) score += 22; else if (days <= 30) score += 12; else if (days <= 60) score += 4;
  if (due === 0) score += 30; else if (due < 10000) score += 22; else if (due < 25000) score += 14; else if (due < 50000) score += 6;
  if (score >= 85) return { grade: "A+", label: "Excellent", color: "#22c55e" };
  if (score >= 70) return { grade: "A",  label: "Very Good", color: "#4ade80" };
  if (score >= 55) return { grade: "B",  label: "Good",      color: "#60a5fa" };
  if (score >= 40) return { grade: "C",  label: "Average",   color: "#f59e0b" };
  if (score >= 25) return { grade: "D",  label: "Poor",      color: "#f97316" };
  return               { grade: "F",  label: "Critical",  color: "#ef4444" };
};

// ── PDF Export ────────────────────────────────────────────────────────────────
const exportPDF = (outlets, collections, sales) => {
  const fN = (n) => "₹ " + new Intl.NumberFormat("en-IN").format(Math.round(n || 0));
  const rows = outlets.map(o => {
    const cols = [...collections].filter(c => c.outletId === o.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const sals = sales.filter(s => s.outletId === o.id);
    const g = getGrade(o, collections, sales);
    return { ...o, totalSales: sals.reduce((s, x) => s + x.amount, 0), totalCollected: cols.reduce((s, c) => s + c.amount, 0), lastPayment: cols[0]?.date || "Never", grade: g };
  }).sort((a, b) => ["A+","A","B","C","D","F"].indexOf(a.grade.grade) - ["A+","A","B","C","D","F"].indexOf(b.grade.grade));
  const gc = { "A+": "#16a34a", "A": "#22c55e", "B": "#3b82f6", "C": "#f59e0b", "D": "#f97316", "F": "#ef4444" };
  const sum = { due: outlets.reduce((s, o) => s + (o.totalDue || 0), 0), sales: sales.reduce((s, x) => s + x.amount, 0), col: collections.reduce((s, x) => s + x.amount, 0) };
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
  <div class="hdr"><h1>◈ TradeTrack Pro</h1><p>Glassware & Ceramics — AL LAMIA ENTERPRISES · ${new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</p></div>
  <div class="sum"><div class="sb"><div class="v">${outlets.length}</div><div class="l">Outlets</div></div><div class="sb"><div class="v" style="color:#1d4ed8">${fN(sum.sales)}</div><div class="l">Total Sales</div></div><div class="sb"><div class="v" style="color:#16a34a">${fN(sum.col)}</div><div class="l">Collected</div></div><div class="sb"><div class="v" style="color:#dc2626">${fN(sum.due)}</div><div class="l">Outstanding</div></div></div>
  <div class="leg"><strong>Grades:</strong>${[["A+","#16a34a","Excellent"],["A","#22c55e","Very Good"],["B","#3b82f6","Good"],["C","#f59e0b","Average"],["D","#f97316","Poor"],["F","#ef4444","Critical"]].map(([g,c,l]) => `<div class="li"><div class="ld" style="background:${c}"></div><strong>${g}</strong>–${l}</div>`).join("")}</div>
  <div class="st">All Outlets (${rows.length}) — Sorted by Grade</div>
  <table><thead><tr><th>#</th><th>Outlet</th><th>Area</th><th>Contact</th><th>Total Sales</th><th>Collected</th><th>Outstanding</th><th>Last Payment</th><th>Grade</th><th>Status</th></tr></thead><tbody>
  ${rows.map((o, i) => `<tr><td style="color:#888">${i+1}</td><td><strong>${o.name}</strong></td><td>${o.area||"—"}</td><td>${o.contact||"—"}</td><td style="color:#1d4ed8;font-weight:600">${fN(o.totalSales)}</td><td style="color:#16a34a;font-weight:600">${fN(o.totalCollected)}</td><td style="color:${o.totalDue>0?"#dc2626":"#16a34a"};font-weight:700">${fN(o.totalDue)}</td><td>${o.lastPayment}</td><td><span class="gb" style="background:${gc[o.grade.grade]}">${o.grade.grade}</span></td><td style="color:${o.grade.color};font-weight:600">${o.grade.label}</td></tr>`).join("")}
  </tbody></table>
  <div class="ftr"><span>TradeTrack Pro — AL LAMIA ENTERPRISES — Confidential</span><span>${new Date().toLocaleString()}</span></div></body></html>`;
  const win = window.open("", "_blank"); win.document.write(html); win.document.close(); setTimeout(() => win.print(), 600);
};

const backupData = (outlets, sales, collections, activityLog) => {
  const data = { version: 3, exportedAt: new Date().toISOString(), outlets, sales, collections, activityLog };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = `tradetrack_backup_${todayStr()}.json`; a.click();
};

const sendDailySummary = (outlets, collections, sales, contact) => {
  const t = todayStr();
  const totalCol = collections.filter(c => c.date === t).reduce((s, c) => s + c.amount, 0);
  const totalSale = sales.filter(s => s.date === t).reduce((s, x) => s + x.amount, 0);
  const totalDue = outlets.reduce((s, o) => s + (o.totalDue || 0), 0);
  const lines = [`📊 *TradeTrack Daily Summary*`, `📅 ${new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}`, ``, `💰 Collected Today: ₹${new Intl.NumberFormat("en-IN").format(Math.round(totalCol))}`, `📦 Sales Today: ₹${new Intl.NumberFormat("en-IN").format(Math.round(totalSale))}`, `📋 Total Outstanding: ₹${new Intl.NumberFormat("en-IN").format(Math.round(totalDue))}`, `🏪 Active Outlets: ${outlets.length}`, ``, `_Sent from TradeTrack Pro — AL LAMIA ENTERPRISES_`];
  window.open(`https://wa.me/${contact?.replace(/\D/g, "")}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
};

// ── LOGIN ─────────────────────────────────────────────────────────────────────
function LoginScreen({ pins, onLogin }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(false);
  const tryLogin = () => {
    if (pin === pins.owner) { onLogin(); setPin(""); }
    else { setErr(true); setTimeout(() => setErr(false), 1500); setPin(""); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Cormorant+Garamond:wght@700&display=swap" rel="stylesheet" />
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, color: "#a78bfa", marginBottom: 2, letterSpacing: 1 }}>◈ TradeTrack Pro</div>
      <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: 3, textTransform: "uppercase", marginBottom: 6 }}>AL LAMIA ENTERPRISES</div>
      <div style={{ fontSize: 10, color: "#2a2a4a", letterSpacing: 2, textTransform: "uppercase", marginBottom: 36 }}>Glassware & Ceramics</div>
      <div style={{ background: "#0d0d1f", borderRadius: 16, padding: 28, width: "100%", maxWidth: 320, border: "1px solid #1a1a35" }}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6, textAlign: "center", color: "#e2e0f0" }}>Enter PIN</div>
        <div style={{ fontSize: 12, color: "#4b5563", textAlign: "center", marginBottom: 20 }}>Enter your PIN to continue</div>
        <input type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === "Enter" && tryLogin()} placeholder="••••" maxLength={8}
          style={{ width: "100%", background: "#080810", border: `1px solid ${err ? "#ef4444" : "#1a1a35"}`, color: "#e2e0f0", borderRadius: 10, padding: "14px", fontSize: 22, textAlign: "center", letterSpacing: 8, boxSizing: "border-box", outline: "none", marginBottom: err ? 4 : 12 }} />
        {err && <div style={{ color: "#ef4444", fontSize: 12, textAlign: "center", marginBottom: 10 }}>Wrong PIN. Try again.</div>}
        <button onClick={tryLogin} style={{ width: "100%", background: "#7c3aed", border: "none", color: "#fff", borderRadius: 10, padding: 13, fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Login</button>
        <div style={{ fontSize: 11, color: "#2a2a4a", textAlign: "center", marginTop: 16 }}>Default PIN: 1234</div>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [outlets, outletsLoaded]               = useCollection(Col.outlets);
  const [sales, salesLoaded]                   = useCollection(Col.sales);
  const [collections, colsLoaded]              = useCollection(Col.collections);
  const [activityLog, logLoaded]               = useCollection(Col.activityLog);
  const [targets, targetsLoaded]               = useSingleDoc(Col.targets, "config", { daily: 0, monthly: 0, ownerContact: "" });
  const [pinsDoc, pinsLoaded]                  = useSingleDoc(Col.pins, "config", { owner: "1234" });
  const [products, productsLoaded]             = useCollection(Col.products);
  const [stockMovements, stockMovementsLoaded] = useCollection(Col.stockMovements);
  const [repaymentPlans, repaymentPlansLoaded] = useCollection(Col.repaymentPlans);
  const [routeVisits, routeVisitsLoaded]       = useCollection(Col.routeVisits);

  const loaded = outletsLoaded && salesLoaded && colsLoaded && logLoaded && targetsLoaded && pinsLoaded && productsLoaded && stockMovementsLoaded && repaymentPlansLoaded && routeVisitsLoaded;

  const [loggedIn, setLoggedIn]                     = useState(false);
  const [tab, setTab]                               = useState("Dashboard");
  const [search, setSearch]                         = useState("");
  const [areaFilter, setAreaFilter]                 = useState("All");
  const [modal, setModal]                           = useState(null);
  const [editing, setEditing]                       = useState(null);
  const [editSaleRecord, setEditSaleRecord]         = useState(null);
  const [editCollectionRecord, setEditCollectionRecord] = useState(null);
  const [toast, setToast]                           = useState(null);
  // NEW inventory states
  const [editingProduct, setEditingProduct]         = useState(null);
  const [stockMoveProduct, setStockMoveProduct]     = useState(null);
  const [stockMoveType, setStockMoveType]           = useState("in");
  // NEW: search states for Sales / Collections / Dues & Alerts
  const [salesSearch, setSalesSearch]               = useState("");
  const [collectionsSearch, setCollectionsSearch]   = useState("");
  const [duesSearch, setDuesSearch]                 = useState("");
  // NEW: repayment plans state
  const [planSearch, setPlanSearch]                 = useState("");
  const [planOutlet, setPlanOutlet]                 = useState(null);

  const showToast = (msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 2500); };

  const log = async (action, detail) => {
    const id = uid();
    await saveDoc(Col.activityLog, id, { id, action, detail, ts: nowTs(), date: todayStr() });
  };

  // ── Outlet helpers ────────────────────────────────────────────────────────
  const addOutlet = async (data) => {
    const id = uid();
    await saveDoc(Col.outlets, id, { id, createdAt: new Date().toISOString(), totalDue: 0, ...data });
    await log("Add Outlet", data.name); showToast("Outlet added!");
  };
  const updateOutlet = async (id, data) => {
    await saveDoc(Col.outlets, id, { ...outlets.find(o => o.id === id), ...data });
    await log("Edit Outlet", data.name); showToast("Updated!");
  };
  const deleteOutlet = async (outlet) => {
    await delDoc(Col.outlets, outlet.id);
    sales.filter(s => s.outletId === outlet.id).forEach(s => delDoc(Col.sales, s.id));
    collections.filter(c => c.outletId === outlet.id).forEach(c => delDoc(Col.collections, c.id));
    await log("Delete Outlet", outlet.name); showToast("Deleted!");
  };
  const addSale = async (data) => {
    const id = uid();
    await saveDoc(Col.sales, id, { id, ...data });
    const outlet = outlets.find(o => o.id === data.outletId);
    await saveDoc(Col.outlets, data.outletId, { ...outlet, totalDue: (outlet.totalDue || 0) + data.amount });
    await log("Sale", `${outlet?.name} — ${fmt(data.amount)}`); showToast("Sale recorded!");
  };
  const updateSale = async (id, data) => {
    const oldSale = sales.find(s => s.id === id); if (!oldSale) return;
    if (oldSale.outletId !== data.outletId) {
      const oldOutlet = outlets.find(o => o.id === oldSale.outletId);
      if (oldOutlet) await saveDoc(Col.outlets, oldOutlet.id, { ...oldOutlet, totalDue: Math.max(0, (oldOutlet.totalDue || 0) - oldSale.amount) });
      const newOutlet = outlets.find(o => o.id === data.outletId);
      if (newOutlet) await saveDoc(Col.outlets, newOutlet.id, { ...newOutlet, totalDue: (newOutlet.totalDue || 0) + data.amount });
    } else {
      const outlet = outlets.find(o => o.id === data.outletId);
      if (outlet) await saveDoc(Col.outlets, data.outletId, { ...outlet, totalDue: Math.max(0, (outlet.totalDue || 0) + (data.amount - oldSale.amount)) });
    }
    await saveDoc(Col.sales, id, { ...oldSale, ...data });
    const outlet2 = outlets.find(o => o.id === data.outletId);
    await log("Edit Sale", `${outlet2?.name || ""} — ${fmt(data.amount)}`); showToast("Sale updated!");
  };
  const deleteSale = async (s) => {
    if (!window.confirm(`Delete this sale of ${fmt(s.amount)}?`)) return;
    const outlet = outlets.find(o => o.id === s.outletId);
    if (outlet) await saveDoc(Col.outlets, outlet.id, { ...outlet, totalDue: Math.max(0, (outlet.totalDue || 0) - s.amount) });
    await delDoc(Col.sales, s.id);
    await log("Delete Sale", `${outlet?.name || ""} — ${fmt(s.amount)}`); showToast("Sale deleted!");
  };
  const addCollection = async (data) => {
    const id = uid();
    await saveDoc(Col.collections, id, { id, ...data });
    const outlet = outlets.find(o => o.id === data.outletId);
    await saveDoc(Col.outlets, data.outletId, { ...outlet, totalDue: Math.max(0, (outlet.totalDue || 0) - data.amount) });
    // Auto-mark this outlet as visited on the route for the collection's date
    const alreadyVisited = routeVisits.some(r => r.outletId === data.outletId && r.date === data.date && r.status === "visited");
    if (!alreadyVisited) {
      const vid = uid();
      await saveDoc(Col.routeVisits, vid, { id: vid, outletId: data.outletId, date: data.date, status: "visited" });
    }
    await log("Collection", `${outlet?.name} — ${fmt(data.amount)}`); showToast("Collection saved!");
  };
  const updateCollection = async (id, data) => {
    const oldCol = collections.find(c => c.id === id); if (!oldCol) return;
    if (oldCol.outletId !== data.outletId) {
      const oldOutlet = outlets.find(o => o.id === oldCol.outletId);
      if (oldOutlet) await saveDoc(Col.outlets, oldOutlet.id, { ...oldOutlet, totalDue: (oldOutlet.totalDue || 0) + oldCol.amount });
      const newOutlet = outlets.find(o => o.id === data.outletId);
      if (newOutlet) await saveDoc(Col.outlets, newOutlet.id, { ...newOutlet, totalDue: Math.max(0, (newOutlet.totalDue || 0) - data.amount) });
    } else {
      const outlet = outlets.find(o => o.id === data.outletId);
      if (outlet) await saveDoc(Col.outlets, data.outletId, { ...outlet, totalDue: Math.max(0, (outlet.totalDue || 0) - (data.amount - oldCol.amount)) });
    }
    await saveDoc(Col.collections, id, { ...oldCol, ...data });
    const outlet2 = outlets.find(o => o.id === data.outletId);
    await log("Edit Collection", `${outlet2?.name || ""} — ${fmt(data.amount)}`); showToast("Collection updated!");
  };
  const deleteCollection = async (c) => {
    if (!window.confirm(`Delete this collection of ${fmt(c.amount)}?`)) return;
    const outlet = outlets.find(o => o.id === c.outletId);
    if (outlet) await saveDoc(Col.outlets, outlet.id, { ...outlet, totalDue: (outlet.totalDue || 0) + c.amount });
    await delDoc(Col.collections, c.id);
    await log("Delete Collection", `${outlet?.name || ""} — ${fmt(c.amount)}`); showToast("Collection deleted!");
  };
  const saveTargets = async (t) => { await saveDoc(Col.targets, "config", t); showToast("Targets saved!"); };
  const savePins = async (p) => { await saveDoc(Col.pins, "config", p); await log("Settings", "PIN updated"); showToast("PIN saved!"); };

  // ── NEW: Product & Inventory helpers ──────────────────────────────────────
  const addProduct = async (data) => {
    const id = uid();
    await saveDoc(Col.products, id, { id, createdAt: new Date().toISOString(), ...data });
    if (data.stock > 0) {
      const movId = uid();
      await saveDoc(Col.stockMovements, movId, { id: movId, productId: id, type: "in", quantity: data.stock, note: "Opening stock", date: todayStr() });
    }
    await log("Add Product", data.name); showToast("Product added!");
  };
  const updateProduct = async (id, data) => {
    const existing = products.find(p => p.id === id);
    await saveDoc(Col.products, id, { ...existing, ...data });
    await log("Edit Product", data.name); showToast("Updated!");
  };
  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This will also remove all stock records.`)) return;
    await delDoc(Col.products, product.id);
    stockMovements.filter(m => m.productId === product.id).forEach(m => delDoc(Col.stockMovements, m.id));
    await log("Delete Product", product.name); showToast("Product deleted!");
  };
  const addStockMovement = async (data) => {
    const id = uid();
    await saveDoc(Col.stockMovements, id, { id, ...data });
    const product = products.find(p => p.id === data.productId);
    if (product) {
      const newStock = data.type === "in"
        ? (product.stock || 0) + data.quantity
        : Math.max(0, (product.stock || 0) - data.quantity);
      await saveDoc(Col.products, data.productId, { ...product, stock: newStock });
    }
    await log(`Stock ${data.type}`, `${product?.name} — ${data.quantity} ${product?.unit || "units"}`);
    showToast(data.type === "in" ? "📥 Stock added!" : "📤 Stock removed!");
  };
  const sendLowStockAlert = () => {
    const items = products.filter(p => p.minThreshold > 0 && (p.stock || 0) <= p.minThreshold);
    if (items.length === 0) { showToast("✅ All products well stocked!"); return; }
    const lines = [
      `📦 *AL LAMIA — Low Stock Alert*`,
      `📅 ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`,
      ``,
      `⚠️ Items Needing Restock (${items.length}):`,
      ...items.map(p => `• ${p.name}: ${p.stock || 0} ${p.unit || "units"} left (min: ${p.minThreshold})`),
      ``,
      `_Sent from TradeTrack Pro — AL LAMIA ENTERPRISES_`
    ];
    window.open(`https://wa.me/${targets.ownerContact?.replace(/\D/g, "")}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  };

  // ── NEW: Repayment Plan helpers ───────────────────────────────────────────
  const saveRepaymentPlan = async (outletId, data) => {
    const existing = repaymentPlans.find(p => p.outletId === outletId);
    const id = existing?.id || uid();
    await saveDoc(Col.repaymentPlans, id, { id, outletId, createdAt: existing?.createdAt || new Date().toISOString(), ...data });
    const outlet = outlets.find(o => o.id === outletId);
    await log("Repayment Plan", `${outlet?.name || ""} — ${data.duration} ${data.type}`);
    showToast(existing ? "Plan updated!" : "Repayment plan set!");
  };
  const deleteRepaymentPlan = async (plan) => {
    if (!window.confirm("Remove this repayment plan? The outlet will return to calculator mode.")) return;
    await delDoc(Col.repaymentPlans, plan.id);
    const outlet = outlets.find(o => o.id === plan.outletId);
    await log("Repayment Plan Removed", outlet?.name || "");
    showToast("Plan removed!");
  };

  // ── NEW: Route visit helpers ──────────────────────────────────────────────
  const toggleVisited = async (outlet, date) => {
    const existing = routeVisits.find(r => r.outletId === outlet.id && r.date === date && r.status === "visited");
    if (existing) {
      await delDoc(Col.routeVisits, existing.id);
      await log("Route", `Unmarked visit — ${outlet.name}`);
      showToast("Unmarked.");
    } else {
      const id = uid();
      await saveDoc(Col.routeVisits, id, { id, outletId: outlet.id, date, status: "visited" });
      await log("Route", `Marked visited — ${outlet.name}`);
      showToast("✓ Marked visited!");
    }
  };
  const clearMissed = async (outlet, date) => {
    const id = uid();
    await saveDoc(Col.routeVisits, id, { id, outletId: outlet.id, date, status: "cleared" });
    await log("Route", `Cleared missed visit — ${outlet.name}`);
    showToast("Cleared — starting fresh!");
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const areas = useMemo(() => ["All", ...new Set(outlets.map(o => o.area).filter(Boolean))], [outlets]);
  const filteredOutlets = useMemo(() => {
    let list = outlets;
    if (search) list = list.filter(o => o.name?.toLowerCase().includes(search.toLowerCase()) || (o.contact || "").includes(search) || (o.area || "").toLowerCase().includes(search.toLowerCase()));
    if (areaFilter !== "All") list = list.filter(o => o.area === areaFilter);
    return list;
  }, [outlets, search, areaFilter]);

  const todayCollected = useMemo(() => collections.filter(c => c.date === todayStr()).reduce((s, c) => s + c.amount, 0), [collections]);
  const monthCollected = useMemo(() => { const m = new Date().toISOString().slice(0, 7); return collections.filter(c => c.date?.startsWith(m)).reduce((s, c) => s + c.amount, 0); }, [collections]);
  const totalDue       = useMemo(() => outlets.reduce((s, o) => s + (o.totalDue || 0), 0), [outlets]);
  const atRisk         = useMemo(() => outlets.filter(o => ["danger","warning"].includes(getStatus(o, collections))).length, [outlets, collections]);
  const topOutlets     = useMemo(() => [...outlets].sort((a, b) => {
    const aT = collections.filter(c => c.outletId === a.id).reduce((s, c) => s + c.amount, 0);
    const bT = collections.filter(c => c.outletId === b.id).reduce((s, c) => s + c.amount, 0);
    return bT - aT;
  }).slice(0, 5), [outlets, collections]);

  // NEW computed
  const lowStockItems = useMemo(() =>
    products.filter(p => p.minThreshold > 0 && (p.stock || 0) <= p.minThreshold),
    [products]
  );
  const productAnalytics = useMemo(() =>
    products.map(p => {
      const totalOut = stockMovements.filter(m => m.productId === p.id && m.type === "out").reduce((s, m) => s + m.quantity, 0);
      const totalIn  = stockMovements.filter(m => m.productId === p.id && m.type === "in").reduce((s, m) => s + m.quantity, 0);
      return { ...p, totalOut, totalIn };
    }).sort((a, b) => b.totalOut - a.totalOut),
    [products, stockMovements]
  );

  const getOutletTrend = (outletId) => {
    const months = [];
    for (let i = 2; i >= 0; i--) { const d = new Date(); d.setMonth(d.getMonth() - i); const m = d.toISOString().slice(0, 7); months.push(collections.filter(c => c.outletId === outletId && c.date?.startsWith(m)).reduce((s, c) => s + c.amount, 0)); }
    if (months[2] > months[1] && months[1] >= months[0]) return { label: "📈 Growing", color: "#22c55e" };
    if (months[2] < months[1] && months[1] <= months[0]) return { label: "📉 Declining", color: "#ef4444" };
    return { label: "➡️ Stable", color: "#f59e0b" };
  };

  const exportCSV = () => {
    const rows = [["Outlet","Area","Contact","Total Due","Status"]];
    outlets.forEach(o => rows.push([o.name, o.area || "", o.contact || "", o.totalDue || 0, getStatus(o, collections)]));
    const blob = new Blob([rows.map(r => r.join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = `tradetrack_${todayStr()}.csv`; a.click();
    showToast("Exported!");
  };
  const whatsapp = (outlet) => window.open(`https://wa.me/${outlet.contact?.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello ${outlet.name}, your outstanding due is ${fmt(outlet.totalDue)}. Please arrange payment. Thank you.`)}`, "_blank");

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#080810", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#4b5563" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&display=swap" rel="stylesheet" />
      <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 28, color: "#a78bfa", marginBottom: 8 }}>◈ TradeTrack Pro</div>
      <div style={{ fontSize: 12 }}>Connecting to database...</div>
    </div>
  );

  if (!loggedIn) return <LoginScreen pins={pinsDoc} onLogin={() => { setLoggedIn(true); log("Login", "Logged in"); setTab("Dashboard"); }} />;

  const TABS = ["Dashboard","Outlets","Sales","Collections","Dues & Alerts","Routes","Repayment Plans","Inventory","Reports","Activity Log","Settings"];

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e2e0f0", fontFamily: "'Sora',sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Cormorant+Garamond:wght@700&display=swap" rel="stylesheet" />
      {toast && <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: toast.type === "success" ? "#065f46" : "#7f1d1d", color: "#fff", padding: "10px 20px", borderRadius: 30, fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px #0008" }}>{toast.msg}</div>}

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg,#0d0d1f,#080810)", borderBottom: "1px solid #1a1a35", padding: "12px 16px", position: "sticky", top: 0, zIndex: 90 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 19, color: "#a78bfa", letterSpacing: 1 }}>◈ TradeTrack Pro</div>
            <div style={{ fontSize: 9, color: "#3a3a5a", letterSpacing: 2, textTransform: "uppercase" }}>AL LAMIA ENTERPRISES</div>
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn color="#7c3aed" onClick={() => { setEditing(null); setModal("outlet"); }}>+ Outlet</Btn>
            <Btn color="#0369a1" onClick={() => setModal("sale")}>+ Sale</Btn>
            <Btn color="#065f46" onClick={() => setModal("collection")}>+ Collect</Btn>
            <Btn color="#1a1a2e" onClick={() => { log("Logout", ""); setLoggedIn(false); setTab("Dashboard"); }}>🚪</Btn>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#0d0d1f", borderBottom: "1px solid #1a1a35", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", maxWidth: 860, margin: "0 auto", padding: "0 16px", minWidth: "max-content" }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", color: tab === t ? "#a78bfa" : "#4b5563", borderBottom: tab === t ? "2px solid #7c3aed" : "2px solid transparent", padding: "11px 13px", cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 700 : 400, whiteSpace: "nowrap", position: "relative" }}>
              {t}
              {t === "Inventory" && lowStockItems.length > 0 && (
                <span style={{ background: "#ef4444", color: "#fff", borderRadius: 10, padding: "1px 5px", fontSize: 9, marginLeft: 4, fontWeight: 700 }}>{lowStockItems.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px" }}>

        {/* DASHBOARD */}
        {tab === "Dashboard" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
              {[{ label: "Total Outlets", value: outlets.length, icon: "🏪", color: "#7c3aed" }, { label: "At Risk", value: atRisk, icon: "⚠️", color: atRisk > 0 ? "#ef4444" : "#22c55e" }, { label: "Today Collected", value: fmt(todayCollected), icon: "💰", color: "#22c55e" }, { label: "Total Dues", value: fmt(totalDue), icon: "📋", color: totalDue > 0 ? "#ef4444" : "#22c55e" }].map(s => (
                <div key={s.label} style={{ background: "#0d0d1f", border: `1px solid ${s.color}22`, borderRadius: 12, padding: 14 }}>
                  <div style={{ fontSize: 20 }}>{s.icon}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 6, letterSpacing: -0.5 }}>{s.value}</div>
                  <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* NEW: Low stock alert on dashboard */}
            {lowStockItems.length > 0 && (
              <div style={{ background: "#1f0a0a", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #7f1d1d" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: "#ef4444" }}>📦 Low Stock Alert ({lowStockItems.length})</span>
                  <button onClick={sendLowStockAlert} style={{ background: "#3b0a0a", border: "1px solid #7f1d1d", color: "#ef4444", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer" }}>📤 WhatsApp</button>
                </div>
                {lowStockItems.slice(0, 3).map(p => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #2a0a0a", fontSize: 13 }}>
                    <span style={{ color: "#e2e0f0" }}>{p.name}</span>
                    <span style={{ color: "#ef4444", fontWeight: 700 }}>{p.stock || 0} {p.unit || "units"} left</span>
                  </div>
                ))}
                {lowStockItems.length > 3 && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 8 }}>+{lowStockItems.length - 3} more — check Inventory tab</div>}
              </div>
            )}

            <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa" }}>🎯 Collection Targets</span>
                <button onClick={() => setModal("target")} style={{ background: "none", border: "1px solid #2a2a4a", color: "#6b7280", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Set</button>
              </div>
              <ProgressBar label="Today" current={todayCollected} target={targets.daily} fmt={fmt} color="#22c55e" />
              <ProgressBar label="This Month" current={monthCollected} target={targets.monthly} fmt={fmt} color="#60a5fa" />
            </div>

            <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>🏆 Top Outlets</div>
              {topOutlets.length === 0 && <div style={{ color: "#4b5563", fontSize: 13 }}>No data yet.</div>}
              {topOutlets.map((o, i) => {
                const total = collections.filter(c => c.outletId === o.id).reduce((s, c) => s + c.amount, 0);
                const trend = getOutletTrend(o.id);
                return <div key={o.id} onClick={() => { setEditing(o); setModal("outletDetail"); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #111120", cursor: "pointer" }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < 3 ? "#000" : "#6b7280", flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div><div style={{ fontSize: 11, color: trend.color }}>{trend.label}</div></div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>{fmt(total)}</div>{o.totalDue > 0 && <div style={{ fontSize: 10, color: "#ef4444" }}>{fmt(o.totalDue)} due</div>}</div>
                </div>;
              })}
            </div>

            <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35" }}>
              <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 8 }}>💬 Daily WhatsApp Summary</div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>Send today's report to owner's WhatsApp in one tap.</div>
              <button onClick={() => sendDailySummary(outlets, collections, sales, targets.ownerContact)} style={{ background: "#1a3a2a", border: "1px solid #14532d", color: "#4ade80", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%" }}>📤 Send Today's Summary</button>
            </div>
          </div>
        )}

        {/* OUTLETS */}
        {tab === "Outlets" && (
          <div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search name, area, phone..." style={{ ...inputSt, marginBottom: 10 }} />
            {areas.length > 1 && <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>{areas.map(a => <button key={a} onClick={() => setAreaFilter(a)} style={{ background: areaFilter === a ? "#7c3aed" : "#1a1a2e", border: "none", color: areaFilter === a ? "#fff" : "#6b7280", borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{a}</button>)}</div>}
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{filteredOutlets.length} outlets · synced live ☁️</div>
            {filteredOutlets.length === 0 && <Empty icon="🏪" text="No outlets found." />}
            {filteredOutlets.map(o => <OutletCard key={o.id} outlet={o} collections={collections} fmt={fmt} trend={getOutletTrend(o.id)}
              onEdit={() => { setEditing(o); setModal("outlet"); }}
              onDelete={() => deleteOutlet(o)}
              onCollect={() => { setEditing(o); setModal("collection"); }}
              onSale={() => { setEditing(o); setModal("sale"); }}
              onWhatsapp={() => whatsapp(o)}
              onView={() => { setEditing(o); setModal("outletDetail"); }}
            />)}
          </div>
        )}

        {/* SALES */}
        {tab === "Sales" && (
          <div>
            <input value={salesSearch} onChange={e => setSalesSearch(e.target.value)} placeholder="🔍 Search outlet name..." style={{ ...inputSt, marginBottom: 10 }} />
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>
              {sales.filter(s => { const o = outlets.find(x => x.id === s.outletId); return !salesSearch || (o?.name || "").toLowerCase().includes(salesSearch.toLowerCase()); }).length} records
            </div>
            {sales.length === 0 && <Empty icon="📦" text="No sales yet." />}
            {[...sales]
              .filter(s => { const o = outlets.find(x => x.id === s.outletId); return !salesSearch || (o?.name || "").toLowerCase().includes(salesSearch.toLowerCase()); })
              .sort((a, b) => new Date(b.date) - new Date(a.date)).map(s => {
              const o = outlets.find(x => x.id === s.outletId);
              return <div key={s.id} style={{ background: "#0d0d1f", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #1a1a35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{o?.name || "?"}</div><div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{s.date}{s.items ? ` · ${s.items}` : ""}{s.deliveryStatus ? ` · ${s.deliveryStatus === "delivered" ? "✅" : "🕐"} ${s.deliveryStatus}` : ""}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: "#60a5fa", fontWeight: 700 }}>{fmt(s.amount)}</div>
                  <SmBtn color="#1e1e35" onClick={() => { setEditSaleRecord(s); setModal("editSale"); }}>✏️</SmBtn>
                  <SmBtn color="#3b0a0a" onClick={() => deleteSale(s)}>🗑</SmBtn>
                </div>
              </div>;
            })}
            {sales.length > 0 && sales.filter(s => { const o = outlets.find(x => x.id === s.outletId); return !salesSearch || (o?.name || "").toLowerCase().includes(salesSearch.toLowerCase()); }).length === 0 && <Empty icon="🔍" text="No sales match your search." />}
          </div>
        )}

        {/* COLLECTIONS */}
        {tab === "Collections" && (
          <div>
            <input value={collectionsSearch} onChange={e => setCollectionsSearch(e.target.value)} placeholder="🔍 Search outlet name..." style={{ ...inputSt, marginBottom: 10 }} />
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>
              {collections.filter(c => { const o = outlets.find(x => x.id === c.outletId); return !collectionsSearch || (o?.name || "").toLowerCase().includes(collectionsSearch.toLowerCase()); }).length} records
            </div>
            {collections.length === 0 && <Empty icon="💰" text="No collections yet." />}
            {[...collections]
              .filter(c => { const o = outlets.find(x => x.id === c.outletId); return !collectionsSearch || (o?.name || "").toLowerCase().includes(collectionsSearch.toLowerCase()); })
              .sort((a, b) => new Date(b.date) - new Date(a.date)).map(c => {
              const o = outlets.find(x => x.id === c.outletId);
              return <div key={c.id} style={{ background: "#0d0d1f", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #1a1a35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontWeight: 600, fontSize: 14 }}>{o?.name || "?"}</div><div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{c.date}{c.payMethod ? ` · ${c.payMethod}` : ""}{c.note ? ` · ${c.note}` : ""}</div></div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ color: "#22c55e", fontWeight: 700 }}>{fmt(c.amount)}</div>
                  <SmBtn color="#1e1e35" onClick={() => { setEditCollectionRecord(c); setModal("editCollection"); }}>✏️</SmBtn>
                  <SmBtn color="#3b0a0a" onClick={() => deleteCollection(c)}>🗑</SmBtn>
                </div>
              </div>;
            })}
            {collections.length > 0 && collections.filter(c => { const o = outlets.find(x => x.id === c.outletId); return !collectionsSearch || (o?.name || "").toLowerCase().includes(collectionsSearch.toLowerCase()); }).length === 0 && <Empty icon="🔍" text="No collections match your search." />}
          </div>
        )}

        {/* DUES & ALERTS */}
        {tab === "Dues & Alerts" && (
          <div>
            <input value={duesSearch} onChange={e => setDuesSearch(e.target.value)} placeholder="🔍 Search outlet name..." style={{ ...inputSt, marginBottom: 14 }} />
            {["danger","warning","good"].map(level => {
              const list = outlets.filter(o => getStatus(o, collections) === level && (!duesSearch || (o.name || "").toLowerCase().includes(duesSearch.toLowerCase()))); if (!list.length) return null;
              const m = STATUS_META[level];
              return <div key={level} style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: m.color, marginBottom: 10, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>{m.label} ({list.length})</div>
                {list.map(o => {
                  const last = [...collections].filter(c => c.outletId === o.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
                  return <div key={o.id} style={{ background: m.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: `1px solid ${m.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div><div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div><div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>{o.area && `📍 ${o.area} · `}{last ? `Last paid ${daysSince(last.date)}d ago` : "Never paid"}</div></div>
                      <div style={{ textAlign: "right" }}><div style={{ fontWeight: 700, color: m.color, fontSize: 15 }}>{fmt(o.totalDue)}</div><div style={{ fontSize: 10, color: "#6b7280" }}>outstanding</div></div>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                      {o.contact && <button onClick={() => whatsapp(o)} style={{ background: "#1a3a2a", border: "1px solid #14532d", color: "#4ade80", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>💬 WhatsApp</button>}
                      {o.mapsUrl && <button onClick={() => window.open(o.mapsUrl, "_blank")} style={{ background: "#0f2030", border: "1px solid #1e3a5f", color: "#60a5fa", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>📍 Maps</button>}
                    </div>
                  </div>;
                })}
              </div>;
            })}
            {outlets.length === 0 && <Empty icon="📋" text="Add outlets to see due tracking." />}
            {outlets.length > 0 && outlets.filter(o => !duesSearch || (o.name || "").toLowerCase().includes(duesSearch.toLowerCase())).length === 0 && <Empty icon="🔍" text="No outlets match your search." />}
          </div>
        )}

        {/* ROUTES — NEW TAB */}
        {tab === "Routes" && (
          <RoutesTab
            outlets={outlets}
            collections={collections}
            repaymentPlans={repaymentPlans}
            routeVisits={routeVisits}
            fmt={fmt}
            onToggleVisited={toggleVisited}
            onClearMissed={clearMissed}
            onCollect={(outlet) => { setEditing(outlet); setModal("collection"); }}
            onView={(outlet) => { setEditing(outlet); setModal("outletDetail"); }}
          />
        )}

        {/* REPAYMENT PLANS — NEW TAB */}
        {tab === "Repayment Plans" && (
          <RepaymentPlansTab
            outlets={outlets}
            collections={collections}
            repaymentPlans={repaymentPlans}
            search={planSearch}
            setSearch={setPlanSearch}
            fmt={fmt}
            onSetPlan={(outlet) => { setPlanOutlet(outlet); setModal("repaymentPlan"); }}
            onRemovePlan={deleteRepaymentPlan}
            onWhatsapp={whatsapp}
          />
        )}

        {/* INVENTORY — NEW TAB */}
        {tab === "Inventory" && (
          <InventoryTab
            products={products}
            stockMovements={stockMovements}
            productAnalytics={productAnalytics}
            lowStockItems={lowStockItems}
            onAddProduct={() => { setEditingProduct(null); setModal("product"); }}
            onEditProduct={(p) => { setEditingProduct(p); setModal("product"); }}
            onDeleteProduct={deleteProduct}
            onStockIn={(p) => { setStockMoveProduct(p); setStockMoveType("in"); setModal("stockMove"); }}
            onStockOut={(p) => { setStockMoveProduct(p); setStockMoveType("out"); setModal("stockMove"); }}
            sendLowStockAlert={sendLowStockAlert}
          />
        )}

        {/* REPORTS */}
        {tab === "Reports" && <ReportsTab outlets={outlets} sales={sales} collections={collections} fmt={fmt} onExport={exportCSV} onExportPDF={() => exportPDF(outlets, collections, sales)} onBackup={() => { backupData(outlets, sales, collections, activityLog); showToast("Backup downloaded!"); }} getGrade={getGrade} getOutletTrend={getOutletTrend} />}

        {/* ACTIVITY LOG */}
        {tab === "Activity Log" && (
          <div>
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 12 }}>{activityLog.length} actions logged</div>
            {activityLog.length === 0 && <Empty icon="📝" text="No activity yet." />}
            {[...activityLog].sort((a, b) => new Date(b._updatedAt?.seconds * 1000 || 0) - new Date(a._updatedAt?.seconds * 1000 || 0)).map(l => (
              <div key={l.id} style={{ background: "#0d0d1f", borderRadius: 10, padding: "10px 14px", marginBottom: 6, border: "1px solid #1a1a35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 13, fontWeight: 600 }}>{l.action}</div><div style={{ fontSize: 11, color: "#4b5563", marginTop: 1 }}>{l.detail}</div></div>
                <div style={{ fontSize: 10, color: "#4b5563", flexShrink: 0, marginLeft: 8 }}>{l.ts}</div>
              </div>
            ))}
          </div>
        )}

        {/* SETTINGS */}
        {tab === "Settings" && <SettingsTab pinsDoc={pinsDoc} targets={targets} savePins={savePins} saveTargets={saveTargets} showToast={showToast} />}
      </div>

      {/* MODALS — existing */}
      {modal === "outlet" && <OutletModal outlet={editing} onClose={() => { setModal(null); setEditing(null); }} onSave={data => { editing ? updateOutlet(editing.id, data) : addOutlet(data); setModal(null); setEditing(null); }} onDelete={editing ? () => { deleteOutlet(editing); setModal(null); setEditing(null); } : null} />}
      {modal === "sale" && <SaleModal outlets={outlets} preSelected={editing?.id} onClose={() => { setModal(null); setEditing(null); }} onSave={data => { addSale(data); setModal(null); setEditing(null); }} />}
      {modal === "editSale" && editSaleRecord && <SaleModal outlets={outlets} record={editSaleRecord} onClose={() => { setModal(null); setEditSaleRecord(null); }} onSave={data => { updateSale(editSaleRecord.id, data); setModal(null); setEditSaleRecord(null); }} onDelete={() => { deleteSale(editSaleRecord); setModal(null); setEditSaleRecord(null); }} />}
      {modal === "collection" && <CollectionModal outlets={outlets} preSelected={editing?.id} onClose={() => { setModal(null); setEditing(null); }} onSave={data => { addCollection(data); setModal(null); setEditing(null); }} />}
      {modal === "editCollection" && editCollectionRecord && <CollectionModal outlets={outlets} record={editCollectionRecord} onClose={() => { setModal(null); setEditCollectionRecord(null); }} onSave={data => { updateCollection(editCollectionRecord.id, data); setModal(null); setEditCollectionRecord(null); }} onDelete={() => { deleteCollection(editCollectionRecord); setModal(null); setEditCollectionRecord(null); }} />}
      {modal === "target" && <TargetModal targets={targets} onClose={() => setModal(null)} onSave={t => { saveTargets(t); setModal(null); }} />}
      {modal === "outletDetail" && editing && <OutletDetailModal outlet={editing} collections={collections} sales={sales} fmt={fmt} onClose={() => { setModal(null); setEditing(null); }} onCollect={() => setModal("collection")} onSale={() => setModal("sale")} onWhatsapp={() => whatsapp(editing)} grade={getGrade(editing, collections, sales)} trend={getOutletTrend(editing.id)} />}
      {/* MODALS — new inventory */}
      {modal === "product" && <ProductModal product={editingProduct} onClose={() => { setModal(null); setEditingProduct(null); }} onSave={data => { editingProduct ? updateProduct(editingProduct.id, data) : addProduct(data); setModal(null); setEditingProduct(null); }} onDelete={editingProduct ? () => { deleteProduct(editingProduct); setModal(null); setEditingProduct(null); } : null} />}
      {modal === "stockMove" && <StockMoveModal product={stockMoveProduct} type={stockMoveType} products={products} onClose={() => { setModal(null); setStockMoveProduct(null); }} onSave={data => { addStockMovement(data); setModal(null); setStockMoveProduct(null); }} />}
      {/* MODAL — new repayment plan */}
      {modal === "repaymentPlan" && planOutlet && <RepaymentPlanModal outlet={planOutlet} plan={repaymentPlans.find(p => p.outletId === planOutlet.id)} onClose={() => { setModal(null); setPlanOutlet(null); }} onSave={data => { saveRepaymentPlan(planOutlet.id, data); setModal(null); setPlanOutlet(null); }} onDelete={() => { const existing = repaymentPlans.find(p => p.outletId === planOutlet.id); if (existing) deleteRepaymentPlan(existing); setModal(null); setPlanOutlet(null); }} />}
    </div>
  );
}

// ── NEW: Repayment Plans helpers & Tab ────────────────────────────────────────
const PERIOD_DAYS = { weekly: 7, monthly: 30 };

const calcRepaymentProgress = (plan, collections) => {
  const perPeriod = plan.duration > 0 ? (plan.amount || 0) / plan.duration : 0;
  const elapsedDays = daysSince(plan.startDate);
  const periodDays = PERIOD_DAYS[plan.type] || 7;
  const periodsElapsed = Math.max(0, Math.min(plan.duration, Math.floor(elapsedDays / periodDays) + 1));
  const plannedSoFar = perPeriod * periodsElapsed;
  const actualPaid = collections
    .filter(c => c.outletId === plan.outletId && c.date >= plan.startDate)
    .reduce((s, c) => s + c.amount, 0);
  const percentComplete = plan.amount > 0 ? Math.min(100, (actualPaid / plan.amount) * 100) : 0;
  let status = "on";
  if (actualPaid >= plannedSoFar * 1.05 && actualPaid > plannedSoFar) status = "ahead";
  else if (actualPaid < plannedSoFar * 0.95) status = "behind";
  return { perPeriod, periodsElapsed, plannedSoFar, actualPaid, percentComplete, status };
};

const PLAN_STATUS_META = {
  ahead:  { color: "#22c55e", label: "🚀 Ahead of Schedule" },
  on:     { color: "#60a5fa", label: "✅ On Track" },
  behind: { color: "#ef4444", label: "⚠️ Behind Schedule" },
};

function RepaymentPlansTab({ outlets, collections, repaymentPlans, search, setSearch, fmt, onSetPlan, onRemovePlan, onWhatsapp }) {
  const filtered = useMemo(() => {
    let list = outlets;
    if (search) list = list.filter(o => (o.name || "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [outlets, search]);

  const withPlans = filtered.filter(o => repaymentPlans.some(p => p.outletId === o.id));
  const withoutPlans = filtered.filter(o => !repaymentPlans.some(p => p.outletId === o.id));

  return (
    <div>
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search outlet name..." style={{ ...inputSt, marginBottom: 12 }} />
      <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 14 }}>{withPlans.length} on a plan · {withoutPlans.length} in calculator mode</div>

      {filtered.length === 0 && <Empty icon="📅" text="No outlets match your search." />}

      {withPlans.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, color: "#a78bfa", marginBottom: 10, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>Active Plans ({withPlans.length})</div>
          {withPlans.map(o => {
            const plan = repaymentPlans.find(p => p.outletId === o.id);
            return <RepaymentPlanCard key={o.id} outlet={o} plan={plan} collections={collections} fmt={fmt} onEditPlan={() => onSetPlan(o)} onRemovePlan={() => onRemovePlan(plan)} onWhatsapp={() => onWhatsapp(o)} />;
          })}
        </div>
      )}

      {withoutPlans.length > 0 && (
        <div>
          <div style={{ fontWeight: 700, color: "#4b5563", marginBottom: 10, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>Calculator Mode ({withoutPlans.length})</div>
          {withoutPlans.map(o => (
            <div key={o.id} style={{ background: "#0d0d1f", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #1a1a35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{o.area || "—"} · Due: {fmt(o.totalDue)}</div>
              </div>
              <SmBtn color="#7c3aed" onClick={() => onSetPlan(o)}>+ Set Plan</SmBtn>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RepaymentPlanCard({ outlet, plan, collections, fmt, onEditPlan, onRemovePlan, onWhatsapp }) {
  const [open, setOpen] = useState(false);
  const prog = calcRepaymentProgress(plan, collections);
  const meta = PLAN_STATUS_META[prog.status];
  const periodLabel = plan.type === "weekly" ? "week" : "month";

  return (
    <div style={{ background: "#0d0d1f", borderRadius: 12, marginBottom: 10, border: `1px solid ${meta.color}33`, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{outlet.name}</div>
          <div style={{ fontSize: 11, color: meta.color }}>{meta.label}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: outlet.totalDue > 0 ? "#ef4444" : "#22c55e", fontSize: 14 }}>{fmt(outlet.totalDue)}</div>
          <div style={{ fontSize: 10, color: "#4b5563" }}>current due</div>
        </div>
        <div style={{ color: "#4b5563", fontSize: 12 }}>{open ? "▲" : "▼"}</div>
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${prog.percentComplete}%`, background: meta.color, borderRadius: 3, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3, textAlign: "right" }}>{Math.round(prog.percentComplete)}% of plan paid</div>
      </div>

      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #111120" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 12 }}>
            <Stat label="Duration" value={`${plan.duration} ${plan.type === "weekly" ? "weeks" : "months"}`} color="#a78bfa" />
            <Stat label={`Per ${periodLabel}`} value={fmt(prog.perPeriod)} color="#60a5fa" />
            <Stat label="Actually Paid" value={fmt(prog.actualPaid)} color="#22c55e" />
            <Stat label="Should've Paid" value={fmt(prog.plannedSoFar)} color={meta.color} />
          </div>
          <div style={{ fontSize: 11, color: "#4b5563", marginTop: 10 }}>Plan started {plan.startDate} · Set for {fmt(plan.amount)} total</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            <SmBtn color="#1e1e35" onClick={onEditPlan}>✏️ Edit Plan</SmBtn>
            {outlet.contact && <SmBtn color="#1a3a2a" onClick={onWhatsapp}>💬 WA</SmBtn>}
            <SmBtn color="#3b0a0a" onClick={onRemovePlan}>🗑 Remove Plan</SmBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function RepaymentPlanModal({ outlet, plan, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    duration: plan?.duration || "",
    type: plan?.type || "monthly",
    startDate: plan?.startDate || todayStr(),
  });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const perPeriodPreview = f.duration > 0 ? (outlet.totalDue || 0) / f.duration : 0;

  return (
    <BottomModal title={plan ? "Edit Repayment Plan" : "Set Repayment Plan"} onClose={onClose}>
      {plan && (
        <div style={{ background: "#1a1030", border: "1px solid #3a1a5a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#c4b5fd" }}>
          ✏️ Editing existing plan for <strong>{outlet.name}</strong>
        </div>
      )}
      <div style={{ background: "#080810", borderRadius: 8, padding: "10px 12px", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>{outlet.name}</span>
        <span style={{ fontSize: 13, color: "#ef4444", fontWeight: 700 }}>Due: {fmt(outlet.totalDue)}</span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: .5 }}>Plan Type</label>
        <div style={{ display: "flex", gap: 8 }}>
          {["weekly","monthly"].map(t => <button key={t} onClick={() => set("type")(t)} style={{ flex: 1, background: f.type === t ? "#7c3aed" : "#080810", border: `1px solid ${f.type === t ? "#7c3aed" : "#1a1a35"}`, color: f.type === t ? "#fff" : "#6b7280", borderRadius: 8, padding: "9px", fontSize: 13, cursor: "pointer", textTransform: "capitalize" }}>{t}</button>)}
        </div>
      </div>

      <FInput label={`Duration (${f.type === "weekly" ? "weeks" : "months"}) *`} value={f.duration} onChange={set("duration")} placeholder="e.g. 8" type="number" />
      <FInput label="Start Date" value={f.startDate} onChange={set("startDate")} type="date" />

      {f.duration > 0 && (
        <div style={{ background: "#0a1f0f", border: "1px solid #14532d", borderRadius: 8, padding: "10px 12px", marginBottom: 14, fontSize: 12, color: "#4ade80" }}>
          💡 They should pay ~{fmt(perPeriodPreview)} per {f.type === "weekly" ? "week" : "month"} for {f.duration} {f.type === "weekly" ? "weeks" : "months"}
        </div>
      )}

      <Btn color="#7c3aed" onClick={() => {
        if (!f.duration || parseInt(f.duration) <= 0) return;
        onSave({ duration: parseInt(f.duration), type: f.type, startDate: f.startDate, amount: outlet.totalDue || 0 });
      }} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>
        {plan ? "Save Changes" : "Set Plan"}
      </Btn>

      {plan && (
        <button onClick={onDelete} style={{ width: "100%", background: "none", border: "1px solid #7f1d1d", color: "#ef4444", borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 }}>🗑 Remove Plan</button>
      )}
    </BottomModal>
  );
}

// ── NEW: Routes Tab ────────────────────────────────────────────────────────────
function dateOffset(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().split("T")[0]; }

function getRouteTarget(outlet, repaymentPlans) {
  if (outlet.manualTarget > 0) return { amount: outlet.manualTarget, source: "Manual" };
  const plan = repaymentPlans.find(p => p.outletId === outlet.id);
  if (plan && plan.duration > 0) return { amount: (plan.amount || 0) / plan.duration, source: "Plan" };
  return null;
}

function RoutesTab({ outlets, collections, repaymentPlans, routeVisits, fmt, onToggleVisited, onClearMissed, onCollect, onView }) {
  const todayMonIdx = (new Date().getDay() + 6) % 7; // 0=Mon ... 6=Sun
  const [selectedDay, setSelectedDay] = useState(todayMonIdx);
  const [search, setSearch] = useState("");

  const missed = useMemo(() => {
    const list = [];
    outlets.forEach(o => {
      (o.collectionDays || []).forEach(dayIdx => {
        const diff = todayMonIdx - dayIdx;
        if (diff > 0) {
          const date = dateOffset(diff);
          const resolved = routeVisits.some(r => r.outletId === o.id && r.date === date && (r.status === "visited" || r.status === "cleared"));
          if (!resolved) list.push({ outlet: o, dayIdx, date });
        }
      });
    });
    return list;
  }, [outlets, routeVisits, todayMonIdx]);

  const dayOutlets = useMemo(() => {
    let list = outlets.filter(o => (o.collectionDays || []).includes(selectedDay));
    if (search) list = list.filter(o => (o.name || "").toLowerCase().includes(search.toLowerCase()));
    return list;
  }, [outlets, selectedDay, search]);

  const diff = todayMonIdx - selectedDay;
  const isToday = diff === 0;
  const isUpcoming = diff < 0;
  const occurrenceDate = diff >= 0 ? dateOffset(diff) : null;

  const visitedSet = useMemo(() => new Set(routeVisits.filter(r => r.date === occurrenceDate && r.status === "visited").map(r => r.outletId)), [routeVisits, occurrenceDate]);
  const clearedSet = useMemo(() => new Set(routeVisits.filter(r => r.date === occurrenceDate && r.status === "cleared").map(r => r.outletId)), [routeVisits, occurrenceDate]);

  const dayTargetTotal = dayOutlets.reduce((s, o) => { const t = getRouteTarget(o, repaymentPlans); return s + (t ? t.amount : 0); }, 0);
  const dayCollected = occurrenceDate ? collections.filter(c => c.date === occurrenceDate && dayOutlets.some(o => o.id === c.outletId)).reduce((s, c) => s + c.amount, 0) : 0;
  const visitedCount = dayOutlets.filter(o => visitedSet.has(o.id)).length;

  return (
    <div>
      {missed.length > 0 && (
        <div style={{ background: "#1f0a0a", borderRadius: 12, padding: 14, marginBottom: 16, border: "1px solid #7f1d1d" }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#ef4444", marginBottom: 10 }}>⚠️ Missed Visits ({missed.length})</div>
          {missed.map(({ outlet, dayIdx, date }) => (
            <div key={`${outlet.id}-${date}`} style={{ background: "#0d0d1f", borderRadius: 8, padding: "10px 12px", marginBottom: 6, border: "1px solid #3b0a0a" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{outlet.name}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>Missed {ROUTE_DAY_NAMES_FULL[dayIdx]} ({date}) · Due: {fmt(outlet.totalDue)}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                <SmBtn color="#065f46" onClick={() => onCollect(outlet)}>💰 Collect</SmBtn>
                <SmBtn color="#1e1e35" onClick={() => onClearMissed(outlet, date)}>↻ Start Fresh</SmBtn>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 2 }}>
        {ROUTE_DAY_NAMES_FULL.map((d, idx) => (
          <button key={d} onClick={() => setSelectedDay(idx)} style={{ background: selectedDay === idx ? "#7c3aed" : "#1a1a2e", border: idx === todayMonIdx ? "1px solid #a78bfa" : "1px solid transparent", color: selectedDay === idx ? "#fff" : "#6b7280", borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap", fontWeight: idx === todayMonIdx ? 700 : 400 }}>
            {d.slice(0, 3)}{idx === todayMonIdx ? " •" : ""}
          </button>
        ))}
      </div>

      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search outlet name..." style={{ ...inputSt, marginBottom: 12 }} />

      {occurrenceDate && dayOutlets.length > 0 && (
        <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
            <span style={{ color: "#6b7280" }}>{visitedCount} of {dayOutlets.length} visited</span>
            <span style={{ color: "#e2e0f0" }}>{fmt(dayCollected)}{dayTargetTotal > 0 ? ` / ${fmt(dayTargetTotal)} target` : ""}</span>
          </div>
          <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${dayOutlets.length ? (visitedCount / dayOutlets.length) * 100 : 0}%`, background: "#22c55e", borderRadius: 3, transition: "width 0.5s ease" }} />
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>
        {ROUTE_DAY_NAMES_FULL[selectedDay]}{isToday ? " (Today)" : isUpcoming ? " · Upcoming" : ` · ${occurrenceDate}`} — {dayOutlets.length} outlets scheduled
      </div>

      {dayOutlets.length === 0 && <Empty icon="🗓️" text="No outlets scheduled for this day. Assign route days in the outlet's edit form." />}

      {dayOutlets.map(o => {
        const target = getRouteTarget(o, repaymentPlans);
        const visited = visitedSet.has(o.id);
        const cleared = clearedSet.has(o.id);
        return (
          <div key={o.id} style={{ background: "#0d0d1f", borderRadius: 12, padding: "12px 14px", marginBottom: 8, border: `1px solid ${visited ? "#14532d" : "#1a1a35"}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{o.area || "—"}{target ? ` · 🎯 ${fmt(target.amount)} target (${target.source})` : ""}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontWeight: 700, color: o.totalDue > 0 ? "#ef4444" : "#22c55e", fontSize: 14 }}>{fmt(o.totalDue)}</div>
                <div style={{ fontSize: 10, color: "#4b5563" }}>due</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
              {isUpcoming ? (
                <span style={{ fontSize: 11, color: "#4b5563" }}>📅 Scheduled — actions unlock on the day</span>
              ) : (
                <>
                  <SmBtn color="#065f46" onClick={() => onCollect(o)}>💰 Collect</SmBtn>
                  <SmBtn color={visited ? "#1a3a2a" : "#1e1e35"} onClick={() => onToggleVisited(o, occurrenceDate)}>{visited ? "✅ Visited" : "✓ Mark Visited"}</SmBtn>
                  <SmBtn color="#1a1a2e" onClick={() => onView(o)}>👁 Detail</SmBtn>
                  {!isToday && !visited && cleared && <span style={{ fontSize: 11, color: "#6b7280" }}>Cleared</span>}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
const ROUTE_DAY_NAMES_FULL = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

// ── NEW: Inventory Tab ────────────────────────────────────────────────────────
function InventoryTab({ products, stockMovements, productAnalytics, lowStockItems, onAddProduct, onEditProduct, onDeleteProduct, onStockIn, onStockOut, sendLowStockAlert }) {
  const [view, setView] = useState("products");
  return (
    <div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto" }}>
        {[["products","📦 Products"], ["analytics","📊 Analytics"], ["lowstock",`⚠️ Low Stock${lowStockItems.length > 0 ? ` (${lowStockItems.length})` : ""}`]].map(([v, label]) => (
          <button key={v} onClick={() => setView(v)} style={{ background: view === v ? "#7c3aed" : "#1a1a2e", border: "none", color: view === v ? "#fff" : "#6b7280", borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{label}</button>
        ))}
      </div>

      {view === "products" && (
        <div>
          <button onClick={onAddProduct} style={{ background: "#7c3aed", border: "none", color: "#fff", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%", marginBottom: 12 }}>+ Add Product</button>
          <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{products.length} products · synced live ☁️</div>
          {products.length === 0 && <Empty icon="📦" text="No products yet. Add your first product to start tracking inventory." />}
          {products.map(p => <ProductCard key={p.id} product={p} stockMovements={stockMovements} onEdit={() => onEditProduct(p)} onDelete={() => onDeleteProduct(p)} onStockIn={() => onStockIn(p)} onStockOut={() => onStockOut(p)} />)}
        </div>
      )}

      {view === "analytics" && (
        <div>
          <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#22c55e", marginBottom: 12 }}>🏆 Best Selling Products</div>
            {productAnalytics.length === 0 && <div style={{ color: "#4b5563", fontSize: 13 }}>No data yet — record stock out movements to see analytics.</div>}
            {productAnalytics.slice(0, 5).map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #111120" }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < 3 ? "#000" : "#6b7280", flexShrink: 0 }}>{i + 1}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>{p.category || "Uncategorized"}</div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>{p.totalOut} {p.unit || "units"} out</div>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>{p.stock || 0} in stock</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#f59e0b", marginBottom: 12 }}>📉 Slow Moving Products</div>
            {productAnalytics.length === 0 && <div style={{ color: "#4b5563", fontSize: 13 }}>No data yet.</div>}
            {[...productAnalytics].reverse().slice(0, 5).map(p => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #111120" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>{p.category || "Uncategorized"}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, color: "#f59e0b", fontWeight: 600 }}>{p.totalOut} {p.unit || "units"} out</div>
                  <div style={{ fontSize: 11, color: "#4b5563" }}>{p.stock || 0} in stock</div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35" }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>📋 Inventory Summary</div>
            {[
              { label: "Total Products", value: productAnalytics.length, color: "#a78bfa" },
              { label: "Total Stock Value", value: "₹ " + new Intl.NumberFormat("en-IN").format(productAnalytics.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0)), color: "#22c55e" },
              { label: "Low Stock Items", value: productAnalytics.filter(p => p.minThreshold > 0 && (p.stock || 0) <= p.minThreshold).length, color: "#ef4444" },
              { label: "Out of Stock", value: productAnalytics.filter(p => (p.stock || 0) === 0).length, color: "#f59e0b" },
            ].map(r => (
              <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111120", fontSize: 13 }}>
                <span style={{ color: "#6b7280" }}>{r.label}</span>
                <span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === "lowstock" && (
        <div>
          <button onClick={sendLowStockAlert} style={{ background: "#1a3a2a", border: "1px solid #14532d", color: "#4ade80", borderRadius: 8, padding: "10px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", width: "100%", marginBottom: 12 }}>📤 Send Restock Alert via WhatsApp</button>
          {lowStockItems.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#22c55e" }}>
              <div style={{ fontSize: 40 }}>✅</div>
              <div style={{ marginTop: 8, fontSize: 14 }}>All products are well stocked!</div>
            </div>
          )}
          {lowStockItems.map(p => {
            const pct = p.minThreshold > 0 ? Math.min(100, ((p.stock || 0) / p.minThreshold) * 100) : 0;
            return (
              <div key={p.id} style={{ background: "#1f0a0a", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #7f1d1d" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{p.category || "Uncategorized"} · Min: {p.minThreshold} {p.unit || "units"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, color: "#ef4444", fontSize: 20 }}>{p.stock || 0}</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>{p.unit || "units"} left</div>
                  </div>
                </div>
                <div style={{ height: 4, background: "#2a0a0a", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${pct}%`, background: pct <= 25 ? "#ef4444" : "#f59e0b", borderRadius: 2 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── NEW: Product Card ─────────────────────────────────────────────────────────
function ProductCard({ product, stockMovements, onEdit, onDelete, onStockIn, onStockOut }) {
  const [open, setOpen] = useState(false);
  const movements = [...stockMovements].filter(m => m.productId === product.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const isOut = (product.stock || 0) === 0;
  const isLow = !isOut && product.minThreshold > 0 && (product.stock || 0) <= product.minThreshold;
  const stockColor = isOut ? "#ef4444" : isLow ? "#f59e0b" : "#22c55e";
  const borderColor = isOut ? "#7f1d1d" : isLow ? "#78350f" : "#1a1a35";
  return (
    <div style={{ background: "#0d0d1f", borderRadius: 12, marginBottom: 10, border: `1px solid ${borderColor}`, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: stockColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>{product.category || "Uncategorized"}{product.price ? ` · ₹${product.price}` : ""}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 800, color: stockColor, fontSize: 18 }}>{product.stock || 0}</div>
          <div style={{ fontSize: 10, color: "#4b5563" }}>{product.unit || "units"}</div>
        </div>
        <div style={{ color: "#4b5563", fontSize: 12 }}>{open ? "▲" : "▼"}</div>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #111120" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
            <Stat label="In Stock" value={`${product.stock || 0} ${product.unit || "units"}`} color={stockColor} />
            <Stat label="Min Threshold" value={product.minThreshold || "Not set"} color="#a78bfa" />
            <Stat label="Price" value={product.price ? `₹${product.price}` : "—"} color="#60a5fa" />
          </div>
          {(isLow || isOut) && (
            <div style={{ background: isOut ? "#3b0a0a" : "#2a1500", borderRadius: 8, padding: "8px 12px", marginTop: 10, fontSize: 12, color: isOut ? "#ef4444" : "#f59e0b", fontWeight: 600 }}>
              {isOut ? "🔴 Out of Stock — Restock Immediately" : "⚠️ Low Stock — Restock Needed"}
            </div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            <SmBtn color="#065f46" onClick={onStockIn}>📥 Stock In</SmBtn>
            <SmBtn color="#0369a1" onClick={onStockOut}>📤 Stock Out</SmBtn>
            <SmBtn color="#1e1e35" onClick={onEdit}>✏️ Edit</SmBtn>
            <SmBtn color="#3b0a0a" onClick={onDelete}>🗑</SmBtn>
          </div>
          {movements.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: "#4b5563", marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Recent Movements</div>
              {movements.slice(0, 4).map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #111120", fontSize: 12 }}>
                  <span style={{ color: "#6b7280" }}>{m.date}{m.note ? ` · ${m.note}` : ""}</span>
                  <span style={{ color: m.type === "in" ? "#22c55e" : "#60a5fa", fontWeight: 600 }}>{m.type === "in" ? "+" : "−"}{m.quantity} {product.unit || "units"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── NEW: Product Modal ────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onSave, onDelete }) {
  const [f, setF] = useState({
    name: product?.name || "",
    category: product?.category || "",
    unit: product?.unit || "units",
    price: product?.price || "",
    stock: product?.stock !== undefined ? product.stock : "",
    minThreshold: product?.minThreshold || "",
  });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <BottomModal title={product ? "Edit Product" : "Add Product"} onClose={onClose}>
      {product && (
        <div style={{ background: "#1a1030", border: "1px solid #3a1a5a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#c4b5fd" }}>
          ✏️ Editing <strong>{product.name}</strong>
        </div>
      )}
      <FInput label="Product Name *" value={f.name} onChange={set("name")} placeholder="e.g. Glass Set 6pcs" />
      <FInput label="Category" value={f.category} onChange={set("category")} placeholder="e.g. Glassware, Ceramics, Cutlery" />
      <FInput label="Unit" value={f.unit} onChange={set("unit")} placeholder="e.g. box, piece, set, dozen" />
      <FInput label="Price per Unit (₹)" value={f.price} onChange={set("price")} placeholder="e.g. 500" type="number" />
      {!product && <FInput label="Opening Stock" value={f.stock} onChange={set("stock")} placeholder="0" type="number" />}
      <FInput label="Minimum Stock Threshold" value={f.minThreshold} onChange={set("minThreshold")} placeholder="e.g. 10" type="number" />
      <div style={{ fontSize: 11, color: "#4b5563", marginTop: -8, marginBottom: 14 }}>⚠️ Alert triggers when stock falls at or below this number</div>
      <Btn color="#7c3aed" onClick={() => {
        if (!f.name.trim()) return;
        onSave({ ...f, price: parseFloat(f.price) || 0, stock: parseInt(f.stock) || 0, minThreshold: parseInt(f.minThreshold) || 0 });
      }} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>
        {product ? "Save Changes" : "Add Product"}
      </Btn>
      {product && onDelete && (
        <button onClick={onDelete} style={{ width: "100%", background: "none", border: "1px solid #7f1d1d", color: "#ef4444", borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 }}>🗑 Delete Product</button>
      )}
    </BottomModal>
  );
}

// ── NEW: Stock Move Modal ─────────────────────────────────────────────────────
function StockMoveModal({ product, type, products, onClose, onSave }) {
  const [f, setF] = useState({ productId: product?.id || "", type: type || "in", quantity: "", note: "", date: todayStr() });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const selected = product || products.find(p => p.id === f.productId);
  return (
    <BottomModal title={type === "in" ? "📥 Stock In" : "📤 Stock Out"} onClose={onClose}>
      {!product && <FSelect label="Product *" value={f.productId} onChange={set("productId")} options={products.map(p => ({ v: p.id, l: `${p.name} (${p.stock || 0} ${p.unit || "units"})` }))} />}
      {selected && (
        <div style={{ background: "#080810", borderRadius: 8, padding: "10px 12px", marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
          <span style={{ fontSize: 13, color: "#a78bfa", fontWeight: 600 }}>{selected.name}</span>
          <span style={{ fontSize: 13, color: "#4b5563" }}>Current: {selected.stock || 0} {selected.unit || "units"}</span>
        </div>
      )}
      <FInput label="Quantity *" value={f.quantity} onChange={set("quantity")} placeholder="0" type="number" />
      <FInput label="Date" value={f.date} onChange={set("date")} type="date" />
      <FInput label="Note (optional)" value={f.note} onChange={set("note")} placeholder={type === "in" ? "e.g. Received from supplier" : "e.g. Sold to outlet"} />
      <Btn color={type === "in" ? "#065f46" : "#0369a1"} onClick={() => {
        const pid = product?.id || f.productId;
        if (!pid || !f.quantity) return;
        onSave({ ...f, productId: pid, quantity: parseInt(f.quantity) || 0 });
      }} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>
        {type === "in" ? "📥 Add to Stock" : "📤 Remove from Stock"}
      </Btn>
    </BottomModal>
  );
}

// ── Sub-components (mostly unchanged) ─────────────────────────────────────────
function ProgressBar({ label, current, target, fmt, color }) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  return <div style={{ marginBottom: 10 }}>
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}><span style={{ color: "#6b7280" }}>{label}</span><span style={{ color: "#e2e0f0" }}>{fmt(current)}{target > 0 ? ` / ${fmt(target)}` : " (no target)"}</span></div>
    <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} /></div>
    {target > 0 && <div style={{ fontSize: 10, color: pct >= 100 ? "#22c55e" : "#6b7280", marginTop: 2, textAlign: "right" }}>{Math.round(pct)}%</div>}
  </div>;
}
function OutletCard({ outlet, collections, fmt, onEdit, onDelete, onCollect, onSale, onWhatsapp, onView, trend }) {
  const status = getStatus(outlet, collections); const m = STATUS_META[status];
  const cols = collections.filter(c => c.outletId === outlet.id);
  const totalCollected = cols.reduce((s, c) => s + c.amount, 0);
  const last = [...cols].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const [open, setOpen] = useState(false);
  return <div style={{ background: "#0d0d1f", borderRadius: 12, marginBottom: 10, border: `1px solid ${m.color}33`, overflow: "hidden" }}>
    <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{outlet.name}</div><div style={{ fontSize: 11, color: "#4b5563" }}>{outlet.area || "—"}{outlet.contact && ` · ${outlet.contact}`}</div></div>
      <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontWeight: 700, color: outlet.totalDue > 0 ? "#ef4444" : "#22c55e", fontSize: 14 }}>{fmt(outlet.totalDue)}</div><div style={{ fontSize: 10, color: trend.color }}>{trend.label}</div></div>
      <div style={{ color: "#4b5563", fontSize: 12 }}>{open ? "▲" : "▼"}</div>
    </div>
    {open && <div style={{ padding: "0 14px 14px", borderTop: "1px solid #111120" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginTop: 12 }}>
        <Stat label="Collected" value={fmt(totalCollected)} color="#22c55e" />
        <Stat label="Last Payment" value={last ? last.date : "Never"} color="#a78bfa" />
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        <SmBtn color="#065f46" onClick={onCollect}>💰 Collect</SmBtn>
        <SmBtn color="#0369a1" onClick={onSale}>📦 Sale</SmBtn>
        <SmBtn color="#1e1e35" onClick={onEdit}>✏️ Edit</SmBtn>
        {outlet.contact && <SmBtn color="#1a3a2a" onClick={onWhatsapp}>💬 WA</SmBtn>}
        {outlet.mapsUrl && <SmBtn color="#1a2a3a" onClick={() => window.open(outlet.mapsUrl, "_blank")}>📍 Maps</SmBtn>}
        <SmBtn color="#1a1a2e" onClick={onView}>👁 Detail</SmBtn>
        <SmBtn color="#3b0a0a" onClick={onDelete}>🗑</SmBtn>
      </div>
    </div>}
  </div>;
}
function ReportsTab({ outlets, sales, collections, fmt, onExport, onExportPDF, onBackup, getGrade, getOutletTrend }) {
  const months = useMemo(() => { const map = {}; collections.forEach(c => { const m = c.date?.slice(0, 7); if (m) map[m] = (map[m] || 0) + c.amount; }); return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6); }, [collections]);
  const graded = useMemo(() => outlets.map(o => ({ ...o, g: getGrade(o, collections, sales) })).sort((a, b) => ["A+","A","B","C","D","F"].indexOf(a.g.grade) - ["A+","A","B","C","D","F"].indexOf(b.g.grade)), [outlets, collections, sales]);
  const gc = useMemo(() => { const c = { "A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0 }; graded.forEach(o => c[o.g.grade]++); return c; }, [graded]);
  const totalSales = sales.reduce((s, x) => s + x.amount, 0); const totalCollected = collections.reduce((s, x) => s + x.amount, 0); const totalDue = outlets.reduce((s, o) => s + (o.totalDue || 0), 0);
  return <div>
    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
      <button onClick={onExportPDF} style={{ background: "#7c3aed", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📄 PDF Report</button>
      <button onClick={onExport} style={{ background: "#065f46", border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>⬇ CSV</button>
      <button onClick={onBackup} style={{ background: "#1a1a2e", border: "1px solid #2a2a4a", color: "#a78bfa", borderRadius: 8, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>💾 Backup</button>
    </div>
    <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>🏅 Outlet Grades</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
        {[["A+","#16a34a"],["A","#22c55e"],["B","#3b82f6"],["C","#f59e0b"],["D","#f97316"],["F","#ef4444"]].map(([g, c]) => (
          <div key={g} style={{ background: "#080810", borderRadius: 8, padding: "8px 10px", textAlign: "center", border: `1px solid ${c}33` }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{g}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e0f0", marginTop: 2 }}>{gc[g]}</div>
            <div style={{ fontSize: 10, color: "#4b5563" }}>outlets</div>
          </div>
        ))}
      </div>
      {graded.slice(0, 8).map(o => (
        <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #111120" }}>
          <div><span style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</span><span style={{ fontSize: 11, color: getOutletTrend(o.id).color, marginLeft: 8 }}>{getOutletTrend(o.id).label}</span></div>
          <span style={{ background: o.g.color, color: "#000", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 800 }}>{o.g.grade}</span>
        </div>
      ))}
      {graded.length > 8 && <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8, textAlign: "center" }}>+{graded.length - 8} more in PDF</div>}
    </div>
    <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>📊 Summary</div>
      {[{ label: "Total Sales", value: fmt(totalSales), color: "#60a5fa" }, { label: "Total Collected", value: fmt(totalCollected), color: "#22c55e" }, { label: "Outstanding", value: fmt(totalDue), color: "#ef4444" }, { label: "Outlets", value: outlets.length, color: "#a78bfa" }].map(r => (
        <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111120", fontSize: 13 }}>
          <span style={{ color: "#6b7280" }}>{r.label}</span><span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
        </div>
      ))}
    </div>
    <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>📅 Monthly Collections</div>
      {months.length === 0 && <div style={{ color: "#4b5563", fontSize: 13 }}>No data yet.</div>}
      {months.map(([m, amt]) => (
        <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111120", fontSize: 13 }}>
          <span style={{ color: "#6b7280" }}>{m}</span><span style={{ fontWeight: 700, color: "#22c55e" }}>{fmt(amt)}</span>
        </div>
      ))}
    </div>
  </div>;
}
function SettingsTab({ pinsDoc, targets, savePins, saveTargets, showToast }) {
  const [ownerPin, setOwnerPin] = useState(pinsDoc.owner);
  const [ownerContact, setOwnerContact] = useState(targets.ownerContact || "");
  const [daily, setDaily] = useState(targets.daily || "");
  const [monthly, setMonthly] = useState(targets.monthly || "");
  return <div>
    <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 16, marginBottom: 14, border: "1px solid #1a1a35" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 14 }}>🔐 Change PIN</div>
      <FInput label="PIN" value={ownerPin} onChange={setOwnerPin} placeholder="Min 4 digits" type="password" />
      <Btn color="#7c3aed" onClick={() => { if (ownerPin.length >= 4) { savePins({ owner: ownerPin }); } else showToast("Min 4 digits", "error"); }} style={{ width: "100%", padding: 11, fontSize: 14, marginTop: 4 }}>Save PIN</Btn>
    </div>
    <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 16, marginBottom: 14, border: "1px solid #1a1a35" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 14 }}>🎯 Collection Targets</div>
      <FInput label="Daily Target (₹)" value={daily} onChange={setDaily} placeholder="e.g. 50000" type="number" />
      <FInput label="Monthly Target (₹)" value={monthly} onChange={setMonthly} placeholder="e.g. 1000000" type="number" />
      <Btn color="#7c3aed" onClick={() => saveTargets({ ...targets, daily: parseFloat(daily) || 0, monthly: parseFloat(monthly) || 0 })} style={{ width: "100%", padding: 11, fontSize: 14, marginTop: 4 }}>Save Targets</Btn>
    </div>
    <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 16, border: "1px solid #1a1a35" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 14 }}>📱 Owner WhatsApp</div>
      <FInput label="Owner WhatsApp Number (with country code)" value={ownerContact} onChange={setOwnerContact} placeholder="e.g. 919876543210" type="tel" />
      <Btn color="#065f46" onClick={() => saveTargets({ ...targets, ownerContact })} style={{ width: "100%", padding: 11, fontSize: 14, marginTop: 4 }}>Save Number</Btn>
    </div>
  </div>;
}
function BottomModal({ title, children, onClose }) {
  return <div style={{ position: "fixed", inset: 0, background: "#00000090", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
    <div style={{ background: "#0d0d1f", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 500, padding: "20px 16px", maxHeight: "92vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#4b5563", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
      </div>
      {children}
    </div>
  </div>;
}
const ROUTE_DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
function OutletModal({ outlet, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ name: outlet?.name || "", area: outlet?.area || "", contact: outlet?.contact || "", notes: outlet?.notes || "", mapsUrl: outlet?.mapsUrl || "", collectionDays: outlet?.collectionDays || [], manualTarget: outlet?.manualTarget || "" });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const toggleDay = (idx) => setF(p => ({ ...p, collectionDays: p.collectionDays.includes(idx) ? p.collectionDays.filter(d => d !== idx) : [...p.collectionDays, idx] }));
  return <BottomModal title={outlet ? "Edit Outlet" : "Add New Outlet"} onClose={onClose}>
    {outlet && (
      <div style={{ background: "#1a1030", border: "1px solid #3a1a5a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#c4b5fd" }}>
        ✏️ Editing <strong>{outlet.name}</strong>
      </div>
    )}
    <FInput label="Outlet Name *" value={f.name} onChange={set("name")} placeholder="e.g. Rahman Traders" />
    <FInput label="Area / Zone" value={f.area} onChange={set("area")} placeholder="e.g. Kozhikode" />
    <FInput label="Contact Number" value={f.contact} onChange={set("contact")} placeholder="e.g. 9876543210" />
    <FInput label="Google Maps Link" value={f.mapsUrl} onChange={set("mapsUrl")} placeholder="Paste Google Maps URL" />
    <div style={{ fontSize: 11, color: "#4b5563", marginTop: -8, marginBottom: 12 }}>Google Maps → Share → Copy Link → Paste above</div>
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: .5 }}>Collection Route Days</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ROUTE_DAY_NAMES.map((d, idx) => (
          <button key={d} onClick={() => toggleDay(idx)} style={{ background: f.collectionDays.includes(idx) ? "#7c3aed" : "#080810", border: `1px solid ${f.collectionDays.includes(idx) ? "#7c3aed" : "#1a1a35"}`, color: f.collectionDays.includes(idx) ? "#fff" : "#6b7280", borderRadius: 8, padding: "8px 10px", fontSize: 12, cursor: "pointer", minWidth: 42 }}>{d}</button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#4b5563", marginTop: 6 }}>Pick every day you're scheduled to visit this outlet. Shows up in the Routes tab.</div>
    </div>
    <FInput label="Manual Collection Target (₹)" value={f.manualTarget} onChange={set("manualTarget")} placeholder="Leave blank to auto-use Repayment Plan amount" type="number" />
    <FInput label="Notes" value={f.notes} onChange={set("notes")} placeholder="Any extra info" />
    <Btn color="#7c3aed" onClick={() => f.name.trim() && onSave({ ...f, manualTarget: parseFloat(f.manualTarget) || 0 })} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>{outlet ? "Save Changes" : "Add Outlet"}</Btn>
    {outlet && onDelete && (
      <button onClick={onDelete} style={{ width: "100%", background: "none", border: "1px solid #7f1d1d", color: "#ef4444", borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 }}>🗑 Delete Outlet</button>
    )}
  </BottomModal>;
}
function SaleModal({ outlets, preSelected, record, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ outletId: record?.outletId || preSelected || "", amount: record?.amount ?? "", date: record?.date || todayStr(), items: record?.items || "", deliveryStatus: record?.deliveryStatus || "delivered" });
  const [touched, setTouched] = useState(false);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const missingOutlet = touched && !f.outletId;
  const missingAmount = touched && !f.amount;
  return <BottomModal title={record ? "Edit Sale" : "Record New Sale"} onClose={onClose}>
    {record && (
      <div style={{ background: "#1a1030", border: "1px solid #3a1a5a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#c4b5fd" }}>
        ✏️ Editing sale of {fmt(record.amount)} dated {record.date}
      </div>
    )}
    <FSelect label="Outlet *" value={f.outletId} onChange={set("outletId")} options={outlets.map(o => ({ v: o.id, l: o.name }))} />
    {missingOutlet && <div style={{ fontSize: 11, color: "#ef4444", marginTop: -8, marginBottom: 12 }}>Please select an outlet</div>}
    <FInput label="Amount (₹) *" value={f.amount} onChange={set("amount")} placeholder="0" type="number" />
    {missingAmount && <div style={{ fontSize: 11, color: "#ef4444", marginTop: -8, marginBottom: 12 }}>Please enter an amount</div>}
    <FInput label="Items / Description" value={f.items} onChange={set("items")} placeholder="e.g. 50 glass sets, 20 plates" />
    <FInput label="Date" value={f.date} onChange={set("date")} type="date" />
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: .5 }}>Delivery Status</label>
      <div style={{ display: "flex", gap: 8 }}>
        {["delivered","pending"].map(s => <button key={s} onClick={() => set("deliveryStatus")(s)} style={{ flex: 1, background: f.deliveryStatus === s ? "#0369a1" : "#080810", border: `1px solid ${f.deliveryStatus === s ? "#0369a1" : "#1a1a35"}`, color: f.deliveryStatus === s ? "#fff" : "#6b7280", borderRadius: 8, padding: "9px", fontSize: 13, cursor: "pointer" }}>{s === "delivered" ? "✅ Delivered" : "🕐 Pending"}</button>)}
      </div>
    </div>
    <Btn color="#0369a1" onClick={() => { setTouched(true); if (f.outletId && f.amount) onSave({ ...f, amount: parseFloat(f.amount) }); }} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>{record ? "Update Sale" : "Save Sale"}</Btn>
    {record && onDelete && (
      <button onClick={onDelete} style={{ width: "100%", background: "none", border: "1px solid #7f1d1d", color: "#ef4444", borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 }}>🗑 Delete Sale</button>
    )}
  </BottomModal>;
}
function CollectionModal({ outlets, preSelected, record, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ outletId: record?.outletId || preSelected || "", amount: record?.amount ?? "", date: record?.date || todayStr(), note: record?.note || "", payMethod: record?.payMethod || "Cash" });
  const [touched, setTouched] = useState(false);
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  const missingOutlet = touched && !f.outletId;
  const missingAmount = touched && !f.amount;
  return <BottomModal title={record ? "Edit Collection" : "Record Collection"} onClose={onClose}>
    {record && (
      <div style={{ background: "#1a1030", border: "1px solid #3a1a5a", borderRadius: 8, padding: "8px 12px", marginBottom: 14, fontSize: 12, color: "#c4b5fd" }}>
        ✏️ Editing collection of {fmt(record.amount)} dated {record.date}
      </div>
    )}
    <FSelect label="Outlet *" value={f.outletId} onChange={set("outletId")} options={outlets.map(o => ({ v: o.id, l: `${o.name}${o.totalDue > 0 ? ` (Due: ₹${Math.round(o.totalDue)})` : ""}` }))} />
    {missingOutlet && <div style={{ fontSize: 11, color: "#ef4444", marginTop: -8, marginBottom: 12 }}>Please select an outlet</div>}
    <FInput label="Amount (₹) *" value={f.amount} onChange={set("amount")} placeholder="0" type="number" />
    {missingAmount && <div style={{ fontSize: 11, color: "#ef4444", marginTop: -8, marginBottom: 12 }}>Please enter an amount</div>}
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: .5 }}>Payment Method</label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["Cash","Bank Transfer","GPay"].map(m => <button key={m} onClick={() => set("payMethod")(m)} style={{ background: f.payMethod === m ? "#065f46" : "#080810", border: `1px solid ${f.payMethod === m ? "#065f46" : "#1a1a35"}`, color: f.payMethod === m ? "#fff" : "#6b7280", borderRadius: 8, padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>{m}</button>)}
      </div>
    </div>
    <FInput label="Date" value={f.date} onChange={set("date")} type="date" />
    <FInput label="Note (optional)" value={f.note} onChange={set("note")} placeholder="e.g. Partial payment" />
    <Btn color="#065f46" onClick={() => { setTouched(true); if (f.outletId && f.amount) onSave({ ...f, amount: parseFloat(f.amount) }); }} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>{record ? "Update Collection" : "Save Collection"}</Btn>
    {record && onDelete && (
      <button onClick={onDelete} style={{ width: "100%", background: "none", border: "1px solid #7f1d1d", color: "#ef4444", borderRadius: 8, padding: 11, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 10 }}>🗑 Delete Collection</button>
    )}
  </BottomModal>;
}
function TargetModal({ targets, onClose, onSave }) {
  const [f, setF] = useState({ daily: targets.daily || "", monthly: targets.monthly || "" });
  return <BottomModal title="Set Targets" onClose={onClose}>
    <FInput label="Daily Target (₹)" value={f.daily} onChange={v => setF(p => ({ ...p, daily: v }))} placeholder="e.g. 50000" type="number" />
    <FInput label="Monthly Target (₹)" value={f.monthly} onChange={v => setF(p => ({ ...p, monthly: v }))} placeholder="e.g. 1000000" type="number" />
    <Btn color="#7c3aed" onClick={() => onSave({ ...targets, daily: parseFloat(f.daily) || 0, monthly: parseFloat(f.monthly) || 0 })} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>Save</Btn>
  </BottomModal>;
}
function OutletDetailModal({ outlet, collections, sales, fmt, onClose, onCollect, onSale, onWhatsapp, grade, trend }) {
  const cols = [...collections].filter(c => c.outletId === outlet.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const sals = [...sales].filter(s => s.outletId === outlet.id);
  return <BottomModal title={outlet.name} onClose={onClose}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
      <span style={{ background: grade.color, color: "#000", borderRadius: 20, padding: "3px 12px", fontSize: 14, fontWeight: 800 }}>{grade.grade} · {grade.label}</span>
      <span style={{ color: trend.color, fontSize: 12 }}>{trend.label}</span>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
      <Stat label="Total Sales" value={fmt(sals.reduce((s, x) => s + x.amount, 0))} color="#60a5fa" />
      <Stat label="Collected" value={fmt(cols.reduce((s, c) => s + c.amount, 0))} color="#22c55e" />
      <Stat label="Outstanding" value={fmt(outlet.totalDue)} color={outlet.totalDue > 0 ? "#ef4444" : "#22c55e"} />
      <Stat label="Area" value={outlet.area || "—"} color="#a78bfa" />
    </div>
    <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
      <Btn color="#065f46" onClick={onCollect} style={{ flex: 1, padding: 10, fontSize: 13 }}>💰 Collect</Btn>
      <Btn color="#0369a1" onClick={onSale} style={{ flex: 1, padding: 10, fontSize: 13 }}>📦 Sale</Btn>
      {outlet.contact && <Btn color="#1a3a2a" onClick={onWhatsapp} style={{ flex: 1, padding: 10, fontSize: 13 }}>💬 WA</Btn>}
      {outlet.mapsUrl && <Btn color="#1a2a3a" onClick={() => window.open(outlet.mapsUrl, "_blank")} style={{ flex: 1, padding: 10, fontSize: 13 }}>📍 Maps</Btn>}
    </div>
    <div style={{ fontWeight: 700, fontSize: 12, color: "#4b5563", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Recent Collections</div>
    {cols.length === 0 && <div style={{ color: "#4b5563", fontSize: 12, marginBottom: 12 }}>None yet.</div>}
    {cols.slice(0, 5).map(c => (
      <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #111120", fontSize: 13 }}>
        <span style={{ color: "#6b7280" }}>{c.date}{c.payMethod && ` · ${c.payMethod}`}</span>
        <span style={{ color: "#22c55e", fontWeight: 600 }}>{fmt(c.amount)}</span>
      </div>
    ))}
  </BottomModal>;
}
function Btn({ color, onClick, children, style = {} }) { return <button onClick={onClick} style={{ background: color, border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", ...style }}>{children}</button>; }
function SmBtn({ color, onClick, children }) { return <button onClick={onClick} style={{ background: color, border: "none", color: "#e2e0f0", borderRadius: 6, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>{children}</button>; }
function Stat({ label, value, color }) { return <div style={{ background: "#080810", borderRadius: 8, padding: "8px 10px" }}><div style={{ fontSize: 10, color: "#4b5563" }}>{label}</div><div style={{ fontSize: 13, fontWeight: 600, color: color || "#e2e0f0", marginTop: 1 }}>{value}</div></div>; }
function FInput({ label, value, onChange, placeholder, type = "text" }) { return <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: .5 }}>{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: "#080810", border: "1px solid #1a1a35", color: "#e2e0f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box", outline: "none" }} /></div>; }
function FSelect({ label, value, onChange, options }) { return <div style={{ marginBottom: 12 }}><label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: .5 }}>{label}</label><select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: "#080810", border: "1px solid #1a1a35", color: "#e2e0f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" }}><option value="">-- Select --</option>{options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></div>; }
function Empty({ icon, text }) { return <div style={{ textAlign: "center", padding: "40px 20px", color: "#4b5563" }}><div style={{ fontSize: 40 }}>{icon}</div><div style={{ marginTop: 8, fontSize: 14 }}>{text}</div></div>; }
const inputSt = { background: "#0d0d1f", border: "1px solid #1a1a35", color: "#e2e0f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
