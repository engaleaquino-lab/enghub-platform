"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import Modal from "@/components/Modal";
import {
  dateBR,
  deleteRow,
  insertRow,
  listRows,
  money,
  updateRow,
} from "@/lib/supabase-data";

export default function FinancePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [financeRows, contractRows] = await Promise.all([
        listRows("financial_entries"),
        listRows("contracts"),
      ]);

      setRows(financeRows);
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

  const totals = useMemo(() => {
    const receivable = rows
      .filter((row) => row.type === "Receita")
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)),
        0,
      );

    const payable = rows
      .filter((row) => row.type !== "Receita")
      .reduce(
        (sum, row) =>
          sum + Math.max(0, Number(row.amount || 0) - Number(row.paid_amount || 0)),
        0,
      );

    const received = rows
      .filter((row) => row.type === "Receita")
      .reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);

    const paid = rows
      .filter((row) => row.type !== "Receita")
      .reduce((sum, row) => sum + Number(row.paid_amount || 0), 0);

    return { receivable, payable, received, paid };
  }, [rows]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    try {
      await insertRow("financial_entries", {
        contract_id: String(form.get("contract_id") || "") || null,
        type: String(form.get("type") || "Receita"),
        description: String(form.get("description") || ""),
        category: String(form.get("category") || ""),
        document_number: String(form.get("document_number") || ""),
        due_date: String(form.get("due_date") || "") || null,
        amount: Number(form.get("amount") || 0),
        paid_amount: Number(form.get("paid_amount") || 0),
        status: String(form.get("status") || "Pendente"),
      });

      setOpen(false);
      await load();
    } catch (cause: any) {
      setError(cause.message);
    }
  }

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Financeiro</h1>
          <div className="muted">Contas a pagar e receber por obra</div>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>
          Novo lançamento
        </button>
      </div>

      {error && <div className="warning">{error}</div>}

      <div className="grid kpis">
        <div className="card">
          <div className="muted">A receber</div>
          <div className="value">{money(totals.receivable)}</div>
        </div>
        <div className="card">
          <div className="muted">A pagar</div>
          <div className="value">{money(totals.payable)}</div>
        </div>
        <div className="card">
          <div className="muted">Recebido</div>
          <div className="value">{money(totals.received)}</div>
        </div>
        <div className="card">
          <div className="muted">Resultado realizado</div>
          <div className="value">{money(totals.received - totals.paid)}</div>
        </div>
      </div>

      <section className="card data-card">
        <table className="table">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Contrato</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Pago/Recebido</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const contract = contractMap.get(row.contract_id);

              return (
                <tr key={row.id}>
                  <td>{row.type}</td>
                  <td>{row.description}</td>
                  <td>{contract?.contract_number || "Geral"}</td>
                  <td>{dateBR(row.due_date)}</td>
                  <td>{money(row.amount)}</td>
                  <td>{money(row.paid_amount)}</td>
                  <td>{row.status}</td>
                  <td>
                    <div className="actions">
                      {row.status !== "Pago" && (
                        <button
                          className="btn secondary"
                          onClick={async () => {
                            await updateRow("financial_entries", row.id, {
                              paid_amount: Number(row.amount || 0),
                              status: "Pago",
                              payment_date: new Date().toISOString().slice(0, 10),
                            });
                            await load();
                          }}
                        >
                          Quitar
                        </button>
                      )}
                      <button
                        className="btn danger"
                        onClick={async () => {
                          await deleteRow("financial_entries", row.id);
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
                <td colSpan={8} className="empty">
                  Nenhum lançamento cadastrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <Modal open={open} title="Novo lançamento" onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={submit}>
          <div className="field">
            <label>Tipo</label>
            <select className="input" name="type">
              <option>Receita</option>
              <option>Despesa</option>
              <option>Imposto</option>
              <option>Retenção</option>
            </select>
          </div>

          <div className="field">
            <label>Contrato</label>
            <select className="input" name="contract_id">
              <option value="">Sem vínculo</option>
              {contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.contract_number}
                </option>
              ))}
            </select>
          </div>

          <div className="field full">
            <label>Descrição</label>
            <input className="input" name="description" required />
          </div>

          <div className="field">
            <label>Categoria</label>
            <input className="input" name="category" />
          </div>

          <div className="field">
            <label>Documento/NF</label>
            <input className="input" name="document_number" />
          </div>

          <div className="field">
            <label>Vencimento</label>
            <input className="input" name="due_date" type="date" />
          </div>

          <div className="field">
            <label>Valor</label>
            <input className="input" name="amount" type="number" step="0.01" required />
          </div>

          <div className="field">
            <label>Valor já pago/recebido</label>
            <input className="input" name="paid_amount" type="number" step="0.01" defaultValue="0" />
          </div>

          <div className="field">
            <label>Status</label>
            <select className="input" name="status">
              <option>Pendente</option>
              <option>Parcial</option>
              <option>Pago</option>
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
