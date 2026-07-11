
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";

export async function listBids(){
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.from("bids").select("*").order("session_date",{ascending:true});
  if(error) throw error;
  return data;
}

export async function createBid(input:{
  title:string; agency:string; session_date:string; estimated_value:number; status:string;
}){
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
    .from("bids")
    .insert({...input,organization_id:membership.organization_id,created_by:user.id})
    .select()
    .single();
  if(error) throw error;
  return data;
}
