"use client";
import {FormEvent,useEffect,useState} from "react";
import {useParams} from "next/navigation";
import AppShell from "@/components/AppShell";
import ContractTabs from "@/components/ContractTabs";
import Modal from "@/components/Modal";
import {deleteRow,insertRow,listRows,money,updateContractTotals} from "@/lib/supabase-data";

export default function Measurements(){
  const {id}=useParams<{id:string}>();const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false);
  const load=async()=>setRows(await listRows("measurements",{contract_id:id}));
  useEffect(()=>{load()},[id]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    await insertRow("measurements",{contract_id:id,number:String(f.get("number")||""),competence:String(f.get("competence")||""),measured_value:Number(f.get("measured")||0),invoice_number:String(f.get("invoice")||""),status:String(f.get("status")||"Em elaboração"),received_value:Number(f.get("received")||0)});
    await updateContractTotals(id);setOpen(false);await load();
  }
  return <AppShell><div className="topbar"><div><h1 className="section-title">Medições</h1><div className="muted">Supabase</div></div><button className="btn" onClick={()=>setOpen(true)}>Nova medição</button></div><ContractTabs id={id}/>
    <section className="card"><table className="table"><thead><tr><th>Nº</th><th>Competência</th><th>Medido</th><th>NF</th><th>Status</th><th>Recebido</th><th></th></tr></thead><tbody>{rows.map(m=><tr key={m.id}><td>{m.number}</td><td>{m.competence}</td><td>{money(m.measured_value)}</td><td>{m.invoice_number}</td><td>{m.status}</td><td>{money(m.received_value)}</td><td><button className="btn danger" onClick={async()=>{await deleteRow("measurements",m.id);await updateContractTotals(id);await load()}}>Excluir</button></td></tr>)}</tbody></table></section>
    <Modal open={open} title="Nova medição" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}>
      <input className="input" name="number" placeholder="Número"/><input className="input" name="competence" placeholder="Competência"/>
      <input className="input" name="measured" type="number" step="0.01" placeholder="Valor medido"/><input className="input" name="invoice" placeholder="Nota fiscal"/>
      <input className="input" name="received" type="number" step="0.01" placeholder="Valor recebido"/><select className="input" name="status"><option>Em elaboração</option><option>Protocolada</option><option>Aprovada</option><option>Faturada</option><option>Recebida</option><option>Glosada</option></select>
      <button className="btn full">Salvar</button></form></Modal>
  </AppShell>
}
