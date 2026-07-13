
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request:NextRequest){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return Response.json({error:"Não autenticado"},{status:401});

  const form=await request.formData();
  const file=form.get("file") as File | null;
  const contractId=String(form.get("contractId")||"");
  const category=String(form.get("category")||"Arquivo");

  if(!file || !contractId) return Response.json({error:"Arquivo e contrato são obrigatórios."},{status:400});

  const {data:contract,error:contractError}=await supabase
    .from("contracts")
    .select("organization_id")
    .eq("id",contractId)
    .single();

  if(contractError || !contract) return Response.json({error:"Contrato não encontrado."},{status:404});

  const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_");
  const path=`${contract.organization_id}/${contractId}/${crypto.randomUUID()}-${safeName}`;

  const {error:uploadError}=await supabase.storage
    .from("contract-files")
    .upload(path,file,{contentType:file.type,upsert:false});

  if(uploadError) return Response.json({error:uploadError.message},{status:400});

  const {data:doc,error:docError}=await supabase
    .from("contract_documents")
    .insert({
      organization_id:contract.organization_id,
      contract_id:contractId,
      name:file.name,
      category,
      status:"Válido",
      storage_path:path,
      created_by:user.id
    })
    .select()
    .single();

  if(docError) return Response.json({error:docError.message},{status:400});
  return Response.json({document:doc});
}
