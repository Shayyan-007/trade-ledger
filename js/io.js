// Import and export: CSV, Excel statement, MT4/MT5 history.
import {S,$,esc,money,toast,newId,writeMany,ymd,account,activeAccounts,defaultAccountId,acctOf,cur,instrumentFor,tkey,typeLabel} from "./core.js";
import {openModal,closeModal} from "./forms.js";
import {statementData} from "./views.js";

let xlsxP=null;
function loadXLSX(){
  if(window.XLSX)return Promise.resolve(window.XLSX);
  if(!xlsxP)xlsxP=new Promise((res,rej)=>{const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";s.onload=()=>res(window.XLSX);s.onerror=()=>{xlsxP=null;rej(new Error("load"))};document.head.appendChild(s)});
  return xlsxP;
}
function download(name,blob){const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},800)}

const COLS=["account","date","time","exitDate","exitTime","symbol","side","setup","source","provider","qty","entry","stop","target","exit","fees","mult","pipSize","pnl","r","pips","outcome","grade","emotion","followedPlan","mistakes","notes"];
export function exportCsv(){
  const q=v=>{const s=v==null?"":String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
  const rows=S.trades.slice().sort((a,b)=>tkey(a).localeCompare(tkey(b))).map(t=>COLS.map(c=>{
    if(c==="account")return (account(acctOf(t))||{}).name||"";
    if(c==="pnl")return t._c.pnl==null?"":t._c.pnl.toFixed(2);
    if(c==="r")return t._c.r==null?"":t._c.r.toFixed(2);
    if(c==="pips")return t._c.pips==null?"":t._c.pips.toFixed(1);
    if(c==="outcome")return t._c.outcome||"";
    if(c==="target")return (t.targets&&t.targets[0]?t.targets[0].price:t.target)??"";
    if(c==="mistakes")return (t.mistakes||[]).join("; ");
    return t[c];}).map(q).join(","));
  download("trades-"+ymd(new Date())+".csv",new Blob([[COLS.join(","),...rows].join("\n")],{type:"text/csv"}));
}

export async function exportStatementXlsx(){
  let X;try{X=await loadXLSX()}catch{toast("Couldn't load the Excel exporter. Check your connection.");return}
  const a=account(S.stmt.account);if(!a)return;const D=statementData(a,S.stmt.month);const c=cur(a);
  const aoa=[["ACCOUNT STATEMENT",a.name],["Type",typeLabel(a.type)],["Currency",c],["Month",S.stmt.month],[],
    ["Account size",a.startBalance||0],["Opening balance",+D.open.toFixed(2)],["Deposits",+D.dep.toFixed(2)],["Withdrawals",+D.wd.toFixed(2)],["Month P&L",+D.st.net.toFixed(2)],["Closing balance",+D.close.toFixed(2)],[],
    ["Week","From","To","Starting balance","Trades","Wins","Losses","BE","Success ratio","Winning P&L","Losing P&L","Week P&L","Closing balance","Remarks"]];
  D.rows.forEach(w=>aoa.push([w.i,w.from,w.to,+w.startBal.toFixed(2),w.st.n,w.st.w,w.st.l,w.st.be,w.st.wr==null?"":+(w.st.wr*100).toFixed(1),+w.wins.toFixed(2),+w.loss.toFixed(2),+w.net.toFixed(2),+w.close.toFixed(2),w.remark||(w.st.n?"":"No trade")]));
  aoa.push([],["Trades"],["Date","Time","Symbol","Side","Setup","Size","Entry","Stop","Exit","P&L","R","Result","Notes"]);
  D.st.c.forEach(t=>aoa.push([t.date,t.time||"",t.symbol,t.side,t.setup||"",t.qty,t.entry,t.stop,t.exit,+t._c.pnl.toFixed(2),t._c.r==null?"":+t._c.r.toFixed(2),t._c.outcome,t.notes||""]));
  const wb=X.utils.book_new();const ws=X.utils.aoa_to_sheet(aoa);ws["!cols"]=[{wch:18},{wch:12},{wch:12},{wch:16},{wch:8},{wch:8},{wch:8},{wch:6},{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:30}];
  X.utils.book_append_sheet(wb,ws,S.stmt.month);
  const out=X.write(wb,{bookType:"xlsx",type:"array"});
  download(`${a.name.replace(/[^\w\- ]+/g,"")}-${S.stmt.month}.xlsx`,new Blob([out],{type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}));
}

/* ---------- import ---------- */
export function importModal(){
  const accts=activeAccounts();
  openModal(`<form id="imForm" class="mform"><div class="spread"><h2>Import trades</h2><button type="button" class="ghost" data-close aria-label="Close">✕</button></div>
    <p class="muted" style="margin:0">Supported: MT4/MT5 history report (Excel or HTML, from History → Report), and CSV files exported from Trade Ledger or with similar columns.</p>
    <div class="fgrid"><label class="f">Into account<select id="imAcct">${accts.map(a=>`<option value="${esc(a.id)}" ${a.id===defaultAccountId()?"selected":""}>${esc(a.name)}</option>`).join("")}</select></label>
      <label class="f wide2">File<input id="imFile" type="file" accept=".csv,.xlsx,.xls,.html,.htm"></label></div>
    <div id="imPrev"></div>
    <div class="spread"><span></span><div class="row"><button type="button" data-close>Cancel</button><button class="primary" type="submit" id="imGo" disabled>Import</button></div></div></form>`,()=>{
    let parsed=[];
    $("#imFile").onchange=async e=>{
      const f=e.target.files[0];if(!f)return;$("#imPrev").innerHTML=`<p class="muted">Reading ${esc(f.name)}…</p>`;
      try{parsed=await parseFile(f,$("#imAcct").value)}catch(err){parsed=[];$("#imPrev").innerHTML=`<div class="warn bad">${esc(err.message||"Couldn't read that file.")}</div>`;$("#imGo").disabled=true;return}
      const have=new Set(S.trades.map(t=>t.positionId?acctOf(t)+"|"+t.positionId:acctOf(t)+"|"+tkey(t)+"|"+t.symbol+"|"+t.entry+"|"+t.qty));
      parsed.forEach(t=>{t._dup=have.has(t.positionId?t.accountId+"|"+t.positionId:t.accountId+"|"+tkey(t)+"|"+t.symbol+"|"+t.entry+"|"+t.qty)});
      const fresh=parsed.filter(t=>!t._dup);const net=fresh.reduce((s,t)=>s+(t.pnlOverride??0),0);const a=account($("#imAcct").value);
      $("#imPrev").innerHTML=parsed.length?`<div class="notice"><span><b>${fresh.length}</b> new trades${parsed.length-fresh.length?`, ${parsed.length-fresh.length} already in your journal (skipped)`:""}. ${fresh.some(t=>t.pnlOverride!=null)?`Net ${money(net,true,cur(a))}.`:""}</span></div>
        <div class="tbl-wrap" style="max-height:240px"><table><thead><tr><th>Date</th><th>Symbol</th><th>Side</th><th class="n">Size</th><th class="n">Entry</th><th class="n">Exit</th><th class="n">P&amp;L</th></tr></thead><tbody>${parsed.slice(0,50).map(t=>`<tr class="${t._dup?"dup":""}"><td class="mono">${esc(t.date)} ${esc(t.time||"")}</td><td>${esc(t.symbol)}</td><td>${esc(t.side)}</td><td class="n">${t.qty??""}</td><td class="n">${t.entry??""}</td><td class="n">${t.exit??""}</td><td class="n">${t.pnlOverride!=null?t.pnlOverride.toFixed(2):""}</td></tr>`).join("")}</tbody></table></div>`:`<div class="warn bad">No trades found in that file.</div>`;
      $("#imGo").disabled=!fresh.length;
    };
    $("#imAcct").onchange=()=>{const f=$("#imFile");if(f.files[0])f.onchange({target:f})};
    $("#imForm").onsubmit=async e=>{e.preventDefault();const fresh=parsed.filter(t=>!t._dup);if(!fresh.length)return;$("#imGo").disabled=true;$("#imGo").textContent="Importing…";
      try{await writeMany(fresh.map(t=>{const {_dup,...d}=t;return {kind:"trades",id:newId(),data:{...d,created:Date.now()}}}));toast(`Imported ${fresh.length} trades`);closeModal()}
      catch{toast("Import failed part-way. Re-import the same file: duplicates are skipped.");$("#imGo").disabled=false;$("#imGo").textContent="Import"}};
  });
}

async function parseFile(f,accountId){
  const name=f.name.toLowerCase();
  if(name.endsWith(".csv")){const text=await f.text();return fromRows(csvRows(text),accountId)}
  const X=await loadXLSX();const buf=await f.arrayBuffer();
  const wb=X.read(buf,{type:"array",cellDates:false,raw:/\.html?$/.test(name)});
  for(const sn of wb.SheetNames){const rows=X.utils.sheet_to_json(wb.Sheets[sn],{header:1,raw:false,defval:""});const out=fromRows(rows,accountId);if(out.length)return out}
  return [];
}
function csvRows(text){
  const rows=[];let row=[],cell="",q=false;
  for(let i=0;i<text.length;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=ch}
    else if(ch==='"')q=true;else if(ch===","||ch===";"&&!text.includes(",")){row.push(cell);cell=""}else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;row.push(cell);rows.push(row);row=[];cell=""}else cell+=ch}
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}
const n=v=>{if(v==null||v==="")return null;const x=parseFloat(String(v).replace(/[\s,]/g,"").replace(/[^\d.\-eE]/g,""));return isFinite(x)?x:null};
function splitDT(v){const s=String(v||"").trim().replace(/\./g,"-").replace("T"," ");let m=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?/);
  if(!m){const u=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);if(u)m=[null,u[3].length===2?"20"+u[3]:u[3],u[1],u[2],u[4],u[5]]}
  if(!m)return [null,null];const z=x=>String(x).padStart(2,"0");return [`${m[1]}-${z(m[2])}-${z(m[3])}`,m[4]?`${z(m[4])}:${m[5]}`:null]}
function fromRows(rows,accountId){
  const norm=s=>String(s||"").toLowerCase().replace(/[^a-z/]/g,"");
  // MT5 "Positions" table: Time | Position | Symbol | Type | Volume | Price | S / L | T / P | Time | Price | Commission | Swap | Profit
  for(let i=0;i<rows.length;i++){
    const h=rows[i].map(norm);
    if(h.includes("position")&&h.includes("symbol")&&h.includes("profit")&&h.filter(x=>x==="time").length>=2)return mt5(rows,i,h,accountId);
    if(h.includes("ticket")&&h.includes("item")&&h.includes("profit"))return mt4(rows,i,h,accountId);
    if(h.includes("symbol")&&h.includes("date")&&(h.includes("entry")||h.includes("side")))return generic(rows,i,h,accountId);
  }
  return [];
}
function guessMult(sym,acctMult){const i=instrumentFor(sym);if(i)return {mult:i.mult??1,pipSize:i.pipSize??null};if(/^XAU/.test(sym))return {mult:100,pipSize:0.1};if(/^XAG/.test(sym))return {mult:5000,pipSize:0.01};if(/^[A-Z]{6}$/.test(sym))return {mult:100000,pipSize:/JPY/.test(sym)?0.01:0.0001};return {mult:acctMult||1,pipSize:null}}
function mt5(rows,hi,h,accountId){
  const idx=(name,nth=0)=>{let c=-1;for(let k=0;k<=nth;k++)c=h.indexOf(name,c+1);return c};
  const cT1=idx("time"),cPos=idx("position"),cSym=idx("symbol"),cType=idx("type"),cVol=idx("volume"),cP1=idx("price"),cSL=h.indexOf("s/l"),cTP=h.indexOf("t/p"),cT2=idx("time",1),cP2=idx("price",1),cCom=idx("commission"),cSwap=idx("swap"),cProf=idx("profit");
  const out=[];const a=account(accountId);
  for(let i=hi+1;i<rows.length;i++){const r=rows[i];if(!r||!r[cSym])continue;const first=norm1(r[0]);if(first==="orders"||first==="deals")break;
    const type=String(r[cType]).toLowerCase();if(!/buy|sell/.test(type))continue;
    const [d1,t1]=splitDT(r[cT1]),[d2,t2]=splitDT(r[cT2]);if(!d1)continue;
    const sym=String(r[cSym]).toUpperCase().replace(/[.\-_]?(PRO|ECN|RAW|M|I)$/,"").trim();const gm=guessMult(sym,a&&a.defaultMult);
    const com=n(r[cCom])||0,swap=n(r[cSwap])||0,prof=n(r[cProf]);
    out.push({accountId,positionId:String(r[cPos]||""),date:d1,time:t1,exitDate:d2,exitTime:t2,symbol:sym,side:/sell/.test(type)?"Short":"Long",qty:n(r[cVol]),entry:n(r[cP1]),
      stop:n(r[cSL])||null,targets:n(r[cTP])?[{price:n(r[cTP]),pct:100}]:[],exit:n(r[cP2]),fees:-(com+swap)||null,pnlOverride:prof!=null?+(prof+com+swap).toFixed(2):null,mult:gm.mult,pipSize:gm.pipSize,source:"Own",mistakes:[],imported:"mt5"});
  }
  return out;
}
const norm1=s=>String(s||"").toLowerCase().trim();
function mt4(rows,hi,h,accountId){
  const c=k=>h.indexOf(k);const times=h.map((x,i)=>x==="opentime"||x==="time"?i:-1).filter(i=>i>=0);const prices=h.map((x,i)=>x==="price"?i:-1).filter(i=>i>=0);
  const cOT=c("opentime")>=0?c("opentime"):times[0],cCT=c("closetime")>=0?c("closetime"):times[1];
  const out=[];const a=account(accountId);
  for(let i=hi+1;i<rows.length;i++){const r=rows[i];const type=String(r[c("type")]||"").toLowerCase();if(!/^(buy|sell)$/.test(type))continue;
    const [d1,t1]=splitDT(r[cOT]),[d2,t2]=splitDT(r[cCT]);const sym=String(r[c("item")]).toUpperCase();const gm=guessMult(sym,a&&a.defaultMult);
    const com=n(r[c("commission")])||0,swap=n(r[c("swap")])||0,tax=n(r[c("taxes")])||0,prof=n(r[c("profit")]);
    out.push({accountId,positionId:String(r[c("ticket")]),date:d1,time:t1,exitDate:d2,exitTime:t2,symbol:sym,side:type==="sell"?"Short":"Long",qty:n(r[c("size")]),entry:n(r[prices[0]]),stop:n(r[c("s/l")])||null,
      targets:n(r[c("t/p")])?[{price:n(r[c("t/p")]),pct:100}]:[],exit:n(r[prices[1]]),fees:-(com+swap+tax)||null,pnlOverride:prof!=null?+(prof+com+swap+tax).toFixed(2):null,mult:gm.mult,pipSize:gm.pipSize,source:"Own",mistakes:[],imported:"mt4"});
  }
  return out;
}
function generic(rows,hi,h,accountId){
  const c=k=>h.indexOf(k);const out=[];
  for(let i=hi+1;i<rows.length;i++){const r=rows[i];if(!r||!r[c("symbol")])continue;const [d,t]=splitDT(r[c("date")]);if(!d)continue;
    const g=k=>c(k)>=0?r[c(k)]:"";const side=/s(hort|ell)/i.test(g("side"))?"Short":"Long";
    out.push({accountId,date:d,time:g("time")||t,exitDate:splitDT(g("exitdate"))[0],exitTime:g("exittime")||null,symbol:String(g("symbol")).toUpperCase(),side,setup:g("setup")||"",source:/signal/i.test(g("source"))?"Signal":"Own",provider:g("provider")||null,
      qty:n(g("qty")||g("size")||g("volume")),entry:n(g("entry")),stop:n(g("stop")),targets:n(g("target"))?[{price:n(g("target")),pct:100}]:[],exit:n(g("exit")),fees:n(g("fees")),mult:n(g("mult"))||1,pipSize:n(g("pipsize")),
      pnlOverride:c("pnl")>=0&&g("exit")===""?n(g("pnl")):null,grade:g("grade")||null,emotion:g("emotion")||"",followedPlan:/true|yes|kept/i.test(g("followedplan"))?true:/false|no|broke/i.test(g("followedplan"))?false:null,
      mistakes:g("mistakes")?String(g("mistakes")).split(/;\s*/).filter(Boolean):[],notes:g("notes")||""});
  }
  return out;
}
