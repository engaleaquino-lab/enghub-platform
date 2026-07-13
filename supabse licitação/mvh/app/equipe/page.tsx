
"use client";

import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { addTeamMember, getTeam, removeTeamMember, TeamMember } from "@/lib/store";

export default function Team(){
  const [items,setItems]=useState<TeamMember[]>([]);
  const [open,setOpen]=useState(false);
  const load=()=>setItems(getTeam());
  useEffect(()=>load(),[]);

  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    addTeamMember({
      name:String(f.get("name")||""),
      email:String(f.get("email")||""),
      role:String(f.get("role")||"Colaborador"),
      status:String(f.get("status")||"Ativo")
    });
    setOpen(false);load();
  }

  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Equipe</h1><div className="muted">Usuários e responsabilidades</div></div><button className="btn" onClick={()=>setOpen(true)}>Adicionar integrante</button></div>
    <section className="card">
      {items.length?<table className="table"><thead><tr><th>Nome</th><th>E-mail</th><th>Função</th><th>Status</th><th></th></tr></thead><tbody>
        {items.map(x=><tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td>{x.role}</td><td>{x.status}</td><td><button className="btn danger" onClick={()=>{removeTeamMember(x.id);load()}}>Excluir</button></td></tr>)}
      </tbody></table>:<div className="empty">Nenhum integrante cadastrado.</div>}
    </section>
    <Modal open={open} title="Adicionar integrante" onClose={()=>setOpen(false)}>
      <form className="form-grid" onSubmit={submit}>
        <div className="field"><label>Nome</label><input className="input" name="name" required/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" name="email" required/></div>
        <div className="field"><label>Função</label><select className="input" name="role"><option>Administrador</option><option>Engenheiro</option><option>Arquiteto</option><option>Financeiro</option><option>Fiscal de obra</option><option>Colaborador</option></select></div>
        <div className="field"><label>Status</label><select className="input" name="status"><option>Ativo</option><option>Convidado</option><option>Inativo</option></select></div>
        <div className="full actions"><button className="btn" type="submit">Salvar</button><button className="btn secondary" type="button" onClick={()=>setOpen(false)}>Cancelar</button></div>
      </form>
    </Modal>
  </AppShell>
}
