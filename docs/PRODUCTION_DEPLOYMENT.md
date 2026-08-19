# Preparação de produção

A topologia aprovada para o primeiro ambiente é:

- Vercel: `ciclera-web`.
- Railway Hobby: `ciclera-api`.
- Supabase Free: PostgreSQL e bucket privado de evidências.
- Upstash Free: Redis compartilhado para rate limiting.
- Resend: e-mail transacional de recuperação de senha.

Este documento não contém credenciais. Secrets devem ser colados diretamente no
painel do Railway e nunca enviados por chat, commit, log ou screenshot.

## Ordem de provisionamento

### 1. Supabase

1. Criar um projeto de produção em região próxima da região escolhida no Railway.
2. Guardar a senha do banco em um gerenciador de senhas.
3. Copiar a conexão pelo pooler de **sessão**, porta `5432`, com TLS, para
   `DATABASE_URL` no Railway.
4. Criar o bucket privado `ciclera-evidencias`.
5. Limitar o bucket a 10 MB e aos MIME types `image/jpeg`, `image/png` e
   `image/webp`.
6. Cadastrar `SUPABASE_URL`, `SUPABASE_SECRET_KEY` e
   `SUPABASE_STORAGE_BUCKET` somente no Railway.

O bucket não pode ser público. A API continua autorizando cada leitura e entrega
os bytes pelo contrato temporário já existente; a chave secreta do Supabase nunca
chega ao navegador.

### 2. Upstash

1. Criar uma base Redis em região próxima da API.
2. Copiar a REST URL e o REST token para as variáveis protegidas do Railway.
3. Definir `RATE_LIMIT_STORAGE_DRIVER=upstash`.

O adapter usa um script Lua atômico por chave. Uma falha do Upstash não libera
silenciosamente endpoints protegidos; a requisição falha em vez de ignorar o
limite.

### 3. Resend

1. Adicionar um subdomínio exclusivo de envio, por exemplo
   `mail.ciclera.com.br`, no painel do Resend.
2. Publicar no provedor DNS exatamente os registros SPF e DKIM fornecidos e
   aguardar o status `verified`.
3. Criar uma API key com permissão apenas de envio.
4. Cadastrar somente no Railway:
   `PASSWORD_RESET_DELIVERY_MODE=resend`, `RESEND_API_KEY` e `EMAIL_FROM`.
5. Usar um remetente pertencente ao domínio verificado, por exemplo
   `Ciclera <nao-responda@mail.ciclera.com.br>`.

A chave do Resend é exclusiva da API e nunca deve ser cadastrada na Vercel. O
modo `onboarding@resend.dev` serve apenas para teste restrito da conta e não
substitui a verificação do domínio de produção.

### 4. Railway

1. Criar um projeto Hobby e conectar o repositório `ciclera-api`, branch `main`.
2. Não adicionar PostgreSQL, Redis ou volume no Railway para esta topologia.
3. Cadastrar as variáveis de `.env.production.example` com valores reais e
   exclusivos. Não cadastrar `PORT`; o Railway fornece essa variável.
4. Confirmar que o arquivo `railway.json` foi detectado.
5. Gerar o domínio HTTPS da API ou configurar `api.ciclera.com.br`.

O deploy executa:

- build: `npm ci && npm run build`;
- pre-deploy único: `npm run db:migrate:deploy`;
- start: `npm run start:prod`;
- health check: `GET /health/ready`.

A API escuta em `0.0.0.0` e respeita um proxy confiável por padrão em produção.
Não aumentar `TRUST_PROXY_HOPS` sem revisar a topologia do Railway.

### 5. Vercel

Depois que a URL final da API existir:

1. Definir `NEXT_PUBLIC_APP_URL` com a URL HTTPS final da web.
2. Definir `NEXT_PUBLIC_API_URL` com a URL HTTPS final da API.
3. Repetir a URL da web em `WEB_URL` e `CORS_ORIGINS` no Railway.
4. Fazer novo deploy da API e somente então novo deploy da web.

`app.ciclera.com.br` e `api.ciclera.com.br` são preferíveis porque permanecem no
mesmo site e permitem `AUTH_COOKIE_SAME_SITE=strict`. Se forem usados os domínios
gerados `vercel.app` e `railway.app`, será necessário
`AUTH_COOKIE_SAME_SITE=none`; navegadores que bloqueiam cookies de terceiros ainda
podem impedir a sessão, portanto essa topologia serve apenas como transição.

## Portas de segurança

Com `NODE_ENV=production`, o bootstrap falha se:

- o storage não for `supabase` ou suas credenciais estiverem ausentes;
- o rate limiter não for `upstash` ou suas credenciais estiverem ausentes;
- `WEB_URL` ou alguma origem CORS não usar HTTPS;
- o modo local de recuperação de senha estiver ativo;
- o modo `resend` estiver ativo sem `RESEND_API_KEY` ou `EMAIL_FROM` válido;
- `SameSite=None` for tentado fora de produção.

O modo `disabled` permanece disponível para desligar globalmente a recuperação
de senha com resposta `503`. No modo `resend`, uma rejeição do provedor invalida
o token recém-criado e não produz sucesso falso nem expõe detalhes ao cliente.

## Validação após o primeiro deploy

1. Confirmar `GET /health/live` e `GET /health/ready` com `200`.
2. Confirmar que `/docs` retorna `404` em produção.
3. Criar o primeiro usuário somente pelo fluxo aprovado depois da configuração
   do e-mail/cadastro público.
4. Validar login, refresh, logout, CORS e cookies em navegador real.
5. Validar upload, confirmação, leitura privada e remoção de uma evidência.
6. Confirmar que nenhuma URL temporária, cookie, token ou secret aparece nos
   logs do Railway.
7. Executar `npm run staging:check` a partir de um ambiente local controlado.

Não execute seed, `prisma db push`, `npm audit fix --force` ou migrations manuais
concorrentes em produção.
