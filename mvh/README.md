# EngHub Platform 1.0

Versão conectada ao Supabase.

## Funciona
- Login e cadastro
- Dashboard
- Contratos
- Medições
- Aditivos
- Documentos com upload privado
- Licitações
- Dados multiusuário via Supabase

## Rodar
```bash
npm install
npm run dev
```

## Publicar
1. Envie para GitHub privado.
2. Importe na Vercel.
3. Cadastre as variáveis:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
4. Configure no Supabase:
   - Authentication > URL Configuration
   - Site URL da Vercel
   - Redirect URL `https://SEU-PROJETO.vercel.app/**`

## Observação
A aplicação usa os nomes técnicos em inglês das tabelas. A interface do Supabase pode exibir rótulos traduzidos.
