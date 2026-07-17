import { useState, useEffect, useMemo } from "react";

// ── Storage helpers ──────────────────────────────────────────────────────────
const SK = { outlets: "tt_outlets_v2", sales: "tt_sales_v2", collections: "tt_collections_v2", targets: "tt_targets_v2" };
const save = async (k, v) => { try { await window.storage.set(k, JSON.stringify(v)); } catch (e) {} };
const load = async (k) => { try { const r = await window.storage.get(k); return r ? JSON.parse(r.value) : null; } catch { return null; } };
const fmt = (n) => "৳ " + new Intl.NumberFormat("en-US").format(Math.round(n || 0));
const today = () => new Date().toISOString().split("T")[0];
const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : 999;

const getStatus = (outlet, collections) => {
  const cols = collections.filter(c => c.outletId === outlet.id);
  const last = cols.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const days = daysSince(last?.date);
  const due = outlet.totalDue || 0;
  if (due === 0) return "good";
  if (days > 30 || due > 50000) return "danger";
  if (days > 14 || due > 20000) return "warning";
  return "good";
};

const STATUS_META = {
  danger: { color: "#ef4444", bg: "#1f0a0a", border: "#7f1d1d", label: "🚨 High Risk" },
  warning: { color: "#f59e0b", bg: "#1c1200", border: "#78350f", label: "⚠️ Needs Attention" },
  good: { color: "#22c55e", bg: "#0a1f0f", border: "#14532d", label: "✅ Healthy" },
};

// ── Grading logic ────────────────────────────────────────────────────────────
const getGrade = (outlet, collections, sales) => {
  const cols = collections.filter(c => c.outletId === outlet.id);
  const sals = sales.filter(s => s.outletId === outlet.id);
  const totalSales = sals.reduce((s, x) => s + x.amount, 0);
  const totalCollected = cols.reduce((s, c) => s + c.amount, 0);
  const last = cols.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const days = daysSince(last?.date);
  const due = outlet.totalDue || 0;
  const collectionRate = totalSales > 0 ? totalCollected / totalSales : due === 0 ? 1 : 0;

  let score = 0;
  // Collection rate (0-40 pts)
  score += Math.round(collectionRate * 40);
  // Payment recency (0-30 pts)
  if (days <= 7) score += 30;
  else if (days <= 14) score += 22;
  else if (days <= 30) score += 12;
  else if (days <= 60) score += 4;
  // Due amount penalty (0-30 pts)
  if (due === 0) score += 30;
  else if (due < 10000) score += 22;
  else if (due < 25000) score += 14;
  else if (due < 50000) score += 6;

  if (score >= 85) return { grade: "A+", label: "Excellent", color: "#22c55e", bg: "#052e16" };
  if (score >= 70) return { grade: "A",  label: "Very Good", color: "#4ade80", bg: "#052e16" };
  if (score >= 55) return { grade: "B",  label: "Good",      color: "#60a5fa", bg: "#0c1a2e" };
  if (score >= 40) return { grade: "C",  label: "Average",   color: "#f59e0b", bg: "#1c1200" };
  if (score >= 25) return { grade: "D",  label: "Poor",      color: "#f97316", bg: "#1f0a00" };
  return               { grade: "F",  label: "Critical",  color: "#ef4444", bg: "#1f0a0a" };
};

// ── PDF Export ────────────────────────────────────────────────────────────────
const exportPDF = (outlets, collections, sales) => {
  const fmtN = (n) => "৳ " + new Intl.NumberFormat("en-US").format(Math.round(n || 0));
  const rows = outlets.map(o => {
    const cols = collections.filter(c => c.outletId === o.id).sort((a, b) => new Date(b.date) - new Date(a.date));
    const sals = sales.filter(s => s.outletId === o.id);
    const totalSales = sals.reduce((s, x) => s + x.amount, 0);
    const totalCollected = cols.reduce((s, c) => s + c.amount, 0);
    const last = cols[0];
    const g = getGrade(o, collections, sales);
    return { ...o, totalSales, totalCollected, lastPayment: last?.date || "Never", grade: g };
  }).sort((a, b) => {
    const order = ["A+","A","B","C","D","F"];
    return order.indexOf(a.grade.grade) - order.indexOf(b.grade.grade);
  });

  const gradeColors = { "A+": "#16a34a", "A": "#22c55e", "B": "#3b82f6", "C": "#f59e0b", "D": "#f97316", "F": "#ef4444" };
  const summary = {
    totalDue: outlets.reduce((s, o) => s + (o.totalDue || 0), 0),
    totalSales: sales.reduce((s, x) => s + x.amount, 0),
    totalCollected: collections.reduce((s, x) => s + x.amount, 0),
  };

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>TradeTrack Report – ${new Date().toLocaleDateString()}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #fff; color: #111; font-size: 12px; }
    .header { background: linear-gradient(135deg, #1e1b4b, #312e81); color: #fff; padding: 28px 32px; }
    .header h1 { font-size: 26px; font-weight: 800; letter-spacing: 1px; }
    .header p { font-size: 12px; opacity: 0.7; margin-top: 4px; }
    .header .date { font-size: 11px; opacity: 0.6; margin-top: 8px; }
    .summary { display: flex; gap: 16px; padding: 20px 32px; background: #f8f8ff; border-bottom: 2px solid #e5e5f0; }
    .summary-box { flex: 1; background: #fff; border-radius: 8px; padding: 12px 16px; border: 1px solid #e5e5f0; text-align: center; }
    .summary-box .val { font-size: 18px; font-weight: 800; color: #312e81; }
    .summary-box .lbl { font-size: 10px; color: #888; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
    .section-title { padding: 16px 32px 8px; font-size: 13px; font-weight: 700; color: #312e81; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #e5e5f0; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #1e1b4b; color: #fff; padding: 10px 12px; font-size: 11px; text-align: left; font-weight: 600; letter-spacing: 0.5px; }
    td { padding: 9px 12px; border-bottom: 1px solid #f0f0f8; font-size: 11.5px; vertical-align: middle; }
    tr:nth-child(even) td { background: #fafafe; }
    tr:hover td { background: #f0f0ff; }
    .grade-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-weight: 800; font-size: 13px; color: #fff; min-width: 36px; text-align: center; }
    .due-high { color: #dc2626; font-weight: 700; }
    .due-ok { color: #16a34a; font-weight: 600; }
    .footer { padding: 20px 32px; font-size: 10px; color: #aaa; border-top: 1px solid #e5e5f0; margin-top: 12px; display: flex; justify-content: space-between; }
    .grade-legend { display: flex; gap: 12px; padding: 12px 32px; background: #fafafe; font-size: 11px; flex-wrap: wrap; }
    .legend-item { display: flex; align-items: center; gap: 5px; }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style></head><body>
  <div class="header">
    <h1>◈ TradeTrack Pro</h1>
    <p>Glassware & Ceramics — Outlet Performance Report</p>
    <div class="date">Generated: ${new Date().toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" })}</div>
  </div>
  <div class="summary">
    <div class="summary-box"><div class="val">${outlets.length}</div><div class="lbl">Total Outlets</div></div>
    <div class="summary-box"><div class="val" style="color:#1d4ed8">${fmtN(summary.totalSales)}</div><div class="lbl">Total Sales</div></div>
    <div class="summary-box"><div class="val" style="color:#16a34a">${fmtN(summary.totalCollected)}</div><div class="lbl">Collected</div></div>
    <div class="summary-box"><div class="val" style="color:#dc2626">${fmtN(summary.totalDue)}</div><div class="lbl">Outstanding</div></div>
  </div>
  <div class="grade-legend">
    <strong style="margin-right:4px">Grade Key:</strong>
    ${[["A+","#16a34a","Excellent (85-100)"],["A","#22c55e","Very Good (70-84)"],["B","#3b82f6","Good (55-69)"],["C","#f59e0b","Average (40-54)"],["D","#f97316","Poor (25-39)"],["F","#ef4444","Critical (0-24)"]].map(([g,c,l]) => `<div class="legend-item"><div class="legend-dot" style="background:${c}"></div><strong>${g}</strong> – ${l}</div>`).join("")}
  </div>
  <div class="section-title">Outlet Performance — ${rows.length} Outlets (Sorted by Grade)</div>
  <table>
    <thead><tr>
      <th>#</th><th>Outlet Name</th><th>Area</th><th>Contact</th>
      <th>Total Sales</th><th>Collected</th><th>Outstanding Due</th>
      <th>Last Payment</th><th>Grade</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${rows.map((o, i) => `<tr>
        <td style="color:#888">${i + 1}</td>
        <td><strong>${o.name}</strong>${o.notes ? `<br><span style="color:#888;font-size:10px">${o.notes}</span>` : ""}</td>
        <td>${o.area || "—"}</td>
        <td>${o.contact || "—"}</td>
        <td style="color:#1d4ed8;font-weight:600">${fmtN(o.totalSales)}</td>
        <td style="color:#16a34a;font-weight:600">${fmtN(o.totalCollected)}</td>
        <td class="${o.totalDue > 0 ? "due-high" : "due-ok"}">${fmtN(o.totalDue)}</td>
        <td>${o.lastPayment}</td>
        <td><span class="grade-badge" style="background:${gradeColors[o.grade.grade]}">${o.grade.grade}</span></td>
        <td style="color:${o.grade.color};font-weight:600">${o.grade.label}</td>
      </tr>`).join("")}
    </tbody>
  </table>
  <div class="footer">
    <span>TradeTrack Pro — Confidential Business Report</span>
    <span>Total Outlets: ${rows.length} | Generated: ${new Date().toLocaleString()}</span>
  </div>
  </body></html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 600);
};

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [outlets, setOutlets] = useState([]);
  const [sales, setSales] = useState([]);
  const [collections, setCollections] = useState([]);
  const [targets, setTargets] = useState({ daily: 0, monthly: 0 });
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("Dashboard");
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("All");
  const [modal, setModal] = useState(null); // null | 'outlet' | 'editOutlet' | 'sale' | 'collection' | 'target' | 'outletDetail'
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);

  // Load
  useEffect(() => {
    (async () => {
      const [o, s, c, t] = await Promise.all([load(SK.outlets), load(SK.sales), load(SK.collections), load(SK.targets)]);
      if (o) setOutlets(o);
      if (s) setSales(s);
      if (c) setCollections(c);
      if (t) setTargets(t);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) save(SK.outlets, outlets); }, [outlets, loaded]);
  useEffect(() => { if (loaded) save(SK.sales, sales); }, [sales, loaded]);
  useEffect(() => { if (loaded) save(SK.collections, collections); }, [collections, loaded]);
  useEffect(() => { if (loaded) save(SK.targets, targets); }, [targets, loaded]);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 2500);
  };

  // Computed
  const areas = useMemo(() => ["All", ...new Set(outlets.map(o => o.area).filter(Boolean))], [outlets]);
  const filteredOutlets = useMemo(() => {
    let list = outlets;
    if (search) list = list.filter(o => o.name.toLowerCase().includes(search.toLowerCase()) || (o.contact || "").includes(search) || (o.area || "").toLowerCase().includes(search.toLowerCase()));
    if (areaFilter !== "All") list = list.filter(o => o.area === areaFilter);
    return list;
  }, [outlets, search, areaFilter]);

  const todayCollected = useMemo(() => collections.filter(c => c.date === today()).reduce((s, c) => s + c.amount, 0), [collections]);
  const monthCollected = useMemo(() => {
    const m = new Date().toISOString().slice(0, 7);
    return collections.filter(c => c.date?.startsWith(m)).reduce((s, c) => s + c.amount, 0);
  }, [collections]);
  const totalDue = useMemo(() => outlets.reduce((s, o) => s + (o.totalDue || 0), 0), [outlets]);
  const atRisk = useMemo(() => outlets.filter(o => ["danger", "warning"].includes(getStatus(o, collections))).length, [outlets, collections]);

  const topOutlets = useMemo(() => [...outlets].sort((a, b) => {
    const aT = collections.filter(c => c.outletId === a.id).reduce((s, c) => s + c.amount, 0);
    const bT = collections.filter(c => c.outletId === b.id).reduce((s, c) => s + c.amount, 0);
    return bT - aT;
  }).slice(0, 5), [outlets, collections]);

  // Export CSV
  const exportCSV = () => {
    const rows = [["Outlet", "Area", "Contact", "Total Due", "Status"]];
    outlets.forEach(o => {
      const s = getStatus(o, collections);
      rows.push([o.name, o.area || "", o.contact || "", o.totalDue || 0, s]);
    });
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `tradetrack_${today()}.csv`; a.click();
    showToast("Exported successfully!");
  };

  const whatsapp = (outlet) => {
    const msg = encodeURIComponent(`Hello ${outlet.name}, your outstanding due is ${fmt(outlet.totalDue)}. Please arrange payment. Thank you.`);
    window.open(`https://wa.me/${outlet.contact?.replace(/\D/g, "")}?text=${msg}`, "_blank");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#080810", color: "#e2e0f0", fontFamily: "'Sora', sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&family=Cormorant+Garamond:wght@600;700&display=swap" rel="stylesheet" />

      {/* Toast */}
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", background: toast.type === "success" ? "#065f46" : "#7f1d1d", color: "#fff", padding: "10px 20px", borderRadius: 30, fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap", boxShadow: "0 4px 20px #0008" }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ background: "linear-gradient(180deg,#0d0d1f 0%,#080810 100%)", borderBottom: "1px solid #1a1a35", padding: "14px 16px", position: "sticky", top: 0, zIndex: 90 }}>
        <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, color: "#a78bfa", letterSpacing: 1 }}>◈ TradeTrack Pro</div>
            <div style={{ fontSize: 10, color: "#4b5563", letterSpacing: 2, textTransform: "uppercase" }}>Glassware & Ceramics</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn color="#7c3aed" onClick={() => { setEditing(null); setModal("outlet"); }}>+ Outlet</Btn>
            <Btn color="#0369a1" onClick={() => setModal("sale")}>+ Sale</Btn>
            <Btn color="#065f46" onClick={() => setModal("collection")}>+ Collect</Btn>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ background: "#0d0d1f", borderBottom: "1px solid #1a1a35", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
        <div style={{ display: "flex", maxWidth: 860, margin: "0 auto", padding: "0 16px", minWidth: "max-content" }}>
          {["Dashboard", "Outlets", "Sales", "Collections", "Dues & Alerts", "Reports"].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ background: "none", border: "none", color: tab === t ? "#a78bfa" : "#4b5563", borderBottom: tab === t ? "2px solid #7c3aed" : "2px solid transparent", padding: "11px 14px", cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 700 : 400, whiteSpace: "nowrap", transition: "color 0.2s" }}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "16px" }}>

        {/* ── DASHBOARD ── */}
        {tab === "Dashboard" && <Dashboard outlets={outlets} collections={collections} sales={sales} targets={targets} todayCollected={todayCollected} monthCollected={monthCollected} totalDue={totalDue} atRisk={atRisk} topOutlets={topOutlets} fmt={fmt} onSetTarget={() => setModal("target")} onViewOutlet={(o) => { setEditing(o); setModal("outletDetail"); }} />}

        {/* ── OUTLETS ── */}
        {tab === "Outlets" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Search by name, area, phone..." style={inputStyle} />
            </div>
            {areas.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 14, overflowX: "auto", paddingBottom: 4 }}>
                {areas.map(a => (
                  <button key={a} onClick={() => setAreaFilter(a)} style={{ background: areaFilter === a ? "#7c3aed" : "#1a1a2e", border: "none", color: areaFilter === a ? "#fff" : "#6b7280", borderRadius: 20, padding: "5px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>{a}</button>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{filteredOutlets.length} outlets</div>
            {filteredOutlets.length === 0 && <Empty icon="🏪" text="No outlets found. Add your first outlet!" />}
            {filteredOutlets.map(o => <OutletCard key={o.id} outlet={o} collections={collections} fmt={fmt} onEdit={() => { setEditing(o); setModal("outlet"); }} onDelete={() => { setOutlets(p => p.filter(x => x.id !== o.id)); setCollections(p => p.filter(c => c.outletId !== o.id)); setSales(p => p.filter(s => s.outletId !== o.id)); showToast("Outlet deleted"); }} onCollect={() => { setEditing(o); setModal("collection"); }} onSale={() => { setEditing(o); setModal("sale"); }} onWhatsapp={() => whatsapp(o)} onView={() => { setEditing(o); setModal("outletDetail"); }} />)}
          </div>
        )}

        {/* ── SALES ── */}
        {tab === "Sales" && (
          <div>
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{sales.length} sale records</div>
            {sales.length === 0 && <Empty icon="📦" text="No sales recorded yet." />}
            {[...sales].sort((a, b) => new Date(b.date) - new Date(a.date)).map(s => {
              const o = outlets.find(x => x.id === s.outletId);
              return (
                <div key={s.id} style={{ background: "#0d0d1f", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #1a1a35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{o?.name || "?"}</div>
                    <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{s.date} · {s.items || "—"}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "#60a5fa", fontWeight: 700 }}>{fmt(s.amount)}</div>
                    <div style={{ fontSize: 11, color: "#4b5563" }}>credit sale</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── COLLECTIONS ── */}
        {tab === "Collections" && (
          <div>
            <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 10 }}>{collections.length} collection records</div>
            {collections.length === 0 && <Empty icon="💰" text="No collections recorded yet." />}
            {[...collections].sort((a, b) => new Date(b.date) - new Date(a.date)).map(c => {
              const o = outlets.find(x => x.id === c.outletId);
              return (
                <div key={c.id} style={{ background: "#0d0d1f", borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: "1px solid #1a1a35", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{o?.name || "?"}</div>
                    <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{c.date}{c.note ? ` · ${c.note}` : ""}</div>
                  </div>
                  <div style={{ color: "#22c55e", fontWeight: 700 }}>{fmt(c.amount)}</div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── DUES & ALERTS ── */}
        {tab === "Dues & Alerts" && (
          <div>
            {["danger", "warning", "good"].map(level => {
              const list = outlets.filter(o => getStatus(o, collections) === level);
              if (!list.length) return null;
              const m = STATUS_META[level];
              return (
                <div key={level} style={{ marginBottom: 20 }}>
                  <div style={{ fontWeight: 700, color: m.color, marginBottom: 10, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" }}>{m.label} ({list.length})</div>
                  {list.map(o => {
                    const cols = collections.filter(c => c.outletId === o.id).sort((a, b) => new Date(b.date) - new Date(a.date));
                    const last = cols[0];
                    const days = daysSince(last?.date);
                    return (
                      <div key={o.id} style={{ background: m.bg, borderRadius: 10, padding: "12px 14px", marginBottom: 8, border: `1px solid ${m.border}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{o.name}</div>
                            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 3 }}>
                              {o.area && `📍 ${o.area} · `}
                              {last ? `Last payment ${days}d ago` : "Never paid"}
                            </div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontWeight: 700, color: m.color, fontSize: 15 }}>{fmt(o.totalDue)}</div>
                            <div style={{ fontSize: 10, color: "#6b7280" }}>outstanding</div>
                          </div>
                        </div>
                        {o.contact && (
                          <button onClick={() => whatsapp(o)} style={{ marginTop: 8, background: "#1a3a2a", border: "1px solid #14532d", color: "#4ade80", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
                            💬 WhatsApp Reminder
                          </button>
                        )}
                        {o.mapsUrl && (
                          <button onClick={() => window.open(o.mapsUrl, "_blank")} style={{ marginTop: 8, marginLeft: o.contact ? 6 : 0, background: "#0f2030", border: "1px solid #1e3a5f", color: "#60a5fa", borderRadius: 6, padding: "5px 12px", fontSize: 11, cursor: "pointer" }}>
                            📍 Open in Maps
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {outlets.length === 0 && <Empty icon="📋" text="Add outlets to see due tracking." />}
          </div>
        )}

        {/* ── REPORTS ── */}
        {tab === "Reports" && <Reports outlets={outlets} sales={sales} collections={collections} fmt={fmt} onExport={exportCSV} onExportPDF={() => exportPDF(outlets, collections, sales)} today={today} />}

      </div>

      {/* ── MODALS ── */}
      {modal === "outlet" && <OutletModal outlet={editing} onClose={() => { setModal(null); setEditing(null); }} onSave={(data) => {
        if (editing) {
          setOutlets(p => p.map(o => o.id === editing.id ? { ...o, ...data } : o));
          showToast("Outlet updated!");
        } else {
          setOutlets(p => [...p, { id: Date.now().toString(), createdAt: new Date().toISOString(), totalDue: 0, ...data }]);
          showToast("Outlet added!");
        }
        setModal(null); setEditing(null);
      }} />}

      {modal === "sale" && <SaleModal outlets={outlets} preSelected={editing?.id} onClose={() => { setModal(null); setEditing(null); }} onSave={(data) => {
        setSales(p => [...p, { id: Date.now().toString(), ...data }]);
        setOutlets(p => p.map(o => o.id === data.outletId ? { ...o, totalDue: (o.totalDue || 0) + data.amount } : o));
        showToast("Sale recorded!");
        setModal(null); setEditing(null);
      }} />}

      {modal === "collection" && <CollectionModal outlets={outlets} preSelected={editing?.id} onClose={() => { setModal(null); setEditing(null); }} onSave={(data) => {
        setCollections(p => [...p, { id: Date.now().toString(), ...data }]);
        setOutlets(p => p.map(o => o.id === data.outletId ? { ...o, totalDue: Math.max(0, (o.totalDue || 0) - data.amount) } : o));
        showToast("Collection recorded!");
        setModal(null); setEditing(null);
      }} />}

      {modal === "target" && <TargetModal targets={targets} onClose={() => setModal(null)} onSave={(t) => { setTargets(t); showToast("Targets updated!"); setModal(null); }} />}

      {modal === "outletDetail" && editing && <OutletDetailModal outlet={editing} collections={collections} sales={sales} fmt={fmt} onClose={() => { setModal(null); setEditing(null); }} onCollect={() => setModal("collection")} onSale={() => setModal("sale")} onWhatsapp={() => whatsapp(editing)} />}
    </div>
  );
}

// ── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ outlets, collections, sales, targets, todayCollected, monthCollected, totalDue, atRisk, topOutlets, fmt, onSetTarget, onViewOutlet }) {
  const dailyPct = targets.daily > 0 ? Math.min(100, (todayCollected / targets.daily) * 100) : 0;
  const monthlyPct = targets.monthly > 0 ? Math.min(100, (monthCollected / targets.monthly) * 100) : 0;

  return (
    <div>
      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10, marginBottom: 16 }}>
        {[
          { label: "Total Outlets", value: outlets.length, icon: "🏪", color: "#7c3aed" },
          { label: "At Risk", value: atRisk, icon: "⚠️", color: atRisk > 0 ? "#ef4444" : "#22c55e" },
          { label: "Today Collected", value: fmt(todayCollected), icon: "💰", color: "#22c55e" },
          { label: "Total Dues", value: fmt(totalDue), icon: "📋", color: totalDue > 0 ? "#ef4444" : "#22c55e" },
        ].map(s => (
          <div key={s.label} style={{ background: "#0d0d1f", border: `1px solid ${s.color}22`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 20 }}>{s.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, marginTop: 6, letterSpacing: -0.5 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#4b5563", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Targets */}
      <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa" }}>🎯 Collection Targets</span>
          <button onClick={onSetTarget} style={{ background: "none", border: "1px solid #2a2a4a", color: "#6b7280", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer" }}>Set</button>
        </div>
        <ProgressBar label="Today" current={todayCollected} target={targets.daily} pct={dailyPct} fmt={fmt} color="#22c55e" />
        <ProgressBar label="This Month" current={monthCollected} target={targets.monthly} pct={monthlyPct} fmt={fmt} color="#60a5fa" />
      </div>

      {/* Top outlets */}
      <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>🏆 Top Outlets by Collection</div>
        {topOutlets.length === 0 && <div style={{ color: "#4b5563", fontSize: 13 }}>No data yet.</div>}
        {topOutlets.map((o, i) => {
          const total = collections.filter(c => c.outletId === o.id).reduce((s, c) => s + c.amount, 0);
          return (
            <div key={o.id} onClick={() => onViewOutlet(o)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #111120", cursor: "pointer" }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: i === 0 ? "#f59e0b" : i === 1 ? "#9ca3af" : i === 2 ? "#b45309" : "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: i < 3 ? "#000" : "#6b7280", flexShrink: 0 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</div>
                <div style={{ fontSize: 11, color: "#4b5563" }}>{o.area || "—"}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, color: "#22c55e", fontWeight: 600 }}>{fmt(total)}</div>
                {o.totalDue > 0 && <div style={{ fontSize: 10, color: "#ef4444" }}>{fmt(o.totalDue)} due</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, target, pct, fmt, color }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: "#6b7280" }}>{label}</span>
        <span style={{ color: "#e2e0f0" }}>{fmt(current)} {target > 0 ? `/ ${fmt(target)}` : "(no target)"}</span>
      </div>
      <div style={{ height: 6, background: "#1a1a2e", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.5s ease" }} />
      </div>
      {target > 0 && <div style={{ fontSize: 10, color: pct >= 100 ? "#22c55e" : "#6b7280", marginTop: 2, textAlign: "right" }}>{Math.round(pct)}% of target</div>}
    </div>
  );
}

// ── Outlet Card ───────────────────────────────────────────────────────────────
function OutletCard({ outlet, collections, fmt, onEdit, onDelete, onCollect, onSale, onWhatsapp, onView }) {
  const status = getStatus(outlet, collections);
  const m = STATUS_META[status];
  const cols = collections.filter(c => c.outletId === outlet.id);
  const totalCollected = cols.reduce((s, c) => s + c.amount, 0);
  const last = cols.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  const [open, setOpen] = useState(false);

  return (
    <div style={{ background: "#0d0d1f", borderRadius: 12, marginBottom: 10, border: `1px solid ${m.color}33`, overflow: "hidden" }}>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{outlet.name}</div>
          <div style={{ fontSize: 11, color: "#4b5563" }}>{outlet.area || "—"} {outlet.contact && `· ${outlet.contact}`}</div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontWeight: 700, color: outlet.totalDue > 0 ? "#ef4444" : "#22c55e", fontSize: 14 }}>{fmt(outlet.totalDue)}</div>
          <div style={{ fontSize: 10, color: "#4b5563" }}>due</div>
        </div>
        <div style={{ color: "#4b5563", fontSize: 12 }}>{open ? "▲" : "▼"}</div>
      </div>
      {open && (
        <div style={{ padding: "0 14px 14px", borderTop: "1px solid #111120" }}>
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
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#080810", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ fontSize: 10, color: "#4b5563" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: color || "#e2e0f0", marginTop: 1 }}>{value}</div>
    </div>
  );
}

// ── Reports ──────────────────────────────────────────────────────────────────
function Reports({ outlets, sales, collections, fmt, onExport, onExportPDF, today }) {
  const months = useMemo(() => {
    const map = {};
    collections.forEach(c => {
      const m = c.date?.slice(0, 7);
      if (m) map[m] = (map[m] || 0) + c.amount;
    });
    return Object.entries(map).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
  }, [collections]);

  const totalSales = sales.reduce((s, x) => s + x.amount, 0);
  const totalCollected = collections.reduce((s, x) => s + x.amount, 0);
  const totalDue = outlets.reduce((s, o) => s + (o.totalDue || 0), 0);

  const graded = useMemo(() => outlets.map(o => ({ ...o, g: getGrade(o, collections, sales) }))
    .sort((a, b) => { const order = ["A+","A","B","C","D","F"]; return order.indexOf(a.g.grade) - order.indexOf(b.g.grade); }), [outlets, collections, sales]);

  const gradeCounts = useMemo(() => {
    const c = { "A+": 0, "A": 0, "B": 0, "C": 0, "D": 0, "F": 0 };
    graded.forEach(o => c[o.g.grade]++);
    return c;
  }, [graded]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={onExportPDF} style={{ background: "#7c3aed", border: "none", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>📄 Download PDF Report</button>
        <button onClick={onExport} style={{ background: "#065f46", border: "none", color: "#fff", borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>⬇ Export CSV</button>
      </div>

      {/* Grade breakdown */}
      <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>🏅 Outlet Grades Overview</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginBottom: 14 }}>
          {[["A+","#16a34a"],["A","#22c55e"],["B","#3b82f6"],["C","#f59e0b"],["D","#f97316"],["F","#ef4444"]].map(([g, c]) => (
            <div key={g} style={{ background: "#080810", borderRadius: 8, padding: "8px 10px", textAlign: "center", border: `1px solid ${c}33` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: c }}>{g}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e0f0", marginTop: 2 }}>{gradeCounts[g]}</div>
              <div style={{ fontSize: 10, color: "#4b5563" }}>outlets</div>
            </div>
          ))}
        </div>
        <div style={{ fontWeight: 600, fontSize: 12, color: "#4b5563", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>All Outlets — Grade Preview</div>
        {graded.slice(0, 8).map(o => (
          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: "1px solid #111120" }}>
            <div>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{o.name}</span>
              {o.area && <span style={{ fontSize: 11, color: "#4b5563", marginLeft: 6 }}>{o.area}</span>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: o.g.color }}>{o.g.label}</span>
              <span style={{ background: o.g.color, color: "#fff", borderRadius: 20, padding: "2px 9px", fontSize: 12, fontWeight: 800 }}>{o.g.grade}</span>
            </div>
          </div>
        ))}
        {graded.length > 8 && <div style={{ fontSize: 11, color: "#4b5563", marginTop: 8, textAlign: "center" }}>+{graded.length - 8} more in PDF report</div>}
      </div>

      <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, marginBottom: 14, border: "1px solid #1a1a35" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>📊 Business Summary</div>
        {[
          { label: "Total Credit Sales", value: fmt(totalSales), color: "#60a5fa" },
          { label: "Total Collected", value: fmt(totalCollected), color: "#22c55e" },
          { label: "Outstanding Dues", value: fmt(totalDue), color: "#ef4444" },
          { label: "Total Outlets", value: outlets.length, color: "#a78bfa" },
        ].map(r => (
          <div key={r.label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111120", fontSize: 13 }}>
            <span style={{ color: "#6b7280" }}>{r.label}</span>
            <span style={{ fontWeight: 700, color: r.color }}>{r.value}</span>
          </div>
        ))}
      </div>

      <div style={{ background: "#0d0d1f", borderRadius: 12, padding: 14, border: "1px solid #1a1a35" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: "#a78bfa", marginBottom: 12 }}>📅 Monthly Collections</div>
        {months.length === 0 && <div style={{ color: "#4b5563", fontSize: 13 }}>No data yet.</div>}
        {months.map(([m, amt]) => (
          <div key={m} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111120", fontSize: 13 }}>
            <span style={{ color: "#6b7280" }}>{m}</span>
            <span style={{ fontWeight: 700, color: "#22c55e" }}>{fmt(amt)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Modals ───────────────────────────────────────────────────────────────────
function BottomModal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000090", zIndex: 200, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0d0d1f", borderRadius: "18px 18px 0 0", width: "100%", maxWidth: 500, padding: "20px 16px", maxHeight: "92vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{title}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#4b5563", fontSize: 22, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function OutletModal({ outlet, onClose, onSave }) {
  const [f, setF] = useState({ name: outlet?.name || "", area: outlet?.area || "", contact: outlet?.contact || "", notes: outlet?.notes || "", mapsUrl: outlet?.mapsUrl || "" });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <BottomModal title={outlet ? "Edit Outlet" : "Add New Outlet"} onClose={onClose}>
      <FInput label="Outlet Name *" value={f.name} onChange={set("name")} placeholder="e.g. Rahman Traders" />
      <FInput label="Area / Zone" value={f.area} onChange={set("area")} placeholder="e.g. Mirpur, Dhaka" />
      <FInput label="Contact Number" value={f.contact} onChange={set("contact")} placeholder="e.g. 01711..." />
      <FInput label="Google Maps Link" value={f.mapsUrl} onChange={set("mapsUrl")} placeholder="Paste Google Maps URL here" />
      <div style={{ fontSize: 11, color: "#4b5563", marginTop: -8, marginBottom: 12 }}>Open Google Maps → share → copy link → paste above</div>
      <FInput label="Notes" value={f.notes} onChange={set("notes")} placeholder="Any extra info" />
      <Btn color="#7c3aed" onClick={() => f.name.trim() && onSave(f)} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>{outlet ? "Save Changes" : "Add Outlet"}</Btn>
    </BottomModal>
  );
}

function SaleModal({ outlets, preSelected, onClose, onSave }) {
  const [f, setF] = useState({ outletId: preSelected || "", amount: "", date: today(), items: "" });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <BottomModal title="Record New Sale" onClose={onClose}>
      <FSelect label="Outlet *" value={f.outletId} onChange={set("outletId")} options={outlets.map(o => ({ v: o.id, l: o.name }))} />
      <FInput label="Amount (৳) *" value={f.amount} onChange={set("amount")} placeholder="0" type="number" />
      <FInput label="Items / Description" value={f.items} onChange={set("items")} placeholder="e.g. 50 glass sets, 20 ceramic plates" />
      <FInput label="Date" value={f.date} onChange={set("date")} type="date" />
      <Btn color="#0369a1" onClick={() => f.outletId && f.amount && onSave({ ...f, amount: parseFloat(f.amount) })} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>Save Sale</Btn>
    </BottomModal>
  );
}

function CollectionModal({ outlets, preSelected, onClose, onSave }) {
  const [f, setF] = useState({ outletId: preSelected || "", amount: "", date: today(), note: "" });
  const set = k => v => setF(p => ({ ...p, [k]: v }));
  return (
    <BottomModal title="Record Collection" onClose={onClose}>
      <FSelect label="Outlet *" value={f.outletId} onChange={set("outletId")} options={outlets.map(o => ({ v: o.id, l: `${o.name}${o.totalDue > 0 ? ` (Due: ৳${Math.round(o.totalDue)})` : ""}` }))} />
      <FInput label="Amount Collected (৳) *" value={f.amount} onChange={set("amount")} placeholder="0" type="number" />
      <FInput label="Date" value={f.date} onChange={set("date")} type="date" />
      <FInput label="Note (optional)" value={f.note} onChange={set("note")} placeholder="e.g. Partial payment" />
      <Btn color="#065f46" onClick={() => f.outletId && f.amount && onSave({ ...f, amount: parseFloat(f.amount) })} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>Save Collection</Btn>
    </BottomModal>
  );
}

function TargetModal({ targets, onClose, onSave }) {
  const [f, setF] = useState({ daily: targets.daily || "", monthly: targets.monthly || "" });
  return (
    <BottomModal title="Set Collection Targets" onClose={onClose}>
      <FInput label="Daily Target (৳)" value={f.daily} onChange={v => setF(p => ({ ...p, daily: v }))} placeholder="e.g. 50000" type="number" />
      <FInput label="Monthly Target (৳)" value={f.monthly} onChange={v => setF(p => ({ ...p, monthly: v }))} placeholder="e.g. 1000000" type="number" />
      <Btn color="#7c3aed" onClick={() => onSave({ daily: parseFloat(f.daily) || 0, monthly: parseFloat(f.monthly) || 0 })} style={{ width: "100%", padding: 12, fontSize: 14, marginTop: 4 }}>Save Targets</Btn>
    </BottomModal>
  );
}

function OutletDetailModal({ outlet, collections, sales, fmt, onClose, onCollect, onSale, onWhatsapp }) {
  const cols = collections.filter(c => c.outletId === outlet.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const sals = sales.filter(s => s.outletId === outlet.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const totalCollected = cols.reduce((s, c) => s + c.amount, 0);
  const totalSales = sals.reduce((s, x) => s + x.amount, 0);
  return (
    <BottomModal title={outlet.name} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8, marginBottom: 14 }}>
        <Stat label="Total Sales" value={fmt(totalSales)} color="#60a5fa" />
        <Stat label="Collected" value={fmt(totalCollected)} color="#22c55e" />
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
          <span style={{ color: "#6b7280" }}>{c.date}</span>
          <span style={{ color: "#22c55e", fontWeight: 600 }}>{fmt(c.amount)}</span>
        </div>
      ))}
    </BottomModal>
  );
}

// ── Small Components ──────────────────────────────────────────────────────────
function Btn({ color, onClick, children, style = {} }) {
  return <button onClick={onClick} style={{ background: color, border: "none", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer", ...style }}>{children}</button>;
}
function SmBtn({ color, onClick, children }) {
  return <button onClick={onClick} style={{ background: color, border: "none", color: "#e2e0f0", borderRadius: 6, padding: "5px 11px", fontSize: 12, cursor: "pointer" }}>{children}</button>;
}
function FInput({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", background: "#080810", border: "1px solid #1a1a35", color: "#e2e0f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box", outline: "none" }} />
    </div>
  );
}
function FSelect({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11, color: "#6b7280", display: "block", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} style={{ width: "100%", background: "#080810", border: "1px solid #1a1a35", color: "#e2e0f0", borderRadius: 8, padding: "10px 12px", fontSize: 14, boxSizing: "border-box" }}>
        <option value="">-- Select --</option>
        {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </div>
  );
}
function Empty({ icon, text }) {
  return <div style={{ textAlign: "center", padding: "40px 20px", color: "#4b5563" }}><div style={{ fontSize: 40 }}>{icon}</div><div style={{ marginTop: 8, fontSize: 14 }}>{text}</div></div>;
}
const inputStyle = { flex: 1, background: "#0d0d1f", border: "1px solid #1a1a35", color: "#e2e0f0", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", boxSizing: "border-box" };
