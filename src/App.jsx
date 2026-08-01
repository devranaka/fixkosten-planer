import { useState, useMemo } from "react";

const MONTHS = ["Jan","Feb","Mär","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
const MONTH_FULL = ["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"];

const FREQ_OPTIONS = [
  { value: "monthly",    label: "Monatlich" },
  { value: "quarterly",  label: "Quartalsweise" },
  { value: "halfyearly", label: "Halbjährlich" },
  { value: "yearly",     label: "Jährlich" },
];

const CATEGORIES = [
  { key: "Versicherung", emoji: "🛡️", color: "#7c3aed", bg: "#ede9fe" },
  { key: "Steuer",       emoji: "🏛️", color: "#b45309", bg: "#fef3c7" },
  { key: "Kfz",         emoji: "🚗", color: "#0369a1", bg: "#e0f2fe" },
  { key: "Wohnen",      emoji: "🏠", color: "#047857", bg: "#d1fae5" },
  { key: "Sonstiges",   emoji: "✏️", color: "#be185d", bg: "#fce7f3" },
];

function getCat(key) {
  return CATEGORIES.find(c => c.key === key) || CATEGORIES[4];
}

const DEFAULT_COSTS = [
  { id: 1, name: "Kfz-Versicherung", amount: 480, frequency: "yearly", months: [6], category: "Versicherung", customLabel: "" },
  { id: 2, name: "Kfz-Steuer", amount: 180, frequency: "yearly", months: [6], category: "Steuer", customLabel: "" },
  { id: 3, name: "GEZ Rundfunkbeitrag", amount: 55.08, frequency: "quarterly", months: [], category: "Sonstiges", customLabel: "GEZ" },
];

function getOccurrences(cost) {
  if (cost.frequency === "monthly")    return Array.from({length:12},(_,i)=>i);
  if (cost.frequency === "quarterly")  return [0,3,6,9];
  if (cost.frequency === "halfyearly") return [0,6];
  if (cost.frequency === "yearly")     return cost.months?.length ? cost.months : [0];
  return [];
}

function pad(n) { return String(n).padStart(2,"0"); }
function toICSDate(year, month, day) { return `${year}${pad(month+1)}${pad(day)}`; }

function generateICS(costs, year) {
  const lines = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Fixkosten-Planer//DE","CALSCALE:GREGORIAN","METHOD:PUBLISH"];
  costs.forEach(cost => {
    const occ = getOccurrences(cost);
    const displayName = cost.category === "Sonstiges" && cost.customLabel ? cost.customLabel : cost.name;
    const cat = getCat(cost.category);
    occ.forEach(monthIdx => {
      const dateStr = toICSDate(year, monthIdx, 1);
      const uid = `fixkosten-${cost.id}-${monthIdx}-${year}@planer`;
      const amount = cost.amount % 1 === 0 ? cost.amount : cost.amount.toFixed(2);
      lines.push("BEGIN:VEVENT",`UID:${uid}`,`DTSTART;VALUE=DATE:${dateStr}`,`DTEND;VALUE=DATE:${dateStr}`,
        `SUMMARY:${cat.emoji} ${displayName} – €${amount} fällig`,
        `DESCRIPTION:Fixkosten: ${displayName}\\nBetrag: €${amount}`,
        "BEGIN:VALARM","TRIGGER:-P14D","ACTION:DISPLAY",`DESCRIPTION:In 14 Tagen fällig: ${displayName} €${amount}`,"END:VALARM",
        "BEGIN:VALARM","TRIGGER:-P3D","ACTION:DISPLAY",`DESCRIPTION:In 3 Tagen fällig: ${displayName} €${amount}`,"END:VALARM",
        "END:VEVENT");
    });
  });
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

function downloadICS(costs, year) {
  const blob = new Blob([generateICS(costs, year)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `fixkosten-${year}.ics`; a.click();
  URL.revokeObjectURL(url);
}

const INPUT = { width:"100%", background:"#fff", border:"1.5px solid #e5e7eb", borderRadius:10, padding:"11px 14px", color:"#111827", fontSize:14, outline:"none", boxSizing:"border-box", fontFamily:"inherit" };

export default function App() {
  const today = new Date();
  const currentMonth = today.getMonth();
  const currentYear  = today.getFullYear();
  const [costs, setCosts] = useState(DEFAULT_COSTS);
  const [view, setView] = useState("overview");
  const [form, setForm] = useState({ name:"", amount:"", frequency:"yearly", months:[0], category:"Versicherung", customLabel:"" });
  const [editId, setEditId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [exported, setExported] = useState(false);

  const monthlyBreakdown = useMemo(() => {
    const bd = Array.from({length:12}, ()=>[]);
    costs.forEach(cost => getOccurrences(cost).forEach(m => bd[m].push({...cost})));
    return bd;
  }, [costs]);

  const monthlyTotals = monthlyBreakdown.map(items => items.reduce((s,c)=>s+c.amount,0));
  const totalAnnual = useMemo(() => costs.reduce((sum,c) => {
    if (c.frequency==="monthly") return sum+c.amount*12;
    if (c.frequency==="quarterly") return sum+c.amount*4;
    if (c.frequency==="halfyearly") return sum+c.amount*2;
    return sum+c.amount;
  }, 0), [costs]);
  const monthlyBuffer = totalAnnual / 12;

  const upcoming = useMemo(() => {
    const result = [];
    for (let i=0; i<=2; i++) {
      const m = (currentMonth+i)%12;
      monthlyBreakdown[m].forEach(cost => result.push({...cost, month:m, monthsAway:i}));
    }
    return result.sort((a,b)=>a.monthsAway-b.monthsAway);
  }, [monthlyBreakdown, currentMonth]);

  function toggleMonth(m) { setForm(f=>({...f, months: f.months.includes(m)?f.months.filter(x=>x!==m):[...f.months,m]})); }

  function handleSave() {
    if (!form.name || !form.amount) return;
    const entry = { id:editId||Date.now(), name:form.name, amount:parseFloat(form.amount), frequency:form.frequency, months:(form.frequency==="yearly"||form.frequency==="halfyearly")?form.months:[], category:form.category, customLabel:form.category==="Sonstiges"?form.customLabel:"" };
    if (editId) { setCosts(c=>c.map(x=>x.id===editId?entry:x)); setEditId(null); }
    else { setCosts(c=>[...c,entry]); }
    setForm({name:"",amount:"",frequency:"yearly",months:[0],category:"Versicherung",customLabel:""});
    setView("overview");
  }

  function handleEdit(cost) { setForm({name:cost.name,amount:String(cost.amount),frequency:cost.frequency,months:cost.months||[],category:cost.category,customLabel:cost.customLabel||""}); setEditId(cost.id); setView("add"); }
  function handleDelete(id) { setCosts(c=>c.filter(x=>x.id!==id)); }
  function handleExport() { downloadICS(costs, currentYear); setExported(true); setTimeout(()=>setExported(false),3000); }

  const maxMonthly = Math.max(...monthlyTotals, 1);
  const freqLabel = f => FREQ_OPTIONS.find(x=>x.value===f)?.label||f;
  const fmt = n => n%1===0?n:n.toFixed(2);

  return (
    <div style={{minHeight:"100vh",background:"#f3f4f6",color:"#111827",fontFamily:"'Inter','Segoe UI',sans-serif"}}>
      <div style={{background:"#fff",borderBottom:"1.5px solid #e5e7eb",padding:"0 16px"}}>
        <div style={{maxWidth:480,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"18px 0 14px"}}>
            <div>
              <div style={{fontSize:11,letterSpacing:3,color:"#9ca3af",textTransform:"uppercase",marginBottom:2}}>Dein</div>
              <div style={{fontSize:22,fontWeight:800,color:"#111827",letterSpacing:"-0.5px"}}>Fixkosten-Planer</div>
            </div>
            <div style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",borderRadius:14,padding:"10px 16px",textAlign:"center",boxShadow:"0 4px 14px rgba(124,58,237,0.35)"}}>
              <div style={{fontSize:10,color:"rgba(255,255,255,0.75)",marginBottom:1,letterSpacing:1}}>PUFFER/MONAT</div>
              <div style={{fontSize:20,fontWeight:800,color:"#fff"}}>€{monthlyBuffer.toFixed(0)}</div>
            </div>
          </div>
          <div style={{display:"flex"}}>
            {[["overview","Übersicht"],["calendar","Kalender"],["add","+ Neu"]].map(([v,l])=>(
              <button key={v} onClick={()=>{setView(v);if(v!=="add")setEditId(null);}} style={{flex:1,padding:"10px 0",background:"none",border:"none",cursor:"pointer",color:view===v?"#7c3aed":"#6b7280",borderBottom:view===v?"2.5px solid #7c3aed":"2.5px solid transparent",fontWeight:view===v?700:500,fontSize:13}}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{maxWidth:480,margin:"0 auto",padding:"20px 14px 60px"}}>
        {view==="overview" && (
          <div>
            {upcoming.length>0 && (
              <div style={{marginBottom:20}}>
                <div style={{fontSize:11,fontWeight:700,color:"#9ca3af",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Bald fällig</div>
                {upcoming.map((c,i)=>{
                  const u=c.monthsAway===0?{bg:"#fef2f2",border:"#fecaca",badge:"#ef4444",text:"Diesen Monat",icon:"🚨"}:c.monthsAway===1?{bg:"#fffbeb",border:"#fde68a",badge:"#f59e0b",text:"Nächsten Monat",icon:"⚠️"}:{bg:"#f0fdf4",border:"#bbf7d0",badge:"#22c55e",text:"In 2 Monaten",icon:"📅"};
                  const cat=getCat(c.category);
                  const name=c.category==="Sonstiges"&&c.customLabel?c.customLabel:c.name;
                  return (<div key={i} style={{background:u.bg,border:`1.5px solid ${u.border}`,borderRadius:12,padding:"13px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                    <div style={{fontSize:22}}>{cat.emoji}</div>
                    <div style={{flex:1}}><div style={{fontWeight:700,fontSize:14}}>{name}</div><div style={{fontSize:11,marginTop:2}}><span>{u.icon} </span><span style={{color:u.badge,fontWeight:600}}>{u.text} · {MONTH_FULL[c.month]}</span></div></div>
                    <div style={{background:u.badge,color:"#fff",borderRadius:9,padding:"5px 11px",fontWeight:800,fontSize:15}}>€{fmt(c.amount)}</div>
                  </div>);
                })}
              </div>
            )}
            <div style={{background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:14,padding:"16px",marginBottom:20,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
              <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Gesamt / Jahr</div><div style={{fontSize:26,fontWeight:800,color:"#7c3aed",letterSpacing:"-0.5px"}}>€{fmt(totalAnnual)}</div></div>
              <div><div style={{fontSize:11,color:"#9ca3af",marginBottom:4}}>Monatlich zurücklegen</div><div style={{fontSize:26,fontWeight:800,color:"#059669",letterSpacing:"-0.5px"}}>€{monthlyBuffer.toFixed(2)}</div></div>
            </div>
            <div style={{background:exported?"#f0fdf4":"linear-gradient(135deg,#ede9fe,#fce7f3)",border:`1.5px solid ${exported?"#bbf7d0":"#c4b5fd"}`,borderRadius:13,padding:"14px 16px",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
              <div style={{fontSize:28}}>{exported?"✅":"📅"}</div>
              <div style={{flex:1}}>
                <div style={{fontWeight:700,fontSize:13,color:exported?"#059669":"#7c3aed",marginBottom:2}}>{exported?"Datei heruntergeladen!":"In Kalender importieren"}</div>
                <div style={{fontSize:12,color:exported?"#065f46":"#6b7280",lineHeight:1.4}}>{exported?"Öffne die .ics Datei → wird in Kalender importiert. Erinnerungen 14 & 3 Tage vorher.":"Exportiere alle Zahlungen. Du bekommst Erinnerungen 14 & 3 Tage vor jeder Zahlung."}</div>
              </div>
              {!exported&&<button onClick={handleExport} style={{background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:10,padding:"10px 14px",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",flexShrink:0}}>⬇️ Export</button>}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#9ca3af",letterSpacing:2,textTransform:"uppercase",marginBottom:10}}>Alle Einträge</div>
            {costs.length===0&&<div style={{textAlign:"center",color:"#d1d5db",padding:"40px 0",fontSize:14}}>Noch keine Kosten.<br/>Tippe auf "+ Neu".</div>}
            {costs.map(cost=>{
              const cat=getCat(cost.category);
              const name=cost.category==="Sonstiges"&&cost.customLabel?cost.customLabel:cost.name;
              return (<div key={cost.id} style={{background:"#fff",border:"1.5px solid #e5e7eb",borderRadius:12,padding:"13px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:40,height:40,borderRadius:10,background:cat.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{cat.emoji}</div>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{name}</div><div style={{fontSize:12,color:"#9ca3af",marginTop:2}}>{freqLabel(cost.frequency)}{(cost.frequency==="yearly"||cost.frequency==="halfyearly")&&cost.months?.length>0?` · ${cost.months.map(m=>MONTHS[m]).join(", ")}`:""}</div></div>
                <div style={{background:cat.bg,color:cat.color,borderRadius:9,padding:"5px 11px",fontWeight:800,fontSize:15,flexShrink:0}}>€{fmt(cost.amount)}</div>
                <div style={{display:"flex",gap:5}}>
                  <button onClick={()=>handleEdit(cost)} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #e5e7eb",background:"#fff",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>✏️</button>
                  <button onClick={()=>handleDelete(cost.id)} style={{width:30,height:30,borderRadius:8,border:"1.5px solid #fee2e2",background:"#fff",cursor:"pointer",fontSize:13,display:"flex",alignItems:"center",justifyContent:"center"}}>🗑️</button>
                </div>
              </div>);
            })}
            <button onClick={()=>setView("add")} style={{width:"100%",marginTop:14,background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:13,padding:"15px",color:"#fff",fontWeight:800,fontSize:15,cursor:"pointer",boxShadow:"0 4px 14px rgba(124,58,237,0.3)"}}>+ Neue Fixkosten hinzufügen</button>
          </div>
        )}

        {view==="calendar" && (
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#9ca3af",letterSpacing:2,textTransform:"uppercase",marginBottom:14}}>Jahresübersicht {currentYear}</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              {MONTHS.map((m,i)=>{
                const items=monthlyBreakdown[i];const total=monthlyTotals[i];const isCurrent=i===currentMonth;const isPast=i<currentMonth;
                return (<div key={i} onClick={()=>setSelectedMonth(selectedMonth===i?null:i)} style={{background:isCurrent?"#faf5ff":selectedMonth===i?"#f9fafb":"#fff",border:`1.5px solid ${isCurrent?"#a78bfa":selectedMonth===i?"#d1d5db":"#e5e7eb"}`,borderRadius:12,padding:"13px",cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div style={{fontSize:13,fontWeight:isCurrent?800:600,color:isCurrent?"#7c3aed":isPast?"#d1d5db":"#374151"}}>{m}{isCurrent&&<span style={{marginLeft:5,fontSize:9,background:"#7c3aed",color:"#fff",borderRadius:4,padding:"1px 5px"}}>JETZT</span>}</div>
                    {total>0&&<div style={{fontSize:13,fontWeight:800,color:isPast?"#d1d5db":isCurrent?"#7c3aed":"#ef4444"}}>€{fmt(total)}</div>}
                  </div>
                  <div style={{height:5,background:"#f3f4f6",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",borderRadius:3,width:`${(total/maxMonthly)*100}%`,background:isPast?"#e5e7eb":isCurrent?"linear-gradient(90deg,#7c3aed,#a855f7)":"linear-gradient(90deg,#f59e0b,#ef4444)"}}/></div>
                  {selectedMonth===i&&items.length>0&&<div style={{marginTop:10,borderTop:"1px solid #f3f4f6",paddingTop:8}}>{items.map((c,j)=>{const cat=getCat(c.category);const name=c.category==="Sonstiges"&&c.customLabel?c.customLabel:c.name;return(<div key={j} style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}><span style={{color:"#6b7280"}}>{cat.emoji} {name}</span><span style={{fontWeight:700,color:cat.color}}>€{fmt(c.amount)}</span></div>);})}</div>}
                  {total===0&&<div style={{fontSize:11,color:"#e5e7eb",marginTop:4}}>Keine Kosten</div>}
                </div>);
              })}
            </div>
            <button onClick={handleExport} style={{width:"100%",marginBottom:12,background:exported?"#059669":"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",borderRadius:13,padding:"14px",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer"}}>{exported?"✅ Heruntergeladen!":"📅 Als Kalender exportieren (.ics)"}</button>
            <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:13,padding:"16px"}}><div style={{fontSize:13,fontWeight:700,color:"#059669",marginBottom:5}}>💡 Puffer-Strategie</div><div style={{fontSize:13,color:"#065f46",lineHeight:1.6}}>Lege jeden Monat <strong>€{monthlyBuffer.toFixed(2)}</strong> zurück.</div></div>
          </div>
        )}

        {view==="add" && (
          <div>
            <div style={{fontSize:17,fontWeight:800,color:"#111827",marginBottom:20}}>{editId?"Eintrag bearbeiten":"Neue Fixkosten"}</div>
            <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Bezeichnung</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="z.B. Kfz-Versicherung" style={INPUT}/></div>
            <div style={{marginBottom:14}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Betrag (€)</label><input value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} type="number" placeholder="0.00" style={INPUT}/></div>
            <div style={{marginBottom:14}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Häufigkeit</label>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                {FREQ_OPTIONS.map(f=>(<button key={f.value} onClick={()=>setForm(ff=>({...ff,frequency:f.value,months:[0]}))} style={{padding:"11px",borderRadius:10,cursor:"pointer",background:form.frequency===f.value?"#ede9fe":"#fff",border:`1.5px solid ${form.frequency===f.value?"#7c3aed":"#e5e7eb"}`,color:form.frequency===f.value?"#7c3aed":"#6b7280",fontWeight:form.frequency===f.value?700:500,fontSize:13}}>{f.label}</button>))}
              </div>
            </div>
            {(form.frequency==="yearly"||form.frequency==="halfyearly")&&(
              <div style={{marginBottom:14}}>
                <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Fälligkeitsmonat{form.frequency==="halfyearly"?" (2 wählen)":""}</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {MONTHS.map((m,i)=>(<button key={i} onClick={()=>{if(form.frequency==="yearly")setForm(f=>({...f,months:[i]}));else toggleMonth(i);}} style={{padding:"9px 4px",borderRadius:9,cursor:"pointer",background:form.months.includes(i)?"#ede9fe":"#fff",border:`1.5px solid ${form.months.includes(i)?"#7c3aed":"#e5e7eb"}`,color:form.months.includes(i)?"#7c3aed":"#6b7280",fontSize:12,fontWeight:form.months.includes(i)?700:500}}>{m}</button>))}
                </div>
              </div>
            )}
            <div style={{marginBottom:form.category==="Sonstiges"?10:20}}>
              <label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Kategorie</label>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {CATEGORIES.map(cat=>(<button key={cat.key} onClick={()=>setForm(f=>({...f,category:cat.key}))} style={{padding:"8px 12px",borderRadius:9,cursor:"pointer",display:"flex",alignItems:"center",gap:5,background:form.category===cat.key?cat.bg:"#fff",border:`1.5px solid ${form.category===cat.key?cat.color:"#e5e7eb"}`,color:form.category===cat.key?cat.color:"#6b7280",fontWeight:form.category===cat.key?700:500,fontSize:12}}>{cat.emoji} {cat.key}</button>))}
              </div>
            </div>
            {form.category==="Sonstiges"&&(<div style={{marginBottom:20}}><label style={{fontSize:12,fontWeight:600,color:"#374151",display:"block",marginBottom:6}}>Was ist es genau? <span style={{color:"#9ca3af",fontWeight:400}}>(Freitext)</span></label><input value={form.customLabel} onChange={e=>setForm(f=>({...f,customLabel:e.target.value}))} placeholder="z.B. Domain, Mitgliedschaft, Abo …" style={{...INPUT,borderColor:"#f9a8d4",background:"#fff0f7"}}/></div>)}
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>{setView("overview");setEditId(null);setForm({name:"",amount:"",frequency:"yearly",months:[0],category:"Versicherung",customLabel:""}); }} style={{flex:1,padding:"13px",borderRadius:12,background:"#fff",border:"1.5px solid #e5e7eb",color:"#6b7280",fontWeight:600,fontSize:14,cursor:"pointer"}}>Abbrechen</button>
              <button onClick={handleSave} style={{flex:2,padding:"13px",borderRadius:12,background:"linear-gradient(135deg,#7c3aed,#a855f7)",border:"none",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",opacity:(!form.name||!form.amount)?0.5:1}}>{editId?"Speichern":"Hinzufügen ✓"}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
