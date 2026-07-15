import { NextResponse } from "next/server";
import { getOrganizationContext } from "@/lib/organization-context";

export const runtime = "nodejs";

function normalize(value: unknown) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%²³]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: unknown) {
  return normalize(value)
    .split(" ")
    .filter((item) => item.length >= 3);
}

function similarity(left: unknown, right: unknown) {
  const a = new Set(tokens(left));
  const b = new Set(tokens(right));
  if (!a.size || !b.size) return 0;

  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }

  return intersection / Math.max(a.size, b.size);
}

function isExpired(value?: string | null) {
  if (!value) return false;
  const expiry = new Date(`${value}T23:59:59`);
  return expiry.getTime() < Date.now();
}

function numeric(value: unknown) {
  const text = String(value || "")
    .replace(/\./g, "")
    .replace(",", ".");
  const match = text.match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

export async function POST(request: Request) {
  try {
    const { supabase, organizationId } =
      await getOrganizationContext();
    const body = await request.json();
    const analysisId = String(body.analysis_id || "");

    if (!analysisId) {
      return NextResponse.json(
        { error: "Análise não informada." },
        { status: 400 },
      );
    }

    const { data: analysis, error: analysisError } =
      await supabase
        .from("bid_analyses")
        .select("id,extracted_data,company_documents(name)")
        .eq("id", analysisId)
        .eq("organization_id", organizationId)
        .maybeSingle();

    if (analysisError) throw analysisError;
    if (!analysis) {
      return NextResponse.json(
        { error: "Análise não encontrada." },
        { status: 404 },
      );
    }

    const [
      documentsResult,
      professionalsResult,
      capabilitiesResult,
      financialResult,
    ] = await Promise.all([
      supabase
        .from("company_compliance_documents")
        .select("*")
        .eq("organization_id", organizationId),
      supabase
        .from("company_technical_professionals")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("active", true),
      supabase
        .from("company_technical_capabilities")
        .select("*,company_technical_professionals(name,profession)")
        .eq("organization_id", organizationId),
      supabase
        .from("company_financial_qualification")
        .select("*")
        .eq("organization_id", organizationId)
        .order("reference_year", { ascending: false }),
    ]);

    if (documentsResult.error) throw documentsResult.error;
    if (professionalsResult.error) throw professionalsResult.error;
    if (capabilitiesResult.error) throw capabilitiesResult.error;
    if (financialResult.error) throw financialResult.error;

    const companyDocuments = documentsResult.data || [];
    const professionals = professionalsResult.data || [];
    const capabilities = capabilitiesResult.data || [];
    const financial = financialResult.data || [];
    const extracted: any = analysis.extracted_data || {};

    const documentRequirements = [
      ...(extracted.credentialing || []).map((item: any) => ({
        category: "Credenciamento",
        name: item.requirement,
        reference: item.source_reference,
      })),
      ...(extracted.legal_qualification || []).map((item: any) => ({
        category: "Habilitação Jurídica",
        name: item.document,
        reference: item.source_reference,
      })),
      ...(extracted.fiscal_labor_qualification || []).map(
        (item: any) => ({
          category: "Fiscal e Trabalhista",
          name: item.document,
          reference: item.source_reference,
        }),
      ),
      ...(extracted.economic_financial_qualification || []).map(
        (item: any) => ({
          category: "Econômico-Financeira",
          name: item.document_or_index,
          reference: item.source_reference,
        }),
      ),
    ].filter((item) => item.name);

    const documentMatches = documentRequirements.map((requirement) => {
      const ranked = companyDocuments
        .map((document: any) => ({
          document,
          score: Math.max(
            similarity(requirement.name, document.document_type),
            similarity(requirement.name, document.name),
          ),
        }))
        .sort((a: any, b: any) => b.score - a.score);

      const best = ranked[0];
      const found = best && best.score >= 0.35;
      const expired = found && isExpired(best.document.expiry_date);

      return {
        type: "Documento",
        category: requirement.category,
        requirement: requirement.name,
        status: !found
          ? "Faltando"
          : expired
            ? "Vencido"
            : "Atende",
        matched_item: found ? best.document.name : null,
        detail: found
          ? expired
            ? `Documento vencido em ${best.document.expiry_date}.`
            : `Documento cadastrado: ${best.document.name}.`
          : "Nenhum documento compatível foi localizado no cadastro.",
        reference: requirement.reference || "",
      };
    });

    const technicalRequirements = extracted.technical_certificates || [];

    const technicalMatches = technicalRequirements.map(
      (requirement: any) => {
        const requiredQuantity =
          numeric(requirement.minimum_quantity) || 0;
        const requiredUnit = normalize(requirement.unit);

        const ranked = capabilities
          .map((capability: any) => {
            const serviceScore = Math.max(
              similarity(requirement.service, capability.service),
              similarity(requirement.service, capability.title),
            );
            const unitCompatible =
              !requiredUnit ||
              !capability.unit ||
              normalize(capability.unit) === requiredUnit;
            const quantity = Number(capability.quantity || 0);
            const quantityCompatible =
              !requiredQuantity || quantity >= requiredQuantity;

            return {
              capability,
              score:
                serviceScore +
                (unitCompatible ? 0.15 : -0.25) +
                (quantityCompatible ? 0.2 : 0),
              serviceScore,
              unitCompatible,
              quantityCompatible,
            };
          })
          .sort((a: any, b: any) => b.score - a.score);

        const best = ranked[0];
        const found = best && best.serviceScore >= 0.3;
        const meetsQuantity =
          found && best.unitCompatible && best.quantityCompatible;

        return {
          type: "Atestado/CAT",
          category: "Habilitação Técnica",
          requirement:
            `${requirement.service || "Serviço"} — ` +
            `${requirement.minimum_quantity || ""} ${
              requirement.unit || ""
            }`.trim(),
          status: !found
            ? "Faltando"
            : meetsQuantity
              ? "Atende"
              : "Insuficiente",
          matched_item: found ? best.capability.title : null,
          detail: !found
            ? "Nenhum atestado ou CAT compatível foi localizado."
            : meetsQuantity
              ? `Capacidade cadastrada: ${
                  best.capability.quantity || "—"
                } ${best.capability.unit || ""}.`
              : `Capacidade cadastrada: ${
                  best.capability.quantity || "—"
                } ${best.capability.unit || ""}; exigência: ${
                  requirement.minimum_quantity || "—"
                } ${requirement.unit || ""}.`,
          reference: requirement.source_reference || "",
        };
      },
    );

    const creaRequirements = [
      ...(extracted.crea_requirements || []),
      ...(extracted.cat_requirements || []),
    ];

    const professionalMatches = creaRequirements.map(
      (requirement: any) => {
        const text = JSON.stringify(requirement);
        const professional = professionals.find((item: any) =>
          similarity(
            text,
            `${item.profession} ${item.council} ${item.name}`,
          ) >= 0.25,
        );

        const hasCreaPJ = companyDocuments.some((item: any) =>
          normalize(
            `${item.document_type} ${item.name}`,
          ).includes("crea pessoa juridica"),
        );

        const asksEntity = /empresa|pessoa juridica|pj/i.test(text);
        const found = asksEntity ? hasCreaPJ : Boolean(professional);

        return {
          type: "CREA/Profissional",
          category: "Habilitação Técnica",
          requirement:
            requirement.requirement ||
            requirement.holder ||
            "Exigência de CREA/CAT",
          status: found ? "Atende" : "Faltando",
          matched_item: asksEntity
            ? hasCreaPJ
              ? "CREA Pessoa Jurídica"
              : null
            : professional
              ? `${professional.name} — ${professional.profession}`
              : null,
          detail: found
            ? "Cadastro compatível localizado."
            : "Não foi localizado cadastro compatível.",
          reference: requirement.source_reference || "",
        };
      },
    );

    const economicRequirements =
      extracted.economic_financial_qualification || [];
    const latestFinancial = financial[0];

    const economicMatches = economicRequirements.map(
      (requirement: any) => {
        const text = normalize(
          `${requirement.document_or_index} ${
            requirement.required_value_or_condition || ""
          }`,
        );

        let value: number | null = null;
        let label = "";

        if (text.includes("liquidez corrente")) {
          value = latestFinancial?.current_liquidity ?? null;
          label = "Liquidez Corrente";
        } else if (text.includes("liquidez geral")) {
          value = latestFinancial?.general_liquidity ?? null;
          label = "Liquidez Geral";
        } else if (text.includes("solvencia")) {
          value = latestFinancial?.general_solvency ?? null;
          label = "Solvência Geral";
        } else if (text.includes("patrimonio liquido")) {
          value = latestFinancial?.net_worth ?? null;
          label = "Patrimônio Líquido";
        } else if (text.includes("capital social")) {
          value = latestFinancial?.share_capital ?? null;
          label = "Capital Social";
        }

        const requiredValue = numeric(
          requirement.required_value_or_condition,
        );

        const found = latestFinancial && (value !== null || !label);
        const meets =
          found &&
          (requiredValue === null ||
            value === null ||
            Number(value) >= requiredValue);

        return {
          type: "Econômico-Financeira",
          category: "Habilitação Econômico-Financeira",
          requirement: requirement.document_or_index,
          status: !found
            ? "Faltando"
            : meets
              ? "Atende"
              : "Insuficiente",
          matched_item: latestFinancial
            ? `Balanço ${latestFinancial.reference_year}`
            : null,
          detail: latestFinancial
            ? label
              ? `${label}: ${value ?? "não informado"}.`
              : "Balanço cadastrado para conferência documental."
            : "Nenhum balanço foi cadastrado.",
          reference: requirement.source_reference || "",
        };
      },
    );

    const items = [
      ...documentMatches,
      ...professionalMatches,
      ...technicalMatches,
      ...economicMatches,
    ];

    const summary = {
      total: items.length,
      atende: items.filter((item) => item.status === "Atende").length,
      faltando: items.filter((item) => item.status === "Faltando").length,
      vencido: items.filter((item) => item.status === "Vencido").length,
      insuficiente: items.filter(
        (item) => item.status === "Insuficiente",
      ).length,
    };

    return NextResponse.json({
      analysis_id: analysis.id,
      analysis_name:
        (analysis as any).company_documents?.name ||
        "Licitação analisada",
      summary,
      items,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao comparar o cadastro.",
      },
      { status: 500 },
    );
  }
}
