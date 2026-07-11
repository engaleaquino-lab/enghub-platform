
"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

type Member={id:string;role:string;status:string;profiles?:{full_name?:string}|null;user_id:string};

export default function Admin(){
  const [members,setMembers]=useState<Member[]>([]);
  const [email,setEmail]=useState("");
  const [role,setRole]=useState("member");
  const [message,setMessage]=useState("");
  const [inviteUrl,setInviteUrl]=useState("");

  async function load(){
    const supabase=createSupabaseBrowserClient();
    const {data,error}=await supabase
      .from("organization_members")
      .select("id,user_id,role,status");
    if(!error) setMembers(data||[]);
  }

  useEffect(()=>{load()},[]);

  async function invite(){
    setMessage("");setInviteUrl("");
    const res=await fetch("/api/invite",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({email,role})
    });
    const data=await res.json();
    if(!res.ok){setMessage(data.error||"Erro ao convidar.");return}
    setInviteUrl(data.inviteUrl);
    setMessage("Convite criado.");
    setEmail("");
  }

  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Administração</h1><div className="muted">Empresa, usuários e permissões</div></div><div className="actions"><a className="btn secondary" href="/admin/migracao">Migrar dados</a><span className="badge">Supabase</span></div></div>
    <div className="grid two">
      <section className="card">
        <h3>Convidar integrante</h3>
        <div className="stack">
          <input className="input" type="email" placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)}/>
          <select className="input" value={role} onChange={e=>setRole(e.target.value)}>
            <option value="admin">Administrador</option>
            <option value="engineer">Engenheiro</option>
            <option value="architect">Arquiteto</option>
            <option value="finance">Financeiro</option>
            <option value="member">Colaborador</option>
          </select>
          <button className="btn" onClick={invite}>Criar convite</button>
          {message&&<div className="note">{message}</div>}
          {inviteUrl&&<div className="file-box"><div className="muted">Link de convite</div><input className="input" readOnly value={inviteUrl}/></div>}
        </div>
      </section>
      <section className="card">
        <h3>Integrantes</h3>
        {members.length?<table className="table"><thead><tr><th>Usuário</th><th>Função</th><th>Status</th></tr></thead><tbody>
          {members.map(m=><tr key={m.id}><td>{m.user_id}</td><td>{m.role}</td><td>{m.status}</td></tr>)}
        </tbody></table>:<div className="empty">Nenhum integrante retornado.</div>}
      </section>
    </div>
  </AppShell>
}
