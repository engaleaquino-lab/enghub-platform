# Correção do deploy Vercel

Esta versão corrige:

- exportação ausente `createSupabaseBrowserClient`;
- tipagem dos cookies no Supabase Server;
- tipagem dos cookies no middleware;
- inconsistência entre os imports antigos e o cliente Supabase atual.

## Substituição no GitHub

Envie os arquivos desta versão para a pasta `mvh` do repositório, substituindo os existentes.
Depois faça um novo deploy na Vercel.

O projeto passou na verificação TypeScript (`npx tsc --noEmit`).
