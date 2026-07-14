
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import AppShell from "@/components/AppShell";

type SourceItem = {
  document: string;
  category?: string | null;
  excerpt: string;
};

type Message = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceItem[] | null;
  created_at?: string;
};

type Conversation = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

const suggestions = [
  "Quanto tenho medido e ainda não recebido?",
  "Quais contas estão vencidas ou próximas do vencimento?",
  "Qual é a próxima licitação cadastrada?",
  "Quais documentos da empresa vencem nos próximos 30 dias?",
  "Resuma a situação financeira e contratual da empresa.",
];

const welcome: Message = {
  role: "assistant",
  content:
    "Sou o Copiloto EngHub. Consulto contratos, licitações, medições, financeiro e documentos da Biblioteca Inteligente.",
};

export default function CopilotoPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([welcome]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");

  async function loadConversations(selectFirst = false) {
    const response = await fetch("/api/copiloto/conversations", {
      cache: "no-store",
    });
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || "Falha ao carregar conversas.");

    const rows = (data.conversations || []) as Conversation[];
    setConversations(rows);

    if (selectFirst && rows.length && !conversationId) {
      await openConversation(rows[0].id);
    }
  }

  async function openConversation(id: string) {
    setLoadingHistory(true);
    setError("");

    try {
      const response = await fetch(
        `/api/copiloto/messages?conversation_id=${encodeURIComponent(id)}`,
        { cache: "no-store" },
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Falha ao abrir conversa.");

      setConversationId(id);
      setMessages(data.messages?.length ? data.messages : [welcome]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro desconhecido.");
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await loadConversations(true);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Erro desconhecido.");
      } finally {
        setLoadingHistory(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function newConversation() {
    setConversationId(null);
    setMessages([welcome]);
    setQuestion("");
    setError("");
  }

  async function deleteConversation(id: string) {
    if (!confirm("Excluir esta conversa?")) return;

    try {
      const response = await fetch(
        `/api/copiloto/conversations?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Falha ao excluir.");

      if (conversationId === id) newConversation();
      await loadConversations(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Erro desconhecido.");
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = question.trim();

    if (!text || loading) return;

    setMessages((current) => [
      ...(current.length === 1 && current[0] === welcome ? [] : current),
      { role: "user", content: text },
    ]);
    setQuestion("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: text,
          conversation_id: conversationId,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Falha ao consultar a IA.");

      setConversationId(data.conversation_id);
      setMessages((current) => [
        ...current,
        data.message || {
          role: "assistant",
          content: data.answer,
          sources: data.sources || [],
        },
      ]);

      await loadConversations(false);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Erro desconhecido.";

      setError(message);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `Não consegui concluir a consulta. Diagnóstico: ${message}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const activeTitle = useMemo(
    () => conversations.find((item) => item.id === conversationId)?.title,
    [conversations, conversationId],
  );

  return (
    <AppShell>
      <div className="topbar">
        <div>
          <h1 className="section-title">Copiloto EngHub</h1>
          <div className="muted">
            IA conectada aos contratos, medições, financeiro e Biblioteca Inteligente
          </div>
        </div>
        <span className="badge">OpenAI + Supabase</span>
      </div>

      <div className="copilot-workspace">
        <aside className="copilot-history">
          <button className="btn copilot-new" type="button" onClick={newConversation}>
            Nova conversa
          </button>

          <div className="copilot-history-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`copilot-history-row ${
                  conversation.id === conversationId ? "active" : ""
                }`}
              >
                <button
                  type="button"
                  className="copilot-history-open"
                  onClick={() => openConversation(conversation.id)}
                >
                  <strong>{conversation.title}</strong>
                  <span>
                    {new Date(conversation.updated_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </button>

                <button
                  type="button"
                  className="copilot-history-delete"
                  title="Excluir conversa"
                  onClick={() => deleteConversation(conversation.id)}
                >
                  ×
                </button>
              </div>
            ))}

            {!conversations.length && !loadingHistory && (
              <div className="empty">Nenhuma conversa salva.</div>
            )}
          </div>
        </aside>

        <section className="copilot-card copilot-persistent-card">
          <div className="copilot-conversation-title">
            <div>
              <strong>{activeTitle || "Nova conversa"}</strong>
              <span className="muted">Histórico salvo automaticamente</span>
            </div>
          </div>

          <div className="copilot-messages">
            {loadingHistory ? (
              <div className="copilot-message assistant">Carregando conversa...</div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={message.id || `${message.role}-${index}`}
                  className={`copilot-message ${message.role}`}
                >
                  <div className="copilot-message-content">{message.content}</div>

                  {message.sources && message.sources.length > 0 && (
                    <div className="copilot-sources">
                      <strong>Fontes consultadas</strong>

                      {message.sources.map((source, sourceIndex) => (
                        <details key={`${source.document}-${sourceIndex}`}>
                          <summary>
                            {source.document}
                            {source.category ? ` · ${source.category}` : ""}
                          </summary>
                          <p>{source.excerpt}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            {loading && (
              <div className="copilot-message assistant">
                Consultando os dados reais da empresa...
              </div>
            )}
          </div>

          <div className="copilot-suggestions">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="chip copilot-chip"
                onClick={() => setQuestion(suggestion)}
              >
                {suggestion}
              </button>
            ))}
          </div>

          {error && <div className="warning">{error}</div>}

          <form className="copilot-form" onSubmit={submit}>
            <textarea
              className="input copilot-textarea"
              value={question}
              maxLength={4000}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Pergunte sobre contratos, pagamentos, medições, licitações ou documentos..."
            />

            <div className="copilot-form-footer">
              <span className="muted">{question.length}/4000</span>
              <button className="btn" disabled={loading || !question.trim()}>
                {loading ? "Consultando..." : "Enviar"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </AppShell>
  );
}
