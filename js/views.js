// Screen renderers. Each view returns HTML; bind[view]() wires view-local inputs.
import {S,$,$$,esc,money,shortMoney,rfmt,pct,num,cls,prettyDate,ymd,addDays,parseD,weekStart,DOW,MISTAKES,NO_TRADE_REASONS,
  filtered,computeStats,groupBy,tradeIndexMap,sessionOf,setupNames,symbolNames,filterCurrency,account,activeAccounts,acctOf,
  typeLabel,isProp,cur,balanceAt,netDeposits,netWithdrawals,tradingPnl,riskAmount,guardrails,propProgress,propRules,
  defaultAccountId,acctTrades,acctTxns,tkey,fmtDur,write,render,firmsStale,instrumentFor,sizeFor,stepDecimals,dailyLimit,weeklyLimit} from "./core.js";
import {equityChart,signedBars,rHist,weekdayItems,spark,bar} from "./charts.js";

export const drills=new Map();
let drillSeq=0;
function drill(label,fn){const id="d"+(++drillSeq);drills.set(id,{label,fn});return id}

/* ---------- shared pieces ---------- */
export function filterBar({period=true,more=true}={}){
  const f=S.f;const per=[["all","All time"],["today","Today"],["week","This week"],["month","This month"],["30","30 days"],["90","90 days"],["year","This year"],["custom","Custom"]];
  return `<div class="filters" role="group" aria-label="Filters">
    ${period?`<select id="fPer" aria-label="Period">${per.map(([v,l])=>`<option value="${v}" ${f.period===v?"selected":""}>${l}</option>`).join("")}</select>
    ${f.period==="custom"?`<input type="date" id="fFrom" value="${esc(f.from)}" aria-label="From"><input type="date" id="fTo" value="${esc(f.to)}" aria-label="To">`:""}`:""}
    ${more?`<select id="fSetup" aria-label="Setup"><option value="">All setups</option>${setupNames().map(n=>`<option ${f.setup===n?"selected":""}>${esc(n)}</option>`).join("")}</select>
    <select id="fSym" aria-label="Symbol"><option value="">All symbols</option>${symbolNames().map(n=>`<option ${f.symbol===n?"selected":""}>${esc(n)}</option>`).join("")}</select>
    <select id="fSide" aria-label="Side"><option value="">Long &amp; short</option><option ${f.side==="Long"?"selected":""}>Long</option><option ${f.side==="Short"?"selected":""}>Short</option></select>
    <select id="fSrc" aria-label="Source"><option value="">All sources</option><option value="Own" ${f.source==="Own"?"selected":""}>Own analysis</option><option value="Signal" ${f.source==="Signal"?"selected":""}>Signals</option></select>`:""}
    ${(f.setup||f.symbol||f.side||f.source||f.period!=="all")?`<button class="ghost" data-act="clearFilters">Clear</button>`:""}
  </div>`;
}
function bindFilters(){
  const on=(id,k)=>{const el=$(id);if(el)el.onchange=()=>{S.f[k]=el.value;render(true)}};
  on("#fPer","period");on("#fFrom","from");on("#fTo","to");on("#fSetup","setup");on("#fSym","symbol");on("#fSide","side");on("#fSrc","source");
}
function kpi(label,value,sub,klass=""){return `<div class="kpi"><span class="eyebrow">${label}</span><b class="${klass}">${value}</b>${sub?`<small>${sub}</small>`:""}</div>`}
function scopeLabel(){const a=S.f.account!=="all"?account(S.f.account):null;return a?esc(a.name):"All accounts"}
function emptyPanel(title,text,btn){return `<div class="panel"><div class="empty"><h2>${title}</h2><p>${text}</p>${btn||""}</div></div>`}
export function tradeRow(t){
  const c=t._c;const a=account(acctOf(t));const cc=cur(a);
  return `<div class="trow" data-trade="${esc(t.id)}" tabindex="0" role="button">
    <span class="side ${t.side==="Short"?"S":"L"}">${t.side==="Short"?"SHORT":"LONG"}</span>
    <div style="min-width:0"><b>${esc(t.symbol||"—")}</b> <span class="muted">${esc(t.setup||"")}${t.time?" · "+esc(t.time):""}</span>
      ${t.grade?` <span class="pill info">${esc(t.grade)}</span>`:""}${c.outcome==="BE"?` <span class="pill flat">BE</span>`:""}${t.source==="Signal"?` <span class="pill flat">Signal</span>`:""}${(t.mistakes||[]).length?` <span class="pill warn">${t.mistakes.length} mistake${t.mistakes.length>1?"s":""}</span>`:""}
      ${S.f.account==="all"&&activeAccounts().length>1&&a?`<div class="muted" style="font-size:12px">${esc(a.name)}</div>`:""}</div>
    <div style="text-align:right"><div class="num ${cls(c.pnl)}" style="font-weight:600">${c.closed?money(c.pnl,true,cc):`<span class="pill flat">Open</span>`}</div><div class="num muted" style="font-size:12px">${rfmt(c.r)}${c.pips!=null?` · ${c.pips>0?"+":""}${c.pips.toFixed(1)}p`:""}</div></div>
  </div>`;
}
function statTable(rows,label,c,{drillKey}={}){
  return `<div class="tbl-wrap"><table><thead><tr><th>${label}</th><th class="n">Trades</th><th class="n">Win %</th><th class="n">Avg R</th><th class="n">Net</th></tr></thead><tbody>
  ${rows.map(([k,s,fn])=>`<tr ${fn?`class="click" data-drill="${drill(label+": "+k,fn)}" tabindex="0"`:""}><td>${esc(k)}</td><td class="n">${s.n}</td><td class="n">${pct(s.wr)}</td><td class="n ${cls(s.avgR)}">${rfmt(s.avgR)}</td><td class="n ${cls(s.net)}" style="font-weight:600">${money(s.net,true,c)}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function breakdown(list,keyFn,label,c,sortFn){
  const g=[...groupBy(list,keyFn)].map(([k,v])=>[k,computeStats(v),t=>{const kk=keyFn(t);return Array.isArray(kk)?kk.includes(k):kk===k}]);
  g.sort(sortFn||((a,b)=>b[1].net-a[1].net));
  return g.length?statTable(g,label,c):`<div class="empty sm">Not enough data yet.</div>`;
}

/* ---------- DASHBOARD ---------- */
function insights(st,list,c){
  const out=[];if(st.n<5)return out;
  const wd=weekdayItems(st.c).filter(x=>x.label!=="Wknd");const worst=wd.reduce((a,b)=>b.v<a.v?b:a,wd[0]);const best=wd.reduce((a,b)=>b.v>a.v?b:a,wd[0]);
  if(worst&&worst.v<0)out.push({t:`${worst.label} is your weakest day (${shortMoney(worst.v,c)}).`,lvl:"warn"});
  if(best&&best.v>0)out.push({t:`${best.label} is your best day (${shortMoney(best.v,c)}).`,lvl:"ok"});
  const idx=tradeIndexMap(st.c);const late=st.c.filter(t=>idx.get(t.id)>=3);if(late.length>=3){const s=computeStats(late);if(s.net<0)out.push({t:`Your 3rd+ trade of the day loses money on average (${money(s.exp,true,c)} per trade). Consider a 2-trade cap.`,lvl:"warn"})}
  const mis=st.c.filter(t=>(t.mistakes||[]).length);if(mis.length){const s=computeStats(mis);if(s.net<0)out.push({t:`Trades with a mistake tag cost you ${money(s.net,true,c)} in total.`,lvl:"warn"})}
  const broke=st.c.filter(t=>t.followedPlan===false),kept=st.c.filter(t=>t.followedPlan===true);
  if(broke.length>=2&&kept.length>=2){const a=computeStats(kept),b=computeStats(broke);out.push({t:`Plan kept: ${rfmt(a.avgR)} avg. Plan broken: ${rfmt(b.avgR)} avg.`,lvl:a.avgR>b.avgR?"ok":"warn"})}
  const sig=st.c.filter(t=>t.source==="Signal"),own=st.c.filter(t=>(t.source||"Own")==="Own");
  if(sig.length>=3&&own.length>=3){const a=computeStats(own),b=computeStats(sig);out.push({t:`Own analysis nets ${money(a.exp,true,c)} per trade; signals net ${money(b.exp,true,c)}.`,lvl:a.exp>=b.exp?"ok":"warn"})}
  if(st.avgHoldW!=null&&st.avgHoldL!=null&&st.avgHoldL>st.avgHoldW*1.5)out.push({t:`You hold losers ${fmtDur(st.avgHoldL)} vs winners ${fmtDur(st.avgHoldW)}. Cut losers sooner.`,lvl:"warn"});
  if(st.hitRate!=null&&st.hitRate<0.3&&st.avgPlannedRR>1.5)out.push({t:`Only ${pct(st.hitRate)} of trades reach target. Your targets may be too far.`,lvl:"warn"});
  if(st.consistency!=null&&st.consistency>0.4)out.push({t:`Your best day is ${pct(st.consistency)} of total profit. Results lean on one day.`,lvl:"warn"});
  return out.slice(0,6);
}
export function vDashboard(){
  const list=filtered();const st=computeStats(list);const c=filterCurrency();
  const accts=S.f.account==="all"?activeAccounts():[account(S.f.account)].filter(Boolean);
  const head=feedbackBanner()+`<div class="spread"><div><div class="eyebrow">${scopeLabel()}</div><h1>Dashboard</h1></div><div class="row">${`<button class="primary" data-act="addTrade">+ Log trade</button>`}</div></div>${filterBar()}`;
  const acctCards=accountStrip(accts);
  if(!st.n)return head+acctCards+emptyPanel("No closed trades in this view","Log a trade or widen the filters. Every chart and number on this page fills in from your trades.",`<button class="primary" data-act="addTrade">+ Log trade</button>`);
  const months=[...groupBy(st.c,t=>(t.exitDate||t.date).slice(0,7))].sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>({label:parseD(k+"-01").toLocaleDateString(undefined,{month:"short",year:"2-digit"}),v:v.reduce((s,t)=>s+t._c.pnl,0)}));
  const idx=tradeIndexMap(list);
  const mis=[...groupBy(st.c,t=>t.mistakes||[])].map(([k,v])=>[k,v.length,v.reduce((s,t)=>s+t._c.pnl,0)]).sort((a,b)=>a[2]-b[2]);
  const mistCost=mis.reduce((s,m)=>s+Math.min(0,m[2]),0);
  const ins=insights(st,list,c);
  const L=computeStats(st.longs),Sh=computeStats(st.shorts);
  // psychology joins with day journal
  const dayRows=st.days.map(([d,v])=>({d,v,j:S.days[d]||{}}));
  const avgBy=(key,vals)=>vals.map(val=>{const r=dayRows.filter(x=>x.j[key]===val);return [val,r.length,r.length?r.reduce((s,x)=>s+x.v,0)/r.length:null]}).filter(x=>x[1]);
  const moodRows=avgBy("mood",[1,2,3,4,5]);
  const discRows=[["1–4",dayRows.filter(x=>x.j.discipline&&x.j.discipline<=4)],["5–7",dayRows.filter(x=>x.j.discipline>=5&&x.j.discipline<=7)],["8–10",dayRows.filter(x=>x.j.discipline>=8)]].map(([k,r])=>[k,r.length,r.length?r.reduce((s,x)=>s+x.v,0)/r.length:null]).filter(x=>x[1]);
  const sleepRows=[["< 6h",dayRows.filter(x=>x.j.sleep!=null&&x.j.sleep<6)],["6–7.5h",dayRows.filter(x=>x.j.sleep>=6&&x.j.sleep<7.5)],["7.5h+",dayRows.filter(x=>x.j.sleep>=7.5)]].map(([k,r])=>[k,r.length,r.length?r.reduce((s,x)=>s+x.v,0)/r.length:null]).filter(x=>x[1]);
  const psyTbl=(title,rows)=>rows.length?`<div><div class="eyebrow" style="margin-bottom:6px">${title}</div><div class="tbl-wrap"><table><thead><tr><th></th><th class="n">Days</th><th class="n">Avg day P&amp;L</th></tr></thead><tbody>${rows.map(([k,n,v])=>`<tr><td>${esc(k)}</td><td class="n">${n}</td><td class="n ${cls(v)}">${money(v,true,c)}</td></tr>`).join("")}</tbody></table></div></div>`:"";
  const revenge=st.c.filter((t,i)=>{if(!i)return false;const p=st.c[i-1];if(p.date!==t.date||p._c.outcome!=="L")return false;const m=(new Date(t.date+"T"+(t.time||"00:00"))-new Date((p.exitDate||p.date)+"T"+(p.exitTime||p.time||"00:00")))/60000;return m>=0&&m<=15});
  const noTrade=Object.values(S.days).filter(d=>d.noTrade).length;
  return head+acctCards+`
  ${ins.length?`<div class="insights">${ins.map(i=>`<div class="insight ${i.lvl}">${esc(i.t)}</div>`).join("")}</div>`:""}
  <div class="kpis">
    ${kpi("Net P&amp;L",money(st.net,true,c),`${st.n} closed · fees ${money(st.fees,false,c)}`,cls(st.net))}
    ${kpi("Win rate",pct(st.wr),`${st.w}W · ${st.l}L · ${st.be} BE`)}
    ${kpi("Profit factor",st.pf==null?"—":st.pf===Infinity?"∞":st.pf.toFixed(2),`${money(st.gw,false,c)} / ${money(-st.gl,true,c)}`)}
    ${kpi("Expectancy",money(st.exp,true,c),`${rfmt(st.avgR)} avg · ${rfmt(st.sumR)} total`,cls(st.exp))}
    ${kpi("Avg win / loss",`<span class="gain">${money(st.avgW,false,c)}</span>`,`<span class="loss">${money(st.avgL,true,c)}</span>${st.avgW&&st.avgL?` · ${(st.avgW/-st.avgL).toFixed(2)}×`:""}`)}
    ${kpi("Max drawdown",st.dd?money(-st.dd,true,c):money(0,false,c),`Now ${money(-st.curDD,true,c)} · recovery ${st.recovery!=null?st.recovery.toFixed(2):"—"}`,st.dd?"loss":"")}
    ${kpi("Planned vs actual",`${st.avgPlannedRR!=null?st.avgPlannedRR.toFixed(2)+"R":"—"} → ${rfmt(st.avgR)}`,`Hit target ${pct(st.hitRate)}`)}
    ${kpi("Plan adherence",pct(st.plan),`Mistakes cost ${money(mistCost,true,c)}`,"")}
  </div>
  <div class="panel"><div class="spread"><h2>Equity &amp; drawdown</h2><span class="muted sm-t">Cumulative closed P&amp;L, trade by trade</span></div>${equityChart(st.curve,c)}</div>
  <div class="grid3">
    <div class="panel"><h2>Consistency</h2><dl class="dl">
      <dt>Green / red days</dt><dd><span class="gain">${st.green}</span> / <span class="loss">${st.red}</span> · ${pct(st.dayWr)}</dd>
      <dt>Best day</dt><dd class="gain">${st.bestDay?money(st.bestDay[1],true,c)+" · "+st.bestDay[0]:"—"}</dd>
      <dt>Worst day</dt><dd class="loss">${st.worstDay?money(st.worstDay[1],true,c)+" · "+st.worstDay[0]:"—"}</dd>
      <dt>Avg day / std dev</dt><dd>${money(st.meanDay,true,c)} / ${money(st.sdDay,false,c)}</dd>
      <dt>Sharpe (daily, annualised)</dt><dd>${num(st.sharpe)}</dd>
      <dt>Best day share of profit</dt><dd>${pct(st.consistency)}</dd>
      <dt>Last equity high</dt><dd>${esc(st.lastHighDate||"—")}</dd>
    </dl></div>
    <div class="panel"><h2>Streaks &amp; timing</h2><dl class="dl">
      <dt>Current streak</dt><dd class="${st.curType==="W"?"gain":st.curType==="L"?"loss":""}">${st.curStreak?st.curStreak+" "+(st.curType==="W"?"wins":"losses"):"—"}</dd>
      <dt>Longest win / loss run</dt><dd><span class="gain">${st.maxWinStreak}</span> / <span class="loss">${st.maxLossStreak}</span> trades</dd>
      <dt>Green / red day runs</dt><dd><span class="gain">${st.dayWinStreak}</span> / <span class="loss">${st.dayLossStreak}</span> days</dd>
      <dt>Avg hold</dt><dd>${fmtDur(st.avgHold)}</dd>
      <dt>Hold: winners / losers</dt><dd>${fmtDur(st.avgHoldW)} / ${fmtDur(st.avgHoldL)}</dd>
      <dt>Pips (forex)</dt><dd class="${cls(st.pips)}">${st.pips!=null?(st.pips>0?"+":"")+st.pips.toFixed(1):"—"}</dd>
      <dt>No-trade days logged</dt><dd>${noTrade}</dd>
    </dl></div>
    <div class="panel"><h2>Long vs short</h2><dl class="dl">
      <dt>Long</dt><dd class="${cls(L.net)}">${money(L.net,true,c)} · ${L.n} · ${pct(L.wr)}</dd>
      <dt>Short</dt><dd class="${cls(Sh.net)}">${money(Sh.net,true,c)} · ${Sh.n} · ${pct(Sh.wr)}</dd>
      <dt>Largest win</dt><dd class="gain">${money(st.best,true,c)}</dd>
      <dt>Largest loss</dt><dd class="loss">${money(st.worst,true,c)}</dd>
      <dt>Revenge trades</dt><dd class="${revenge.length?"loss":""}">${revenge.length} <span class="muted">(within 15m of a loss)</span></dd>
      <dt>Breakeven rate</dt><dd>${pct(st.n?st.be/st.n:null)}</dd>
      <dt>Win rate incl. BE</dt><dd>${pct(st.wrAll)}</dd>
    </dl></div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>Monthly P&amp;L</h2>${signedBars(months,c)}</div>
    <div class="panel"><h2>By weekday</h2>${signedBars(weekdayItems(st.c),c)}</div>
  </div>
  <div class="grid2">
    <div class="panel"><h2>R-multiple distribution</h2>${rHist(st.withR)}</div>
    <div class="panel"><h2>Mistakes</h2>${mis.length?`<div class="tbl-wrap"><table><thead><tr><th>Mistake</th><th class="n">Times</th><th class="n">Net on those trades</th></tr></thead><tbody>${mis.map(([k,n,p])=>`<tr class="click" data-drill="${drill("Mistake: "+k,t=>(t.mistakes||[]).includes(k))}" tabindex="0"><td>${esc(k)}</td><td class="n">${n}</td><td class="n ${cls(p)}" style="font-weight:600">${money(p,true,c)}</td></tr>`).join("")}</tbody></table></div>`:`<div class="empty sm">No mistakes tagged in this view.</div>`}</div>
  </div>
  <h2 class="section">Breakdowns <span class="muted sm-t">Tap a row to see its trades</span></h2>
  <div class="grid2">
    <div class="panel"><h3>By setup</h3>${breakdown(st.c,t=>t.setup||"Unlabeled","Setup",c)}</div>
    <div class="panel"><h3>By symbol</h3>${breakdown(st.c,t=>t.symbol,"Symbol",c)}</div>
    <div class="panel"><h3>By session</h3>${breakdown(st.c,t=>sessionOf(t.time),"Session",c)}</div>
    <div class="panel"><h3>By entry hour</h3>${breakdown(st.c,t=>t.time?t.time.slice(0,2)+":00":null,"Hour",c,(a,b)=>a[0].localeCompare(b[0]))}</div>
    <div class="panel"><h3>By trade # in the day</h3>${breakdown(st.c,t=>{const i=idx.get(t.id);return i?(i>=4?"4th+":["","1st","2nd","3rd"][i]):null},"Trade #",c,(a,b)=>a[0].localeCompare(b[0]))}</div>
    <div class="panel"><h3>By grade</h3>${breakdown(st.c,t=>t.grade,"Grade",c,(a,b)=>a[0].localeCompare(b[0]))}</div>
    <div class="panel"><h3>By emotion at entry</h3>${breakdown(st.c,t=>t.emotion,"Emotion",c)}</div>
    <div class="panel"><h3>Plan kept vs broken</h3>${breakdown(st.c,t=>t.followedPlan===true?"Kept":t.followedPlan===false?"Broken":null,"Plan",c)}</div>
    <div class="panel"><h3>Own analysis vs signals</h3>${breakdown(st.c,t=>t.source==="Signal"?("Signal"+(t.provider?": "+t.provider:"")):"Own analysis","Source",c)}</div>
    ${S.f.account==="all"&&accts.length>1?`<div class="panel"><h3>By account</h3>${breakdown(st.c,t=>(account(acctOf(t))||{}).name||"Unknown","Account",c)}</div>`:`<div class="panel"><h3>By month</h3>${breakdown(st.c,t=>(t.exitDate||t.date).slice(0,7),"Month",c,(a,b)=>b[0].localeCompare(a[0]))}</div>`}
  </div>
  <h2 class="section">Mind &amp; discipline <span class="muted sm-t">From your daily journal</span></h2>
  <div class="panel">${(moodRows.length||discRows.length||sleepRows.length)?`<div class="grid3">${psyTbl("Mood (1–5)",moodRows.map(([k,n,v])=>[String(k),n,v]))}${psyTbl("Discipline score",discRows)}${psyTbl("Sleep",sleepRows)}</div>`:`<div class="empty sm">Fill in mood, sleep and discipline on the Today screen to see how they affect your P&amp;L.</div>`}</div>`;
}
function accountStrip(accts){
  if(!accts.length)return"";
  return `<div class="acct-strip">${accts.map(a=>{
    const bal=balanceAt(a,null);const c=cur(a);const pnl=tradingPnl(a);const pp=isProp(a)?propProgress(a):null;
    const eq=[];let b=0;acctTrades(a.id).filter(t=>t._c.closed).sort((x,y)=>tkey(x).localeCompare(tkey(y))).forEach(t=>{b+=t._c.pnl;eq.push(b)});
    return `<button class="acct-card" data-act="pickAccount" data-id="${esc(a.id)}">
      <div class="spread"><b>${esc(a.name)}</b><span class="pill ${isProp(a)?"warn":a.type==="demo"?"flat":"info"}">${esc(typeLabel(a.type))}</span></div>
      <div class="row" style="justify-content:space-between;align-items:flex-end"><div><div class="num big">${money(bal,false,c)}</div><div class="num sm-t ${cls(pnl)}">${money(pnl,true,c)} trading P&amp;L</div></div>${spark(eq)}</div>
      ${pp?`<div class="sm-t muted">Target ${pp.R.target!=null?pct(pp.targetPct):"—"} · room ${pp.room!=null?money(pp.room,false,c):"—"}</div>${bar(pp.targetPct,pp.flags.some(f=>f.lvl==="bad")?"over":"")}`:""}
    </button>`}).join("")}</div>`;
}
export const bind={};
bind.dashboard=bindFilters;

/* ---------- TODAY ---------- */
export function vToday(){
  const d=S.date,day=S.days[d]||{};const aid=defaultAccountId();const a=account(aid);const c=cur(a);
  const list=S.trades.filter(t=>t.date===d&&(S.f.account==="all"||acctOf(t)===S.f.account)).sort((x,y)=>tkey(x).localeCompare(tkey(y)));
  const closed=list.filter(t=>t._c.closed),net=closed.reduce((s,t)=>s+t._c.pnl,0);const wins=closed.filter(t=>t._c.outcome==="W").length,losses=closed.filter(t=>t._c.outcome==="L").length;
  const rsum=closed.reduce((s,t)=>s+(t._c.r||0),0);
  const g=guardrails(a,d);const risk=riskAmount(a,d);
  const rules=(S.cfg.rules||"").split("\n").map(s=>s.trim()).filter(Boolean);const checked=new Set(day.rules||[]);
  const isToday=d===ymd(new Date());
  const chipRow=(name,max,val)=>`<div class="chips" data-chipset="${name}">${Array.from({length:max},(_,i)=>i+1).map(v=>`<button type="button" class="chip" data-v="${v}" aria-pressed="${val===v}">${v}</button>`).join("")}</div>`;
  const pp=isProp(a)?propProgress(a,d):null;
  const banners=[];
  if(g&&g.dayHit)banners.push(`Daily loss limit hit (${money(g.dayNet,true,c)} of ${money(-g.dl,true,c)}). You're done for today.`);
  if(g&&g.weekHit)banners.push(`Weekly loss limit hit (${money(g.weekNet,true,c)}). You're done for the week.`);
  if(g&&g.consecHit)banners.push(`${g.consec} stop-losses in a row this week. Your rule says stop for the week.`);
  if(g&&g.tradesHit&&!g.dayHit)banners.push(`Max ${a.maxTradesDay} trades for today reached.`);
  if(pp)pp.flags.filter(f=>f.lvl==="bad").forEach(f=>banners.push(esc(f.t)));
  return `
  <div class="spread">
    <div><div class="eyebrow">${isToday?"Today":"Session"} · ${esc(a?a.name:"")}</div><h1>${esc(prettyDate(d))}</h1></div>
    <div class="row"><button class="ghost" data-act="prevDay" aria-label="Previous day">←</button><input type="date" id="dayPick" value="${d}" style="width:auto"><button class="ghost" data-act="nextDay" aria-label="Next day">→</button>${isToday?"":`<button data-act="goToday">Today</button>`}</div>
  </div>
  ${banners.map(b=>`<div class="stopbanner">${b}</div>`).join("")}
  <div class="kpis">
    ${kpi("Day P&amp;L",closed.length?money(net,true,c):"—",`${closed.length} closed${list.length>closed.length?` · ${list.length-closed.length} open`:""}`,cls(net))}
    ${kpi("Net R",closed.length?rfmt(rsum):"—",`${wins}W · ${losses}L`,cls(rsum))}
    ${kpi("Risk per trade",risk!=null?money(risk,false,c):"—",a?(a.riskMode==="amount"?"Fixed amount":`${a.riskPct||0}% of ${a.riskBasis==="start"?"starting":"current"} balance`):"")}
    <div class="kpi"><span class="eyebrow">Daily loss limit</span>${g&&g.dl?`<b>${money(Math.min(0,g.dayNet),true,c)} <span class="muted sm-t">/ ${money(-g.dl,true,c)}</span></b>${bar(-Math.min(0,g.dayNet)/g.dl,-g.dayNet>=g.dl?"over":-g.dayNet>=g.dl*.6?"hot":"")}<small>${money(g.riskLeftToday,false,c)} left today</small>`:`<b>—</b><small><a href="#accounts">Set a limit</a></small>`}</div>
    <div class="kpi"><span class="eyebrow">This week</span>${g?`<b class="${cls(g.weekNet)}">${money(g.weekNet,true,c)}</b>${g.wl?bar(-Math.min(0,g.weekNet)/g.wl,g.weekHit?"over":-g.weekNet>=g.wl*.6?"hot":""):""}<small>${g.wl?`Limit ${money(-g.wl,true,c)} · `:""}${a&&a.maxConsecLosses?`${g.consec}/${a.maxConsecLosses} SLs in a row`:`${g.consec} SL${g.consec===1?"":"s"} in a row`}</small>`:"<b>—</b>"}</div>
  </div>
  ${pp?propPanel(a,pp):""}
  <div class="grid2">
    <form class="panel" id="dayForm" autocomplete="off">
      <div class="spread"><h2>Pre-market plan</h2><span class="muted sm-t" id="saveState"></span></div>
      <label class="notrade"><input type="checkbox" id="noTrade" name="noTrade" ${day.noTrade?"checked":""}> <span><b>No trade today</b><br><span class="muted sm-t">Sitting out is a decision. It counts as a disciplined day.</span></span></label>
      <div id="ntWrap" ${day.noTrade?"":"hidden"}><label class="f">Reason<select id="ntReason" name="noTradeReason"><option></option>${NO_TRADE_REASONS.map(r=>`<option ${day.noTradeReason===r?"selected":""}>${r}</option>`).join("")}</select></label></div>
      <div class="fgrid">
        <label class="f">Market bias<select id="bias" name="bias">${["","Bullish","Bearish","Neutral","Choppy / range"].map(o=>`<option ${day.bias===o?"selected":""}>${o}</option>`).join("")}</select></label>
        <label class="f">Sleep (hrs)<input id="sleep" name="sleep" type="number" inputmode="decimal" step="0.5" min="0" max="14" value="${day.sleep??""}"></label>
      </div>
      <div class="f">Mood / readiness (1–5)${chipRow("mood",5,day.mood)}</div>
      <label class="f">Key levels &amp; catalysts<textarea id="levels" name="levels" placeholder="EURUSD 1.0850 support, 1.0920 PDH. CPI at 8:30.">${esc(day.levels)}</textarea></label>
      <label class="f">Game plan<textarea id="plan" name="plan" placeholder="What I'm trading, what I'm waiting for, what I'll skip.">${esc(day.plan)}</textarea></label>
      ${rules.length?`<div style="display:grid;gap:6px"><div class="eyebrow">My rules today</div>${rules.map((r,i)=>`<label class="ruleitem"><input type="checkbox" data-rule="${esc(r)}" id="rule${i}" ${checked.has(r)?"checked":""}> ${esc(r)}</label>`).join("")}</div>`:`<p class="muted sm-t" style="margin:0">Add your trading rules under <a href="#accounts">Accounts</a> to get a daily checklist here.</p>`}
    </form>
    <div class="stack">
      <div class="panel">
        <div class="spread"><h2>Trades</h2><button class="primary" data-act="addTrade">+ Log trade</button></div>
        ${list.length?`<div class="tlist">${list.map(tradeRow).join("")}</div>`:`<div class="empty sm">${day.noTrade?"No-trade day logged.":"No trades logged for this session."}</div>`}
      </div>
      ${calcPanel(a)}
      <form class="panel" id="reviewForm" autocomplete="off">
        <h2>Post-session review</h2>
        <label class="f">What went well<textarea id="went" name="went">${esc(day.went)}</textarea></label>
        <label class="f">Mistakes<textarea id="mist" name="mist">${esc(day.mist)}</textarea></label>
        <label class="f">One lesson for tomorrow<textarea id="lesson" name="lesson" style="min-height:50px">${esc(day.lesson)}</textarea></label>
        <div class="f">Discipline score (1–10)${chipRow("discipline",10,day.discipline)}</div>
      </form>
    </div>
  </div>
  ${vWatch()}`;
}
export function propPanel(a,pp){
  const c=cur(a);const R=pp.R;
  return `<div class="panel prop">
    <div class="spread"><h2>${esc(a.name)} · ${esc(typeLabel(a.type))}</h2>${pp.flags.map(f=>`<span class="pill ${f.lvl==="bad"?"loss":f.lvl==="ok"?"gain":"warn"}">${esc(f.t)}</span>`).join(" ")}</div>
    <div class="propgrid">
      <div><div class="eyebrow">Profit target</div><b class="num">${money(pp.profit,true,c)} <span class="muted sm-t">/ ${R.target!=null?money(R.target,false,c):"—"}</span></b>${R.target!=null?bar(pp.targetPct,pp.passed?"":""):""}</div>
      <div><div class="eyebrow">Max loss room</div><b class="num ${pp.room!=null&&pp.room<(R.total||0)*.25?"loss":""}">${pp.room!=null?money(pp.room,false,c):"—"}</b><small class="muted">Floor ${pp.floor!=null?money(pp.floor,false,c):"—"} · ${esc(R.ddType)}</small></div>
      <div><div class="eyebrow">Daily loss room</div><b class="num ${pp.dayRoom!=null&&pp.dayRoom<(R.daily||0)*.3?"loss":""}">${pp.dayRoom!=null?money(pp.dayRoom,false,c):"—"}</b><small class="muted">Floor ${pp.dayFloor!=null?money(pp.dayFloor,false,c):"—"}</small></div>
      <div><div class="eyebrow">Trading days</div><b class="num">${pp.daysTraded}${R.minDays?` / ${R.minDays}`:""}</b>${R.minDays?bar(pp.daysTraded/R.minDays):""}${R.timeLimitDays?`<small class="muted">Day ${pp.daysElapsed} of ${R.timeLimitDays}</small>`:""}</div>
      ${R.consistencyPct?`<div><div class="eyebrow">Consistency (best day)</div><b class="num ${pp.cons>R.consistencyPct/100?"loss":""}">${pct(pp.cons)}</b><small class="muted">Limit ${R.consistencyPct}%</small></div>`:""}
    </div>
  </div>`;
}
export function calcPanel(a){
  const c=cur(a);const risk=riskAmount(a,S.date);
  return `<form class="panel" id="calcForm" autocomplete="off">
    <div class="spread"><h2>Position size</h2><span class="muted sm-t">${risk!=null?`Risking ${money(risk,false,c)}`:"Set risk under Accounts"}</span></div>
    <div class="fgrid">
      <label class="f">Instrument<select id="cInst"><option value="">Custom</option>${S.instruments.map(i=>`<option value="${esc(i.id)}">${esc(i.symbol)}</option>`).join("")}</select></label>
      <label class="f">Entry<input id="cEntry" type="number" inputmode="decimal" step="any"></label>
      <label class="f">Stop<input id="cStop" type="number" inputmode="decimal" step="any"></label>
      <label class="f">Target<input id="cTarget" type="number" inputmode="decimal" step="any"></label>
      <label class="f">Point value / contract size<input id="cMult" type="number" inputmode="decimal" step="any" value="${a&&a.defaultMult||1}"></label>
      <label class="f">Size step<input id="cStep" type="number" inputmode="decimal" step="any" value="1"></label>
      <label class="f">Risk amount<input id="cRisk" type="number" inputmode="decimal" step="any" value="${risk!=null?risk.toFixed(2):""}"></label>
    </div>
    <div class="calcout" id="cOut"><span class="muted">Enter entry and stop to get a size.</span></div>
  </form>`;
}
export function calcRun(){
  const g=id=>+($(id)?.value||NaN);const entry=g("#cEntry"),stop=g("#cStop"),tgt=g("#cTarget"),mult=g("#cMult")||1,step=g("#cStep")||1,risk=g("#cRisk");
  const out=$("#cOut");if(!out)return;const a=account(defaultAccountId());const c=cur(a);
  const z=sizeFor({riskAmt:risk,entry,stop,mult,step});
  if(!z){out.innerHTML=`<span class="muted">Enter entry, stop and risk amount to get a size.</span>`;return}
  const rr=isFinite(tgt)&&tgt?Math.abs(tgt-entry)/Math.abs(entry-stop):null;const minRR=a&&a.minRR;
  out.innerHTML=`<div><div class="eyebrow">Size</div><b class="num big">${z.units.toFixed(stepDecimals(step))}</b></div>
    <div><div class="eyebrow">Actual risk</div><b class="num">${money(z.actualRisk,false,c)}</b></div>
    <div><div class="eyebrow">R:R</div><b class="num ${rr!=null&&minRR&&rr<minRR?"loss":""}">${rr!=null?"1:"+rr.toFixed(2):"—"}</b>${rr!=null&&minRR&&rr<minRR?`<small class="loss">Below your 1:${minRR} minimum</small>`:""}</div>
    <div><div class="eyebrow">Reward at target</div><b class="num gain">${rr!=null?money(z.actualRisk*rr,false,c):"—"}</b></div>`;
}
function vWatch(){
  const st={Watching:"info",Triggered:"gain",Passed:"flat"};
  return `<div class="panel">
    <div><h2>Watchlist</h2><span class="muted sm-t">Names you're stalking, the level that matters, and why.</span></div>
    <form class="row" id="watchForm" autocomplete="off" style="align-items:end">
      <label class="f" style="flex:1 1 90px">Symbol<input id="wSym" required placeholder="EURUSD"></label>
      <label class="f" style="flex:1 1 90px">Trigger level<input id="wLvl" placeholder="1.0850"></label>
      <label class="f" style="flex:4 1 220px">Thesis<input id="wTh" placeholder="Retest of broken range high, London open"></label>
      <button class="primary" type="submit">Add</button></form>
    ${S.watch.length?`<div class="tbl-wrap"><table><thead><tr><th>Symbol</th><th class="n">Level</th><th>Thesis</th><th>Status</th><th></th></tr></thead><tbody>
      ${S.watch.slice().sort((x,y)=>(y.created||0)-(x.created||0)).map(w=>`<tr><td><b>${esc(w.symbol)}</b></td><td class="n">${esc(w.level||"—")}</td><td class="wrap">${esc(w.thesis||"")}</td>
      <td><button class="ghost" data-wstat="${esc(w.id)}" title="Change status"><span class="pill ${st[w.status]||"info"}">${esc(w.status||"Watching")}</span></button></td>
      <td><button class="ghost" data-wdel="${esc(w.id)}" aria-label="Remove ${esc(w.symbol)}">✕</button></td></tr>`).join("")}
    </tbody></table></div>`:`<div class="empty sm">Nothing on watch yet.</div>`}
  </div>`;
}

/* ---------- TRADES ---------- */
export function vTrades(){
  const list=filtered({trades:true}).sort((x,y)=>tkey(y).localeCompare(tkey(x)));const c=filterCurrency();
  const closed=list.filter(t=>t._c.closed);const net=closed.reduce((s,t)=>s+t._c.pnl,0);const multi=S.f.account==="all"&&activeAccounts().length>1;
  return `<div class="spread"><div><div class="eyebrow">${scopeLabel()}</div><h1>Trades</h1></div>
    <div class="row"><button data-act="import">Import</button><button data-act="csv">Export CSV</button><button class="primary" data-act="addTrade">+ Log trade</button></div></div>
  ${S.f.drill?`<div class="notice"><span>Showing: <b>${esc(S.f.drill.label)}</b></span><button data-act="clearDrill">Show all</button></div>`:""}
  ${filterBar()}
  <div class="filters"><input id="fq" placeholder="Search symbol, notes or signal provider" value="${esc(S.f.q)}" style="flex:2 1 220px">
    <select id="fres" style="flex:1 1 140px">${[["","All results"],["win","Winners"],["loss","Losers"],["be","Breakeven"],["open","Open"],["mistake","With mistakes"]].map(([v,l])=>`<option value="${v}" ${S.f.result===v?"selected":""}>${l}</option>`).join("")}</select></div>
  ${list.length?`<div class="tbl-wrap"><table class="trades"><thead><tr><th>Date</th>${multi?"<th>Account</th>":""}<th>Symbol</th><th>Side</th><th>Setup</th><th class="n">Size</th><th class="n">Entry</th><th class="n">Exit</th><th class="n">P&amp;L</th><th class="n">R</th><th class="n">Plan R:R</th><th>Result</th><th>Plan</th></tr></thead><tbody>
  ${list.map(t=>{const a=account(acctOf(t));const cc=cur(a);return `<tr class="click" data-trade="${esc(t.id)}" tabindex="0"><td class="mono">${esc(t.date)}</td>${multi?`<td>${esc(a?a.name:"")}</td>`:""}<td><b>${esc(t.symbol)}</b>${t.source==="Signal"?` <span class="pill flat">Sig</span>`:""}</td><td><span class="side ${t.side==="Short"?"S":"L"}">${t.side==="Short"?"SHORT":"LONG"}</span></td><td>${esc(t.setup||"—")}</td>
  <td class="n">${t.qty??"—"}</td><td class="n">${t.entry??"—"}</td><td class="n">${t.exit??"—"}</td>
  <td class="n ${cls(t._c.pnl)}" style="font-weight:600">${t._c.closed?money(t._c.pnl,true,cc):"Open"}</td><td class="n ${cls(t._c.r)}">${rfmt(t._c.r)}</td><td class="n">${t._c.plannedRR!=null?"1:"+t._c.plannedRR.toFixed(1):"—"}</td>
  <td>${t._c.outcome?`<span class="pill ${t._c.outcome==="W"?"gain":t._c.outcome==="L"?"loss":"flat"}">${t._c.outcome==="W"?"Win":t._c.outcome==="L"?"Loss":"BE"}</span>`:"—"}</td>
  <td>${t.followedPlan===false?`<span class="pill loss">Broke</span>`:t.followedPlan?`<span class="pill gain">Kept</span>`:"—"}</td></tr>`}).join("")}
  </tbody><tfoot><tr><td colspan="${multi?8:7}" class="muted">${closed.length} closed of ${list.length}</td><td class="n ${cls(net)}" style="font-weight:700">${money(net,true,c)}</td><td colspan="4"></td></tr></tfoot></table></div>`
  :emptyPanel(S.trades.length?"No trades match these filters":"Your trade log is empty",S.trades.length?"Clear a filter to see more.":"Log a trade, or import your MT4/MT5 history or a CSV.",`<div class="row" style="justify-content:center">${S.trades.length?"":`<button data-act="import">Import history</button>`}<button class="primary" data-act="addTrade">+ Log trade</button></div>`)}`;
}
bind.trades=()=>{
  bindFilters();
  const fq=$("#fq");let tm;fq.oninput=()=>{clearTimeout(tm);tm=setTimeout(()=>{S.f.q=fq.value;render(true);const n=$("#fq");n.focus();n.setSelectionRange(n.value.length,n.value.length)},250)};
  $("#fres").onchange=e=>{S.f.result=e.target.value;render(true)};
};

/* ---------- CALENDAR ---------- */
export function vCalendar(){
  const [y,m]=S.month.split("-").map(Number);const first=new Date(y,m-1,1);const last=new Date(y,m,0);
  const keep=t=>S.f.account==="all"||acctOf(t)===S.f.account;
  const byDay=groupBy(S.trades.filter(t=>t._c.closed&&keep(t)),t=>t.exitDate||t.date);
  const start=new Date(first);start.setDate(1-((first.getDay()+6)%7));
  const today=ymd(new Date());let cells="",monthNet=0,green=0,red=0,nt=0;const c=filterCurrency();
  const mx=Math.max(1,...[...byDay].filter(([k])=>k.startsWith(S.month)).map(([,v])=>Math.abs(v.reduce((s,t)=>s+t._c.pnl,0))));
  for(let d=new Date(start);d<=last||((d.getDay()+6)%7)!==0;){
    let wk=0,wkHas=false;
    for(let i=0;i<7;i++){
      const ds=ymd(d),inM=d.getMonth()===m-1,list=byDay.get(ds)||[],net=list.reduce((s,t)=>s+t._c.pnl,0);const dj=S.days[ds]||{};
      if(list.length){wk+=net;wkHas=true;if(inM){monthNet+=net;net>0?green++:net<0?red++:0}}
      if(inM&&dj.noTrade)nt++;
      if(i<5){const al=list.length?Math.min(1,.18+.6*Math.abs(net)/mx):0;
        const bg=list.length?`background:color-mix(in srgb, ${net>=0?"var(--gain)":"var(--loss)"} ${Math.round(al*45)}%, var(--surface))`:"";
        cells+=`<button class="cell ${inM?"":"out"} ${ds===today?"today":""}" data-day="${ds}" style="${bg}"><span class="d">${d.getDate()}${dj.noTrade?` <span class="nt" title="No-trade day">∅</span>`:""}</span>${list.length?`<span class="p ${cls(net)}">${shortMoney(net,c)}</span><span class="c">${list.length} trade${list.length>1?"s":""}</span>`:"<span></span>"}</button>`}
      d.setDate(d.getDate()+1);
    }
    cells+=`<div class="wk ${cls(wk)}">${wkHas?shortMoney(wk,c):"—"}</div>`;
  }
  return `<div class="spread"><div><div class="eyebrow">P&amp;L calendar · ${scopeLabel()}</div><h1>${first.toLocaleDateString(undefined,{month:"long",year:"numeric"})}</h1></div>
   <div class="row"><button class="ghost" data-act="prevM" aria-label="Previous month">←</button><button data-act="thisM">This month</button><button class="ghost" data-act="nextM" aria-label="Next month">→</button></div></div>
  <div class="kpis">${kpi("Month net",money(monthNet,true,c),"",cls(monthNet))}${kpi("Green days",`<span class="gain">${green}</span>`)}${kpi("Red days",`<span class="loss">${red}</span>`)}${kpi("Day win rate",green+red?pct(green/(green+red)):"—")}${kpi("No-trade days",String(nt))}</div>
  <div class="panel"><div class="cal-scroll"><div class="cal">${["Mon","Tue","Wed","Thu","Fri"].map(x=>`<div class="hd">${x}</div>`).join("")}<div class="hd" style="text-align:right">Week</div>${cells}</div></div>
  <p class="muted sm-t" style="margin:0">Tap a day to open its journal. ∅ marks a no-trade day.</p></div>`;
}

/* ---------- STATEMENT (weekly + monthly, like the old Excel) ---------- */
export function statementData(a,month){
  const [y,m]=month.split("-").map(Number);const first=ymd(new Date(y,m-1,1)),last=ymd(new Date(y,m,0));
  const weeks=[];let ws=weekStart(first);
  while(ws<=last){const we=addDays(ws,6);const from=ws<first?first:ws,to=we>last?last:we;weeks.push({from,to,ws});ws=addDays(ws,7)}
  const ts=acctTrades(a.id).filter(t=>t._c.closed);
  const rows=weeks.map((w,i)=>{
    const list=ts.filter(t=>{const d=t.exitDate||t.date;return d>=w.from&&d<=w.to});
    const st=computeStats(list);const startBal=balanceAt(a,w.from);
    const wins=list.filter(t=>t._c.pnl>0).reduce((s,t)=>s+t._c.pnl,0),loss=list.filter(t=>t._c.pnl<0).reduce((s,t)=>s+t._c.pnl,0);
    const tx=acctTxns(a.id).filter(x=>x.date>=w.from&&x.date<=w.to);const txNet=tx.reduce((s,x)=>s+(x.type==="deposit"?x.amount:-x.amount),0);
    const nt=Object.values(S.days).filter(dj=>dj.noTrade&&dj.date>=w.from&&dj.date<=w.to).length;
    const remark=(S.days["w-"+a.id+"-"+w.ws]||{}).remark||"";
    return {i:i+1,...w,st,startBal,wins,loss,net:wins+loss,txNet,close:startBal+wins+loss+txNet,nt,remark};
  });
  const monthTrades=ts.filter(t=>{const d=t.exitDate||t.date;return d>=first&&d<=last});
  const mtx=acctTxns(a.id).filter(x=>x.date>=first&&x.date<=last);
  return {first,last,rows,st:computeStats(monthTrades),open:balanceAt(a,first),close:balanceAt(a,last,true),
    dep:mtx.filter(x=>x.type==="deposit").reduce((s,x)=>s+x.amount,0),wd:mtx.filter(x=>x.type!=="deposit").reduce((s,x)=>s+x.amount,0),mtx};
}
export function vStatement(){
  const accts=activeAccounts();if(!accts.length)return emptyPanel("No accounts yet","Add an account to see its statement.","");
  if(!S.stmt.account||!account(S.stmt.account))S.stmt.account=S.f.account!=="all"?S.f.account:defaultAccountId();
  const a=account(S.stmt.account);const c=cur(a);const D=statementData(a,S.stmt.month);
  const mname=parseD(S.stmt.month+"-01").toLocaleDateString(undefined,{month:"long",year:"numeric"});
  const rules=[a.riskMode==="amount"?`Risk ${money(a.riskAmount,false,c)} per trade`:`Risk ${a.riskPct||0}% of ${a.riskBasis==="start"?"starting":"current"} balance`,a.minRR?`Minimum 1:${a.minRR} R:R per trade`:null,a.maxConsecLosses?`${a.maxConsecLosses} consecutive SLs allowed`:null,a.weeklyLossPct?`−${a.weeklyLossPct}% for the week`:null,dailyLimit(a)?`Daily loss limit ${money(dailyLimit(a),false,c)}`:null].filter(Boolean);
  return `<div class="spread noprint"><div><div class="eyebrow">Statement</div><h1>${esc(mname)}</h1></div>
    <div class="row"><select id="stAcct" aria-label="Account">${accts.map(x=>`<option value="${esc(x.id)}" ${x.id===a.id?"selected":""}>${esc(x.name)}</option>`).join("")}</select>
    <input type="month" id="stMonth" value="${S.stmt.month}" style="width:auto" aria-label="Month">
    <button data-act="xlsx">Export Excel</button><button data-act="print">Print / PDF</button></div></div>
  <div class="statement" id="statement">
    <div class="st-head"><div><div class="eyebrow">Account statement</div><h2>${esc(a.name)}${a.broker?` · ${esc(a.broker)}`:""}</h2><div class="muted sm-t">${esc(typeLabel(a.type))} · ${esc(c)} · ${esc(mname)}</div></div>
      <div class="st-rules"><div class="eyebrow">Rules</div><ul>${rules.map(r=>`<li>${esc(r)}</li>`).join("")}</ul></div></div>
    <div class="kpis">${kpi("Account size",money(a.startBalance||0,false,c))}${kpi("Opening balance",money(D.open,false,c))}${kpi("Deposits",money(D.dep,false,c))}${kpi("Withdrawals",money(D.wd,false,c))}${kpi("Month P&amp;L",money(D.st.net,true,c),`${D.st.n} trades · ${pct(D.st.wr)} win`,cls(D.st.net))}${kpi("Closing balance",money(D.close,false,c))}</div>
    <div class="weeks">${D.rows.map(w=>`<div class="week">
      <div class="spread"><h3>Week ${w.i}</h3><span class="muted sm-t">${esc(prettyDate(w.from,{month:"short",day:"numeric"}))} – ${esc(prettyDate(w.to,{month:"short",day:"numeric"}))}</span></div>
      <dl class="dl">
        <dt>Starting balance</dt><dd>${money(w.startBal,false,c)}</dd>
        <dt>Trades</dt><dd>${w.st.n}</dd>
        <dt>Win / loss / BE</dt><dd><span class="gain">${w.st.w}</span> / <span class="loss">${w.st.l}</span> / ${w.st.be}</dd>
        <dt>Success ratio</dt><dd>${pct(w.st.wr)}</dd>
        <dt>Winning trades P&amp;L</dt><dd class="gain">${money(w.wins,true,c)}</dd>
        <dt>Losing trades P&amp;L</dt><dd class="loss">${money(w.loss,true,c)}</dd>
        <dt>Week P&amp;L</dt><dd class="${cls(w.net)}"><b>${money(w.net,true,c)}</b> ${w.st.withR.length?`<span class="muted">(${rfmt(w.st.sumR)})</span>`:""}</dd>
        ${w.txNet?`<dt>Deposits − withdrawals</dt><dd>${money(w.txNet,true,c)}</dd>`:""}
        <dt>Closing balance</dt><dd><b>${money(w.close,false,c)}</b></dd>
        ${w.nt?`<dt>No-trade days</dt><dd>${w.nt}</dd>`:""}
      </dl>
      <label class="f">Remarks<textarea class="wk-remark" data-wk="${esc(w.ws)}" rows="2" placeholder="${w.st.n?"":"No trade"}">${esc(w.remark)}</textarea></label>
    </div>`).join("")}</div>
    ${D.mtx.length?`<h3>Deposits &amp; withdrawals</h3><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>To / note</th><th class="n">Amount</th></tr></thead><tbody>${D.mtx.map(x=>`<tr><td class="mono">${esc(x.date)}</td><td>${esc(x.type)}</td><td>${esc([x.recipient,x.note].filter(Boolean).join(" · "))}</td><td class="n">${money(x.amount,false,c)}</td></tr>`).join("")}</tbody></table></div>`:""}
  </div>`;
}
bind.statement=()=>{
  $("#stAcct").onchange=e=>{S.stmt.account=e.target.value;render(true)};
  $("#stMonth").onchange=e=>{if(e.target.value){S.stmt.month=e.target.value;render(true)}};
  $$(".wk-remark").forEach(el=>{let tm;el.oninput=()=>{clearTimeout(tm);tm=setTimeout(()=>{const id="w-"+S.stmt.account+"-"+el.dataset.wk;write("days/"+id,{...(S.days[id]||{}),remark:el.value,updatedAt:Date.now()},{silent:true})},700)}});
};

/* ---------- PLAYBOOK ---------- */
export function vPlaybook(){
  const stats=new Map([...groupBy(S.trades.filter(t=>t._c.closed),t=>t.setup)].map(([k,v])=>[k,computeStats(v)]));
  return `<div class="spread"><div><div class="eyebrow">Playbook</div><h1>Setups</h1><p class="muted" style="margin:4px 0 0">The trades you take, written down. Each card tracks how that setup actually performs.</p></div><button class="primary" data-act="addSetup">+ New setup</button></div>
  ${S.setups.length?`<div class="grid2">${S.setups.slice().sort((x,y)=>(x.name||"").localeCompare(y.name||"")).map(s=>{const st=stats.get(s.name);return `<div class="setup">
    <div class="spread"><h2>${esc(s.name)}</h2><button class="ghost" data-setup="${esc(s.id)}">Edit</button></div>
    ${(s.market||s.timeframe||s.targetRR)?`<div class="eyebrow">${[s.market,s.timeframe,s.targetRR?`Target 1:${s.targetRR}`:null].filter(Boolean).map(esc).join(" · ")}</div>`:""}
    <div class="minis"><span>Trades <b>${st?st.n:0}</b></span><span>Win <b>${st?pct(st.wr):"—"}</b></span><span>Avg <b class="${st?cls(st.avgR):""}">${st?rfmt(st.avgR):"—"}</b></span><span>Planned <b>${st&&st.avgPlannedRR!=null?"1:"+st.avgPlannedRR.toFixed(1):"—"}</b></span><span>Net <b class="${st?cls(st.net):""}">${st?money(st.net):"—"}</b></span></div>
    ${s.entry?`<div><div class="eyebrow">Entry criteria</div><pre>${esc(s.entry)}</pre></div>`:""}
    ${s.mgmt?`<div><div class="eyebrow">Stop, targets &amp; management</div><pre>${esc(s.mgmt)}</pre></div>`:""}
    ${s.avoid?`<div><div class="eyebrow">Don't take it when</div><pre>${esc(s.avoid)}</pre></div>`:""}
  </div>`}).join("")}</div>`:emptyPanel("No setups yet","Write down your A+ setups: what triggers entry, where the stop goes, how you manage it, and the R:R you want.",`<button class="primary" data-act="addSetup">+ New setup</button>`)}`;
}

/* ---------- ACCOUNTS ---------- */
export function vAccounts(){
  const accts=S.accounts.slice().sort((x,y)=>(x.archived?1:0)-(y.archived?1:0)||(x.created||0)-(y.created||0));
  return `<div class="spread"><div><div class="eyebrow">Accounts</div><h1>Accounts &amp; risk</h1></div><button class="primary" data-act="addAccount">+ Add account</button></div>
  <div class="grid2">${accts.map(a=>{const c=cur(a);const bal=balanceAt(a,null);const pp=isProp(a)?propProgress(a):null;const txs=acctTxns(a.id).sort((x,y)=>(y.date||"").localeCompare(x.date||""));
    return `<div class="panel ${a.archived?"archived":""}">
      <div class="spread"><div><h2>${esc(a.name)}</h2><div class="muted sm-t">${esc(typeLabel(a.type))}${a.broker?" · "+esc(a.broker):""}${a.prop&&a.prop.firmName?" · "+esc(a.prop.firmName+" "+(a.prop.programName||"")):""}${a.archived?" · archived":""}</div></div>
        <div class="row"><button class="ghost" data-act="addTxn" data-id="${esc(a.id)}">+ Deposit / withdrawal</button><button data-act="editAccount" data-id="${esc(a.id)}">Edit</button></div></div>
      <div class="kpis compact">${kpi("Balance",money(bal,false,c))}${kpi("Trading P&amp;L",money(tradingPnl(a),true,c),"",cls(tradingPnl(a)))}${kpi("Deposits",money((a.startBalance||0)+netDeposits(a),false,c),`incl. ${money(a.startBalance||0,false,c)} start`)}${kpi("Withdrawn",money(netWithdrawals(a),false,c))}</div>
      <div class="minis"><span>Risk <b>${a.riskMode==="amount"?money(a.riskAmount,false,c):(a.riskPct||0)+"%"}</b></span><span>Min R:R <b>${a.minRR?"1:"+a.minRR:"—"}</b></span><span>Daily limit <b>${dailyLimit(a)?money(dailyLimit(a),false,c):"—"}</b></span><span>Weekly <b>${a.weeklyLossPct?"−"+a.weeklyLossPct+"%":"—"}</b></span><span>Max SLs in a row <b>${a.maxConsecLosses||"—"}</b></span></div>
      ${pp?propPanel(a,pp):""}
      ${txs.length?`<details><summary>Deposits &amp; withdrawals (${txs.length})</summary><div class="tbl-wrap"><table><thead><tr><th>Date</th><th>Type</th><th>To / note</th><th class="n">Amount</th><th></th></tr></thead><tbody>${txs.map(x=>`<tr><td class="mono">${esc(x.date)}</td><td>${esc(x.type)}</td><td class="wrap">${esc([x.recipient,x.note].filter(Boolean).join(" · "))}</td><td class="n">${money(x.amount,false,c)}</td><td><button class="ghost" data-act="editTxn" data-id="${esc(x.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div></details>`:""}
    </div>`}).join("")}</div>
  <div class="grid2">
    <div class="panel"><div class="spread"><h2>Instruments</h2><button data-act="addInstrument">+ Add</button></div>
      <p class="muted sm-t" style="margin:0">Saved symbols fill in point value, pip size and size step when you log or size a trade.</p>
      ${S.instruments.length?`<div class="tbl-wrap"><table><thead><tr><th>Symbol</th><th>Type</th><th class="n">Point value</th><th class="n">Pip</th><th class="n">Step</th><th></th></tr></thead><tbody>${S.instruments.slice().sort((x,y)=>(x.symbol||"").localeCompare(y.symbol||"")).map(i=>`<tr><td><b>${esc(i.symbol)}</b></td><td>${esc(i.type||"")}</td><td class="n">${i.mult??1}</td><td class="n">${i.pipSize??"—"}</td><td class="n">${i.step??1}</td><td><button class="ghost" data-act="editInstrument" data-id="${esc(i.id)}">Edit</button></td></tr>`).join("")}</tbody></table></div>`:`<div class="empty sm"><button data-act="seedInstruments">Add common forex, index and futures symbols</button></div>`}
    </div>
    <form class="panel" id="rulesForm" autocomplete="off"><h2>Daily rules checklist</h2>
      <label class="f">One per line; they show as a checklist on Today<textarea id="cRules" style="min-height:140px" placeholder="No trades in the first 5 minutes&#10;Max 3 trades per day&#10;Stop after 2 consecutive losses">${esc(S.cfg.rules)}</textarea></label>
      <label class="ruleitem"><input type="checkbox" id="cDemo" ${S.cfg.includeDemo?"checked":""}> Include demo accounts in "All accounts" stats</label>
      <label class="f" style="max-width:260px">Your UTC offset (for session stats)<input id="cOff" type="number" step="0.5" value="${S.cfg.sessionOffset??(-new Date().getTimezoneOffset()/60)}"></label>
      <div class="row"><button class="primary" type="submit">Save</button></div></form>
  </div>
  <div class="panel"><h2>Your data</h2>
    <p class="muted" style="margin:0">Only your signed-in account can read or change your journal.${S.email?` Signed in as <b>${esc(S.email)}</b>.`:""}</p>
    <div class="row"><button data-act="import">Import trades</button><button data-act="csv">Export trades CSV</button><button data-act="signout">Sign out</button></div>
  </div>`;
}
bind.accounts=()=>{
  $("#rulesForm").onsubmit=e=>{e.preventDefault();const off=+$("#cOff").value;write("config/main",{...S.cfg,rules:$("#cRules").value,includeDemo:$("#cDemo").checked,sessionOffset:isFinite(off)?off:0}).then(()=>import("./core.js").then(m=>m.toast("Saved")))};
};

/* ---------- day form wiring (Today) ---------- */
let dayTimer=null;
export function saveDay(patch){
  const curD=S.days[S.date]||{};const body={...curD,...patch,date:S.date,updatedAt:Date.now()};
  const ss=$("#saveState");if(ss)ss.textContent="Saving…";
  write("days/"+S.date,body,{silent:true}).then(()=>{const s=$("#saveState");if(s)s.textContent="Saved"}).catch(()=>{const s=$("#saveState");if(s)s.textContent="Not saved"});
}
bind.today=()=>{
  const dp=$("#dayPick");dp.onchange=()=>{if(dp.value){S.date=dp.value;render(true)}};
  ["#dayForm","#reviewForm"].forEach(sel=>{
    const f=$(sel);f.onsubmit=e=>e.preventDefault();
    f.addEventListener("input",e=>{
      const el=e.target;if(el.dataset.rule!==undefined||el.type==="checkbox"||!el.name)return;
      clearTimeout(dayTimer);const name=el.name,val=el.type==="number"?(el.value===""?null:+el.value):el.value;
      if(el.tagName==="SELECT"){saveDay({[name]:val});return}
      dayTimer=setTimeout(()=>saveDay({[name]:val}),700);
    });
    f.addEventListener("change",e=>{
      const el=e.target;
      if(el.dataset.rule!==undefined)saveDay({rules:$$("[data-rule]").filter(x=>x.checked).map(x=>x.dataset.rule)});
      if(el.id==="noTrade"){$("#ntWrap").hidden=!el.checked;saveDay({noTrade:el.checked});}
    });
  });
  $$("[data-chipset]").forEach(set=>set.addEventListener("click",e=>{
    const b=e.target.closest(".chip");if(!b)return;const v=+b.dataset.v;const name=set.dataset.chipset;
    const curV=(S.days[S.date]||{})[name];const nv=curV===v?null:v;
    set.querySelectorAll(".chip").forEach(x=>x.setAttribute("aria-pressed",String(+x.dataset.v===nv)));saveDay({[name]:nv});
  }));
  const cf=$("#calcForm");
  if(cf){cf.onsubmit=e=>e.preventDefault();cf.addEventListener("input",calcRun);
    $("#cInst").onchange=e=>{const i=S.instruments.find(x=>x.id===e.target.value);if(i){$("#cMult").value=i.mult??1;$("#cStep").value=i.step??1}calcRun()}}
  const wf=$("#watchForm");
  wf.onsubmit=e=>{e.preventDefault();const sym=$("#wSym").value.trim().toUpperCase();if(!sym)return;
    import("./core.js").then(m=>{write("watch/"+m.newId(),{symbol:sym,level:$("#wLvl").value.trim(),thesis:$("#wTh").value.trim(),status:"Watching",created:Date.now()});wf.reset();$("#wSym").focus()})};
};
bind.calendar=()=>{};
bind.playbook=()=>{};

/* ---------- FEEDBACK ---------- */
const FB_KIND={review:"Review",change:"Change request",bug:"Bug",idea:"Idea"};
const FB_STATUS={new:["info","Received"],planned:["warn","Planned"],"in progress":["warn","In progress"],done:["gain","Done"],declined:["flat","Not planned"]};
export function feedbackBanner(){
  let hidden=false;try{hidden=localStorage.getItem("tl.fbBanner")==="off"}catch{}
  if(hidden)return"";
  return `<div class="fbbanner"><div><b>Help shape Trade Ledger.</b> Tell us what to change, what's missing, or what you love. Every note goes straight to the build list.</div>
    <div class="row"><button class="primary" data-act="feedback">Drop your review</button><button class="ghost" data-act="hideFbBanner" aria-label="Hide this banner">Hide</button></div></div>`;
}
export function vFeedback(){
  const list=S.feedback||[];
  return `<div class="spread"><div><div class="eyebrow">Feedback</div><h1>Reviews &amp; change requests</h1><p class="muted" style="margin:4px 0 0">Drop any change you want here. You'll see its status update as it's worked on.</p></div><button class="primary" data-act="feedback">+ New feedback</button></div>
  ${list.length?`<div class="fblist">${list.map(f=>{const st=FB_STATUS[f.status]||FB_STATUS.new;return `<div class="panel fbitem">
    <div class="spread"><div class="row"><span class="pill info">${esc(FB_KIND[f.kind]||f.kind)}</span>${f.area?`<span class="muted sm-t">${esc(f.area)}</span>`:""}${f.rating?`<span class="stars" aria-label="${f.rating} of 5">${"★".repeat(f.rating)}${"☆".repeat(5-f.rating)}</span>`:""}</div><span class="pill ${st[0]}">${st[1]}</span></div>
    <p class="fbmsg">${esc(f.message)}</p>
    ${f.reply?`<div class="fbreply"><div class="eyebrow">Reply</div>${esc(f.reply)}</div>`:""}
    <div class="muted sm-t">${esc(new Date(f.created_at).toLocaleString())}</div></div>`}).join("")}</div>`
  :`<div class="panel"><div class="empty"><h2>Nothing sent yet</h2><p>Spotted something clunky? Want a new stat or screen? Tell us in a sentence or two.</p><button class="primary" data-act="feedback">Drop your review</button></div></div>`}`;
}
