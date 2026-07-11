
"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import ContractTabs from "@/components/ContractTabs";
import Modal from "@/components/Modal";
import { addTask, getTasksByContract, removeTask, TaskItem } from "@/lib/store";

export default function Tasks(){
  const {id}=useParams<{id:string}>();
  const [items,setItems]=useState<TaskItem[]>([]);
  const [open,setOpen]=useState(false);
  const load=()=>setItems(getTasksByContract(id));
  useEffect(()=>load(),[id]);

  function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    addTask({
      contractId:id,
      title:String(f.get("title")||""),
      dueDate:String(f.get("dueDate")||""),
      priority:String(f.get("priority")||"Média"),
      status:String(f.get("status")||"Pendente"),
      responsible:String(f.get("responsible")||"")
    });
    setOpen(false);load();
  }

  return <AppShell>
    <div className="topbar"><div><h1 className="section-title">Tarefas</h1><div className="muted">Pendências e responsabilidades do contrato</div></div><button className="btn" onClick={()=>setOpen(true)}>Nova tarefa</button></div>
    <ContractTabs id={id}/>
    <section className="card">
      {items.length?<table className="table"><thead><tr><th>Tarefa</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Status</th><th></th></tr></thead><tbody>
        {items.map(x=><tr key={x.id}><td>{x.title}</td><td>{x.responsible||"—"}</td><td>{x.dueDate?new Date(x.dueDate+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</td><td className={`priority-${x.priority.toLowerCase().replace("é","e")}`}>{x.priority}</td><td>{x.status}</td><td><button className="btn danger" onClick={()=>{removeTask(x.id);load()}}>Excluir</button></td></tr>)}
      </tbody></table>:<div className="empty">Nenhuma tarefa cadastrada.</div>}
    </section>
    <Modal open={open} title="Nova tarefa" onClose={()=>setOpen(false)}>
      <form className="form-grid" onSubmit={submit}>
        <div className="field full"><label>Tarefa</label><input className="input" name="title" required/></div>
        <div className="field"><label>Responsável</label><input className="input" name="responsible"/></div>
        <div className="field"><label>Prazo</label><input className="input" type="date" name="dueDate"/></div>
        <div className="field"><label>Prioridade</label><select className="input" name="priority"><option>Alta</option><option>Média</option><option>Baixa</option></select></div>
        <div className="field"><label>Status</label><select className="input" name="status"><option>Pendente</option><option>Em andamento</option><option>Concluída</option><option>Bloqueada</option></select></div>
        <div className="full actions"><button className="btn" type="submit">Salvar</button><button className="btn secondary" type="button" onClick={()=>setOpen(false)}>Cancelar</button></div>
      </form>
    </Modal>
  </AppShell>
}
