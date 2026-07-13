
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export type ContractInput={
  contract_number:string;
  client_name:string;
  object:string;
  contract_value:number;
  status:string;
};

export async function listContracts(){
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.from("contracts").select("*").order("created_at",{ascending:false});
  if(error) throw error;
  return data;
}

export async function createContract(input:ContractInput){
  const supabase=createSupabaseBrowserClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) throw new Error("Usuário não autenticado.");
  const {data:membership,error:membershipError}=await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id",user.id)
    .limit(1)
    .single();
  if(membershipError) throw membershipError;
  const {data,error}=await supabase
    .from("contracts")
    .insert({...input,organization_id:membership.organization_id,created_by:user.id})
    .select()
    .single();
  if(error) throw error;
  return data;
}
