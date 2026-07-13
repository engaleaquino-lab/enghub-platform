
"use client";

import { useState } from "react";
import AppShell from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getBids, getContracts } from "@/lib/store";

export default function Migration(){
  const [message,setMessage]=useState("");

  async function migrate(){
    setMessage("Migrando...");
    const supabase=createSupabaseBrowserClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Faça login para migrar.");return}

    const {data:membership,error:membershipError}=await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id",user.id)
      .limit(1)
      .single();

    if(membershipError || !membership){setMessage("Empresa não encontrada.");return}

    const contracts=getContracts().map(c=>({
      id:c.id,
      organization_id:membership.organization_id,
      contract_number:c.contractNumber,
      client_name:c.clientName,
      object:c.object,
      contract_value:c.contractValue,
      measured_value:c.measuredValue,
      received_value:c.receivedValue,
      status:c.status,
      created_by:user.id
    }));

    const bids=getBids().map(b=>({
      id:b.id,
      organization_id:membership.organization_id,
      title:b.title,
      agency:b.agency,
      session_date:b.sessionDate,
      estimated_value:b.estimatedValue,
      status:b.status,
      created_by:user.id
    }));

    const c=contracts.length?await supabase.from("contracts").upsert(contracts):{error:null};
    if(c.error){setMessage(c.error.message);return}
    const b=bids.length?await supabase.from("bids").upsert(bids):{error:null};
    if(b.error){setMessage(b.error.message);return}

    setMessage(`Migração concluída: ${contracts.length} contratos e ${bids.length} licitações.`);
  }

  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Migração para Supabase</h1><div className="muted">Transfira dados locais para o banco real</div></div><span className="badge">v0.5</span></div>
    <section className="card">
      <h3>Dados do navegador</h3>
      <p className="muted">Esta ferramenta envia os contratos e licitações armazenados no localStorage para a organização do usuário autenticado.</p>
      <button className="btn" onClick={migrate}>Iniciar migração</button>
      {message&&<div className="note" style={{marginTop:16}}>{message}</div>}
    </section>
  </AppShell>
}
