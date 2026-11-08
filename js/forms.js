// Modal forms: trade, setup, account (with prop firm presets), deposits/withdrawals, instruments.
import {S,$,$$,esc,money,rfmt,cls,numOrNull,newId,write,remove,toast,render,MISTAKES,EMOTIONS,GRADES,ACCOUNT_TYPES,INSTRUMENT_TYPES,
  account,activeAccounts,defaultAccountId,acctOf,cur,calc,riskAmount,sizeFor,stepDecimals,instrumentFor,setupNames,guardrails,
  loadFirms,firmsStale,isProp,ymd} from "./core.js";

export function openModal(html,onMount){
  const root=$("#modalRoot");root.innerHTML=`<div class="scrim" id="scrim"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  $("#scrim").addEventListener("mousedown",e=>{if(e.target.id==="scrim")closeModal()});
  root.querySelectorAll("[data-close]").forEach(b=>b.onclick=closeModal);
  onMount&&onMount(root);const first=root.querySelector("input:not([type=hidden]),select,textarea");first&&first.focus({preventScroll:true});
}
export function closeModal(){$("#modalRoot").innerHTML="";S.pending=false;setTimeout(()=>render(true),0)}
addEventListener("keydown",e=>{if(e.key==="Escape"&&$("#scrim"))closeModal()});
export function armDelete(btn,fn,label="Delete"){btn.onclick=()=>{if(btn.classList.contains("armed"))fn();else{btn.classList.add("armed");btn.textContent="Tap again to delete";setTimeout(()=>{btn.classList.remove("armed");btn.textContent=label},3500)}}}
const head=t=>`<div class="spread"><h2>${t}</h2><button type="button" class="ghost" data-close aria-label="Close">✕</button></div>`;
const optList=(arr,v)=>arr.map(([k,l])=>`<option value="${esc(k)}" ${v===k?"selected":""}>${esc(l)}</option>`).join("");

/* ---------- TRADE ---------- */
export function tradeModal(id,preset){
  const t=id?S.trades.find(x=>x.id===id):null;
  const aid0=t?acctOf(t):defaultAccountId();const a0=account(aid0);
  const v=t||{date:S.date,side:"Long",accountId:aid0,mult:(a0&&a0.defaultMult)||1,time:new Date().toTimeString().slice(0,5),source:"Own",...(preset||{})};
  const tg=Array.isArray(v.targets)&&v.targets.length?v.targets:(v.target!=null?[{price:v.target,pct:100}]:[]);
  const mist=new Set(v.mistakes||[]);const accts=activeAccounts();
  openModal(`<form id="tForm" autocomplete="off" class="mform">
    ${head(t?"Edit trade":"Log trade")}
    <div class="fgrid">
      ${accts.length>1||(t&&!accts.find(x=>x.id===aid0))?`<label class="f">Account<select id="tAcct">${S.accounts.filter(x=>!x.archived||x.id===aid0).map(x=>`<option value="${esc(x.id)}" ${x.id===aid0?"selected":""}>${esc(x.name)}</option>`).join("")}</select></label>`:`<input type="hidden" id="tAcct" value="${esc(aid0)}">`}
      <label class="f">Date<input id="tDate" type="date" required value="${esc(v.date)}"></label>
      <label class="f">Entry time<input id="tTime" type="time" value="${esc(v.time||"")}"></label>
      <label class="f">Symbol<input id="tSym" required list="symList" value="${esc(v.symbol||"")}" placeholder="EURUSD, ES, AAPL" autocapitalize="characters"><datalist id="symList">${[...new Set([...S.instruments.map(i=>i.symbol),...S.trades.map(x=>x.symbol)].filter(Boolean))].map(s=>`<option value="${esc(s)}">`).join("")}</datalist></label>
      <div class="f">Side<div class="seg" id="tSide"><button type="button" data-side="Long" aria-pressed="${v.side!=="Short"}">Long</button><button type="button" data-side="Short" aria-pressed="${v.side==="Short"}">Short</button></div></div>
      <label class="f">Setup<input id="tSetup" list="setupList" value="${esc(v.setup||"")}"><datalist id="setupList">${setupNames().map(n=>`<option value="${esc(n)}">`).join("")}</datalist></label>
    </div>
    <fieldset class="fs"><legend>Prices &amp; size</legend><div class="fgrid">
      <label class="f">Entry<input id="tEntry" type="number" inputmode="decimal" step="any" value="${v.entry??""}"></label>
      <label class="f">Stop<input id="tStop" type="number" inputmode="decimal" step="any" value="${v.stop??""}"></label>
      <label class="f">Size<span class="inrow"><input id="tQty" type="number" inputmode="decimal" step="any" value="${v.qty??""}"><button type="button" id="tSize" class="mini" title="Fill size from your risk">Size it</button></span></label>
      <label class="f">Exit (avg)<input id="tExit" type="number" inputmode="decimal" step="any" value="${v.exit??""}" placeholder="Blank = open"></label>
      <label class="f">Exit date<input id="tExitDate" type="date" value="${esc(v.exitDate||"")}"></label>
      <label class="f">Exit time<input id="tExitTime" type="time" value="${esc(v.exitTime||"")}"></label>
      <label class="f">Fees + swap<input id="tFees" type="number" inputmode="decimal" step="any" value="${v.fees??""}"></label>
      <label class="f">Point value<input id="tMult" type="number" inputmode="decimal" step="any" value="${v.mult??1}" title="1 for stocks; 100000 per forex lot; 50 for ES"></label>
      <label class="f">Pip size<input id="tPip" type="number" inputmode="decimal" step="any" value="${v.pipSize??""}" placeholder="0.0001"></label>
      <label class="f">P&amp;L override<input id="tPnl" type="number" inputmode="decimal" step="any" value="${v.pnlOverride??""}" placeholder="Broker's net"></label>
    </div></fieldset>
    <fieldset class="fs"><legend>Targets</legend><div id="tTargets" class="targets">
      ${[0,1,2].map(i=>`<div class="tgt"><label class="f">T${i+1} price<input type="number" inputmode="decimal" step="any" class="tgP" value="${tg[i]?.price??""}"></label><label class="f">% of size<input type="number" inputmode="decimal" step="any" class="tgQ" value="${tg[i]?.pct??(i===0&&!tg.length?100:"")}"></label></div>`).join("")}
    </div></fieldset>
    <div class="calcbar" id="tCalc"></div>
    <div id="tWarn" class="warns"></div>
    <fieldset class="fs"><legend>Review</legend><div class="fgrid">
      <div class="f">Source<div class="seg" id="tSrc"><button type="button" data-src="Own" aria-pressed="${(v.source||"Own")==="Own"}">Own analysis</button><button type="button" data-src="Signal" aria-pressed="${v.source==="Signal"}">Signal</button></div></div>
      <label class="f" id="tProvWrap" ${v.source==="Signal"?"":"hidden"}>Signal provider<input id="tProv" value="${esc(v.provider||"")}"></label>
      <label class="f">Emotion at entry<select id="tEmo"><option></option>${EMOTIONS.map(e=>`<option ${v.emotion===e?"selected":""}>${e}</option>`).join("")}</select></label>
      <div class="f">Grade<div class="seg" id="tGrade">${GRADES.map(g=>`<button type="button" data-g="${g}" aria-pressed="${v.grade===g}">${g}</button>`).join("")}</div></div>
      <label class="f">Best price reached (MFE)<input id="tMfe" type="number" inputmode="decimal" step="any" value="${v.mfe??""}"></label>
      <label class="f">Worst price reached (MAE)<input id="tMae" type="number" inputmode="decimal" step="any" value="${v.mae??""}"></label>
    </div>
    <label class="ruleitem"><input type="checkbox" id="tPlan" ${v.followedPlan?"checked":""}> Followed my plan</label>
    <div style="display:grid;gap:6px"><div class="eyebrow">Mistakes</div><div class="chips" id="tMist">${MISTAKES.map(m=>`<button type="button" class="chip" data-m="${esc(m)}" aria-pressed="${mist.has(m)}">${esc(m)}</button>`).join("")}</div></div>
    <label class="f">Notes<textarea id="tNotes" placeholder="Why you took it, how it played out, what you'd do differently.">${esc(v.notes||"")}</textarea></label>
    </fieldset>
    <div class="spread">${t?`<div class="row"><button type="button" class="danger" id="tDel">Delete</button><button type="button" id="tDup">Duplicate</button></div>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">${t?"Save changes":"Log trade"}</button></div></div>
  </form>`,()=>{
    let side=v.side==="Short"?"Short":"Long",grade=v.grade||null,src=v.source||"Own";
    const segPick=(sel,attr,fn)=>{$(sel).onclick=e=>{const b=e.target.closest(`[${attr}]`);if(!b)return;fn(b.getAttribute(attr));$(sel).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));upd()}};
    segPick("#tSide","data-side",x=>side=x);
    segPick("#tSrc","data-src",x=>{src=x;$("#tProvWrap").hidden=x!=="Signal"});
    $("#tGrade").onclick=e=>{const b=e.target.closest("[data-g]");if(!b)return;grade=grade===b.dataset.g?null:b.dataset.g;$("#tGrade").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x.dataset.g===grade)))};
    $("#tMist").onclick=e=>{const b=e.target.closest("[data-m]");if(!b)return;b.setAttribute("aria-pressed",String(b.getAttribute("aria-pressed")!=="true"))};
    $("#tSym").addEventListener("change",()=>{const i=instrumentFor($("#tSym").value);if(i){$("#tMult").value=i.mult??1;if(i.pipSize)$("#tPip").value=i.pipSize}upd()});
    const targets=()=>$$("#tTargets .tgt").map(r=>({price:numOrNull(r.querySelector(".tgP").value),pct:numOrNull(r.querySelector(".tgQ").value)})).filter(x=>x.price!=null).map(x=>({price:x.price,pct:x.pct??0}));
    const read=()=>({accountId:$("#tAcct").value,date:$("#tDate").value,time:$("#tTime").value,symbol:$("#tSym").value.trim().toUpperCase(),side,setup:$("#tSetup").value.trim(),
      qty:numOrNull($("#tQty").value),entry:numOrNull($("#tEntry").value),stop:numOrNull($("#tStop").value),targets:targets(),
      exit:numOrNull($("#tExit").value),exitDate:$("#tExitDate").value||null,exitTime:$("#tExitTime").value||null,fees:numOrNull($("#tFees").value),
      mult:numOrNull($("#tMult").value)||1,pipSize:numOrNull($("#tPip").value),pnlOverride:numOrNull($("#tPnl").value),
      source:src,provider:src==="Signal"?$("#tProv").value.trim():null,emotion:$("#tEmo").value,grade,mfe:numOrNull($("#tMfe").value),mae:numOrNull($("#tMae").value),
      followedPlan:$("#tPlan").checked,mistakes:$$("#tMist [aria-pressed=true]").map(b=>b.dataset.m),notes:$("#tNotes").value});
    const sizeNow=()=>{const d=read();const a=account(d.accountId);const step=(instrumentFor(d.symbol)||{}).step||(d.mult>=1000?0.01:1);
      return sizeFor({riskAmt:riskAmount(a,d.date),entry:d.entry,stop:d.stop,mult:d.mult,step})&&{...sizeFor({riskAmt:riskAmount(a,d.date),entry:d.entry,stop:d.stop,mult:d.mult,step}),step}};
    $("#tSize").onclick=()=>{const z=sizeNow();if(!z){toast("Enter entry, stop and set a risk % on the account first.");return}$("#tQty").value=z.units.toFixed(stepDecimals(z.step));upd()};
    function upd(){
      const d=read();const a=account(d.accountId);const c=cur(a);const x=calc({...d});const risk=riskAmount(a,d.date);const z=sizeNow();
      $("#tCalc").innerHTML=`<span>Risk <b class="num">${x.risk!=null?money(x.risk,false,c):"—"}</b></span><span>Planned <b class="num">${x.plannedRR!=null?"1:"+x.plannedRR.toFixed(2):"—"}</b></span><span>P&amp;L <b class="num ${cls(x.pnl)}">${x.closed?money(x.pnl,true,c):"Open"}</b></span><span>Result <b class="num ${cls(x.r)}">${rfmt(x.r)}</b></span>${x.pips!=null?`<span>Pips <b class="num ${cls(x.pips)}">${x.pips.toFixed(1)}</b></span>`:""}${z?`<span>Suggested size <b class="num">${z.units.toFixed(stepDecimals(z.step))}</b></span>`:""}`;
      const w=[];const st=S.setups.find(s=>s.name===d.setup);const minRR=(st&&st.targetRR)||(a&&a.minRR);
      if(minRR&&x.plannedRR!=null&&x.plannedRR<minRR)w.push(["warn",`Planned R:R 1:${x.plannedRR.toFixed(2)} is below your 1:${minRR} minimum.`]);
      if(risk&&x.risk&&x.risk>risk*1.05)w.push(["bad",`Risk ${money(x.risk,false,c)} is over your ${money(risk,false,c)} per-trade limit. Tag it Oversized?`]);
      const g=a&&!t?guardrails(a,d.date):null;if(g&&g.locked)w.push(["bad","A loss limit is hit for this account. Logging this trade will count as a rule break."]);
      if(g&&g.tradesHit)w.push(["warn",`You've reached ${a.maxTradesDay} trades for the day.`]);
      $("#tWarn").innerHTML=w.map(([l,m])=>`<div class="warn ${l}">${esc(m)}</div>`).join("");
    }
    $("#tForm").addEventListener("input",upd);upd();
    $("#tForm").onsubmit=e=>{e.preventDefault();const d=read();if(!d.symbol||!d.date){toast("Add a symbol and date.");return}
      const x=calc(d);const a=account(d.accountId);const risk=riskAmount(a,d.date);
      if(risk&&x.risk&&x.risk>risk*1.05&&!d.mistakes.includes("Oversized"))d.mistakes.push("Oversized");
      const st=S.setups.find(s=>s.name===d.setup);const minRR=(st&&st.targetRR)||(a&&a.minRR);
      if(minRR&&x.plannedRR!=null&&x.plannedRR<minRR&&!d.mistakes.includes("Below min R:R"))d.mistakes.push("Below min R:R");
      if(!t){const g=a?guardrails(a,d.date):null;if(g&&g.locked&&!d.mistakes.includes("Ignored daily limit"))d.mistakes.push("Ignored daily limit")}
      delete d.target;const tid=t?t.id:newId();
      write("trades/"+tid,{...(t||{}),...d,target:null,created:t?.created||Date.now(),updatedAt:Date.now()}).then(()=>toast(t?"Trade updated":"Trade logged"));
      if(!t&&S.cfg.activeAccount!==d.accountId)write("config/main",{...S.cfg,activeAccount:d.accountId},{silent:true});
      closeModal();};
    const del=$("#tDel");if(del)armDelete(del,()=>{remove("trades/"+t.id).then(()=>toast("Trade deleted"));closeModal()});
    const dup=$("#tDup");if(dup)dup.onclick=()=>{const d=read();closeModal();tradeModal(null,{...d,exit:null,exitDate:null,exitTime:null,pnlOverride:null,date:S.date,mistakes:[],notes:"",grade:null})};
  });
}

/* ---------- SETUP ---------- */
export function setupModal(id){
  const s=id?S.setups.find(x=>x.id===id):{};
  openModal(`<form id="sForm" autocomplete="off" class="mform">${head(id?"Edit setup":"New setup")}
    <div class="fgrid"><label class="f wide2">Name<input id="sName" required value="${esc(s.name||"")}" placeholder="London breakout"></label>
      <label class="f">Market<input id="sMkt" value="${esc(s.market||"")}" placeholder="Forex majors"></label><label class="f">Timeframe<input id="sTf" value="${esc(s.timeframe||"")}" placeholder="15m"></label>
      <label class="f">Target R:R (1:x)<input id="sRR" type="number" inputmode="decimal" step="0.1" min="0" value="${s.targetRR??""}" placeholder="2"></label></div>
    <label class="f">Entry criteria<textarea id="sEntry">${esc(s.entry||"")}</textarea></label>
    <label class="f">Stop, targets &amp; management<textarea id="sMgmt">${esc(s.mgmt||"")}</textarea></label>
    <label class="f">Don't take it when<textarea id="sAvoid">${esc(s.avoid||"")}</textarea></label>
    <div class="spread">${id?`<button type="button" class="danger" id="sDel">Delete</button>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save setup</button></div></div>
  </form>`,()=>{
    $("#sForm").onsubmit=e=>{e.preventDefault();const name=$("#sName").value.trim();if(!name)return;const sid=id||newId();
      write("setups/"+sid,{name,market:$("#sMkt").value.trim(),timeframe:$("#sTf").value.trim(),targetRR:numOrNull($("#sRR").value),entry:$("#sEntry").value,mgmt:$("#sMgmt").value,avoid:$("#sAvoid").value,created:s.created||Date.now()}).then(()=>toast("Setup saved"));closeModal()};
    const del=$("#sDel");if(del)armDelete(del,()=>{remove("setups/"+id);closeModal()});
  });
}

/* ---------- ACCOUNT (with prop firm presets) ---------- */
export async function accountModal(id){
  const a=id?account(id):{type:"live",currency:"$",riskPct:1,riskBasis:"current",riskMode:"pct",beThresholdR:0.1,defaultMult:1,startDate:ymd(new Date())};
  const firms=await loadFirms();const p=a.prop||{};
  const sel=(id,v,opts)=>`<select id="${id}">${optList(opts,v)}</select>`;
  openModal(`<form id="aForm" autocomplete="off" class="mform">${head(id?"Edit account":"Add account")}
    <div class="fgrid">
      <label class="f wide2">Name<input id="aName" required value="${esc(a.name||"")}" placeholder="FundingPips 5K"></label>
      <label class="f">Type${sel("aType",a.type,ACCOUNT_TYPES)}</label>
      <label class="f">Broker / platform<input id="aBroker" value="${esc(a.broker||"")}" placeholder="MT5"></label>
      <label class="f">Currency symbol<input id="aCur" value="${esc(a.currency||"$")}" maxlength="4"></label>
      <label class="f">Starting balance<input id="aStart" type="number" inputmode="decimal" step="any" value="${a.startBalance??""}"></label>
      <label class="f">Start date<input id="aDate" type="date" value="${esc(a.startDate||"")}"></label>
    </div>
    <fieldset class="fs" id="propFs" ${isProp(a)?"":"hidden"}><legend>Prop firm rules</legend>
      <div class="fgrid">
        <label class="f">Firm<select id="pFirm"><option value="">Custom / other</option>${firms.firms.map(f=>`<option value="${esc(f.id)}" ${p.firmId===f.id?"selected":""}>${esc(f.name)}</option>`).join("")}</select></label>
        <label class="f">Program<select id="pProg"></select></label>
      </div>
      <div id="pNote" class="muted sm-t"></div>
      <div class="fgrid">
        <label class="f">Profit target %<input id="pTgtP" type="number" inputmode="decimal" step="any" value="${p.profitTargetPct??""}"></label>
        <label class="f">or amount<input id="pTgtA" type="number" inputmode="decimal" step="any" value="${p.profitTargetAmt??""}"></label>
        <label class="f">Max daily loss %<input id="pDayP" type="number" inputmode="decimal" step="any" value="${p.maxDailyLossPct??""}"></label>
        <label class="f">or amount<input id="pDayA" type="number" inputmode="decimal" step="any" value="${p.maxDailyLossAmt??""}"></label>
        <label class="f">Max total loss %<input id="pTotP" type="number" inputmode="decimal" step="any" value="${p.maxTotalLossPct??""}"></label>
        <label class="f">or amount<input id="pTotA" type="number" inputmode="decimal" step="any" value="${p.maxTotalLossAmt??""}"></label>
        <label class="f">Drawdown type${sel("pDD",p.ddType||"static",[["static","Static"],["trailing","Trailing (intraday)"],["eod-trailing","Trailing (end of day)"]])}</label>
        <label class="f">Min trading days<input id="pMin" type="number" inputmode="numeric" step="1" value="${p.minDays??""}"></label>
        <label class="f">Time limit (days)<input id="pTime" type="number" inputmode="numeric" step="1" value="${p.timeLimitDays??""}"></label>
        <label class="f">Consistency (best day max %)<input id="pCons" type="number" inputmode="decimal" step="any" value="${p.consistencyPct??""}"></label>
        <label class="f">Profit split %<input id="pSplit" type="number" inputmode="decimal" step="any" value="${p.profitSplit??""}"></label>
      </div>
      <details><summary>Firm not listed?</summary><div class="row" style="align-items:end;margin-top:8px"><label class="f" style="flex:1 1 160px">Firm<input id="rqFirm"></label><label class="f" style="flex:1 1 160px">Program<input id="rqProg"></label><button type="button" id="rqSend">Request this firm</button></div><p class="muted sm-t">Enter the rules above by hand for now. Requests are added in the next presets update.</p></details>
    </fieldset>
    <fieldset class="fs"><legend>Risk &amp; guardrails</legend><div class="fgrid">
      <label class="f">Risk mode${sel("aMode",a.riskMode||"pct",[["pct","% of balance"],["amount","Fixed amount"]])}</label>
      <label class="f" id="aRiskPW">Risk % per trade<input id="aRisk" type="number" inputmode="decimal" step="0.05" value="${a.riskPct??""}"></label>
      <label class="f" id="aRiskAW">Risk amount<input id="aRiskAmt" type="number" inputmode="decimal" step="any" value="${a.riskAmount??""}"></label>
      <label class="f" id="aBasisW">% of${sel("aBasis",a.riskBasis||"current",[["current","Current balance"],["start","Starting balance"]])}</label>
      <label class="f">Min R:R (1:x)<input id="aRR" type="number" inputmode="decimal" step="0.1" value="${a.minRR??""}" placeholder="2"></label>
      <label class="f">Daily loss limit<input id="aDL" type="number" inputmode="decimal" step="any" value="${a.dailyLossAmt??""}" placeholder="amount"></label>
      <label class="f">Weekly loss limit %<input id="aWL" type="number" inputmode="decimal" step="any" value="${a.weeklyLossPct??""}" placeholder="3"></label>
      <label class="f">Max SLs in a row (week)<input id="aCL" type="number" inputmode="numeric" step="1" value="${a.maxConsecLosses??""}" placeholder="2"></label>
      <label class="f">Max trades per day<input id="aMT" type="number" inputmode="numeric" step="1" value="${a.maxTradesDay??""}"></label>
      <label class="f">Breakeven band (±R)<input id="aBE" type="number" inputmode="decimal" step="0.05" value="${a.beThresholdR??0.1}"></label>
      <label class="f">Default point value<input id="aMult" type="number" inputmode="decimal" step="any" value="${a.defaultMult??1}"></label>
    </div></fieldset>
    <div class="spread">${id?`<div class="row"><button type="button" class="danger" id="aDel">Delete</button><button type="button" id="aArch">${a.archived?"Unarchive":"Archive"}</button></div>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save account</button></div></div>
  </form>`,()=>{
    const progs=()=>{const f=firms.firms.find(x=>x.id===$("#pFirm").value);return f?f.programs:[]};
    const fillProg=()=>{const ps=progs();$("#pProg").innerHTML=ps.length?ps.map(x=>`<option value="${esc(x.id)}" ${p.programId===x.id?"selected":""}>${esc(x.name)}</option>`).join(""):`<option value="">—</option>`;note()};
    const note=()=>{const pr=progs().find(x=>x.id===$("#pProg").value);$("#pNote").innerHTML=pr?`${esc(pr.notes||"")} <a href="${esc(pr.source)}" target="_blank" rel="noopener">Source</a> · checked ${esc(firms.verified)}${firmsStale()?` <span class="pill warn">may be out of date</span>`:""}`:""};
    const applyPreset=()=>{const pr=progs().find(x=>x.id===$("#pProg").value);if(!pr)return;const ph=pr.phases.find(x=>x.type===$("#aType").value)||pr.phases[0];
      const set=(id,v)=>{$(id).value=v??""};set("#pTgtP",ph.profitTargetPct);set("#pTgtA",ph.profitTargetAmt);set("#pDayP",ph.maxDailyLossPct);set("#pDayA",ph.maxDailyLossAmt);set("#pTotP",ph.maxTotalLossPct);set("#pTotA",ph.maxTotalLossAmt);
      $("#pDD").value=ph.ddType||"static";set("#pMin",ph.minDays);set("#pTime",ph.timeLimitDays);set("#pCons",ph.consistencyPct);
      if(!$("#aStart").value&&pr.sizes&&pr.sizes.length)$("#aStart").value=pr.sizes[0];note();toast("Rules filled from "+pr.name)};
    fillProg();
    $("#pFirm").onchange=()=>{fillProg();applyPreset()};$("#pProg").onchange=applyPreset;
    const modeVis=()=>{const m=$("#aMode").value;$("#aRiskPW").hidden=m!=="pct";$("#aBasisW").hidden=m!=="pct";$("#aRiskAW").hidden=m!=="amount"};modeVis();$("#aMode").onchange=modeVis;
    $("#aType").onchange=()=>{const pr=/challenge|funded/.test($("#aType").value);$("#propFs").hidden=!pr;if(pr&&$("#pProg").value)applyPreset()};
    $("#rqSend").onclick=async()=>{const firm=$("#rqFirm").value.trim();if(!firm){toast("Enter the firm's name.");return}
      const {error}=await S.db.from("firm_requests").insert({firm,program:$("#rqProg").value.trim()||null});if(error)toast("Couldn't send the request. Try again.");else{toast("Request sent");$("#rqFirm").value="";$("#rqProg").value=""}};
    $("#aForm").onsubmit=e=>{e.preventDefault();const name=$("#aName").value.trim();if(!name)return;const type=$("#aType").value;
      const f=firms.firms.find(x=>x.id===$("#pFirm").value);const pr=f&&f.programs.find(x=>x.id===$("#pProg").value);
      const prop=/challenge|funded/.test(type)?{firmId:f?f.id:null,firmName:f?f.name:null,programId:pr?pr.id:null,programName:pr?pr.name:null,
        profitTargetPct:numOrNull($("#pTgtP").value),profitTargetAmt:numOrNull($("#pTgtA").value),maxDailyLossPct:numOrNull($("#pDayP").value),maxDailyLossAmt:numOrNull($("#pDayA").value),
        maxTotalLossPct:numOrNull($("#pTotP").value),maxTotalLossAmt:numOrNull($("#pTotA").value),ddType:$("#pDD").value,minDays:numOrNull($("#pMin").value),timeLimitDays:numOrNull($("#pTime").value),
        consistencyPct:numOrNull($("#pCons").value),profitSplit:numOrNull($("#pSplit").value),presetVerified:pr?firms.verified:null}:null;
      const aid=id||newId();
      write("accounts/"+aid,{...a,name,type,broker:$("#aBroker").value.trim(),currency:$("#aCur").value.trim()||"$",startBalance:numOrNull($("#aStart").value)||0,startDate:$("#aDate").value||ymd(new Date()),
        riskMode:$("#aMode").value,riskPct:numOrNull($("#aRisk").value),riskAmount:numOrNull($("#aRiskAmt").value),riskBasis:$("#aBasis").value,minRR:numOrNull($("#aRR").value),
        dailyLossAmt:numOrNull($("#aDL").value),weeklyLossPct:numOrNull($("#aWL").value),maxConsecLosses:numOrNull($("#aCL").value),maxTradesDay:numOrNull($("#aMT").value),
        beThresholdR:numOrNull($("#aBE").value)??0.1,defaultMult:numOrNull($("#aMult").value)||1,prop,created:a.created||Date.now()}).then(()=>toast("Account saved"));
      closeModal();};
    const arch=$("#aArch");if(arch)arch.onclick=()=>{write("accounts/"+id,{...a,archived:!a.archived});closeModal()};
    const del=$("#aDel");if(del)armDelete(del,()=>{
      const n=S.trades.filter(t=>acctOf(t)===id).length;if(n){toast(`This account has ${n} trades. Archive it instead, or move its trades first.`);return}
      if(S.accounts.length<=1){toast("You need at least one account.");return}
      remove("accounts/"+id);closeModal()});
  });
}

/* ---------- DEPOSIT / WITHDRAWAL ---------- */
export function txnModal(accountId,id){
  const x=id?S.txns.find(t=>t.id===id):{accountId,date:ymd(new Date()),type:"withdrawal"};const a=account(x.accountId);
  openModal(`<form id="xForm" autocomplete="off" class="mform">${head((id?"Edit":"Add")+" deposit or withdrawal · "+esc(a?a.name:""))}
    <div class="fgrid">
      <label class="f">Type<select id="xType">${optList([["deposit","Deposit"],["withdrawal","Withdrawal"],["payout","Prop payout"]],x.type)}</select></label>
      <label class="f">Date<input id="xDate" type="date" required value="${esc(x.date)}"></label>
      <label class="f">Amount<input id="xAmt" type="number" inputmode="decimal" step="any" min="0" required value="${x.amount??""}"></label>
      <label class="f">Paid to<input id="xTo" value="${esc(x.recipient||"")}" placeholder="Name or bank"></label>
    </div>
    <label class="f">Note<input id="xNote" value="${esc(x.note||"")}"></label>
    <div class="spread">${id?`<button type="button" class="danger" id="xDel">Delete</button>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save</button></div></div>
  </form>`,()=>{
    $("#xForm").onsubmit=e=>{e.preventDefault();const amt=numOrNull($("#xAmt").value);if(!amt||amt<0){toast("Enter an amount.");return}
      write("txns/"+(id||newId()),{accountId:x.accountId,type:$("#xType").value,date:$("#xDate").value,amount:amt,recipient:$("#xTo").value.trim(),note:$("#xNote").value.trim(),created:x.created||Date.now()}).then(()=>toast("Saved"));closeModal()};
    const del=$("#xDel");if(del)armDelete(del,()=>{remove("txns/"+id);closeModal()});
  });
}

/* ---------- INSTRUMENT ---------- */
export function instrumentModal(id){
  const i=id?S.instruments.find(x=>x.id===id):{type:"forex",mult:100000,pipSize:0.0001,step:0.01};
  openModal(`<form id="iForm" autocomplete="off" class="mform">${head(id?"Edit instrument":"Add instrument")}
    <div class="fgrid">
      <label class="f">Symbol<input id="iSym" required value="${esc(i.symbol||"")}" autocapitalize="characters"></label>
      <label class="f">Type<select id="iType">${optList(INSTRUMENT_TYPES,i.type)}</select></label>
      <label class="f">Point value / contract size<input id="iMult" type="number" inputmode="decimal" step="any" value="${i.mult??1}"></label>
      <label class="f">Pip size<input id="iPip" type="number" inputmode="decimal" step="any" value="${i.pipSize??""}"></label>
      <label class="f">Size step<input id="iStep" type="number" inputmode="decimal" step="any" value="${i.step??1}"></label>
    </div>
    <p class="muted sm-t">P&amp;L = price move × size × point value, in the pair's quote currency. Forex: 100000 per standard lot, step 0.01. ES futures: 50 per point. Stocks: 1.</p>
    <div class="spread">${id?`<button type="button" class="danger" id="iDel">Delete</button>`:"<span></span>"}<div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Save</button></div></div>
  </form>`,()=>{
    $("#iType").onchange=e=>{const d={forex:[100000,0.0001,0.01],futures:[50,"",1],stock:[1,"",1],crypto:[1,"",0.001],cfd:[1,"",0.1]}[e.target.value];if(d){$("#iMult").value=d[0];$("#iPip").value=d[1];$("#iStep").value=d[2]}};
    $("#iForm").onsubmit=e=>{e.preventDefault();const sym=$("#iSym").value.trim().toUpperCase();if(!sym)return;
      write("instruments/"+(id||newId()),{symbol:sym,type:$("#iType").value,mult:numOrNull($("#iMult").value)||1,pipSize:numOrNull($("#iPip").value),step:numOrNull($("#iStep").value)||1}).then(()=>toast("Saved"));closeModal()};
    const del=$("#iDel");if(del)armDelete(del,()=>{remove("instruments/"+id);closeModal()});
  });
}
export async function seedInstruments(){
  const fx=["EURUSD","GBPUSD","AUDUSD","NZDUSD","USDCAD","USDCHF","EURGBP"].map(s=>({symbol:s,type:"forex",mult:100000,pipSize:0.0001,step:0.01}));
  const jpy=["USDJPY","EURJPY","GBPJPY"].map(s=>({symbol:s,type:"forex",mult:100000,pipSize:0.01,step:0.01}));
  const other=[{symbol:"XAUUSD",type:"cfd",mult:100,pipSize:0.1,step:0.01},{symbol:"US30",type:"cfd",mult:1,pipSize:1,step:0.1},{symbol:"NAS100",type:"cfd",mult:1,pipSize:1,step:0.1},
    {symbol:"ES",type:"futures",mult:50,pipSize:0.25,step:1},{symbol:"MES",type:"futures",mult:5,pipSize:0.25,step:1},{symbol:"NQ",type:"futures",mult:20,pipSize:0.25,step:1},{symbol:"MNQ",type:"futures",mult:2,pipSize:0.25,step:1}];
  const have=new Set(S.instruments.map(i=>i.symbol));
  const {writeMany}=await import("./core.js");
  await writeMany([...fx,...jpy,...other].filter(i=>!have.has(i.symbol)).map(i=>({kind:"instruments",id:newId(),data:i})));
  toast("Added common instruments");
}

/* ---------- FEEDBACK ---------- */
const AREAS=["Dashboard","Today","Trades","Calendar","Statement","Playbook","Accounts","Logging a trade","Phone / mobile","Something else"];
export function feedbackModal({intro=false,onSent}={}){
  const pageName=(location.hash.slice(1)||"dashboard");const guess=AREAS.find(a=>a.toLowerCase()===pageName)||"";
  openModal(`<form id="fbForm" autocomplete="off" class="mform">
    <div class="spread"><h2>${intro?"Drop any change you want here":"Send feedback"}</h2><button type="button" class="ghost" data-close aria-label="Close">✕</button></div>
    ${intro?`<p class="muted" style="margin:0">You're one of the first people using Trade Ledger. Tell us what to change, what's missing, or what's confusing. You can always come back to this from the <b>Feedback</b> button.</p>`:""}
    <div class="f">What is it?<div class="seg" id="fbKind"><button type="button" data-k="change" aria-pressed="true">Change request</button><button type="button" data-k="idea" aria-pressed="false">Idea</button><button type="button" data-k="bug" aria-pressed="false">Bug</button><button type="button" data-k="review" aria-pressed="false">Review</button></div></div>
    <div class="fgrid"><label class="f">Where?<select id="fbArea"><option value="">Anywhere</option>${AREAS.map(a=>`<option ${a===guess?"selected":""}>${a}</option>`).join("")}</select></label>
      <div class="f" id="fbRateW" hidden>Overall rating<div class="stars-in" id="fbRate">${[1,2,3,4,5].map(i=>`<button type="button" data-r="${i}" aria-label="${i} star${i>1?"s":""}">☆</button>`).join("")}</div></div></div>
    <label class="f">Your message<textarea id="fbMsg" required maxlength="4000" style="min-height:120px" placeholder="e.g. On the trade form, let me pick lots for gold. Or: the calendar should show R as well as $."></textarea></label>
    <div class="spread"><span class="muted sm-t">Only you and the app owner can read this.</span><div class="row"><button type="button" data-close>${intro?"Maybe later":"Cancel"}</button><button class="primary" type="submit" id="fbGo">Send</button></div></div>
  </form>`,()=>{
    let kind="change",rating=null;
    $("#fbKind").onclick=e=>{const b=e.target.closest("[data-k]");if(!b)return;kind=b.dataset.k;$("#fbKind").querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",String(x===b)));$("#fbRateW").hidden=kind!=="review"};
    $("#fbRate").onclick=e=>{const b=e.target.closest("[data-r]");if(!b)return;rating=+b.dataset.r;$("#fbRate").querySelectorAll("button").forEach(x=>x.textContent=+x.dataset.r<=rating?"★":"☆")};
    $("#fbForm").onsubmit=async e=>{e.preventDefault();const message=$("#fbMsg").value.trim();if(!message){toast("Write a sentence or two first.");return}
      const go=$("#fbGo");go.disabled=true;go.textContent="Sending…";
      const {error}=await S.db.from("feedback").insert({kind,area:$("#fbArea").value||null,rating:kind==="review"?rating:null,message,email:S.email||null,page:pageName,app_version:window.__appVersion||null});
      if(error){go.disabled=false;go.textContent="Send";toast("Couldn't send. Check your connection and try again.");return}
      try{localStorage.setItem("tl.fbPrompt","done")}catch{}
      closeModal();toast("Thanks! Your feedback was sent.");onSent&&onSent();};
  });
}
