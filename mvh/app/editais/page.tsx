
"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { insertRow, listRows, money } from "@/lib/supabase-data";
import { supabaseBrowser } from "@/lib/supabase-browser";

type DocumentRow = {
  id: string;
  name: string;
  category?: string | null;
  summary?: string | null;
  processing_status?: string | null;
  created_at: string;
};

type AnalysisRow = {
  id: string;
  document_id: string;
  status: string;
  executive_summary?: string | null;
  extracted_data?: any;
  recommendation?: string | null;
  risk_level?: string | null;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
  company_documents?: { name?: string | null; category?: string | null } | null;
};

function dateBR(value?: string | null) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function list(values?: string[]) {
  return values?.length ? (
    <ul className="analysis-list">
      {values.map((value, index) => <li key={`${value}-${index}`}>{value}</li>)}
    </ul>
  ) : <div className="empty compact">Não identificado.</div>;
}

export default function BidAnalyzerPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisRow[]>([]);
  const [selectedDocument, setSelectedDocument] = useState("");
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [selectedDossier, setSelectedDossier] = useState("");
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [dossierTitle, setDossierTitle] = useState("");
  const [dossierNotice, setDossierNotice] = useState("");
  const [dossierDocumentIds, setDossierDocumentIds] = useState<string[]>([]);
  const [dossierRoles, setDossierRoles] = useState<Record<string,string>>({});
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [creatingBid, setCreatingBid] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");

  async function load() {
    try {
      setError("");
      const [documentRows, analysisRows] = await Promise.all([
        listRows("company_documents"),
        supabaseBrowser()
          .from("bid_analyses")
          .select("*,company_documents(name,category)")
          .order("created_at", { ascending: false }),
      ]);

      const eligible = (documentRows as DocumentRow[]).filter((document) =>
        /edital|licita|pregão|pregao|concorrência|concorrencia/i.test(
          `${document.category || ""} ${document.name}`,
        ),
      );

      try {
        const dossierResponse = await fetch(
          "/api/editais/dossies",
          { cache: "no-store" },
        );
        const dossierPayload = await dossierResponse.json();

        if (dossierResponse.ok) {
          setDossiers(dossierPayload.dossiers || []);
        } else {
          setDossiers([]);
          console.warn(
            "Dossiês indisponíveis:",
            dossierPayload.error || "Erro ao carregar dossiês.",
          );
        }
      } catch (dossierError) {
        setDossiers([]);
        console.warn(
          "Falha não bloqueante ao carregar dossiês:",
          dossierError,
        );
      }

      setDocuments(eligible);
      setAnalyses((analysisRows.data || []) as AnalysisRow[]);

      if (!selectedDocument && eligible.length) {
        setSelectedDocument(eligible[0].id);
      }

      if (!selectedAnalysis && analysisRows.data?.length) {
        setSelectedAnalysis(analysisRows.data[0] as AnalysisRow);
      }

      setError("");
    } catch (cause: any) {
      setError(cause.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = selectedAnalysis?.extracted_data || null;

  const statistics = useMemo(() => {
    if (!data) return { documents: 0, technical: 0, risks: 0, checklist: 0 };

    const documents =
      (data.credentialing?.length || 0) +
      (data.legal_qualification?.length || 0) +
      (data.fiscal_labor_qualification?.length || 0) +
      (data.economic_financial_qualification?.length || 0) +
      (data.declarations?.length || 0);

    const technical =
      (data.crea_requirements?.length || 0) +
      (data.cat_requirements?.length || 0) +
      (data.technical_certificates?.length || 0) +
      (data.other_technical_requirements?.length || 0);

    return {
      documents,
      technical,
      risks: data.risks?.length || 0,
      checklist: data.checklist?.length || 0,
    };
  }, [data]);

  async function requestAnalysis(payload: Record<string, unknown>) {
    const response = await fetch("/api/editais/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();
    let data: any = {};

    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      throw new Error(raw || "A API devolveu uma resposta inválida.");
    }

    if (!response.ok) {
      throw new Error(data.error || "Falha na análise.");
    }

    return data;
  }

  function wait(milliseconds: number) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  async function requestStep(
    payload: Record<string, unknown>,
    label: string,
  ) {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await requestAnalysis(payload);
      } catch (cause: any) {
        lastError =
          cause instanceof Error
            ? cause
            : new Error(String(cause || "Falha na etapa."));

        if (attempt < 3) {
          setProgressLabel(
            `${label} — nova tentativa ${attempt + 1} de 3…`,
          );
          await wait(1200 * attempt);
        }
      }
    }

    if (lastError) {
      throw new Error(`${label}: ${lastError.message}`);
    }

    throw new Error(`Falha em ${label}.`);
  }

  function toggleDossierDocument(id:string){
    setDossierDocumentIds((current)=>current.includes(id)?current.filter((item)=>item!==id):[...current,id]);
  }
  async function createDossier(){
    const response=await fetch("/api/editais/dossies",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:dossierTitle,notice_number:dossierNotice,document_ids:dossierDocumentIds,document_roles:dossierRoles})});
    const payload=await response.json();
    if(!response.ok) throw new Error(payload.error||"Erro ao criar dossiê.");
    setShowDossierModal(false); setDossierTitle(""); setDossierNotice(""); setDossierDocumentIds([]); setDossierRoles({});
    await load(); setSelectedDossier(payload.dossier.id);
  }
  async function analyzeDossier(){
    if(!selectedDossier){setError("Selecione um dossiê.");return;}
    const labels=["Dados principais","Credenciamento","Habilitação Jurídica","Fiscal e Trabalhista","CREA e CAT","Atestados técnicos","Econômico-Financeira","Declarações e Anexos","Proposta","Garantias, vistoria e prazos","Referências cruzadas e riscos"];
    try{
      setLoading(true);setError("");setProgress(0);setProgressLabel("Preparando análise conjunta…");
      const start=await requestAnalysis({action:"dossier_start",dossier_id:selectedDossier});
      const analysisId=String(start.analysis_id||""); const total=Number(start.total_sections||labels.length); const concurrency=3; let completed=0;
      for(let offset=0;offset<total;offset+=concurrency){
        const indexes=Array.from({length:Math.min(concurrency,total-offset)},(_,i)=>offset+i);
        setProgressLabel(`Auditando ${start.total_documents} documentos: ${indexes.map((i)=>labels[i]).join(" • ")}…`);
        await Promise.all(indexes.map((section_index)=>requestStep({action:"dossier_process_section",analysis_id:analysisId,dossier_id:selectedDossier,section_index},labels[section_index])));
        completed+=indexes.length;setProgress(Math.round(completed/(total+1)*100));
      }
      setProgressLabel("Cruzando edital e anexos…");
      const result=await requestStep({action:"dossier_finalize",analysis_id:analysisId,dossier_id:selectedDossier},"Consolidação do dossiê");
      setProgress(100);setSelectedAnalysis(result.analysis);setMessage(`Dossiê analisado com ${start.total_documents} documentos.`);await load();
    }catch(cause:any){setError(cause.message);setMessage("Os módulos concluídos foram preservados.");}finally{setLoading(false);}
  }

  async function analyze() {
    if (!selectedDocument) {
      setError("Selecione um edital da Biblioteca Inteligente.");
      return;
    }

    const moduleLabels = [
      "Dados principais do edital",
      "Credenciamento",
      "Habilitação Jurídica",
      "Habilitação Fiscal e Trabalhista",
      "CREA, responsáveis técnicos e CAT",
      "Atestados e exigências técnicas",
      "Habilitação Econômico-Financeira",
      "Declarações e Anexos",
      "Proposta, BDI, CPU e encargos sociais",
      "Garantias, vistoria, prazos e execução",
      "Riscos e cláusulas de atenção",
      "Itens eliminatórios",
      "Checklist e referências cruzadas",
    ];

    try {
      setLoading(true);
      setError("");
      setProgress(0);
      setProgressLabel("Preparando análise rápida indexada…");
      setMessage(
        "O edital será lido uma vez. Cada auditor receberá somente os trechos relacionados ao seu tema.",
      );

      const start = await requestAnalysis({
        action: "fast_start",
        document_id: selectedDocument,
      });

      const analysisId = String(start.analysis_id || "");
      const totalSections = Number(
        start.total_sections || moduleLabels.length,
      );

      if (!analysisId || totalSections < 1) {
        throw new Error(
          "Não foi possível iniciar a análise rápida.",
        );
      }

      let completed = 0;
      const concurrency = 3;

      for (
        let offset = 0;
        offset < totalSections;
        offset += concurrency
      ) {
        const indexes = Array.from(
          {
            length: Math.min(
              concurrency,
              totalSections - offset,
            ),
          },
          (_, index) => offset + index,
        );

        setProgressLabel(
          `Auditando em paralelo: ${indexes
            .map((index) => moduleLabels[index])
            .join(" • ")}…`,
        );

        await Promise.all(
          indexes.map((sectionIndex) =>
            requestStep(
              {
                action: "fast_process_section",
                analysis_id: analysisId,
                section_index: sectionIndex,
              },
              moduleLabels[sectionIndex],
            ),
          ),
        );

        completed += indexes.length;
        setProgress(
          Math.round(
            (completed / (totalSections + 1)) * 100,
          ),
        );
      }

      setProgressLabel(
        "Juntando o banco de conhecimento do edital…",
      );

      const result = await requestStep(
        {
          action: "fast_finalize",
          analysis_id: analysisId,
        },
        "Finalização",
      );

      setProgress(100);
      setSelectedAnalysis(result.analysis);
      setProgressLabel("Análise rápida concluída.");
      setMessage(
        `Análise concluída com ${totalSections} auditores especializados, incluindo riscos, eliminatórios e checklist em etapas separadas.`,
      );

      await load();
    } catch (cause: any) {
      setError(cause.message);
      setMessage(
        "Os módulos concluídos foram preservados. Tente novamente para repetir apenas o que falhou.",
      );
      setProgressLabel("");
    } finally {
      setLoading(false);
    }
  }

  async function createBid() {
    if (!data) return;

    try {
      setCreatingBid(true);
      setError("");

      await insertRow("bids", {
        title: data.object || selectedAnalysis?.company_documents?.name || "Licitação analisada",
        agency: data.agency || "",
        session_date: data.session_date || null,
        estimated_value: Number(data.estimated_value || 0),
        status:
          data.participation_recommendation === "Participar"
            ? "Participar"
            : "Em análise",
      });

      setMessage("Licitação cadastrada no módulo Licitações.");
    } catch (cause: any) {
      setError(cause.message);
    } finally {
      setCreatingBid(false);
    }
  }

  function printAnalysis() {
    window.print();
  }

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Leitor Inteligente de Editais</h1>
          <div className="muted">
            Resumo executivo, documentos, qualificação, prazos, riscos e checklist
          </div>
        </div>
        <a className="btn secondary" href="/biblioteca">
          Enviar edital
        </a>
      </div>

      {error && <div className="warning">{error}</div>}
      {message && <div className="note">{message}</div>}

      {loading && (
        <section className="card batch-progress">
          <div className="batch-progress-header">
            <strong>{progressLabel}</strong>
            <span>{progress}%</span>
          </div>
          <div className="batch-progress-track">
            <div
              className="batch-progress-bar"
              style={{ width: `${progress}%` }}
            />
          </div>
          <small>
            Todos os trechos serão processados. Não feche esta página durante a análise.
          </small>
        </section>
      )}

          <section className="dossier-selector card">
            <div className="dossier-selector-header">
              <div><span className="eyebrow">DOSSIÊ DA LICITAÇÃO</span><h3>Analisar edital e anexos juntos</h3><p>Vincule edital, termo de referência, memorial, planilha, cronograma, minuta e demais anexos.</p></div>
              <button className="secondary-button" onClick={()=>setShowDossierModal(true)} disabled={loading}>Criar dossiê</button>
            </div>
            <div className="dossier-actions">
              <select value={selectedDossier} onChange={(event)=>setSelectedDossier(event.target.value)} disabled={loading}>
                <option value="">Selecione um dossiê</option>
                {dossiers.map((dossier)=><option key={dossier.id} value={dossier.id}>{dossier.title} — {dossier.bid_dossier_documents?.length||0} documento(s)</option>)}
              </select>
              <button onClick={analyzeDossier} disabled={loading||!selectedDossier}>Analisar dossiê completo</button>
            </div>
          </section>

      <section className="card bid-analyzer-control">
        <div className="field">
          <label>Edital disponível na Biblioteca</label>
          <select
            className="input"
            value={selectedDocument}
            onChange={(event) => setSelectedDocument(event.target.value)}
          >
            <option value="">Selecione um edital</option>
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.name}
                {document.processing_status
                  ? ` — ${document.processing_status}`
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <button className="btn" disabled={loading || !selectedDocument} onClick={analyze}>
          {loading ? "Análise rápida em andamento…" : "Analisar edital"}
        </button>
      </section>

      <div className="bid-analyzer-layout">
        <aside className="card analysis-history">
          <h3>Análises anteriores</h3>

          <div className="analysis-history-list">
            {analyses.map((analysis) => (
              <button
                key={analysis.id}
                className={`analysis-history-item ${
                  selectedAnalysis?.id === analysis.id ? "active" : ""
                }`}
                onClick={() => setSelectedAnalysis(analysis)}
              >
                <strong>
                  {analysis.company_documents?.name || "Edital analisado"}
                </strong>
                <span>
                  {analysis.status} · {dateBR(analysis.created_at)}
                </span>
                <div className="analysis-history-badges">
                  {analysis.recommendation && (
                    <small>{analysis.recommendation}</small>
                  )}
                  {analysis.risk_level && (
                    <small>Risco {analysis.risk_level}</small>
                  )}
                </div>
              </button>
            ))}

            {!analyses.length && (
              <div className="empty compact">Nenhuma análise realizada.</div>
            )}
          </div>
        </aside>

        <main className="analysis-content">
          {!data ? (
            <section className="card analysis-empty">
              <h2>Selecione e analise um edital</h2>
              <p className="muted">
                O PDF precisa ter sido enviado pela Biblioteca Inteligente e estar
                com o processamento concluído.
              </p>
            </section>
          ) : (
            <>
              <section className="card analysis-hero">
                <div>
                  <span className="eyebrow">Análise preliminar</span>
                  <h2>{data.object || "Objeto não identificado"}</h2>
                  <p>{data.executive_summary}</p>
                </div>

                <div className="analysis-decision">
                  <span>Recomendação</span>
                  <strong className={`decision-${String(data.participation_recommendation)
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")}`}>
                    {data.participation_recommendation}
                  </strong>
                  <small>{data.recommendation_reason}</small>
                </div>
              </section>

              <div className="grid kpis analysis-kpis">
                <div className="card">
                  <div className="muted">Documentos exigidos</div>
                  <div className="value">{statistics.documents}</div>
                </div>
                <div className="card">
                  <div className="muted">Requisitos técnicos</div>
                  <div className="value">{statistics.technical}</div>
                </div>
                <div className="card">
                  <div className="muted">Riscos identificados</div>
                  <div className="value">{statistics.risks}</div>
                </div>
                <div className="card">
                  <div className="muted">Itens do checklist</div>
                  <div className="value">{statistics.checklist}</div>
                </div>
              </div>

              <section className="card analysis-actions no-print">
                <button className="btn" disabled={creatingBid} onClick={createBid}>
                  {creatingBid ? "Cadastrando…" : "Cadastrar em Licitações"}
                </button>
                <button className="btn secondary" onClick={printAnalysis}>
                  Imprimir / Salvar PDF
                </button>
              </section>

              <div className="analysis-info-grid">
                <section className="card">
                  <h3>Dados principais</h3>
                  <dl className="analysis-definition">
                    <div><dt>Órgão</dt><dd>{data.agency || "—"}</dd></div>
                    <div><dt>Edital</dt><dd>{data.notice_number || "—"}</dd></div>
                    <div><dt>Modalidade</dt><dd>{data.modality || "—"}</dd></div>
                    <div><dt>Tipo da licitação</dt><dd>{data.bidding_type || "—"}</dd></div>
                    <div><dt>Formato</dt><dd>{data.dispute_format || "—"}</dd></div>
                    <div><dt>Plataforma</dt><dd>{data.platform || "—"}</dd></div>
                    <div><dt>Processo</dt><dd>{data.process_number || "—"}</dd></div>
                    <div><dt>Regime de execução</dt><dd>{data.execution_regime || "—"}</dd></div>
                    <div><dt>Local da sessão</dt><dd>{data.session_location || "—"}</dd></div>
                    <div><dt>Sessão</dt><dd>{dateBR(data.session_date)}</dd></div>
                    <div><dt>Valor estimado</dt><dd>{data.estimated_value ? money(data.estimated_value) : "—"}</dd></div>
                    <div><dt>Julgamento</dt><dd>{data.judgment_criterion || "—"}</dd></div>
                    <div><dt>Prazo de execução</dt><dd>{data.execution_deadline || "—"}</dd></div>
                    <div><dt>Validade da proposta</dt><dd>{data.proposal_validity || "—"}</dd></div>
                  </dl>
                </section>

                <section className="card">
                  <h3>Pontos de atenção</h3>
                  {list(data.attention_points)}
                </section>
              </div>

              <section className="card complexity-card">
                <div>
                  <span className="eyebrow">COMPLEXIDADE DO EDITAL</span>
                  <h3>{data.complexity?.level || "Não calculada"}</h3>
                  <p>{data.complexity?.explanation || "—"}</p>
                </div>
                <strong>{data.complexity?.score ?? "—"}/100</strong>
              </section>

              <section className="card knockout-section">
                <div className="knockout-header">
                  <div>
                    <span className="eyebrow">CONFERÊNCIA OBRIGATÓRIA</span>
                    <h3>Itens que podem eliminar a empresa</h3>
                  </div>
                  <strong>
                    {(data.mandatory_documents?.length || 0) +
                      (data.mandatory_actions?.length || 0) +
                      (data.disqualification_risks?.length || 0)}
                  </strong>
                </div>

                <div className="knockout-grid">
                  <article>
                    <h4>Documentos obrigatórios</h4>
                    {(data.mandatory_documents || []).map((item: any, index: number) => (
                      <div className="knockout-item" key={`mandatory-document-${index}`}>
                        <strong>{item.item}</strong>
                        <span>{item.consequence}</span>
                        <small>{item.evidence}</small>
                      </div>
                    ))}
                    {!data.mandatory_documents?.length && (
                      <div className="empty compact">Nenhum documento eliminatório identificado automaticamente.</div>
                    )}
                  </article>

                  <article>
                    <h4>Providências obrigatórias</h4>
                    {(data.mandatory_actions || []).map((item: any, index: number) => (
                      <div className="knockout-item" key={`mandatory-action-${index}`}>
                        <strong>{item.item}</strong>
                        <span>{item.deadline}</span>
                        <span>{item.consequence}</span>
                        <small>{item.evidence}</small>
                      </div>
                    ))}
                    {!data.mandatory_actions?.length && (
                      <div className="empty compact">Nenhuma providência eliminatória identificada automaticamente.</div>
                    )}
                  </article>

                  <article>
                    <h4>Riscos de inabilitação/desclassificação</h4>
                    {(data.disqualification_risks || []).map((item: any, index: number) => (
                      <div className="knockout-item danger" key={`risk-elimination-${index}`}>
                        <strong>{item.type}: {item.item}</strong>
                        <span>{item.reason}</span>
                        <small>{item.evidence}</small>
                      </div>
                    ))}
                    {!data.disqualification_risks?.length && (
                      <div className="empty compact">Nenhuma consequência eliminatória expressa identificada.</div>
                    )}
                  </article>
                </div>
              </section>

              <div className="professional-analysis-grid ordered-sections">
                <section className="card professional-wide">
                  <h3>1. Credenciamento</h3>
                  <div className="requirement-table">
                    {(data.credentialing || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`credential-${index}`}>
                        <strong>{item.requirement}</strong>
                        <span><b>Obrigatório:</b> {item.mandatory}</span>
                        <span><b>Etapa/Prazo:</b> {item.deadline_or_stage}</span>
                        <span><b>Consequência:</b> {item.consequence}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>2. Habilitação Jurídica</h3>
                  <div className="requirement-table">
                    {(data.legal_qualification || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`legal-${index}`}>
                        <strong>{item.document}</strong>
                        <span>{item.details}</span>
                        <span><b>Obrigatório:</b> {item.mandatory}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>3. Habilitação Fiscal e Trabalhista</h3>
                  <div className="requirement-table">
                    {(data.fiscal_labor_qualification || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`fiscal-${index}`}>
                        <strong>{item.document}</strong>
                        <span><b>Órgão/abrangência:</b> {item.issuing_body_or_scope}</span>
                        <span><b>Validade/condição:</b> {item.validity_or_condition}</span>
                        <span><b>Obrigatório:</b> {item.mandatory}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>4. Habilitação Técnica — CREA e CAT</h3>
                  <div className="technical-two-columns">
                    <div>
                      <h4>CREA</h4>
                      {(data.crea_requirements || []).map((item: any, index: number) => (
                        <article className="requirement-row" key={`crea-${index}`}>
                          <strong>{item.holder}</strong>
                          <span>{item.professional_or_entity}</span>
                          <span>{item.requirement}</span>
                          <small>{item.source_reference}</small>
                        </article>
                      ))}
                    </div>
                    <div>
                      <h4>CAT</h4>
                      {(data.cat_requirements || []).map((item: any, index: number) => (
                        <article className="requirement-row" key={`cat-${index}`}>
                          <strong>{item.requirement}</strong>
                          <span><b>Titular:</b> {item.holder}</span>
                          <span><b>Vínculo:</b> {item.linkage_requirement}</span>
                          <small>{item.source_reference}</small>
                        </article>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>4.1. Atestados Técnicos Exigidos</h3>
                  <div className="technical-certificate-list">
                    {(data.technical_certificates || []).map((item: any, index: number) => (
                      <article className="technical-certificate-item detailed" key={`certificate-${index}`}>
                        <strong>{item.service || "Serviço não identificado"}</strong>
                        <span><b>Quantidade mínima:</b> {item.minimum_quantity || "Não informada"} {item.unit || ""}</span>
                        <span><b>Percentual:</b> {item.minimum_percentage || "Não informado"}</span>
                        <span><b>Somatório:</b> {item.accepts_sum || "Não identificado"}</span>
                        <span><b>Titular:</b> {item.required_holder || "Não identificado"}</span>
                        <span><b>Público/privado:</b> {item.public_or_private_allowed || "Não identificado"}</span>
                        <span><b>Observações:</b> {item.observations || "—"}</span>
                        <small><b>Referência:</b> {item.source_reference}</small>
                        <blockquote>{item.literal_evidence}</blockquote>
                      </article>
                    ))}
                    {!data.technical_certificates?.length && (
                      <div className="empty compact">Nenhum atestado estruturado.</div>
                    )}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>4.2. Outras Exigências Técnicas</h3>
                  <div className="requirement-table">
                    {(data.other_technical_requirements || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`other-tech-${index}`}>
                        <strong>{item.requirement}</strong>
                        <span>{item.details}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>5. Habilitação Econômico-Financeira</h3>
                  <div className="requirement-table">
                    {(data.economic_financial_qualification || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`economic-${index}`}>
                        <strong>{item.document_or_index}</strong>
                        <span><b>Valor/condição:</b> {item.required_value_or_condition}</span>
                        <span><b>Período/referência:</b> {item.period_or_reference}</span>
                        <span><b>Obrigatório:</b> {item.mandatory}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>6. Declarações e Anexos</h3>
                  <div className="declaration-grid">
                    {(data.declarations || []).map((item: any, index: number) => (
                      <article className="declaration-card" key={`declaration-${index}`}>
                        <span className="annex-badge">{item.annex || "Anexo não identificado"}</span>
                        <strong>{item.name}</strong>
                        <span><b>Obrigatória:</b> {item.mandatory}</span>
                        <span><b>Quando entregar:</b> {item.delivery_stage}</span>
                        <span><b>Modelo no edital:</b> {item.model_provided}</span>
                        <span><b>Consequência:</b> {item.consequence}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>7. Proposta Comercial e de Preços</h3>
                  <div className="proposal-summary-grid">
                    <article><span>Planilha orçamentária</span><strong>{data.budget_spreadsheet || "Não identificado"}</strong></article>
                    <article><span>Cronograma físico-financeiro</span><strong>{data.physical_financial_schedule || "Não identificado"}</strong></article>
                    <article><span>Validade da proposta</span><strong>{data.proposal_validity_detail?.period || data.proposal_validity || "—"}</strong></article>
                    <article><span>BDI exigido</span><strong>{data.bdi_requirement?.required || "Não identificado"}</strong></article>
                    <article><span>Limite de BDI</span><strong>{data.bdi_requirement?.maximum_limit || "Não identificado"}</strong></article>
                    <article><span>Encargos sociais</span><strong>{data.social_charges?.required || "Não identificado"} — {data.social_charges?.regime || "Regime não identificado"}</strong></article>
                    <article><span>Composição unitária</span><strong>{data.unit_cost_compositions?.required || "Não identificado"}</strong></article>
                    <article><span>Escopo da CPU</span><strong>{data.unit_cost_compositions?.scope || "Não identificado"}</strong></article>
                  </div>
                  <div className="requirement-table">
                    {(data.proposal_requirements || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`proposal-${index}`}>
                        <strong>{item.item}</strong>
                        <span><b>Exigido:</b> {item.required}</span>
                        <span><b>Detalhe:</b> {item.scope_or_detail}</span>
                        <span><b>Etapa:</b> {item.delivery_stage}</span>
                        <span><b>Consequência:</b> {item.consequence}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card">
                  <h3>8. Garantias</h3>
                  <div className="requirement-table">
                    {(data.guarantees || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`guarantee-${index}`}>
                        <strong>{item.type}</strong>
                        <span>{item.percentage_or_value}</span>
                        <span>{item.accepted_modalities}</span>
                        <span>{item.deadline}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card">
                  <h3>9. Visita/Vistoria Técnica</h3>
                  <div className="visit-conclusion">
                    <strong>{data.visit_conclusion || "Conclusão da vistoria não calculada."}</strong>
                  </div>
                  <div className="requirement-table">
                    {(data.site_visit || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`visit-${index}`}>
                        <strong>Obrigatória: {item.mandatory}</strong>
                        <span>{item.date_time_location}</span>
                        <span><b>Responsável:</b> {item.responsible_person}</span>
                        <span><b>Documento:</b> {item.required_document}</span>
                        <span><b>Alternativa:</b> {item.alternative_declaration}</span>
                        <span><b>Consequência:</b> {item.consequence}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>10. Execução, Medição e Pagamento</h3>
                  <div className="requirement-table">
                    {(data.execution_measurement_payment || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`execution-${index}`}>
                        <strong>{item.topic}</strong>
                        <span>{item.rule}</span>
                        <span>{item.deadline_or_index}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="card professional-wide">
                  <h3>11. Penalidades</h3>
                  <div className="requirement-table">
                    {(data.penalties || []).map((item: any, index: number) => (
                      <article className="requirement-row" key={`penalty-${index}`}>
                        <strong>{item.penalty}</strong>
                        <span>{item.trigger}</span>
                        <span>{item.percentage_or_duration}</span>
                        <small>{item.source_reference}</small>
                      </article>
                    ))}
                  </div>
                </section>
              </div>

              <section className="card professional-wide cross-document-section">
                <div className="section-header"><div><span className="eyebrow">REFERÊNCIAS CRUZADAS</span><h3>Exigências complementadas em outros documentos</h3></div><strong>{data.cross_document_findings?.length||0} ocorrência(s)</strong></div>
                <div className="cross-document-grid">{(data.cross_document_findings||[]).map((item:any,index:number)=><article className={item.conflict_detected?.toLowerCase()==="sim"?"cross-document-card conflict":"cross-document-card"} key={`cross-${index}`}>
                  <strong>{item.topic}</strong><span><b>Documento-base:</b> {item.base_document}</span><span><b>Complementado por:</b> {item.complementary_document}</span><p>{item.consolidated_requirement}</p><span><b>Divergência:</b> {item.conflict_detected}</span>{item.conflict_description&&<small>{item.conflict_description}</small>}
                  <div className="reference-tags">{(item.source_references||[]).map((ref:string,i:number)=><span key={`${ref}-${i}`}>{ref}</span>)}</div>
                </article>)}</div>
              </section>

              <section className="card professional-wide compliance-matrix">
                <div className="section-header">
                  <div>
                    <span className="eyebrow">MATRIZ DE CONFORMIDADE</span>
                    <h3>Conferência final antes da participação</h3>
                  </div>
                  <strong>{data.compliance_matrix?.length || 0} itens</strong>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Categoria</th><th>Exigência</th><th>Obrigatório</th><th>Status</th><th>Consequência</th><th>Referência</th></tr></thead>
                    <tbody>
                      {(data.compliance_matrix || []).map((item: any, index: number) => (
                        <tr key={`compliance-${index}`}>
                          <td>{item.category}</td><td>{item.item}</td><td>{item.mandatory}</td>
                          <td>{item.status}</td><td>{item.consequence}</td><td>{item.source_reference}</td>
                        </tr>
                      ))}
                      {!data.compliance_matrix?.length && <tr><td colSpan={6} className="empty">Matriz ainda não calculada.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <h3>Prazos e eventos</h3>
                <div className="analysis-table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Evento</th><th>Data</th><th>Detalhe</th><th>Referência</th></tr>
                    </thead>
                    <tbody>
                      {(data.deadlines || []).map((row: any, index: number) => (
                        <tr key={`${row.item}-${index}`}>
                          <td>{row.item}</td>
                          <td>{dateBR(row.date)}</td>
                          <td>{row.detail || "—"}</td>
                          <td>{row.source_reference || "—"}</td>
                        </tr>
                      ))}
                      {!data.deadlines?.length && (
                        <tr><td colSpan={4} className="empty">Nenhum prazo identificado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="card">
                <h3>Matriz de riscos</h3>
                <div className="risk-grid">
                  {(data.risks || []).map((risk: any, index: number) => (
                    <article
                      key={`${risk.item}-${index}`}
                      className={`risk-card risk-${String(risk.level).toLowerCase()
                        .normalize("NFD")
                        .replace(/[\u0300-\u036f]/g, "")}`}
                    >
                      <span>{risk.level}</span>
                      <strong>{risk.item}</strong>
                      <p>{risk.reason}</p>
                    </article>
                  ))}
                  {!data.risks?.length && (
                    <div className="empty compact">Nenhum risco estruturado.</div>
                  )}
                </div>
              </section>

              <section className="card">
                <h3>Possíveis cláusulas restritivas</h3>
                <div className="restrictive-list">
                  {(data.restrictive_clauses || []).map((row: any, index: number) => (
                    <article key={`${row.item}-${index}`}>
                      <strong>{row.item}</strong>
                      <p>{row.explanation}</p>
                    </article>
                  ))}
                  {!data.restrictive_clauses?.length && (
                    <div className="empty compact">
                      Nenhuma cláusula potencialmente restritiva foi destacada.
                    </div>
                  )}
                </div>
              </section>

              <section className="card">
                <h3>Checklist para participação</h3>
                <div className="checklist-grid">
                  {(data.checklist || []).map((row: any, index: number) => (
                    <label key={`${row.item}-${index}`} className="checklist-item">
                      <input type="checkbox" />
                      <span>
                        <strong>{row.item}</strong>
                        <small>{row.category} · Prioridade {row.priority}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="card">
                <h3>Perguntas para esclarecimento</h3>
                {list(data.clarification_questions)}
              </section>

              <div className="analysis-disclaimer">
                Análise preliminar por inteligência artificial. Revise o edital e,
                quando necessário, consulte profissionais técnicos e jurídicos antes
                de tomar decisões ou protocolar documentos.
              </div>
            </>
          )}
        </main>
      </div>
      {showDossierModal && (
        <div className="modal-overlay"><div className="modal dossier-modal">
          <div className="modal-header"><h2>Criar Dossiê da Licitação</h2><button className="icon-button" onClick={()=>setShowDossierModal(false)}>×</button></div>
          <label>Nome do dossiê<input value={dossierTitle} onChange={(e)=>setDossierTitle(e.target.value)} placeholder="Ex.: Concorrência 004/2026" /></label>
          <label>Número do edital/processo<input value={dossierNotice} onChange={(e)=>setDossierNotice(e.target.value)} /></label>
          <h3>Documentos</h3>
          <div className="dossier-document-picker">{documents.map((document)=>{const checked=dossierDocumentIds.includes(document.id);return <article key={document.id} className={checked?"selected":""}>
            <label className="document-check"><input type="checkbox" checked={checked} onChange={()=>toggleDossierDocument(document.id)} /><span><strong>{document.name}</strong><small>{document.category}</small></span></label>
            {checked&&<select value={dossierRoles[document.id]||""} onChange={(e)=>setDossierRoles((current)=>({...current,[document.id]:e.target.value}))}>
              <option value="">Tipo</option><option>Edital</option><option>Termo de Referência</option><option>Projeto Básico</option><option>Memorial Descritivo</option><option>Planilha Orçamentária</option><option>Cronograma</option><option>Minuta Contratual</option><option>Declarações/Modelos</option><option>Outro Anexo</option>
            </select>}
          </article>})}</div>
          <button className="btn" onClick={createDossier}>Salvar dossiê</button>
        </div></div>
      )}
    </AppShell>
  );
}
