"use client";
import Link from "next/link";
import {FormEvent,useEffect,useState} from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import {deleteRow,insertRow,listRows,money} from "@/lib/supabase-data";

export default function Contracts(){
  const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false),[error,setError]=useState("");
  const load=async()=>{try{setRows(await listRows("contracts"))}catch(e:any){setError(e.message)}};
  useEffect(()=>{load()},[]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{
      await insertRow("contracts",{
        contract_number:String(f.get("number")||""),client_name:String(f.get("client")||""),
        object:String(f.get("object")||""),contract_value:Number(f.get("value")||0),
        measured_value:0,received_value:0,status:String(f.get("status")||"Planejamento")
      });setOpen(false);await load();
    }catch(e:any){setError(e.message)}
  }
  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Contratos</h1><div className="muted">Banco Supabase</div></div><button className="btn" onClick={()=>setOpen(true)}>Novo contrato</button></div>
    {error&&<div className="warning">{error}</div>}
    <section className="card"><table className="table"><thead><tr><th>Contrato</th><th>Objeto</th><th>Valor</th><th>Medido</th><th>Recebido</th><th>Status</th><th></th></tr></thead>
    <tbody>{rows.map(c=><tr key={c.id}><td><Link href={`/contratos/${c.id}`} style={{color:"#12c98c",fontWeight:800}}>{c.contract_number}</Link></td><td>{c.object}</td><td>{money(c.contract_value)}</td><td>{money(c.measured_value)}</td><td>{money(c.received_value)}</td><td>{c.status}</td><td><button className="btn danger" onClick={async()=>{await deleteRow("contracts",c.id);await load()}}>Excluir</button></td></tr>)}</tbody></table></section>
    <Modal open={open} title="Novo contrato" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}>
      <div className="field"><label>Número</label><input className="input" name="number" required/></div>
      <div className="field"><label>Órgão/Cliente</label><input className="input" name="client" required/></div>
      <div className="field full"><label>Objeto</label><input className="input" name="object" required/></div>
      <div className="field"><label>Valor</label><input className="input" name="value" type="number" step="0.01" required/></div>
      <div className="field"><label>Status</label><select className="input" name="status"><option>Planejamento</option><option>Em execução</option><option>Paralisado</option><option>Concluído</option></select></div>
      <div className="full actions"><button className="btn">Salvar</button></div>
    </form></Modal>
  </AppShell>
}
