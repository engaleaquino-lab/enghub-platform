"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { currentOrg, dateBR, getSignedFileUrl, listRows } from "@/lib/supabase-data";
import { supabaseBrowser } from "@/lib/supabase-browser";
import JSZip from "jszip";

type LibraryDocument = {
  id: string;
  contract_id?: string | null;
  name: string;
  category?: string | null;
  mime_type?: string | null;
  file_size?: number | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  status?: string | null;
  processing_status?: string | null;
  summary?: string | null;
  storage_path?: string | null;
  created_at: string;
  auto_analysis_status?: string | null;
  last_analysis_id?: string | null;
};


async function extractPdfInBrowser(file: File) {
  const importer = new Function("url", "return import(url)") as (url: string) => Promise<any>;
  const pdfjs = await importer("https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item: any) => item.str || "").join(" "));
  }
  return pages.join("\n\n");
}

function fileSize(value?: number | null) {
  const bytes = Number(value || 0);
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}


const supportedZipExtensions = new Set([
  "pdf",
  "docx",
  "xlsx",
  "xls",
  "csv",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "webp",
]);

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() || "";
}

function mimeFromName(name: string) {
  const extension = extensionOf(name);
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    txt: "text/plain",
    md: "text/markdown",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  return map[extension] || "application/octet-stream";
}

function inferDocumentRole(
  name: string,
  category?: string | null,
) {
  const source = `${name} ${category || ""}`.toLowerCase();

  if (/edital|concorr[eê]ncia|preg[aã]o/.test(source)) {
    return "Edital";
  }
  if (/termo.?de.?refer[eê]ncia|\btr\b/.test(source)) {
    return "Termo de Referência";
  }
  if (/projeto.?b[aá]sico/.test(source)) {
    return "Projeto Básico";
  }
  if (/memorial/.test(source)) {
    return "Memorial Descritivo";
  }
  if (/planilha|or[cç]amento|bdi|composi[cç][aã]o/.test(source)) {
    return "Planilha Orçamentária";
  }
  if (/cronograma/.test(source)) {
    return "Cronograma";
  }
  if (/minuta|contrato/.test(source)) {
    return "Minuta Contratual";
  }
  if (/declara[cç][aã]o|anexo/.test(source)) {
    return "Declarações/Modelos";
  }

  return "Outro Anexo";
}

export default function LibraryPage() {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LibraryDocument | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisLabel, setAnalysisLabel] = useState("");

  async function load() {
    try {
      setError("");
      const [documentRows, contractRows] = await Promise.all([
        listRows("company_documents"),
        listRows("contracts"),
      ]);
      setDocuments(documentRows as LibraryDocument[]);
      setContracts(contractRows);
    } catch (cause: any) {
      setError(cause.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const contractMap = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts],
  );

  const categories = useMemo(
    () => Array.from(new Set(documents.map((item) => item.category).filter(Boolean))).sort(),
    [documents],
  );

  const filtered = useMemo(() => {
    const term = search.toLowerCase().trim();
    return documents.filter((item) => {
      const contract = contractMap.get(item.contract_id || "");
      const haystack = `${item.name} ${item.category || ""} ${item.summary || ""} ${contract?.contract_number || ""} ${contract?.object || ""}`.toLowerCase();
      return (!term || haystack.includes(term)) && (!category || item.category === category);
    });
  }, [documents, contractMap, search, category]);

  const alerts = useMemo(() => {
    const now = new Date();
    const next30 = new Date();
    next30.setDate(now.getDate() + 30);
    return documents.filter((item) => {
      if (!item.expiry_date) return false;
      const expiry = new Date(`${item.expiry_date}T23:59:59`);
      return expiry <= next30;
    });
  }, [documents]);


  async function analysisRequest(
    body: Record<string, unknown>,
    timeoutMs = 58_000,
  ) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      timeoutMs,
    );

    try {
      const response = await fetch("/api/editais/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(
          payload.error || "Falha na análise automática.",
        );
      }

      return payload;
    } catch (error) {
      if (
        error instanceof DOMException &&
        error.name === "AbortError"
      ) {
        throw new Error(
          "Uma etapa da análise automática ultrapassou o tempo disponível.",
        );
      }

      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function analysisStep(
    body: Record<string, unknown>,
    label: string,
  ) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        return await analysisRequest(body);
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error("Erro desconhecido.");

        if (attempt < 2) {
          setAnalysisLabel(
            `${label}: repetindo etapa automaticamente…`,
          );
          await new Promise((resolve) =>
            window.setTimeout(resolve, 1200),
          );
        }
      }
    }

    throw new Error(
      `${label}: ${lastError?.message || "falha."}`,
    );
  }

  async function runAutomaticSingleAnalysis(
    documentId: string,
    documentName: string,
  ) {
    const labels = [
      "Dados principais",
      "Credenciamento",
      "Habilitação Jurídica",
      "Fiscal e Trabalhista",
      "CREA e CAT",
      "Atestados técnicos",
      "Econômico-Financeira",
      "Declarações e Anexos",
      "Proposta, BDI e CPU",
      "Vistoria, prazos e execução",
      "Riscos",
      "Itens eliminatórios",
      "Checklist final",
    ];

    setAnalysisProgress(0);
    setAnalysisLabel(
      `Iniciando análise automática de ${documentName}…`,
    );

    const start = await analysisRequest({
      action: "fast_start",
      document_id: documentId,
    });

    const analysisId = String(start.analysis_id || "");
    const total = Number(
      start.total_sections || labels.length,
    );

    if (!analysisId) {
      throw new Error(
        "A análise automática não foi iniciada.",
      );
    }

    const concurrency = 3;
    let completed = 0;

    for (
      let offset = 0;
      offset < total;
      offset += concurrency
    ) {
      const indexes = Array.from(
        {
          length: Math.min(
            concurrency,
            total - offset,
          ),
        },
        (_, index) => offset + index,
      );

      setAnalysisLabel(
        `Analisando automaticamente: ${indexes
          .map((index) => labels[index] || `Etapa ${index + 1}`)
          .join(" • ")}`,
      );

      await Promise.all(
        indexes.map((sectionIndex) =>
          analysisStep(
            {
              action: "fast_process_section",
              analysis_id: analysisId,
              section_index: sectionIndex,
            },
            labels[sectionIndex] ||
              `Etapa ${sectionIndex + 1}`,
          ),
        ),
      );

      completed += indexes.length;
      setAnalysisProgress(
        Math.round((completed / (total + 1)) * 100),
      );
    }

    setAnalysisLabel("Finalizando análise automática…");

    await analysisStep(
      {
        action: "fast_finalize",
        analysis_id: analysisId,
      },
      "Finalização",
    );

    setAnalysisProgress(100);
    setAnalysisLabel("Análise automática concluída.");
  }

  async function runAutomaticDossierAnalysis(
    dossierId: string,
    dossierTitle: string,
  ) {
    const labels = [
      "Dados principais",
      "Credenciamento",
      "Habilitação Jurídica",
      "Fiscal e Trabalhista",
      "CREA e CAT",
      "Atestados técnicos",
      "Econômico-Financeira",
      "Declarações e Anexos",
      "Proposta, BDI e CPU",
      "Vistoria, prazos e execução",
      "Riscos",
      "Itens eliminatórios",
      "Checklist e referências cruzadas",
    ];

    setAnalysisProgress(0);
    setAnalysisLabel(
      `Iniciando análise automática do dossiê ${dossierTitle}…`,
    );

    const start = await analysisRequest({
      action: "dossier_start",
      dossier_id: dossierId,
    });

    const analysisId = String(start.analysis_id || "");
    const total = Number(
      start.total_sections || labels.length,
    );

    if (!analysisId) {
      throw new Error(
        "A análise automática do dossiê não foi iniciada.",
      );
    }

    const concurrency = 3;
    let completed = 0;

    for (
      let offset = 0;
      offset < total;
      offset += concurrency
    ) {
      const indexes = Array.from(
        {
          length: Math.min(
            concurrency,
            total - offset,
          ),
        },
        (_, index) => offset + index,
      );

      setAnalysisLabel(
        `Cruzando edital e anexos: ${indexes
          .map((index) => labels[index] || `Etapa ${index + 1}`)
          .join(" • ")}`,
      );

      await Promise.all(
        indexes.map((sectionIndex) =>
          analysisStep(
            {
              action: "dossier_process_section",
              analysis_id: analysisId,
              dossier_id: dossierId,
              section_index: sectionIndex,
            },
            labels[sectionIndex] ||
              `Etapa ${sectionIndex + 1}`,
          ),
        ),
      );

      completed += indexes.length;
      setAnalysisProgress(
        Math.round((completed / (total + 1)) * 100),
      );
    }

    setAnalysisLabel(
      "Finalizando análise automática do dossiê…",
    );

    await analysisStep(
      {
        action: "dossier_finalize",
        analysis_id: analysisId,
        dossier_id: dossierId,
      },
      "Finalização do dossiê",
    );

    setAnalysisProgress(100);
    setAnalysisLabel(
      "Análise automática do dossiê concluída.",
    );
  }

  async function uploadOneFile(
    file: File,
    options: {
      category?: string;
      contractId?: string;
      issueDate?: string;
      expiryDate?: string;
      description?: string;
      autoAnalyze?: boolean;
      storageFolder?: string;
    },
  ) {
    let extractedText = "";

    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      setUploadProgress(`Extraindo texto: ${file.name}`);
      extractedText = await extractPdfInBrowser(file);
    }

    const { orgId } = await currentOrg();
    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    const folder =
      options.storageFolder || "library";
    const storagePath =
      `${orgId}/${folder}/${crypto.randomUUID()}-${safeName}`;

    const storage = supabaseBrowser();
    const { error: storageError } =
      await storage.storage
        .from("contract-files")
        .upload(storagePath, file, {
          contentType: file.type || undefined,
          upsert: false,
        });

    if (storageError) throw storageError;

    const response = await fetch("/api/biblioteca/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storage_path: storagePath,
        name: file.name,
        mime_type: file.type,
        file_size: file.size,
        category: options.category || "",
        contract_id: options.contractId || "",
        issue_date: options.issueDate || "",
        expiry_date: options.expiryDate || "",
        description: options.description || "",
        extracted_text: extractedText,
        auto_analyze: options.autoAnalyze !== false,
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(
        payload.error ||
          `Falha no processamento de ${file.name}.`,
      );
    }

    return payload;
  }

  async function extractZipFiles(zipFile: File) {
    setUploadProgress("Abrindo arquivo ZIP");

    const zip = await JSZip.loadAsync(
      await zipFile.arrayBuffer(),
    );

    const entries = Object.values(zip.files).filter(
      (entry) =>
        !entry.dir &&
        supportedZipExtensions.has(
          extensionOf(entry.name),
        ) &&
        !entry.name.startsWith("__MACOSX/"),
    );

    if (!entries.length) {
      throw new Error(
        "O ZIP não contém arquivos compatíveis.",
      );
    }

    const files: File[] = [];

    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      setUploadProgress(
        `Extraindo ${index + 1} de ${entries.length}: ${entry.name}`,
      );

      const blob = await entry.async("blob");
      const cleanName =
        entry.name.split("/").pop() || entry.name;

      files.push(
        new File([blob], cleanName, {
          type: mimeFromName(cleanName),
        }),
      );
    }

    return files;
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = form.get("file") as File | null;

    if (!file?.name) {
      setError("Selecione um arquivo.");
      return;
    }

    const autoAnalyze =
      form.get("auto_analyze") === "on";

    try {
      setLoading(true);
      setError("");
      setMessage("Enviando e indexando documentos…");
      setAnalysisProgress(0);
      setAnalysisLabel("");

      const commonOptions = {
        contractId: String(
          form.get("contract_id") || "",
        ),
        issueDate: String(
          form.get("issue_date") || "",
        ),
        expiryDate: String(
          form.get("expiry_date") || "",
        ),
        description: String(
          form.get("description") || "",
        ),
        autoAnalyze,
      };

      const isZip =
        file.type === "application/zip" ||
        file.type === "application/x-zip-compressed" ||
        file.name.toLowerCase().endsWith(".zip");

      if (isZip) {
        const extractedFiles =
          await extractZipFiles(file);

        const uploaded: any[] = [];

        for (
          let index = 0;
          index < extractedFiles.length;
          index += 1
        ) {
          const internalFile = extractedFiles[index];

          setMessage(
            `Importando arquivo ${index + 1} de ${extractedFiles.length}: ${internalFile.name}`,
          );

          const payload = await uploadOneFile(
            internalFile,
            {
              ...commonOptions,
              category: "",
              autoAnalyze: false,
              storageFolder: "library/zip",
            },
          );

          uploaded.push(payload.document);
        }

        const editalDocuments = uploaded.filter(
          (document) =>
            String(document.category || "")
              .toLowerCase()
              .includes("edital"),
        );

        if (
          autoAnalyze &&
          editalDocuments.length &&
          uploaded.length > 1
        ) {
          setMessage(
            "Criando automaticamente o dossiê do ZIP…",
          );

          const roles = Object.fromEntries(
            uploaded.map((document) => [
              document.id,
              inferDocumentRole(
                document.name,
                document.category,
              ),
            ]),
          );

          const dossierTitle =
            file.name.replace(/\.zip$/i, "") ||
            `Dossiê ${new Date().toLocaleDateString("pt-BR")}`;

          const dossierResponse = await fetch(
            "/api/editais/dossies",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                title: dossierTitle,
                notice_number: "",
                document_ids: uploaded.map(
                  (document) => document.id,
                ),
                document_roles: roles,
              }),
            },
          );

          const dossierPayload =
            await dossierResponse.json();

          if (!dossierResponse.ok) {
            throw new Error(
              dossierPayload.error ||
                "Os documentos foram importados, mas o dossiê não pôde ser criado.",
            );
          }

          setOpen(false);
          await load();

          setMessage(
            `${uploaded.length} documentos importados. Analisando automaticamente o dossiê…`,
          );

          await runAutomaticDossierAnalysis(
            dossierPayload.dossier.id,
            dossierTitle,
          );

          setMessage(
            `ZIP processado: ${uploaded.length} documentos indexados e dossiê analisado automaticamente.`,
          );
        } else if (
          autoAnalyze &&
          editalDocuments.length === 1
        ) {
          setOpen(false);
          await load();

          await runAutomaticSingleAnalysis(
            editalDocuments[0].id,
            editalDocuments[0].name,
          );

          setMessage(
            `ZIP importado com ${uploaded.length} documento(s). O edital foi analisado automaticamente.`,
          );
        } else {
          setOpen(false);
          await load();

          setMessage(
            `ZIP importado: ${uploaded.length} documento(s) indexado(s). ${
              editalDocuments.length
                ? "A análise automática estava desativada."
                : "Nenhum arquivo foi classificado como Edital."
            }`,
          );
        }
      } else {
        setUploadProgress(
          "Enviando ao armazenamento seguro",
        );

        const payload = await uploadOneFile(file, {
          ...commonOptions,
          category: String(
            form.get("category") || "",
          ),
        });

        setOpen(false);
        await load();

        if (
          autoAnalyze &&
          payload.auto_analysis_eligible
        ) {
          setMessage(
            "Documento indexado. Iniciando análise automática do edital…",
          );

          await runAutomaticSingleAnalysis(
            payload.document.id,
            payload.document.name,
          );

          setMessage(
            `Edital indexado e analisado automaticamente. ${payload.chunks || 0} trecho(s) disponibilizado(s).`,
          );
        } else {
          setMessage(
            `Documento processado. ${payload.chunks || 0} trecho(s) disponibilizado(s) ao Copiloto.`,
          );
        }
      }

      setUploadProgress("");
      formElement.reset();
      await load();
    } catch (cause: any) {
      setError(cause.message);
      setMessage("");
      setUploadProgress("");
      setAnalysisLabel("");
    } finally {
      setLoading(false);
    }
  }

  async function openFile(document: LibraryDocument) {
    if (!document.storage_path) return;
    try {
      const url = await getSignedFileUrl(
        "contract-files",
        document.storage_path,
      );
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (cause: any) {
      setError(cause.message);
    }
  }

  async function deleteDocument(document: LibraryDocument) {
    if (!confirm(`Excluir “${document.name}” da biblioteca?`)) return;
    try {
      const s = supabaseBrowser();
      await s.from("document_chunks").delete().eq("document_id", document.id);
      const { error: deleteError } = await s.from("company_documents").delete().eq("id", document.id);
      if (deleteError) throw deleteError;
      if (document.storage_path) await s.storage.from("contract-files").remove([document.storage_path]);
      setSelected(null);
      await load();
    } catch (cause: any) {
      setError(cause.message);
    }
  }

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Biblioteca Inteligente</h1>
          <div className="muted">Documentos da empresa organizados e pesquisáveis pelo Copiloto</div>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>Adicionar documento</button>
      </div>

      {error && <div className="warning">{error}</div>}
      {message && <div className="note">{message}</div>}

      {analysisLabel && (
        <section className="card automatic-analysis-progress">
          <div>
            <span className="eyebrow">ANÁLISE AUTOMÁTICA</span>
            <strong>{analysisLabel}</strong>
          </div>
          <div className="analysis-progress-track">
            <span
              style={{
                width: `${Math.max(
                  3,
                  analysisProgress,
                )}%`,
              }}
            />
          </div>
          <small>{analysisProgress}% concluído</small>
        </section>
      )}

      <div className="grid kpis">
        <div className="card"><div className="muted">Documentos</div><div className="value">{documents.length}</div></div>
        <div className="card"><div className="muted">Categorias</div><div className="value">{categories.length}</div></div>
        <div className="card"><div className="muted">Com texto indexado</div><div className="value">{documents.filter((item) => item.processing_status === "Concluído").length}</div></div>
        <div className="card"><div className="muted">Vencidos ou a vencer</div><div className="value">{alerts.length}</div></div>
      </div>

      {alerts.length > 0 && (
        <section className="card library-alerts">
          <h3>Alertas de validade</h3>
          <div className="library-alert-list">
            {alerts.slice(0, 8).map((item) => (
              <button key={item.id} className="library-alert" onClick={() => setSelected(item)}>
                <strong>{item.name}</strong>
                <span>{item.expiry_date && new Date(`${item.expiry_date}T23:59:59`) < new Date() ? "Vencido" : "Vence em breve"} · {dateBR(item.expiry_date)}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="card data-card">
        <div className="library-toolbar">
          <input className="input" placeholder="Pesquisar nome, resumo, contrato ou categoria…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select className="input" value={category} onChange={(event) => setCategory(event.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((item) => <option key={item} value={item || ""}>{item}</option>)}
          </select>
        </div>

        <div className="library-grid">
          {filtered.map((item) => {
            const contract = contractMap.get(item.contract_id || "");
            return (
              <button className="library-card" key={item.id} onClick={() => setSelected(item)}>
                <div className="library-card-head">
                  <span className="library-icon">{item.category === "Planilha/Orçamento" ? "▦" : "▤"}</span>
                  <span className={`library-status ${item.status === "Vencido" ? "expired" : ""}`}>{item.status || "Válido"}</span>
                </div>
                <strong>{item.name}</strong>
                <span className="chip">{item.category || "Documento geral"}</span>
                <p>{item.summary || "Sem resumo disponível."}</p>
                <div className="file-meta">
                  <span>{contract?.contract_number || "Empresa"}</span>
                  <span>{fileSize(item.file_size)}</span>
                  <span>{dateBR(item.created_at)}</span>
                </div>
              </button>
            );
          })}

          {!filtered.length && <div className="empty">Nenhum documento encontrado.</div>}
        </div>
      </section>

      <Modal open={open} title="Adicionar à Biblioteca Inteligente" onClose={() => !loading && setOpen(false)}>
        <form className="form-grid" onSubmit={upload}>
          <div className="field full">
            <label>Arquivo</label>
            <input
              className="input"
              name="file"
              type="file"
              accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,.zip,image/*"
              required
            />
            <span className="muted">
              PDF, DOCX, Excel, CSV, texto, imagem ou ZIP. Em um ZIP,
              cada arquivo compatível será extraído, indexado e vinculado
              automaticamente ao mesmo dossiê quando houver edital.
            </span>
          </div>

          <div className="field full">
            <label>Descrição ou observação (opcional)</label>
            <textarea
              className="input"
              name="description"
              rows={3}
              maxLength={800}
              placeholder="Ex.: Edital da Prefeitura de Jaraguari para cobertura metálica."
            />
          </div>

          <div className="field">
            <label>Categoria (opcional)</label>
            <select className="input" name="category">
              <option value="">Identificar automaticamente</option>
              <option>Edital</option><option>Contrato</option><option>Termo aditivo</option>
              <option>Atestado/CAT</option><option>ART/RRT</option><option>Certidão</option>
              <option>Medição</option><option>Ofício</option><option>Planilha/Orçamento</option>
              <option>Termo de Referência</option><option>Projeto Básico</option>
              <option>Memorial Descritivo</option><option>Cronograma</option>
              <option>Minuta Contratual</option><option>Declarações/Modelos</option>
              <option>Documento geral</option>
            </select>
          </div>

          <div className="field">
            <label>Vincular ao contrato</label>
            <select className="input" name="contract_id">
              <option value="">Documento geral da empresa</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>{contract.contract_number} — {contract.object}</option>
              ))}
            </select>
          </div>

          <div className="field"><label>Data de emissão</label><input className="input" name="issue_date" type="date" /></div>
          <div className="field"><label>Data de validade</label><input className="input" name="expiry_date" type="date" /></div>

          <div className="field full auto-analysis-option">
            <label className="checkbox-row">
              <input
                name="auto_analyze"
                type="checkbox"
                defaultChecked
              />
              <span>
                <strong>Analisar automaticamente após a indexação</strong>
                <small>
                  Editais serão analisados sem precisar abrir a aba Leitor
                  de Editais. ZIPs com edital e anexos gerarão um dossiê
                  automático.
                </small>
              </span>
            </label>
          </div>

          {loading && uploadProgress && (
            <div className="full upload-progress">
              <span className="upload-progress-dot" />
              <strong>{uploadProgress}</strong>
            </div>
          )}

          <div className="full actions">
            <button className="btn" disabled={loading}>
              {loading ? "Processando…" : "Enviar e indexar"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(selected)} title="Detalhes do documento" onClose={() => setSelected(null)}>
        {selected && (
          <div className="stack">
            <div className="details-grid">
              <div><span>Nome</span><strong>{selected.name}</strong></div>
              <div><span>Categoria</span><strong>{selected.category || "Documento geral"}</strong></div>
              <div><span>Contrato</span><strong>{contractMap.get(selected.contract_id || "")?.contract_number || "Empresa"}</strong></div>
              <div><span>Processamento</span><strong>{selected.processing_status || "—"}</strong></div>
              <div><span>Emissão</span><strong>{dateBR(selected.issue_date)}</strong></div>
              <div><span>Validade</span><strong>{dateBR(selected.expiry_date)}</strong></div>
            </div>
            <div className="card"><h3>Resumo extraído</h3><p className="library-summary">{selected.summary || "Sem resumo disponível."}</p></div>
            <div className="actions">
              <button className="btn" onClick={() => openFile(selected)}>Abrir arquivo</button>
              <button className="btn danger" onClick={() => deleteDocument(selected)}>Excluir</button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
