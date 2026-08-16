# Staging da Ciclera

Este runbook prepara o CP-44 sem escolher provedor nem registrar credenciais. O
checkpoint continua pendente até existir infraestrutura real e os testes serem
executados contra ela.

## Bloqueios atuais

- A API possui somente filesystem local para evidências. Esse adapter é
  deliberadamente rejeitado com `NODE_ENV=production`.
- O rate limiter disponível é por processo e também é rejeitado em produção.
- O envio real de recuperação de senha não possui gateway de produção.
- Não foram fornecidos domínio, banco, object storage, serviço de e-mail,
  observabilidade ou credenciais de staging.

Não remover essas falhas fechadas para viabilizar um deploy. O CP-44 exige
adapters privados e compartilhados, com contrato equivalente às portas atuais.

## Topologia mínima

- Web e API em HTTPS, com origens fixas e separadas.
- PostgreSQL exclusivo de staging, sem reutilizar `ciclera_dev` ou
  `ciclera_test`.
- Object storage privado, separado de produção, sem acesso público ao bucket.
- Rate limiter compartilhado entre réplicas.
- Secrets em cofre/variáveis protegidas da plataforma, nunca em arquivos ou
  argumentos de linha de comando.
- Logs estruturados centralizados e pesquisáveis por `requestId`.

## Variáveis

Na API, configurar todos os campos de `.env.example`, com `NODE_ENV=production`,
URLs HTTPS reais, allowlist CORS exata, secrets novos e credenciais exclusivas.
Substituir os drivers locais somente depois que os respectivos adapters forem
implementados e testados. Na web, definir `NEXT_PUBLIC_APP_URL`,
`NEXT_PUBLIC_API_URL`, contatos públicos e `LEAD_WEBHOOK_URL` privado no ambiente
server-side.

Nunca copiar os valores locais de exemplo. Nunca inserir URL assinada, token,
cookie ou URL de banco no frontend, log ou relatório.

## Ordem de deploy

1. Criar banco, storage, limiter, e-mail e observabilidade separados.
2. Restaurar um backup sanitizado apenas se houver autorização; caso contrário,
   iniciar banco vazio.
3. Executar `npm ci`, `npm run prisma:validate`, `npm run prisma:generate` e
   `npm run build` no artefato imutável da API.
4. Executar `npm run db:migrate:deploy` uma única vez em job exclusivo. Não
   executar migrations no startup concorrente das réplicas.
5. Subir API, validar `/health/live` e `/health/ready`, então liberar tráfego.
6. Gerar a web com as duas origens públicas exatas, publicar e validar CORS e
   cookies no domínio real.
7. Executar o smoke público com `STAGING_API_URL` e `STAGING_WEB_URL` no ambiente:
   `npm run staging:check`.
8. Executar o E2E completo contra staging e validar upload/leitura privada,
   expiração das URLs, refresh, logout e revogação.

O seed local não pode ser executado em staging. A organização fictícia do UAT
deve ser provisionada por um procedimento administrativo controlado, criado
somente após a infraestrutura e os responsáveis estarem definidos.

## Backup e restauração

- Configurar backup automático criptografado no provedor, retenção definida e
  alerta de falha.
- Antes do primeiro UAT, criar um backup e registrar apenas o identificador do
  job, nunca a URL de acesso.
- Restaurar em uma terceira base temporária isolada e executar health check e
  consultas de contagem; um backup não é considerado válido sem restauração.
- Restringir a conta de backup ao mínimo necessário e auditar o acesso.

Para PostgreSQL gerenciado, preferir os mecanismos nativos do provedor. Se o
procedimento autorizado usar `pg_dump`, usar formato custom e arquivo
criptografado; restaurar com `pg_restore` em base vazia isolada. As URLs devem
entrar por ambiente seguro, sem aparecer no histórico do shell.

## Rollback

1. Suspender novas escritas e registrar o horário e o release afetado.
2. Reverter o tráfego para o artefato anterior compatível.
3. Não reverter migration automaticamente. Se houve escrita incompatível,
   restaurar o último backup validado em nova base e trocar a conexão de forma
   controlada.
4. Confirmar readiness, login, uma leitura por tenant e acesso privado a uma
   evidência.
5. Registrar incidente, impacto e `requestId` correlacionáveis, sem payloads
   sensíveis.

## Evidências para concluir o CP-44

- Identificadores dos releases web/API e do job único de migration.
- Resultado do E2E contra staging e do `npm run staging:check`.
- Teste de cookies reais e CORS.
- Teste ponta a ponta de upload e leitura privada.
- Identificador do backup e resultado da restauração isolada.
- Consulta de logs por request ID e procedimento de rollback exercitado.

Após a aprovação dessas evidências, executar
[`PILOT_UAT_RUNBOOK.md`](PILOT_UAT_RUNBOOK.md). O UAT não pode aprovar o CP-44 por
substituição.
