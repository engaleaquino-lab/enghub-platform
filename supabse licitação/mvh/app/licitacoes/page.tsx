"use client";
import {FormEvent,useEffect,useState} from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import {deleteRow,insertRow,listRows,money} from "@/lib/supabase-data";

export default function Bids(){
  const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false);
  const load=async()=>setRows(await listRows("bids"));useEffect(()=>{load()},[]);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await insertRow("bids",{title:String(f.get("title")||""),agency:String(f.get("agency")||""),session_date:String(f.get("date")||""),estimated_value:Number(f.get("value")||0),status:String(f.get("status")||"Em análise")});setOpen(false);await load()}
  return <AppShell><div className="topbar"><div><h1 className="section-title">Licitações</h1></div><button className="btn" onClick={()=>setOpen(true)}>Nova licitação</button></div>
    <section className="card"><table className="table"><thead><tr><th>Objeto</th><th>Órgão</th><th>Sessão</th><th>Valor</th><th>Status</th><th></th></tr></thead><tbody>{rows.map(b=><tr key={b.id}><td>{b.title}</td><td>{b.agency}</td><td>{b.session_date?new Date(b.session_date).toLocaleDateString("pt-BR"):"—"}</td><td>{money(b.estimated_value)}</td><td>{b.status}</td><td><button className="btn danger" onClick={async()=>{await deleteRow("bids",b.id);await load()}}>Excluir</button></td></tr>)}</tbody></table></section>
    <Modal open={open} title="Nova licitação" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}><input className="input full" name="title" placeholder="Objeto"/><input className="input full" name="agency" placeholder="Órgão"/><input className="input" name="date" type="date"/><input className="input" name="value" type="number" step="0.01" placeholder="Valor"/><select className="input full" name="status"><option>Em análise</option><option>Participar</option><option>Não participar</option><option>Proposta enviada</option><option>Vencida</option><option>Perdida</option></select><button className="btn full">Salvar</button></form></Modal>
  </AppShell>
}
