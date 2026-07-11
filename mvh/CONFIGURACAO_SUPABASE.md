# Configuração do Supabase — EngHub

## Projeto configurado

- Project ref: `pdemjgsjhuuaoevhrewm`
- Project URL: `https://pdemjgsjhuuaoevhrewm.supabase.co`
- Publishable key: já adicionada ao `.env.local`

## Etapa obrigatória no painel do Supabase

1. Abra o projeto EngHub.
2. Entre em **SQL Editor**.
3. Crie uma nova consulta.
4. Cole todo o conteúdo do arquivo `supabase_schema.sql`.
5. Clique em **Run**.
6. Confirme que as tabelas foram criadas:
   - organizations
   - profiles
   - organization_members
   - invitations
   - contracts
   - measurements
   - addenda
   - contract_documents
   - schedule_items
   - tasks
   - bids

## Authentication

Em **Authentication → URL Configuration**:

- Site URL local:
  `http://localhost:3000`

Depois de publicar na Vercel, altere para a URL da plataforma, por exemplo:
`https://enghub-platform.vercel.app`

Adicione também as URLs permitidas de redirecionamento:
- `http://localhost:3000/**`
- `https://SEU-ENDERECO-DA-PLATAFORMA.vercel.app/**`

## Storage

O script SQL cria o bucket privado:

`contract-files`

Os arquivos ficam separados por organização e contrato.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra:

`http://localhost:3000`

## Publicar na Vercel

1. Envie esta pasta para um repositório privado no GitHub.
2. Importe o repositório na Vercel.
3. Cadastre as variáveis indicadas em `VARIAVEIS_VERCEL.txt`.
4. A chave `SUPABASE_SERVICE_ROLE_KEY` deve ser copiada diretamente do Supabase para a Vercel.
5. Faça o deploy.

## Segurança

Não publique `.env.local` no GitHub. O arquivo `.gitignore` já impede o envio automático.
Nunca coloque a `service_role` em arquivos do projeto ou no navegador.
