"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { currentOrg, dateBR } from "@/lib/supabase-data";
import { supabaseBrowser } from "@/lib/supabase-browser";

type ComplianceDocument = {
  id: string;
  document_type: string;
  name: string;
  document_number?: string | null;
  issuing_body?: string | null;
  issue_date?: string | null;
  expiry_date?: string | null;
  notes?: string | null;
  storage_path?: string | null;
  created_at: string;
};

type Professional = {
  id: string;
  name: string;
  profession: string;
  council: string;
  registration_number: string;
  registration_state?: string | null;
  employment_type?: string | null;
  active: boolean;
  created_at: string;
};

type Capability = {
  id: string;
  capability_type: string;
  title: string;
  service: string;
  quantity?: number | null;
  unit?: string | null;
  certificate_number?: string | null;
  issuing_entity?: string | null;
  professional_id?: string | null;
  public_private?: string | null;
  completion_date?: string | null;
  notes?: string | null;
  storage_path?: string | null;
  created_at: string;
  company_technical_professionals?: {
    name?: string | null;
  } | null;
};

type FinancialRecord = {
  id: string;
  reference_year: number;
  balance_date?: string | null;
  share_capital?: number | null;
  net_worth?: number | null;
  current_liquidity?: number | null;
  general_liquidity?: number | null;
  general_solvency?: number | null;
  notes?: string | null;
  created_at: string;
};

type Tab = "documentos" | "equipe" | "acervo" | "financeiro";

const documentTypes = [
  "CNPJ",
  "Contrato Social",
  "Alteração Contratual",
  "Procuração",
  "Receita Federal/PGFN",
  "Fazenda Estadual",
  "Fazenda Municipal",
  "FGTS",
  "CNDT",
  "CREA Pessoa Jurídica",
  "Certidão de Falência",
  "Seguro Garantia",
  "Outro",
];

function expiryStatus(expiry?: string | null) {
  if (!expiry) return { label: "Sem validade", className: "neutral" };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const date = new Date(`${expiry}T12:00:00`);
  const diff = Math.ceil(
    (date.getTime() - today.getTime()) / 86_400_000,
  );

  if (diff < 0) return { label: "Vencido", className: "danger" };
  if (diff <= 30) {
    return {
      label: `Vence em ${diff} dia(s)`,
      className: "warning",
    };
  }

  return { label: "Válido", className: "success" };
}

function moneyBR(value?: number | null) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function IntelligentCompanyPage() {
  const [tab, setTab] = useState<Tab>("documentos");
  const [documents, setDocuments] = useState<ComplianceDocument[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [financial, setFinancial] = useState<FinancialRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState<Tab | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError("");

      const supabase = supabaseBrowser();
      const [
        documentsResult,
        professionalsResult,
        capabilitiesResult,
        financialResult,
      ] = await Promise.all([
        supabase
          .from("company_compliance_documents")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("company_technical_professionals")
          .select("*")
          .order("name"),
        supabase
          .from("company_technical_capabilities")
          .select(
            "*,company_technical_professionals(name)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("company_financial_qualification")
          .select("*")
          .order("reference_year", { ascending: false }),
      ]);

      if (documentsResult.error) throw documentsResult.error;
      if (professionalsResult.error) throw professionalsResult.error;
      if (capabilitiesResult.error) throw capabilitiesResult.error;
      if (financialResult.error) throw financialResult.error;

      setDocuments(documentsResult.data || []);
      setProfessionals(professionalsResult.data || []);
      setCapabilities(capabilitiesResult.data || []);
      setFinancial(financialResult.data || []);
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const summary = useMemo(() => {
    const valid = documents.filter(
      (item) => expiryStatus(item.expiry_date).className === "success",
    ).length;
    const expiring = documents.filter(
      (item) => expiryStatus(item.expiry_date).className === "warning",
    ).length;
    const expired = documents.filter(
      (item) => expiryStatus(item.expiry_date).className === "danger",
    ).length;

    return {
      valid,
      expiring,
      expired,
      professionals: professionals.filter((item) => item.active).length,
      capabilities: capabilities.length,
    };
  }, [documents, professionals, capabilities]);

  async function uploadOptionalFile(
    file: File | null,
    folder: string,
  ) {
    if (!file?.name) return null;

    const { orgId } = await currentOrg();
    const safeName = file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      "_",
    );
    const path =
      `${orgId}/company-registry/${folder}/` +
      `${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabaseBrowser()
      .storage
      .from("contract-files")
      .upload(path, file, {
        contentType: file.type || undefined,
        upsert: false,
      });

    if (uploadError) throw uploadError;
    return path;
  }

  async function saveDocument(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      setSaving(true);
      setError("");

      const { orgId, userId } = await currentOrg();
      const file = form.get("file") as File | null;
      const storagePath = await uploadOptionalFile(
        file,
        "documents",
      );

      const { error: insertError } = await supabaseBrowser()
        .from("company_compliance_documents")
        .insert({
          organization_id: orgId,
          created_by: userId,
          document_type: String(form.get("document_type") || ""),
          name: String(form.get("name") || ""),
          document_number:
            String(form.get("document_number") || "") || null,
          issuing_body:
            String(form.get("issuing_body") || "") || null,
          issue_date:
            String(form.get("issue_date") || "") || null,
          expiry_date:
            String(form.get("expiry_date") || "") || null,
          notes: String(form.get("notes") || "") || null,
          storage_path: storagePath,
        });

      if (insertError) throw insertError;

      setModal(null);
      setMessage("Documento cadastrado.");
      await load();
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveProfessional(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      setSaving(true);
      const { orgId, userId } = await currentOrg();

      const { error: insertError } = await supabaseBrowser()
        .from("company_technical_professionals")
        .insert({
          organization_id: orgId,
          created_by: userId,
          name: String(form.get("name") || ""),
          profession: String(form.get("profession") || ""),
          council: String(form.get("council") || "CREA"),
          registration_number: String(
            form.get("registration_number") || "",
          ),
          registration_state:
            String(form.get("registration_state") || "") || null,
          employment_type:
            String(form.get("employment_type") || "") || null,
          active: true,
        });

      if (insertError) throw insertError;

      setModal(null);
      setMessage("Profissional cadastrado.");
      await load();
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveCapability(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      setSaving(true);
      const { orgId, userId } = await currentOrg();
      const file = form.get("file") as File | null;
      const storagePath = await uploadOptionalFile(
        file,
        "technical-capabilities",
      );

      const quantityText = String(form.get("quantity") || "")
        .replace(/\./g, "")
        .replace(",", ".");

      const { error: insertError } = await supabaseBrowser()
        .from("company_technical_capabilities")
        .insert({
          organization_id: orgId,
          created_by: userId,
          capability_type: String(
            form.get("capability_type") || "Atestado",
          ),
          title: String(form.get("title") || ""),
          service: String(form.get("service") || ""),
          quantity: quantityText
            ? Number(quantityText)
            : null,
          unit: String(form.get("unit") || "") || null,
          certificate_number:
            String(form.get("certificate_number") || "") || null,
          issuing_entity:
            String(form.get("issuing_entity") || "") || null,
          professional_id:
            String(form.get("professional_id") || "") || null,
          public_private:
            String(form.get("public_private") || "") || null,
          completion_date:
            String(form.get("completion_date") || "") || null,
          notes: String(form.get("notes") || "") || null,
          storage_path: storagePath,
        });

      if (insertError) throw insertError;

      setModal(null);
      setMessage("Capacidade técnica cadastrada.");
      await load();
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function saveFinancial(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    const number = (name: string) => {
      const value = String(form.get(name) || "")
        .replace(/\./g, "")
        .replace(",", ".");
      return value ? Number(value) : null;
    };

    try {
      setSaving(true);
      const { orgId, userId } = await currentOrg();

      const { error: insertError } = await supabaseBrowser()
        .from("company_financial_qualification")
        .insert({
          organization_id: orgId,
          created_by: userId,
          reference_year: Number(form.get("reference_year")),
          balance_date:
            String(form.get("balance_date") || "") || null,
          share_capital: number("share_capital"),
          net_worth: number("net_worth"),
          current_liquidity: number("current_liquidity"),
          general_liquidity: number("general_liquidity"),
          general_solvency: number("general_solvency"),
          notes: String(form.get("notes") || "") || null,
        });

      if (insertError) throw insertError;

      setModal(null);
      setMessage("Qualificação financeira cadastrada.");
      await load();
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(table: string, id: string) {
    if (!window.confirm("Deseja excluir este cadastro?")) return;

    const { error: deleteError } = await supabaseBrowser()
      .from(table)
      .delete()
      .eq("id", id);

    if (deleteError) {
      setError(deleteError.message);
      return;
    }

    setMessage("Cadastro excluído.");
    await load();
  }

  async function openStoredFile(storagePath?: string | null) {
    if (!storagePath) return;

    const { data, error: signedError } = await supabaseBrowser()
      .storage
      .from("contract-files")
      .createSignedUrl(storagePath, 600);

    if (signedError) {
      setError(signedError.message);
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">
            Cadastro Inteligente da Empresa
          </h1>
          <div className="muted">
            Base documental e técnica usada para conferir os editais.
          </div>
        </div>
        <button
          className="btn"
          onClick={() => setModal(tab)}
        >
          Novo cadastro
        </button>
      </div>

      {error && <div className="alert">{error}</div>}
      {message && <div className="note">{message}</div>}

      <section className="company-registry-kpis">
        <article className="card">
          <span>Documentos válidos</span>
          <strong>{summary.valid}</strong>
        </article>
        <article className="card">
          <span>Vencendo em 30 dias</span>
          <strong>{summary.expiring}</strong>
        </article>
        <article className="card">
          <span>Documentos vencidos</span>
          <strong>{summary.expired}</strong>
        </article>
        <article className="card">
          <span>Profissionais ativos</span>
          <strong>{summary.professionals}</strong>
        </article>
        <article className="card">
          <span>CATs e atestados</span>
          <strong>{summary.capabilities}</strong>
        </article>
      </section>

      <div className="registry-tabs">
        <button
          className={tab === "documentos" ? "active" : ""}
          onClick={() => setTab("documentos")}
        >
          Documentos e certidões
        </button>
        <button
          className={tab === "equipe" ? "active" : ""}
          onClick={() => setTab("equipe")}
        >
          Equipe técnica
        </button>
        <button
          className={tab === "acervo" ? "active" : ""}
          onClick={() => setTab("acervo")}
        >
          CATs e atestados
        </button>
        <button
          className={tab === "financeiro" ? "active" : ""}
          onClick={() => setTab("financeiro")}
        >
          Econômico-financeira
        </button>
      </div>

      {loading ? (
        <section className="card">Carregando cadastro…</section>
      ) : (
        <>
          {tab === "documentos" && (
            <section className="registry-grid">
              {documents.map((document) => {
                const status = expiryStatus(document.expiry_date);

                return (
                  <article className="card registry-card" key={document.id}>
                    <div className="registry-card-header">
                      <div>
                        <span className="eyebrow">
                          {document.document_type}
                        </span>
                        <h3>{document.name}</h3>
                      </div>
                      <span className={`registry-status ${status.className}`}>
                        {status.label}
                      </span>
                    </div>

                    <dl>
                      <div>
                        <dt>Número</dt>
                        <dd>{document.document_number || "—"}</dd>
                      </div>
                      <div>
                        <dt>Emissor</dt>
                        <dd>{document.issuing_body || "—"}</dd>
                      </div>
                      <div>
                        <dt>Emissão</dt>
                        <dd>{dateBR(document.issue_date)}</dd>
                      </div>
                      <div>
                        <dt>Validade</dt>
                        <dd>{dateBR(document.expiry_date)}</dd>
                      </div>
                    </dl>

                    <div className="registry-actions">
                      {document.storage_path && (
                        <button
                          className="secondary-button"
                          onClick={() =>
                            openStoredFile(document.storage_path)
                          }
                        >
                          Abrir arquivo
                        </button>
                      )}
                      <button
                        className="danger-button"
                        onClick={() =>
                          remove(
                            "company_compliance_documents",
                            document.id,
                          )
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  </article>
                );
              })}

              {!documents.length && (
                <div className="card empty">
                  Cadastre CNPJ, certidões, CREA PJ, contrato social e
                  demais documentos da empresa.
                </div>
              )}
            </section>
          )}

          {tab === "equipe" && (
            <section className="registry-grid">
              {professionals.map((professional) => (
                <article className="card registry-card" key={professional.id}>
                  <div className="registry-card-header">
                    <div>
                      <span className="eyebrow">
                        {professional.profession}
                      </span>
                      <h3>{professional.name}</h3>
                    </div>
                    <span
                      className={`registry-status ${
                        professional.active ? "success" : "neutral"
                      }`}
                    >
                      {professional.active ? "Ativo" : "Inativo"}
                    </span>
                  </div>

                  <dl>
                    <div>
                      <dt>Conselho</dt>
                      <dd>{professional.council}</dd>
                    </div>
                    <div>
                      <dt>Registro</dt>
                      <dd>
                        {professional.registration_number}
                        {professional.registration_state
                          ? `/${professional.registration_state}`
                          : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>Vínculo</dt>
                      <dd>{professional.employment_type || "—"}</dd>
                    </div>
                  </dl>

                  <div className="registry-actions">
                    <button
                      className="danger-button"
                      onClick={() =>
                        remove(
                          "company_technical_professionals",
                          professional.id,
                        )
                      }
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}

              {!professionals.length && (
                <div className="card empty">
                  Cadastre responsáveis técnicos, engenheiros, arquitetos
                  e demais profissionais.
                </div>
              )}
            </section>
          )}

          {tab === "acervo" && (
            <section className="registry-grid">
              {capabilities.map((capability) => (
                <article className="card registry-card" key={capability.id}>
                  <div className="registry-card-header">
                    <div>
                      <span className="eyebrow">
                        {capability.capability_type}
                      </span>
                      <h3>{capability.title}</h3>
                    </div>
                    <span className="registry-status success">
                      {capability.quantity
                        ? `${Number(capability.quantity).toLocaleString(
                            "pt-BR",
                          )} ${capability.unit || ""}`
                        : "Cadastrado"}
                    </span>
                  </div>

                  <p className="registry-service">
                    {capability.service}
                  </p>

                  <dl>
                    <div>
                      <dt>Número</dt>
                      <dd>{capability.certificate_number || "—"}</dd>
                    </div>
                    <div>
                      <dt>Emitente</dt>
                      <dd>{capability.issuing_entity || "—"}</dd>
                    </div>
                    <div>
                      <dt>Responsável</dt>
                      <dd>
                        {capability.company_technical_professionals?.name ||
                          "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Origem</dt>
                      <dd>{capability.public_private || "—"}</dd>
                    </div>
                  </dl>

                  <div className="registry-actions">
                    {capability.storage_path && (
                      <button
                        className="secondary-button"
                        onClick={() =>
                          openStoredFile(capability.storage_path)
                        }
                      >
                        Abrir arquivo
                      </button>
                    )}
                    <button
                      className="danger-button"
                      onClick={() =>
                        remove(
                          "company_technical_capabilities",
                          capability.id,
                        )
                      }
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}

              {!capabilities.length && (
                <div className="card empty">
                  Cadastre cada CAT ou atestado com serviço, quantidade e
                  unidade. Ex.: estrutura metálica — 3.000 kg.
                </div>
              )}
            </section>
          )}

          {tab === "financeiro" && (
            <section className="registry-grid">
              {financial.map((record) => (
                <article className="card registry-card" key={record.id}>
                  <div className="registry-card-header">
                    <div>
                      <span className="eyebrow">
                        EXERCÍCIO
                      </span>
                      <h3>{record.reference_year}</h3>
                    </div>
                    <span className="registry-status success">
                      Balanço cadastrado
                    </span>
                  </div>

                  <dl>
                    <div>
                      <dt>Capital social</dt>
                      <dd>{moneyBR(record.share_capital)}</dd>
                    </div>
                    <div>
                      <dt>Patrimônio líquido</dt>
                      <dd>{moneyBR(record.net_worth)}</dd>
                    </div>
                    <div>
                      <dt>LC</dt>
                      <dd>{record.current_liquidity ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>LG</dt>
                      <dd>{record.general_liquidity ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>SG</dt>
                      <dd>{record.general_solvency ?? "—"}</dd>
                    </div>
                  </dl>

                  <div className="registry-actions">
                    <button
                      className="danger-button"
                      onClick={() =>
                        remove(
                          "company_financial_qualification",
                          record.id,
                        )
                      }
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}

              {!financial.length && (
                <div className="card empty">
                  Cadastre balanço, capital, patrimônio e índices
                  econômico-financeiros.
                </div>
              )}
            </section>
          )}
        </>
      )}

      {modal && (
        <div className="modal-overlay">
          <div className="modal registry-modal">
            <div className="modal-header">
              <h2>
                {modal === "documentos" && "Novo documento"}
                {modal === "equipe" && "Novo profissional"}
                {modal === "acervo" && "Nova CAT ou atestado"}
                {modal === "financeiro" &&
                  "Nova qualificação financeira"}
              </h2>
              <button
                className="icon-button"
                onClick={() => setModal(null)}
              >
                ×
              </button>
            </div>

            {modal === "documentos" && (
              <form className="registry-form" onSubmit={saveDocument}>
                <label>
                  Tipo
                  <select name="document_type" required>
                    {documentTypes.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Nome do documento
                  <input
                    name="name"
                    required
                    placeholder="Ex.: Certidão Negativa de Débitos Trabalhistas"
                  />
                </label>
                <label>
                  Número
                  <input name="document_number" />
                </label>
                <label>
                  Órgão emissor
                  <input name="issuing_body" />
                </label>
                <label>
                  Data de emissão
                  <input name="issue_date" type="date" />
                </label>
                <label>
                  Data de validade
                  <input name="expiry_date" type="date" />
                </label>
                <label className="full">
                  Arquivo
                  <input name="file" type="file" />
                </label>
                <label className="full">
                  Observações
                  <textarea name="notes" rows={3} />
                </label>
                <button disabled={saving}>
                  {saving ? "Salvando…" : "Salvar documento"}
                </button>
              </form>
            )}

            {modal === "equipe" && (
              <form className="registry-form" onSubmit={saveProfessional}>
                <label>
                  Nome
                  <input name="name" required />
                </label>
                <label>
                  Profissão
                  <input
                    name="profession"
                    required
                    placeholder="Ex.: Engenheiro Civil"
                  />
                </label>
                <label>
                  Conselho
                  <input name="council" defaultValue="CREA" required />
                </label>
                <label>
                  Número do registro
                  <input name="registration_number" required />
                </label>
                <label>
                  UF
                  <input name="registration_state" maxLength={2} />
                </label>
                <label>
                  Tipo de vínculo
                  <select name="employment_type">
                    <option value="">Não informado</option>
                    <option>Sócio</option>
                    <option>Empregado</option>
                    <option>Prestador de serviço</option>
                    <option>Contrato de compromisso</option>
                  </select>
                </label>
                <button disabled={saving}>
                  {saving ? "Salvando…" : "Salvar profissional"}
                </button>
              </form>
            )}

            {modal === "acervo" && (
              <form className="registry-form" onSubmit={saveCapability}>
                <label>
                  Tipo
                  <select name="capability_type">
                    <option>Atestado</option>
                    <option>CAT</option>
                    <option>CAT + Atestado</option>
                  </select>
                </label>
                <label>
                  Título
                  <input
                    name="title"
                    required
                    placeholder="Ex.: Estrutura metálica da Escola X"
                  />
                </label>
                <label className="full">
                  Serviço comprovado
                  <input
                    name="service"
                    required
                    placeholder="Ex.: Execução de estrutura metálica"
                  />
                </label>
                <label>
                  Quantidade
                  <input
                    name="quantity"
                    inputMode="decimal"
                    placeholder="3000"
                  />
                </label>
                <label>
                  Unidade
                  <select name="unit">
                    <option value="">Não informada</option>
                    <option>kg</option>
                    <option>t</option>
                    <option>m</option>
                    <option>m²</option>
                    <option>m³</option>
                    <option>un</option>
                    <option>km</option>
                  </select>
                </label>
                <label>
                  Número da CAT/Atestado
                  <input name="certificate_number" />
                </label>
                <label>
                  Órgão/contratante emitente
                  <input name="issuing_entity" />
                </label>
                <label>
                  Responsável técnico
                  <select name="professional_id">
                    <option value="">Não vinculado</option>
                    {professionals.map((professional) => (
                      <option
                        key={professional.id}
                        value={professional.id}
                      >
                        {professional.name} — {professional.profession}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Obra
                  <select name="public_private">
                    <option value="">Não informado</option>
                    <option>Pública</option>
                    <option>Privada</option>
                  </select>
                </label>
                <label>
                  Data de conclusão
                  <input name="completion_date" type="date" />
                </label>
                <label>
                  Arquivo
                  <input name="file" type="file" />
                </label>
                <label className="full">
                  Observações
                  <textarea name="notes" rows={3} />
                </label>
                <button disabled={saving}>
                  {saving ? "Salvando…" : "Salvar capacidade"}
                </button>
              </form>
            )}

            {modal === "financeiro" && (
              <form className="registry-form" onSubmit={saveFinancial}>
                <label>
                  Exercício
                  <input
                    name="reference_year"
                    type="number"
                    min="2000"
                    max="2100"
                    required
                  />
                </label>
                <label>
                  Data do balanço
                  <input name="balance_date" type="date" />
                </label>
                <label>
                  Capital social
                  <input name="share_capital" inputMode="decimal" />
                </label>
                <label>
                  Patrimônio líquido
                  <input name="net_worth" inputMode="decimal" />
                </label>
                <label>
                  Liquidez Corrente
                  <input name="current_liquidity" inputMode="decimal" />
                </label>
                <label>
                  Liquidez Geral
                  <input name="general_liquidity" inputMode="decimal" />
                </label>
                <label>
                  Solvência Geral
                  <input name="general_solvency" inputMode="decimal" />
                </label>
                <label className="full">
                  Observações
                  <textarea name="notes" rows={3} />
                </label>
                <button disabled={saving}>
                  {saving ? "Salvando…" : "Salvar qualificação"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
