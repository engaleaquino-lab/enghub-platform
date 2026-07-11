"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import AppShell from "@/components/AppShell";
import ContractTabs from "@/components/ContractTabs";
import {deleteRow,listRows,uploadFile} from "@/lib/supabase-data";

export default function Documents(){
  const {id}=useParams<{id:string}>();const [rows,setRows]=useState<any[]>([]),[msg,setMsg]=useState("");
  const load=async()=>setRows(await listRows("contract_documents",{contract_id:id}));useEffect(()=>{load()},[id]);
  async function upload(file:File){try{setMsg("Enviando...");await uploadFile(id,file);setMsg("Arquivo enviado.");await load()}catch(e:any){setMsg(e.message)}}
  return <AppShell><div className="topbar"><div><h1 className="section-title">Documentos</h1><div className="muted">Storage privado</div></div></div><ContractTabs id={id}/>
    <section className="card" style={{marginBottom:18}}><input type="file" onChange={e=>e.target.files?.[0]&&upload(e.target.files[0])}/>{msg&&<div className="muted">{msg}</div>}</section>
    <section className="card"><table className="table"><thead><tr><th>Documento</th><th>Categoria</th><th>Status</th><th>Arquivo</th><th></th></tr></thead><tbody>{rows.map(d=><tr key={d.id}><td>{d.name}</td><td>{d.category}</td><td>{d.status}</td><td>{d.storage_path?"Sim":"Não"}</td><td><button className="btn danger" onClick={async()=>{await deleteRow("contract_documents",d.id);await load()}}>Excluir</button></td></tr>)}</tbody></table></section>
  </AppShell>
}
