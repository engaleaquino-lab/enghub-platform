import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNKS_PER_BATCH = 3;
const BATCHES_PER_MERGE = 4;
const OPENAI_TIMEOUT_MS = 55_000;
const OPENAI_ATTEMPTS = 2;

type Action =
  | "start"
  | "process_batch"
  | "process_merge"
  | "consolidate";

type RequestBody = {
  action?: Action;
  document_id?: string;
  analysis_id?: string;
  batch_index?: number;
  merge_index?: number;
};

type ApiContext = Awaited<ReturnType<typeof getContext>>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

const findingItemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    category: {
      type: "string",
      enum: [
        "Objeto",
        "Órgão",
        "Edital",
        "Modalidade",
        "Valor",
        "Data",
        "Habilitação jurídica",
        "Regularidade fiscal",
        "Qualificação técnica",
        "Qualificação econômico-financeira",
        "Garantia",
        "Proposta",
        "Execução",
        "Medição",
        "Pagamento",
        "Sanção",
        "Risco",
        "Cláusula potencialmente restritiva",
        "Pedido de esclarecimento",
        "Outro",
      ],
    },
    fact: { type: "string" },
    evidence: { type: "string" },
  },
  required: ["category", "fact", "evidence"],
} as const;

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    findings: {
      type: "array",
      items: findingItemSchema,
    },
  },
  required: ["summary", "findings"],
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
    session_date: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    estimated_value: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    execution_deadline: { type: "string" },
    proposal_validity: { type: "string" },
    judgment_criterion: { type: "string" },
    participation_recommendation: {
      type: "string",
      enum: ["Participar", "Analisar com cautela", "Não participar"],
    },
    recommendation_reason: { type: "string" },
    required_documents: {
      type: "array",
      items: { type: "string" },
    },
    technical_requirements: {
      type: "array",
      items: { type: "string" },
    },
    financial_requirements: {
      type: "array",
      items: { type: "string" },
    },
    guarantees: {
      type: "array",
      items: { type: "string" },
    },
    deadlines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          date: {
            anyOf: [{ type: "string" }, { type: "null" }],
          },
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
          level: {
            type: "string",
            enum: ["Baixo", "Médio", "Alto"],
          },
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
          priority: {
            type: "string",
            enum: ["Baixa", "Média", "Alta"],
          },
        },
        required: ["item", "category", "priority"],
      },
    },
    clarification_questions: {
      type: "array",
      items: { type: "string" },
    },
    attention_points: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "executive_summary",
    "object",
    "agency",
    "notice_number",
    "modality",
    "session_date",
    "estimated_value",
    "execution_deadline",
    "proposal_validity",
    "judgment_criterion",
    "participation_recommendation",
    "recommendation_reason",
    "required_documents",
    "technical_requirements",
    "financial_requirements",
    "guarantees",
    "deadlines",
    "risks",
    "restrictive_clauses",
    "checklist",
    "clarification_questions",
    "attention_points",
  ],
} as const;

type ChatCompletionMessage = {
  content?: string | null;
  refusal?: string | null;
};

async function callStructuredOpenAI(args: {
  apiKey: string;
  instructions: string;
  input: string;
  schemaName: string;
  schema: unknown;
  maxOutputTokens: number;
}) {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= OPENAI_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      OPENAI_TIMEOUT_MS,
    );

    try {
      const response = await fetch(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.apiKey}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            model:
              process.env.OPENAI_ANALYSIS_MODEL ||
              "gpt-4o-mini",
            temperature: 0,
            messages: [
              {
                role: "system",
                content: args.instructions,
              },
              {
                role: "user",
                content: args.input,
              },
            ],
            max_tokens:
              attempt === 1
                ? args.maxOutputTokens
                : Math.ceil(args.maxOutputTokens * 1.5),
            response_format: {
              type: "json_schema",
              json_schema: {
                name: args.schemaName,
                strict: true,
                schema: args.schema,
              },
            },
          }),
        },
      );

      const raw = await response.text();
      let payload: any;

      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        throw new Error(
          "A OpenAI devolveu uma resposta HTTP inválida.",
        );
      }

      if (!response.ok) {
        throw new Error(
          payload?.error?.message ||
            `OpenAI respondeu com status ${response.status}.`,
        );
      }

      const choice = payload?.choices?.[0];
      const message = (choice?.message || {}) as ChatCompletionMessage;

      if (message.refusal) {
        throw new Error(
          `A IA recusou esta análise: ${message.refusal}`,
        );
      }

      if (choice?.finish_reason === "length") {
        throw new Error(
          "A resposta atingiu o limite antes de terminar.",
        );
      }

      if (
        choice?.finish_reason &&
        !["stop", "length"].includes(choice.finish_reason)
      ) {
        throw new Error(
          `A resposta terminou de forma inesperada: ${choice.finish_reason}.`,
        );
      }

      const content = String(message.content || "").trim();

      if (!content) {
        throw new Error(
          "A IA respondeu sem conteúdo estruturado.",
        );
      }

      try {
        return JSON.parse(content);
      } catch {
        throw new Error(
          "A IA devolveu conteúdo que não pôde ser interpretado como JSON.",
        );
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error("Falha desconhecida na OpenAI.");

      if (lastError.name === "AbortError") {
        lastError = new Error(
          "A chamada à IA ultrapassou o tempo disponível.",
        );
      }

      if (attempt < OPENAI_ATTEMPTS) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * attempt),
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError || new Error("Falha ao consultar a OpenAI.");
}

async function getContext() {
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
  context: ApiContext,
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
  if (!count) {
    throw new Error("O edital não possui trechos indexados.");
  }

  const totalBatches = Math.ceil(count / CHUNKS_PER_BATCH);
  const totalMerges = Math.ceil(
    totalBatches / BATCHES_PER_MERGE,
  );

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

  const batches = Array.from(
    { length: totalBatches },
    (_, batchIndex) => ({
      organization_id: organizationId,
      analysis_id: analysis.id,
      document_id: documentId,
      batch_index: batchIndex,
      chunk_start: batchIndex * CHUNKS_PER_BATCH,
      chunk_end: Math.min(
        (batchIndex + 1) * CHUNKS_PER_BATCH - 1,
        count - 1,
      ),
      status: "Pendente",
    }),
  );

  const merges = Array.from(
    { length: totalMerges },
    (_, mergeIndex) => ({
      organization_id: organizationId,
      analysis_id: analysis.id,
      document_id: documentId,
      merge_index: mergeIndex,
      batch_start: mergeIndex * BATCHES_PER_MERGE,
      batch_end: Math.min(
        (mergeIndex + 1) * BATCHES_PER_MERGE - 1,
        totalBatches - 1,
      ),
      status: "Pendente",
    }),
  );

  const { error: batchError } = await supabase
    .from("bid_analysis_batches")
    .insert(batches);

  if (batchError) {
    await supabase
      .from("bid_analyses")
      .delete()
      .eq("id", analysis.id);

    throw batchError;
  }

  const { error: mergeError } = await supabase
    .from("bid_analysis_merges")
    .insert(merges);

  if (mergeError) {
    await supabase
      .from("bid_analyses")
      .delete()
      .eq("id", analysis.id);

    throw mergeError;
  }

  return {
    analysis_id: analysis.id,
    total_batches: totalBatches,
    total_merges: totalMerges,
    total_chunks: count,
    document_name: document.name,
  };
}

async function getAnalysis(
  analysisId: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;

  const { data, error } = await supabase
    .from("bid_analyses")
    .select("id,document_id,company_documents(name,category)")
    .eq("id", analysisId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Análise não encontrada.");

  return data;
}

async function processBatch(
  analysisId: string,
  batchIndex: number,
  apiKey: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;
  const analysis = await getAnalysis(analysisId, context);

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
    return {
      batch_index: batchIndex,
      status: "Concluído",
      reused: true,
    };
  }

  await supabase
    .from("bid_analysis_batches")
    .update({
      status: "Processando",
      error_message: null,
      attempts: Number(batch.attempts || 0) + 1,
    })
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
    .map(
      (chunk) =>
        `[TRECHO ${chunk.chunk_index + 1}]\n${String(
          chunk.content || "",
        )}`,
    )
    .join("\n\n");

  if (batchText.trim().length < 30) {
    throw new Error("O lote não possui texto suficiente.");
  }

  try {
    const partial = await callStructuredOpenAI({
      apiKey,
      schemaName: "enghub_bid_batch",
      schema: extractionSchema,
      maxOutputTokens: 1800,
      instructions: `
Você analisa uma parte de um edital público brasileiro.

Leia integralmente todos os trechos recebidos.

Extraia fatos objetivos, exigências, condições, prazos,
quantitativos e riscos presentes neste lote.

Não conclua que algo inexiste apenas porque não apareceu
neste lote. Não invente informações. Não repita fatos.

Em "evidence", registre uma frase curta que permita localizar
a informação no trecho analisado.
      `.trim(),
      input: `
DOCUMENTO: ${
        (analysis as any).company_documents?.name || "Edital"
      }
LOTE: ${batchIndex + 1}

TRECHOS DO EDITAL:

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

    return {
      batch_index: batchIndex,
      status: "Concluído",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro no lote.";

    await supabase
      .from("bid_analysis_batches")
      .update({
        status: "Erro",
        error_message: message,
      })
      .eq("id", batch.id);

    await supabase
      .from("bid_analyses")
      .update({
        status: "Erro",
        error_message: `Lote ${batchIndex + 1}: ${message}`,
      })
      .eq("id", analysisId);

    throw error;
  }
}

async function processMerge(
  analysisId: string,
  mergeIndex: number,
  apiKey: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;
  const analysis = await getAnalysis(analysisId, context);

  const { data: merge, error: mergeError } = await supabase
    .from("bid_analysis_merges")
    .select("*")
    .eq("analysis_id", analysisId)
    .eq("merge_index", mergeIndex)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (mergeError) throw mergeError;
  if (!merge) throw new Error("Grupo de consolidação não encontrado.");

  if (merge.status === "Concluído" && merge.merged_data) {
    return {
      merge_index: mergeIndex,
      status: "Concluído",
      reused: true,
    };
  }

  const { data: batches, error: batchesError } = await supabase
    .from("bid_analysis_batches")
    .select("batch_index,status,partial_data")
    .eq("analysis_id", analysisId)
    .eq("organization_id", organizationId)
    .gte("batch_index", merge.batch_start)
    .lte("batch_index", merge.batch_end)
    .order("batch_index", { ascending: true });

  if (batchesError) throw batchesError;

  const incomplete = (batches || []).filter(
    (batch) => batch.status !== "Concluído",
  );

  if (incomplete.length) {
    throw new Error(
      `Existem ${incomplete.length} lote(s) não concluído(s) neste grupo.`,
    );
  }

  await supabase
    .from("bid_analysis_merges")
    .update({
      status: "Processando",
      error_message: null,
      attempts: Number(merge.attempts || 0) + 1,
    })
    .eq("id", merge.id);

  try {
    const merged = await callStructuredOpenAI({
      apiKey,
      schemaName: "enghub_bid_merge",
      schema: extractionSchema,
      maxOutputTokens: 2200,
      instructions: `
Você consolida análises parciais consecutivas do mesmo edital.

Una todos os fatos sem perder informações, quantitativos,
datas, exigências ou condições.

Elimine apenas duplicidades reais. Preserve divergências
quando os dados se referirem a situações diferentes.

Não invente informações e mantenha evidências curtas.
      `.trim(),
      input: `
DOCUMENTO: ${
        (analysis as any).company_documents?.name || "Edital"
      }
GRUPO: ${mergeIndex + 1}

ANÁLISES PARCIAIS:

${JSON.stringify(batches)}
      `.trim(),
    });

    const { error: updateError } = await supabase
      .from("bid_analysis_merges")
      .update({
        status: "Concluído",
        merged_data: merged,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", merge.id);

    if (updateError) throw updateError;

    return {
      merge_index: mergeIndex,
      status: "Concluído",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro na consolidação intermediária.";

    await supabase
      .from("bid_analysis_merges")
      .update({
        status: "Erro",
        error_message: message,
      })
      .eq("id", merge.id);

    await supabase
      .from("bid_analyses")
      .update({
        status: "Erro",
        error_message: `Grupo ${mergeIndex + 1}: ${message}`,
      })
      .eq("id", analysisId);

    throw error;
  }
}

async function consolidateAnalysis(
  analysisId: string,
  apiKey: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;
  const analysis = await getAnalysis(analysisId, context);

  const { data: merges, error: mergesError } = await supabase
    .from("bid_analysis_merges")
    .select("merge_index,status,merged_data")
    .eq("analysis_id", analysisId)
    .eq("organization_id", organizationId)
    .order("merge_index", { ascending: true });

  if (mergesError) throw mergesError;
  if (!merges?.length) {
    throw new Error("Nenhuma consolidação intermediária foi criada.");
  }

  const incomplete = merges.filter(
    (merge) => merge.status !== "Concluído",
  );

  if (incomplete.length) {
    throw new Error(
      `Ainda existem ${incomplete.length} grupo(s) não concluído(s).`,
    );
  }

  await supabase
    .from("bid_analyses")
    .update({
      status: "Consolidando",
      error_message: null,
    })
    .eq("id", analysisId);

  try {
    const finalAnalysis = await callStructuredOpenAI({
      apiKey,
      schemaName: "enghub_complete_bid_analysis",
      schema: finalSchema,
      maxOutputTokens: 4800,
      instructions: `
Você é um analista sênior de licitações e obras públicas brasileiras.

Produza a análise final usando as consolidações que representam
TODOS os trechos do edital.

Elimine duplicidades sem perder detalhes, quantitativos,
prazos, exigências ou condições.

Não invente informações ausentes. Quando um campo principal
não for localizado, use string vazia ou null.

Datas identificáveis devem usar YYYY-MM-DD. Valores devem ser
números sem símbolo monetário.

Não declare cláusulas como ilegais. Classifique-as somente como
potencialmente restritivas e explique o motivo.

A recomendação de participação é preliminar e deve considerar
riscos, habilitação, prazo, execução e clareza do edital.
      `.trim(),
      input: `
DOCUMENTO: ${
        (analysis as any).company_documents?.name || "Edital"
      }

CONSOLIDAÇÕES DE TODO O EDITAL:

${JSON.stringify(merges)}
      `.trim(),
    });

    const riskLevel = finalAnalysis.risks?.some(
      (risk: any) => risk.level === "Alto",
    )
      ? "Alto"
      : finalAnalysis.risks?.some(
            (risk: any) => risk.level === "Médio",
          )
        ? "Médio"
        : "Baixo";

    const { data: saved, error: saveError } = await supabase
      .from("bid_analyses")
      .update({
        status: "Concluído",
        executive_summary: finalAnalysis.executive_summary,
        extracted_data: finalAnalysis,
        recommendation:
          finalAnalysis.participation_recommendation,
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
    const message =
      error instanceof Error
        ? error.message
        : "Erro na consolidação final.";

    await supabase
      .from("bid_analyses")
      .update({
        status: "Erro",
        error_message: `Consolidação final: ${message}`,
      })
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
      return json(
        {
          error:
            "OPENAI_API_KEY não configurada na Vercel.",
        },
        500,
      );
    }

    if (action === "start") {
      const documentId = String(body.document_id || "");

      if (!documentId) {
        return json({ error: "Selecione um edital." }, 400);
      }

      return json(await startAnalysis(documentId, context));
    }

    const analysisId = String(body.analysis_id || "");

    if (!analysisId) {
      return json({ error: "Análise não informada." }, 400);
    }

    if (action === "process_batch") {
      const batchIndex = Number(body.batch_index);

      if (!Number.isInteger(batchIndex) || batchIndex < 0) {
        return json(
          { error: "Índice do lote inválido." },
          400,
        );
      }

      return json(
        await processBatch(
          analysisId,
          batchIndex,
          apiKey,
          context,
        ),
      );
    }

    if (action === "process_merge") {
      const mergeIndex = Number(body.merge_index);

      if (!Number.isInteger(mergeIndex) || mergeIndex < 0) {
        return json(
          {
            error:
              "Índice da consolidação intermediária inválido.",
          },
          400,
        );
      }

      return json(
        await processMerge(
          analysisId,
          mergeIndex,
          apiKey,
          context,
        ),
      );
    }

    if (action === "consolidate") {
      return json({
        analysis: await consolidateAnalysis(
          analysisId,
          apiKey,
          context,
        ),
      });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("/api/editais/analisar", error);

    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro interno.",
      },
      500,
    );
  }
}
