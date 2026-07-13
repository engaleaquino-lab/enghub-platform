"use client";

import { useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import { dateBR, listRows, money } from "@/lib/supabase-data";

export default function Dashboard() {
  const [contracts, setContracts] = useState<any[]>([]);
  const [bids, setBids] = useState<any[]>([]);
  const [measurements, setMeasurements] = useState<any[]>([]);
  const [finance, setFinance] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [contractsRows, bidsRows, measurementRows, financeRows] =
          await Promise.all([
            listRows("contracts"),
            listRows("bids"),
            listRows("measurements"),
            listRows("financial_entries"),
          ]);

        setContracts(contractsRows);
        setBids(bidsRows);
        setMeasurements(measurementRows);
        setFinance(financeRows);
      } catch (cause: any) {
        setError(cause.message);
      }
    })();
  }, []);

  const totals = useMemo(() => {
    const contracted = contracts.reduce(
      (sum, row) => sum + Number(row.contract_value || 0),
      0,
    );

    const measured = measurements.reduce(
      (sum, row) => sum + Number(row.measured_value || 0),
      0,
    );

    const received = measurements.reduce(
      (sum, row) => sum + Number(row.received_value || 0),
      0,
    );

    const receivable = finance
      .filter((row) => row.type === "Receita")
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)),
        0,
      );

    const payable = finance
      .filter((row) => row.type !== "Receita")
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)),
        0,
      );

    return { contracted, measured, received, receivable, payable };
  }, [contracts, measurements, finance]);

  const recentMeasurements = measurements.slice(0, 5);
  const upcomingBids = bids
    .filter((row) => row.session_date)
    .sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)))
    .slice(0, 5);

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Dashboard</h1>
          <div className="muted">Visão executiva da operação</div>
        </div>
        <span className="badge">Supabase conectado</span>
      </div>

      {error && <div className="warning">{error}</div>}

      <div className="grid kpis">
        <div className="card">
          <div className="muted">Contratado</div>
          <div className="value">{money(totals.contracted)}</div>
        </div>

        <div className="card">
          <div className="muted">Medido</div>
          <div className="value">{money(totals.measured)}</div>
        </div>

        <div className="card">
          <div className="muted">Recebido</div>
          <div className="value">{money(totals.received)}</div>
        </div>

        <div className="card">
          <div className="muted">Medido a receber</div>
          <div className="value">
            {money(Math.max(0, totals.measured - totals.received))}
          </div>
        </div>
      </div>

      <div className="grid two dashboard-panels">
        <section className="card">
          <h3>Financeiro</h3>
          <div className="metric-list">
            <div>
              <span>A receber</span>
              <strong>{money(totals.receivable)}</strong>
            </div>
            <div>
              <span>A pagar</span>
              <strong>{money(totals.payable)}</strong>
            </div>
            <div>
              <span>Saldo projetado</span>
              <strong className={totals.receivable - totals.payable >= 0 ? "positive" : "negative"}>
                {money(totals.receivable - totals.payable)}
              </strong>
            </div>
          </div>
        </section>

        <section className="card">
          <h3>Operação</h3>
          <div className="metric-list">
            <div><span>Contratos</span><strong>{contracts.length}</strong></div>
            <div><span>Medições</span><strong>{measurements.length}</strong></div>
            <div><span>Licitações</span><strong>{bids.length}</strong></div>
          </div>
        </section>
      </div>

      <div className="grid two dashboard-panels">
        <section className="card">
          <h3>Medições recentes</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Nº</th>
                <th>Competência</th>
                <th>Medido</th>
                <th>Recebido</th>
              </tr>
            </thead>
            <tbody>
              {recentMeasurements.map((row) => (
                <tr key={row.id}>
                  <td>{row.number || "—"}</td>
                  <td>{row.competence || "—"}</td>
                  <td>{money(row.measured_value)}</td>
                  <td>{money(row.received_value)}</td>
                </tr>
              ))}
              {!recentMeasurements.length && (
                <tr><td colSpan={4} className="empty">Nenhuma medição cadastrada.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h3>Próximas licitações</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Objeto</th>
                <th>Órgão</th>
                <th>Sessão</th>
              </tr>
            </thead>
            <tbody>
              {upcomingBids.map((row) => (
                <tr key={row.id}>
                  <td>{row.title}</td>
                  <td>{row.agency || "—"}</td>
                  <td>{dateBR(row.session_date)}</td>
                </tr>
              ))}
              {!upcomingBids.length && (
                <tr><td colSpan={3} className="empty">Nenhuma sessão agendada.</td></tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </AppShell>
  );
}
