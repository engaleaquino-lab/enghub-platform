
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import ContractTabs from "@/components/ContractTabs";
import Modal from "@/components/Modal";
import { addScheduleItem, getScheduleByContract, removeScheduleItem, ScheduleItem } from "@/lib/store";

export default function Schedule(){
  const {id}=useParams<{id:string}>();
  const [items,setItems]=useState<ScheduleItem[]>([]);
  const [open,setOpen]=useState(false);
  const load=()=>setItems(getScheduleByContract(id));
  useEffect(()=>load(),[id]);

  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    addScheduleItem({
      contractId:id,
      stage:String(f.get("stage")||""),
      activity:String(f.get("activity")||""),
      plannedStart:String(f.get("plannedStart")||""),
      plannedEnd:String(f.get("plannedEnd")||""),
      actualStart:String(f.get("actualStart")||""),
      actualEnd:String(f.get("actualEnd")||""),
      progress:Number(f.get("progress")||0),
      status:String(f.get("status")||"Não iniciado"),
      responsible:String(f.get("responsible")||"")
    });
    setOpen(false);load();
  }

  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Cronograma</h1><div className="muted">Etapas, prazos e avanço físico</div></div><button className="btn" onClick={()=>setOpen(true)}>Nova atividade</button></div>
    <ContractTabs id={id}/>
    <section className="timeline-list">
      {items.length?items.map(x=><div className="timeline-row" key={x.id}>
        <div><strong>{x.stage}</strong><div className="muted">{x.activity}</div></div>
        <div><div className="timeline-bar"><span style={{width:`${Math.min(x.progress,100)}%`}}/></div><div className="muted">{x.progress}% concluído</div></div>
        <div><div>{x.plannedStart||"—"} → {x.plannedEnd||"—"}</div><div className="muted">{x.responsible||"Sem responsável"}</div></div>
        <div className="actions"><span className="badge">{x.status}</span><button className="btn danger" onClick={()=>{removeScheduleItem(x.id);load()}}>Excluir</button></div>
      </div>):<div className="card empty">Nenhuma atividade cadastrada.</div>}
    </section>
    <Modal open={open} title="Nova atividade" onClose={()=>setOpen(false)}>
      <form className="form-grid" onSubmit={submit}>
        <div className="field"><label>Etapa</label><input className="input" name="stage" required/></div>
        <div className="field"><label>Atividade</label><input className="input" name="activity" required/></div>
        <div className="field"><label>Início previsto</label><input className="input" type="date" name="plannedStart"/></div>
        <div className="field"><label>Fim previsto</label><input className="input" type="date" name="plannedEnd"/></div>
        <div className="field"><label>Início real</label><input className="input" type="date" name="actualStart"/></div>
        <div className="field"><label>Fim real</label><input className="input" type="date" name="actualEnd"/></div>
        <div className="field"><label>Avanço (%)</label><input className="input" type="number" min="0" max="100" name="progress" defaultValue="0"/></div>
        <div className="field"><label>Status</label><select className="input" name="status"><option>Não iniciado</option><option>Em andamento</option><option>Concluído</option><option>Atrasado</option><option>Paralisado</option></select></div>
        <div className="field full"><label>Responsável</label><input className="input" name="responsible"/></div>
        <div className="full actions"><button className="btn" type="submit">Salvar</button><button className="btn secondary" type="button" onClick={()=>setOpen(false)}>Cancelar</button></div>
      </form>
    </Modal>
  </AppShell>
}
