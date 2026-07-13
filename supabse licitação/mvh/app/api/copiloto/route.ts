
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUESTION_LENGTH = 4000;
const MAX_REQUESTS_PER_MINUTE = 8;

type CopilotRequest = {
  question?: string;
  conversation_id?: string | null;
};

type Source = {
  document: string;
  category?: string | null;
  excerpt: string;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function outputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((item: any) => item?.type === "output_text" && item?.text)
    .map((item: any) => item.text)
    .join("\n")
    .trim();
}

export async function GET(request: NextRequest) {
  const conversationId = new URL(request.url).searchParams.get("conversation_id");
  return conversationId
    ? Response.redirect(new URL(`/api/copiloto/messages?conversation_id=${encodeURIComponent(conversationId)}`, request.url))
    : Response.redirect(new URL("/api/copiloto/conversations", request.url));
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("conversation_id");
  return fetch(new URL(`/api/copiloto/conversations?id=${encodeURIComponent(id || "")}`, request.url), {
    method: "DELETE",
    headers: { cookie: request.headers.get("cookie") || "" },
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "Sessão inválida. Entre novamente na EngHub." }, 401);
    }

    const body = (await request.json()) as CopilotRequest;
    const question = String(body.question || "").trim();

    if (!question) return json({ error: "Digite uma pergunta." }, 400);
    if (question.length > MAX_QUESTION_LENGTH) {
      return json({ error: `A pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.` }, 400);
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "OPENAI_API_KEY não configurada no servidor." }, 500);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (membershipError || !membership) {
      return json({ error: "Usuário sem organização ativa." }, 403);
    }

    const organizationId = membership.organization_id;
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString();

    const { count, error: countError } = await supabase
      .from("copilot_messages")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "user")
      .gte("created_at", oneMinuteAgo);

    if (countError) return json({ error: countError.message }, 500);
    if ((count || 0) >= MAX_REQUESTS_PER_MINUTE) {
      return json({ error: "Muitas perguntas em pouco tempo. Aguarde um minuto e tente novamente." }, 429);
    }

    let conversationId = body.conversation_id || null;

    if (conversationId) {
      const { data: existing } = await supabase
        .from("copilot_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("organization_id", organizationId)
        .eq("user_id", user.id)
        .maybeSingle();

      if (!existing) conversationId = null;
    }

    if (!conversationId) {
      const { data: created, error } = await supabase
        .from("copilot_conversations")
        .insert({
          organization_id: organizationId,
          user_id: user.id,
          title: question.slice(0, 80),
        })
        .select("id")
        .single();

      if (error) return json({ error: error.message }, 500);
      conversationId = created.id;
    }

    const { error: userMessageError } = await supabase
      .from("copilot_messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        user_id: user.id,
        role: "user",
        content: question,
      });

    if (userMessageError) return json({ error: userMessageError.message }, 500);

    const historyResult = await supabase
      .from("copilot_messages")
      .select("role,content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(12);

    const [
      contractsResult,
      bidsResult,
      measurementsResult,
      financeResult,
      documentsResult,
    ] = await Promise.all([
      supabase
        .from("contracts")
        .select("id,contract_number,client_name,object,contract_value,measured_value,received_value,status,start_date,end_date")
        .eq("organization_id", organizationId)
        .limit(100),
      supabase
        .from("bids")
        .select("id,title,agency,session_date,estimated_value,status")
        .eq("organization_id", organizationId)
        .limit(100),
      supabase
        .from("measurements")
        .select("number,competence,measured_value,received_value,invoice_number,status,contract_id,due_date")
        .eq("organization_id", organizationId)
        .limit(250),
      supabase
        .from("financial_entries")
        .select("type,description,category,document_number,due_date,amount,paid_amount,status,contract_id")
        .eq("organization_id", organizationId)
        .limit(300),
      supabase
        .from("company_documents")
        .select("id,name,category,contract_id,issue_date,expiry_date,status,summary")
        .eq("organization_id", organizationId)
        .limit(200),
    ]);

    const firstError =
      historyResult.error ||
      contractsResult.error ||
      bidsResult.error ||
      measurementsResult.error ||
      financeResult.error ||
      documentsResult.error;

    if (firstError) {
      return json({ error: `Falha ao consultar o banco: ${firstError.message}` }, 500);
    }

    let chunks: any[] = [];

    const chunkResult = await supabase
      .from("document_chunks")
      .select("content,chunk_index,company_documents(name,category)")
      .eq("organization_id", organizationId)
      .textSearch("fts", question, { type: "websearch", config: "portuguese" })
      .limit(12);

    if (!chunkResult.error) chunks = chunkResult.data || [];

    const sources: Source[] = chunks.map((chunk: any) => ({
      document: chunk.company_documents?.name || "Documento",
      category: chunk.company_documents?.category || null,
      excerpt: String(chunk.content || "").slice(0, 300),
    }));

    const context = {
      user: { email: user.email },
      contracts: contractsResult.data || [],
      bids: bidsResult.data || [],
      measurements: measurementsResult.data || [],
      financial_entries: financeResult.data || [],
      documents: documentsResult.data || [],
      relevant_document_chunks: chunks,
    };

    const history = (historyResult.data || [])
      .reverse()
      .map((message) =>
        `${message.role === "user" ? "USUÁRIO" : "COPILOTO"}: ${message.content}`,
      )
      .join("\n\n");

    const instructions = [
      "Você é o Copiloto EngHub, especializado em engenharia civil, licitações públicas brasileiras e gestão de obras.",
      "Responda sempre em português brasileiro, de forma objetiva, profissional e prática.",
      "Use prioritariamente os dados reais fornecidos no contexto da empresa.",
      "Nunca invente contratos, valores, datas, cláusulas ou documentos.",
      "Quando os dados forem insuficientes, diga exatamente o que falta.",
      "Quando usar um documento, cite o nome dele no texto da resposta.",
      "Diferencie valor contratado, medido, recebido, a receber, contas a pagar e contas a receber.",
      "Orientações jurídicas são preliminares e devem ser revisadas por profissional habilitado.",
    ].join("\n");

    const input = [
      history ? `HISTÓRICO RECENTE:\n${history}` : "",
      `PERGUNTA ATUAL:\n${question}`,
      `CONTEXTO DA EMPRESA (JSON):\n${JSON.stringify(context)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const openAIResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions,
        input,
        max_output_tokens: 1800,
        store: false,
      }),
    });

    const raw = await openAIResponse.text();
    let payload: any;

    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { error: { message: raw || "Resposta inválida da OpenAI." } };
    }

    if (!openAIResponse.ok) {
      return json(
        {
          error:
            payload?.error?.message ||
            `OpenAI respondeu com status ${openAIResponse.status}.`,
        },
        502,
      );
    }

    const answer = outputText(payload);
    if (!answer) return json({ error: "A IA respondeu sem conteúdo textual." }, 502);

    const { data: assistantMessage, error: assistantError } = await supabase
      .from("copilot_messages")
      .insert({
        organization_id: organizationId,
        conversation_id: conversationId,
        user_id: user.id,
        role: "assistant",
        content: answer,
        sources,
      })
      .select("id,role,content,sources,created_at")
      .single();

    if (assistantError) return json({ error: assistantError.message }, 500);

    await supabase
      .from("copilot_conversations")
      .update({
        title: question.slice(0, 80),
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("user_id", user.id);

    return json({
      conversation_id: conversationId,
      message: assistantMessage,
      answer,
      sources,
    });
  } catch (error) {
    console.error("POST /api/copiloto", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
}
