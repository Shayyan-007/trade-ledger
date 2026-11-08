// App shell: routing, rendering, global actions, auth and update notifications.
import {S,$,$$,esc,ymd,addDays,setRender,write,remove,toast,loadAll,account,activeAccounts,defaultAccountId,loadFirms} from "./core.js";
import {vDashboard,vToday,vTrades,vCalendar,vStatement,vPlaybook,vAccounts,vFeedback,bind,drills,calcRun} from "./views.js";
import {tradeModal,setupModal,accountModal,txnModal,instrumentModal,seedInstruments,feedbackModal} from "./forms.js";
import {exportCsv,exportStatementXlsx,importModal} from "./io.js";

const CFG=window.TL_CONFIG||{};
const ROUTES={dashboard:vDashboard,today:vToday,trades:vTrades,calendar:vCalendar,statement:vStatement,playbook:vPlaybook,accounts:vAccounts,feedback:vFeedback};
const route=()=>{const h=location.hash.slice(1);return ROUTES[h]?h:(h==="account"?"accounts":"dashboard")};

function renderApp(force){
  const view=$("#view");if(!view)return;
  if(!force&&view.contains(document.activeElement)&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){S.pending=true;return}
  if(!force&&$("#scrim")){S.pending=true;return}
  S.pending=false;const r=route();
  $$("#tabs a").forEach(a=>{if(a.getAttribute("href")==="#"+r)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
  renderSwitcher();
  if(!S.live){view.innerHTML=statusPanel();return}
  const sy=scrollY;drills.clear();
  try{view.innerHTML=ROUTES[r]();bind[r]&&bind[r]()}catch(e){console.error(e);view.innerHTML=`<div class="panel"><div class="empty"><h2>Something went wrong on this screen</h2><p>${esc(e.message)}</p></div></div>`}
  scrollTo(0,sy);
}
setRender(renderApp);
function statusPanel(){
  if(S.err)return `<div class="panel"><div class="empty"><h2>Your journal couldn't load</h2><p>${esc(S.err)}</p><button data-act="reload">Try again</button></div></div>`;
  return `<div class="panel"><div class="empty"><h2>Opening your journal…</h2><p>Your trades, accounts and notes load here in a moment.</p></div></div>`;
}
function renderSwitcher(){
  const sel=$("#acctSwitch");if(!sel)return;const accts=activeAccounts();
  sel.innerHTML=`<option value="all">All accounts</option>`+accts.map(a=>`<option value="${esc(a.id)}">${esc(a.name)}</option>`).join("");
  sel.value=S.f.account!=="all"&&!account(S.f.account)?"all":S.f.account;sel.hidden=accts.length<2;
}
document.addEventListener("focusout",()=>setTimeout(()=>{if(S.pending&&!$("#view").contains(document.activeElement)&&!$("#scrim"))renderApp()},0));
addEventListener("hashchange",()=>{renderApp(true);scrollTo(0,0)});

/* ---------- global actions ---------- */
document.addEventListener("click",e=>{
  const a=e.target.closest("[data-act]");
  if(a){const act=a.dataset.act,id=a.dataset.id;
    const A={
      addTrade:()=>tradeModal(),addSetup:()=>setupModal(),addAccount:()=>accountModal(),editAccount:()=>accountModal(id),
      addTxn:()=>txnModal(id),editTxn:()=>{const x=S.txns.find(t=>t.id===id);if(x)txnModal(x.accountId,id)},
      addInstrument:()=>instrumentModal(),editInstrument:()=>instrumentModal(id),seedInstruments:()=>seedInstruments(),
      prevDay:()=>{S.date=addDays(S.date,-1);renderApp(true)},nextDay:()=>{S.date=addDays(S.date,1);renderApp(true)},goToday:()=>{S.date=ymd(new Date());renderApp(true)},
      prevM:()=>shiftMonth(-1),nextM:()=>shiftMonth(1),thisM:()=>{S.month=ymd(new Date()).slice(0,7);renderApp(true)},
      csv:exportCsv,xlsx:exportStatementXlsx,print:()=>window.print(),import:importModal,signout:signOut,reload:()=>location.reload(),
      clearFilters:()=>{Object.assign(S.f,{period:"all",from:"",to:"",setup:"",symbol:"",side:"",source:""});renderApp(true)},
      clearDrill:()=>{S.f.drill=null;renderApp(true)},
      pickAccount:()=>{setAccount(id)},
      refreshApp:()=>applyUpdate(),
      toggleTheme:()=>toggleTheme(),
      feedback:()=>feedbackModal({onSent:loadFeedback}),
      hideFbBanner:()=>{try{localStorage.setItem("tl.fbBanner","off")}catch{}renderApp(true)}
    };
    A[act]&&A[act]();return;}
  const dr=e.target.closest("[data-drill]");if(dr){const d=drills.get(dr.dataset.drill);if(d){S.f.drill=d;S.f.result="";location.hash="trades";renderApp(true)}return}
  const tr=e.target.closest("[data-trade]");if(tr&&!$("#scrim")){tradeModal(tr.dataset.trade);return}
  const sb=e.target.closest("[data-setup]");if(sb){setupModal(sb.dataset.setup);return}
  const cd=e.target.closest("[data-day]");if(cd){S.date=cd.dataset.day;location.hash="today";renderApp(true);return}
  const ws=e.target.closest("[data-wstat]");if(ws){const w=S.watch.find(x=>x.id===ws.dataset.wstat);if(!w)return;const order=["Watching","Triggered","Passed"];write("watch/"+w.id,{...w,status:order[(order.indexOf(w.status||"Watching")+1)%3]});return}
  const wd=e.target.closest("[data-wdel]");if(wd){remove("watch/"+wd.dataset.wdel);return}
});
document.addEventListener("keydown",e=>{if(e.key!=="Enter")return;const el=e.target.closest&&e.target.closest("[data-trade],[data-drill]");if(el&&!$("#scrim")&&el.tagName!=="BUTTON"){e.preventDefault();el.click()}});
function shiftMonth(n){const [y,m]=S.month.split("-").map(Number);S.month=ymd(new Date(y,m-1+n,1)).slice(0,7);renderApp(true)}
function setAccount(id){S.f.account=id||"all";try{localStorage.setItem("tl.account",S.f.account)}catch{}if(id&&id!=="all"&&S.cfg.activeAccount!==id)write("config/main",{...S.cfg,activeAccount:id},{silent:true});renderApp(true)}
$("#acctSwitch").addEventListener("change",e=>setAccount(e.target.value));

/* ---------- light / dark theme ---------- */
const darkMQ=matchMedia("(prefers-color-scheme: dark)");
function effectiveTheme(){const t=document.documentElement.getAttribute("data-theme");return t==="light"||t==="dark"?t:(darkMQ.matches?"dark":"light")}
function syncThemeUI(){
  const dark=effectiveTheme()==="dark";
  $$(".themebtn").forEach(b=>{b.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");b.title=dark?"Light mode":"Dark mode";b.dataset.mode=dark?"dark":"light"});
  $$('meta[name="theme-color"]').forEach(m=>{m.setAttribute("content",dark?"#16202A":"#FFFFFF");m.setAttribute("media","all")});
}
function toggleTheme(){
  const next=effectiveTheme()==="dark"?"light":"dark";
  document.documentElement.setAttribute("data-theme",next);
  try{localStorage.setItem("tl.theme",next)}catch{}
  syncThemeUI();
}
if(darkMQ.addEventListener)darkMQ.addEventListener("change",syncThemeUI);
syncThemeUI();

/* ---------- update notification ---------- */
let loadedVersion=null,newVersion=null;
async function loadFeedback(){if(!S.db)return;const {data}=await S.db.from("feedback").select("*").order("created_at",{ascending:false}).limit(200);S.feedback=data||[];if(route()==="feedback")renderApp(true)}
async function fetchVersion(){try{const r=await fetch("version.json?t="+Date.now(),{cache:"no-store"});if(!r.ok)return null;const j=await r.json();return j.v||null}catch{return null}}
async function checkVersion(){
  const v=await fetchVersion();if(!v)return;
  if(!loadedVersion){loadedVersion=v;window.__appVersion=v;return}
  if(v!==loadedVersion&&v!==newVersion){newVersion=v;showUpdate()}
}
function showUpdate(){
  if($("#updBar"))return;const b=document.createElement("div");b.id="updBar";b.className="updbar";b.setAttribute("role","status");
  b.innerHTML=`<span><b>A new version of Trade Ledger is ready.</b> Refresh to get the latest.</span><button class="primary" data-act="refreshApp">Refresh</button>`;
  document.body.appendChild(b);
}
async function applyUpdate(){
  const btn=$("#updBar button");if(btn){btn.disabled=true;btn.textContent="Updating…"}
  try{const reg=await navigator.serviceWorker?.getRegistration();if(reg){await reg.update();if(reg.waiting)reg.waiting.postMessage("skipWaiting")}
    if(window.caches){const ks=await caches.keys();await Promise.all(ks.map(k=>caches.delete(k)))}}catch{}
  location.reload();
}
setInterval(checkVersion,90*1000);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")checkVersion()});
addEventListener("focus",checkVersion);

/* ---------- data refresh when returning to the app ---------- */
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.live&&!$("#scrim")&&!(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)))loadAll().then(()=>renderApp()).catch(()=>{})});

/* ---------- auth ---------- */
function showApp(on){$("#authScreen").hidden=on;$("#appShell").hidden=!on}
async function startApp(session){
  S.uid=session.user.id;S.email=session.user.email||"";showApp(true);renderApp(true);
  if(window.__fromLink){toast("Email confirmed. You're signed in.");window.__fromLink=false}
  try{await loadAll();S.live=true;S.err="";
    try{const saved=localStorage.getItem("tl.account");if(saved&&(saved==="all"||account(saved)))S.f.account=saved}catch{}
  }catch(e){S.err="Check your connection and try again."}
  renderApp(true);loadFirms();loadFeedback();
  // one-time invitation to leave feedback, shortly after first sign-in
  let seen=false;try{seen=!!localStorage.getItem("tl.fbPrompt")}catch{}
  if(!seen&&S.live)setTimeout(()=>{if(!$("#scrim")){try{localStorage.setItem("tl.fbPrompt","shown")}catch{}feedbackModal({intro:true,onSent:loadFeedback})}},4000);
}
async function signOut(){try{await S.db.auth.signOut()}finally{location.hash="";location.reload()}}
function authMsg(t,bad){const m=$("#authMsg");m.textContent=t;m.className="authmsg"+(bad?" bad":"");m.hidden=!t}
function setMode(mode){
  const f=$("#authForm");f.dataset.mode=mode;$("#authDone").hidden=true;
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
  doneKind=kind;["#authTitle","#authSub","#authEmailWrap","#authPwWrap","#authSubmit",".authlinks"].forEach(sel=>$(sel).hidden=true);
  authMsg("");$("#authDone").hidden=false;const e=`<b>${esc(email)}</b>`;
  if(kind==="signup"){$("#doneTitle").textContent="Account created";$("#doneText").innerHTML=`We sent a confirmation link to ${e}.`;
    $("#doneSteps").innerHTML="<li>Open the email from Supabase (check spam if it isn't there in a minute).</li><li>Tap <b>Confirm your mail</b>. You'll land back here, signed in.</li><li>If you open the link on another device, come back and sign in here.</li>"}
  else{$("#doneTitle").textContent="Reset link sent";$("#doneText").innerHTML=`If ${e} has an account, a reset link is on its way.`;$("#doneSteps").innerHTML="<li>Open the email and tap the reset link.</li><li>You'll come back here to choose a new password.</li>"}
  $("#doneResend").disabled=false;$("#doneResend").textContent="Resend email";$("#doneSignin").focus();
}
function bindAuth(){
  $("#toSignup").onclick=()=>setMode("signup");$("#toReset").onclick=()=>setMode("reset");$("#toSignin").onclick=()=>setMode("signin");
  $("#doneSignin").onclick=()=>{setMode("signin");$("#authPw").value="";$("#authPw").focus()};
  $("#doneResend").onclick=async()=>{const btn=$("#doneResend"),email=$("#authEmail").value.trim();btn.disabled=true;btn.textContent="Sending…";
    try{const {error}=doneKind==="signup"?await S.db.auth.resend({type:"signup",email,options:{emailRedirectTo:location.origin+location.pathname}}):await S.db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});
      if(error)throw error;btn.textContent="Sent again";setTimeout(()=>{btn.disabled=false;btn.textContent="Resend email"},30000)}
    catch(err){btn.disabled=false;btn.textContent=/rate|seconds/i.test(err.message||"")?"Wait a minute, then retry":"Couldn't send. Retry"}};
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
  bindAuth();setMode("signin");checkVersion();
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
if("serviceWorker" in navigator&&location.protocol==="https:"){
  navigator.serviceWorker.register("sw.js").catch(()=>{});
  let reloaded=false;navigator.serviceWorker.addEventListener("controllerchange",()=>{if(newVersion&&!reloaded){reloaded=true;location.reload()}});
}
