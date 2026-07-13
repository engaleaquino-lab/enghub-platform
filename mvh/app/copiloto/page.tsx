"use client";

import { FormEvent, useState } from "react";
import AppShell from "@/components/AppShell";

type Message = { role: "user" | "assistant"; content: string };

const suggestions = [
  "Quem é você e como pode me ajudar?",
  "Quanto tenho medido e ainda não recebido?",
  "Qual é a próxima licitação cadastrada?",
  "Resuma a situação atual da empresa.",
];

export default function CopilotoPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Sou o Copiloto EngHub. Posso consultar os contratos, licitações e medições cadastrados e ajudar na rotina da empresa.",
    },
  ]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();
    if (!text || loading) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setQuestion("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history: messages }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao consultar a IA.");
      setMessages((current) => [...current, { role: "assistant", content: data.answer }]);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "Erro desconhecido.";
      setError(message);
      setMessages((current) => [...current, {
        role: "assistant",
        content: `Não consegui usar a IA agora. Diagnóstico: ${message}`,
      }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Copiloto EngHub</h1>
          <div className="muted">IA integrada ao banco de dados da empresa</div>
        </div>
        <span className="badge">OpenAI + Supabase</span>
      </div>

      <section className="copilot-card">
        <div className="copilot-messages">
          {messages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`copilot-message ${message.role}`}>
              {message.content}
            </div>
          ))}
          {loading && <div className="copilot-message assistant">Consultando os dados da empresa...</div>}
        </div>

        <div className="copilot-suggestions">
          {suggestions.map((suggestion) => (
            <button key={suggestion} type="button" className="chip copilot-chip" onClick={() => setQuestion(suggestion)}>
              {suggestion}
            </button>
          ))}
        </div>

        {error && <div className="warning">{error}</div>}

        <form className="copilot-form" onSubmit={submit}>
          <textarea
            className="input copilot-textarea"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Pergunte sobre contratos, licitações, medições ou a situação da empresa..."
          />
          <button className="btn" disabled={loading || !question.trim()}>
            {loading ? "Aguarde..." : "Enviar"}
          </button>
        </form>
      </section>
    </AppShell>
  );
}
