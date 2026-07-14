import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CHUNKS_PER_BATCH = 1;
const BATCHES_PER_MERGE = 3;
const OPENAI_TIMEOUT_MS = 45_000;
const OPENAI_ATTEMPTS = 1;

type Action =
  | "start"
  | "resume"
  | "process_batch"
  | "process_merge"
  | "process_final_section"
  | "finalize";

type RequestBody = {
  action?: Action;
  document_id?: string;
  analysis_id?: string;
  batch_index?: number;
  merge_index?: number;
  section_index?: number;
};

type ApiContext = Awaited<ReturnType<typeof getContext>>;

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

const compactBatchSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    credentialing: {
      type: "array",
      maxItems: 14,
      items: { type: "string" },
    },
    legal_qualification: {
      type: "array",
      maxItems: 14,
      items: { type: "string" },
    },
    fiscal_labor_qualification: {
      type: "array",
      maxItems: 18,
      items: { type: "string" },
    },
    technical_qualification: {
      type: "array",
      maxItems: 22,
      items: { type: "string" },
    },
    economic_financial_qualification: {
      type: "array",
      maxItems: 18,
      items: { type: "string" },
    },
    declarations_and_annexes: {
      type: "array",
      maxItems: 20,
      items: { type: "string" },
    },
    guarantees_visits_and_deadlines: {
      type: "array",
      maxItems: 18,
      items: { type: "string" },
    },
    execution_measurement_payment: {
      type: "array",
      maxItems: 18,
      items: { type: "string" },
    },
    elimination_and_attention: {
      type: "array",
      maxItems: 18,
      items: { type: "string" },
    },
  },
  required: [
    "credentialing",
    "legal_qualification",
    "fiscal_labor_qualification",
    "technical_qualification",
    "economic_financial_qualification",
    "declarations_and_annexes",
    "guarantees_visits_and_deadlines",
    "execution_measurement_payment",
    "elimination_and_attention",
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
    session_date: {
      anyOf: [{ type: "string" }, { type: "null" }],
    },
    estimated_value: {
      anyOf: [{ type: "number" }, { type: "null" }],
    },
    execution_deadline: { type: "string" },
    proposal_validity: { type: "string" },
    judgment_criterion: { type: "string" },

    credentialing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement: { type: "string" },
          mandatory: { type: "string" },
          deadline_or_stage: { type: "string" },
          consequence: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "requirement",
          "mandatory",
          "deadline_or_stage",
          "consequence",
          "source_reference",
        ],
      },
    },

    legal_qualification: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          document: { type: "string" },
          details: { type: "string" },
          mandatory: { type: "string" },
          source_reference: { type: "string" },
        },
        required: ["document", "details", "mandatory", "source_reference"],
      },
    },

    fiscal_labor_qualification: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          document: { type: "string" },
          issuing_body_or_scope: { type: "string" },
          validity_or_condition: { type: "string" },
          mandatory: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "document",
          "issuing_body_or_scope",
          "validity_or_condition",
          "mandatory",
          "source_reference",
        ],
      },
    },

    crea_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          holder: { type: "string" },
          professional_or_entity: { type: "string" },
          requirement: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "holder",
          "professional_or_entity",
          "requirement",
          "source_reference",
        ],
      },
    },

    cat_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement: { type: "string" },
          holder: { type: "string" },
          linkage_requirement: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "requirement",
          "holder",
          "linkage_requirement",
          "source_reference",
        ],
      },
    },

    technical_certificates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          service: { type: "string" },
          minimum_quantity: { type: "string" },
          unit: { type: "string" },
          minimum_percentage: { type: "string" },
          accepts_sum: { type: "string" },
          required_holder: { type: "string" },
          public_or_private_allowed: { type: "string" },
          observations: { type: "string" },
          source_reference: { type: "string" },
          literal_evidence: { type: "string" },
        },
        required: [
          "service",
          "minimum_quantity",
          "unit",
          "minimum_percentage",
          "accepts_sum",
          "required_holder",
          "public_or_private_allowed",
          "observations",
          "source_reference",
          "literal_evidence",
        ],
      },
    },

    other_technical_requirements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          requirement: { type: "string" },
          details: { type: "string" },
          source_reference: { type: "string" },
        },
        required: ["requirement", "details", "source_reference"],
      },
    },

    economic_financial_qualification: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          document_or_index: { type: "string" },
          required_value_or_condition: { type: "string" },
          period_or_reference: { type: "string" },
          mandatory: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "document_or_index",
          "required_value_or_condition",
          "period_or_reference",
          "mandatory",
          "source_reference",
        ],
      },
    },

    declarations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          annex: { type: "string" },
          name: { type: "string" },
          mandatory: { type: "string" },
          delivery_stage: { type: "string" },
          model_provided: { type: "string" },
          consequence: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "annex",
          "name",
          "mandatory",
          "delivery_stage",
          "model_provided",
          "consequence",
          "source_reference",
        ],
      },
    },

    guarantees: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string" },
          percentage_or_value: { type: "string" },
          accepted_modalities: { type: "string" },
          deadline: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "type",
          "percentage_or_value",
          "accepted_modalities",
          "deadline",
          "source_reference",
        ],
      },
    },

    site_visit: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          mandatory: { type: "string" },
          date_time_location: { type: "string" },
          responsible_person: { type: "string" },
          required_document: { type: "string" },
          alternative_declaration: { type: "string" },
          consequence: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "mandatory",
          "date_time_location",
          "responsible_person",
          "required_document",
          "alternative_declaration",
          "consequence",
          "source_reference",
        ],
      },
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
          source_reference: { type: "string" },
        },
        required: ["item", "date", "detail", "source_reference"],
      },
    },

    execution_measurement_payment: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          topic: { type: "string" },
          rule: { type: "string" },
          deadline_or_index: { type: "string" },
          source_reference: { type: "string" },
        },
        required: ["topic", "rule", "deadline_or_index", "source_reference"],
      },
    },

    penalties: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          penalty: { type: "string" },
          trigger: { type: "string" },
          percentage_or_duration: { type: "string" },
          source_reference: { type: "string" },
        },
        required: [
          "penalty",
          "trigger",
          "percentage_or_duration",
          "source_reference",
        ],
      },
    },

    participation_recommendation: {
      type: "string",
      enum: ["Participar", "Analisar com cautela", "Não participar"],
    },
    recommendation_reason: { type: "string" },

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
          source_reference: { type: "string" },
        },
        required: ["level", "item", "reason", "source_reference"],
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
          source_reference: { type: "string" },
        },
        required: ["item", "explanation", "source_reference"],
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
          source_reference: { type: "string" },
        },
        required: ["item", "category", "priority", "source_reference"],
      },
    },

    mandatory_documents: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          consequence: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["item", "consequence", "evidence"],
      },
    },
    mandatory_actions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          deadline: { type: "string" },
          consequence: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["item", "deadline", "consequence", "evidence"],
      },
    },
    disqualification_risks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          item: { type: "string" },
          type: {
            type: "string",
            enum: ["Inabilitação", "Desclassificação", "Impedimento", "Outro"],
          },
          reason: { type: "string" },
          evidence: { type: "string" },
        },
        required: ["item", "type", "reason", "evidence"],
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
    "credentialing",
    "legal_qualification",
    "fiscal_labor_qualification",
    "crea_requirements",
    "cat_requirements",
    "technical_certificates",
    "other_technical_requirements",
    "economic_financial_qualification",
    "declarations",
    "guarantees",
    "site_visit",
    "deadlines",
    "execution_measurement_payment",
    "penalties",
    "participation_recommendation",
    "recommendation_reason",
    "risks",
    "restrictive_clauses",
    "checklist",
    "mandatory_documents",
    "mandatory_actions",
    "disqualification_risks",
    "clarification_questions",
    "attention_points",
  ],
} as const;



const finalGeneralSchema = {
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
  ],
} as const;

const finalCredentialingSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    credentialing: finalSchema.properties.credentialing,
  },
  required: ["credentialing"],
} as const;

const finalLegalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    legal_qualification: finalSchema.properties.legal_qualification,
  },
  required: ["legal_qualification"],
} as const;

const finalFiscalLaborSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    fiscal_labor_qualification:
      finalSchema.properties.fiscal_labor_qualification,
  },
  required: ["fiscal_labor_qualification"],
} as const;

const finalCreaCatSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    crea_requirements: finalSchema.properties.crea_requirements,
    cat_requirements: finalSchema.properties.cat_requirements,
  },
  required: ["crea_requirements", "cat_requirements"],
} as const;

const finalTechnicalCertificatesSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    technical_certificates:
      finalSchema.properties.technical_certificates,
    other_technical_requirements:
      finalSchema.properties.other_technical_requirements,
  },
  required: [
    "technical_certificates",
    "other_technical_requirements",
  ],
} as const;

const finalEconomicSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    economic_financial_qualification:
      finalSchema.properties.economic_financial_qualification,
  },
  required: ["economic_financial_qualification"],
} as const;

const finalDeclarationsSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    declarations: finalSchema.properties.declarations,
  },
  required: ["declarations"],
} as const;

const finalOperationalSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    guarantees: finalSchema.properties.guarantees,
    site_visit: finalSchema.properties.site_visit,
    deadlines: finalSchema.properties.deadlines,
    execution_measurement_payment:
      finalSchema.properties.execution_measurement_payment,
    penalties: finalSchema.properties.penalties,
  },
  required: [
    "guarantees",
    "site_visit",
    "deadlines",
    "execution_measurement_payment",
    "penalties",
  ],
} as const;

const finalRiskChecklistSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    participation_recommendation:
      finalSchema.properties.participation_recommendation,
    recommendation_reason:
      finalSchema.properties.recommendation_reason,
    risks: finalSchema.properties.risks,
    restrictive_clauses:
      finalSchema.properties.restrictive_clauses,
    checklist: finalSchema.properties.checklist,
    mandatory_documents:
      finalSchema.properties.mandatory_documents,
    mandatory_actions:
      finalSchema.properties.mandatory_actions,
    disqualification_risks:
      finalSchema.properties.disqualification_risks,
    clarification_questions:
      finalSchema.properties.clarification_questions,
    attention_points: finalSchema.properties.attention_points,
  },
  required: [
    "participation_recommendation",
    "recommendation_reason",
    "risks",
    "restrictive_clauses",
    "checklist",
    "mandatory_documents",
    "mandatory_actions",
    "disqualification_risks",
    "clarification_questions",
    "attention_points",
  ],
} as const;

const FINAL_SECTION_CONFIG = [
  {
    name: "enghub_final_01_general",
    schema: finalGeneralSchema,
    maxOutputTokens: 1000,
    instructions: `
Extraia somente os dados principais:
objeto, órgão, número, modalidade, sessão, valor estimado,
prazo de execução, validade da proposta e julgamento.
Produza um resumo executivo curto e factual.
    `.trim(),
  },
  {
    name: "enghub_final_02_credentialing",
    schema: finalCredentialingSchema,
    maxOutputTokens: 1400,
    instructions: `
Audite somente o CREDENCIAMENTO.
Liste representante, procuração, documento com foto, cadastro em plataforma,
credenciamento eletrônico, prazo, etapa e consequência.
Não misture com habilitação jurídica.
    `.trim(),
  },
  {
    name: "enghub_final_03_legal",
    schema: finalLegalSchema,
    maxOutputTokens: 1500,
    instructions: `
Audite somente a HABILITAÇÃO JURÍDICA.
Liste individualmente CNPJ, contrato/estatuto social, alterações,
registro comercial, ata de eleição, procuração e documento do representante.
    `.trim(),
  },
  {
    name: "enghub_final_04_fiscal_labor",
    schema: finalFiscalLaborSchema,
    maxOutputTokens: 1800,
    instructions: `
Audite somente a HABILITAÇÃO FISCAL E TRABALHISTA.
Nunca agrupe certidões. Liste separadamente:
Receita Federal/PGFN, Fazenda Estadual, Fazenda Municipal, FGTS,
CNDT, inscrição estadual/municipal, SICAF e outras exigências encontradas.
    `.trim(),
  },
  {
    name: "enghub_final_05_crea_cat",
    schema: finalCreaCatSchema,
    maxOutputTokens: 1800,
    instructions: `
Audite somente CREA, responsáveis técnicos, vínculos e CAT.
Separe CREA da pessoa jurídica e de cada profissional.
Informe titular da CAT, compatibilidade, registro e exigência de vínculo.
    `.trim(),
  },
  {
    name: "enghub_final_06_atestados",
    schema: finalTechnicalCertificatesSchema,
    maxOutputTokens: 3200,
    instructions: `
Audite somente ATESTADOS TÉCNICOS e demais exigências técnicas.
Crie uma ficha separada para cada serviço.
Preserve serviço exato, quantidade mínima, unidade, percentual,
somatório, titular, público/privado, observações, referência e evidência literal.
Exemplos: estrutura metálica 3.000 kg; cobertura em telha metálica 500 m².
Não resuma vários serviços em um único item.
    `.trim(),
  },
  {
    name: "enghub_final_07_economic",
    schema: finalEconomicSchema,
    maxOutputTokens: 1800,
    instructions: `
Audite somente a HABILITAÇÃO ECONÔMICO-FINANCEIRA.
Separe balanço, DRE, índices LG/LC/SG, capital social,
patrimônio líquido, certidão de falência e respectivos valores/períodos.
    `.trim(),
  },
  {
    name: "enghub_final_08_declarations",
    schema: finalDeclarationsSchema,
    maxOutputTokens: 2200,
    instructions: `
Audite somente DECLARAÇÕES E ANEXOS.
Para cada declaração, informe:
número do anexo, nome completo, obrigatoriedade, etapa de entrega,
se existe modelo, consequência e referência.
Exemplo: ANEXO II — Declaração de Fatos Supervenientes.
    `.trim(),
  },
  {
    name: "enghub_final_09_operational",
    schema: finalOperationalSchema,
    maxOutputTokens: 2200,
    instructions: `
Audite somente:
garantias, visita/vistoria, prazos, execução, medição,
pagamento, reajuste e penalidades.
Destaque se visita ou atestado de vistoria é obrigatório e eliminatório.
    `.trim(),
  },
  {
    name: "enghub_final_10_risks_checklist",
    schema: finalRiskChecklistSchema,
    maxOutputTokens: 3000,
    instructions: `
Produza somente:
recomendação, riscos, cláusulas potencialmente restritivas,
itens eliminatórios e checklist final.
O checklist deve conter um item individual para cada documento,
certidão, declaração, anexo, CREA, CAT, atestado e providência.
Não use categorias genéricas.
    `.trim(),
  },
] as const;


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
          "Esta etapa ultrapassou 45 segundos e será repetida pela tela.",
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


async function resumeAnalysis(
  documentId: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;

  const { data: analysis, error: analysisError } = await supabase
    .from("bid_analyses")
    .select("id,status,created_at")
    .eq("document_id", documentId)
    .eq("organization_id", organizationId)
    .in("status", [
      "Preparando",
      "Erro",
      "Processando",
      "Consolidando",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (analysisError) throw analysisError;

  if (!analysis) {
    return null;
  }

  const { data: batches, error: batchesError } = await supabase
    .from("bid_analysis_batches")
    .select("batch_index,status")
    .eq("analysis_id", analysis.id)
    .eq("organization_id", organizationId)
    .order("batch_index", { ascending: true });

  if (batchesError) throw batchesError;

  const { data: merges, error: mergesError } = await supabase
    .from("bid_analysis_merges")
    .select("merge_index,status")
    .eq("analysis_id", analysis.id)
    .eq("organization_id", organizationId)
    .order("merge_index", { ascending: true });

  if (mergesError) throw mergesError;

  return {
    analysis_id: analysis.id,
    total_batches: batches?.length || 0,
    total_merges: merges?.length || 0,
    completed_batches:
      batches?.filter((item) => item.status === "Concluído").length || 0,
    completed_merges:
      merges?.filter((item) => item.status === "Concluído").length || 0,
    batch_statuses: batches || [],
    merge_statuses: merges || [],
  };
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
      schema: compactBatchSchema,
      maxOutputTokens: 650,
      instructions: `
Você analisa trechos de um edital público brasileiro.

Leia integralmente todo o lote e classifique literalmente as exigências nas seções:
1. Credenciamento;
2. Habilitação jurídica;
3. Habilitação fiscal e trabalhista;
4. Habilitação técnica;
5. Habilitação econômico-financeira;
6. Declarações e anexos;
7. Garantias, visita técnica e prazos;
8. Execução, medição e pagamento;
9. Itens eliminatórios e pontos de atenção.

REGRAS:
- Cada item deve começar com a referência "[Trecho N]" correspondente.
- Preserve exatamente serviços, quantidades, unidades, percentuais, prazos e condições.
- Exemplo técnico: "[Trecho 18] Atestado de estrutura metálica: mínimo 3.000 kg; somatório não informado."
- Nunca resuma "certidões": liste Receita Federal/PGFN, Estadual, Municipal, FGTS e CNDT separadamente.
- Diferencie credenciamento de habilitação jurídica.
- Diferencie CREA da empresa, CREA dos profissionais, CAT e atestados.
- Para declarações, preserve o número do anexo e o nome completo.
- Quando houver "sob pena de inabilitação/desclassificação", registre literalmente.
- Não invente informações e não conclua ausência com base em um único lote.
- Elimine apenas duplicidades dentro do próprio lote.
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
      schema: compactBatchSchema,
      maxOutputTokens: 900,
      instructions: `
Você consolida análises literais de trechos consecutivos do mesmo edital.

REGRAS:
- Preserve as referências "[Trecho N]".
- Não misture Credenciamento com Habilitação Jurídica.
- Não misture Fiscal/Trabalhista com Econômico-Financeira.
- Preserve cada certidão individualmente.
- Preserve cada atestado técnico individualmente, com serviço, quantidade, unidade, percentual, titular e somatório.
- Preserve o número e o nome de cada anexo/declaracão.
- Elimine somente duplicidades reais.
- Não invente informações.
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


type CriticalAudit = {
  mandatory_documents: Array<{
    item: string;
    consequence: string;
    evidence: string;
  }>;
  mandatory_actions: Array<{
    item: string;
    deadline: string;
    consequence: string;
    evidence: string;
  }>;
  disqualification_risks: Array<{
    item: string;
    type: "Inabilitação" | "Desclassificação" | "Impedimento" | "Outro";
    reason: string;
    evidence: string;
  }>;
  forced_fiscal_documents: string[];
  forced_site_visit: string[];
  forced_checklist: Array<{
    item: string;
    category: string;
    priority: "Alta";
  }>;
};

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function evidenceAround(text: string, index: number, radius = 220) {
  const start = Math.max(0, index - radius);
  const end = Math.min(text.length, index + radius);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function uniqueStrings(values: string[]) {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function uniqueObjects<T extends Record<string, unknown>>(
  values: T[],
  keyBuilder: (value: T) => string,
) {
  const seen = new Set<string>();

  return values.filter((value) => {
    const key = keyBuilder(value).toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function auditCriticalRequirements(fullText: string): CriticalAudit {
  const normalized = normalizeSearchText(fullText).toLowerCase();

  const audit: CriticalAudit = {
    mandatory_documents: [],
    mandatory_actions: [],
    disqualification_risks: [],
    forced_fiscal_documents: [],
    forced_site_visit: [],
    forced_checklist: [],
  };

  const cndtPatterns = [
    /certidao negativa de debitos trabalhistas/g,
    /certidao positiva com efeito de negativa de debitos trabalhistas/g,
    /\bcndt\b/g,
    /regularidade trabalhista/g,
    /debitos trabalhistas/g,
  ];

  for (const pattern of cndtPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const evidence = evidenceAround(fullText, match.index || 0);

      audit.forced_fiscal_documents.push(
        "Certidão Negativa de Débitos Trabalhistas (CNDT), ou certidão positiva com efeito de negativa, quando admitida.",
      );

      audit.mandatory_documents.push({
        item: "Certidão Negativa de Débitos Trabalhistas (CNDT)",
        consequence:
          "A ausência pode causar inabilitação quando exigida na fase de habilitação.",
        evidence,
      });

      audit.disqualification_risks.push({
        item: "CNDT / regularidade trabalhista",
        type: "Inabilitação",
        reason:
          "Documento de regularidade trabalhista identificado no edital e potencialmente eliminatório.",
        evidence,
      });

      audit.forced_checklist.push({
        item: "Emitir e conferir validade da CNDT",
        category: "Regularidade trabalhista",
        priority: "Alta",
      });
    }
  }

  const visitPatterns = [
    /visita tecnica/g,
    /vistoria tecnica/g,
    /atestado de vistoria/g,
    /declaracao de vistoria/g,
    /termo de vistoria/g,
    /comprovante de visita/g,
  ];

  for (const pattern of visitPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const evidence = evidenceAround(fullText, match.index || 0);
      const local = normalizeSearchText(evidence).toLowerCase();

      const mandatory =
        /obrigator|devera|deve ser|condicao de participacao|sob pena|inabilit|desclassific/.test(
          local,
        );

      const consequence = /desclassific/.test(local)
        ? "Desclassificação"
        : /inabilit/.test(local)
          ? "Inabilitação"
          : mandatory
            ? "Risco de eliminação por descumprimento"
            : "Verificar se é obrigatória ou substituível por declaração";

      audit.forced_site_visit.push(
        mandatory
          ? "Visita/vistoria técnica obrigatória identificada. Conferir agendamento, responsável, prazo e documento comprobatório."
          : "Visita/vistoria técnica mencionada. Confirmar se é facultativa, obrigatória ou substituível por declaração.",
      );

      audit.mandatory_actions.push({
        item: "Realizar visita/vistoria técnica e obter o respectivo atestado ou comprovante",
        deadline: "Conferir data, horário e antecedência definidos no edital",
        consequence,
        evidence,
      });

      audit.disqualification_risks.push({
        item: "Visita técnica / atestado de vistoria",
        type: /desclassific/.test(local)
          ? "Desclassificação"
          : /inabilit/.test(local)
            ? "Inabilitação"
            : "Outro",
        reason: mandatory
          ? "A redação indica caráter obrigatório ou consequência eliminatória."
          : "A exigência foi localizada e precisa ser confirmada antes da participação.",
        evidence,
      });

      audit.forced_checklist.push({
        item: "Agendar e realizar visita/vistoria técnica",
        category: "Providência obrigatória",
        priority: "Alta",
      });

      audit.forced_checklist.push({
        item: "Obter atestado, termo ou comprovante de vistoria",
        category: "Documento técnico",
        priority: "Alta",
      });
    }
  }

  const eliminationPatterns = [
    /sob pena de inabilitacao/g,
    /sera inabilitad[oa]/g,
    /sob pena de desclassificacao/g,
    /sera desclassificad[oa]/g,
    /implicara a inabilitacao/g,
    /implicara a desclassificacao/g,
  ];

  for (const pattern of eliminationPatterns) {
    for (const match of normalized.matchAll(pattern)) {
      const evidence = evidenceAround(fullText, match.index || 0);
      const local = normalizeSearchText(evidence).toLowerCase();

      audit.disqualification_risks.push({
        item: "Exigência com consequência eliminatória expressa",
        type: /desclassific/.test(local)
          ? "Desclassificação"
          : /inabilit/.test(local)
            ? "Inabilitação"
            : "Outro",
        reason:
          "O edital contém redação expressa de eliminação pelo descumprimento.",
        evidence,
      });
    }
  }

  audit.mandatory_documents = uniqueObjects(
    audit.mandatory_documents,
    (value) => `${value.item}-${value.evidence}`,
  );
  audit.mandatory_actions = uniqueObjects(
    audit.mandatory_actions,
    (value) => `${value.item}-${value.evidence}`,
  );
  audit.disqualification_risks = uniqueObjects(
    audit.disqualification_risks,
    (value) => `${value.item}-${value.evidence}`,
  );
  audit.forced_fiscal_documents = uniqueStrings(
    audit.forced_fiscal_documents,
  );
  audit.forced_site_visit = uniqueStrings(audit.forced_site_visit);
  audit.forced_checklist = uniqueObjects(
    audit.forced_checklist,
    (value) => `${value.category}-${value.item}`,
  );

  return audit;
}


type LiteralAuditItem = {
  category: string;
  reference: string;
  text: string;
};

function literalWindow(
  chunks: Array<{ chunk_index: number; content: string }>,
  category: string,
  pattern: RegExp,
  radius = 320,
): LiteralAuditItem[] {
  const items: LiteralAuditItem[] = [];

  for (const chunk of chunks) {
    const content = String(chunk.content || "");
    const normalized = normalizeSearchText(content);

    for (const match of normalized.matchAll(pattern)) {
      const index = match.index || 0;
      const start = Math.max(0, index - radius);
      const end = Math.min(content.length, index + radius);

      items.push({
        category,
        reference: `Trecho ${chunk.chunk_index + 1}`,
        text: content.slice(start, end).replace(/\s+/g, " ").trim(),
      });
    }
  }

  return uniqueObjects(
    items,
    (item) => `${item.category}-${item.reference}-${item.text}`,
  ).slice(0, 120);
}

function buildLiteralAudit(
  chunks: Array<{ chunk_index: number; content: string }>,
) {
  return [
    ...literalWindow(
      chunks,
      "Credenciamento",
      /\bcredenciamento\b|\bcredenciar\b|\brepresentante\b|\bprocuracao\b/gi,
    ),
    ...literalWindow(
      chunks,
      "Fiscal e trabalhista",
      /cndt|debitos trabalhistas|fgts|fazenda estadual|fazenda municipal|receita federal|pgfn|divida ativa/gi,
    ),
    ...literalWindow(
      chunks,
      "CREA, CAT e atestados",
      /\bcrea\b|\bcat\b|certidao de acervo tecnico|atestado tecnico|capacidade tecnica|parcela de maior relevancia|somatorio/gi,
    ),
    ...literalWindow(
      chunks,
      "Quantitativos técnicos",
      /\bkg\b|\bm²\b|\bm2\b|\bm³\b|\bm3\b|\bton\b|\bmetros?\b|\bpercentual\b|\b%\b/gi,
    ),
    ...literalWindow(
      chunks,
      "Econômico-financeira",
      /balanco patrimonial|\bdre\b|liquidez geral|liquidez corrente|solvencia|capital social|patrimonio liquido|falencia/gi,
    ),
    ...literalWindow(
      chunks,
      "Declarações e anexos",
      /\banexo\s+[ivxlcdm0-9]+\b|declaracao de|modelo de declaracao/gi,
    ),
    ...literalWindow(
      chunks,
      "Visita técnica",
      /visita tecnica|vistoria tecnica|atestado de vistoria|declaracao de vistoria|comprovante de visita/gi,
    ),
    ...literalWindow(
      chunks,
      "Consequência eliminatória",
      /sob pena de inabilitacao|sera inabilitad|sob pena de desclassificacao|sera desclassificad/gi,
    ),
  ];
}


async function getFinalSourceData(
  analysisId: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;
  const analysis = await getAnalysis(analysisId, context);

  const { data: auditChunks, error: auditChunksError } = await supabase
    .from("document_chunks")
    .select("chunk_index,content")
    .eq("document_id", analysis.document_id)
    .eq("organization_id", organizationId)
    .order("chunk_index", { ascending: true });

  if (auditChunksError) throw auditChunksError;

  const completeDocumentText = (auditChunks || [])
    .map((chunk) => String(chunk.content || ""))
    .join("\n\n");

  const criticalAudit = auditCriticalRequirements(
    completeDocumentText,
  );

  const literalAudit = buildLiteralAudit(
    (auditChunks || []).map((chunk) => ({
      chunk_index: Number(chunk.chunk_index || 0),
      content: String(chunk.content || ""),
    })),
  );

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

  return {
    analysis,
    merges,
    criticalAudit,
    literalAudit,
  };
}

async function processFinalSection(
  analysisId: string,
  sectionIndex: number,
  apiKey: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;

  if (
    !Number.isInteger(sectionIndex) ||
    sectionIndex < 0 ||
    sectionIndex >= FINAL_SECTION_CONFIG.length
  ) {
    throw new Error("Seção final inválida.");
  }

  const config = FINAL_SECTION_CONFIG[sectionIndex];

  const { data: existing, error: existingError } = await supabase
    .from("bid_analysis_final_sections")
    .select("*")
    .eq("analysis_id", analysisId)
    .eq("section_index", sectionIndex)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (existingError) throw existingError;

  if (
    existing?.status === "Concluído" &&
    existing.section_data &&
    existing.section_name === config.name
  ) {
    return {
      section_index: sectionIndex,
      status: "Concluído",
      reused: true,
    };
  }

  const source = await getFinalSourceData(analysisId, context);

  const rowPayload = {
    organization_id: organizationId,
    analysis_id: analysisId,
    document_id: source.analysis.document_id,
    section_index: sectionIndex,
    section_name: config.name,
    status: "Processando",
    error_message: null,
    attempts: Number(existing?.attempts || 0) + 1,
  };

  if (existing) {
    const { error } = await supabase
      .from("bid_analysis_final_sections")
      .update(rowPayload)
      .eq("id", existing.id);

    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("bid_analysis_final_sections")
      .insert(rowPayload);

    if (error) throw error;
  }

  try {
    const result = await callStructuredOpenAI({
      apiKey,
      schemaName: config.name,
      schema: config.schema,
      maxOutputTokens: config.maxOutputTokens,
      instructions: `
Você é um auditor de editais de obras públicas brasileiras.

Você NÃO é um resumidor.
Sua função é localizar todas as exigências da seção solicitada.

${config.instructions}

REGRAS GERAIS:
- Não invente informações.
- Preserve números, unidades, percentuais e referências.
- Use "Trecho N" quando página/item não estiver disponível.
- Nunca omita uma exigência presente na auditoria literal.
      `.trim(),
      input: `
DOCUMENTO: ${
        (source.analysis as any).company_documents?.name || "Edital"
      }

CONSOLIDAÇÕES INTERMEDIÁRIAS:

${JSON.stringify(source.merges)}

AUDITORIA LITERAL DO TEXTO COMPLETO:

${JSON.stringify(source.literalAudit)}
      `.trim(),
    });

    const { error: updateError } = await supabase
      .from("bid_analysis_final_sections")
      .update({
        status: "Concluído",
        section_data: result,
        error_message: null,
        completed_at: new Date().toISOString(),
      })
      .eq("analysis_id", analysisId)
      .eq("section_index", sectionIndex)
      .eq("organization_id", organizationId);

    if (updateError) throw updateError;

    return {
      section_index: sectionIndex,
      status: "Concluído",
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erro na seção final.";

    await supabase
      .from("bid_analysis_final_sections")
      .update({
        status: "Erro",
        error_message: message,
      })
      .eq("analysis_id", analysisId)
      .eq("section_index", sectionIndex)
      .eq("organization_id", organizationId);

    throw error;
  }
}

async function finalizeAnalysis(
  analysisId: string,
  context: ApiContext,
) {
  const { supabase, organizationId } = context;
  const source = await getFinalSourceData(analysisId, context);

  const { data: sections, error: sectionsError } = await supabase
    .from("bid_analysis_final_sections")
    .select("section_index,status,section_data")
    .eq("analysis_id", analysisId)
    .eq("organization_id", organizationId)
    .order("section_index", { ascending: true });

  if (sectionsError) throw sectionsError;

  if (!sections || sections.length !== FINAL_SECTION_CONFIG.length) {
    throw new Error("As quatro seções finais ainda não foram criadas.");
  }

  const incomplete = sections.filter(
    (section) => section.status !== "Concluído",
  );

  if (incomplete.length) {
    throw new Error(
      `Ainda existem ${incomplete.length} seção(ões) finais pendentes.`,
    );
  }

  const finalAnalysis = Object.assign(
    {},
    ...sections.map((section) => section.section_data || {}),
  ) as any;

  finalAnalysis.fiscal_labor_qualification =
    finalAnalysis.fiscal_labor_qualification || [];
  finalAnalysis.site_visit = finalAnalysis.site_visit || [];
  finalAnalysis.checklist = finalAnalysis.checklist || [];
  finalAnalysis.mandatory_documents =
    finalAnalysis.mandatory_documents || [];
  finalAnalysis.mandatory_actions =
    finalAnalysis.mandatory_actions || [];
  finalAnalysis.disqualification_risks =
    finalAnalysis.disqualification_risks || [];

  for (const forced of source.criticalAudit.forced_fiscal_documents) {
    const exists = finalAnalysis.fiscal_labor_qualification.some(
      (item: any) =>
        JSON.stringify(item).toLowerCase().includes(
          forced.toLowerCase(),
        ),
    );

    if (!exists) {
      finalAnalysis.fiscal_labor_qualification.push({
        document: forced,
        issuing_body_or_scope: "Justiça do Trabalho",
        validity_or_condition: "Conferir validade no edital",
        mandatory: "Sim, quando exigida",
        source_reference: "Auditoria literal do texto completo",
      });
    }
  }

  finalAnalysis.checklist = uniqueObjects(
    [
      ...finalAnalysis.checklist,
      ...source.criticalAudit.forced_checklist.map((item) => ({
        ...item,
        source_reference: "Auditoria literal do texto completo",
      })),
    ],
    (value: any) => `${value.category}-${value.item}`,
  );

  finalAnalysis.mandatory_documents = uniqueObjects(
    [
      ...finalAnalysis.mandatory_documents,
      ...source.criticalAudit.mandatory_documents,
    ],
    (value: any) => `${value.item}-${value.evidence}`,
  );

  finalAnalysis.mandatory_actions = uniqueObjects(
    [
      ...finalAnalysis.mandatory_actions,
      ...source.criticalAudit.mandatory_actions,
    ],
    (value: any) => `${value.item}-${value.evidence}`,
  );

  finalAnalysis.disqualification_risks = uniqueObjects(
    [
      ...finalAnalysis.disqualification_risks,
      ...source.criticalAudit.disqualification_risks,
    ],
    (value: any) => `${value.item}-${value.evidence}`,
  );

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
      executive_summary: finalAnalysis.executive_summary || "",
      extracted_data: finalAnalysis,
      recommendation:
        finalAnalysis.participation_recommendation ||
        "Analisar com cautela",
      risk_level: riskLevel,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", analysisId)
    .select("*,company_documents(name,category)")
    .single();

  if (saveError) throw saveError;

  return saved;
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

    if (action === "resume") {
      const documentId = String(body.document_id || "");

      if (!documentId) {
        return json({ error: "Selecione um edital." }, 400);
      }

      return json({
        resume: await resumeAnalysis(documentId, context),
      });
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

    if (action === "process_final_section") {
      const sectionIndex = Number(body.section_index);

      if (!Number.isInteger(sectionIndex) || sectionIndex < 0) {
        return json(
          { error: "Índice da seção final inválido." },
          400,
        );
      }

      return json(
        await processFinalSection(
          analysisId,
          sectionIndex,
          apiKey,
          context,
        ),
      );
    }

    if (action === "finalize") {
      return json({
        analysis: await finalizeAnalysis(
          analysisId,
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
