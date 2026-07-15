import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function json(data:unknown,status=200){return Response.json(data,{status});}
async function context(){
 const supabase=await createSupabaseServerClient();
 const {data:{user}}=await supabase.auth.getUser();
 if(!user) throw new Error("Usuário não autenticado.");
 const {data:profile,error}=await supabase.from("profiles").select("organization_id").eq("id",user.id).single();
 if(error||!profile?.organization_id) throw new Error("Organização não encontrada.");
 return {supabase,user,organizationId:profile.organization_id};
}
export async function GET(){
 try{
  const {supabase,organizationId}=await context();
  const {data,error}=await supabase.from("bid_dossiers").select("*,bid_dossier_documents(id,document_id,document_role,sort_order,company_documents(id,name,category,processing_status))").eq("organization_id",organizationId).order("created_at",{ascending:false});
  if(error) throw error; return json({dossiers:data||[]});
 }catch(error){return json({error:error instanceof Error?error.message:"Erro ao carregar dossiês."},500);}
}
export async function POST(request:NextRequest){
 try{
  const {supabase,user,organizationId}=await context();
  const body=await request.json();
  const title=String(body.title||"").trim();
  const documentIds=Array.isArray(body.document_ids)?body.document_ids.map(String):[];
  const roles=body.document_roles&&typeof body.document_roles==="object"?body.document_roles:{};
  if(!title) return json({error:"Informe o nome do dossiê."},400);
  if(!documentIds.length) return json({error:"Selecione documentos."},400);
  const {data:dossier,error}=await supabase.from("bid_dossiers").insert({organization_id:organizationId,title,notice_number:String(body.notice_number||"").trim()||null,created_by:user.id}).select("*").single();
  if(error) throw error;
  const rows=documentIds.map((id:string,index:number)=>({organization_id:organizationId,dossier_id:dossier.id,document_id:id,document_role:String(roles[id]||"")||null,sort_order:index}));
  const {error:linkError}=await supabase.from("bid_dossier_documents").insert(rows); if(linkError) throw linkError;
  return json({dossier});
 }catch(error){return json({error:error instanceof Error?error.message:"Erro ao criar dossiê."},500);}
}
