"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import {
  deleteRow,
  insertRow,
  listRows,
  money,
  updateContractTotals,
  updateRow,
} from "@/lib/supabase-data";

export default function MeasurementsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [measurementRows, contractRows] = await Promise.all([
        listRows("measurements"),
        listRows("contracts"),
      ]);

      setRows(measurementRows);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const contractId = String(form.get("contract_id") || "");

    try {
      await insertRow("measurements", {
        contract_id: contractId,
        number: String(form.get("number") || ""),
        competence: String(form.get("competence") || ""),
        measured_value: Number(form.get("measured_value") || 0),
        invoice_number: String(form.get("invoice_number") || ""),
        received_value: Number(form.get("received_value") || 0),
        status: String(form.get("status") || "Em elaboração"),
      });

      await updateContractTotals(contractId);
      setOpen(false);
      await load();
    } catch (cause: any) {
      setError(cause.message);
    }
  }

  const totalMeasured = rows.reduce(
    (sum, row) => sum + Number(row.measured_value || 0),
    0,
  );

  const totalReceived = rows.reduce(
    (sum, row) => sum + Number(row.received_value || 0),
    0,
  );

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Medições</h1>
          <div className="muted">Acompanhamento consolidado dos contratos</div>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          Nova medição
        </button>
      </div>

      {error && <div className="warning">{error}</div>}

      <div className="grid three">
        <div className="card">
          <div className="muted">Total medido</div>
          <div className="value">{money(totalMeasured)}</div>
        </div>
        <div className="card">
          <div className="muted">Total recebido</div>
          <div className="value">{money(totalReceived)}</div>
        </div>
        <div className="card">
          <div className="muted">A receber</div>
          <div className="value">
            {money(Math.max(0, totalMeasured - totalReceived))}
          </div>
        </div>
      </div>

      <section className="card data-card">
        <table className="table">
          <thead>
            <tr>
              <th>Contrato</th>
              <th>Nº</th>
              <th>Competência</th>
              <th>Medido</th>
              <th>Recebido</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const contract = contractMap.get(row.contract_id);

              return (
                <tr key={row.id}>
                  <td>
                    {contract ? (
                      <Link className="data-link" href={`/contratos/${contract.id}/medicoes`}>
                        {contract.contract_number}
                      </Link>
                    ) : "—"}
                  </td>
                  <td>{row.number || "—"}</td>
                  <td>{row.competence || "—"}</td>
                  <td>{money(row.measured_value)}</td>
                  <td>{money(row.received_value)}</td>
                  <td>{row.status}</td>
                  <td>
                    <div className="actions">
                      {row.status !== "Recebida" && (
                        <button
                          className="btn secondary"
                          onClick={async () => {
                            await updateRow("measurements", row.id, {
                              status: "Recebida",
                              received_value: Number(row.measured_value || 0),
                            });
                            await updateContractTotals(row.contract_id);
                            await load();
                          }}
                        >
                          Marcar recebida
                        </button>
                      )}

                      <button
                        className="btn danger"
                        onClick={async () => {
                          await deleteRow("measurements", row.id);
                          await updateContractTotals(row.contract_id);
                          await load();
                        }}
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {!rows.length && (
              <tr>
                <td colSpan={7} className="empty">
                  Nenhuma medição cadastrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <Modal open={open} title="Nova medição" onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={submit}>
          <div className="field full">
            <label>Contrato</label>
            <select className="input" name="contract_id" required>
              <option value="">Selecione</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.contract_number} — {contract.object}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Número</label>
            <input className="input" name="number" required />
          </div>

          <div className="field">
            <label>Competência</label>
            <input className="input" name="competence" placeholder="07/2026" />
          </div>

          <div className="field">
            <label>Valor medido</label>
            <input className="input" name="measured_value" type="number" step="0.01" required />
          </div>

          <div className="field">
            <label>Valor recebido</label>
            <input className="input" name="received_value" type="number" step="0.01" defaultValue="0" />
          </div>

          <div className="field">
            <label>Nota fiscal</label>
            <input className="input" name="invoice_number" />
          </div>

          <div className="field">
            <label>Status</label>
            <select className="input" name="status">
              <option>Em elaboração</option>
              <option>Protocolada</option>
              <option>Aprovada</option>
              <option>Faturada</option>
              <option>Recebida</option>
              <option>Glosada</option>
            </select>
          </div>

          <div className="full actions">
            <button className="btn">Salvar</button>
          </div>
        </form>
      </Modal>
    </AppShell>
  );
}
