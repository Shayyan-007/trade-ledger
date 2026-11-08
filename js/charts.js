// SVG charts drawn to scale, colored from theme tokens.
import {esc,shortMoney,DOW,parseD} from "./core.js";

export function niceTicks(min,max,n=4){
  if(min===max){min-=1;max+=1}
  const span=max-min;const step0=span/n;const mag=Math.pow(10,Math.floor(Math.log10(step0)));
  const step=[1,2,2.5,5,10].map(x=>x*mag).find(x=>x>=step0);
  const lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step;const t=[];
  for(let v=lo;v<=hi+step/2;v+=step)t.push(+v.toFixed(10));return t;
}

// Equity curve with an underwater (drawdown) panel below.
export function equityChart(curve,c){
  const W=820,H=300,L=62,R=16,T=12,mid=200,B=24;
  const pts=[{d:"",v:0,dd:0},...curve];
  const vals=pts.map(p=>p.v);const ticks=niceTicks(Math.min(0,...vals),Math.max(0,...vals));
  const y0=ticks[0],y1=ticks[ticks.length-1];
  const x=i=>L+(W-L-R)*(pts.length===1?0:i/(pts.length-1));
  const y=v=>T+(mid-T-14)*(1-(v-y0)/(y1-y0||1));
  const minDD=Math.min(0,...pts.map(p=>p.dd));const ddH=H-B-mid-8;
  const yd=v=>mid+8+(minDD?ddH*(v/minDD):0);
  const line=pts.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+","+y(p.v).toFixed(1)).join("");
  const area=line+`L${x(pts.length-1).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
  const ddPath=pts.map((p,i)=>(i?"L":"M")+x(i).toFixed(1)+","+yd(p.dd).toFixed(1)).join("")+`L${x(pts.length-1).toFixed(1)},${yd(0).toFixed(1)}L${x(0).toFixed(1)},${yd(0).toFixed(1)}Z`;
  const last=pts[pts.length-1];const col=last.v>=0?"var(--gain)":"var(--loss)";
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Equity curve ending at ${esc(shortMoney(last.v,c))} with drawdown panel">
  ${ticks.map(t=>`<line x1="${L}" x2="${W-R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" ${t===0?'stroke-width="1.4"':'stroke-dasharray="3 4"'}/><text x="${L-8}" y="${y(t)+4}" text-anchor="end">${esc(shortMoney(t,c))}</text>`).join("")}
  <path d="${area}" fill="${col}" opacity=".12"/>
  <path d="${line}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>
  <circle cx="${x(pts.length-1)}" cy="${y(last.v)}" r="4" fill="${col}"/>
  <text x="${L}" y="${mid+4}" class="lbl">Drawdown</text>
  <line x1="${L}" x2="${W-R}" y1="${yd(0)}" y2="${yd(0)}" stroke="var(--line)"/>
  ${minDD?`<path d="${ddPath}" fill="var(--loss)" opacity=".35"/><text x="${L-8}" y="${yd(minDD)+4}" text-anchor="end">${esc(shortMoney(minDD,c))}</text>`:`<text x="${L+80}" y="${mid+20}">No drawdown</text>`}
  <text x="${x(1)}" y="${H-6}" text-anchor="start">${esc(curve[0]?.d||"")}</text>
  <text x="${W-R}" y="${H-6}" text-anchor="end">${esc(last.d||"")}</text>
  </svg>`;
}

// Signed vertical bars with labels (e.g. monthly or weekday P&L).
export function signedBars(items,c,{H=210,labelEvery=1}={}){
  if(!items.length)return"";
  const W=Math.max(360,items.length*46),B=24,T=18;const m=Math.max(...items.map(i=>Math.abs(i.v)),1);
  const mid=T+(H-T-B)/2;const bw=(W-20)/items.length;
  return `<div class="chart-scroll"><svg class="chart" viewBox="0 0 ${W} ${H}" style="min-width:${Math.min(W,700)}px" role="img" aria-label="P&amp;L bars">
  <line x1="10" x2="${W-10}" y1="${mid}" y2="${mid}" stroke="var(--line)" stroke-width="1.4"/>
  ${items.map((it,i)=>{const h=(mid-T)*Math.abs(it.v)/m;const xx=10+i*bw+5;const w=Math.max(4,bw-10);const neg=it.v<0;
    return `<rect x="${xx}" y="${neg?mid:mid-h}" width="${w}" height="${Math.max(h,it.v?1:0)}" rx="3" fill="${neg?"var(--loss)":"var(--gain)"}" opacity=".85"><title>${esc(it.label)}: ${esc(shortMoney(it.v,c))}</title></rect>
    ${it.v?`<text x="${xx+w/2}" y="${neg?mid+h+12:mid-h-4}" text-anchor="middle">${esc(shortMoney(it.v,c))}</text>`:""}
    ${i%labelEvery===0?`<text x="${xx+w/2}" y="${H-6}" text-anchor="middle">${esc(it.label)}</text>`:""}`}).join("")}
  </svg></div>`;
}

export function rHist(list){
  if(!list.length)return`<div class="empty sm">Add stop prices to your trades to measure results in R.</div>`;
  const bins=[["≤−2",-Infinity,-2],["−2…−1",-2,-1],["−1…0",-1,0],["0…1",0,1],["1…2",1,2],["2…3",2,3],["≥3",3,Infinity]];
  const counts=bins.map(([,a,b])=>list.filter(t=>t._c.r>=a&&(t._c.r<b||b===Infinity)).length);
  const max=Math.max(...counts,1);const W=400,H=200,B=26,T=16,bw=(W-20)/bins.length;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Distribution of R multiples">
  <line x1="10" x2="${W-10}" y1="${H-B}" y2="${H-B}" stroke="var(--line)"/>
  ${bins.map(([lab,a],i)=>{const h=(H-B-T)*counts[i]/max;const xx=10+i*bw+4;return `<rect x="${xx}" y="${H-B-h}" width="${bw-8}" height="${h}" rx="3" fill="${a<0?"var(--loss)":"var(--gain)"}" opacity=".85"/>${counts[i]?`<text x="${xx+(bw-8)/2}" y="${H-B-h-4}" text-anchor="middle">${counts[i]}</text>`:""}<text x="${xx+(bw-8)/2}" y="${H-8}" text-anchor="middle">${lab}</text>`}).join("")}
  </svg>`;
}

export function weekdayItems(list){
  const out=[1,2,3,4,5].map(d=>({label:DOW[d],v:list.filter(t=>parseD(t.date).getDay()===d).reduce((s,t)=>s+t._c.pnl,0)}));
  const wk=list.filter(t=>[0,6].includes(parseD(t.date).getDay()));if(wk.length)out.push({label:"Wknd",v:wk.reduce((s,t)=>s+t._c.pnl,0)});
  return out;
}

// Tiny inline sparkline
export function spark(vals,{w=120,h=28}={}){
  if(vals.length<2)return"";const mn=Math.min(...vals,0),mx=Math.max(...vals,0);const x=i=>i/(vals.length-1)*w;const y=v=>h-2-(h-4)*(v-mn)/((mx-mn)||1);
  const last=vals[vals.length-1];const col=last>=0?"var(--gain)":"var(--loss)";
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${vals.map((v,i)=>(i?"L":"M")+x(i).toFixed(1)+","+y(v).toFixed(1)).join("")}" fill="none" stroke="${col}" stroke-width="1.6"/></svg>`;
}

// Progress bar with label
export function bar(ratio,state=""){return `<div class="meter ${state}"><i style="width:${Math.max(0,Math.min(100,(ratio||0)*100))}%"></i></div>`}
