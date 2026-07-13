
"use client";

import { useState } from "react";

export default function SupabaseFileUpload({contractId,onUploaded}:{contractId:string,onUploaded?:()=>void}){
  const [file,setFile]=useState<File|null>(null);
  const [message,setMessage]=useState("");
  const [loading,setLoading]=useState(false);

  async function upload(){
    if(!file){setMessage("Selecione um arquivo.");return}
    setLoading(true);setMessage("");
    const form=new FormData();
    form.append("file",file);
    form.append("contractId",contractId);
    form.append("category","Arquivo");
    const res=await fetch("/api/upload",{method:"POST",body:form});
    const data=await res.json();
    if(!res.ok){setMessage(data.error||"Erro no upload.");setLoading(false);return}
    setMessage("Arquivo enviado com sucesso.");
    setFile(null);
    onUploaded?.();
    setLoading(false);
  }

  return <div className="file-box">
    <input type="file" onChange={e=>setFile(e.target.files?.[0]||null)}/>
    <button className="btn" onClick={upload} disabled={loading}>{loading?"Enviando...":"Enviar para o Supabase"}</button>
    {message&&<div className="muted" style={{marginTop:10}}>{message}</div>}
  </div>
}
