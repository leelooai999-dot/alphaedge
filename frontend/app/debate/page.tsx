"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";

const API = process.env.NEXT_PUBLIC_API_URL || "";

/* ---------- types ---------- */
interface Char { id:string; name:string; role:string; avatar_emoji:string; expertise:string[] }
interface Pred { direction:string; target_price:number; confidence:number; change_pct?:number }
interface Rx { character_id:string; character_name:string; display_name:string; avatar_emoji:string; tier:string; round_num:number; action:string; prediction:Pred|null; stock_impact:string|null; responding_to:string|null }
interface Rnd { round_num:number; phase:string; reactions:Rx[]; consensus:any }
interface Sim { ticker:string; current_price:number; event:string; event_id:string; probability:number; num_rounds:number; rounds:Rnd[]; consensus:{target_price:number;confidence:number;bull_pct:number;bear_pct:number;neutral_pct:number;num_predictions:number}|null; character_predictions:any[]; characters:{id:string;name:string;role:string;tier:string;avatar_emoji:string}[]; debate_highlights:string[] }
interface XP { xp:number; level:number; title:string; next_level_xp:number; progress_pct:number; win_streak:number; max_streak:number; total_bets:number; total_wins:number; win_rate:number }
interface Tm { character_id:string; character_name:string; emoji:string; slot:number }

const RX_MAP: Record<string,string> = {fire:"🔥",brain:"🧠",cap:"🧢",money:"💰",skull:"💀",rocket:"🚀",clown:"🤡","100":"💯"};
const EVENTS = [
  {id:"fed_rate_cut",name:"Fed Rate Cut",desc:"Federal Reserve cuts interest rates unexpectedly"},
  {id:"iran_escalation",name:"Iran Escalation",desc:"Military conflict escalation in the Middle East"},
  {id:"chip_export_control",name:"Chip Export Controls",desc:"US tightens semiconductor export restrictions to China"},
  {id:"tariff_increase",name:"Tariff Increase",desc:"Broad tariff increases on imported goods"},
  {id:"recession",name:"Recession Signal",desc:"Major economic indicators point to recession"},
  {id:"oil_disruption",name:"Oil Supply Disruption",desc:"Major oil supply disruption from key producing region"},
];

export default function DebateArenaPage() {
  /* setup */
  const [chars, setChars] = useState<{main_characters:Char[];analysts:Char[]}>({main_characters:[],analysts:[]});
  const [ticker,setTicker]=useState("AAPL");
  const [evId,setEvId]=useState("fed_rate_cut");
  const [evName,setEvName]=useState("Federal Reserve Rate Cut");
  const [evDesc,setEvDesc]=useState("Federal Reserve cuts interest rates unexpectedly");
  const [prob,setProb]=useState(70);
  const [dur,setDur]=useState(30);
  const [rounds,setRounds]=useState(4);
  const [selMain,setSelMain]=useState<string[]>([]);
  const [selAn,setSelAn]=useState<string[]>([]);
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState<Sim|null>(null);
  const [vis,setVis]=useState(0);
  const [err,setErr]=useState("");
  const [did,setDid]=useState("");
  const ref=useRef<HTMLDivElement>(null);

  /* game */
  const [xp,setXp]=useState<XP|null>(null);
  const [team,setTeam]=useState<{team:Tm[];size:number}>({team:[],size:0});
  const [rxC,setRxC]=useState<Record<number,Record<string,number>>>({});
  const [pool,setPool]=useState<any>(null);
  const [betAmt,setBetAmt]=useState(10);
  const [betFor,setBetFor]=useState<string|null>(null);
  const [xpPop,setXpPop]=useState<{amt:number;reason:string}|null>(null);
  const [rxPick,setRxPick]=useState<number|null>(null);

  /* chat */
  const [chatId,setChatId]=useState<string|null>(null);
  const [chatH,setChatH]=useState<{role:string;content:string;name?:string;emoji?:string}[]>([]);
  const [chatIn,setChatIn]=useState("");
  const [chatL,setChatL]=useState(false);

  const flat = result ? result.rounds.flatMap((r,ri)=>r.reactions.map((rx,rxi)=>({...rx,phase:r.phase,gi:result.rounds.slice(0,ri).reduce((s,rr)=>s+rr.reactions.length,0)+rxi}))) : [];
  const hdr = useCallback(()=>{const t=typeof window!=="undefined"?localStorage.getItem("alphaedge_token"):null;const h:Record<string,string>={"Content-Type":"application/json"};if(t)h["Authorization"]=`Bearer ${t}`;return h;},[]);
  const logged = typeof window!=="undefined"&&!!localStorage.getItem("alphaedge_token");
  const onTeam = (id:string) => team.team.some(t=>t.character_id===id);

  useEffect(()=>{fetch(`${API}/api/characters`).then(r=>r.json()).then(setChars).catch(()=>{});if(logged){fetch(`${API}/api/debate/xp`,{headers:hdr()}).then(r=>r.ok?r.json():null).then(d=>d&&setXp(d)).catch(()=>{});fetch(`${API}/api/team`,{headers:hdr()}).then(r=>r.ok?r.json():null).then(d=>d&&setTeam(d)).catch(()=>{})}},[]);
  useEffect(()=>{if(result&&vis<flat.length){const t=setTimeout(()=>setVis(v=>v+1),vis<3?900:400);return()=>clearTimeout(t)}},[result,vis,flat.length]);
  useEffect(()=>{ref.current?.scrollTo({top:ref.current.scrollHeight,behavior:"smooth"})},[vis]);
  useEffect(()=>{if(did&&result&&vis>=flat.length){fetch(`${API}/api/debate/${did}/reactions`).then(r=>r.json()).then(setRxC).catch(()=>{});fetch(`${API}/api/debate/${did}/bets`).then(r=>r.json()).then(setPool).catch(()=>{})}},[did,vis]);
  useEffect(()=>{if(xpPop){const t=setTimeout(()=>setXpPop(null),2500);return()=>clearTimeout(t)}},[xpPop]);

  const tog=(id:string,l:string[],s:(v:string[])=>void,m:number)=>s(l.includes(id)?l.filter(c=>c!==id):l.length<m?[...l,id]:l);

  /* actions */
  const run=async()=>{setLoading(true);setErr("");setResult(null);setVis(0);setChatId(null);setChatH([]);setRxC({});setPool(null);const d=`d_${Date.now()}`;setDid(d);try{const r=await fetch(`${API}/api/characters/simulate`,{method:"POST",headers:hdr(),body:JSON.stringify({ticker,event_id:evId,event_name:evName,event_description:evDesc,probability:prob/100,duration_days:dur,num_rounds:rounds,max_main_characters:Math.min(selMain.length||3,3),max_analysts:Math.min(selAn.length||5,5)})});if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(typeof e.detail==="string"?e.detail:JSON.stringify(e.detail||e))}setResult(await r.json())}catch(e:any){setErr(e.message||"Failed")}finally{setLoading(false)}};

  const react=async(i:number,t:string)=>{try{const r=await fetch(`${API}/api/debate/reaction`,{method:"POST",headers:hdr(),body:JSON.stringify({debate_id:did,reaction_index:i,reaction_type:t})});const d=await r.json();fetch(`${API}/api/debate/${did}/reactions`).then(r=>r.json()).then(setRxC).catch(()=>{});if(d.success)setXpPop({amt:1,reason:"Reaction"});setRxPick(null)}catch{}};

  const bet=async(cid:string,cn:string,side:string)=>{if(!logged)return alert("Login to bet!");try{const r=await fetch(`${API}/api/debate/bet`,{method:"POST",headers:hdr(),body:JSON.stringify({debate_id:did,character_id:cid,character_name:cn,side,points_wagered:betAmt,ticker:result?.ticker||ticker,target_price:0,odds:1})});if(r.ok){setXpPop({amt:5,reason:`Bet ${betAmt}pts on ${cn}`});setBetFor(null);fetch(`${API}/api/debate/${did}/bets`).then(r=>r.json()).then(setPool).catch(()=>{});fetch(`${API}/api/debate/xp`,{headers:hdr()}).then(r=>r.ok?r.json():null).then(d=>d&&setXp(d)).catch(()=>{})}else{const d=await r.json();alert(d.detail||"Failed")}}catch{}};

  const draft=async(cid:string,cn:string,em:string)=>{if(!logged)return alert("Login required!");try{const r=await fetch(`${API}/api/team/draft`,{method:"POST",headers:hdr(),body:JSON.stringify({character_id:cid,character_name:cn,emoji:em})});if(r.ok){setXpPop({amt:10,reason:`Drafted ${cn}`});fetch(`${API}/api/team`,{headers:hdr()}).then(r=>r.ok?r.json():null).then(d=>d&&setTeam(d)).catch(()=>{});fetch(`${API}/api/debate/xp`,{headers:hdr()}).then(r=>r.ok?r.json():null).then(d=>d&&setXp(d)).catch(()=>{})}else{const d=await r.json();alert(d.detail||d.error||"Failed")}}catch{}};

  const drop=async(cid:string)=>{await fetch(`${API}/api/team/${cid}`,{method:"DELETE",headers:hdr()}).catch(()=>{});fetch(`${API}/api/team`,{headers:hdr()}).then(r=>r.ok?r.json():null).then(d=>d&&setTeam(d)).catch(()=>{})};

  const chat=async()=>{if(!chatIn.trim()||!chatId||!result)return;setChatL(true);const m=chatIn;setChatIn("");setChatH(h=>[...h,{role:"user",content:m}]);try{const r=await fetch(`${API}/api/characters/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({character_id:chatId,message:m,ticker:result.ticker,current_price:result.current_price,event_context:`${result.event}: ${(result.probability*100).toFixed(0)}%`,history:chatH.slice(-10)})});const d=await r.json();const c=[...chars.main_characters,...chars.analysts].find(c=>c.id===chatId);setChatH(h=>[...h,{role:"assistant",content:d.response||"...",name:c?.name,emoji:c?.avatar_emoji}])}catch{setChatH(h=>[...h,{role:"assistant",content:"Connection error."}])}finally{setChatL(false)}};

  /* helpers */
  const st=(p:Pred|null)=>p?.direction||"neutral";
  const stC=(d:string)=>d==="bullish"||d==="up"?"text-green-400":d==="bearish"||d==="down"?"text-red-400":"text-yellow-400";
  const stBg=(d:string)=>d==="bullish"||d==="up"?"border-l-green-500 bg-green-950/20":d==="bearish"||d==="down"?"border-l-red-500 bg-red-950/20":"border-l-white/20 bg-white/[0.02]";
  const phC:Record<string,string>={event_intro:"from-amber-500/20 to-amber-500/5 text-amber-400",escalation:"from-orange-500/20 to-orange-500/5 text-orange-400",resolution:"from-purple-500/20 to-purple-500/5 text-purple-400"};


  /* ========== RENDER ========== */
  return (
    <div className="min-h-screen bg-[#06060c] text-white relative">
      {/* XP popup */}
      {xpPop && (
        <div className="fixed top-20 right-6 z-[100] animate-bounce pointer-events-none">
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl px-5 py-3 shadow-2xl shadow-purple-500/30 flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div><div className="text-sm font-black">+{xpPop.amt} XP</div><div className="text-[10px] text-white/60">{xpPop.reason}</div></div>
          </div>
        </div>
      )}

      {/* header */}
      <div className="border-b border-white/[0.06] bg-[#06060c]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 bg-clip-text text-transparent">MonteCarloo</Link>
          <h1 className="text-lg font-black flex items-center gap-2">⚔️ <span className="bg-gradient-to-r from-orange-400 to-red-400 bg-clip-text text-transparent">Debate Arena</span></h1>
          <div className="flex items-center gap-3">
            {xp && <div className="hidden md:flex items-center gap-1.5 text-xs bg-white/5 rounded-full px-3 py-1.5">⚡ <span className="font-bold">Lv.{xp.level}</span> <span className="text-white/40">{xp.title}</span></div>}
            <Link href="/explore" className="text-sm text-white/40 hover:text-white/80">← Back</Link>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* ===== SETUP ===== */}
        {!result && (
          <div className="space-y-8">
            <div className="text-center py-8">
              <h2 className="text-4xl md:text-6xl font-black mb-4"><span className="bg-gradient-to-r from-orange-400 via-red-400 to-purple-500 bg-clip-text text-transparent">Who&apos;s Right?</span></h2>
              <p className="text-white/40 text-lg max-w-xl mx-auto">AI characters debate a market scenario. React. Bet. Draft your team. Climb the ranks.</p>
            </div>

            <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-white/40 mb-1 uppercase tracking-[0.2em]">Ticker</label>
                  <input value={ticker} onChange={e=>setTicker(e.target.value.toUpperCase())} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3.5 text-2xl font-mono font-black tracking-[0.15em] focus:border-purple-500/50 focus:outline-none" placeholder="AAPL" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-white/40 mb-1 uppercase tracking-[0.2em]">Scenario</label>
                  <select value={evId} onChange={e=>{const ev=EVENTS.find(p=>p.id===e.target.value);if(ev){setEvId(ev.id);setEvName(ev.name);setEvDesc(ev.desc)}}} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-3.5 focus:border-purple-500/50 focus:outline-none">
                    {EVENTS.map(ev=><option key={ev.id} value={ev.id} className="bg-[#0f0f1a]">{ev.name}</option>)}
                  </select>
                </div>
              </div>
              <input value={evDesc} onChange={e=>setEvDesc(e.target.value)} className="w-full bg-white/[0.05] border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 focus:outline-none" />
              <div className="grid grid-cols-3 gap-6">
                <div><div className="flex justify-between text-xs mb-1"><span className="text-white/40">Probability</span><span className="font-mono font-bold text-purple-400">{prob}%</span></div><input type="range" min={5} max={95} value={prob} onChange={e=>setProb(+e.target.value)} className="w-full accent-purple-500 h-1.5" /></div>
                <div><div className="flex justify-between text-xs mb-1"><span className="text-white/40">Duration</span><span className="font-mono font-bold text-blue-400">{dur}d</span></div><input type="range" min={7} max={180} value={dur} onChange={e=>setDur(+e.target.value)} className="w-full accent-blue-500 h-1.5" /></div>
                <div><div className="flex justify-between text-xs mb-1"><span className="text-white/40">Rounds</span><span className="font-mono font-bold text-orange-400">{rounds}</span></div><input type="range" min={2} max={8} value={rounds} onChange={e=>setRounds(+e.target.value)} className="w-full accent-orange-500 h-1.5" /></div>
              </div>
            </div>

            {/* Characters */}
            <div>
              <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-[0.2em]">👑 World Leaders (pick up to 3)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {chars.main_characters.map(c=>(
                  <button key={c.id} onClick={()=>tog(c.id,selMain,setSelMain,3)} className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] ${selMain.includes(c.id)?"border-purple-500/50 bg-purple-500/10 ring-1 ring-purple-500/30 shadow-lg shadow-purple-500/10":"border-white/[0.06] bg-white/[0.02] hover:border-white/20"}`}>
                    <div className="text-3xl mb-2">{c.avatar_emoji}</div>
                    <div className="text-sm font-bold">{c.name}</div>
                    <div className="text-[10px] text-white/30 mt-0.5">{c.role}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h3 className="text-xs font-bold text-white/40 mb-3 uppercase tracking-[0.2em]">📊 Analysts (pick up to 5)</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {chars.analysts.map(c=>(
                  <button key={c.id} onClick={()=>tog(c.id,selAn,setSelAn,5)} className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] ${selAn.includes(c.id)?"border-blue-500/50 bg-blue-500/10 ring-1 ring-blue-500/30":"border-white/[0.06] bg-white/[0.02] hover:border-white/20"}`}>
                    <div className="text-2xl mb-1">{c.avatar_emoji}</div>
                    <div className="text-xs font-bold">{c.name}</div>
                    <div className="text-[10px] text-white/30 truncate">{c.role}</div>
                  </button>
                ))}
              </div>
            </div>

            <button onClick={run} disabled={loading} className="w-full py-5 rounded-2xl bg-gradient-to-r from-orange-600 via-red-600 to-purple-600 hover:from-orange-500 hover:via-red-500 hover:to-purple-500 font-black text-xl transition-all disabled:opacity-50 shadow-xl shadow-red-500/20 hover:shadow-red-500/40 hover:scale-[1.01] active:scale-[0.99]">
              {loading?<span className="flex items-center justify-center gap-3"><svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>Characters debating... (~30s)</span>:"⚔️ Launch Debate"}
            </button>
            {err && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-red-400 text-sm">{err}</div>}
          </div>
        )}
