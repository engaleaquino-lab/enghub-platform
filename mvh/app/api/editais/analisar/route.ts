
import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type AnalysisPayload = {
  executive_summary: string;
  object: string;
  agency: string;
  notice_number: string;
  modality: string;
  session_date: string | null;
  estimated_value: number | null;
  execution_deadline: string;
  proposal_validity: string;
  judgment_criterion: string;
  participation_recommendation: "Participar" | "Analisar com cautela" | "Não participar";
  recommendation_reason: string;
  required_documents: string[];
  technical_requirements: string[];
  financial_requirements: string[];
  guarantees: string[];
  deadlines: Array<{ item: string; date: string | null; detail: string }>;
  risks: Array<{ level: "Baixo" | "Médio" | "Alto"; item: string; reason: string }>;
  restrictive_clauses: Array<{ item: string; explanation: string }>;
  checklist: Array<{ item: string; category: string; priority: "Baixa" | "Média" | "Alta" }>;
  clarification_questions: string[];
  attention_points: string[];
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

function extractJson(text: string) {
  const cleaned = text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");

  if (first < 0 || last <= first) {
    throw new Error("A IA não devolveu um JSON válido.");
  }

  return JSON.parse(cleaned.slice(first, last + 1));
}

function normalizeAnalysis(value: any): AnalysisPayload {
  const stringArray = (input: unknown) =>
    Array.isArray(input)
      ? input.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 80)
      : [];

  const rows = <T extends Record<string, unknown>>(
    input: unknown,
    mapper: (row: any) => T,
  ) => (Array.isArray(input) ? input.slice(0, 80).map(mapper) : []);

  const recommendation = ["Participar", "Analisar com cautela", "Não participar"].includes(
    value?.participation_recommendation,
  )
    ? value.participation_recommendation
    : "Analisar com cautela";

  return {
    executive_summary: String(value?.executive_summary || "Resumo não identificado."),
    object: String(value?.object || ""),
    agency: String(value?.agency || ""),
    notice_number: String(value?.notice_number || ""),
    modality: String(value?.modality || ""),
    session_date: value?.session_date ? String(value.session_date) : null,
    estimated_value:
      typeof value?.estimated_value === "number"
        ? value.estimated_value
        : Number(value?.estimated_value) || null,
    execution_deadline: String(value?.execution_deadline || ""),
    proposal_validity: String(value?.proposal_validity || ""),
    judgment_criterion: String(value?.judgment_criterion || ""),
    participation_recommendation: recommendation,
    recommendation_reason: String(value?.recommendation_reason || ""),
    required_documents: stringArray(value?.required_documents),
    technical_requirements: stringArray(value?.technical_requirements),
    financial_requirements: stringArray(value?.financial_requirements),
    guarantees: stringArray(value?.guarantees),
    deadlines: rows(value?.deadlines, (row) => ({
      item: String(row?.item || ""),
      date: row?.date ? String(row.date) : null,
      detail: String(row?.detail || ""),
    })).filter((row) => row.item),
    risks: rows(value?.risks, (row) => ({
      level: ["Baixo", "Médio", "Alto"].includes(row?.level) ? row.level : "Médio",
      item: String(row?.item || ""),
      reason: String(row?.reason || ""),
    })).filter((row) => row.item),
    restrictive_clauses: rows(value?.restrictive_clauses, (row) => ({
      item: String(row?.item || ""),
      explanation: String(row?.explanation || ""),
    })).filter((row) => row.item),
    checklist: rows(value?.checklist, (row) => ({
      item: String(row?.item || ""),
      category: String(row?.category || "Geral"),
      priority: ["Baixa", "Média", "Alta"].includes(row?.priority)
        ? row.priority
        : "Média",
    })).filter((row) => row.item),
    clarification_questions: stringArray(value?.clarification_questions),
    attention_points: stringArray(value?.attention_points),
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      return json({ error: "Sessão inválida. Entre novamente." }, 401);
    }

    const body = await request.json();
    const documentId = String(body.document_id || "");

    if (!documentId) return json({ error: "Selecione um edital." }, 400);

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return json({ error: "OPENAI_API_KEY não configurada na Vercel." }, 500);
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

    const { data: document, error: documentError } = await supabase
      .from("company_documents")
      .select("id,name,category,summary,processing_status")
      .eq("id", documentId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (documentError) return json({ error: documentError.message }, 500);
    if (!document) return json({ error: "Documento não encontrado." }, 404);

    const { data: chunks, error: chunksError } = await supabase
      .from("document_chunks")
      .select("chunk_index,content")
      .eq("document_id", documentId)
      .eq("organization_id", organizationId)
      .order("chunk_index", { ascending: true })
      .limit(220);

    if (chunksError) return json({ error: chunksError.message }, 500);

    const fullText = (chunks || [])
      .map((chunk) => String(chunk.content || ""))
      .join("\n\n")
      .slice(0, 120_000);

    if (fullText.length < 300) {
      return json({
        error:
          "O edital não possui texto suficiente indexado. Reenvie o PDF pela Biblioteca Inteligente.",
      }, 400);
    }

    const { data: previous } = await supabase
      .from("bid_analyses")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("document_id", documentId)
      .eq("status", "Processando")
      .maybeSingle();

    let analysisId = previous?.id || null;

    if (!analysisId) {
      const { data: created, error: createError } = await supabase
        .from("bid_analyses")
        .insert({
          organization_id: organizationId,
          document_id: documentId,
          created_by: user.id,
          status: "Processando",
        })
        .select("id")
        .single();

      if (createError) return json({ error: createError.message }, 500);
      analysisId = created.id;
    }

    const instructions = `
Você é um analista sênior de licitações e obras públicas brasileiras.
Analise o edital fornecido com rigor técnico e administrativo.

REGRAS:
- Responda somente com JSON válido, sem markdown.
- Não invente dados ausentes.
- Datas devem estar em YYYY-MM-DD quando forem identificáveis.
- Valores devem ser números, sem R$ e sem separadores de milhar.
- A recomendação é preliminar e deve considerar riscos, exigências e clareza do edital.
- Não declare uma cláusula como ilegal; classifique como potencialmente restritiva e explique.
- Liste documentos e requisitos de forma objetiva.
- Em riscos, use apenas: Baixo, Médio ou Alto.
- Em prioridade do checklist, use apenas: Baixa, Média ou Alta.

FORMATO OBRIGATÓRIO:
{
  "executive_summary": "string",
  "object": "string",
  "agency": "string",
  "notice_number": "string",
  "modality": "string",
  "session_date": "YYYY-MM-DD ou null",
  "estimated_value": 0 ou null,
  "execution_deadline": "string",
  "proposal_validity": "string",
  "judgment_criterion": "string",
  "participation_recommendation": "Participar | Analisar com cautela | Não participar",
  "recommendation_reason": "string",
  "required_documents": ["string"],
  "technical_requirements": ["string"],
  "financial_requirements": ["string"],
  "guarantees": ["string"],
  "deadlines": [{"item":"string","date":"YYYY-MM-DD ou null","detail":"string"}],
  "risks": [{"level":"Baixo | Médio | Alto","item":"string","reason":"string"}],
  "restrictive_clauses": [{"item":"string","explanation":"string"}],
  "checklist": [{"item":"string","category":"string","priority":"Baixa | Média | Alta"}],
  "clarification_questions": ["string"],
  "attention_points": ["string"]
}
`.trim();

    const input = `
ARQUIVO: ${document.name}
CATEGORIA: ${document.category || "Edital"}
RESUMO EXISTENTE: ${document.summary || "Não disponível"}

TEXTO DO EDITAL:
${fullText}
`.trim();

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
        max_output_tokens: 6500,
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
      const message =
        payload?.error?.message ||
        `OpenAI respondeu com status ${openAIResponse.status}.`;

      await supabase
        .from("bid_analyses")
        .update({ status: "Erro", error_message: message })
        .eq("id", analysisId);

      return json({ error: message }, 502);
    }

    let analysis: AnalysisPayload;

    try {
      analysis = normalizeAnalysis(extractJson(outputText(payload)));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao interpretar a análise.";

      await supabase
        .from("bid_analyses")
        .update({ status: "Erro", error_message: message })
        .eq("id", analysisId);

      return json({ error: message }, 502);
    }

    const { data: saved, error: saveError } = await supabase
      .from("bid_analyses")
      .update({
        status: "Concluído",
        executive_summary: analysis.executive_summary,
        extracted_data: analysis,
        recommendation: analysis.participation_recommendation,
        risk_level:
          analysis.risks.some((risk) => risk.level === "Alto")
            ? "Alto"
            : analysis.risks.some((risk) => risk.level === "Médio")
              ? "Médio"
              : "Baixo",
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .select("*,company_documents(name,category)")
      .single();

    if (saveError) return json({ error: saveError.message }, 500);

    return json({ analysis: saved });
  } catch (error) {
    console.error("/api/editais/analisar", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      500,
    );
  }
}
