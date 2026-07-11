"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import AppShell from "@/components/AppShell";
import ContractTabs from "@/components/ContractTabs";
import {listRows,money} from "@/lib/supabase-data";

export default function Detail(){
  const {id}=useParams<{id:string}>();const [c,setC]=useState<any>(null),[adds,setAdds]=useState<any[]>([]);
  useEffect(()=>{(async()=>{const cs=await listRows("contracts",{id});setC(cs[0]);setAdds(await listRows("addenda",{contract_id:id}))})()},[id]);
  if(!c)return <AppShell><div className="card">Carregando...</div></AppShell>;
  const av=adds.reduce((a,x)=>a+Number(x.value||0),0);
  return <AppShell><div className="topbar"><div><h1 className="section-title">Contrato {c.contract_number}</h1><div className="muted">{c.object}</div></div><span className="badge">{c.status}</span></div>
    <ContractTabs id={id}/><div className="summary">
      <div className="card"><div className="muted">Original</div><div className="value">{money(c.contract_value)}</div></div>
      <div className="card"><div className="muted">Com aditivos</div><div className="value">{money(Number(c.contract_value)+av)}</div></div>
      <div className="card"><div className="muted">Medido</div><div className="value">{money(c.measured_value)}</div></div>
      <div className="card"><div className="muted">Recebido</div><div className="value">{money(c.received_value)}</div></div>
      <div className="card"><div className="muted">Pendente</div><div className="value">{money(Number(c.measured_value)-Number(c.received_value))}</div></div>
    </div></AppShell>
}
