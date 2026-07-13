# EngHub 2.0

Versão limpa e corrigida para publicação na Vercel.

## Incluído

- Login e cadastro com Supabase
- Dashboard
- Contratos
- Medições
- Aditivos
- Documentos
- Licitações
- Upload para Supabase Storage
- Middleware de autenticação
- Banco Supabase já criado pelo usuário

## Build

O código passou na verificação do TypeScript e na compilação do Next.js.

## Copiloto com IA

A rota `/copiloto` usa `/api/copiloto`, executada no servidor Next.js, para consultar a OpenAI com contexto dos contratos, licitações e medições da organização autenticada.

Consulte `CONFIGURAR_COPILOTO_IA.md`.
