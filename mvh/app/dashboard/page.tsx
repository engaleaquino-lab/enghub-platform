"use client";
import {useEffect,useState} from "react";
import AppShell from "@/components/AppShell";
import {listRows,money} from "@/lib/supabase-data";

export default function Dashboard(){
  const [contracts,setContracts]=useState<any[]>([]),[bids,setBids]=useState<any[]>([]),[error,setError]=useState("");
  useEffect(()=>{(async()=>{try{setContracts(await listRows("contracts"));setBids(await listRows("bids"))}catch(e:any){setError(e.message)}})()},[]);
  const total=(k:string)=>contracts.reduce((a,c)=>a+Number(c[k]||0),0);
  return <AppShell><div className="topbar"><div><h1 className="section-title">Dashboard</h1><div className="muted">EngHub 1.0</div></div><span className="badge">Supabase</span></div>{error&&<div className="warning">{error}</div>}
    <div className="grid kpis"><div className="card"><div className="muted">Contratado</div><div className="value">{money(total("contract_value"))}</div></div><div className="card"><div className="muted">Medido</div><div className="value">{money(total("measured_value"))}</div></div><div className="card"><div className="muted">Recebido</div><div className="value">{money(total("received_value"))}</div></div><div className="card"><div className="muted">Licitações</div><div className="value">{bids.length}</div></div></div>
  </AppShell>
}
