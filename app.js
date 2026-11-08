(() => {
const MISTAKES = ["Early entry","Late / chased","Moved stop","Oversized","Cut winner early","Held loser","No setup","Revenge trade","Ignored daily limit"];
const EMOTIONS = ["Calm","Confident","Patient","Hesitant","FOMO","Fearful","Greedy","Frustrated","Bored"];
const GRADES = ["A","B","C","D"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const S = {
  db:null, dl:true, canWrite:true, uid:null, email:"", live:false, err:"",
  trades:[], days:{}, setups:[], watch:[],
  cfg:{currency:"$",accountSize:0,riskPct:1,maxDailyLoss:0,defaultMult:1,rules:""},
  date: ymd(new Date()), month: ymd(new Date()).slice(0,7), period:"all",
  f:{q:"",setup:"",result:""}, pending:false
};

/* ---------- helpers ---------- */
function ymd(d){const z=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())}
function parseD(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function addDays(s,n){const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d)}
const $=s=>document.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const numOrNull=v=>{if(v===""||v==null)return null;const n=parseFloat(String(v).replace(/,/g,""));return isFinite(n)?n:null};
function money(n,signed=true){if(n==null||!isFinite(n))return"—";const c=S.cfg.currency||"$";const a=Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});return (n<0?"−":(signed&&n>0?"+":""))+c+a}
function rfmt(r){if(r==null||!isFinite(r))return"—";return (r>0?"+":r<0?"−":"")+Math.abs(r).toFixed(2)+"R"}
function pct(x){return x==null||!isFinite(x)?"—":(x*100).toFixed(0)+"%"}
const cls=n=>n>0?"gain":n<0?"loss":"";
function prettyDate(s,opt={weekday:"long",month:"long",day:"numeric",year:"numeric"}){return parseD(s).toLocaleDateString(undefined,opt)}
function clean(o){const r={};for(const[k,v]of Object.entries(o)){if(v===undefined||(typeof v==="number"&&!isFinite(v)))continue;r[k]=v}return r}
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}
function errMsg(e){if(e&&/JWT|auth|session/i.test(e.message||""))return"Your session expired. Sign in again.";return"Couldn't save. Check your connection and try again."}

function calc(t){
  const m=t.mult||1,q=t.qty||0;let pnl=null;
  if(t.pnlOverride!=null)pnl=t.pnlOverride;
  else if(t.exit!=null&&t.entry!=null&&q)pnl=(t.side==="Short"?t.entry-t.exit:t.exit-t.entry)*q*m-(t.fees||0);
  const risk=(t.stop!=null&&t.entry!=null&&q)?Math.abs(t.entry-t.stop)*q*m:null;
  const r=(pnl!=null&&risk)?pnl/risk:null;
  return {pnl,r,risk,closed:pnl!=null};
}
const tkey=t=>(t.date||"")+" "+(t.time||"");

/* ---------- writes: one at a time per doc ---------- */
const chains={};
function applyRow(kind,id,data){
  if(kind==="trades"){const t={id,...data};t._c=calc(t);const i=S.trades.findIndex(x=>x.id===id);i<0?S.trades.push(t):S.trades[i]=t}
  else if(kind==="days")S.days[id]={...data,date:id};
  else if(kind==="setups"||kind==="watch"){const arr=S[kind];const i=arr.findIndex(x=>x.id===id);const o={id,...data};i<0?arr.push(o):arr[i]=o}
  else if(kind==="config"&&id==="main")S.cfg={...S.cfg,...data};
}
function dropRow(kind,id){
  if(kind==="days")delete S.days[id];
  else if(S[kind]&&Array.isArray(S[kind]))S[kind]=S[kind].filter(x=>x.id!==id);
}
function write(path,body){
  if(!S.db)return Promise.reject();
  const [kind,id]=path.split("/");const data=clean(body);delete data.id;
  applyRow(kind,id,data);if(!document.activeElement||!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))render();
  const prev=chains[path]||Promise.resolve();
  const p=prev.catch(()=>{}).then(async()=>{const {error}=await S.db.from("entries").upsert({user_id:S.uid,kind,id,data,updated_at:new Date().toISOString()},{onConflict:"user_id,kind,id"});if(error)throw error});
  chains[path]=p;p.catch(e=>e&&toast(errMsg(e)));return p;
}
function remove(path){
  if(!S.db)return Promise.reject();
  const [kind,id]=path.split("/");dropRow(kind,id);render();
  const prev=chains[path]||Promise.resolve();
  const p=prev.catch(()=>{}).then(async()=>{const {error}=await S.db.from("entries").delete().eq("kind",kind).eq("id",id);if(error)throw error});
  chains[path]=p;p.catch(e=>toast(errMsg(e)));return p;
}
const newId=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10));

/* ---------- rendering ---------- */
const ROUTES=["today","trades","stats","calendar","playbook","account"];
function route(){const h=location.hash.slice(1);return ROUTES.includes(h)?h:"today"}
function render(force){
  const view=$("#view");
  if(!force&&view.contains(document.activeElement)&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){S.pending=true;return}
  S.pending=false;
  const r=route();
  document.querySelectorAll("#tabs a").forEach(a=>{if(a.getAttribute("href")==="#"+r)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  if(!S.live){view.innerHTML=statusPanel();return}
  const sy=scrollY;
  view.innerHTML=({today:vToday,trades:vTrades,stats:vStats,calendar:vCalendar,playbook:vPlaybook,account:vAccount}[r])();
  bind[r]&&bind[r]();
  scrollTo(0,sy);
}
document.addEventListener("focusout",()=>setTimeout(()=>{if(S.pending&&!$("#view").contains(document.activeElement))render()},0));
addEventListener("hashchange",()=>{render(true);scrollTo(0,0)});

function statusPanel(){
  if(S.err)return `<div class="panel"><div class="empty"><h2>Your journal isn't available in this view</h2><p>${esc(S.err)}</p></div></div>`;
  return `<div class="panel"><div class="empty"><h2>Opening your journal…</h2><p>Your trades, daily notes and playbook load here in a moment.</p></div></div>`;
}
function exampleNotice(){
  const n=S.trades.filter(t=>t.example).length+S.setups.filter(t=>t.example).length;
  if(!n)return"";
  return `<div class="notice"><span><b>You're looking at example entries.</b> Explore, then clear them when you log your first real trade.</span>${S.canWrite?`<button data-act="clearEx">Clear examples</button>`:""}</div>`;
}

/* ---------- TODAY ---------- */
function vToday(){
  const d=S.date, day=S.days[d]||{};
  const list=S.trades.filter(t=>t.date===d).sort((a,b)=>tkey(a).localeCompare(tkey(b)));
  const closed=list.filter(t=>t._c.closed), net=closed.reduce((s,t)=>s+t._c.pnl,0);
  const wins=closed.filter(t=>t._c.pnl>0).length;
  const rsum=closed.reduce((s,t)=>s+(t._c.r||0),0);
  const maxL=S.cfg.maxDailyLoss||0, lossUsed=net<0?-net:0, ratio=maxL?lossUsed/maxL:0;
  const riskAmt=S.cfg.accountSize?S.cfg.accountSize*(S.cfg.riskPct||0)/100:null;
  const rules=(S.cfg.rules||"").split("\n").map(s=>s.trim()).filter(Boolean);
  const checked=new Set(day.rules||[]);
  const isToday=d===ymd(new Date());
  const chipRow=(name,max,val)=>`<div class="chips" data-chipset="${name}">${Array.from({length:max},(_,i)=>i+1).map(v=>`<button type="button" class="chip" data-v="${v}" aria-pressed="${val===v}">${v}</button>`).join("")}</div>`;
  return `
  ${exampleNotice()}
  <div class="spread">
    <div><div class="eyebrow">${isToday?"Today":"Session"}</div><h1>${esc(prettyDate(d))}</h1></div>
    <div class="row">
      <button class="ghost" data-act="prevDay" aria-label="Previous day">←</button>
      <input type="date" id="dayPick" value="${d}" style="width:auto">
      <button class="ghost" data-act="nextDay" aria-label="Next day">→</button>
      ${isToday?"":`<button data-act="goToday">Today</button>`}
    </div>
  </div>
  ${maxL&&lossUsed>=maxL?`<div class="stopbanner">Daily loss limit hit (${money(-lossUsed)} of ${money(-maxL,false)}). Rule says: you're done for the day.</div>`:""}
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Day P&amp;L</span><b class="${cls(net)}">${closed.length?money(net):"—"}</b><small>${closed.length} closed${list.length>closed.length?` · ${list.length-closed.length} open`:""}</small></div>
    <div class="kpi"><span class="eyebrow">Net R</span><b class="${cls(rsum)}">${closed.length?rfmt(rsum):"—"}</b><small>Win rate ${closed.length?pct(wins/closed.length):"—"}</small></div>
    <div class="kpi"><span class="eyebrow">Risk per trade</span><b>${riskAmt!=null?money(riskAmt,false):"—"}</b><small>${riskAmt!=null?`${S.cfg.riskPct}% of ${money(S.cfg.accountSize,false)}`:`<a href="#account">Set account size</a>`}</small></div>
    <div class="kpi"><span class="eyebrow">Daily loss limit</span>${maxL?`<b>${money(lossUsed?-lossUsed:0)} <span class="muted" style="font-size:13px">/ ${money(-maxL,false)}</span></b><div class="meter ${ratio>=1?"over":ratio>=.6?"hot":""}" style="margin-top:6px"><i style="width:${Math.min(100,ratio*100)}%"></i></div>`:`<b>—</b><small><a href="#account">Set a limit</a></small>`}</div>
  </div>
  <div class="grid2">
    <form class="panel" id="dayForm" autocomplete="off">
      <div class="spread"><h2>Pre-market plan</h2><span class="muted" id="saveState" style="font-size:12px"></span></div>
      <div class="fgrid">
        <label class="f">Market bias<select id="bias" name="bias">${["","Bullish","Bearish","Neutral","Choppy / range"].map(o=>`<option ${day.bias===o?"selected":""}>${o}</option>`).join("")}</select></label>
        <label class="f">Sleep (hrs)<input id="sleep" name="sleep" type="number" step="0.5" min="0" max="14" value="${day.sleep??""}"></label>
      </div>
      <div class="f" style="display:grid;gap:4px;font-size:12px;color:var(--muted);font-weight:500">Mood / readiness (1–5)${chipRow("mood",5,day.mood)}</div>
      <label class="f">Key levels &amp; catalysts<textarea id="levels" name="levels" placeholder="SPY 512 support, 518 PDH. CPI at 8:30.">${esc(day.levels)}</textarea></label>
      <label class="f">Game plan<textarea id="plan" name="plan" placeholder="What I'm trading, what I'm waiting for, what I'll skip.">${esc(day.plan)}</textarea></label>
      ${rules.length?`<div style="display:grid;gap:6px"><div class="eyebrow">My rules today</div>${rules.map((r,i)=>`<label class="ruleitem"><input type="checkbox" data-rule="${esc(r)}" id="rule${i}" ${checked.has(r)?"checked":""}> ${esc(r)}</label>`).join("")}</div>`:`<p class="muted" style="margin:0;font-size:13px">Add your trading rules under <a href="#account">Account</a> to get a daily checklist here.</p>`}
    </form>
    <div style="display:grid;gap:20px;align-content:start;min-width:0">
      <div class="panel">
        <div class="spread"><h2>Trades</h2>${S.canWrite?`<button class="primary" data-act="addTrade">+ Log trade</button>`:""}</div>
        ${list.length?`<div class="tlist">${list.map(tradeRow).join("")}</div>`:`<div class="empty" style="padding:14px">No trades logged for this session.</div>`}
      </div>
      <form class="panel" id="reviewForm" autocomplete="off">
        <h2>Post-session review</h2>
        <label class="f">What went well<textarea id="went" name="went">${esc(day.went)}</textarea></label>
        <label class="f">Mistakes<textarea id="mist" name="mist">${esc(day.mist)}</textarea></label>
        <label class="f">One lesson for tomorrow<textarea id="lesson" name="lesson" style="min-height:50px">${esc(day.lesson)}</textarea></label>
        <div style="display:grid;gap:4px;font-size:12px;color:var(--muted);font-weight:500">Discipline score (1–10)${chipRow("discipline",10,day.discipline)}</div>
      </form>
    </div>
  </div>
  ${vWatch()}`;
}
function tradeRow(t){
  const c=t._c;
  return `<div class="trow" data-trade="${esc(t.id)}" tabindex="0" role="button">
    <span class="side ${t.side==="Short"?"S":"L"}">${t.side==="Short"?"SHORT":"LONG"}</span>
    <div style="min-width:0"><b>${esc(t.symbol||"—")}</b> <span class="muted">${esc(t.setup||"")}${t.time?" · "+esc(t.time):""}</span>${t.grade?` <span class="pill info">${esc(t.grade)}</span>`:""}${(t.mistakes||[]).length?` <span class="pill warn">${t.mistakes.length} mistake${t.mistakes.length>1?"s":""}</span>`:""}</div>
    <div style="text-align:right"><div class="num ${cls(c.pnl)}" style="font-weight:600">${c.closed?money(c.pnl):`<span class="pill flat">Open</span>`}</div><div class="num muted" style="font-size:12px">${rfmt(c.r)}</div></div>
  </div>`;
}
function vWatch(){
  const st={Watching:"info",Triggered:"gain",Passed:"flat"};
  return `<div class="panel">
    <div class="spread"><div><h2>Watchlist</h2><span class="muted" style="font-size:13px">Names you're stalking, the level that matters, and why.</span></div></div>
    ${S.canWrite?`<form class="row" id="watchForm" autocomplete="off" style="align-items:end">
      <label class="f" style="flex:1 1 90px">Symbol<input id="wSym" required placeholder="NVDA"></label>
      <label class="f" style="flex:1 1 90px">Trigger level<input id="wLvl" placeholder="142.50"></label>
      <label class="f" style="flex:4 1 220px">Thesis<input id="wTh" placeholder="Reclaim of VWAP after gap fill, volume confirm"></label>
      <button class="primary" type="submit">Add</button></form>`:""}
    ${S.watch.length?`<div class="tbl-wrap"><table><thead><tr><th>Symbol</th><th class="n">Level</th><th>Thesis</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.watch.slice().sort((a,b)=>(b.created||0)-(a.created||0)).map(w=>`<tr><td><b>${esc(w.symbol)}</b></td><td class="n">${esc(w.level||"—")}</td><td style="white-space:normal;min-width:200px">${esc(w.thesis||"")}</td>
      <td><button class="ghost" data-wstat="${esc(w.id)}" title="Change status"><span class="pill ${st[w.status]||"info"}">${esc(w.status||"Watching")}</span></button></td>
      <td>${S.canWrite?`<button class="ghost" data-wdel="${esc(w.id)}" aria-label="Remove ${esc(w.symbol)}">✕</button>`:""}</td></tr>`).join("")}
    </tbody></table></div>`:`<div class="empty" style="padding:12px">Nothing on watch yet.</div>`}
  </div>`;
}
const bind={};
let dayTimer=null;
function saveDay(patch){
  const cur=S.days[S.date]||{};
  const body={...cur,...patch,date:S.date,updatedAt:Date.now()};
  S.days[S.date]=body;
  const ss=$("#saveState");if(ss)ss.textContent="Saving…";
  write("days/"+S.date,body).then(()=>{const s=$("#saveState");if(s)s.textContent="Saved"}).catch(()=>{const s=$("#saveState");if(s)s.textContent="Not saved"});
}
bind.today=()=>{
  const dp=$("#dayPick");dp.onchange=()=>{if(dp.value){S.date=dp.value;render(true)}};
  ["#dayForm","#reviewForm"].forEach(sel=>{
    const f=$(sel);f.onsubmit=e=>e.preventDefault();
    f.addEventListener("input",e=>{
      const el=e.target;if(el.dataset.rule!==undefined)return;
      if(!el.name)return;
      clearTimeout(dayTimer);const name=el.name,val=el.type==="number"?numOrNull(el.value):el.value;
      if(el.tagName==="SELECT"){saveDay({[name]:val});return}
      dayTimer=setTimeout(()=>saveDay({[name]:val}),700);
    });
    f.addEventListener("change",e=>{
      const el=e.target;
      if(el.dataset.rule!==undefined){saveDay({rules:[...document.querySelectorAll("[data-rule]")].filter(x=>x.checked).map(x=>x.dataset.rule)})}
    });
  });
  document.querySelectorAll("[data-chipset]").forEach(set=>set.addEventListener("click",e=>{
    const b=e.target.closest(".chip");if(!b)return;const v=+b.dataset.v;const name=set.dataset.chipset;
    const cur=(S.days[S.date]||{})[name];const nv=cur===v?null:v;
    set.querySelectorAll(".chip").forEach(c=>c.setAttribute("aria-pressed",String(+c.dataset.v===nv)));
    saveDay({[name]:nv});
  }));
  const wf=$("#watchForm");
  if(wf)wf.onsubmit=e=>{e.preventDefault();const sym=$("#wSym").value.trim().toUpperCase();if(!sym)return;
    const id=newId("watch");write("watch/"+id,{symbol:sym,level:$("#wLvl").value.trim(),thesis:$("#wTh").value.trim(),status:"Watching",created:Date.now()});wf.reset();$("#wSym").focus();};
};

/* ---------- TRADES ---------- */
function filtered(){
  const q=S.f.q.trim().toLowerCase();
  return S.trades.filter(t=>{
    if(q&&!((t.symbol||"").toLowerCase().includes(q)||(t.notes||"").toLowerCase().includes(q)))return false;
    if(S.f.setup&&t.setup!==S.f.setup)return false;
    if(S.f.result==="win"&&!(t._c.pnl>0))return false;
    if(S.f.result==="loss"&&!(t._c.pnl<0))return false;
    if(S.f.result==="open"&&t._c.closed)return false;
    if(S.f.result==="mistake"&&!(t.mistakes||[]).length)return false;
    return true;
  }).sort((a,b)=>tkey(b).localeCompare(tkey(a)));
}
function setupNames(){return [...new Set([...S.setups.map(s=>s.name),...S.trades.map(t=>t.setup)].filter(Boolean))].sort()}
function vTrades(){
  const list=filtered();const closed=list.filter(t=>t._c.closed);const net=closed.reduce((s,t)=>s+t._c.pnl,0);
  return `${exampleNotice()}
  <div class="spread"><div><div class="eyebrow">Trade log</div><h1>${S.trades.length} trade${S.trades.length===1?"":"s"}</h1></div>
    <div class="row">${S.dl?`<button data-act="csv">Export CSV</button>`:""}${S.canWrite?`<button class="primary" data-act="addTrade">+ Log trade</button>`:""}</div></div>
  <div class="row">
    <input id="fq" placeholder="Search symbol or notes" value="${esc(S.f.q)}" style="flex:2 1 200px;width:auto">
    <select id="fsetup" style="flex:1 1 150px;width:auto"><option value="">All setups</option>${setupNames().map(n=>`<option ${S.f.setup===n?"selected":""}>${esc(n)}</option>`).join("")}</select>
    <select id="fres" style="flex:1 1 140px;width:auto">${[["","All results"],["win","Winners"],["loss","Losers"],["open","Open"],["mistake","With mistakes"]].map(([v,l])=>`<option value="${v}" ${S.f.result===v?"selected":""}>${l}</option>`).join("")}</select>
  </div>
  ${list.length?`<div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th>Setup</th><th class="n">Qty</th><th class="n">Entry</th><th class="n">Exit</th><th class="n">Stop</th><th class="n">P&amp;L</th><th class="n">R</th><th>Grade</th><th>Plan</th></tr></thead><tbody>
  ${list.map(t=>`<tr class="click" data-trade="${esc(t.id)}" tabindex="0"><td class="mono">${esc(t.date)}</td><td><b>${esc(t.symbol)}</b></td><td><span class="side ${t.side==="Short"?"S":"L"}">${t.side==="Short"?"SHORT":"LONG"}</span></td><td>${esc(t.setup||"—")}</td>
  <td class="n">${t.qty??"—"}</td><td class="n">${t.entry??"—"}</td><td class="n">${t.exit??"—"}</td><td class="n">${t.stop??"—"}</td>
  <td class="n ${cls(t._c.pnl)}" style="font-weight:600">${t._c.closed?money(t._c.pnl):"Open"}</td><td class="n ${cls(t._c.r)}">${rfmt(t._c.r)}</td><td>${t.grade?`<span class="pill info">${esc(t.grade)}</span>`:"—"}</td><td>${t.followedPlan===false?`<span class="pill loss">Broke</span>`:t.followedPlan?`<span class="pill gain">Kept</span>`:"—"}</td></tr>`).join("")}
  </tbody><tfoot><tr><td colspan="8" class="muted">${closed.length} closed shown</td><td class="n ${cls(net)}" style="font-weight:700">${money(net)}</td><td colspan="3"></td></tr></tfoot></table></div>`
  :`<div class="panel"><div class="empty"><h2>${S.trades.length?"No trades match these filters":"Your trade log is empty"}</h2><p>${S.trades.length?"Clear a filter to see more.":"Log your first trade and it shows up here with P&L and R computed for you."}</p>${S.canWrite&&!S.trades.length?`<button class="primary" data-act="addTrade">+ Log trade</button>`:""}</div></div>`}`;
}
bind.trades=()=>{
  const fq=$("#fq");let tm;fq.oninput=()=>{clearTimeout(tm);tm=setTimeout(()=>{S.f.q=fq.value;render(true);const n=$("#fq");n.focus();n.setSelectionRange(n.value.length,n.value.length)},250)};
  $("#fsetup").onchange=e=>{S.f.setup=e.target.value;render(true)};
  $("#fres").onchange=e=>{S.f.result=e.target.value;render(true)};
};

/* ---------- STATS ---------- */
function inPeriod(t){
  if(S.period==="all")return true;const now=new Date();const d=t.date||"";
  if(S.period==="month")return d.slice(0,7)===ymd(now).slice(0,7);
  if(S.period==="30")return d>=addDays(ymd(now),-30);
  if(S.period==="year")return d.slice(0,4)===String(now.getFullYear());
  return true;
}
function computeStats(list){
  const c=list.filter(t=>t._c.closed).sort((a,b)=>tkey(a).localeCompare(tkey(b)));
  const w=c.filter(t=>t._c.pnl>0),l=c.filter(t=>t._c.pnl<0);
  const gw=w.reduce((s,t)=>s+t._c.pnl,0),gl=-l.reduce((s,t)=>s+t._c.pnl,0);
  const net=gw-gl;const withR=c.filter(t=>t._c.r!=null);
  let eq=0,peak=0,dd=0;const curve=c.map(t=>{eq+=t._c.pnl;peak=Math.max(peak,eq);dd=Math.max(dd,peak-eq);return {d:t.date,v:eq}});
  const planned=c.filter(t=>t.followedPlan!=null);
  return {c,n:c.length,w:w.length,l:l.length,net,gw,gl,pf:gl?gw/gl:(gw?Infinity:null),
    wr:c.length?w.length/c.length:null,avgW:w.length?gw/w.length:null,avgL:l.length?-gl/l.length:null,
    exp:c.length?net/c.length:null,avgR:withR.length?withR.reduce((s,t)=>s+t._c.r,0)/withR.length:null,
    best:c.length?Math.max(...c.map(t=>t._c.pnl)):null,worst:c.length?Math.min(...c.map(t=>t._c.pnl)):null,
    dd,curve,withR,plan:planned.length?planned.filter(t=>t.followedPlan).length/planned.length:null};
}
function groupBy(list,keyFn){const m=new Map();list.forEach(t=>{(Array.isArray(keyFn(t))?keyFn(t):[keyFn(t)]).forEach(k=>{if(k==null||k==="")return;if(!m.has(k))m.set(k,[]);m.get(k).push(t)})});return m}
function vStats(){
  const all=S.trades.filter(inPeriod);const st=computeStats(all);
  const per=[["all","All time"],["year","This year"],["month","This month"],["30","Last 30 days"]];
  const head=`<div class="spread"><div><div class="eyebrow">Performance</div><h1>Stats</h1></div><div class="seg" id="perSeg">${per.map(([v,l])=>`<button data-per="${v}" aria-pressed="${S.period===v}">${l}</button>`).join("")}</div></div>`;
  if(!st.n)return head+`<div class="panel"><div class="empty"><h2>No closed trades in this period</h2><p>Stats fill in as soon as you close a trade with an exit price or a P&amp;L.</p></div></div>`;
  const bySetup=[...groupBy(st.c,t=>t.setup||"Unlabeled")].map(([k,v])=>[k,computeStats(v)]).sort((a,b)=>b[1].net-a[1].net);
  const byMist=[...groupBy(st.c,t=>t.mistakes||[])].map(([k,v])=>[k,v.length,v.reduce((s,t)=>s+t._c.pnl,0)]).sort((a,b)=>a[2]-b[2]);
  const byEmo=[...groupBy(st.c,t=>t.emotion)].map(([k,v])=>[k,computeStats(v)]).sort((a,b)=>b[1].net-a[1].net);
  const byGrade=[...groupBy(st.c,t=>t.grade)].map(([k,v])=>[k,computeStats(v)]).sort((a,b)=>a[0].localeCompare(b[0]));
  const mistCost=byMist.reduce((s,m)=>s+Math.min(0,m[2]),0);
  const statTbl=(rows,label)=>`<div class="tbl-wrap"><table><thead><tr><th>${label}</th><th class="n">Trades</th><th class="n">Win %</th><th class="n">Avg R</th><th class="n">Net</th></tr></thead><tbody>${rows.map(([k,s])=>`<tr><td>${esc(k)}</td><td class="n">${s.n}</td><td class="n">${pct(s.wr)}</td><td class="n ${cls(s.avgR)}">${rfmt(s.avgR)}</td><td class="n ${cls(s.net)}" style="font-weight:600">${money(s.net)}</td></tr>`).join("")}</tbody></table></div>`;
  return head+`
  <div class="kpis">
    <div class="kpi"><span class="eyebrow">Net P&amp;L</span><b class="${cls(st.net)}">${money(st.net)}</b><small>${st.n} closed trades</small></div>
    <div class="kpi"><span class="eyebrow">Win rate</span><b>${pct(st.wr)}</b><small>${st.w}W · ${st.l}L</small></div>
    <div class="kpi"><span class="eyebrow">Profit factor</span><b>${st.pf==null?"—":st.pf===Infinity?"∞":st.pf.toFixed(2)}</b><small>Gross ${money(st.gw,false)} / ${money(-st.gl)}</small></div>
    <div class="kpi"><span class="eyebrow">Expectancy</span><b class="${cls(st.exp)}">${money(st.exp)}</b><small>Avg ${rfmt(st.avgR)} per trade</small></div>
    <div class="kpi"><span class="eyebrow">Avg win / loss</span><b><span class="gain">${money(st.avgW,false)}</span></b><small class="loss">${money(st.avgL)}${st.avgW&&st.avgL?` · ${(st.avgW/-st.avgL).toFixed(2)} ratio`:""}</small></div>
    <div class="kpi"><span class="eyebrow">Max drawdown</span><b class="${st.dd?"loss":""}">${st.dd?money(-st.dd):money(0,false)}</b><small>Peak to trough, closed P&amp;L</small></div>
    <div class="kpi"><span class="eyebrow">Plan adherence</span><b>${pct(st.plan)}</b><small>Trades where you kept the plan</small></div>
    <div class="kpi"><span class="eyebrow">Cost of mistakes</span><b class="${mistCost<0?"loss":""}">${money(mistCost)}</b><small>Net of losing tagged groups</small></div>
  </div>
  <div class="panel"><div class="spread"><h2>Equity curve</h2><span class="muted" style="font-size:12px">Cumulative closed P&amp;L, trade by trade</span></div>${equitySvg(st.curve)}</div>
  <div class="grid2">
    <div class="panel"><h2>R-multiple distribution</h2>${rHist(st.withR)}</div>
    <div class="panel"><h2>Net by weekday</h2>${dowBars(st.c)}</div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>By setup</h2>${statTbl(bySetup,"Setup")}</div>
    <div class="panel"><h2>Mistakes</h2>${byMist.length?`<div class="tbl-wrap"><table><thead><tr><th>Mistake</th><th class="n">Times</th><th class="n">Net on those trades</th></tr></thead><tbody>${byMist.map(([k,n,p])=>`<tr><td>${esc(k)}</td><td class="n">${n}</td><td class="n ${cls(p)}" style="font-weight:600">${money(p)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty" style="padding:12px">No mistakes tagged in this period. Keep it that way.</div>`}</div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>By emotion at entry</h2>${byEmo.length?statTbl(byEmo,"Emotion"):`<div class="empty" style="padding:12px">Tag an emotion on your trades to see this.</div>`}</div>
    <div class="panel"><h2>By grade</h2>${byGrade.length?statTbl(byGrade,"Grade"):`<div class="empty" style="padding:12px">Grade your trades A–D to see whether your A setups really pay.</div>`}</div>
  </div>`;
}
function niceTicks(min,max,n=4){const span=max-min||1;const step0=span/n;const mag=Math.pow(10,Math.floor(Math.log10(step0)));const step=[1,2,2.5,5,10].map(x=>x*mag).find(x=>x>=step0);const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;const t=[];for(let v=lo;v<=hi+step/2;v+=step)t.push(+v.toFixed(10));return t}
function shortMoney(v){const c=S.cfg.currency||"$";const a=Math.abs(v);const s=a>=1e6?(a/1e6).toFixed(1)+"M":a>=1e3?(a/1e3).toFixed(a>=1e4?0:1)+"k":a.toFixed(0);return (v<0?"−":"")+c+s}
function equitySvg(curve){
  const W=800,H=240,L=58,R=14,T=12,B=26;const pts=[{d:"",v:0},...curve];
  const vals=pts.map(p=>p.v);const ticks=niceTicks(Math.min(0,...vals),Math.max(0,...vals));
  const y0=ticks[0],y1=ticks[ticks.length-1];
  const x=i=>L+(W-L-R)*(pts.length===1?0:i/(pts.length-1));const y=v=>T+(H-T-B)*(1-(v-y0)/(y1-y0||1));
  const line=pts.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+","+y(p.v).toFixed(1)).join("");
  const area=line+`L${x(pts.length-1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const last=pts[pts.length-1];const col=last.v>=0?"var(--gain)":"var(--loss)";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Equity curve ending at ${esc(money(last.v))}">
  ${ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="${t===0?1.4:1}" ${t===0?"":'stroke-dasharray="3 4"'}/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(shortMoney(t))}</text>`).join("")}
  <path d="${area}" fill="${col}" opacity=".12"/>
  <path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="${x(pts.length-1)}" cy="${y(last.v)}" r="4" fill="${col}"/>
  <text x="${x(1)}" y="${H-6}" text-anchor="start">${esc(curve[0]?.d||"")}</text>
  <text x="${W-R}" y="${H-6}" text-anchor="end">${esc(last.d||"")}</text>
  </svg>`;
}
function rHist(list){
  if(!list.length)return`<div class="empty" style="padding:12px">Add stop prices to your trades to measure results in R.</div>`;
  const bins=[["≤ −2",-Infinity,-2],["−2…−1",-2,-1],["−1…0",-1,0],["0…1",0,1],["1…2",1,2],["2…3",2,3],["≥ 3",3,Infinity]];
  const counts=bins.map(([,a,b])=>list.filter(t=>t._c.r>=a&&t._c.r<b||(b===Infinity&&t._c.r>=a)).length);
  const max=Math.max(...counts,1);const W=400,H=200,B=26,T=16,bw=(W-20)/bins.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution of R multiples">
  <line x1="10" x2="${W-10}" y1="${H-B}" y2="${H-B}" stroke="var(--line)"/>
  ${bins.map(([lab,a],i)=>{const h=(H-B-T)*counts[i]/max;const xx=10+i*bw+4;return `<rect x="${xx}" y="${H-B-h}" width="${bw-8}" height="${h}" rx="3" fill="${a<0?"var(--loss)":"var(--gain)"}" opacity=".85"/>${counts[i]?`<text x="${xx+(bw-8)/2}" y="${H-B-h-4}" text-anchor="middle">${counts[i]}</text>`:""}<text x="${xx+(bw-8)/2}" y="${H-8}" text-anchor="middle">${lab}</text>`}).join("")}
  </svg>`;
}
function dowBars(list){
  const days=[1,2,3,4,5];const sums=days.map(d=>list.filter(t=>parseD(t.date).getDay()===d).reduce((s,t)=>s+t._c.pnl,0));
  const wk=list.filter(t=>[0,6].includes(parseD(t.date).getDay()));if(wk.length){days.push(6);sums.push(wk.reduce((s,t)=>s+t._c.pnl,0))}
  const m=Math.max(...sums.map(Math.abs),1);const W=400,H=200,mid=(H-24)/2+4,bw=(W-20)/days.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Net P&amp;L by weekday">
  <line x1="10" x2="${W-10}" y1="${mid}" y2="${mid}" stroke="var(--line)" stroke-width="1.4"/>
  ${days.map((d,i)=>{const h=(mid-18)*Math.abs(sums[i])/m;const xx=10+i*bw+6;const neg=sums[i]<0;return `<rect x="${xx}" y="${neg?mid:mid-h}" width="${bw-12}" height="${h}" rx="3" fill="${neg?"var(--loss)":"var(--gain)"}" opacity=".85"/>${sums[i]?`<text x="${xx+(bw-12)/2}" y="${neg?mid+h+13:mid-h-4}" text-anchor="middle">${esc(shortMoney(sums[i]))}</text>`:""}<text x="${xx+(bw-12)/2}" y="${H-6}" text-anchor="middle">${d===6?"Wknd":DOW[d]}</text>`}).join("")}
  </svg>`;
}
bind.stats=()=>{const s=$("#perSeg");if(s)s.onclick=e=>{const b=e.target.closest("[data-per]");if(b){S.period=b.dataset.per;render(true)}}};

/* ---------- CALENDAR ---------- */
function vCalendar(){
  const [y,m]=S.month.split("-").map(Number);const first=new Date(y,m-1,1);const last=new Date(y,m,0);
  const byDay=groupBy(S.trades.filter(t=>t._c.closed),t=>t.date);
  const start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
  const today=ymd(new Date());let cells="",monthNet=0,green=0,red=0;
  const mx=Math.max(1,...[...byDay].filter(([k])=>k.startsWith(S.month)).map(([,v])=>Math.abs(v.reduce((s,t)=>s+t._c.pnl,0))));
  for(let d=new Date(start);d<=last||((d.getDay()+6)%7)!==0;){
    let wk=0,wkHas=false;
    for(let i=0;i<7;i++){
      const ds=ymd(d),inM=d.getMonth()===m-1,list=byDay.get(ds)||[],net=list.reduce((s,t)=>s+t._c.pnl,0);
      if(list.length){wk+=net;wkHas=true;if(inM){monthNet+=net;net>0?green++:net<0?red++:0}}
      if(i<5){const a=list.length?Math.min(1,.18+.6*Math.abs(net)/mx):0;
        const bg=list.length?`background:color-mix(in srgb, ${net>=0?"var(--gain)":"var(--loss)"} ${Math.round(a*45)}%, var(--surface))`:"";
        cells+=`<button class="cell ${inM?"":"out"} ${ds===today?"today":""}" data-day="${ds}" style="${bg}"><span class="d">${d.getDate()}</span>${list.length?`<span class="p ${cls(net)}">${shortMoney(net)}</span><span class="c">${list.length} trade${list.length>1?"s":""}</span>`:"<span></span>"}</button>`}
      d.setDate(d.getDate()+1);
    }
    cells+=`<div class="wk ${cls(wk)}">${wkHas?shortMoney(wk):"—"}</div>`;
  }
  return `<div class="spread"><div><div class="eyebrow">P&amp;L calendar</div><h1>${first.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h1></div>
   <div class="row"><button class="ghost" data-act="prevM" aria-label="Previous month">←</button><button data-act="thisM">This month</button><button class="ghost" data-act="nextM" aria-label="Next month">→</button></div></div>
  <div class="kpis"><div class="kpi"><span class="eyebrow">Month net</span><b class="${cls(monthNet)}">${money(monthNet)}</b></div>
   <div class="kpi"><span class="eyebrow">Green days</span><b class="gain">${green}</b></div><div class="kpi"><span class="eyebrow">Red days</span><b class="loss">${red}</b></div>
   <div class="kpi"><span class="eyebrow">Day win rate</span><b>${green+red?pct(green/(green+red)):"—"}</b></div></div>
  <div class="panel" style="overflow-x:auto"><div class="cal">${["Mon","Tue","Wed","Thu","Fri"].map(d=>`<div class="hd">${d}</div>`).join("")}<div class="hd" style="text-align:right">Week</div>${cells}</div>
  <p class="muted" style="margin:0;font-size:12px">Click a day to open its journal.</p></div>`;
}

/* ---------- PLAYBOOK ---------- */
function vPlaybook(){
  const stats=new Map([...groupBy(S.trades.filter(t=>t._c.closed),t=>t.setup)].map(([k,v])=>[k,computeStats(v)]));
  return `${exampleNotice()}<div class="spread"><div><div class="eyebrow">Playbook</div><h1>Setups</h1><p class="muted" style="margin:4px 0 0">The trades you take, written down. Each card tracks how that setup actually performs.</p></div>${S.canWrite?`<button class="primary" data-act="addSetup">+ New setup</button>`:""}</div>
  ${S.setups.length?`<div class="grid2">${S.setups.slice().sort((a,b)=>(a.name||"").localeCompare(b.name||"")).map(s=>{const st=stats.get(s.name);return `<div class="setup">
    <div class="spread"><h2>${esc(s.name)}</h2>${S.canWrite?`<button class="ghost" data-setup="${esc(s.id)}">Edit</button>`:""}</div>
    ${s.market?`<div class="eyebrow">${esc(s.market)}${s.timeframe?" · "+esc(s.timeframe):""}</div>`:""}
    <div class="minis"><span>Trades <b>${st?st.n:0}</b></span><span>Win <b>${st?pct(st.wr):"—"}</b></span><span>Avg <b class="${st?cls(st.avgR):""}">${st?rfmt(st.avgR):"—"}</b></span><span>Net <b class="${st?cls(st.net):""}">${st?money(st.net):"—"}</b></span></div>
    ${s.entry?`<div><div class="eyebrow">Entry criteria</div><pre>${esc(s.entry)}</pre></div>`:""}
    ${s.mgmt?`<div><div class="eyebrow">Stop, targets &amp; management</div><pre>${esc(s.mgmt)}</pre></div>`:""}
    ${s.avoid?`<div><div class="eyebrow">Don't take it when</div><pre>${esc(s.avoid)}</pre></div>`:""}
  </div>`}).join("")}</div>`:`<div class="panel"><div class="empty"><h2>No setups yet</h2><p>Write down your A+ setups: what triggers entry, where the stop goes, how you manage it.</p>${S.canWrite?`<button class="primary" data-act="addSetup">+ New setup</button>`:""}</div></div>`}`;
}

/* ---------- ACCOUNT ---------- */
function vAccount(){
  const c=S.cfg;
  return `<div><div class="eyebrow">Account</div><h1>Risk &amp; rules</h1></div>
  <form class="panel" id="cfgForm" autocomplete="off">
    <h2>Risk parameters</h2>
    <div class="fgrid">
      <label class="f">Currency symbol<input id="cCur" value="${esc(c.currency)}" maxlength="4"></label>
      <label class="f">Account size<input id="cSize" type="number" step="any" value="${c.accountSize||""}"></label>
      <label class="f">Risk per trade (%)<input id="cRisk" type="number" step="0.05" value="${c.riskPct??""}"></label>
      <label class="f">Max daily loss<input id="cMax" type="number" step="any" value="${c.maxDailyLoss||""}"></label>
      <label class="f">Default point value<input id="cMult" type="number" step="any" value="${c.defaultMult||1}" title="1 for stocks; e.g. 50 for ES, 20 for NQ"></label>
    </div>
    <label class="f">My trading rules (one per line, shown as a checklist each day)<textarea id="cRules" style="min-height:140px" placeholder="No trades in the first 5 minutes&#10;Max 3 trades per day&#10;Stop after 2 consecutive losses">${esc(c.rules)}</textarea></label>
    <div class="row">${S.canWrite?`<button class="primary" type="submit">Save</button>`:`<span class="muted">Read-only view.</span>`}</div>
  </form>
  <div class="panel"><h2>Your data</h2>
    <p class="muted" style="margin:0">Your journal is stored in your own database and only your signed-in account can read or change it.</p>
    <div class="row">${S.email?`<span class="muted" style="font-size:13px">Signed in as ${esc(S.email)}</span>`:""}<button data-act="csv">Export trades as CSV</button><button data-act="signout">Sign out</button>${S.canWrite&&(S.trades.some(t=>t.example)||S.setups.some(t=>t.example))?`<button data-act="clearEx">Clear example entries</button>`:""}</div>
  </div>`;
}
bind.account=()=>{const f=$("#cfgForm");f.onsubmit=e=>{e.preventDefault();
  const body={currency:$("#cCur").value.trim()||"$",accountSize:numOrNull($("#cSize").value)||0,riskPct:numOrNull($("#cRisk").value)??1,maxDailyLoss:numOrNull($("#cMax").value)||0,defaultMult:numOrNull($("#cMult").value)||1,rules:$("#cRules").value};
  S.cfg={...S.cfg,...body};write("config/main",body).then(()=>toast("Saved"));}};

/* ---------- modals ---------- */
function openModal(html,onMount){const root=$("#modalRoot");root.innerHTML=`<div class="scrim" id="scrim"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  $("#scrim").addEventListener("mousedown",e=>{if(e.target.id==="scrim")closeModal()});onMount&&onMount(root);const first=root.querySelector("input,select,textarea");first&&first.focus()}
function closeModal(){$("#modalRoot").innerHTML="";if(S.pending)render()}
addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#scrim"))closeModal()});
function armDelete(btn,fn){btn.onclick=()=>{if(btn.classList.contains("armed")){fn()}else{btn.classList.add("armed");btn.textContent="Click again to delete";setTimeout(()=>{btn.classList.remove("armed");btn.textContent="Delete"},3500)}}}

function tradeModal(id){
  const t=id?S.trades.find(x=>x.id===id):null;
  if(!S.canWrite&&t){/* read-only details */}
  const v=t||{date:S.date,side:"Long",mult:S.cfg.defaultMult||1,time:new Date().toTimeString().slice(0,5)};
  const ro=!S.canWrite?"disabled":"";
  const mist=new Set(v.mistakes||[]);
  openModal(`<form id="tForm" autocomplete="off" style="display:grid;gap:16px">
    <div class="spread"><h2>${t?"Edit trade":"Log trade"}</h2><button type="button" class="ghost" data-close aria-label="Close">✕</button></div>
    <div class="fgrid">
      <label class="f">Date<input id="tDate" type="date" required value="${esc(v.date)}" ${ro}></label>
      <label class="f">Time<input id="tTime" type="time" value="${esc(v.time||"")}" ${ro}></label>
      <label class="f">Symbol<input id="tSym" required value="${esc(v.symbol||"")}" placeholder="AAPL, ES, EURUSD" ${ro}></label>
      <div class="f" style="display:grid;gap:4px;font-size:12px;color:var(--muted);font-weight:500">Side<div class="seg" id="tSide"><button type="button" data-side="Long" aria-pressed="${v.side!=="Short"}" ${ro}>Long</button><button type="button" data-side="Short" aria-pressed="${v.side==="Short"}" ${ro}>Short</button></div></div>
      <label class="f">Setup<input id="tSetup" list="setupList" value="${esc(v.setup||"")}" ${ro}><datalist id="setupList">${setupNames().map(n=>`<option value="${esc(n)}">`).join("")}</datalist></label>
      <label class="f">Quantity<input id="tQty" type="number" step="any" value="${v.qty??""}" ${ro}></label>
      <label class="f">Entry<input id="tEntry" type="number" step="any" value="${v.entry??""}" ${ro}></label>
      <label class="f">Stop<input id="tStop" type="number" step="any" value="${v.stop??""}" ${ro}></label>
      <label class="f">Target<input id="tTarget" type="number" step="any" value="${v.target??""}" ${ro}></label>
      <label class="f">Exit<input id="tExit" type="number" step="any" value="${v.exit??""}" placeholder="Blank = open" ${ro}></label>
      <label class="f">Fees<input id="tFees" type="number" step="any" value="${v.fees??""}" ${ro}></label>
      <label class="f">Point value<input id="tMult" type="number" step="any" value="${v.mult??1}" title="1 for stocks; contract multiplier for futures" ${ro}></label>
      <label class="f">P&amp;L override<input id="tPnl" type="number" step="any" value="${v.pnlOverride??""}" placeholder="Optional" title="Use your broker's net P&L instead of the computed one" ${ro}></label>
    </div>
    <div class="spread" id="tCalc" style="background:var(--sunk);border-radius:var(--r);padding:10px 14px"></div>
    <div class="fgrid">
      <label class="f">Emotion at entry<select id="tEmo" ${ro}><option></option>${EMOTIONS.map(e=>`<option ${v.emotion===e?"selected":""}>${e}</option>`).join("")}</select></label>
      <div class="f" style="display:grid;gap:4px;font-size:12px;color:var(--muted);font-weight:500">Grade<div class="seg" id="tGrade">${GRADES.map(g=>`<button type="button" data-g="${g}" aria-pressed="${v.grade===g}" ${ro}>${g}</button>`).join("")}</div></div>
      <label class="f" style="align-content:end"><span class="row" style="gap:8px;color:var(--ink);font-size:13px"><input type="checkbox" id="tPlan" ${v.followedPlan?"checked":""} ${ro}> Followed my plan</span></label>
    </div>
    <div style="display:grid;gap:6px"><div class="eyebrow">Mistakes</div><div class="chips" id="tMist">${MISTAKES.map(m=>`<button type="button" class="chip" data-m="${esc(m)}" aria-pressed="${mist.has(m)}" ${ro}>${esc(m)}</button>`).join("")}</div></div>
    <label class="f">Notes<textarea id="tNotes" placeholder="Why you took it, how it played out, what you'd do differently." ${ro}>${esc(v.notes||"")}</textarea></label>
    <div class="spread">${t&&S.canWrite?`<button type="button" class="danger" id="tDel">Delete</button>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button>${S.canWrite?`<button class="primary" type="submit">${t?"Save changes":"Log trade"}</button>`:""}</div></div>
  </form>`,root=>{
    let side=v.side==="Short"?"Short":"Long",grade=v.grade||null;
    root.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModal);
    $("#tSide").onclick=e=>{const b=e.target.closest("[data-side]");if(!b)return;side=b.dataset.side;$("#tSide").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));upd()};
    $("#tGrade").onclick=e=>{const b=e.target.closest("[data-g]");if(!b)return;grade=grade===b.dataset.g?null:b.dataset.g;$("#tGrade").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.g===grade)))};
    $("#tMist").onclick=e=>{const b=e.target.closest("[data-m]");if(!b)return;b.setAttribute("aria-pressed",String(b.getAttribute("aria-pressed")!=="true"))};
    const read=()=>({date:$("#tDate").value,time:$("#tTime").value,symbol:$("#tSym").value.trim().toUpperCase(),side,setup:$("#tSetup").value.trim(),
      qty:numOrNull($("#tQty").value),entry:numOrNull($("#tEntry").value),stop:numOrNull($("#tStop").value),target:numOrNull($("#tTarget").value),
      exit:numOrNull($("#tExit").value),fees:numOrNull($("#tFees").value),mult:numOrNull($("#tMult").value)||1,pnlOverride:numOrNull($("#tPnl").value),
      emotion:$("#tEmo").value,grade,followedPlan:$("#tPlan").checked,mistakes:[...$("#tMist").querySelectorAll('[aria-pressed="true"]')].map(b=>b.dataset.m),notes:$("#tNotes").value});
    function upd(){const d=read();const c=calc(d);const plannedR=(d.target!=null&&d.entry!=null&&d.stop!=null&&d.entry!==d.stop)?Math.abs(d.target-d.entry)/Math.abs(d.entry-d.stop):null;
      const riskAmt=S.cfg.accountSize?S.cfg.accountSize*(S.cfg.riskPct||0)/100:null;const over=riskAmt&&c.risk&&c.risk>riskAmt*1.05;
      $("#tCalc").innerHTML=`<span>Risk <b class="num ${over?"loss":""}">${c.risk!=null?money(c.risk,false):"—"}</b>${over?` <span class="pill loss">Over ${money(riskAmt,false)} limit</span>`:""}</span><span>Planned <b class="num">${plannedR!=null?plannedR.toFixed(2)+"R":"—"}</b></span><span>P&amp;L <b class="num ${cls(c.pnl)}">${c.closed?money(c.pnl):"Open"}</b></span><span>Result <b class="num ${cls(c.r)}">${rfmt(c.r)}</b></span>`}
    $("#tForm").addEventListener("input",upd);upd();
    $("#tForm").onsubmit=e=>{e.preventDefault();if(!S.canWrite)return;const d=read();if(!d.symbol||!d.date)return;
      const tid=t?t.id:newId("trades");const body={...d,created:t?.created||Date.now(),updatedAt:Date.now()};
      write("trades/"+tid,body).then(()=>toast(t?"Trade updated":"Trade logged"));closeModal();};
    const del=$("#tDel");if(del)armDelete(del,()=>{remove("trades/"+t.id).then(()=>toast("Trade deleted"));closeModal()});
  });
}
function setupModal(id){
  const s=id?S.setups.find(x=>x.id===id):{};
  openModal(`<form id="sForm" autocomplete="off" style="display:grid;gap:14px">
    <div class="spread"><h2>${id?"Edit setup":"New setup"}</h2><button type="button" class="ghost" data-close aria-label="Close">✕</button></div>
    <div class="fgrid"><label class="f" style="grid-column:span 2">Name<input id="sName" required value="${esc(s.name||"")}" placeholder="Opening range breakout"></label>
      <label class="f">Market<input id="sMkt" value="${esc(s.market||"")}" placeholder="US equities"></label><label class="f">Timeframe<input id="sTf" value="${esc(s.timeframe||"")}" placeholder="5m"></label></div>
    <label class="f">Entry criteria<textarea id="sEntry">${esc(s.entry||"")}</textarea></label>
    <label class="f">Stop, targets &amp; management<textarea id="sMgmt">${esc(s.mgmt||"")}</textarea></label>
    <label class="f">Don't take it when<textarea id="sAvoid">${esc(s.avoid||"")}</textarea></label>
    <div class="spread">${id?`<button type="button" class="danger" id="sDel">Delete</button>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save setup</button></div></div>
  </form>`,root=>{
    root.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModal);
    $("#sForm").onsubmit=e=>{e.preventDefault();const name=$("#sName").value.trim();if(!name)return;const sid=id||newId("setups");
      write("setups/"+sid,{name,market:$("#sMkt").value.trim(),timeframe:$("#sTf").value.trim(),entry:$("#sEntry").value,mgmt:$("#sMgmt").value,avoid:$("#sAvoid").value,created:s.created||Date.now()}).then(()=>toast("Setup saved"));closeModal()};
    const del=$("#sDel");if(del)armDelete(del,()=>{remove("setups/"+id);closeModal()});
  });
}

/* ---------- global clicks ---------- */
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-act]");
  if(a){const act=a.dataset.act;
    if(act==="addTrade")tradeModal();
    else if(act==="addSetup")setupModal();
    else if(act==="prevDay"){S.date=addDays(S.date,-1);render(true)}
    else if(act==="nextDay"){S.date=addDays(S.date,1);render(true)}
    else if(act==="goToday"){S.date=ymd(new Date());render(true)}
    else if(act==="prevM"||act==="nextM"){const [y,m]=S.month.split("-").map(Number);const d=new Date(y,m-1+(act==="nextM"?1:-1),1);S.month=ymd(d).slice(0,7);render(true)}
    else if(act==="thisM"){S.month=ymd(new Date()).slice(0,7);render(true)}
    else if(act==="csv")exportCsv();
    else if(act==="clearEx")clearExamples(a);
    else if(act==="signout")signOut();
    return;}
  const tr=e.target.closest("[data-trade]");if(tr&&!$("#scrim")){tradeModal(tr.dataset.trade);return}
  const sb=e.target.closest("[data-setup]");if(sb){setupModal(sb.dataset.setup);return}
  const cd=e.target.closest("[data-day]");if(cd){S.date=cd.dataset.day;location.hash="today";render(true);return}
  const ws=e.target.closest("[data-wstat]");if(ws&&S.canWrite){const w=S.watch.find(x=>x.id===ws.dataset.wstat);const order=["Watching","Triggered","Passed"];const next=order[(order.indexOf(w.status||"Watching")+1)%3];write("watch/"+w.id,{...w,id:undefined,status:next});return}
  const wd=e.target.closest("[data-wdel]");if(wd){remove("watch/"+wd.dataset.wdel);return}
});
document.addEventListener("keydown",e=>{if(e.key==="Enter"){const tr=e.target.closest&&e.target.closest("[data-trade]");if(tr&&!$("#scrim"))tradeModal(tr.dataset.trade)}});

let clearArmed=false;
function clearExamples(btn){
  if(!clearArmed){clearArmed=true;btn.textContent="Click again to clear examples";setTimeout(()=>{clearArmed=false;btn.textContent="Clear examples"},3500);return}
  clearArmed=false;
  const jobs=[...S.trades.filter(t=>t.example).map(t=>"trades/"+t.id),...S.setups.filter(t=>t.example).map(t=>"setups/"+t.id),...S.watch.filter(t=>t.example).map(t=>"watch/"+t.id),
    ...Object.values(S.days).filter(d=>d.example).map(d=>"days/"+d.date)];
  Promise.all(jobs.map(remove)).then(()=>toast("Examples cleared"));
}
async function exportCsv(){
    const cols=["date","time","symbol","side","setup","qty","entry","stop","target","exit","fees","mult","pnl","r","grade","emotion","followedPlan","mistakes","notes"];
  const q=v=>{const s=v==null?"":String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const rows=S.trades.slice().sort((a,b)=>tkey(a).localeCompare(tkey(b))).map(t=>cols.map(c=>c==="pnl"?(t._c.pnl==null?"":t._c.pnl.toFixed(2)):c==="r"?(t._c.r==null?"":t._c.r.toFixed(2)):c==="mistakes"?(t.mistakes||[]).join("; "):t[c]).map(q).join(","));
  const blob=new Blob([[cols.join(","),...rows].join("\n")],{type:"text/csv"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="trades-"+ymd(new Date())+".csv";document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}

/* ---------- boot: Supabase auth + data ---------- */
const CFG=window.TL_CONFIG||{};
function showApp(on){$("#authScreen").hidden=on;$("#appShell").hidden=!on}
async function loadAll(){
  const {data,error}=await S.db.from("entries").select("kind,id,data");
  if(error)throw error;
  S.trades=[];S.days={};S.setups=[];S.watch=[];
  (data||[]).forEach(r=>applyRow(r.kind,r.id,r.data||{}));
}
async function startApp(session){
  S.uid=session.user.id;S.email=session.user.email||"";showApp(true);render(true);
  if(window.__fromLink){toast("Email confirmed. You're signed in.");window.__fromLink=false}
  try{await loadAll();S.live=true;S.err=""}catch(e){S.err="Your journal couldn't be loaded. Check your connection and refresh."}
  render(true);
}
async function signOut(){try{await S.db.auth.signOut()}finally{location.hash="";location.reload()}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.live&&!$("#scrim"))loadAll().then(()=>render()).catch(()=>{})});

function authMsg(t,bad){const m=$("#authMsg");m.textContent=t;m.className="authmsg"+(bad?" bad":"");m.hidden=!t}
function setMode(mode){
  const f=$("#authForm");f.dataset.mode=mode;
  $("#authDone").hidden=true;
  ["#authTitle","#authSubmit",".authlinks"].forEach(sel=>$(sel).hidden=false);
  $("#authTitle").textContent={signin:"Sign in",signup:"Create your account",reset:"Reset password",newpw:"Set a new password"}[mode];
  const sub={signup:"Use the email you check. We'll send a link to confirm it.",reset:"Enter your email and we'll send you a link to choose a new password.",newpw:"Choose a new password for your account."}[mode];
  $("#authSub").textContent=sub||"";$("#authSub").hidden=!sub;
  $("#authPwWrap").hidden=mode==="reset";$("#authEmailWrap").hidden=mode==="newpw";
  $("#authSubmit").textContent={signin:"Sign in",signup:"Create account",reset:"Email me a reset link",newpw:"Save new password"}[mode];
  $("#authPw").autocomplete=mode==="signin"?"current-password":"new-password";
  $("#toSignup").hidden=mode!=="signin"||!CFG.allowSignup;$("#toReset").hidden=mode!=="signin";$("#toSignin").hidden=mode==="signin"||mode==="newpw";
  authMsg("");
}
let doneKind="signup";
function showDone(kind,email){
  doneKind=kind;
  ["#authTitle","#authSub","#authEmailWrap","#authPwWrap","#authSubmit",".authlinks"].forEach(sel=>$(sel).hidden=true);
  authMsg("");$("#authDone").hidden=false;
  const e=`<b>${esc(email)}</b>`;
  if(kind==="signup"){
    $("#doneTitle").textContent="Account created";
    $("#doneText").innerHTML=`We sent a confirmation link to ${e}.`;
    $("#doneSteps").innerHTML="<li>Open the email from Supabase (check spam if it isn't there in a minute).</li><li>Tap <b>Confirm your mail</b>. You'll land back here, signed in.</li><li>If you open the link on another device, come back and sign in here.</li>";
  }else{
    $("#doneTitle").textContent="Reset link sent";
    $("#doneText").innerHTML=`If ${e} has an account, a reset link is on its way.`;
    $("#doneSteps").innerHTML="<li>Open the email and tap the reset link.</li><li>You'll come back here to choose a new password.</li>";
  }
  $("#doneResend").hidden=false;$("#doneResend").disabled=false;$("#doneResend").textContent="Resend email";
  $("#doneSignin").focus();
}
function bindAuth(){
  $("#toSignup").onclick=()=>setMode("signup");$("#toReset").onclick=()=>setMode("reset");$("#toSignin").onclick=()=>setMode("signin");
  $("#doneSignin").onclick=()=>{setMode("signin");$("#authPw").value="";$("#authPw").focus()};
  $("#doneResend").onclick=async()=>{
    const btn=$("#doneResend"),email=$("#authEmail").value.trim();btn.disabled=true;btn.textContent="Sending…";
    try{
      const {error}=doneKind==="signup"
        ?await S.db.auth.resend({type:"signup",email,options:{emailRedirectTo:location.origin+location.pathname}})
        :await S.db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      if(error)throw error;btn.textContent="Sent again";setTimeout(()=>{btn.disabled=false;btn.textContent="Resend email"},30000);
    }catch(err){btn.disabled=false;btn.textContent=/rate|seconds/i.test(err.message||"")?"Wait a minute, then retry":"Couldn't send. Retry"}
  };
  $("#authForm").onsubmit=async e=>{
    e.preventDefault();const mode=e.target.dataset.mode,email=$("#authEmail").value.trim(),pw=$("#authPw").value;const btn=$("#authSubmit");const label=btn.textContent;btn.disabled=true;btn.textContent="Please wait…";authMsg("");
    try{
      if(mode==="signin"){const {error}=await S.db.auth.signInWithPassword({email,password:pw});if(error)throw error}
      else if(mode==="signup"){if(pw.length<8)throw {message:"Use at least 8 characters for your password."};const {data,error}=await S.db.auth.signUp({email,password:pw,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(!data.session)showDone("signup",email)}
      else if(mode==="reset"){const {error}=await S.db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;showDone("reset",email)}
      else if(mode==="newpw"){if(pw.length<8)throw {message:"Use at least 8 characters for your password."};const {error}=await S.db.auth.updateUser({password:pw});if(error)throw error;const {data}=await S.db.auth.getSession();if(data.session)startApp(data.session)}
    }catch(err){const m=err.message||"";authMsg(/invalid login/i.test(m)?"That email and password don't match.":/not confirmed/i.test(m)?"Confirm your email first: open the link we sent you, then sign in.":/already registered/i.test(m)?"That email already has an account. Sign in instead.":(m||"Something went wrong. Try again."),true)}
    finally{btn.disabled=false;btn.textContent=label}
  };
}
(async()=>{
  bindAuth();setMode("signin");
  if(!CFG.url||!CFG.key||!window.supabase){showApp(false);authMsg("This app isn't connected to its database yet. Add the Supabase URL and key to config.js.",true);$("#authSubmit").disabled=true;return}
  window.__fromLink=/access_token|type=(signup|magiclink)/.test(location.hash+location.search);
  S.db=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  S.db.auth.onAuthStateChange((ev,session)=>{
    if(ev==="PASSWORD_RECOVERY"){showApp(false);setMode("newpw");return}
    if(session&&!S.uid)startApp(session);
    if(ev==="SIGNED_OUT"&&S.uid)location.reload();
  });
  const {data:{session}}=await S.db.auth.getSession();
  if(session){if(!S.uid)startApp(session)}else showApp(false);
})();
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
})();
