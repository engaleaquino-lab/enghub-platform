# Copiloto EngHub — configuração

A integração agora funciona diretamente pelo backend do Next.js. Não depende da Edge Function `enghub-ai`.

## Variáveis no Vercel

Em **Project Settings → Environment Variables**, cadastre:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` com o valor `gpt-5-mini` (opcional)

A variável `OPENAI_API_KEY` é usada somente no servidor e não fica exposta no navegador.

## Publicação

O diretório raiz do projeto no Vercel deve ser `mvh`.

Depois de cadastrar as variáveis, faça um novo deploy e teste em `/copiloto`.
