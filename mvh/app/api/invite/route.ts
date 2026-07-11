
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function POST(request:NextRequest){
  const supabase=await createSupabaseServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return Response.json({error:"Não autenticado"},{status:401});

  const body=await request.json();
  const email=String(body.email||"").trim().toLowerCase();
  const role=String(body.role||"member");

  const {data:membership,error:membershipError}=await supabase
    .from("organization_members")
    .select("organization_id,role")
    .eq("user_id",user.id)
    .in("role",["owner","admin"])
    .limit(1)
    .single();

  if(membershipError || !membership){
    return Response.json({error:"Sem permissão para convidar."},{status:403});
  }

  const {data,error}=await supabase
    .from("invitations")
    .insert({
      organization_id:membership.organization_id,
      email,role,created_by:user.id
    })
    .select()
    .single();

  if(error) return Response.json({error:error.message},{status:400});

  const appUrl=process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return Response.json({
    invitation:data,
    inviteUrl:`${appUrl}/convites?token=${data.token}`
  });
}
