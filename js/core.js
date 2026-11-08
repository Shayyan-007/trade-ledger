// Trade Ledger v2 core: state, helpers, storage, accounts, risk, sizing and the stats engine.

export const MISTAKES = ["Early entry","Late / chased","Moved stop","Oversized","Cut winner early","Held loser","No setup","Revenge trade","Ignored daily limit","Below min R:R"];
export const EMOTIONS = ["Calm","Confident","Patient","Hesitant","FOMO","Fearful","Greedy","Frustrated","Bored"];
export const GRADES = ["A","B","C","D"];
export const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
export const ACCOUNT_TYPES = [
  ["live","Live"],["demo","Demo / paper"],["challenge-1","Prop challenge · Phase 1"],["challenge-2","Prop challenge · Phase 2"],["funded","Prop funded"]
];
export const INSTRUMENT_TYPES = [["stock","Stock / ETF"],["forex","Forex"],["futures","Futures"],["crypto","Crypto"],["cfd","CFD / index"]];
export const NO_TRADE_REASONS = ["No valid setup","High-impact news","Rule lockout","Personal / away","Market closed"];

export const S = {
  db:null, uid:null, email:"", live:false, err:"",
  trades:[], days:{}, setups:[], watch:[], accounts:[], txns:[], instruments:[],
  cfg:{currency:"$",rules:"",accountSize:0,riskPct:1,maxDailyLoss:0,defaultMult:1},
  firms:null,
  date: ymd(new Date()), month: ymd(new Date()).slice(0,7),
  f:{account:"all",period:"all",from:"",to:"",setup:"",symbol:"",side:"",source:"",result:"",q:"",drill:null},
  stmt:{account:"",month: ymd(new Date()).slice(0,7)},
  pending:false
};

/* ---------- helpers ---------- */
export function ymd(d){const z=n=>String(n).padStart(2,"0");return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate())}
export function parseD(s){const [y,m,d]=String(s).split("-").map(Number);return new Date(y,(m||1)-1,d||1)}
export function addDays(s,n){const d=parseD(s);d.setDate(d.getDate()+n);return ymd(d)}
export function weekStart(s){const d=parseD(s);d.setDate(d.getDate()-((d.getDay()+6)%7));return ymd(d)}
export const $=s=>document.querySelector(s);
export const $$=s=>[...document.querySelectorAll(s)];
export const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export const numOrNull=v=>{if(v===""||v==null)return null;const n=parseFloat(String(v).replace(/,/g,""));return isFinite(n)?n:null};
export const cls=n=>n>0?"gain":n<0?"loss":"";
export function cur(acct){return (acct&&acct.currency)||S.cfg.currency||"$"}
export function money(n,signed=true,c){if(n==null||!isFinite(n))return"—";c=c||S.cfg.currency||"$";const a=Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});return (n<0?"−":(signed&&n>0?"+":""))+c+a}
export function shortMoney(v,c){c=c||S.cfg.currency||"$";const a=Math.abs(v);const s=a>=1e6?(a/1e6).toFixed(1)+"M":a>=1e3?(a/1e3).toFixed(a>=1e4?0:1)+"k":a.toFixed(0);return (v<0?"−":"")+c+s}
export function rfmt(r){if(r==null||!isFinite(r))return"—";return (r>0?"+":r<0?"−":"")+Math.abs(r).toFixed(2)+"R"}
export function pct(x,dp=0){return x==null||!isFinite(x)?"—":(x*100).toFixed(dp)+"%"}
export function num(x,dp=2){return x==null||!isFinite(x)?"—":x.toFixed(dp)}
export function prettyDate(s,opt={weekday:"long",month:"long",day:"numeric",year:"numeric"}){return parseD(s).toLocaleDateString(undefined,opt)}
export function clean(o){const r={};for(const[k,v]of Object.entries(o)){if(v===undefined||(typeof v==="number"&&!isFinite(v)))continue;r[k]=v}return r}
export function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2800)}
export function errMsg(e){if(e&&/JWT|auth|session/i.test(e.message||""))return"Your session expired. Sign in again.";return"Couldn't save. Check your connection and try again."}
export const newId=()=>(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2,10));
export const tkey=t=>(t.date||"")+" "+(t.time||"");
export function minutesBetween(d1,t1,d2,t2){if(!d1||!t1||!d2||!t2)return null;const a=new Date(d1+"T"+t1),b=new Date(d2+"T"+t2);const m=(b-a)/60000;return isFinite(m)&&m>=0?m:null}
export function fmtDur(m){if(m==null)return"—";if(m<60)return Math.round(m)+"m";if(m<1440)return (m/60).toFixed(1)+"h";return (m/1440).toFixed(1)+"d"}

/* ---------- render hook ---------- */
let renderFn=()=>{};
export function setRender(fn){renderFn=fn}
export function render(force){renderFn(force)}

/* ---------- storage (Supabase entries table) ---------- */
const LISTS=["trades","setups","watch","accounts","txns","instruments"];
export function applyRow(kind,id,data){
  if(kind==="days")S.days[id]={...data,date:id};
  else if(kind==="config"&&id==="main")S.cfg={...S.cfg,...data};
  else if(LISTS.includes(kind)){
    const o={id,...data};if(kind==="trades")o._c=calc(o);
    const arr=S[kind];const i=arr.findIndex(x=>x.id===id);i<0?arr.push(o):arr[i]=o;
    if(kind==="accounts"||kind==="txns")recalcAll();
  }
}
function dropRow(kind,id){if(kind==="days")delete S.days[id];else if(LISTS.includes(kind)){S[kind]=S[kind].filter(x=>x.id!==id);if(kind==="accounts"||kind==="txns")recalcAll()}}
export function recalcAll(){S.trades.forEach(t=>t._c=calc(t))}
const chains={};
export function write(path,body,{silent}={}){
  if(!S.db)return Promise.reject();
  const [kind,id]=path.split("/");const data=clean(body);delete data.id;delete data._c;
  applyRow(kind,id,data);
  if(!silent)render(); // renderApp defers itself while you are typing or a dialog is open
  const prev=chains[path]||Promise.resolve();
  const p=prev.catch(()=>{}).then(async()=>{const {error}=await S.db.from("entries").upsert({user_id:S.uid,kind,id,data,updated_at:new Date().toISOString()},{onConflict:"user_id,kind,id"});if(error)throw error});
  chains[path]=p;p.catch(e=>e&&toast(errMsg(e)));return p;
}
export async function writeMany(items){
  // items: [{kind,id,data}] — one request per 200 rows
  items.forEach(it=>applyRow(it.kind,it.id,clean(it.data)));
  for(let i=0;i<items.length;i+=200){
    const chunk=items.slice(i,i+200).map(it=>({user_id:S.uid,kind:it.kind,id:it.id,data:clean(it.data),updated_at:new Date().toISOString()}));
    const {error}=await S.db.from("entries").upsert(chunk,{onConflict:"user_id,kind,id"});if(error)throw error;
  }
  render();
}
export function remove(path){
  if(!S.db)return Promise.reject();
  const [kind,id]=path.split("/");dropRow(kind,id);render();
  const prev=chains[path]||Promise.resolve();
  const p=prev.catch(()=>{}).then(async()=>{const {error}=await S.db.from("entries").delete().eq("kind",kind).eq("id",id);if(error)throw error});
  chains[path]=p;p.catch(e=>toast(errMsg(e)));return p;
}
export async function loadAll(){
  const rows=[];let from=0;
  for(;;){const {data,error}=await S.db.from("entries").select("kind,id,data").range(from,from+999);if(error)throw error;rows.push(...(data||[]));if(!data||data.length<1000)break;from+=1000}
  S.trades=[];S.days={};S.setups=[];S.watch=[];S.accounts=[];S.txns=[];S.instruments=[];
  const later=[];
  rows.forEach(r=>{if(r.kind==="trades")later.push(r);else applyRow(r.kind,r.id,r.data||{})});
  later.forEach(r=>applyRow(r.kind,r.id,r.data||{}));
  await ensureDefaultAccount();
}
// v1 data has no accounts: create one from the old Account settings so nothing is lost.
async function ensureDefaultAccount(){
  if(S.accounts.length)return;
  const c=S.cfg;
  const acct={name:"My account",broker:"",type:"live",currency:c.currency||"$",startBalance:c.accountSize||0,startDate:firstTradeDate()||ymd(new Date()),
    riskPct:c.riskPct??1,riskBasis:"current",riskMode:"pct",dailyLossAmt:c.maxDailyLoss||null,weeklyLossPct:null,maxConsecLosses:null,maxTradesDay:null,minRR:null,beThresholdR:0.1,defaultMult:c.defaultMult||1,created:Date.now()};
  await write("accounts/main",acct,{silent:true});
  if(!S.cfg.activeAccount)write("config/main",{...S.cfg,activeAccount:"main"},{silent:true});
}
function firstTradeDate(){return S.trades.map(t=>t.date).filter(Boolean).sort()[0]}

/* ---------- accounts ---------- */
export const acctOf=t=>t.accountId||"main";
export function account(id){return S.accounts.find(a=>a.id===id)}
export function activeAccounts(){return S.accounts.filter(a=>!a.archived).sort((a,b)=>(a.created||0)-(b.created||0))}
export function defaultAccountId(){
  if(S.f.account!=="all"&&account(S.f.account))return S.f.account;
  if(S.cfg.activeAccount&&account(S.cfg.activeAccount)&&!account(S.cfg.activeAccount).archived)return S.cfg.activeAccount;
  return (activeAccounts()[0]||S.accounts[0]||{}).id||"main";
}
export function typeLabel(t){return (ACCOUNT_TYPES.find(x=>x[0]===t)||[0,t||"Live"])[1]}
export const isProp=a=>a&&/challenge|funded/.test(a.type||"");
export function acctTrades(id){return S.trades.filter(t=>acctOf(t)===id)}
export function acctTxns(id){return S.txns.filter(x=>x.accountId===id)}
// Balance after everything strictly before `date` (or up to and including when inclusive)
export function balanceAt(a,date,inclusive=false){
  if(!a)return 0;let b=a.startBalance||0;
  const ok=d=>!date||(inclusive?d<=date:d<date);
  acctTxns(a.id).forEach(x=>{if(ok(x.date||""))b+=x.type==="deposit"?(x.amount||0):-(x.amount||0)});
  acctTrades(a.id).forEach(t=>{const ed=t.exitDate||t.date||"";if(t._c.closed&&ok(ed))b+=t._c.pnl});
  return b;
}
export function netDeposits(a){return acctTxns(a.id).reduce((s,x)=>s+(x.type==="deposit"?(x.amount||0):0),0)}
export function netWithdrawals(a){return acctTxns(a.id).reduce((s,x)=>s+(x.type!=="deposit"?(x.amount||0):0),0)}
export function tradingPnl(a){return acctTrades(a.id).filter(t=>t._c.closed).reduce((s,t)=>s+t._c.pnl,0)}
export function riskBase(a,date){return a.riskBasis==="start"?(a.startBalance||0):balanceAt(a,date)}
export function riskAmount(a,date){
  if(!a)return null;
  if(a.riskMode==="amount")return a.riskAmount||null;
  const base=riskBase(a,date||ymd(new Date()));
  return base&&a.riskPct?base*a.riskPct/100:null;
}
export function dailyLimit(a){if(!a)return null;if(a.dailyLossAmt)return a.dailyLossAmt;if(a.dailyLossPct)return (a.startBalance||0)*a.dailyLossPct/100;return null}
export function weeklyLimit(a){if(!a||!a.weeklyLossPct)return null;return (a.startBalance||0)*a.weeklyLossPct/100}

/* ---------- trade math ---------- */
export function instrumentFor(sym){if(!sym)return null;const s=String(sym).toUpperCase();return S.instruments.find(i=>(i.symbol||"").toUpperCase()===s)||null}
export function calc(t){
  const m=t.mult||1,q=t.qty||0,dir=t.side==="Short"?-1:1;let pnl=null;
  if(t.pnlOverride!=null)pnl=t.pnlOverride;
  else if(t.exit!=null&&t.entry!=null&&q)pnl=dir*(t.exit-t.entry)*q*m-(t.fees||0);
  const risk=(t.stop!=null&&t.entry!=null&&q&&t.stop!==t.entry)?Math.abs(t.entry-t.stop)*q*m:null;
  const r=(pnl!=null&&risk)?pnl/risk:null;
  const pips=(t.pipSize&&t.exit!=null&&t.entry!=null)?dir*(t.exit-t.entry)/t.pipSize:null;
  const tg=targetsOf(t);
  const plannedRR=(tg.length&&t.entry!=null&&t.stop!=null&&t.entry!==t.stop)?tg.reduce((s,x)=>s+(Math.abs(x.price-t.entry)/Math.abs(t.entry-t.stop))*(x.pct/100),0):null;
  const a=account(acctOf(t));const be=(a&&a.beThresholdR!=null)?a.beThresholdR:0.1;
  let outcome=null;
  if(pnl!=null){if(r!=null)outcome=Math.abs(r)<=be?"BE":r>0?"W":"L";else outcome=pnl>0?"W":pnl<0?"L":"BE"}
  const hold=minutesBetween(t.date,t.time,t.exitDate||t.date,t.exitTime);
  const hitTarget=(tg.length&&t.exit!=null)?(dir*(t.exit-tg[0].price)>=0):null;
  return {pnl,r,risk,pips,plannedRR,outcome,hold,hitTarget,closed:pnl!=null};
}
export function targetsOf(t){
  if(Array.isArray(t.targets)&&t.targets.length){const v=t.targets.filter(x=>x&&x.price!=null);const tot=v.reduce((s,x)=>s+(x.pct||0),0)||100;return v.map(x=>({price:x.price,pct:(x.pct||0)/tot*100||100/v.length}))}
  return t.target!=null?[{price:t.target,pct:100}]:[];
}
export function minRRFor(t){
  const st=S.setups.find(s=>s.name&&s.name===t.setup);if(st&&st.targetRR)return st.targetRR;
  const a=account(acctOf(t));return a&&a.minRR?a.minRR:null;
}
// Position size from risk amount and stop distance, rounded down to the instrument's step.
export function sizeFor({riskAmt,entry,stop,mult=1,step=1}){
  if(!riskAmt||entry==null||stop==null||entry===stop)return null;
  const perUnit=Math.abs(entry-stop)*(mult||1);const raw=riskAmt/perUnit;
  const st=step>0?step:1;const units=Math.floor(raw/st+1e-9)*st;
  return {units:+units.toFixed(6),raw,perUnit,actualRisk:units*perUnit};
}
export function stepDecimals(step){const s=String(step||1);return s.includes(".")?s.split(".")[1].length:0}

/* ---------- filtering ---------- */
export function periodRange(p,from,to){
  const now=new Date(),t=ymd(now);
  if(p==="today")return [t,t];
  if(p==="week")return [weekStart(t),t];
  if(p==="month")return [t.slice(0,7)+"-01",t];
  if(p==="30")return [addDays(t,-30),t];
  if(p==="90")return [addDays(t,-90),t];
  if(p==="year")return [t.slice(0,4)+"-01-01",t];
  if(p==="custom")return [from||"0000",to||"9999"];
  return ["0000","9999"];
}
export function filtered(opts={}){
  const f=S.f;const [a,b]=periodRange(f.period,f.from,f.to);const q=(f.q||"").trim().toLowerCase();
  return S.trades.filter(t=>{
    if(f.account!=="all"&&acctOf(t)!==f.account)return false;
    if(f.account==="all"&&!opts.includeArchived){const ac=account(acctOf(t));if(ac&&ac.archived)return false;if(ac&&ac.type==="demo"&&!S.cfg.includeDemo)return false}
    if(!opts.ignorePeriod&&(t.date<a||t.date>b))return false;
    if(f.setup&&t.setup!==f.setup)return false;
    if(f.symbol&&(t.symbol||"")!==f.symbol)return false;
    if(f.side&&t.side!==f.side)return false;
    if(f.source&&(t.source||"Own")!==f.source)return false;
    if(opts.trades){
      if(f.result==="win"&&t._c.outcome!=="W")return false;
      if(f.result==="loss"&&t._c.outcome!=="L")return false;
      if(f.result==="be"&&t._c.outcome!=="BE")return false;
      if(f.result==="open"&&t._c.closed)return false;
      if(f.result==="mistake"&&!(t.mistakes||[]).length)return false;
      if(q&&!((t.symbol||"").toLowerCase().includes(q)||(t.notes||"").toLowerCase().includes(q)||(t.provider||"").toLowerCase().includes(q)))return false;
      if(f.drill&&!f.drill.fn(t))return false;
    }
    return true;
  });
}
export function setupNames(){return [...new Set([...S.setups.map(s=>s.name),...S.trades.map(t=>t.setup)].filter(Boolean))].sort()}
export function symbolNames(){return [...new Set(S.trades.map(t=>t.symbol).filter(Boolean))].sort()}
export function filterCurrency(){const a=S.f.account!=="all"?account(S.f.account):null;if(a)return cur(a);const cs=[...new Set(activeAccounts().map(cur))];return cs.length===1?cs[0]:(S.cfg.currency||"$")}

/* ---------- sessions ---------- */
// Entry hour (local clock as typed) to session. Approximate, based on New York-centred clocks are not assumed: uses UTC offset of the entry if known.
export function sessionOf(time){
  if(!time)return null;const h=+time.slice(0,2);
  const off=S.cfg.sessionOffset??0;const u=((h-off)%24+24)%24; // hour in UTC
  if(u>=0&&u<7)return "Asia";if(u>=7&&u<12)return "London";if(u>=12&&u<16)return "London/NY overlap";if(u>=16&&u<21)return "New York";return "After hours";
}

/* ---------- stats engine ---------- */
export function groupBy(list,keyFn){const m=new Map();list.forEach(t=>{const k=keyFn(t);(Array.isArray(k)?k:[k]).forEach(x=>{if(x==null||x==="")return;if(!m.has(x))m.set(x,[]);m.get(x).push(t)})});return m}
export function computeStats(list){
  const c=list.filter(t=>t._c.closed).sort((a,b)=>tkey(a).localeCompare(tkey(b)));
  const W=c.filter(t=>t._c.outcome==="W"),L=c.filter(t=>t._c.outcome==="L"),B=c.filter(t=>t._c.outcome==="BE");
  const pos=c.filter(t=>t._c.pnl>0),neg=c.filter(t=>t._c.pnl<0);
  const gw=pos.reduce((s,t)=>s+t._c.pnl,0),gl=-neg.reduce((s,t)=>s+t._c.pnl,0);const net=gw-gl;
  const fees=c.reduce((s,t)=>s+(t.fees||0),0);
  const withR=c.filter(t=>t._c.r!=null);
  let eq=0,peak=0,dd=0,ddPeakDate=null,lastHighDate=null;
  const curve=c.map(t=>{eq+=t._c.pnl;if(eq>=peak){peak=eq;lastHighDate=t.exitDate||t.date}const d=peak-eq;if(d>dd){dd=d;ddPeakDate=t.date}return {d:t.exitDate||t.date,v:eq,dd:-(peak-eq),t}});
  // daily
  const byDay=new Map();c.forEach(t=>{const d=t.exitDate||t.date;byDay.set(d,(byDay.get(d)||0)+t._c.pnl)});
  const days=[...byDay].sort((a,b)=>a[0].localeCompare(b[0]));
  const dvals=days.map(d=>d[1]);const green=dvals.filter(v=>v>0).length,red=dvals.filter(v=>v<0).length;
  const mean=dvals.length?dvals.reduce((s,v)=>s+v,0)/dvals.length:null;
  const sd=dvals.length>1?Math.sqrt(dvals.reduce((s,v)=>s+(v-mean)**2,0)/(dvals.length-1)):null;
  const sharpe=(sd&&mean!=null)?mean/sd*Math.sqrt(252):null;
  const bestDay=days.length?days.reduce((a,b)=>b[1]>a[1]?b:a):null,worstDay=days.length?days.reduce((a,b)=>b[1]<a[1]?b:a):null;
  const consistency=(bestDay&&net>0)?bestDay[1]/net:null;
  // streaks
  const streak=(arr,isWin)=>{let best=0,run=0;arr.forEach(x=>{if(isWin(x)){run++;best=Math.max(best,run)}else run=0});return best};
  const outs=c.filter(t=>t._c.outcome!=="BE");
  const maxWinStreak=streak(outs,t=>t._c.outcome==="W"),maxLossStreak=streak(outs,t=>t._c.outcome==="L");
  let curStreak=0,curType=null;for(let i=outs.length-1;i>=0;i--){const o=outs[i]._c.outcome;if(curType==null)curType=o;if(o===curType)curStreak++;else break}
  const dayWinStreak=streak(dvals,v=>v>0),dayLossStreak=streak(dvals,v=>v<0);
  const holds=c.map(t=>t._c.hold).filter(v=>v!=null);const holdsW=pos.map(t=>t._c.hold).filter(v=>v!=null),holdsL=neg.map(t=>t._c.hold).filter(v=>v!=null);
  const avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
  const planned=c.filter(t=>t.followedPlan!=null);
  const withPlanRR=c.filter(t=>t._c.plannedRR!=null);
  const tgt=c.filter(t=>t._c.hitTarget!=null);
  const pips=c.filter(t=>t._c.pips!=null);
  return {c,n:c.length,w:W.length,l:L.length,be:B.length,net,gw,gl,fees,
    pf:gl?gw/gl:(gw?Infinity:null),
    wr:(W.length+L.length)?W.length/(W.length+L.length):null, wrAll:c.length?W.length/c.length:null,
    avgW:pos.length?gw/pos.length:null,avgL:neg.length?-gl/neg.length:null,
    exp:c.length?net/c.length:null,avgR:withR.length?withR.reduce((s,t)=>s+t._c.r,0)/withR.length:null,sumR:withR.reduce((s,t)=>s+t._c.r,0),
    best:c.length?Math.max(...c.map(t=>t._c.pnl)):null,worst:c.length?Math.min(...c.map(t=>t._c.pnl)):null,
    dd,curve,withR,recovery:dd?net/dd:null,lastHighDate,curDD:peak-eq,
    days,green,red,dayWr:(green+red)?green/(green+red):null,bestDay,worstDay,consistency,sharpe,sdDay:sd,meanDay:mean,
    maxWinStreak,maxLossStreak,curStreak,curType,dayWinStreak,dayLossStreak,
    avgHold:avg(holds),avgHoldW:avg(holdsW),avgHoldL:avg(holdsL),
    plan:planned.length?planned.filter(t=>t.followedPlan).length/planned.length:null,
    avgPlannedRR:withPlanRR.length?avg(withPlanRR.map(t=>t._c.plannedRR)):null,
    hitRate:tgt.length?tgt.filter(t=>t._c.hitTarget).length/tgt.length:null,
    pips:pips.length?pips.reduce((s,t)=>s+t._c.pips,0):null,
    longs:c.filter(t=>t.side!=="Short"),shorts:c.filter(t=>t.side==="Short")};
}
// nth trade of its day (1-based) for overtrading analysis
export function tradeIndexMap(list){const m=new Map();const g=groupBy(list,t=>t.date);g.forEach(arr=>arr.sort((a,b)=>tkey(a).localeCompare(tkey(b))).forEach((t,i)=>m.set(t.id,i+1)));return m}

/* ---------- guardrails ---------- */
export function guardrails(a,date){
  if(!a)return null;
  const ts=acctTrades(a.id).filter(t=>t._c.closed);
  const day=ts.filter(t=>(t.exitDate||t.date)===date);
  const dayNet=day.reduce((s,t)=>s+t._c.pnl,0);
  const ws=weekStart(date);const week=ts.filter(t=>{const d=t.exitDate||t.date;return d>=ws&&d<=date});
  const weekNet=week.reduce((s,t)=>s+t._c.pnl,0);
  const seq=week.slice().sort((x,y)=>tkey(x).localeCompare(tkey(y))).filter(t=>t._c.outcome!=="BE");
  let consec=0;for(let i=seq.length-1;i>=0;i--){if(seq[i]._c.outcome==="L")consec++;else break}
  const dl=dailyLimit(a),wl=weeklyLimit(a);
  const tradesToday=S.trades.filter(t=>acctOf(t)===a.id&&t.date===date).length;
  const out={dayNet,weekNet,consec,tradesToday,dl,wl,
    dayHit:dl?(-dayNet>=dl):false, weekHit:wl?(-weekNet>=wl):false,
    consecHit:a.maxConsecLosses?consec>=a.maxConsecLosses:false,
    tradesHit:a.maxTradesDay?tradesToday>=a.maxTradesDay:false};
  out.riskLeftToday=dl?Math.max(0,dl+Math.min(0,dayNet)):null;
  out.locked=out.dayHit||out.weekHit||out.consecHit;
  return out;
}

/* ---------- prop firm progress ---------- */
export function propRules(a){
  if(!a||!a.prop)return null;const p=a.prop,st=a.startBalance||0;
  const amt=(k)=>p[k+"Amt"]!=null&&p[k+"Amt"]!==""?+p[k+"Amt"]:(p[k+"Pct"]!=null&&p[k+"Pct"]!==""?st*p[k+"Pct"]/100:null);
  return {target:amt("profitTarget"),daily:amt("maxDailyLoss"),total:amt("maxTotalLoss"),ddType:p.ddType||"static",minDays:p.minDays||0,timeLimitDays:p.timeLimitDays||null,consistencyPct:p.consistencyPct||null,profitSplit:p.profitSplit||null};
}
export function propProgress(a,date=ymd(new Date())){
  const R=propRules(a);if(!R)return null;const st=a.startBalance||0;
  const ts=acctTrades(a.id).filter(t=>t._c.closed).sort((x,y)=>((x.exitDate||x.date)+(x.exitTime||x.time||"")).localeCompare((y.exitDate||y.date)+(y.exitTime||y.time||"")));
  const bal=balanceAt(a,null);const profit=bal-st-netDeposits(a)+netWithdrawals(a);
  // high-water marks
  let b=st,hwmIntra=st;const eod=new Map();
  ts.forEach(t=>{b+=t._c.pnl;hwmIntra=Math.max(hwmIntra,b);eod.set(t.exitDate||t.date,b)});
  let hwmEod=st;eod.forEach(v=>hwmEod=Math.max(hwmEod,v));
  let floor=null;
  if(R.total!=null){
    if(R.ddType==="static")floor=st-R.total;
    else{const h=R.ddType==="trailing"?hwmIntra:hwmEod;floor=Math.min(h-R.total,st)}
  }
  const dayStart=balanceAt(a,date);const dayFloor=R.daily!=null?dayStart-R.daily:null;
  const daysTraded=new Set(ts.map(t=>t.date)).size;
  const byDay=new Map();ts.forEach(t=>{const d=t.exitDate||t.date;byDay.set(d,(byDay.get(d)||0)+t._c.pnl)});
  const best=[...byDay.values()].reduce((m,v)=>Math.max(m,v),0);
  const cons=(R.consistencyPct&&profit>0)?best/profit:null;
  const daysElapsed=a.startDate?Math.floor((parseD(date)-parseD(a.startDate))/864e5)+1:null;
  const flags=[];
  if(floor!=null&&bal<=floor)flags.push({lvl:"bad",t:"Max loss breached"});
  else if(floor!=null&&bal-floor<=(R.total||0)*0.25)flags.push({lvl:"warn",t:"Within 25% of max loss"});
  if(dayFloor!=null&&balanceAt(a,date,true)<=dayFloor)flags.push({lvl:"bad",t:"Daily loss breached today"});
  if(cons!=null&&cons>R.consistencyPct/100)flags.push({lvl:"warn",t:`Best day is ${pct(cons)} of profit (limit ${R.consistencyPct}%)`});
  if(R.timeLimitDays&&daysElapsed!=null&&daysElapsed>R.timeLimitDays)flags.push({lvl:"bad",t:"Time limit passed"});
  const passed=R.target!=null&&profit>=R.target&&daysTraded>=R.minDays&&!(cons!=null&&cons>R.consistencyPct/100);
  if(passed)flags.unshift({lvl:"ok",t:"Target reached: all objectives met"});
  return {R,bal,profit,floor,room:floor!=null?bal-floor:null,dayFloor,dayRoom:dayFloor!=null?balanceAt(a,date,true)-dayFloor:null,daysTraded,cons,best,daysElapsed,flags,passed,
    targetPct:R.target?Math.max(0,Math.min(1,profit/R.target)):null};
}

/* ---------- presets ---------- */
export async function loadFirms(){
  if(S.firms)return S.firms;
  try{const r=await fetch("prop-firms.json",{cache:"no-cache"});S.firms=await r.json()}catch{S.firms={firms:[],verified:null}}
  return S.firms;
}
export function firmsStale(){if(!S.firms||!S.firms.verified)return true;return (Date.now()-parseD(S.firms.verified))/864e5>(S.firms.recheckDays||45)}
