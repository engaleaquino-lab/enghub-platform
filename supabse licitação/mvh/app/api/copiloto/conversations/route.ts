
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

async function context() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) throw new Error("UNAUTHENTICATED");

  const { data: membership, error } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) throw new Error("NO_ORGANIZATION");

  return { supabase, user, organizationId: membership.organization_id };
}

export async function GET() {
  try {
    const { supabase, user, organizationId } = await context();
    const { data, error } = await supabase
      .from("copilot_conversations")
      .select("id,title,created_at,updated_at")
      .eq("organization_id", organizationId)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(50);

    if (error) return json({ error: error.message }, 500);
    return json({ conversations: data || [] });
  } catch (error) {
    return json(
      { error: error instanceof Error && error.message === "UNAUTHENTICATED"
        ? "Sessão inválida."
        : "Usuário sem organização ativa." },
      error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 403,
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { supabase, user, organizationId } = await context();
    const body = await request.json().catch(() => ({}));
    const title = String(body.title || "Nova conversa").trim().slice(0, 100) || "Nova conversa";

    const { data, error } = await supabase
      .from("copilot_conversations")
      .insert({
        organization_id: organizationId,
        user_id: user.id,
        title,
      })
      .select("id,title,created_at,updated_at")
      .single();

    if (error) return json({ error: error.message }, 500);
    return json({ conversation: data }, 201);
  } catch (error) {
    return json(
      { error: error instanceof Error && error.message === "UNAUTHENTICATED"
        ? "Sessão inválida."
        : "Usuário sem organização ativa." },
      error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 403,
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { supabase, user, organizationId } = await context();
    const id = new URL(request.url).searchParams.get("id");

    if (!id) return json({ error: "Conversa não informada." }, 400);

    const { error } = await supabase
      .from("copilot_conversations")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("user_id", user.id);

    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  } catch (error) {
    return json(
      { error: error instanceof Error && error.message === "UNAUTHENTICATED"
        ? "Sessão inválida."
        : "Usuário sem organização ativa." },
      error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 403,
    );
  }
}
