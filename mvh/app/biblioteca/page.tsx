"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import { currentOrg, dateBR, getSignedFileUrl, listRows } from "@/lib/supabase-data";
import { supabaseBrowser } from "@/lib/supabase-browser";

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

export default function LibraryPage() {
  const [documents, setDocuments] = useState<LibraryDocument[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<LibraryDocument | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file") as File | null;
    if (!file?.name) {
      setError("Selecione um arquivo.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("Enviando e processando o documento…");
      let extractedText = "";
      if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
        setMessage("Lendo o PDF no navegador…");
        extractedText = await extractPdfInBrowser(file);
      }

      setMessage("Enviando o arquivo para a biblioteca…");
      const { orgId } = await currentOrg();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${orgId}/library/${crypto.randomUUID()}-${safeName}`;
      const s = supabaseBrowser();
      const { error: storageError } = await s.storage.from("contract-files").upload(storagePath, file, {
        contentType: file.type || undefined,
        upsert: false,
      });
      if (storageError) throw storageError;

      setMessage("Extraindo, classificando e indexando o conteúdo…");
      const response = await fetch("/api/biblioteca/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage_path: storagePath,
          name: file.name,
          mime_type: file.type,
          file_size: file.size,
          category: String(form.get("category") || ""),
          contract_id: String(form.get("contract_id") || ""),
          issue_date: String(form.get("issue_date") || ""),
          expiry_date: String(form.get("expiry_date") || ""),
          extracted_text: extractedText,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Falha no processamento.");
      setMessage(`Documento processado. ${payload.chunks || 0} trecho(s) disponibilizado(s) ao Copiloto.`);
      setOpen(false);
      await load();
    } catch (cause: any) {
      setError(cause.message);
      setMessage("");
    } finally {
      setLoading(false);
    }
  }

  async function openFile(document: LibraryDocument) {
    if (!document.storage_path) return;
    try {
      const url = await getSignedFileUrl(
  "contract-files",
  document.storage_path
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
            <input className="input" name="file" type="file" accept=".pdf,.docx,.xlsx,.xls,.csv,.txt,.md,image/*" required />
            <span className="muted">PDF, DOCX, Excel, CSV, texto ou imagem. O envio é feito diretamente ao armazenamento seguro.</span>
          </div>

          <div className="field">
            <label>Categoria (opcional)</label>
            <select className="input" name="category">
              <option value="">Identificar automaticamente</option>
              <option>Edital</option><option>Contrato</option><option>Termo aditivo</option>
              <option>Atestado/CAT</option><option>ART/RRT</option><option>Certidão</option>
              <option>Medição</option><option>Ofício</option><option>Planilha/Orçamento</option>
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

          <div className="full actions">
            <button className="btn" disabled={loading}>{loading ? "Processando…" : "Enviar e indexar"}</button>
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
