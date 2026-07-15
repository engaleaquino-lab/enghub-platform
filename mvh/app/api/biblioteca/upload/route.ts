import { NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import mammoth from "mammoth";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function classify(name: string, text: string) {
  const source = `${name} ${text.slice(0, 4000)}`.toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["Edital", /edital|preg[aã]o|concorr[eê]ncia|licita[cç][aã]o/],
    ["Contrato", /contrato administrativo|instrumento contratual/],
    ["Termo aditivo", /termo aditivo|aditamento/],
    ["Atestado/CAT", /certid[aã]o de acervo t[eé]cnico|\bcat\b|atestado de capacidade/],
    ["ART/RRT", /anota[cç][aã]o de responsabilidade t[eé]cnica|\bart\b|\brrt\b/],
    ["Certidão", /certid[aã]o|cnd|fgts|cndt/],
    ["Medição", /medi[cç][aã]o|boletim de medi[cç][aã]o/],
    ["Ofício", /of[ií]cio|notifica[cç][aã]o administrativa/],
    ["Planilha/Orçamento", /planilha|or[cç]amento|sinapi|bdi|composi[cç][aã]o/],
  ];
  return rules.find(([, regex]) => regex.test(source))?.[0] || "Documento geral";
}

function makeSummary(text: string, category: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return `Arquivo cadastrado como ${category}. O conteúdo textual não pôde ser extraído automaticamente.`;
  return compact.slice(0, 900) + (compact.length > 900 ? "…" : "");
}

function chunkText(text: string, size = 1700, overlap = 220) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < compact.length) {
    let end = Math.min(compact.length, start + size);
    if (end < compact.length) {
      const breakAt = Math.max(compact.lastIndexOf(". ", end), compact.lastIndexOf("; ", end), compact.lastIndexOf(" ", end));
      if (breakAt > start + 700) end = breakAt + 1;
    }
    chunks.push(compact.slice(start, end).trim());
    if (end >= compact.length) break;
    start = Math.max(start + 1, end - overlap);
  }
  return chunks.filter(Boolean);
}

async function extractStoredFile(name: string, mimeType: string, buffer: Buffer) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (mimeType.includes("wordprocessingml") || extension === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value || "";
  }
  if (["xlsx", "xls", "csv"].includes(extension || "")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_csv(workbook.Sheets[sheetName]);
      return `PLANILHA: ${sheetName}\n${rows}`;
    }).join("\n\n");
  }
  if (mimeType.startsWith("text/") || ["txt", "md"].includes(extension || "")) return buffer.toString("utf8");
  return "";
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) return json({ error: "Não autenticado." }, 401);

    const body = await request.json();
    const storagePath = String(body.storage_path || "");
    const name = String(body.name || "");
    const mimeType = String(body.mime_type || "");
    const fileSize = Number(body.file_size || 0);
    const description = String(body.description || "").trim();
    const autoAnalyze = body.auto_analyze !== false;
    const contractId = String(body.contract_id || "") || null;
    const issueDate = String(body.issue_date || "") || null;
    const expiryDate = String(body.expiry_date || "") || null;
    let text = String(body.extracted_text || "");

    if (!storagePath || !name) {
      return json({ error: "Arquivo enviado não identificado." }, 400);
    }

    if (fileSize <= 0) {
      return json({ error: "O arquivo está vazio." }, 400);
    }

    if (fileSize > 30 * 1024 * 1024) {
      return json({ error: "O arquivo deve ter no máximo 30 MB." }, 400);
    }

    const { data: membership, error: membershipError } = await supabase
      .from("organization_members").select("organization_id")
      .eq("user_id", user.id).eq("status", "active").limit(1).single();
    if (membershipError || !membership) return json({ error: "Organização ativa não encontrada." }, 403);

    const organizationId = membership.organization_id;
    if (!storagePath.startsWith(`${organizationId}/`)) return json({ error: "Caminho do arquivo inválido." }, 403);

    let processingStatus = "Concluído";
    if (!text) {
      try {
        const { data: blob, error: downloadError } = await supabase.storage.from("contract-files").download(storagePath);
        if (downloadError) throw downloadError;
        text = await extractStoredFile(name, mimeType, Buffer.from(await blob.arrayBuffer()));
      } catch (error) {
        console.error("extractStoredFile", error);
        processingStatus = "Parcial";
      }
    }

    const category = String(body.category || "") || classify(name, text);
    const extractedSummary = makeSummary(text, category);
    const summary = description
      ? `${description}\n\n${extractedSummary}`.slice(0, 1800)
      : extractedSummary;

    const { data: document, error: documentError } = await supabase.from("company_documents").insert({
      organization_id: organizationId, contract_id: contractId, user_id: user.id,
      name, category, mime_type: mimeType || null, file_size: fileSize,
      storage_path: storagePath, issue_date: issueDate, expiry_date: expiryDate,
      status: expiryDate && new Date(`${expiryDate}T23:59:59`) < new Date() ? "Vencido" : "Válido",
      processing_status: processingStatus, summary,
    }).select().single();
    if (documentError) {
      await supabase.storage.from("contract-files").remove([storagePath]);
      return json({ error: documentError.message }, 400);
    }

    const chunks = chunkText(text);
    if (chunks.length) {
      const rows = chunks.map((content, index) => ({ organization_id: organizationId, document_id: document.id, chunk_index: index, content }));
      const { error: chunksError } = await supabase.from("document_chunks").insert(rows);
      if (chunksError) console.error("document_chunks", chunksError);
    }
    return json({
      document,
      chunks: chunks.length,
      category,
      auto_analysis_eligible:
        autoAnalyze &&
        category.toLowerCase().includes("edital") &&
        processingStatus === "Concluído",
    });
  } catch (error) {
    console.error("/api/biblioteca/upload", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
}
