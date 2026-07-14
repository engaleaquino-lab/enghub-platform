"use client";
import Link from "next/link";
import {FormEvent,useEffect,useMemo,useState} from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import {dateBR,deleteRow,insertRow,listRows,money} from "@/lib/supabase-data";

export default function Contracts(){
  const [rows,setRows]=useState<any[]>([]),[open,setOpen]=useState(false),[error,setError]=useState("");
  const load=async()=>{try{setRows(await listRows("contracts"))}catch(e:any){setError(e.message)}};
  useEffect(()=>{load()},[]);
  const totals=useMemo(()=>({
    contracted:rows.reduce((a,c)=>a+Number(c.contract_value||0),0),
    measured:rows.reduce((a,c)=>a+Number(c.measured_value||0),0),
    received:rows.reduce((a,c)=>a+Number(c.received_value||0),0)
  }),[rows]);
  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget);
    try{
      await insertRow("contracts",{
        contract_number:String(f.get("number")||""),client_name:String(f.get("client")||""),
        object:String(f.get("object")||""),contract_value:Number(f.get("value")||0),
        measured_value:0,received_value:0,status:String(f.get("status")||"Planejamento"),
        notice_number:String(f.get("notice_number")||""),modality:String(f.get("modality")||""),
        process_number:String(f.get("process_number")||""),location:String(f.get("location")||""),
        start_date:String(f.get("start_date")||"")||null,end_date:String(f.get("end_date")||"")||null,
        execution_days:Number(f.get("execution_days")||0)||null,manager_name:String(f.get("manager_name")||"")
      });setOpen(false);await load();
    }catch(e:any){setError(e.message)}
  }
  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Contratos</h1><div className="muted">Gestão contratual e execução das obras</div></div><button className="btn" onClick={()=>setOpen(true)}>Novo contrato</button></div>
    {error&&<div className="warning">{error}</div>}
    <div className="grid three"><div className="card"><div className="muted">Contratado</div><div className="value">{money(totals.contracted)}</div></div><div className="card"><div className="muted">Medido</div><div className="value">{money(totals.measured)}</div></div><div className="card"><div className="muted">A receber</div><div className="value">{money(Math.max(0,totals.measured-totals.received))}</div></div></div>
    <section className="card data-card"><table className="table"><thead><tr><th>Contrato</th><th>Órgão</th><th>Objeto</th><th>Vigência</th><th>Valor</th><th>Avanço</th><th>Status</th><th></th></tr></thead>
    <tbody>{rows.map(c=>{const pct=Number(c.contract_value||0)?Math.min(100,Number(c.measured_value||0)/Number(c.contract_value||0)*100):0;return <tr key={c.id}><td><Link className="data-link" href={`/contratos/${c.id}`}>{c.contract_number}</Link></td><td>{c.client_name||"—"}</td><td>{c.object}</td><td>{dateBR(c.start_date)} a {dateBR(c.end_date)}</td><td>{money(c.contract_value)}</td><td><div className="mini-progress"><span style={{width:`${pct}%`}}/></div><small>{pct.toFixed(0)}%</small></td><td><span className="badge">{c.status}</span></td><td><button className="btn danger" onClick={async()=>{if(confirm("Excluir este contrato e seus registros?")){await deleteRow("contracts",c.id);await load()}}}>Excluir</button></td></tr>})}{!rows.length&&<tr><td colSpan={8} className="empty">Nenhum contrato cadastrado.</td></tr>}</tbody></table></section>
    <Modal open={open} title="Novo contrato" onClose={()=>setOpen(false)}><form className="form-grid" onSubmit={submit}>
      <div className="field"><label>Número do contrato</label><input className="input" name="number" required/></div><div className="field"><label>Órgão/Cliente</label><input className="input" name="client" required/></div>
      <div className="field full"><label>Objeto</label><input className="input" name="object" required/></div><div className="field"><label>Edital</label><input className="input" name="notice_number"/></div><div className="field"><label>Modalidade</label><input className="input" name="modality"/></div>
      <div className="field"><label>Processo</label><input className="input" name="process_number"/></div><div className="field"><label>Local da obra</label><input className="input" name="location"/></div>
      <div className="field"><label>Valor contratado</label><input className="input" name="value" type="number" step="0.01" required/></div><div className="field"><label>Fiscal responsável</label><input className="input" name="manager_name"/></div>
      <div className="field"><label>Início</label><input className="input" name="start_date" type="date"/></div><div className="field"><label>Término</label><input className="input" name="end_date" type="date"/></div>
      <div className="field"><label>Prazo de execução (dias)</label><input className="input" name="execution_days" type="number"/></div><div className="field"><label>Status</label><select className="input" name="status"><option>Planejamento</option><option>Em execução</option><option>Paralisado</option><option>Concluído</option><option>Rescindido</option></select></div>
      <div className="full actions"><button className="btn">Salvar</button></div>
    </form></Modal>
  </AppShell>
}
