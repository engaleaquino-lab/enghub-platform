
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) return json({ error: "Sessão inválida." }, 401);

  const conversationId = new URL(request.url).searchParams.get("conversation_id");
  if (!conversationId) return json({ error: "Conversa não informada." }, 400);

  const { data: conversation, error: conversationError } = await supabase
    .from("copilot_conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (conversationError) return json({ error: conversationError.message }, 500);
  if (!conversation) return json({ error: "Conversa não encontrada." }, 404);

  const { data, error } = await supabase
    .from("copilot_messages")
    .select("id,role,content,sources,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) return json({ error: error.message }, 500);
  return json({ messages: data || [] });
}
