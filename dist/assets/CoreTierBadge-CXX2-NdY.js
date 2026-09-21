import{c as a,j as r,Y as c}from"./index-DXztRpbh.js";import{K as d,L as h}from"./slip-R9kWxmvg.js";import{S as y}from"./shield-check-CmdfYhrJ.js";/**
 * @license lucide-react v0.522.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const g=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],b=a("chevron-right",g);/**
 * @license lucide-react v0.522.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const x=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["polyline",{points:"12 6 12 12 16 14",key:"68esgv"}]],$=a("clock",x);/**
 * @license lucide-react v0.522.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["line",{x1:"4",x2:"20",y1:"9",y2:"9",key:"4lhtct"}],["line",{x1:"4",x2:"20",y1:"15",y2:"15",key:"vyu0kd"}],["line",{x1:"10",x2:"8",y1:"3",y2:"21",key:"1ggp8o"}],["line",{x1:"16",x2:"14",y1:"3",y2:"21",key:"weycgp"}]],f=a("hash",k);function _({tier:s,confidence:e=null,legacy:n=!1,className:o=""}){const l="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-label";if(!s)return n?r.jsx("span",{title:"Ez a sor a core szintezés bevezetése előtt készült — akkor nem kapott szintet, ezért nem is tulajdonítunk neki egyet visszamenőleg.",className:`${l} border-border bg-elevated text-muted-foreground ${o}`,children:"Örökölt core"}):null;const t=s==="secondary",i=t&&e?` · konf. ${Math.round(e.value)} / ${e.threshold}`:"";return r.jsxs("span",{title:`${d[s]} — ${h[s]}${t&&e?` Mért piaci konfidencia: ${Math.round(e.value)}, elsődleges küszöb: ${e.threshold}.`:""}`,className:`${l} ${t?"border-chart-4/40 bg-chart-4/10 text-chart-4":"border-signal/40 bg-signal-soft text-signal"} ${o}`,children:[t?r.jsx(c,{className:"h-2.5 w-2.5","aria-hidden":!0}):r.jsx(y,{className:"h-2.5 w-2.5","aria-hidden":!0}),t?"Másodlagos":"Elsődleges",i]})}export{b as C,f as H,_ as a,$ as b};
