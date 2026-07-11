
"use client";

import { FormEvent, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { CompanyProfile, getProfile, saveProfile } from "@/lib/store";

export default function Profile(){
  const [profile,setProfile]=useState<CompanyProfile>(getProfile());
  const [saved,setSaved]=useState(false);
  useEffect(()=>setProfile(getProfile()),[]);

  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    saveProfile(profile);
    setSaved(true);
    setTimeout(()=>setSaved(false),2500);
  }

  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Perfil da empresa</h1><div className="muted">Dados usados nos módulos da plataforma</div></div><div className="avatar">{profile.companyName?.[0]||"E"}</div></div>
    {saved&&<div className="note" style={{marginBottom:16}}>Dados salvos com sucesso.</div>}
    <section className="card">
      <form className="profile-grid" onSubmit={submit}>
        <div className="field"><label>Empresa</label><input className="input" value={profile.companyName} onChange={e=>setProfile({...profile,companyName:e.target.value})}/></div>
        <div className="field"><label>CNPJ</label><input className="input" value={profile.cnpj} onChange={e=>setProfile({...profile,cnpj:e.target.value})}/></div>
        <div className="field"><label>Responsável</label><input className="input" value={profile.responsibleName} onChange={e=>setProfile({...profile,responsibleName:e.target.value})}/></div>
        <div className="field"><label>E-mail</label><input className="input" type="email" value={profile.email} onChange={e=>setProfile({...profile,email:e.target.value})}/></div>
        <div className="field"><label>Telefone</label><input className="input" value={profile.phone} onChange={e=>setProfile({...profile,phone:e.target.value})}/></div>
        <div className="field"><label>Cidade</label><input className="input" value={profile.city} onChange={e=>setProfile({...profile,city:e.target.value})}/></div>
        <div className="field"><label>Estado</label><input className="input" value={profile.state} onChange={e=>setProfile({...profile,state:e.target.value})}/></div>
        <div className="actions" style={{alignSelf:"end"}}><button className="btn" type="submit">Salvar perfil</button></div>
      </form>
    </section>
  </AppShell>
}
