"use client";
import { FormEvent, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login(){
  const [signup,setSignup]=useState(false);
  const [msg,setMsg]=useState("");
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const email=String(f.get("email")||"");
    const password=String(f.get("password")||"");
    const s=supabaseBrowser();
    const r=signup?await s.auth.signUp({email,password}):await s.auth.signInWithPassword({email,password});
    if(r.error){setMsg(r.error.message);return}
    if(signup&&!r.data.session){setMsg("Confirme seu e-mail e depois entre.");return}
    location.href="/dashboard";
  }
  return <main className="login-wrap"><section className="login-card">
    <div className="logo">Eng<span>Hub</span></div>
    <h1 className="section-title">{signup?"Criar conta":"Entrar"}</h1>
    <form className="stack" onSubmit={submit}>
      <input className="input" name="email" type="email" placeholder="E-mail" required/>
      <input className="input" name="password" type="password" minLength={6} placeholder="Senha" required/>
      {msg&&<div className="warning">{msg}</div>}
      <button className="btn">{signup?"Cadastrar":"Entrar"}</button>
      <button className="btn secondary" type="button" onClick={()=>setSignup(!signup)}>
        {signup?"Já tenho conta":"Criar conta"}
      </button>
    </form>
  </section></main>
}
