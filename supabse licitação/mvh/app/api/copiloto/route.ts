import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CopilotRequest = {
  question?: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
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
    const [contractsResult, bidsResult, measurementsResult, documentsResult, chunksResult] = await Promise.all([
      supabase
        .from("contracts")
        .select("contract_number,client_name,object,contract_value,measured_value,received_value,status")
        .eq("organization_id", organizationId)
        .limit(100),
      supabase
        .from("bids")
        .select("title,agency,session_date,estimated_value,status")
        .eq("organization_id", organizationId)
        .limit(100),
      supabase
        .from("measurements")
        .select("number,competence,measured_value,received_value,invoice_number,status,contract_id")
        .eq("organization_id", organizationId)
        .limit(200),
      supabase
        .from("company_documents")
        .select("id,name,category,contract_id,issue_date,expiry_date,status,summary")
        .eq("organization_id", organizationId)
        .limit(150),
      supabase
        .from("document_chunks")
        .select("content,chunk_index,company_documents(name,category)")
        .eq("organization_id", organizationId)
        .textSearch("fts", question, { type: "websearch", config: "portuguese" })
        .limit(12),
    ]);

    const firstError = contractsResult.error || bidsResult.error || measurementsResult.error || documentsResult.error || chunksResult.error;
    if (firstError) {
      return json({ error: `Falha ao consultar o banco: ${firstError.message}` }, 500);
    }

    const context = {
      user: { email: user.email },
      contracts: contractsResult.data || [],
      bids: bidsResult.data || [],
      measurements: measurementsResult.data || [],
      documents: documentsResult.data || [],
      relevant_document_chunks: chunksResult.data || [],
    };

    const recentHistory = (body.history || []).slice(-8);
    const conversation = recentHistory
      .map((message) => `${message.role === "user" ? "USUÁRIO" : "COPILOTO"}: ${message.content}`)
      .join("\n\n");

    const instructions = [
      "Você é o Copiloto EngHub, especializado em engenharia civil, licitações públicas brasileiras e gestão de obras.",
      "Responda sempre em português brasileiro, de forma objetiva, profissional e prática.",
      "Use os dados reais fornecidos no contexto da empresa antes de responder.",
      "Nunca invente contratos, valores, datas, cláusulas ou documentos.",
      "Quando os dados forem insuficientes, diga exatamente o que falta.",
      "Quando responder com base em documentos, cite o nome do documento informado no contexto.",
      "Orientações jurídicas são preliminares e devem ser revisadas por profissional habilitado.",
    ].join("\n");

    const input = [
      conversation ? `HISTÓRICO RECENTE:\n${conversation}` : "",
      `PERGUNTA ATUAL:\n${question}`,
      `CONTEXTO DA EMPRESA (JSON):\n${JSON.stringify(context)}`,
    ].filter(Boolean).join("\n\n");

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
        max_output_tokens: 1600,
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
      const message = payload?.error?.message || `OpenAI respondeu com status ${openAIResponse.status}.`;
      return json({ error: message }, 502);
    }

    const answer = payload.output_text || payload.output
      ?.flatMap((item: any) => item.content || [])
      ?.filter((item: any) => item.type === "output_text")
      ?.map((item: any) => item.text)
      ?.join("\n");

    if (!answer) return json({ error: "A IA respondeu sem conteúdo textual." }, 502);

    return json({ answer });
  } catch (error) {
    console.error("/api/copiloto", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
}
