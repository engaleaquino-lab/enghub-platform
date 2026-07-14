
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

      setDocuments(eligible);
      setAnalyses((analysisRows.data || []) as AnalysisRow[]);

      if (!selectedDocument && eligible.length) {
        setSelectedDocument(eligible[0].id);
      }

      if (!selectedAnalysis && analysisRows.data?.length) {
        setSelectedAnalysis(analysisRows.data[0] as AnalysisRow);
      }
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
    return {
      documents: data.required_documents?.length || 0,
      technical: data.technical_requirements?.length || 0,
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

    throw lastError || new Error(`Falha em ${label}.`);
  }

  async function analyze() {
    if (!selectedDocument) {
      setError("Selecione um edital da Biblioteca Inteligente.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setProgress(0);
      setProgressLabel("Verificando análise anterior…");
      setMessage(
        "O sistema verificará se existem etapas concluídas antes de iniciar.",
      );

      const resumeResult = await requestAnalysis({
        action: "resume",
        document_id: selectedDocument,
      });

      let analysisId = "";
      let totalBatches = 0;
      let totalMerges = 0;
      let completedBatches = 0;
      let completedMerges = 0;
      let batchStatuses: Array<{
        batch_index: number;
        status: string;
      }> = [];
      let mergeStatuses: Array<{
        merge_index: number;
        status: string;
      }> = [];

      if (resumeResult.resume) {
        analysisId = String(resumeResult.resume.analysis_id || "");
        totalBatches = Number(
          resumeResult.resume.total_batches || 0,
        );
        totalMerges = Number(
          resumeResult.resume.total_merges || 0,
        );
        completedBatches = Number(
          resumeResult.resume.completed_batches || 0,
        );
        completedMerges = Number(
          resumeResult.resume.completed_merges || 0,
        );
        batchStatuses = resumeResult.resume.batch_statuses || [];
        mergeStatuses = resumeResult.resume.merge_statuses || [];

        setMessage(
          `Retomando análise anterior: ${completedBatches} lote(s) e ` +
            `${completedMerges} consolidação(ões) já concluídos.`,
        );
      } else {
        const start = await requestAnalysis({
          action: "start",
          document_id: selectedDocument,
        });

        analysisId = String(start.analysis_id || "");
        totalBatches = Number(start.total_batches || 0);
        totalMerges = Number(start.total_merges || 0);
        batchStatuses = Array.from(
          { length: totalBatches },
          (_, batchIndex) => ({
            batch_index: batchIndex,
            status: "Pendente",
          }),
        );
        mergeStatuses = Array.from(
          { length: totalMerges },
          (_, mergeIndex) => ({
            merge_index: mergeIndex,
            status: "Pendente",
          }),
        );

        setMessage(
          "Nova análise criada. O edital inteiro será processado em etapas.",
        );
      }

      if (
        !analysisId ||
        totalBatches < 1 ||
        totalMerges < 1
      ) {
        throw new Error(
          "Não foi possível preparar ou retomar a análise.",
        );
      }

      const totalSteps = totalBatches + totalMerges + 1;
      let completedSteps = completedBatches + completedMerges;

      setProgress(
        Math.round((completedSteps / totalSteps) * 100),
      );

      for (
        let batchIndex = 0;
        batchIndex < totalBatches;
        batchIndex += 1
      ) {
        const existing = batchStatuses.find(
          (item) => item.batch_index === batchIndex,
        );

        if (existing?.status === "Concluído") {
          continue;
        }

        setProgressLabel(
          `Lendo o edital: lote ${batchIndex + 1} de ${totalBatches}…`,
        );

        await requestStep(
          {
            action: "process_batch",
            analysis_id: analysisId,
            batch_index: batchIndex,
          },
          `Lote ${batchIndex + 1}`,
        );

        completedSteps += 1;
        setProgress(
          Math.round((completedSteps / totalSteps) * 100),
        );
      }

      for (
        let mergeIndex = 0;
        mergeIndex < totalMerges;
        mergeIndex += 1
      ) {
        const existing = mergeStatuses.find(
          (item) => item.merge_index === mergeIndex,
        );

        if (existing?.status === "Concluído") {
          continue;
        }

        setProgressLabel(
          `Organizando resultados: grupo ${mergeIndex + 1} de ${totalMerges}…`,
        );

        await requestStep(
          {
            action: "process_merge",
            analysis_id: analysisId,
            merge_index: mergeIndex,
          },
          `Consolidação ${mergeIndex + 1}`,
        );

        completedSteps += 1;
        setProgress(
          Math.round((completedSteps / totalSteps) * 100),
        );
      }

      setProgressLabel("Montando a análise final do edital…");

      const result = await requestStep(
        {
          action: "consolidate",
          analysis_id: analysisId,
        },
        "Análise final",
      );

      setProgress(100);
      setSelectedAnalysis(result.analysis);
      setProgressLabel("Análise integral concluída.");
      setMessage(
        `Análise concluída com ${totalBatches} lote(s) e ` +
          `${totalMerges} consolidação(ões).`,
      );

      await load();
    } catch (cause: any) {
      setError(cause.message);
      setMessage(
        "As etapas já concluídas foram preservadas. Clique novamente em Analisar edital para continuar.",
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
          {loading ? "Analisando edital inteiro…" : "Analisar edital"}
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

              <div className="analysis-info-grid">
                <section className="card">
                  <h3>Documentos exigidos</h3>
                  {list(data.required_documents)}
                </section>

                <section className="card">
                  <h3>Qualificação técnica</h3>
                  {list(data.technical_requirements)}
                </section>

                <section className="card">
                  <h3>Qualificação econômico-financeira</h3>
                  {list(data.financial_requirements)}
                </section>

                <section className="card">
                  <h3>Garantias</h3>
                  {list(data.guarantees)}
                </section>
              </div>

              <section className="card">
                <h3>Prazos e eventos</h3>
                <div className="analysis-table-wrap">
                  <table className="table">
                    <thead>
                      <tr><th>Evento</th><th>Data</th><th>Detalhe</th></tr>
                    </thead>
                    <tbody>
                      {(data.deadlines || []).map((row: any, index: number) => (
                        <tr key={`${row.item}-${index}`}>
                          <td>{row.item}</td>
                          <td>{dateBR(row.date)}</td>
                          <td>{row.detail || "—"}</td>
                        </tr>
                      ))}
                      {!data.deadlines?.length && (
                        <tr><td colSpan={3} className="empty">Nenhum prazo identificado.</td></tr>
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
    </AppShell>
  );
}
