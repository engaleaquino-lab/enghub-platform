import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNKS_PER_BATCH = 8;
const MAX_BATCH_CHARS = 14_000;
const OPENAI_TIMEOUT_MS = 50_000;

type Action = "start" | "process_batch" | "consolidate";

type RequestBody = {
  action?: Action;
  document_id?: string;
  analysis_id?: string;
  batch_index?: number;
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

const partialSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    facts: { type: "array", items: { type: "string" } },
    objects: { type: "array", items: { type: "string" } },
    agencies: { type: "array", items: { type: "string" } },
    notice_numbers: { type: "array", items: { type: "string" } },
    modalities: { type: "array", items: { type: "string" } },
    dates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          date: { anyOf: [{ type: "string" }, { type: "null" }] },
          detail: { type: "string" },
        },
        required: ["item", "date", "detail"],
      },
    },
    values: { type: "array", items: { type: "string" } },
    required_documents: { type: "array", items: { type: "string" } },
    technical_requirements: { type: "array", items: { type: "string" } },
    financial_requirements: { type: "array", items: { type: "string" } },
    guarantees: { type: "array", items: { type: "string" } },
    execution_conditions: { type: "array", items: { type: "string" } },
    payment_conditions: { type: "array", items: { type: "string" } },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          level: { type: "string", enum: ["Baixo", "Médio", "Alto"] },
          item: { type: "string" },
          reason: { type: "string" },
        },
        required: ["level", "item", "reason"],
      },
    },
    restrictive_clauses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["item", "explanation"],
      },
    },
    attention_points: { type: "array", items: { type: "string" } },
    clarification_questions: { type: "array", items: { type: "string" } },
  },
  required: [
    "facts", "objects", "agencies", "notice_numbers", "modalities", "dates",
    "values", "required_documents", "technical_requirements",
    "financial_requirements", "guarantees", "execution_conditions",
    "payment_conditions", "risks", "restrictive_clauses", "attention_points",
    "clarification_questions"
  ],
} as const;

const finalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    executive_summary: { type: "string" },
    object: { type: "string" },
    agency: { type: "string" },
    notice_number: { type: "string" },
    modality: { type: "string" },
    session_date: { anyOf: [{ type: "string" }, { type: "null" }] },
    estimated_value: { anyOf: [{ type: "number" }, { type: "null" }] },
    execution_deadline: { type: "string" },
    proposal_validity: { type: "string" },
    judgment_criterion: { type: "string" },
    participation_recommendation: {
      type: "string",
      enum: ["Participar", "Analisar com cautela", "Não participar"],
    },
    recommendation_reason: { type: "string" },
    required_documents: { type: "array", items: { type: "string" } },
    technical_requirements: { type: "array", items: { type: "string" } },
    financial_requirements: { type: "array", items: { type: "string" } },
    guarantees: { type: "array", items: { type: "string" } },
    deadlines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          date: { anyOf: [{ type: "string" }, { type: "null" }] },
          detail: { type: "string" },
        },
        required: ["item", "date", "detail"],
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          level: { type: "string", enum: ["Baixo", "Médio", "Alto"] },
          item: { type: "string" },
          reason: { type: "string" },
        },
        required: ["level", "item", "reason"],
      },
    },
    restrictive_clauses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          explanation: { type: "string" },
        },
        required: ["item", "explanation"],
      },
    },
    checklist: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          category: { type: "string" },
          priority: { type: "string", enum: ["Baixa", "Média", "Alta"] },
        },
        required: ["item", "category", "priority"],
      },
    },
    clarification_questions: { type: "array", items: { type: "string" } },
    attention_points: { type: "array", items: { type: "string" } },
  },
  required: [
    "executive_summary", "object", "agency", "notice_number", "modality",
    "session_date", "estimated_value", "execution_deadline",
    "proposal_validity", "judgment_criterion", "participation_recommendation",
    "recommendation_reason", "required_documents", "technical_requirements",
    "financial_requirements", "guarantees", "deadlines", "risks",
    "restrictive_clauses", "checklist", "clarification_questions",
    "attention_points"
  ],
} as const;

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  return (payload?.output || [])
    .flatMap((item: any) => item?.content || [])
    .filter((content: any) => typeof content?.text === "string")
    .map((content: any) => content.text)
    .join("\n")
    .trim();
}

async function callOpenAI(args: {
  apiKey: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        instructions: args.instructions,
        input: args.input,
        max_output_tokens: args.maxOutputTokens,
        text: {
          format: {
            type: "json_schema",
            name: args.schemaName,
            strict: true,
            schema: args.schema,
          },
        },
        store: false,
      }),
    });

    const raw = await response.text();
    let payload: any = {};

    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(raw || "A OpenAI devolveu uma resposta inválida.");
    }

    if (!response.ok) {
      throw new Error(
        payload?.error?.message ||
        `OpenAI respondeu com status ${response.status}.`,
      );
    }

    const output = extractResponseText(payload);
    if (!output) throw new Error("A IA respondeu sem conteúdo estruturado.");

    return JSON.parse(output);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Este lote ultrapassou o tempo disponível. Tente novamente.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function getContext() {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error("Sessão inválida. Entre novamente.");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (membershipError || !membership) {
    throw new Error("Usuário sem organização ativa.");
  }

  return {
    supabase,
    user,
    organizationId: membership.organization_id as string,
  };
}

async function startAnalysis(
  documentId: string,
  context: Awaited<ReturnType<typeof getContext>>,
) {
  const { supabase, user, organizationId } = context;

  const { data: document, error: documentError } = await supabase
    .from("company_documents")
    .select("id,name,category,processing_status")
    .eq("id", documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (documentError) throw documentError;
  if (!document) throw new Error("Documento não encontrado.");

  const { count, error: countError } = await supabase
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", documentId)
    .eq("organization_id", organizationId);

  if (countError) throw countError;
  if (!count) throw new Error("O edital não possui trechos indexados.");

  const totalBatches = Math.ceil(count / CHUNKS_PER_BATCH);

  const { data: analysis, error: analysisError } = await supabase
    .from("bid_analyses")
    .insert({
      organization_id: organizationId,
      document_id: documentId,
      created_by: user.id,
      status: "Preparando",
      extracted_data: {},
      error_message: null,
    })
    .select("id")
    .single();

  if (analysisError) throw analysisError;

  const batches = Array.from({ length: totalBatches }, (_, batchIndex) => ({
    organization_id: organizationId,
    analysis_id: analysis.id,
    document_id: documentId,
    batch_index: batchIndex,
    chunk_start: batchIndex * CHUNKS_PER_BATCH,
    chunk_end: Math.min((batchIndex + 1) * CHUNKS_PER_BATCH - 1, count - 1),
    status: "Pendente",
  }));

  const { error: batchError } = await supabase
    .from("bid_analysis_batches")
    .insert(batches);

  if (batchError) {
    await supabase.from("bid_analyses").delete().eq("id", analysis.id);
    throw batchError;
  }

  return {
    analysis_id: analysis.id,
    total_batches: totalBatches,
    total_chunks: count,
    document_name: document.name,
  };
}

async function processBatch(
  analysisId: string,
  batchIndex: number,
  apiKey: string,
  context: Awaited<ReturnType<typeof getContext>>,
) {
  const { supabase, organizationId } = context;

  const { data: analysis, error: analysisError } = await supabase
    .from("bid_analyses")
    .select("id,document_id,company_documents(name,category)")
    .eq("id", analysisId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (analysisError) throw analysisError;
  if (!analysis) throw new Error("Análise não encontrada.");

  const { data: batch, error: batchError } = await supabase
    .from("bid_analysis_batches")
    .select("*")
    .eq("analysis_id", analysisId)
    .eq("batch_index", batchIndex)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (batchError) throw batchError;
  if (!batch) throw new Error("Lote não encontrado.");

  if (batch.status === "Concluído" && batch.partial_data) {
    return { batch_index: batchIndex, status: "Concluído", reused: true };
  }

  await supabase
    .from("bid_analysis_batches")
    .update({ status: "Processando", error_message: null })
    .eq("id", batch.id);

  const { data: chunks, error: chunksError } = await supabase
    .from("document_chunks")
    .select("chunk_index,content")
    .eq("document_id", analysis.document_id)
    .eq("organization_id", organizationId)
    .gte("chunk_index", batch.chunk_start)
    .lte("chunk_index", batch.chunk_end)
    .order("chunk_index", { ascending: true });

  if (chunksError) throw chunksError;

  const batchText = (chunks || [])
    .map((chunk) => `[TRECHO ${chunk.chunk_index + 1}]\n${chunk.content}`)
    .join("\n\n")
    .slice(0, MAX_BATCH_CHARS);

  if (batchText.length < 50) throw new Error("O lote não possui texto suficiente.");

  try {
    const partial = await callOpenAI({
      apiKey,
      schemaName: "bid_batch_analysis",
      schema: partialSchema,
      maxOutputTokens: 1800,
      instructions: `
Você analisa uma parte de um edital público brasileiro.
Extraia somente informações presentes neste lote.
Não conclua que algo inexiste apenas porque não aparece neste lote.
Não invente dados. Não repita itens.
Datas identificáveis devem usar YYYY-MM-DD.
Registre exigências técnicas com quantitativos, parcelas relevantes e critérios.
Registre todas as condições relevantes de habilitação, execução, pagamento e risco.
      `.trim(),
      input: `
DOCUMENTO: ${(analysis as any).company_documents?.name || "Edital"}
LOTE: ${batchIndex + 1}

Analise integralmente todos os trechos abaixo:

${batchText}
      `.trim(),
    });

    const { error: updateError } = await supabase
      .from("bid_analysis_batches")
      .update({
        status: "Concluído",
        partial_data: partial,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", batch.id);

    if (updateError) throw updateError;

    await supabase
      .from("bid_analyses")
      .update({ status: `Analisando ${batchIndex + 1}` })
      .eq("id", analysisId);

    return { batch_index: batchIndex, status: "Concluído" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no lote.";

    await supabase
      .from("bid_analysis_batches")
      .update({ status: "Erro", error_message: message })
      .eq("id", batch.id);

    await supabase
      .from("bid_analyses")
      .update({ status: "Erro", error_message: `Lote ${batchIndex + 1}: ${message}` })
      .eq("id", analysisId);

    throw error;
  }
}

async function consolidateAnalysis(
  analysisId: string,
  apiKey: string,
  context: Awaited<ReturnType<typeof getContext>>,
) {
  const { supabase, organizationId } = context;

  const { data: analysis, error: analysisError } = await supabase
    .from("bid_analyses")
    .select("id,document_id,company_documents(name,category)")
    .eq("id", analysisId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (analysisError) throw analysisError;
  if (!analysis) throw new Error("Análise não encontrada.");

  const { data: batches, error: batchesError } = await supabase
    .from("bid_analysis_batches")
    .select("batch_index,status,partial_data")
    .eq("analysis_id", analysisId)
    .eq("organization_id", organizationId)
    .order("batch_index", { ascending: true });

  if (batchesError) throw batchesError;
  if (!batches?.length) throw new Error("Nenhum lote foi processado.");

  const incomplete = batches.filter((batch) => batch.status !== "Concluído");
  if (incomplete.length) {
    throw new Error(`Ainda existem ${incomplete.length} lote(s) não concluído(s).`);
  }

  await supabase
    .from("bid_analyses")
    .update({ status: "Consolidando", error_message: null })
    .eq("id", analysisId);

  const partials = batches.map((batch) => ({
    batch: batch.batch_index + 1,
    data: batch.partial_data,
  }));

  try {
    const finalAnalysis = await callOpenAI({
      apiKey,
      schemaName: "complete_bid_analysis",
      schema: finalSchema,
      maxOutputTokens: 4000,
      instructions: `
Você é um analista sênior de licitações e obras públicas brasileiras.
Consolide resultados parciais produzidos a partir de TODAS as partes do edital.
Elimine duplicidades sem perder detalhes, quantitativos, prazos ou condições.
Resolva divergências priorizando dados mais específicos e contextualizados.
Não invente informações ausentes.
Datas identificáveis devem usar YYYY-MM-DD.
Valores devem ser números, sem símbolo monetário.
Cláusulas devem ser chamadas apenas de potencialmente restritivas.
A recomendação é preliminar e deve considerar riscos, prazo, habilitação e clareza.
O checklist deve cobrir os documentos e providências necessários à participação.
      `.trim(),
      input: `
DOCUMENTO: ${(analysis as any).company_documents?.name || "Edital"}

Abaixo estão as análises de todos os lotes, na ordem do documento.
Consolide tudo em uma única análise final:

${JSON.stringify(partials)}
      `.trim(),
    });

    const riskLevel = finalAnalysis.risks?.some((risk: any) => risk.level === "Alto")
      ? "Alto"
      : finalAnalysis.risks?.some((risk: any) => risk.level === "Médio")
        ? "Médio"
        : "Baixo";

    const { data: saved, error: saveError } = await supabase
      .from("bid_analyses")
      .update({
        status: "Concluído",
        executive_summary: finalAnalysis.executive_summary,
        extracted_data: finalAnalysis,
        recommendation: finalAnalysis.participation_recommendation,
        risk_level: riskLevel,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", analysisId)
      .select("*,company_documents(name,category)")
      .single();

    if (saveError) throw saveError;
    return saved;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro na consolidação.";

    await supabase
      .from("bid_analyses")
      .update({ status: "Erro", error_message: `Consolidação: ${message}` })
      .eq("id", analysisId);

    throw error;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as RequestBody;
    const action = body.action || "start";
    const context = await getContext();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return json({ error: "OPENAI_API_KEY não configurada na Vercel." }, 500);
    }

    if (action === "start") {
      const documentId = String(body.document_id || "");
      if (!documentId) return json({ error: "Selecione um edital." }, 400);

      const result = await startAnalysis(documentId, context);
      return json(result);
    }

    const analysisId = String(body.analysis_id || "");
    if (!analysisId) return json({ error: "Análise não informada." }, 400);

    if (action === "process_batch") {
      const batchIndex = Number(body.batch_index);
      if (!Number.isInteger(batchIndex) || batchIndex < 0) {
        return json({ error: "Índice do lote inválido." }, 400);
      }

      const result = await processBatch(analysisId, batchIndex, apiKey, context);
      return json(result);
    }

    if (action === "consolidate") {
      const analysis = await consolidateAnalysis(analysisId, apiKey, context);
      return json({ analysis });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("/api/editais/analisar", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro interno." },
      500,
    );
  }
}
