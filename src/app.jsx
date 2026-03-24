import { useState, useCallback, useMemo } from "react";

const DEFAULT_COMPOUNDS = [
  {
    id: "comp-1", name: "Vancomycin 1g/250mL NS", color: "#e05c3a",
    ingredients: [
      { id: "i1", name: "Vancomycin HCl powder", unit: "g", perUnit: 1.05, category: "api" },
      { id: "i2", name: "0.9% Sodium Chloride (NS)", unit: "mL", perUnit: 255, category: "diluent" },
    ],
    containers: [
      { id: "c1", name: "250mL IV Bag (empty)", unit: "bag", perUnit: 1, category: "container" },
      { id: "c2", name: "10mL Syringe", unit: "syringe", perUnit: 2, category: "container" },
      { id: "c3", name: "20G Transfer Needle", unit: "needle", perUnit: 2, category: "container" },
    ],
  },
  {
    id: "comp-2", name: "Oxytocin 30 units/500mL LR", color: "#2a7fcb",
    ingredients: [
      { id: "i4", name: "Oxytocin 10 units/mL vial", unit: "vial", perUnit: 3, category: "api" },
      { id: "i5", name: "Lactated Ringer's Solution", unit: "mL", perUnit: 500, category: "diluent" },
    ],
    containers: [
      { id: "c4", name: "500mL IV Bag (empty)", unit: "bag", perUnit: 1, category: "container" },
      { id: "c5", name: "5mL Syringe", unit: "syringe", perUnit: 3, category: "container" },
    ],
  },
];

const COMPOUND_COLORS = ["#e05c3a","#2a7fcb","#28a06a","#8b5cf6","#d97706","#0891b2","#be185d","#059669","#0d9488","#7c3aed"];
const CATEGORY_META = {
  api:       { label: "Drug / API",           color: "#e05c3a", bg: "#fff2ef" },
  diluent:   { label: "Diluent / Solvent",    color: "#2a7fcb", bg: "#edf4fd" },
  container: { label: "Container / Hardware", color: "#28a06a", bg: "#edfaf3" },
};
const DAY_NAMES = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function uid() { return Math.random().toString(36).slice(2,9); }
function fmt(n) { return Number.isFinite(n) ? n%1===0 ? n.toString() : n.toFixed(2) : "—"; }
function dateKey(y,m,d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function getDaysInMonth(y,m) { return new Date(y,m+1,0).getDate(); }
function getFirstDow(y,m) { return new Date(y,m,1).getDay(); }

// Derive a unified supply catalog from all compounds — shared items merged by name+unit
function buildSupplyCatalog(compounds) {
  const map = {};
  compounds.forEach(comp => {
    [...comp.ingredients, ...comp.containers].forEach(s => {
      const key = s.name + "__" + s.unit;
      if (!map[key]) map[key] = { name: s.name, unit: s.unit, category: s.category, usedIn: [] };
      if (!map[key].usedIn.includes(comp.name)) map[key].usedIn.push(comp.name);
    });
  });
  return Object.values(map);
}

function Badge({ category }) {
  const meta = CATEGORY_META[category] || CATEGORY_META.api;
  return (
    <span style={{ fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase",
      padding:"2px 7px", borderRadius:3, color:meta.color, background:meta.bg, border:`1px solid ${meta.color}33` }}>
      {meta.label}
    </span>
  );
}

function NumInput({ value, onChange, min=0, style={} }) {
  return (
    <input type="number" min={min} value={value} onChange={e=>onChange(Number(e.target.value))}
      style={{ width:72, padding:"5px 8px", borderRadius:5, border:"1.5px solid #d4d8df",
        fontSize:13, fontFamily:"'JetBrains Mono',monospace", textAlign:"right",
        outline:"none", background:"#f8f9fb", ...style }} />
  );
}

// ── Inline editable text field
function EditableText({ value, onChange, style={}, placeholder="" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) return (
    <input autoFocus value={draft}
      onChange={e=>setDraft(e.target.value)}
      onBlur={()=>{ onChange(draft); setEditing(false); }}
      onKeyDown={e=>{ if(e.key==="Enter"){ onChange(draft); setEditing(false); } if(e.key==="Escape"){ setDraft(value); setEditing(false); }}}
      style={{ fontSize:"inherit", fontWeight:"inherit", color:"inherit", background:"#f8f9fb",
        border:"1.5px solid #2a7fcb", borderRadius:5, padding:"3px 7px", outline:"none", ...style }} />
  );
  return (
    <span onClick={()=>{ setDraft(value); setEditing(true); }}
      title="Click to edit"
      style={{ cursor:"text", borderBottom:"1.5px dashed #c0c8d8", paddingBottom:1, ...style }}>
      {value || <span style={{ color:"#b0b8c8" }}>{placeholder}</span>}
    </span>
  );
}

export default function CompoundingTracker() {
  const today = new Date();
  const [compounds, setCompounds] = useState(DEFAULT_COMPOUNDS);
  const [manualBatches, setManualBatches] = useState({});
  // inventory keyed by "name__unit" — auto-populated with 0 for all known supplies
  const [inventory, setInventory] = useState({});
  const [activeTab, setActiveTab] = useState("schedule");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newComp, setNewComp] = useState({ name:"", ingredients:[], containers:[] });
  const [newSupply, setNewSupply] = useState({ name:"", unit:"", perUnit:1, category:"api" });

  // Edit tab state
  const [editingCompId, setEditingCompId] = useState(null);
  const [editNewSupply, setEditNewSupply] = useState({ name:"", unit:"", perUnit:1, category:"api" });
  // For supply name field: support picking from existing catalog
  const [supplyNameFocus, setSupplyNameFocus] = useState(false);

  const [schedule, setSchedule] = useState({});
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [selectedDay, setSelectedDay] = useState(null);

  // ── Unified supply catalog across all compounds
  const supplyCatalog = useMemo(() => buildSupplyCatalog(compounds), [compounds]);

  // ── Auto-initialize inventory entries for any new supply (onHand defaults to 0)
  const getOnHand = s => {
    const key = s.name+"__"+s.unit;
    return inventory[key] ?? 0;
  };
  const setOnHand = (s, val) => setInventory(inv => ({ ...inv, [s.name+"__"+s.unit]: val }));

  // ── Schedule helpers
  const getDaySched = dk => schedule[dk] || {};
  const setDayEntry = (dk, compId, field, val) =>
    setSchedule(s => ({
      ...s,
      [dk]: { ...getDaySched(dk), [compId]: { ...((s[dk]||{})[compId] || { batches:1, unitsPerBatch:10 }), [field]: val } }
    }));
  const removeDayEntry = (dk, compId) =>
    setSchedule(s => { const d={...(s[dk]||{})}; delete d[compId]; return {...s,[dk]:d}; });
  const addCompToDay = (dk, compId) => {
    if (getDaySched(dk)[compId]) return;
    setSchedule(s => ({ ...s, [dk]: { ...getDaySched(dk), [compId]: { batches:1, unitsPerBatch:10 } } }));
  };

  // ── Month totals
  const monthTotals = useMemo(() => {
    const prefix = `${calYear}-${String(calMonth+1).padStart(2,"0")}`;
    const totals = {};
    Object.entries(schedule).forEach(([dk, dayData]) => {
      if (!dk.startsWith(prefix)) return;
      Object.entries(dayData).forEach(([compId, entry]) => {
        if (!totals[compId]) totals[compId] = { totalUnits:0, runDays:0 };
        totals[compId].totalUnits += (entry.batches||0)*(entry.unitsPerBatch||0);
        totals[compId].runDays += 1;
      });
    });
    return totals;
  }, [schedule, calYear, calMonth]);

  // ── Aggregate supplies from schedule
  const aggregatedSched = useCallback(() => {
    const map = {};
    compounds.forEach(comp => {
      const totalUnits = monthTotals[comp.id]?.totalUnits || 0;
      if (!totalUnits) return;
      [...comp.ingredients, ...comp.containers].forEach(s => {
        const key = s.name+"__"+s.unit;
        if (!map[key]) map[key] = { ...s, needed:0, compoundNames:[] };
        map[key].needed += s.perUnit * totalUnits;
        if (!map[key].compoundNames.includes(comp.name)) map[key].compoundNames.push(comp.name);
      });
    });
    return Object.values(map);
  }, [compounds, monthTotals]);

  const poItems = aggregatedSched().map(s => ({
    ...s, onHand:getOnHand(s), toOrder:Math.max(0, s.needed - getOnHand(s))
  })).filter(s => s.toOrder > 0);

  // ── Compound editing helpers
  const updateCompound = (id, fn) => setCompounds(cs => cs.map(c => c.id===id ? fn(c) : c));

  const addSupplyToComp = (compId) => {
    if (!editNewSupply.name || !editNewSupply.unit) return;
    const list = editNewSupply.category==="container" ? "containers" : "ingredients";
    updateCompound(compId, c => ({ ...c, [list]: [...c[list], { ...editNewSupply, id:uid() }] }));
    setEditNewSupply({ name:"", unit:"", perUnit:1, category:"api" });
  };

  const removeSupplyFromComp = (compId, supplyId) => {
    updateCompound(compId, c => ({
      ...c,
      ingredients: c.ingredients.filter(s=>s.id!==supplyId),
      containers: c.containers.filter(s=>s.id!==supplyId),
    }));
  };

  const updateSupplyInComp = (compId, supplyId, field, val) => {
    updateCompound(compId, c => ({
      ...c,
      ingredients: c.ingredients.map(s=>s.id===supplyId ? {...s,[field]:val} : s),
      containers: c.containers.map(s=>s.id===supplyId ? {...s,[field]:val} : s),
    }));
  };

  // ── Add compound (modal)
  const addIngredientToNew = () => {
    if (!newSupply.name || !newSupply.unit) return;
    const list = newSupply.category==="container" ? "containers" : "ingredients";
    setNewComp(c => ({ ...c, [list]: [...c[list], { ...newSupply, id:uid() }] }));
    setNewSupply({ name:"", unit:"", perUnit:1, category:"api" });
  };
  const saveNewComp = () => {
    if (!newComp.name) return;
    setCompounds(cs => [...cs, { ...newComp, id:uid(), color:COMPOUND_COLORS[cs.length % COMPOUND_COLORS.length] }]);
    setNewComp({ name:"", ingredients:[], containers:[] });
    setShowAddModal(false);
  };

  // ── Calendar
  const daysInMonth = getDaysInMonth(calYear, calMonth);
  const firstDow = getFirstDow(calYear, calMonth);
  const calCells = [...Array(firstDow).fill(null), ...Array.from({length:daysInMonth},(_,i)=>i+1)];
  const todayKey = dateKey(today.getFullYear(), today.getMonth(), today.getDate());

  // ── Style helpers
  const card = { background:"#fff", borderRadius:10, border:"1.5px solid #e4e8ef", marginBottom:14, overflow:"hidden" };
  const tabBtn = active => ({
    padding:"9px 18px", fontSize:13, fontWeight:600, cursor:"pointer",
    border:"none", borderRadius:6, whiteSpace:"nowrap",
    background: active?"#1a2236":"transparent", color:active?"#fff":"#6b7280", transition:"all .15s",
  });
  const th = { padding:"9px 12px", fontSize:11, fontWeight:700, letterSpacing:".07em",
    textTransform:"uppercase", color:"#8892a4", borderBottom:"1.5px solid #e4e8ef", textAlign:"left", background:"#f8f9fb" };
  const td = { padding:"9px 12px", fontSize:13, borderBottom:"1px solid #f0f2f7", verticalAlign:"middle" };
  const inputStyle = { padding:"7px 10px", borderRadius:6, border:"1.5px solid #d4d8df",
    fontSize:13, outline:"none", width:"100%", boxSizing:"border-box", background:"#f8f9fb" };
  const btn = (v="primary") => ({
    padding:"8px 18px", borderRadius:6, border:"none", cursor:"pointer", fontSize:13, fontWeight:600,
    background: v==="primary"?"#1a2236":v==="danger"?"#e05c3a":"#f0f2f7",
    color: v==="ghost"?"#374151":"#fff", transition:"opacity .15s",
  });
  const infoBanner = text => (
    <div style={{ background:"#edf4fd", border:"1px solid #2a7fcb33", borderRadius:8,
      padding:"10px 14px", marginBottom:18, fontSize:13, color:"#1a4a7a" }}>{text}</div>
  );

  // Existing supply name suggestions for autocomplete
  const existingSupplyNames = useMemo(() =>
    [...new Set(supplyCatalog.map(s => s.name))], [supplyCatalog]);

  const editingComp = compounds.find(c=>c.id===editingCompId);

  return (
    <div style={{ minHeight:"100vh", background:"#f0f2f7", fontFamily:"'Inter','Segoe UI',sans-serif" }}>

      {/* ── Header ── */}
      <div style={{ background:"#1a2236", color:"#fff", padding:"0 28px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", alignItems:"center", justifyContent:"space-between", height:60 }}>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div style={{ width:32, height:32, background:"#e05c3a", borderRadius:7, display:"flex", alignItems:"center", justifyContent:"center" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
              </svg>
            </div>
            <div>
              <div style={{ fontWeight:700, fontSize:15 }}>Sterile Compounding Supply Tracker</div>
              <div style={{ fontSize:11, color:"#8fa3c4", letterSpacing:".04em" }}>SCHEDULE · CALCULATOR · INVENTORY · PURCHASE ORDER</div>
            </div>
          </div>
          <div style={{ fontSize:12, color:"#8fa3c4" }}>{compounds.length} compounds · {supplyCatalog.length} unique supplies · {poItems.length} to order</div>
        </div>
      </div>

      {/* ── Tab Bar ── */}
      <div style={{ background:"#fff", borderBottom:"1.5px solid #e4e8ef", padding:"0 28px" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", display:"flex", gap:4, padding:"8px 0", flexWrap:"wrap" }}>
          {[
            ["schedule","📅 Schedule"],
            ["calculator","⚗️ Calculator"],
            ["compounds","✏️ Compounds"],
            ["inventory","📦 Inventory"],
            ["po","🛒 Purchase Order"],
          ].map(([id,label]) => (
            <button key={id} style={tabBtn(activeTab===id)} onClick={()=>setActiveTab(id)}>{label}</button>
          ))}
          <div style={{ flex:1 }} />
          <button style={btn()} onClick={()=>setShowAddModal(true)}>+ Add Compound</button>
        </div>
      </div>

      <div style={{ maxWidth:1100, margin:"0 auto", padding:"24px 28px" }}>

        {/* ════════════════════════ SCHEDULE TAB ════════════════════════ */}
        {activeTab==="schedule" && (
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:12 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <button style={{...btn("ghost"),padding:"6px 14px"}} onClick={()=>{ if(calMonth===0){setCalMonth(11);setCalYear(y=>y-1);}else setCalMonth(m=>m-1); }}>←</button>
                <div style={{ fontWeight:700, fontSize:17, minWidth:170, textAlign:"center" }}>{MONTH_NAMES[calMonth]} {calYear}</div>
                <button style={{...btn("ghost"),padding:"6px 14px"}} onClick={()=>{ if(calMonth===11){setCalMonth(0);setCalYear(y=>y+1);}else setCalMonth(m=>m+1); }}>→</button>
                <button style={{...btn("ghost"),padding:"6px 12px",fontSize:12}} onClick={()=>{setCalYear(today.getFullYear());setCalMonth(today.getMonth());}}>Today</button>
              </div>
              <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
                {compounds.map(c=>(
                  <div key={c.id} style={{ display:"flex", alignItems:"center", gap:5, fontSize:12 }}>
                    <div style={{ width:10, height:10, borderRadius:2, background:c.color||"#888" }} />
                    <span style={{ color:"#374151" }}>{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{...card, marginBottom:20}}>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:"1.5px solid #e4e8ef" }}>
                {DAY_NAMES.map(d=>(
                  <div key={d} style={{ padding:"8px 4px", textAlign:"center", fontSize:11, fontWeight:700,
                    letterSpacing:".06em", textTransform:"uppercase", color:"#8892a4", background:"#f8f9fb" }}>{d}</div>
                ))}
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)" }}>
                {calCells.map((day,idx)=>{
                  if (!day) return <div key={`e${idx}`} style={{ minHeight:88, background:"#fafafa", borderRight:"1px solid #f0f2f7", borderBottom:"1px solid #f0f2f7" }} />;
                  const dk = dateKey(calYear,calMonth,day);
                  const dayData = getDaySched(dk);
                  const compIds = Object.keys(dayData);
                  const isToday = dk===todayKey;
                  const isPast = new Date(calYear,calMonth,day) < new Date(today.getFullYear(),today.getMonth(),today.getDate());
                  return (
                    <div key={dk} onClick={()=>setSelectedDay(dk)}
                      style={{ minHeight:88, padding:"6px 6px 4px", cursor:"pointer",
                        borderRight:"1px solid #f0f2f7", borderBottom:"1px solid #f0f2f7",
                        background:isToday?"#fffbf0":isPast?"#fafafa":"#fff", transition:"background .1s" }}>
                      <div style={{ fontSize:12, fontWeight:isToday?800:500, marginBottom:3,
                        color:isToday?"#e05c3a":isPast?"#b0b8c8":"#374151",
                        display:"flex", alignItems:"center", gap:4 }}>
                        {isToday && <span style={{ width:5,height:5,borderRadius:"50%",background:"#e05c3a",display:"inline-block" }} />}
                        {day}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                        {compIds.map(cid=>{
                          const comp=compounds.find(c=>c.id===cid); if(!comp) return null;
                          const e=dayData[cid], units=(e.batches||0)*(e.unitsPerBatch||0);
                          return (
                            <div key={cid} style={{
                              background:(comp.color||"#888")+"22", borderLeft:`3px solid ${comp.color||"#888"}`,
                              border:`1px solid ${comp.color||"#888"}44`,
                              borderRadius:3, padding:"2px 4px", fontSize:10, fontWeight:600,
                              color:comp.color||"#888", lineHeight:1.4,
                              whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
                            }}>{e.batches}×{e.unitsPerBatch} = {units}u</div>
                          );
                        })}
                        {compIds.length===0 && !isPast && <div style={{ fontSize:10, color:"#d0d8e8", marginTop:2 }}>+ add</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {Object.keys(monthTotals).length > 0 ? (
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#1a2236", marginBottom:10 }}>{MONTH_NAMES[calMonth]} {calYear} — Batch Summary</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(210px,1fr))", gap:10 }}>
                  {compounds.filter(c=>monthTotals[c.id]).map(comp=>{
                    const tot=monthTotals[comp.id];
                    return (
                      <div key={comp.id} style={{...card,marginBottom:0,padding:14,borderLeft:`4px solid ${comp.color}`}}>
                        <div style={{ fontSize:12,fontWeight:700,color:comp.color,marginBottom:8,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{comp.name}</div>
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:4 }}>
                          <div>
                            <div style={{ fontSize:10,color:"#8892a4",fontWeight:600,letterSpacing:".05em" }}>RUN DAYS</div>
                            <div style={{ fontSize:22,fontWeight:800,color:"#1a2236",fontFamily:"'JetBrains Mono',monospace" }}>{tot.runDays}</div>
                          </div>
                          <div>
                            <div style={{ fontSize:10,color:"#8892a4",fontWeight:600,letterSpacing:".05em" }}>TOTAL UNITS</div>
                            <div style={{ fontSize:22,fontWeight:800,color:"#1a2236",fontFamily:"'JetBrains Mono',monospace" }}>{tot.totalUnits}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ textAlign:"center",padding:"32px 0",color:"#8892a4",fontSize:13 }}>Click any day to schedule batch runs.</div>
            )}
          </div>
        )}

        {/* ════════════════════════ CALCULATOR TAB ════════════════════════ */}
        {activeTab==="calculator" && (
          <div>
            <p style={{ color:"#6b7280",fontSize:13,marginBottom:18 }}>Quick manual calculator. Inventory and PO are driven by the Monthly Schedule.</p>
            {compounds.map(comp=>{
              const {batches:nb=1,unitsPerBatch:upb=10}=manualBatches[comp.id]||{};
              const totalUnits=nb*upb;
              return (
                <div key={comp.id} style={{...card,borderLeft:`4px solid ${comp.color||"#888"}`}}>
                  <div style={{ padding:"14px 18px",display:"flex",alignItems:"center",gap:14 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700,fontSize:14 }}>{comp.name}</div>
                      <div style={{ fontSize:12,color:"#8892a4",marginTop:2 }}>{comp.ingredients.length} ingredients · {comp.containers.length} containers</div>
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      {[["Batches","batches",nb],["Units/Batch","unitsPerBatch",upb]].map(([label,field,val],i)=>(
                        <div key={field} style={{ display:"flex",alignItems:"center",gap:8 }}>
                          {i>0&&<div style={{ fontSize:18,color:"#c0c8d8",paddingTop:14 }}>×</div>}
                          <div style={{ textAlign:"center" }}>
                            <div style={{ fontSize:10,color:"#8892a4",fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",marginBottom:2 }}>{label}</div>
                            <NumInput value={val} min={1} onChange={v=>setManualBatches(b=>({...b,[comp.id]:{...(b[comp.id]||{batches:1,unitsPerBatch:10}),[field]:v}}))} />
                          </div>
                        </div>
                      ))}
                      <div style={{ fontSize:18,color:"#c0c8d8",paddingTop:14 }}>=</div>
                      <div style={{ textAlign:"center",minWidth:56 }}>
                        <div style={{ fontSize:10,color:"#8892a4",fontWeight:600,letterSpacing:".05em",textTransform:"uppercase",marginBottom:2 }}>Total</div>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:700,fontSize:18,color:"#1a2236",paddingTop:3 }}>{totalUnits}</div>
                      </div>
                    </div>
                  </div>
                  {/* Supply breakdown */}
                  <div style={{ borderTop:"1px solid #f0f2f7" }}>
                    <table style={{ width:"100%",borderCollapse:"collapse" }}>
                      <thead><tr>
                        <th style={th}>Supply</th><th style={th}>Type</th>
                        <th style={{...th,textAlign:"right"}}>Per Unit</th>
                        <th style={{...th,textAlign:"right"}}>Total Needed</th>
                      </tr></thead>
                      <tbody>
                        {[...comp.ingredients,...comp.containers].map(s=>(
                          <tr key={s.id}>
                            <td style={td}>{s.name}</td>
                            <td style={td}><Badge category={s.category}/></td>
                            <td style={{...td,textAlign:"right",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(s.perUnit)} {s.unit}</td>
                            <td style={{...td,textAlign:"right",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:"#1a2236"}}>{fmt(s.perUnit*totalUnits)} {s.unit}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {compounds.length===0&&<div style={{ textAlign:"center",padding:"48px 0",color:"#8892a4" }}>No compounds yet.</div>}
          </div>
        )}

        {/* ════════════════════════ COMPOUNDS EDIT TAB ════════════════════════ */}
        {activeTab==="compounds" && (
          <div>
            <p style={{ color:"#6b7280",fontSize:13,marginBottom:18 }}>
              Edit compound names, colors, and supply lists. Supplies shared across compounds are automatically merged in Inventory.
            </p>
            {compounds.map(comp=>{
              const isOpen = editingCompId===comp.id;
              const allSupplies = [...comp.ingredients,...comp.containers];
              return (
                <div key={comp.id} style={{...card,borderLeft:`4px solid ${comp.color||"#888"}`}}>
                  {/* Compound header */}
                  <div style={{ padding:"14px 18px",display:"flex",alignItems:"center",gap:12,
                    background:isOpen?"#f8f9fb":"#fff",cursor:"pointer" }}
                    onClick={()=>setEditingCompId(isOpen?null:comp.id)}>
                    {/* Color swatch picker */}
                    <div style={{ position:"relative", flexShrink:0 }}
                      onClick={e=>e.stopPropagation()}>
                      <div style={{ width:22,height:22,borderRadius:5,background:comp.color||"#888",cursor:"pointer",border:"2px solid #fff",boxShadow:"0 0 0 1.5px #c0c8d8" }}
                        title="Click to change color"
                        onClick={()=>updateCompound(comp.id,c=>({...c,color:COMPOUND_COLORS[(COMPOUND_COLORS.indexOf(c.color)+1)%COMPOUND_COLORS.length]}))} />
                    </div>
                    <div style={{ flex:1 }} onClick={e=>e.stopPropagation()}>
                      <EditableText value={comp.name}
                        onChange={v=>updateCompound(comp.id,c=>({...c,name:v}))}
                        style={{ fontWeight:700,fontSize:14 }}
                        placeholder="Compound name" />
                      <div style={{ fontSize:12,color:"#8892a4",marginTop:3 }}>
                        {comp.ingredients.length} ingredient{comp.ingredients.length!==1?"s":""} · {comp.containers.length} container item{comp.containers.length!==1?"s":""}
                      </div>
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      <button style={{...btn("danger"),fontSize:11,padding:"5px 12px"}}
                        onClick={e=>{e.stopPropagation();if(window.confirm(`Remove ${comp.name}?`)){setCompounds(cs=>cs.filter(c=>c.id!==comp.id));setEditingCompId(null);}}}>
                        Remove
                      </button>
                      <div style={{ color:"#c0c8d8",fontSize:14 }}>{isOpen?"▲":"▼"}</div>
                    </div>
                  </div>

                  {/* Expanded edit panel */}
                  {isOpen && (
                    <div style={{ borderTop:"1.5px solid #e4e8ef" }}>
                      {/* Existing supplies table */}
                      {allSupplies.length > 0 && (
                        <table style={{ width:"100%",borderCollapse:"collapse" }}>
                          <thead><tr>
                            <th style={th}>Supply Name</th>
                            <th style={th}>Type</th>
                            <th style={{...th,textAlign:"right"}}>Per Unit</th>
                            <th style={{...th,width:36}}></th>
                          </tr></thead>
                          <tbody>
                            {allSupplies.map(s=>(
                              <tr key={s.id} style={{ background:"#fff" }}>
                                <td style={td}>
                                  <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                                    <EditableText value={s.name} onChange={v=>updateSupplyInComp(comp.id,s.id,"name",v)}
                                      style={{ fontSize:13,fontWeight:500 }} />
                                    <span style={{ fontSize:11,color:"#b0b8c8" }}>({s.unit})</span>
                                  </div>
                                </td>
                                <td style={td}>
                                  <select value={s.category}
                                    onChange={e=>updateSupplyInComp(comp.id,s.id,"category",e.target.value)}
                                    style={{ border:"1.5px solid #d4d8df",borderRadius:5,padding:"4px 6px",fontSize:12,background:"#f8f9fb",cursor:"pointer",outline:"none" }}>
                                    <option value="api">Drug / API</option>
                                    <option value="diluent">Diluent</option>
                                    <option value="container">Container</option>
                                  </select>
                                </td>
                                <td style={{...td,textAlign:"right"}}>
                                  <div style={{ display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4 }}>
                                    <NumInput value={s.perUnit} min={0}
                                      onChange={v=>updateSupplyInComp(comp.id,s.id,"perUnit",v)}
                                      style={{ width:64 }} />
                                    <EditableText value={s.unit} onChange={v=>updateSupplyInComp(comp.id,s.id,"unit",v)}
                                      style={{ fontSize:12,color:"#6b7280",minWidth:30 }} />
                                  </div>
                                </td>
                                <td style={{...td,textAlign:"center",padding:"9px 8px"}}>
                                  <button onClick={()=>removeSupplyFromComp(comp.id,s.id)}
                                    style={{ border:"none",background:"none",color:"#e05c3a",cursor:"pointer",fontSize:16,lineHeight:1,padding:2 }}>×</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}

                      {/* Add new supply row */}
                      <div style={{ padding:14,background:"#f8f9fb",borderTop:"1px solid #f0f2f7" }}>
                        <div style={{ fontSize:11,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",color:"#8892a4",marginBottom:8 }}>Add Supply</div>
                        <div style={{ display:"grid",gridTemplateColumns:"1fr 90px 80px 120px auto",gap:8,alignItems:"end" }}>
                          {/* Supply name with autocomplete */}
                          <div style={{ position:"relative" }}>
                            <input
                              placeholder="Supply name"
                              value={editNewSupply.name}
                              onChange={e=>setEditNewSupply(s=>({...s,name:e.target.value}))}
                              onFocus={()=>setSupplyNameFocus(true)}
                              onBlur={()=>setTimeout(()=>setSupplyNameFocus(false),150)}
                              style={inputStyle}
                            />
                            {supplyNameFocus && editNewSupply.name.length>0 && (
                              <div style={{ position:"absolute",top:"100%",left:0,right:0,zIndex:20,
                                background:"#fff",border:"1.5px solid #d4d8df",borderRadius:6,
                                boxShadow:"0 8px 20px rgba(0,0,0,.12)",maxHeight:160,overflowY:"auto" }}>
                                {existingSupplyNames
                                  .filter(n=>n.toLowerCase().includes(editNewSupply.name.toLowerCase()) && n!==editNewSupply.name)
                                  .map(n=>{
                                    const existing = supplyCatalog.find(s=>s.name===n);
                                    return (
                                      <div key={n}
                                        onMouseDown={()=>{
                                          setEditNewSupply(s=>({...s,name:n,unit:existing?.unit||s.unit,category:existing?.category||s.category}));
                                        }}
                                        style={{ padding:"8px 12px",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",gap:8,
                                          borderBottom:"1px solid #f0f2f7" }}
                                        onMouseEnter={e=>e.currentTarget.style.background="#f8f9fb"}
                                        onMouseLeave={e=>e.currentTarget.style.background="#fff"}>
                                        <Badge category={existing?.category||"api"} />
                                        <span>{n}</span>
                                        <span style={{ fontSize:11,color:"#8892a4",marginLeft:"auto" }}>{existing?.unit}</span>
                                      </div>
                                    );
                                  })}
                              </div>
                            )}
                          </div>
                          <input placeholder="Unit" value={editNewSupply.unit}
                            onChange={e=>setEditNewSupply(s=>({...s,unit:e.target.value}))} style={inputStyle} />
                          <input type="number" placeholder="Per unit" min="0" step="any" value={editNewSupply.perUnit}
                            onChange={e=>setEditNewSupply(s=>({...s,perUnit:Number(e.target.value)}))} style={inputStyle} />
                          <select value={editNewSupply.category}
                            onChange={e=>setEditNewSupply(s=>({...s,category:e.target.value}))}
                            style={{...inputStyle,cursor:"pointer"}}>
                            <option value="api">Drug / API</option>
                            <option value="diluent">Diluent</option>
                            <option value="container">Container</option>
                          </select>
                          <button style={{...btn(),padding:"8px 14px",whiteSpace:"nowrap"}}
                            onClick={()=>addSupplyToComp(comp.id)}>+ Add</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {compounds.length===0&&(
              <div style={{ textAlign:"center",padding:"48px 0",color:"#8892a4" }}>
                No compounds yet — use "+ Add Compound" above.
              </div>
            )}

            {/* Shared supply overview */}
            {supplyCatalog.filter(s=>s.usedIn.length>1).length>0 && (
              <div style={{ marginTop:24 }}>
                <div style={{ fontWeight:700,fontSize:13,color:"#1a2236",marginBottom:10 }}>🔗 Shared Supplies (used in multiple compounds)</div>
                <div style={card}>
                  <table style={{ width:"100%",borderCollapse:"collapse" }}>
                    <thead><tr>
                      <th style={th}>Supply</th><th style={th}>Type</th><th style={th}>Used In</th>
                    </tr></thead>
                    <tbody>
                      {supplyCatalog.filter(s=>s.usedIn.length>1).map(s=>(
                        <tr key={s.name+s.unit}>
                          <td style={td}><span style={{ fontWeight:500 }}>{s.name}</span> <span style={{ fontSize:11,color:"#8892a4" }}>{s.unit}</span></td>
                          <td style={td}><Badge category={s.category}/></td>
                          <td style={td}>
                            <div style={{ display:"flex",gap:6,flexWrap:"wrap" }}>
                              {s.usedIn.map(name=>{
                                const comp=compounds.find(c=>c.name===name);
                                return (
                                  <span key={name} style={{ fontSize:11,padding:"2px 8px",borderRadius:4,
                                    background:(comp?.color||"#888")+"22",color:comp?.color||"#555",fontWeight:600 }}>{name}</span>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════ INVENTORY TAB ════════════════════════ */}
        {activeTab==="inventory" && (
          <div>
            {infoBanner(<>📅 Supply requirements for scheduled batches in <strong>{MONTH_NAMES[calMonth]} {calYear}</strong>. All compounds sharing a supply show a combined total.</>)}
            {["api","diluent","container"].map(cat=>{
              // Show ALL supplies of this category (from catalog), with needed from schedule
              const schedMap = {};
              aggregatedSched().forEach(s=>{ schedMap[s.name+"__"+s.unit]=s; });
              const supplies = supplyCatalog.filter(s=>s.category===cat);
              if (!supplies.length) return null;
              return (
                <div key={cat} style={{ marginBottom:24 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:10 }}>
                    <div style={{ width:3,height:20,background:CATEGORY_META[cat].color,borderRadius:2 }} />
                    <div style={{ fontWeight:700,fontSize:13,color:"#1a2236" }}>{CATEGORY_META[cat].label}</div>
                  </div>
                  <div style={card}>
                    <table style={{ width:"100%",borderCollapse:"collapse" }}>
                      <thead><tr>
                        <th style={th}>Supply</th>
                        <th style={th}>Used In</th>
                        <th style={{...th,textAlign:"right"}}>Needed (scheduled)</th>
                        <th style={{...th,textAlign:"right"}}>On Hand</th>
                        <th style={{...th,textAlign:"right"}}>Status</th>
                      </tr></thead>
                      <tbody>
                        {supplies.map(s=>{
                          const sched = schedMap[s.name+"__"+s.unit];
                          const needed = sched?.needed || 0;
                          const onHand = getOnHand(s);
                          const diff = onHand - needed;
                          return (
                            <tr key={s.name+s.unit}>
                              <td style={td}>
                                <div style={{ fontWeight:500 }}>{s.name}</div>
                                <div style={{ fontSize:11,color:"#8892a4" }}>{s.unit}</div>
                              </td>
                              <td style={td}>
                                <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                                  {s.usedIn.map(name=>{
                                    const comp=compounds.find(c=>c.name===name);
                                    return <span key={name} style={{ fontSize:10,padding:"1px 6px",borderRadius:3,
                                      background:(comp?.color||"#888")+"22",color:comp?.color||"#555",fontWeight:600 }}>{name}</span>;
                                  })}
                                </div>
                              </td>
                              <td style={{...td,textAlign:"right",fontFamily:"'JetBrains Mono',monospace"}}>
                                {needed>0 ? <><strong>{fmt(needed)}</strong> {s.unit}</> : <span style={{ color:"#c0c8d8" }}>—</span>}
                              </td>
                              <td style={{...td,textAlign:"right"}}>
                                <div style={{ display:"flex",alignItems:"center",justifyContent:"flex-end",gap:6 }}>
                                  <NumInput value={onHand} onChange={v=>setOnHand(s,v)}
                                    style={{ background:needed===0?"#f8f9fb":diff>=0?"#edfaf3":"#fff2ef",width:80 }} />
                                  <span style={{ fontSize:11,color:"#8892a4" }}>{s.unit}</span>
                                </div>
                              </td>
                              <td style={{...td,textAlign:"right"}}>
                                {needed===0
                                  ? <span style={{ fontSize:11,color:"#b0b8c8" }}>Not scheduled</span>
                                  : diff>=0
                                    ? <span style={{ color:"#28a06a",fontWeight:700,fontSize:12 }}>✓ +{fmt(diff)}</span>
                                    : <span style={{ color:"#e05c3a",fontWeight:700,fontSize:12 }}>⚠ {fmt(diff)}</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
            {supplyCatalog.length===0&&<div style={{ textAlign:"center",padding:"48px 0",color:"#8892a4" }}>No supplies defined yet.</div>}
          </div>
        )}

        {/* ════════════════════════ PURCHASE ORDER TAB ════════════════════════ */}
        {activeTab==="po" && (
          <div>
            {infoBanner(<>📅 Purchase order for <strong>{MONTH_NAMES[calMonth]} {calYear}</strong> — scheduled needs minus on-hand stock.</>)}
            {poItems.length===0 ? (
              <div style={{...card,padding:"48px 0",textAlign:"center",color:"#28a06a",fontWeight:600}}>
                ✓ All supplies fully stocked for scheduled batches.
              </div>
            ) : (
              <>
                <div style={card}>
                  <table style={{ width:"100%",borderCollapse:"collapse" }}>
                    <thead><tr>
                      <th style={th}>Supply</th><th style={th}>Type</th>
                      <th style={{...th,textAlign:"right"}}>Needed</th>
                      <th style={{...th,textAlign:"right"}}>On Hand</th>
                      <th style={{...th,textAlign:"right",color:"#e05c3a"}}>To Order</th>
                    </tr></thead>
                    <tbody>
                      {["api","diluent","container"].map(cat=>
                        poItems.filter(s=>s.category===cat).map(s=>(
                          <tr key={s.name+s.unit}>
                            <td style={td}>
                              <div style={{ fontWeight:500 }}>{s.name}</div>
                              <div style={{ fontSize:11,color:"#8892a4" }}>{s.compoundNames.join(", ")}</div>
                            </td>
                            <td style={td}><Badge category={s.category}/></td>
                            <td style={{...td,textAlign:"right",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(s.needed)} {s.unit}</td>
                            <td style={{...td,textAlign:"right",fontFamily:"'JetBrains Mono',monospace"}}>{fmt(s.onHand)} {s.unit}</td>
                            <td style={{...td,textAlign:"right",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:"#e05c3a"}}>{fmt(s.toOrder)} {s.unit}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <div style={{ display:"flex",justifyContent:"flex-end",gap:10 }}>
                  <button style={btn("ghost")} onClick={()=>{
                    const lines=poItems.map(s=>`${s.name}\t${fmt(s.toOrder)} ${s.unit}`).join("\n");
                    navigator.clipboard.writeText(`STERILE COMPOUNDING PURCHASE ORDER\n${MONTH_NAMES[calMonth]} ${calYear}\nDate: ${new Date().toLocaleDateString()}\n\nSupply\tQty to Order\n`+lines).catch(()=>{});
                  }}>📋 Copy</button>
                  <button style={btn()} onClick={()=>{
                    const rows=["Supply,Unit,Needed,On Hand,To Order",...poItems.map(s=>`"${s.name}",${s.unit},${fmt(s.needed)},${fmt(s.onHand)},${fmt(s.toOrder)}`)].join("\n");
                    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([rows],{type:"text/csv"}));
                    a.download=`PO_${calYear}-${String(calMonth+1).padStart(2,"0")}.csv`; a.click();
                  }}>⬇ Export CSV</button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ════════════════════════ DAY MODAL ════════════════════════ */}
      {selectedDay && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }}
          onClick={e=>{if(e.target===e.currentTarget)setSelectedDay(null);}}>
          <div style={{ background:"#fff",borderRadius:14,width:520,maxHeight:"85vh",overflow:"auto",padding:28,boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20 }}>
              <div>
                <div style={{ fontWeight:800,fontSize:17 }}>
                  {new Date(selectedDay+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
                </div>
                <div style={{ fontSize:12,color:"#8892a4",marginTop:2 }}>Schedule batch runs for this day</div>
              </div>
              <button onClick={()=>setSelectedDay(null)} style={{ border:"none",background:"none",fontSize:22,color:"#8892a4",cursor:"pointer",lineHeight:1 }}>×</button>
            </div>
            {Object.keys(getDaySched(selectedDay)).length>0 && (
              <div style={{ marginBottom:18 }}>
                {Object.entries(getDaySched(selectedDay)).map(([compId,entry])=>{
                  const comp=compounds.find(c=>c.id===compId); if(!comp) return null;
                  const units=(entry.batches||0)*(entry.unitsPerBatch||0);
                  return (
                    <div key={compId} style={{ border:`1.5px solid ${comp.color}44`,borderLeft:`4px solid ${comp.color}`,borderRadius:8,padding:14,marginBottom:10,background:`${comp.color}08` }}>
                      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10 }}>
                        <div style={{ fontWeight:700,fontSize:13,color:comp.color }}>{comp.name}</div>
                        <button onClick={()=>removeDayEntry(selectedDay,compId)} style={{ border:"none",background:"none",color:"#e05c3a",cursor:"pointer",fontSize:15,lineHeight:1 }}>✕</button>
                      </div>
                      <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                        {[["BATCHES","batches",entry.batches||1],["UNITS/BATCH","unitsPerBatch",entry.unitsPerBatch||10]].map(([label,field,val],i)=>(
                          <div key={field} style={{ display:"flex",alignItems:"center",gap:8 }}>
                            {i>0&&<div style={{ color:"#c0c8d8",fontSize:16,marginTop:14 }}>×</div>}
                            <div>
                              <div style={{ fontSize:10,color:"#8892a4",fontWeight:600,letterSpacing:".05em",marginBottom:3 }}>{label}</div>
                              <NumInput value={val} min={1} onChange={v=>setDayEntry(selectedDay,compId,field,v)} />
                            </div>
                          </div>
                        ))}
                        <div style={{ color:"#c0c8d8",fontSize:16,marginTop:14 }}>=</div>
                        <div style={{ marginTop:14 }}>
                          <span style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:22,color:"#1a2236" }}>{units}</span>
                          <span style={{ fontSize:12,color:"#8892a4",marginLeft:4 }}>units</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {compounds.filter(c=>!getDaySched(selectedDay)[c.id]).length>0 && (
              <div style={{ background:"#f8f9fb",borderRadius:8,padding:14 }}>
                <div style={{ fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:10 }}>ADD COMPOUND TO THIS DAY</div>
                <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                  {compounds.filter(c=>!getDaySched(selectedDay)[c.id]).map(comp=>(
                    <button key={comp.id} onClick={()=>addCompToDay(selectedDay,comp.id)}
                      style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 12px",
                        border:`1.5px solid ${comp.color}44`,borderRadius:7,background:"#fff",cursor:"pointer",textAlign:"left" }}>
                      <div style={{ width:10,height:10,borderRadius:2,background:comp.color,flexShrink:0 }} />
                      <span style={{ fontSize:13,fontWeight:600,color:"#1a2236" }}>{comp.name}</span>
                      <span style={{ fontSize:11,color:"#8892a4",marginLeft:"auto" }}>+ Schedule</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:"flex",justifyContent:"flex-end",marginTop:18 }}>
              <button style={btn()} onClick={()=>setSelectedDay(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════ ADD COMPOUND MODAL ════════════════════════ */}
      {showAddModal && (
        <div style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.45)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100 }}>
          <div style={{ background:"#fff",borderRadius:14,width:560,maxHeight:"85vh",overflow:"auto",padding:28,boxShadow:"0 20px 60px rgba(0,0,0,.25)" }}>
            <div style={{ fontWeight:700,fontSize:17,marginBottom:18 }}>Add New Compound</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12,fontWeight:600,color:"#6b7280",display:"block",marginBottom:5 }}>COMPOUND NAME</label>
              <input placeholder="e.g. Morphine 1mg/mL 100mL Bag" value={newComp.name}
                onChange={e=>setNewComp(c=>({...c,name:e.target.value}))} style={inputStyle} />
            </div>
            {[...newComp.ingredients,...newComp.containers].length>0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:6 }}>SUPPLIES ADDED</div>
                {[...newComp.ingredients,...newComp.containers].map(s=>(
                  <div key={s.id} style={{ display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #f0f2f7" }}>
                    <Badge category={s.category}/>
                    <span style={{ fontSize:13,flex:1 }}>{s.name}</span>
                    <span style={{ fontSize:12,color:"#8892a4",fontFamily:"monospace" }}>{s.perUnit} {s.unit}/unit</span>
                    <button onClick={()=>setNewComp(c=>({...c,
                      ingredients:c.ingredients.filter(i=>i.id!==s.id),
                      containers:c.containers.filter(i=>i.id!==s.id)
                    }))} style={{ border:"none",background:"none",color:"#e05c3a",cursor:"pointer",fontSize:16 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ background:"#f8f9fb",borderRadius:8,padding:14,marginBottom:16 }}>
              <div style={{ fontSize:12,fontWeight:600,color:"#6b7280",marginBottom:10 }}>ADD SUPPLY / INGREDIENT</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 80px 80px 110px",gap:8,marginBottom:8 }}>
                <input placeholder="Supply name" value={newSupply.name}
                  onChange={e=>setNewSupply(s=>({...s,name:e.target.value}))} style={inputStyle} />
                <input placeholder="Unit" value={newSupply.unit}
                  onChange={e=>setNewSupply(s=>({...s,unit:e.target.value}))} style={inputStyle} />
                <input type="number" placeholder="Per unit" min="0" step="any" value={newSupply.perUnit}
                  onChange={e=>setNewSupply(s=>({...s,perUnit:Number(e.target.value)}))} style={inputStyle} />
                <select value={newSupply.category} onChange={e=>setNewSupply(s=>({...s,category:e.target.value}))}
                  style={{...inputStyle,cursor:"pointer"}}>
                  <option value="api">Drug / API</option>
                  <option value="diluent">Diluent</option>
                  <option value="container">Container</option>
                </select>
              </div>
              <button style={btn("ghost")} onClick={addIngredientToNew}>+ Add to List</button>
            </div>
            <div style={{ display:"flex",justifyContent:"flex-end",gap:10 }}>
              <button style={btn("ghost")} onClick={()=>{setShowAddModal(false);setNewComp({name:"",ingredients:[],containers:[]});}}>Cancel</button>
              <button style={btn()} onClick={saveNewComp}>Save Compound</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
