"use client";

import { supabaseBrowser } from "./supabase-browser";

export async function currentOrg() {
  const s = supabaseBrowser();
  const { data: { user } } = await s.auth.getUser();

  if (!user) throw new Error("Usuário não autenticado.");

  const { data, error } = await s
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error) throw error;

  return { orgId: data.organization_id, userId: user.id };
}

export async function listRows(
  table: string,
  filters: Record<string, string> = {},
) {
  const s = supabaseBrowser();
  let query = s.from(table).select("*").order("created_at", { ascending: false });

  Object.entries(filters).forEach(([key, value]) => {
    query = query.eq(key, value);
  });

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function insertRow(
  table: string,
  row: Record<string, unknown>,
) {
  const s = supabaseBrowser();
  const { orgId, userId } = await currentOrg();

  const { data, error } = await s
    .from(table)
    .insert({
      ...row,
      organization_id: orgId,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateRow(
  table: string,
  id: string,
  row: Record<string, unknown>,
) {
  const s = supabaseBrowser();

  const { data, error } = await s
    .from(table)
    .update(row)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteRow(table: string, id: string) {
  const s = supabaseBrowser();
  const { error } = await s.from(table).delete().eq("id", id);
  if (error) throw error;
}

export async function updateContractTotals(contractId: string) {
  const s = supabaseBrowser();

  const { data, error } = await s
    .from("measurements")
    .select("measured_value,received_value")
    .eq("contract_id", contractId);

  if (error) throw error;

  const measured = (data || []).reduce(
    (total, row) => total + Number(row.measured_value || 0),
    0,
  );

  const received = (data || []).reduce(
    (total, row) => total + Number(row.received_value || 0),
    0,
  );

  const { error: updateError } = await s
    .from("contracts")
    .update({
      measured_value: measured,
      received_value: received,
    })
    .eq("id", contractId);

  if (updateError) throw updateError;
}

export async function uploadFile(contractId: string, file: File) {
  const s = supabaseBrowser();
  const { orgId, userId } = await currentOrg();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${orgId}/${contractId}/${crypto.randomUUID()}-${safe}`;

  const { error: uploadError } = await s.storage
    .from("contract-files")
    .upload(path, file);

  if (uploadError) throw uploadError;

  const { data, error } = await s
    .from("contract_documents")
    .insert({
      organization_id: orgId,
      contract_id: contractId,
      name: file.name,
      category: "Arquivo",
      status: "Válido",
      storage_path: path,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export function money(value: number) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function dateBR(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("pt-BR");
}
