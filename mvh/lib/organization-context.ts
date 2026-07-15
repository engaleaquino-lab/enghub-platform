import { createSupabaseServerClient } from "@/lib/supabase-server";

export async function getOrganizationContext() {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Sessão inválida. Entre novamente.");
  }

  const { data: membership, error: membershipError } =
    await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

  if (!membershipError && membership?.organization_id) {
    return {
      supabase,
      user,
      organizationId: String(membership.organization_id),
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileError && profile?.organization_id) {
    return {
      supabase,
      user,
      organizationId: String(profile.organization_id),
    };
  }

  throw new Error(
    "Usuário sem organização ativa. Verifique o vínculo em organization_members.",
  );
}
