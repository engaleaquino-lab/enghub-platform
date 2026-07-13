"use client";
import {FormEvent,useEffect,useState} from "react";
import {useParams} from "next/navigation";
import AppShell from "@/components/AppShell";
import ContractTabs from "@/components/ContractTabs";
import Modal from "@/components/Modal";
import {deleteRow,insertRow,listRows,money} from "@/lib/supabase-data";

export default function Addenda(){
  const {id}=useParams<{id:string}>();const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false);
  const load=async()=>setRows(await listRows("addenda",{contract_id:id}));useEffect(()=>{load()},[id]);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await insertRow("addenda",{contract_id:id,type:String(f.get("type")||""),description:String(f.get("description")||""),value:Number(f.get("value")||0),days:Number(f.get("days")||0),status:String(f.get("status")||"Em análise")});setOpen(false);await load()}
  return <AppShell><div className="topbar"><div><h1 className="section-title">Aditivos</h1></div><button className="btn" onClick={()=>setOpen(true)}>Novo aditivo</button></div><ContractTabs id={id}/>
    <section className="card"><table className="table"><thead><tr><th>Tipo</th><th>Descrição</th><th>Valor</th><th>Dias</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.type}</td><td>{a.description}</td><td>{money(a.value)}</td><td>{a.days}</td><td>{a.status}</td><td><button className="btn danger" onClick={async()=>{await deleteRow("addenda",a.id);await load()}}>Excluir</button></td></tr>)}</tbody></table></section>
    <Modal open={open} title="Novo aditivo" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}><select className="input" name="type"><option>Valor</option><option>Prazo</option><option>Valor e Prazo</option><option>Supressão</option></select><select className="input" name="status"><option>Identificado</option><option>Solicitado</option><option>Em análise</option><option>Aprovado</option><option>Formalizado</option></select><input className="input full" name="description" placeholder="Descrição"/><input className="input" name="value" type="number" step="0.01" placeholder="Valor"/><input className="input" name="days" type="number" placeholder="Dias"/><button className="btn full">Salvar</button></form></Modal>
  </AppShell>
}
