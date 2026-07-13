
"use client";

import { createSupabaseBrowserClient } from "./supabase-browser";

export async function signIn(email:string,password:string){
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL){
    localStorage.setItem("enghub_demo_user",JSON.stringify({email,name:"Usuário Demo"}));
    return {demo:true};
  }
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.auth.signInWithPassword({email,password});
  if(error) throw error;
  return data;
}

export async function signUp(email:string,password:string){
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL){
    localStorage.setItem("enghub_demo_user",JSON.stringify({email,name:"Usuário Demo"}));
    return {demo:true};
  }
  const supabase=createSupabaseBrowserClient();
  const {data,error}=await supabase.auth.signUp({email,password});
  if(error) throw error;
  return data;
}

export async function signOut(){
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL){
    localStorage.removeItem("enghub_demo_user");
    return;
  }
  const supabase=createSupabaseBrowserClient();
  await supabase.auth.signOut();
}
