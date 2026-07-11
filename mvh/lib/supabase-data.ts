"use client";
import { supabaseBrowser } from "./supabase-browser";

export async function currentOrg(){
  const s=supabaseBrowser();
  const {data:{user}}=await s.auth.getUser();
  if(!user) throw new Error("Usuário não autenticado.");
  const {data,error}=await s.from("organization_members")
    .select("organization_id").eq("user_id",user.id).eq("status","active").limit(1).single();
  if(error) throw error;
  return {orgId:data.organization_id,userId:user.id};
}

export async function listRows(table:string, filters:Record<string,string>={}){
  const s=supabaseBrowser();
  let q=s.from(table).select("*").order("created_at",{ascending:false});
  Object.entries(filters).forEach(([k,v])=>{q=q.eq(k,v)});
  const {data,error}=await q;
  if(error) throw error;
  return data||[];
}

export async function insertRow(table:string,row:Record<string,unknown>){
  const s=supabaseBrowser();
  const {orgId,userId}=await currentOrg();
  const {data,error}=await s.from(table).insert({
    ...row,organization_id:orgId,created_by:userId
  }).select().single();
  if(error) throw error;
  return data;
}

export async function deleteRow(table:string,id:string){
  const s=supabaseBrowser();
  const {error}=await s.from(table).delete().eq("id",id);
  if(error) throw error;
}

export async function updateContractTotals(contractId:string){
  const s=supabaseBrowser();
  const {data,error}=await s.from("measurements")
    .select("measured_value,received_value").eq("contract_id",contractId);
  if(error) throw error;
  const measured=(data||[]).reduce((a:any,x:any)=>a+Number(x.measured_value||0),0);
  const received=(data||[]).reduce((a:any,x:any)=>a+Number(x.received_value||0),0);
  const {error:e}=await s.from("contracts").update({
    measured_value:measured,received_value:received
  }).eq("id",contractId);
  if(e) throw e;
}

export async function uploadFile(contractId:string,file:File){
  const s=supabaseBrowser();
  const {orgId,userId}=await currentOrg();
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${orgId}/${contractId}/${crypto.randomUUID()}-${safe}`;
  const {error:up}=await s.storage.from("contract-files").upload(path,file);
  if(up) throw up;
  const {data,error}=await s.from("contract_documents").insert({
    organization_id:orgId,contract_id:contractId,name:file.name,
    category:"Arquivo",status:"Válido",storage_path:path,created_by:userId
  }).select().single();
  if(error) throw error;
  return data;
}

export function money(v:number){
  return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}
