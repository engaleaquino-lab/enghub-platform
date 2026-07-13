"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

function InviteContent(){
  const params=useSearchParams();
  const token=params.get("token");
  const [message,setMessage]=useState("Verificando convite...");

  useEffect(()=>{
    async function run(){
      if(!token){setMessage("Convite inválido.");return}
      const supabase=createSupabaseBrowserClient();
      const {data:{user}}=await supabase.auth.getUser();
      if(!user){setMessage("Faça login antes de aceitar o convite.");return}

      const {data:invite,error}=await supabase
        .from("invitations")
        .select("*")
        .eq("token",token)
        .is("accepted_at",null)
        .gt("expires_at",new Date().toISOString())
        .single();

      if(error || !invite){setMessage("Convite inválido ou expirado.");return}

      const {error:memberError}=await supabase
        .from("organization_members")
        .upsert({
          organization_id:invite.organization_id,
          user_id:user.id,
          role:invite.role,
          status:"active"
        },{onConflict:"organization_id,user_id"});

      if(memberError){setMessage(memberError.message);return}

      await supabase.from("invitations").update({accepted_at:new Date().toISOString()}).eq("id",invite.id);
      setMessage("Convite aceito. Redirecionando...");
      setTimeout(()=>window.location.href="/dashboard",1200);
    }
    run();
  },[token]);

  return <main className="login-wrap"><section className="login-card"><div className="logo">Eng<span>Hub</span></div><h1 className="section-title">Convite de equipe</h1><p className="muted">{message}</p></section></main>;
}

export default function InvitePage(){
  return <Suspense fallback={<main className="login-wrap"><section className="login-card"><div className="logo">Eng<span>Hub</span></div><p className="muted">Carregando convite...</p></section></main>}><InviteContent/></Suspense>;
}
