# Ciclera API

API da Ciclera responsável por autenticação, autorização, isolamento multi-tenant, regras de negócio, persistência, evidências, auditoria e contratos consumidos pelo `ciclera-web`.

Execuções em campo podem ser enviadas para revisão somente após a validação server-side do snapshot do checklist e das evidências obrigatórias confirmadas. O envio é transacional, versionado e bloqueia novas edições enquanto a ordem aguarda revisão.

> **Do chamado ao caixa.**

Antes de implementar ou alterar esta aplicação, leia também:

- [`README.md` da raiz](../README.md): visão do produto, escopo e regras globais.
- [`ciclera-web/README.md`](../ciclera-web/README.md): experiência web e expectativas do consumidor da API.

Em caso de conflito, segurança, isolamento entre organizações, integridade dos dados e regras documentadas no README raiz têm prioridade.

## Status

API em construção para validação do MVP com as primeiras empresas piloto.

O objetivo é sustentar com segurança o fluxo principal da Ciclera, sem antecipar funcionalidades de ERP, integrações, automações ou infraestrutura que ainda não foram validadas.

## Responsabilidades

O `ciclera-api` é responsável por:

- Autenticar usuários e controlar sessões.
- Resolver o usuário e a organização autenticados.
- Autorizar operações conforme perfil e contexto do recurso.
- Garantir isolamento de dados entre organizações.
- Aplicar regras e invariantes do domínio.
- Validar transições da ordem de serviço.
- Persistir dados no PostgreSQL.
- Gerenciar metadados e autorização de evidências privadas.
- Registrar histórico e auditoria de ações críticas.
- Expor contratos HTTP documentados com OpenAPI.
- Oferecer health checks e logs suficientes para diagnóstico.

A API não é responsável por:

- Renderizar interface.
- Confiar em validação feita apenas pelo frontend.
- Emitir NF-e ou NFS-e.
- Implementar financeiro ou estoque completos.
- Processar regras específicas de um segmento sem validação de produto.
- Fornecer offline ou sincronização mobile.
- Expor arquivos privados diretamente sem autorização.

## Stack

### Base obrigatória

- Node.js.
- NestJS.
- TypeScript com `strict: true`.
- PostgreSQL.
- Prisma ORM.
- OpenAPI/Swagger.
- Zod ou validação equivalente para variáveis de ambiente.

### Testes

- Runner já adotado pelo projeto, preferencialmente Vitest ou Jest.
- Supertest ou mecanismo equivalente para testes HTTP.
- PostgreSQL real e isolado para testes de integração.

### Princípios de dependências

- Respeitar as versões já fixadas no `package.json` e lockfile.
- Não atualizar dependências fora do escopo da tarefa.
- Não adicionar Redis, BullMQ, Kafka ou outro broker sem um caso concreto.
- Não adicionar event bus interno apenas para desacoplar chamadas simples.
- Não utilizar duas bibliotecas para a mesma responsabilidade.
- Encapsular SDKs de e-mail, storage e observabilidade atrás de portas próprias.
- Toda nova dependência deve possuir justificativa técnica clara.

## Requisitos locais

- Node.js `22.21.1`, fixado em `.nvmrc` e aceito na faixa `22.x` por `engines`.
- npm `10.9.4`, definido em `packageManager` e aceito na faixa `10.x` por `engines`.
- PostgreSQL `17.10` para o ambiente local, executado pela imagem oficial `postgres:17.10-alpine`.
- Object storage compatível quando o fluxo de evidências estiver habilitado.

Docker pode ser utilizado para dependências locais, mas a aplicação não deve depender de Docker para ser testável ou compilável.

## Instalação

Na pasta `ciclera-api`:

```powershell
npm ci
Copy-Item .env.example .env
docker compose up -d --wait postgres
npm run db:check
npm run db:check:test
npm run db:migrate:dev
npm run db:seed
npm run test:integration
npm run start:dev
```

Os comandos acima devem existir no `package.json` ou ser ajustados neste README para refletir os scripts reais.

Quando mantidas as portas planejadas para desenvolvimento:

```text
API: http://localhost:3333
OpenAPI: http://localhost:3333/docs
Liveness: http://localhost:3333/health/live
Readiness: http://localhost:3333/health/ready
```

O OpenAPI é montado em `/docs` somente com `NODE_ENV=development`. Em `test` e `production`, `/docs` e `/docs-json` não são registrados.

## Fundação HTTP

- Rotas da API utilizam o prefixo global `/api/v1`.
- `/health/live` e `/health/ready` permanecem deliberadamente fora do prefixo.
- A porta padrão é `3333` e pode ser alterada por `PORT`.
- Variáveis de ambiente são validadas e tipadas antes do bootstrap; configuração obrigatória ausente ou inválida interrompe a inicialização sem imprimir seu valor.
- O `ValidationPipe` global remove propriedades sem decorators e rejeita campos inesperados com `422`.
- CORS aceita somente as origens de `CORS_ORIGINS`, permite credenciais e não concede headers CORS a origens recusadas.
- O corpo JSON e URL-encoded possui limite padrão de `100kb`, configurável por `HTTP_BODY_LIMIT`.
- Headers básicos de segurança são aplicados pelo Helmet.
- Toda requisição recebe `x-request-id`; um valor enviado pelo cliente só é preservado após validação de formato e tamanho.
- Logs são JSON estruturado e não registram headers, body ou query string. Chaves sensíveis, URLs do PostgreSQL e URLs assinadas são redigidas.
- O encerramento gracioso fecha o pool usado pelo readiness e os hooks do NestJS.

## PostgreSQL local

O PostgreSQL local pertence à infraestrutura da API e está definido em `compose.yaml`. A porta é publicada somente em `127.0.0.1`, as credenciais ficam no `.env` ignorado pelo Git e os dados persistem no volume nomeado `ciclera-api-postgres-data`.

Por padrão, a porta `5432` do container é publicada como `55432` no host para evitar conflitos com instalações locais. Se `POSTGRES_PORT` for alterada, atualize também `DATABASE_URL` e `TEST_DATABASE_URL` no `.env`.

O container cria dois bancos distintos na primeira inicialização do volume:

- `ciclera_dev`: desenvolvimento local, acessado por `DATABASE_URL`.
- `ciclera_test`: migrations e testes automatizados de integração, acessado exclusivamente por `TEST_DATABASE_URL`.

Antes de iniciar, copie `.env.example` para `.env` e substitua a senha fictícia nas três ocorrências: `POSTGRES_PASSWORD`, `DATABASE_URL` e `TEST_DATABASE_URL`.

Validar a configuração e iniciar somente o PostgreSQL:

```bash
docker compose config
docker compose up -d --wait postgres
docker compose ps
```

Confirmar pela aplicação Node.js que os dois bancos aceitam conexão:

```bash
npm run db:check
npm run db:check:test
```

Parar e iniciar novamente, preservando container e volume:

```bash
docker compose stop postgres
docker compose start postgres
```

Remover o container e a rede, preservando os dados:

```bash
docker compose down
```

Recriar somente a infraestrutura local do banco, apagando os dados de desenvolvimento e teste:

```bash
docker compose down --volumes
docker compose up -d --wait postgres
```

> `docker compose down --volumes` é destrutivo para os dois bancos locais. Não utilize esse comando se houver dados locais que precisem ser preservados.

## Scripts esperados

| Comando | Responsabilidade |
| --- | --- |
| `npm run start:dev` | Iniciar a API com reload em desenvolvimento |
| `npm run build` | Compilar somente `src` e validar o artefato de produção |
| `npm run build:check` | Confirmar `dist/main.js` e rejeitar seed/testes no artefato |
| `npm run start:prod` | Executar `dist/main.js`, o entrypoint convencional de produção |
| `npm run lint` | Executar lint |
| `npm run typecheck` | Validar tipos sem gerar build |
| `npm run db:check` | Validar a conexão Node.js com o banco de desenvolvimento |
| `npm run db:check:test` | Validar a conexão Node.js com o banco de testes separado |
| `npm run db:migrate:dev` | Criar e aplicar migrations no banco local de desenvolvimento |
| `npm run db:migrate:deploy` | Aplicar migrations já versionadas no ambiente selecionado |
| `npm run db:seed` | Criar ou reconciliar o seed demonstrativo no banco local de desenvolvimento |
| `npm run db:seed:test` | Criar ou reconciliar o seed exclusivamente em `TEST_DATABASE_URL` |
| `npm run prisma:generate` | Gerar o Prisma Client a partir do schema versionado |
| `npm run prisma:validate` | Validar o schema Prisma sem alterar o banco |
| `npm test` | Executar testes unitários |
| `npm run test:integration` | Aplicar migrations e executar testes isolados em `TEST_DATABASE_URL` |
| `npm run test:watch` | Executar testes em modo interativo |
| `npm run test:e2e` | Executar os testes HTTP end-to-end da fundação da API |
| `npm run format` | Formatar os arquivos TypeScript |
| `npm run format:check` | Verificar a formatação sem alterar arquivos |

Não documentar scripts inexistentes indefinidamente. Criá-los ou atualizar a tabela quando a configuração real for estabelecida.

O build NestJS usa `src` como `rootDir` explícito. O resultado esperado contém
`dist/main.js` e os módulos importados pela aplicação, sem `dist/prisma`,
`dist/test` ou `dist/src/main.js`. `prisma/seed.ts` não participa do artefato de
produção e continua sendo executado exclusivamente pelos scripts `db:seed` e
`db:seed:test` com `ts-node`. O build de produção desabilita o cache incremental
para que a remoção de `dist` nunca seja seguida por uma emissão parcial baseada
em um `.tsbuildinfo` externo ao diretório de saída.

Para validar o ciclo de produção em um build limpo:

```powershell
if (Test-Path -LiteralPath dist) { Remove-Item -LiteralPath dist -Recurse -Force }
npm run build
npm run start:prod
```

## Variáveis de ambiente

Manter um `.env.example` versionado e uma validação executada antes da aplicação iniciar.

As variáveis da fundação HTTP, da infraestrutura PostgreSQL, do Prisma, da autenticação e da recuperação de senha presentes em `.env.example` estão ativas. Storage e provedor externo de e-mail continuam reservados aos checkpoints correspondentes.

### Aplicação e banco

| Variável | Obrigatória | Finalidade |
| --- | ---: | --- |
| `POSTGRES_USER` | Local | Usuário exclusivamente local criado pelo container |
| `POSTGRES_PASSWORD` | Local | Senha exclusivamente local, definida apenas no `.env` |
| `POSTGRES_DB` | Local | Nome do banco de desenvolvimento |
| `POSTGRES_TEST_DB` | Local | Nome distinto do banco de testes |
| `POSTGRES_PORT` | Local | Porta publicada somente em loopback |
| `NODE_ENV` | Sim | Ambiente de execução |
| `PORT` | Não | Porta HTTP; padrão `3333` |
| `DATABASE_URL` | Sim | Conexão local com o banco de desenvolvimento |
| `TEST_DATABASE_URL` | Em `test` | Conexão com o banco de testes separado e usada pelo readiness durante testes |
| `DIRECT_DATABASE_URL` | Conforme infraestrutura | Conexão direta para migrations quando houver pooler |
| `WEB_URL` | Em produção | URL principal do frontend; padrão local `http://localhost:3000` em desenvolvimento e testes |
| `CORS_ORIGINS` | Em produção | Origens HTTP(S) explícitas, separadas por vírgula; usa `WEB_URL` localmente quando omitida |
| `HTTP_BODY_LIMIT` | Não | Limite dos corpos JSON e URL-encoded; padrão `100kb` |
| `LOG_LEVEL` | Não | `debug`, `info`, `warn` ou `error`; padrão `info` |

### Autenticação

| Variável | Obrigatória | Finalidade |
| --- | ---: | --- |
| `JWT_ACCESS_SECRET` | Sim | Secret com pelo menos 32 caracteres para assinar access tokens HS256 |
| `JWT_ACCESS_ISSUER` | Sim | Emissor exato aceito no access token |
| `JWT_ACCESS_AUDIENCE` | Sim | Audiência exata aceita no access token |
| `ACCESS_TOKEN_TTL` | Sim | Validade do access token em segundos, entre 60 e 3600 |
| `REFRESH_TOKEN_TTL` | Sim | Validade da sessão renovável em segundos, entre uma hora e 90 dias |
| `PASSWORD_RESET_TOKEN_TTL` | Não | Validade do token de redefinição em segundos, entre 5 minutos e 24 horas; padrão `1800` |
| `PASSWORD_RESET_DELIVERY_MODE` | Não | `local` em desenvolvimento/teste ou `disabled`; produção proíbe `local` e usa `disabled` enquanto não houver provedor |

Os cookies são host-only, `HttpOnly` e `SameSite=Strict`. `Secure` é derivado de `NODE_ENV=production`, sem uma variável que possa enfraquecê-lo acidentalmente. O access cookie usa `Path=/`; o refresh cookie usa `Path=/api/v1/auth`.

### Storage

| Variável | Obrigatória | Finalidade |
| --- | ---: | --- |
| `STORAGE_ENDPOINT` | Conforme provedor | Endpoint do object storage |
| `STORAGE_REGION` | Conforme provedor | Região do bucket |
| `STORAGE_BUCKET` | Ao habilitar evidências | Bucket privado |
| `STORAGE_ACCESS_KEY_ID` | Ao habilitar evidências | Credencial de acesso |
| `STORAGE_SECRET_ACCESS_KEY` | Ao habilitar evidências | Credencial secreta |
| `STORAGE_FORCE_PATH_STYLE` | Conforme provedor | Compatibilidade com storage S3-like local |
| `UPLOAD_MAX_FILE_SIZE_BYTES` | Sim | Limite server-side por arquivo |
| `UPLOAD_ALLOWED_MIME_TYPES` | Sim | Tipos MIME aceitos |
| `UPLOAD_MAX_FILES_PER_EXECUTION` | Sim | Quantidade máxima de evidências por execução |
| `EVIDENCE_URL_TTL` | Sim | Validade das capacidades temporárias de upload e leitura |
| `EVIDENCE_STORAGE_ROOT` | Desenvolvimento | Diretório local privado do adapter de desenvolvimento |

### E-mail

| Variável | Obrigatória | Finalidade |
| --- | ---: | --- |
| `EMAIL_PROVIDER_API_KEY` | Ao habilitar e-mails | Credencial do provedor |
| `EMAIL_FROM` | Ao habilitar e-mails | Remetente transacional |
| `EMAIL_REPLY_TO` | Não | Endereço para respostas |

O adapter `local` escreve o link de redefinição somente no terminal da API em
`development`, sem registrar o e-mail em texto aberto. Em `test`, a entrega local
não escreve o token; os testes usam um gateway controlado. Em produção, o modo
local é recusado no bootstrap. Enquanto não houver provedor transacional, o modo
`disabled` faz todas as solicitações falharem com `503`, sem consultar a conta e
sem produzir sucesso falso.

O contrato público de `forgot-password` depende apenas do estado sistêmico do
gateway, nunca da existência ou do status da identidade:

- Com o gateway disponível, usuário ativo, usuário inexistente, usuário inativo e
  organização inativa recebem o mesmo `202`, body, headers e mensagem. Somente a
  identidade ativa produz um token e uma tentativa de entrega. A resposta não
  aguarda decisões sobre a identidade nem a chamada de entrega, reduzindo também
  diferenças observáveis de duração.
- Com o gateway globalmente desabilitado ou indisponível, todos os e-mails recebem
  o mesmo `503 PASSWORD_RESET_UNAVAILABLE` antes da consulta da identidade e
  nenhum token é criado.
- Uma falha específica iniciada durante o envio não altera a resposta pública:
  ela permanece `202`, o token não entregue é invalidado e a API registra apenas
  `auth.password-reset.delivery-failed`, sem e-mail, token ou URL.

Nesse contrato, `202` significa que a solicitação foi aceita, não que o provedor
confirmou a entrega. O processo acompanha as solicitações já iniciadas e aguarda
sua conclusão no graceful shutdown, mas não oferece retry durável após uma queda
abrupta. Um provedor real e seu tratamento operacional de indisponibilidade são
obrigatórios antes do deploy. Retry durável ou outbox ficam reservados para a
evolução de infraestrutura; não existe fila persistente neste checkpoint.

Exemplo seguro implementado até o CP-09:

```env
NODE_ENV=development
PORT=3333
WEB_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3000
HTTP_BODY_LIMIT=100kb
LOG_LEVEL=info

JWT_ACCESS_SECRET=replace-with-at-least-32-characters-local-only
JWT_ACCESS_ISSUER=ciclera-api-local
JWT_ACCESS_AUDIENCE=ciclera-web-local
ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL=2592000
PASSWORD_RESET_TOKEN_TTL=1800
PASSWORD_RESET_DELIVERY_MODE=local

POSTGRES_USER=ciclera_local
POSTGRES_PASSWORD=replace-with-a-local-only-password
POSTGRES_DB=ciclera_dev
POSTGRES_TEST_DB=ciclera_test
POSTGRES_PORT=55432

DATABASE_URL=postgresql://ciclera_local:replace-with-a-local-only-password@localhost:55432/ciclera_dev
TEST_DATABASE_URL=postgresql://ciclera_local:replace-with-a-local-only-password@localhost:55432/ciclera_test
```

Regras:

- Nunca versionar `.env` com credenciais reais.
- Produção deve receber secrets pelo mecanismo seguro da plataforma de deploy.
- A aplicação deve falhar cedo com mensagem clara quando uma variável obrigatória estiver inválida.
- A validação deve converter tipos explicitamente; strings como `"false"` não podem virar boolean `true` por coerção ingênua.
- Não imprimir secrets nos logs durante bootstrap.
- Novas variáveis devem entrar no `.env.example` e neste README na mesma alteração.

## Arquitetura

A API deve utilizar arquitetura modular por domínio funcional. A separação existe para proteger regras de negócio e dependências, não para gerar arquivos cerimoniais.

Estrutura sugerida:

```text
src/
├── main.ts
├── app.module.ts
├── config/
│   ├── env.schema.ts
│   └── configuration.ts
├── common/
│   ├── auth/
│   ├── decorators/
│   ├── errors/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── logging/
│   ├── pagination/
│   └── validation/
├── infrastructure/
│   ├── database/
│   │   └── prisma/
│   ├── email/
│   └── storage/
├── modules/
│   ├── auth/
│   ├── organizations/
│   ├── users/
│   ├── customers/
│   ├── service-locations/
│   ├── equipment/
│   ├── work-orders/
│   ├── scheduling/
│   ├── execution/
│   ├── checklists/
│   ├── evidence/
│   ├── review/
│   ├── billing/
│   ├── audit/
│   └── health/
└── shared/
    ├── domain/
    └── application/

prisma/
├── schema.prisma
├── migrations/
└── seed.ts

test/
├── factories/
├── fixtures/
├── integration/
└── e2e/
```

Não criar todas as pastas antecipadamente. Criar apenas quando houver uma responsabilidade real.

### Estrutura interna de um módulo de domínio crítico

Módulos como `auth`, `work-orders`, `execution`, `review` e `billing` podem utilizar:

```text
work-orders/
├── work-orders.module.ts
├── domain/
│   ├── entities/
│   ├── enums/
│   ├── errors/
│   ├── policies/
│   └── value-objects/
├── application/
│   ├── dto/
│   ├── ports/
│   └── use-cases/
├── infrastructure/
│   └── repositories/
└── presentation/
    ├── controllers/
    ├── http-dto/
    └── presenters/
```

Direção das dependências:

- `domain` não depende de NestJS, Prisma ou SDKs.
- `application` coordena casos de uso e depende de portas, não de detalhes externos.
- `infrastructure` implementa persistência e integrações.
- `presentation` traduz HTTP para casos de uso e respostas.

Módulos CRUD simples podem começar com menos camadas. Não criar entity, mapper, repository, service e use case separados se todos apenas repetirem os mesmos campos sem proteger nenhuma regra. Entretanto, controllers não devem concentrar regra de negócio nem acessar Prisma diretamente.

## Módulos do MVP

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | Login, sessão, refresh, logout e recuperação de senha |
| `organizations` | Dados e configurações da empresa cliente |
| `users` | Usuários, perfis, ativação e desativação |
| `customers` | Clientes atendidos pela organização |
| `service-locations` | Locais vinculados aos clientes |
| `equipment` | Equipamentos instalados nos locais |
| `work-orders` | Ordem, número, status, prioridade e ciclo principal |
| `scheduling` | Agendamento e atribuição ao técnico |
| `execution` | Início, preenchimento e conclusão em campo |
| `checklists` | Templates versionados e respostas |
| `evidence` | Metadados, upload e acesso a arquivos privados |
| `review` | Aprovação e solicitação de correção |
| `billing` | Fila pronta para faturar e marcação como faturada |
| `audit` | Registro de ações críticas |
| `health` | Liveness e readiness da aplicação |

Evitar dependências circulares. Se dois módulos compartilham uma regra, avaliar se ela pertence ao domínio principal ou se a interação deve ocorrer por uma porta explícita.

## Convenções de código

- Código, arquivos, variáveis, funções, classes, tipos e enums em inglês.
- Mensagens retornadas ao usuário em português do Brasil quando forem apropriadas para exibição.
- Classes e tipos em `PascalCase`.
- Funções e variáveis em `camelCase`.
- Constantes globais em `UPPER_SNAKE_CASE`.
- Não utilizar `any`.
- Tratar dados externos como `unknown` até validação.
- Não utilizar non-null assertion para esconder ausência de dado.
- Evitar exceções genéricas sem código de erro de aplicação.
- Preferir dependências injetadas e responsabilidades pequenas.
- Controllers traduzem HTTP; casos de uso executam ações; repositórios persistem.
- Não exportar internals de um módulo sem necessidade.
- Não criar `BaseService`, `BaseRepository` ou CRUD genérico que esconda filtros multi-tenant.
- Comentários devem explicar decisões, invariantes ou limitações.

## Contrato HTTP

### Prefixo e versionamento

- Prefixo planejado: `/api/v1`.
- Health checks podem permanecer fora do prefixo quando exigido pela infraestrutura.
- Mudanças incompatíveis exigem versão nova ou estratégia explícita de transição.

### Formato

- JSON para requests e responses de negócio.
- Datas em ISO 8601 com timezone explícito.
- IDs opacos; o cliente não deve inferir significado pelo ID.
- Valores monetários transportados conforme contrato explícito de centavos.
- Campos desconhecidos devem ser rejeitados em comandos de escrita.

### Resposta de sucesso

Recursos simples podem ser retornados diretamente. Listagens devem possuir metadata consistente:

```json
{
  "data": [],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 0,
    "totalPages": 0
  }
}
```

Não envolver toda resposta em múltiplas camadas sem utilidade. Manter consistência entre endpoints equivalentes.

### Formato de erro

Utilizar uma estrutura única inspirada em Problem Details:

```json
{
  "type": "https://ciclera.com.br/problems/validation-error",
  "title": "Dados inválidos",
  "status": 422,
  "detail": "Revise os campos informados.",
  "code": "VALIDATION_ERROR",
  "fieldErrors": {
    "email": ["Informe um e-mail válido."]
  },
  "requestId": "req_..."
}
```

Regras:

- `code` é estável e adequado para decisões do frontend.
- `detail` pode ser exibido quando seguro.
- Stack trace e detalhes internos nunca chegam ao cliente em produção.
- Erros de domínio devem ser traduzidos por um exception filter central.
- Não retornar `200` com um objeto representando erro.
- Utilizar `401` para autenticação ausente ou inválida.
- Utilizar `403` para ação autenticada sem permissão.
- Utilizar `404` quando o recurso não existir no escopo autorizado.
- Utilizar `409` para conflito de estado ou concorrência.
- Utilizar `422` para regras de entrada semanticamente inválidas.

## Validação de entrada

Configuração global mínima:

- `whitelist: true`.
- Rejeição de campos inesperados em comandos de escrita.
- Transformação explícita e segura de tipos.
- Limites de tamanho para strings e arrays.
- Parsing validado de query params.
- Normalização de e-mail e campos pesquisáveis onde aplicável.

Regras:

- DTO valida formato; caso de uso valida regra de negócio.
- IDs recebidos precisam ser validados antes da consulta.
- Datas precisam possuir contrato inequívoco.
- Strings vazias não devem representar ausência silenciosamente.
- Campos opcionais devem diferenciar ausência, `null` e valor vazio quando relevante.
- Documentos e telefones devem ser normalizados sem assumir que formatação é identidade.
- Não aceitar diretamente objetos Prisma como DTO HTTP.

## Autenticação

O MVP não possui cadastro público livre. Organizações e primeiros usuários devem ser criados por fluxo administrativo controlado, convite ou bootstrap documentado.

### Fluxos mínimos

- Login com e-mail e senha.
- Consulta da sessão atual.
- Renovação de sessão.
- Logout da sessão atual.
- Logout de todas as sessões quando necessário.
- Solicitação de recuperação de senha.
- Redefinição de senha com token de uso único.
- Ativação e desativação de usuário.

### Estratégia de sessão

Direção recomendada para o MVP:

- Access token JWT de curta duração.
- Refresh token opaco, aleatório e de alta entropia.
- Refresh token armazenado somente como hash na tabela de sessões.
- Tokens enviados ao navegador por cookies `HttpOnly`.
- Cookies `Secure` em produção e com `SameSite` adequado à topologia dos domínios.
- Rotação do refresh token a cada renovação.
- Detecção e revogação da família da sessão em caso de reutilização de token rotacionado.
- Sessões revogáveis individualmente.

Não armazenar access ou refresh token em `localStorage` ou `sessionStorage`.

### Senhas

- Utilizar algoritmo de hash de senha moderno e parametrizável, preferencialmente Argon2id.
- Nunca criptografar senha de forma reversível.
- Nunca registrar senha ou hash em logs.
- Aplicar política mínima de tamanho sem regras arbitrárias que reduzam a entropia.
- Comparação deve utilizar a implementação segura da biblioteca.
- Alteração ou redefinição de senha deve revogar sessões anteriores conforme política adotada.

### Recuperação de senha

- Resposta pública não revela se o e-mail existe.
- Token aleatório de uso único.
- Armazenar apenas hash do token.
- Expiração curta e configurável.
- Invalidar tokens anteriores quando um novo for emitido.
- Marcar token como utilizado dentro da mesma transação da mudança de senha.
- URL de redefinição deve apontar para o frontend permitido.

### Proteções

- Rate limiting por IP e identificador normalizado nos endpoints sensíveis.
- Atraso ou proteção equivalente contra enumeração e brute force.
- CORS restrito.
- Proteção CSRF quando a autenticação baseada em cookies exigir.
- Redirecionamentos permitidos somente para origens confiáveis.
- Cookies limpos no logout mesmo quando a sessão já estiver inválida.

## Principal autenticado

Após autenticação, a aplicação deve trabalhar com um contexto tipado equivalente a:

```ts
type AuthenticatedPrincipal = {
  userId: string;
  organizationId: string;
  role: 'OWNER' | 'ADMIN' | 'TECHNICIAN';
  sessionId: string;
};
```

Esse contexto deve ser produzido por código confiável após validação da sessão.

- `organizationId` não vem do body.
- `role` não vem de headers livres enviados pelo cliente.
- Controllers recebem o principal por decorator ou mecanismo centralizado.
- Casos de uso recebem explicitamente o ator e o escopo necessários.
- Jobs futuros devem carregar um contexto equivalente de forma verificável.

### Autenticação e autorização implementadas

O `AuthModule` disponibiliza login, sessão revogável e a fundação transversal
de autorização:

- `AuthenticatedPrincipal` contém apenas `userId`, `organizationId`, `role` e
  `sessionId` obtidos de fontes confiáveis.
- `AuthenticationGuard` depende de portas para resolver uma sessão válida e
  consultar novamente o usuário dentro da organização da sessão.
- Os guards de autenticação e perfis são globais e fail-closed; rotas públicas
  precisam do decorator explícito `Public`, limitado aos health checks, login,
  refresh, logout idempotente, recuperação de senha e código exclusivo de testes.
- Usuário inexistente ou inativo e organização inativa recebem o mesmo erro
  genérico `401`, sem revelar identidade, tenant ou status da conta.
- `CurrentPrincipal` entrega o principal tipado aos controllers protegidos.
- `RolesGuard` e `Roles` aplicam `OWNER`, `ADMIN` e `TECHNICIAN` sem consultar
  headers livres de perfil ou organização.
- O repositório Prisma de identidade exige `{ organizationId, userId }`, usa a
  chave composta e seleciona somente os campos necessários à autorização.
- Recursos ausentes dentro do tenant autorizado permanecem `404`; falta de
  autenticação é `401` e falta de permissão de perfil é `403`, todos no formato
  centralizado de erro.

O resolver de sessão aceita somente o access cookie assinado, verifica HS256,
emissor, audiência e expiração, e exige que a sessão persistida continue ativa.
Depois disso, o guard consulta novamente usuário e organização pelo par
`{ organizationId, userId }`. `Authorization`, perfil e organização enviados em
headers livres não autenticam uma requisição.

Senhas são verificadas por um port com adapter Argon2id. E-mail inexistente
executa uma verificação Argon2 dummy e recebe a mesma resposta genérica de senha,
usuário, organização ou sessão inválidos. Refresh tokens são opacos, gerados com
CSPRNG e persistidos somente como SHA-256. Cada refresh revoga o registro anterior
e cria outro na mesma família dentro de uma transação; reutilizar um token
rotacionado revoga a família inteira.

Login, refresh e recuperação de senha possuem limites em memória por IP e por identificador normalizado
armazenado no limitador somente como digest. Essa estratégia atende ao processo
local de instância única; uma implantação com múltiplas réplicas precisará de um
storage compartilhado para manter o limite global.

Como os tokens são cookies, todos os `POST` de autenticação exigem `Origin`
presente na allowlist, além de CORS com credenciais e `SameSite=Strict`. Clientes
não-browser devem enviar explicitamente uma origem permitida.

A recuperação cria tokens opacos de 32 bytes por CSPRNG e persiste somente o
SHA-256. Uma nova solicitação invalida tokens anteriores do mesmo usuário. A
redefinição consome o token, atualiza o hash Argon2id, invalida os demais tokens e
revoga todas as sessões do usuário dentro do tenant em uma única transação. Tokens
inválidos, expirados, substituídos ou já utilizados recebem o mesmo erro público.

## Autorização e RBAC

| Operação | `OWNER` | `ADMIN` | `TECHNICIAN` |
| --- | :---: | :---: | :---: |
| Gerenciar organização | Sim | Limitado | Não |
| Gerenciar usuários | Sim | Sim, conforme política | Não |
| Cadastrar clientes e equipamentos | Sim | Sim | Não |
| Criar e agendar ordens | Sim | Sim | Não |
| Visualizar todas as ordens da organização | Sim | Sim | Não |
| Visualizar ordens próprias atribuídas | Sim | Sim | Sim |
| Executar atendimento | Conforme necessidade | Conforme necessidade | Sim, se atribuído |
| Revisar execução | Sim | Sim | Não |
| Liberar para faturamento | Sim | Sim | Não |
| Marcar como faturada | Sim | Sim | Não |

RBAC não é suficiente sozinho. Além do perfil, toda operação deve verificar o relacionamento com o recurso.

Política de equipe implementada: `OWNER` pode gerenciar qualquer perfil;
`ADMIN` pode listar a equipe, mas só pode criar, consultar individualmente,
editar, ativar ou desativar usuários `TECHNICIAN`; `TECHNICIAN` não acessa a
gestão de usuários. A organização vem exclusivamente do principal autenticado.
O último `OWNER` ativo não pode ser desativado nem rebaixado.

Exemplos:

- Um `TECHNICIAN` só acessa uma ordem atribuída a ele e pertencente à sua organização.
- Um `ADMIN` não acessa dados de outra organização, mesmo conhecendo o ID.
- Um usuário inativo não pode renovar a sessão.
- Um técnico não aprova sua própria execução.

Guards podem validar autenticação e permissões gerais. Regras dependentes do recurso devem ser validadas no caso de uso, após buscar o recurso dentro da organização correta.

## Multi-tenancy

A organização é a fronteira de isolamento dos dados.

### Regras obrigatórias

- Toda entidade de negócio possui `organizationId` ou pertence a uma árvore cuja organização é verificada na mesma consulta ou transação.
- Toda query de recurso operacional inclui o escopo da organização autenticada.
- Buscar somente por `id` e validar depois é proibido quando a consulta puder incluir o tenant.
- `organizationId` recebido do cliente não substitui o principal autenticado.
- Repositórios devem exigir `organizationId` nos métodos de domínio multi-tenant.
- Constraints e índices devem incluir `organizationId` quando a unicidade ou busca for por organização.
- Relações entre entidades devem impedir associação acidental entre tenants.
- Storage keys e metadados também incluem a organização.
- Exports, jobs, logs de auditoria e processos administrativos respeitam o mesmo isolamento.

Exemplo de assinatura segura:

```ts
findWorkOrderById(input: {
  organizationId: string;
  workOrderId: string;
}): Promise<WorkOrder | null>;
```

Evitar:

```ts
findWorkOrderById(workOrderId: string): Promise<WorkOrder | null>;
```

### Estratégia de persistência

O MVP utiliza banco compartilhado com schema compartilhado e `organizationId` nas entidades de negócio.

Não adicionar schema por tenant ou banco por tenant nesta fase. A estratégia atual simplifica operação e custo, mas exige filtros, constraints, revisão e testes rigorosos.

### Prisma

- Não confiar em um middleware global opaco como única proteção.
- Tornar o escopo da organização visível nos repositórios.
- Evitar expor `PrismaService` diretamente a controllers.
- Revisar queries compostas, includes e relações para garantir que não atravessem organizações.
- Para criação de relações, conectar recursos somente após validá-los no mesmo tenant.
- Testar explicitamente IDs válidos pertencentes a outra organização.

## Modelo de dados conceitual

O schema final deve ser implementado com migrations versionadas. Os nomes abaixo representam o domínio esperado, não uma obrigação de copiar cada campo sem análise.

### `Organization`

- Identidade da empresa cliente.
- Nome, documento e timezone.
- Status ativo ou inativo.
- Configurações operacionais mínimas.
- Timestamps.

### `User`

- Organização.
- Nome e e-mail normalizado.
- Hash da senha.
- Perfil.
- Status ativo.
- Timestamps de criação, atualização e último acesso quando necessário.

Constraint esperada:

```text
UNIQUE (organization_id, normalized_email)
```

Se o login precisar localizar o usuário somente pelo e-mail, a regra de unicidade global ou o mecanismo de seleção de organização deve ser definido explicitamente. Não assumir simultaneamente e-mail global e e-mail por tenant.

Para o MVP, preferir e-mail globalmente único se isso simplificar login e refletir a validação com clientes. Alterar essa decisão exige migration e atualização do fluxo de autenticação.

### `Session`

- Usuário e organização.
- Hash do refresh token.
- Família ou identificador de rotação.
- Expiração, revogação e último uso.
- Metadados mínimos de segurança, evitando coleta excessiva.

### `PasswordResetToken`

- Usuário.
- Hash do token.
- Expiração e utilização.

### `Customer`

- Organização.
- Nome ou razão social.
- Documento opcional e normalizado.
- Contatos básicos.
- Observações operacionais.
- `archivedAt` para retirada segura do uso ativo.

### `ServiceLocation`

- Organização e cliente.
- Nome identificador da unidade.
- Endereço estruturado.
- Contato local opcional.
- Instruções de acesso.
- Status ativo.

### `Equipment`

- Organização, cliente e local.
- Nome, categoria, marca e modelo.
- Número de série ou identificação interna.
- Observações técnicas.
- Status ativo ou arquivado.

### `WorkOrder`

- Organização.
- Número legível único por organização.
- Cliente, local e equipamento opcional.
- Tipo, prioridade, título e descrição.
- Status atual.
- Datas planejadas e realizadas.
- Valor previsto e valor final em centavos.
- Versão para controle de concorrência.
- Criador e timestamps.
- Cancelamento com responsável, data e motivo.

Constraint esperada:

```text
UNIQUE (organization_id, work_order_number)
```

### `WorkOrderAssignment`

- Organização e ordem.
- Técnico.
- Período de validade da atribuição.
- Quem atribuiu.
- Histórico preservado em trocas de técnico.

### `WorkOrderExecution`

- Organização e ordem.
- Técnico responsável.
- Início, conclusão e observações.
- Snapshot dos requisitos aplicáveis à execução.
- Versão para concorrência quando necessário.

### `ChecklistTemplate`

- Organização.
- Nome e versão.
- Definição dos itens.
- Status ativo.
- Templates utilizados não devem ser modificados retroativamente.

### `ChecklistResponse`

- Organização, execução e template/versionamento.
- Snapshot dos itens apresentados ao técnico.
- Respostas e timestamps.

JSONB pode ser utilizado para a definição e snapshot quando simplificar o MVP, desde que exista validação de schema, versionamento e consultas indexadas apenas onde necessário.

### `Evidence`

- Organização, ordem e execução.
- Tipo da evidência.
- Object key, nome original seguro, MIME type e tamanho.
- Status do upload.
- Usuário responsável.
- Timestamps.

O banco guarda metadados, não os bytes do arquivo.

### `AdditionalItem`

- Organização e execução.
- Tipo: material, serviço ou hora adicional.
- Descrição, quantidade e valor unitário em centavos.
- Valor total calculado de forma segura.
- Status de revisão quando necessário.

### `Review`

- Organização e ordem.
- Revisor.
- Decisão: aprovação ou solicitação de correção.
- Motivo ou instruções.
- Timestamp.

Preservar múltiplas revisões para manter o histórico de idas e retornos.

### `WorkOrderStatusHistory`

- Organização e ordem.
- Status anterior e novo status.
- Ator e timestamp.
- Motivo ou contexto quando aplicável.

### `AuditLog`

- Organização.
- Ator.
- Ação e tipo do recurso.
- Identificador do recurso.
- Metadata segura e limitada.
- Request ID e timestamp.

Não armazenar senha, token, cookie, arquivo ou payload sensível completo em auditoria.

## IDs

- Utilizar um formato opaco consistente e suportado nativamente pela estratégia escolhida.
- Preferir coluna PostgreSQL `uuid` quando UUID for adotado.
- Não misturar formatos de ID sem motivo.
- Não expor IDs sequenciais quando isso facilitar enumeração desnecessária.
- IDs não substituem filtros de tenant ou autorização.

A estratégia definitiva deve ser escolhida no início das migrations e registrada aqui. Não trocar IDs primários no meio do MVP sem necessidade forte.

## Valores monetários

Valores são armazenados em centavos, nunca em `float`.

Direção recomendada:

- PostgreSQL `BIGINT` para valores monetários em centavos.
- Prisma `BigInt` no acesso ao banco.
- Transporte HTTP como string decimal inteira para evitar limitação do JSON e perda de precisão.

Exemplo:

```json
{
  "amountInCents": "1485000",
  "currency": "BRL"
}
```

Regras:

- Quantidade e valor unitário devem possuir regras claras de precisão.
- Totais oficiais são calculados na API.
- O frontend pode apresentar prévia, mas não é fonte de verdade.
- Não converter `BigInt` implicitamente para `number`.
- Valores negativos só são aceitos em operações que explicitamente os permitam.
- Toda alteração que afete o valor final deve ser auditável.

Itens adicionais usam quantidade inteira em milésimos (`quantityInThousand`),
aceitam até três casas decimais e transportam a quantidade como string. O total
em centavos é calculado pela API com arredondamento meio para cima: `(quantidade
em milésimos × valor unitário em centavos + 500) / 1000`.

## Datas e timezone

- Persistir instantes em UTC usando tipo PostgreSQL adequado a timezone.
- Transportar timestamps em ISO 8601 com offset ou `Z`.
- Armazenar o timezone IANA da organização, como `America/Fortaleza`.
- Não salvar horário local sem contexto de timezone.
- Agenda e filtros por dia devem converter corretamente os limites locais para UTC.
- Não confiar no timezone enviado livremente pelo navegador para decisões históricas.
- Registrar timestamps de negócio no servidor, salvo quando o domínio exigir horário informado e auditado.

## Exclusão e retenção

- Ordens, execuções, revisões, histórico, evidências confirmadas e auditoria não devem ser apagados por endpoints CRUD comuns.
- Clientes, equipamentos e usuários podem ser arquivados ou desativados.
- Entidades arquivadas permanecem disponíveis em históricos anteriores.
- Exclusão física deve existir apenas para requisitos explícitos, dados de teste ou rotinas administrativas controladas.
- A política de retenção e privacidade deve ser definida antes da operação comercial em produção.

Não implementar soft delete global automático sem compreender como ele afeta constraints, relações, unicidade e consultas.

## Índices e constraints

Índices devem refletir consultas reais e iniciar pelo tenant quando aplicável.

### Índices iniciais recomendados

```text
users (normalized_email)
users (organization_id, role, active)
customers (organization_id, normalized_name)
customers (organization_id, normalized_document)
service_locations (organization_id, customer_id, active)
equipment (organization_id, customer_id, active)
equipment (organization_id, serial_number)
work_orders (organization_id, work_order_number) UNIQUE
work_orders (organization_id, status, scheduled_start_at)
work_orders (organization_id, customer_id, created_at DESC)
work_orders (organization_id, created_at DESC)
work_order_assignments (organization_id, technician_id, active_from)
evidence (organization_id, work_order_id, status)
reviews (organization_id, work_order_id, created_at DESC)
work_order_status_history (organization_id, work_order_id, created_at)
audit_logs (organization_id, resource_type, resource_id, created_at DESC)
sessions (user_id, revoked_at, expires_at)
```

Regras:

- Não criar índice para toda coluna.
- Verificar seletividade e ordem das colunas.
- Constraints de integridade têm prioridade sobre validação apenas na aplicação.
- Quando Prisma não representar um índice parcial necessário, utilizar migration SQL revisada.
- Busca textual deve começar simples; adicionar trigram ou full-text somente após observar necessidade.
- Consultas lentas devem ser analisadas com plano de execução antes de receber índices por tentativa.

## Ciclo da ordem de serviço

Estados oficiais do MVP:

```ts
enum WorkOrderStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  AWAITING_REVIEW = 'AWAITING_REVIEW',
  PENDING_CORRECTION = 'PENDING_CORRECTION',
  READY_TO_BILL = 'READY_TO_BILL',
  BILLED = 'BILLED',
  CANCELED = 'CANCELED',
}
```

### Transições permitidas

| Origem | Ação | Destino | Ator permitido |
| --- | --- | --- | --- |
| `DRAFT` | Agendar e atribuir | `SCHEDULED` | `OWNER`, `ADMIN` |
| `DRAFT` | Cancelar | `CANCELED` | `OWNER`, `ADMIN` |
| `SCHEDULED` | Iniciar atendimento | `IN_PROGRESS` | Técnico atribuído |
| `SCHEDULED` | Reagendar | `SCHEDULED` | `OWNER`, `ADMIN` |
| `SCHEDULED` | Cancelar | `CANCELED` | `OWNER`, `ADMIN` |
| `IN_PROGRESS` | Enviar para revisão | `AWAITING_REVIEW` | Técnico atribuído |
| `AWAITING_REVIEW` | Solicitar correção | `PENDING_CORRECTION` | `OWNER`, `ADMIN` |
| `AWAITING_REVIEW` | Aprovar | `READY_TO_BILL` | `OWNER`, `ADMIN` |
| `PENDING_CORRECTION` | Retomar correção | `IN_PROGRESS` | Técnico atribuído |
| `READY_TO_BILL` | Marcar como faturada | `BILLED` | `OWNER`, `ADMIN` |

Cancelamento após início exige uma decisão explícita de produto e não deve ser liberado silenciosamente.

### Regras obrigatórias

- Status não é atualizado por um `PATCH` genérico.
- Cada ação possui caso de uso e endpoint semântico.
- A transição valida tenant, ator, status atual, versão e pré-condições.
- A transição e o histórico são persistidos na mesma transação.
- Ações críticas também geram auditoria na mesma unidade de consistência quando possível.
- Envio para revisão exige todos os itens obrigatórios do snapshot do checklist.
- Evidências obrigatórias precisam estar confirmadas, não apenas com upload iniciado.
- Solicitação de correção exige descrição.
- Aprovação calcula e congela os dados relevantes para a liberação.
- Marcação como faturada registra ator e timestamp, mas não emite documento fiscal.
- Uma ordem `BILLED` não volta de status por endpoint comum.

A fundação persistida usa `BIGINT` para o contador e para valores em centavos,
`UNIQUE (organization_id, work_order_number)` para a numeração e `version` para
concorrência otimista. O número é apresentado como `OS-000001`, sem converter o
contador para `number` do JavaScript. Criação, incremento do contador e histórico
inicial compartilham uma transação; mudanças de estado passam exclusivamente pela
state machine e persistem status, versão, histórico e auditoria atomicamente.

## Endpoints por domínio

Esta seção apresenta os recursos esperados, não substitui a especificação OpenAPI implementada.

### Autenticação

| Rota | Acesso | Sucesso | Resposta |
| --- | --- | ---: | --- |
| `POST /api/v1/auth/login` | Público, com `Origin` permitido | `200` | Usuário e organização; grava access e refresh cookies |
| `GET /api/v1/auth/me` | Access cookie válido | `200` | Usuário e organização atuais |
| `POST /api/v1/auth/refresh` | Refresh cookie e `Origin` permitido | `204` | Sem body; rotaciona ambos os cookies |
| `POST /api/v1/auth/logout` | Público e idempotente, com `Origin` permitido | `204` | Sem body; revoga a sessão reconhecida e limpa cookies |
| `POST /api/v1/auth/logout-all` | Access cookie válido e `Origin` permitido | `204` | Sem body; revoga as sessões do usuário no tenant e limpa cookies |
| `POST /api/v1/auth/forgot-password` | Público, com `Origin` permitido | `202` | Mensagem genérica; nunca revela se o e-mail existe |
| `POST /api/v1/auth/reset-password` | Público, com `Origin` permitido | `204` | Consome token de uso único, redefine senha e revoga sessões |

Tokens, hashes, identidade interna e status de conta nunca aparecem nos bodies.
O token de redefinição é entregue somente pelo `EmailGateway`; o adapter local
controlado existe apenas para desenvolvimento.

### Organização e usuários

```text
GET   /api/v1/organization
PATCH /api/v1/organization
GET   /api/v1/users
POST  /api/v1/users
GET   /api/v1/users/:userId
PATCH /api/v1/users/:userId
POST  /api/v1/users/:userId/deactivate
POST  /api/v1/users/:userId/activate
```

`GET /users` aceita `page`, `pageSize`, `search`, `role` e `status`, sempre com
paginação no banco. `POST /users` recebe `name`, `email`, `password` e `role`; a
senha é convertida em Argon2id antes da persistência e nunca aparece na resposta.
`PATCH /users/:userId` altera somente nome e perfil. Desativar revoga todas as
sessões ainda ativas do usuário. O e-mail normalizado permanece globalmente único.

### Clientes, locais e equipamentos

```text
GET   /api/v1/customers
POST  /api/v1/customers
GET   /api/v1/customers/:customerId
PATCH /api/v1/customers/:customerId
POST  /api/v1/customers/:customerId/archive

GET   /api/v1/customers/:customerId/locations
POST  /api/v1/customers/:customerId/locations
GET   /api/v1/locations/:locationId
PATCH /api/v1/locations/:locationId

GET   /api/v1/equipment
POST  /api/v1/equipment
GET   /api/v1/equipment/:equipmentId
PATCH /api/v1/equipment/:equipmentId
POST  /api/v1/equipment/:equipmentId/archive
```

Clientes e locais usam paginação no PostgreSQL e escopo explícito da organização
autenticada. A busca inicial é por prefixo normalizado (`normalizedName`) e, para
clientes, também por prefixo de documento normalizado; os índices começam por
`organizationId` e pelos campos usados na consulta, sem carregar toda a tabela em
memória. `archive=ACTIVE|ARCHIVED|ALL` controla a listagem de clientes.

`Customer` preserva nome, documento opcional, contatos, observações e
`archivedAt`. O endpoint de arquivamento é idempotente e não exclui o cliente ou
seus locais. `ServiceLocation` mantém endereço estruturado, contato e instruções
de acesso, com status `ACTIVE|INACTIVE`. A foreign key composta
`(organization_id, customer_id)` impede relações cruzadas entre tenants e todas
as foreign keys usam `ON DELETE RESTRICT`. Não existe endpoint `DELETE` comum.

`Equipment` exige cliente, local, nome, identificação e categoria; marca, modelo,
serial e observações são opcionais. `GET /equipment` aceita paginação,
`search`, `archive=ACTIVE|ARCHIVED|ALL`, `customerId` e `locationId`. A busca por
prefixo normalizado cobre nome, identificação e serial. O serial informado é
único por organização após normalização; como o índice do PostgreSQL aceita
múltiplos valores nulos, vários equipamentos podem permanecer sem serial. A
foreign key composta `(organization_id, customer_id, location_id)` garante no
banco que o local pertence simultaneamente ao cliente e ao tenant informados.
Arquivamento é idempotente, preserva o registro e não existe `DELETE` comum.

### Ordens e agenda

```text
GET   /api/v1/work-orders
POST  /api/v1/work-orders
GET   /api/v1/work-orders/:workOrderId
PATCH /api/v1/work-orders/:workOrderId
POST  /api/v1/work-orders/:workOrderId/schedule
POST  /api/v1/work-orders/:workOrderId/reassign
POST  /api/v1/work-orders/:workOrderId/cancel
GET   /api/v1/schedule
```

Edição genérica deve ser bloqueada ou limitada depois que a execução iniciar. Campos críticos precisam de comandos específicos ou regras explícitas.

No CRUD inicial estão ativos `GET/POST /work-orders`, `GET/PATCH
/work-orders/:workOrderId` e `POST /work-orders/:workOrderId/cancel`. Criação
sempre produz `DRAFT`; o `PATCH` exige `version`, não aceita `status` e altera
somente campos do rascunho. O cancelamento exige motivo e usa a ação semântica da
state machine. Valores monetários entram e saem como strings decimais de centavos,
e o detalhe retorna o histórico real em ordem cronológica. Busca, filtros,
paginação e ordenações pertencem a uma allowlist. Rotas de agendamento,
atribuição e execução listadas adiante permanecem planejadas para checkpoints
posteriores e ainda não estão expostas.

### Execução

```text
GET   /api/v1/field/work-orders
GET   /api/v1/field/work-orders/:workOrderId
POST  /api/v1/work-orders/:workOrderId/start
PATCH /api/v1/work-orders/:workOrderId/execution
POST  /api/v1/field/work-orders/:workOrderId/execution/additional-items
PATCH /api/v1/field/work-orders/:workOrderId/execution/additional-items/:itemId
DELETE /api/v1/field/work-orders/:workOrderId/execution/additional-items/:itemId
POST  /api/v1/work-orders/:workOrderId/resume-correction
POST  /api/v1/work-orders/:workOrderId/submit-for-review
```

### Evidências

```text
POST   /api/v1/field/work-orders/:workOrderId/execution/evidence/intents
PUT    /api/v1/field/evidence/:evidenceId/upload?token=...
POST   /api/v1/field/work-orders/:workOrderId/execution/evidence/:evidenceId/confirm
GET    /api/v1/field/evidence/:evidenceId/read-url
GET    /api/v1/field/evidence/:evidenceId/content?token=...
DELETE /api/v1/field/work-orders/:workOrderId/execution/evidence/:evidenceId
```

Exclusão só é permitida enquanto a execução puder ser editada e pelo ator autorizado. Depois da submissão, seguir regra de correção e preservar auditoria.

### Revisão e faturamento

```text
GET  /api/v1/reviews/queue
GET  /api/v1/reviews/work-orders/:workOrderId
POST /api/v1/work-orders/:workOrderId/request-correction
POST /api/v1/work-orders/:workOrderId/approve

GET  /api/v1/billing/ready
POST /api/v1/work-orders/:workOrderId/mark-billed
```

### Dashboard e histórico

```text
GET /api/v1/dashboard/summary
GET /api/v1/work-orders/:workOrderId/history
```

Manter nomes de recursos e ações consistentes. Antes de implementar todos os endpoints, priorizar o fluxo vertical necessário à etapa atual.

## Paginação, filtros e ordenação

Listagens administrativas usam paginação no servidor.

Contrato inicial:

- `page`: começa em `1`.
- `pageSize`: padrão `20`, máximo `100`.
- `sort`: conjunto permitido por endpoint.
- `order`: `asc` ou `desc`.
- Filtros específicos e documentados por recurso.

Regras:

- Nunca aceitar nome arbitrário de coluna para ordenação.
- Aplicar filtros no banco.
- Utilizar ordenação estável com critério de desempate.
- Normalizar buscas textuais.
- Não executar `count` caro automaticamente em endpoints de alta frequência sem medir necessidade.
- Históricos extensos podem migrar para cursor pagination quando necessário.
- Respostas não devem expor campos internos somente porque foram carregados pelo Prisma.

## Concorrência e idempotência

Ordens podem ser abertas simultaneamente pelo escritório e pelo técnico.

### Controle de concorrência

- `WorkOrder` deve possuir campo de versão crescente ou mecanismo equivalente.
- Mutations críticas recebem a versão conhecida pelo cliente.
- Atualização deve confirmar que a versão ainda é atual.
- Em conflito, retornar `409` com código estável, como `WORK_ORDER_VERSION_CONFLICT`.
- O cliente deve recarregar os dados antes de repetir a decisão.

Não utilizar apenas `updatedAt` com precisão incerta como controle de concorrência.

### Duplicidade

- Transições devem ser seguras contra clique ou retry duplicado.
- Constraints únicas devem proteger numeração e tokens.
- Criação de ordem deve aceitar estratégia de idempotência quando o risco de retry real for identificado.
- Marcar como faturada novamente não pode duplicar histórico ou valores.
- Upload confirmado duas vezes não pode criar duas evidências.

Não implementar uma infraestrutura genérica de idempotency keys sem um fluxo que a utilize. Resolver primeiro as duplicidades críticas com estado, constraints e transações.

## Transações

Utilizar transação quando uma ação precisa persistir múltiplos efeitos como unidade:

- Criar ordem e número sequencial.
- Agendar e registrar atribuição.
- Enviar execução e registrar transição.
- Solicitar correção e criar revisão.
- Aprovar, calcular valor final e registrar histórico.
- Marcar como faturada e registrar auditoria.
- Redefinir senha e invalidar token/sessões.

Regras:

- Manter transações curtas.
- Não enviar e-mail ou fazer upload dentro da transação do banco.
- Não chamar serviços externos enquanto mantém locks.
- Usar nível de isolamento apropriado ao conflito real.
- Falhar toda a operação quando a invariante exigir atomicidade.
- Eventos externos futuros devem considerar outbox somente quando houver processamento assíncrono real.

## Numeração da ordem

O número visível da OS deve ser único e legível dentro da organização.

- Não usar `MAX(number) + 1` fora de uma estratégia transacional segura.
- Manter contador por organização ou mecanismo equivalente protegido contra concorrência.
- O ID técnico continua separado do número exibido.
- O número não precisa ser globalmente único.
- Cancelar ou apagar rascunho não deve reutilizar silenciosamente um número já publicado.

Formato visual pode começar simples e configurável posteriormente. Não acoplar regras fiscais à numeração operacional.

## Checklists

- Templates pertencem à organização.
- Itens possuem tipo, label, obrigatoriedade e ordem.
- Tipos do MVP devem ser limitados ao necessário: texto curto, texto longo, número, seleção, boolean e evidência requerida quando aplicável.
- Template usado por uma execução deve ser versionado ou ter snapshot.
- Alterar template não modifica ordens históricas.
- Respostas precisam ser validadas contra o snapshot utilizado.
- Submissão para revisão verifica todos os itens obrigatórios.

Evitar um form builder genérico e ilimitado no MVP. Implementar apenas os tipos comprovadamente necessários aos pilotos.

## Evidências e object storage

O bucket deve ser privado.

No desenvolvimento, a porta `EvidenceStorage` usa um diretório local privado,
configurado por `EVIDENCE_STORAGE_ROOT`, fora de qualquer pasta servida pela web e
ignorado pelo Git. O adapter preserva a semântica de object key, verificação de
metadata e exclusão; produção deverá substituir apenas o adapter por um storage
privado compatível. Os bytes nunca são gravados no PostgreSQL.

### Fluxo de upload recomendado

1. Usuário solicita um upload intent para uma ordem autorizada.
2. API valida tenant, atribuição, status, MIME type e tamanho declarado.
3. API cria uma evidência com status `PENDING` e object key gerada pelo servidor.
4. API retorna URL assinada de curta duração.
5. No adapter local, o navegador envia o arquivo para a rota temporária da API, que o grava no storage privado.
6. Navegador confirma o upload na API.
7. API verifica o objeto e altera o status para `AVAILABLE`.

Estados mínimos sugeridos:

```text
PENDING
AVAILABLE
```

### Regras de segurança

- Object key gerada pelo servidor e impossível de escolher livremente pelo cliente.
- Incluir identificadores opacos de organização, ordem e evidência no key prefix.
- Não confiar no nome original do arquivo.
- Sanitizar nomes utilizados em download.
- Validar MIME type informado e, quando possível, conteúdo real.
- Limitar tamanho e quantidade por ordem.
- URL de upload e download com expiração curta.
- Não tornar bucket ou objetos públicos.
- Confirmar existência, tamanho e metadata antes de marcar como disponível.
- Downloads exigem autenticação e autorização antes de gerar URL.
- Rotina futura deve remover uploads pendentes abandonados.
- Antivírus ou scanning pode ser adicionado quando risco, tipo de arquivo e operação justificarem.

## Revisão e liberação para faturamento

### Revisão

O revisor deve receber uma visão consolidada de:

- Dados da ordem.
- Técnico e horários.
- Checklist e respostas.
- Evidências disponíveis.
- Observações.
- Materiais, horas e serviços adicionais.
- Histórico anterior de pendências.

Solicitação de correção:

- Exige descrição acionável.
- Registra revisão e transição.
- Mantém os dados anteriores.
- Permite ao técnico corrigir somente no estado adequado.

Aprovação:

- Confirma que requisitos obrigatórios estão atendidos.
- Calcula o valor final na API.
- Registra revisão, transição e auditoria.
- Move diretamente para `READY_TO_BILL`.

### Faturamento operacional

A fila de faturamento contém ordens `READY_TO_BILL`.

- Filtros por conclusão, cliente e período.
- Valor final oficial calculado pela API.
- Marcação manual como `BILLED`.
- Registro de ator e timestamp.
- Nenhuma emissão fiscal no MVP.
- Nenhum contas a receber completo no MVP.

## Auditoria

Auditar ações de alto impacto, incluindo:

- Login relevante, logout global e eventos de segurança quando apropriado.
- Criação, ativação, desativação e alteração de perfil de usuário.
- Alteração de configurações da organização.
- Criação e cancelamento de ordem.
- Troca de técnico.
- Início e envio da execução.
- Remoção de evidência.
- Solicitação de correção.
- Aprovação.
- Marcação como faturada.

Um audit log deve registrar somente o necessário:

- Organização.
- Ator.
- Ação.
- Tipo e ID do recurso.
- Timestamp.
- Request ID.
- Metadata limitada e sem secrets.

Histórico de domínio e audit log têm finalidades diferentes. O histórico explica o ciclo ao usuário; a auditoria registra ações críticas para segurança e suporte.

## Logs e request ID

- Utilizar logs estruturados.
- Gerar ou aceitar de fonte confiável um request ID por requisição.
- Retornar request ID em header de resposta.
- Propagar request ID para logs de integrações.
- Registrar método, rota normalizada, status e duração.
- Não registrar body completo por padrão.
- Redigir Authorization, Cookie, Set-Cookie, senha, token e credenciais.
- Não registrar URLs assinadas completas.
- Não registrar conteúdo de evidências.
- Utilizar níveis de log coerentes.

Erros esperados de domínio não devem poluir logs como falhas internas. Erros inesperados devem preservar stack apenas nos logs seguros do servidor.

## Health checks

Endpoints implementados:

```text
GET /health/live
GET /health/ready
```

- Liveness retorna `200` com `{"status":"ok"}` sem consultar dependências pesadas.
- Readiness executa uma consulta mínima no PostgreSQL e retorna `200` com o estado do banco ou `503` no formato centralizado de erro.
- Em `NODE_ENV=test`, readiness usa `TEST_DATABASE_URL`; nos demais ambientes, usa `DATABASE_URL`.
- Não incluir informações sensíveis na resposta.
- Não executar verificações externas caras a cada probe.
- Storage e e-mail podem possuir diagnóstico separado se não forem necessários para toda requisição.

## Segurança HTTP

- Headers de segurança apropriados.
- CORS com allowlist explícita.
- Limite de tamanho do body.
- Rate limiting em endpoints públicos e sensíveis.
- Content type validado.
- Timeout de servidor e clientes externos.
- Proxy confiável configurado explicitamente antes de usar IP encaminhado.
- Swagger registrado em `/docs` somente em desenvolvimento e ausente em teste e produção.
- Mensagens internas e stack traces removidos das respostas públicas.
- Nenhum endpoint administrativo oculto é considerado seguro apenas por não estar documentado.

## Integrações externas

E-mail, storage e futuras integrações devem depender de interfaces controladas pela aplicação.

Exemplos:

```ts
interface EmailGateway {
  sendPasswordReset(input: PasswordResetEmail): Promise<void>;
}

interface EvidenceStorage {
  createUploadIntent(input: CreateUploadIntentInput): Promise<UploadIntent>;
  createDownloadUrl(input: CreateDownloadUrlInput): Promise<string>;
  inspectObject(input: InspectObjectInput): Promise<StoredObjectMetadata>;
}
```

SDKs e tipos do provedor não devem vazar para domínio, controllers ou contratos HTTP.

Falhas externas devem possuir timeout, classificação e mensagem interna segura. Não fazer retry cego de operação não idempotente.

## OpenAPI/Swagger

A documentação OpenAPI é a referência dos endpoints implementados.

No estado atual, a UI fica em `/docs` e o documento JSON em `/docs-json`, exclusivamente com `NODE_ENV=development`.

Cada endpoint deve documentar:

- Autenticação exigida.
- Perfis ou restrições relevantes.
- Params, query e body.
- Resposta de sucesso.
- Erros de domínio relevantes.
- Paginação e filtros.

Regras:

- DTOs HTTP devem gerar schema correto.
- Não documentar endpoints ainda inexistentes como disponíveis.
- Alterações de contrato devem atualizar OpenAPI e testes no mesmo pull request.
- O README descreve recursos e decisões; Swagger descreve o contrato executável.
- Se houver geração de client para o frontend, ela deve partir de uma especificação validada e estável.

## Banco de dados e Prisma

O schema inicial de identidade usa Prisma `6.19.3`, fixado junto com o client para preservar a arquitetura NestJS/CommonJS já aprovada. Uma migração futura para o Prisma 7 exige tratar separadamente ESM e driver adapter e não faz parte do CP-05.

O modelo atual contém `Organization`, `User`, `Session`, `PasswordResetToken` e
`AuditLog`. As decisões vigentes são:

- IDs UUID e timestamps PostgreSQL com timezone.
- Cada usuário pertence obrigatoriamente a uma única organização.
- `normalizedEmail` é globalmente único; a camada de aplicação deverá normalizar o e-mail antes da persistência.
- Relações compostas por `organizationId` e `userId` impedem que sessões e tokens de redefinição sejam vinculados a usuário de outra organização.
- Somente hashes de senha, refresh token e token de redefinição são persistidos; valores em texto puro não pertencem ao schema.
- Sessões registram expiração, família do refresh token, último uso, revogação e motivo da revogação.
- Criação de usuário e mudanças de perfil ou status geram auditoria transacional
  com tenant, ator, recurso, request ID e metadata limitada, sem senha ou hash.
- O `PrismaService` pertence à infraestrutura, seleciona `TEST_DATABASE_URL` em `NODE_ENV=test` e encerra o client no graceful shutdown.

Para validar o schema e aplicar a migration inicial:

```bash
npm run prisma:validate
npm run prisma:generate
npm run db:migrate:dev
npm run test:integration
```

O executor de integração recusa bancos remotos, exige que os bancos de desenvolvimento e teste tenham nomes distintos e confirma o banco conectado antes de escrever. Ele aplica migrations e executa o Jest somente com `TEST_DATABASE_URL`; a limpeza é restrita aos registros criados pelo próprio teste.

### Migrations

- Toda alteração de schema passa por migration versionada.
- Migrations devem ser revisadas antes de aplicação em produção.
- Não utilizar `db push` como estratégia de produção.
- Não editar migration já aplicada em ambiente compartilhado.
- Mudanças destrutivas exigem plano de migração de dados.
- Produção utiliza `prisma migrate deploy` ou script equivalente controlado.
- Migrations não devem executar automaticamente em todas as réplicas no startup.

### Prisma Client

- Instância gerenciada por módulo de infraestrutura.
- Conexão encerrada corretamente no shutdown.
- Não retornar objetos Prisma crus sem presenter ou seleção consciente.
- Utilizar `select` para evitar dados desnecessários e campos sensíveis.
- Evitar N+1 e includes excessivos.
- Paginar relações que podem crescer.

### Evolução segura

Para mudanças incompatíveis em produção, preferir sequência expand, migrate e contract:

1. Adicionar estrutura compatível.
2. Publicar código que suporta estado antigo e novo.
3. Migrar ou preencher dados.
4. Remover estrutura antiga somente após validação.

## Seed de desenvolvimento

O seed deve ser determinístico, idempotente quando viável e explicitamente bloqueado em produção.

O seed de identidade implementado cria duas organizações visualmente distintas e, em cada uma, um `OWNER`, um `ADMIN` e um `TECHNICIAN`. Ele aceita somente `NODE_ENV=development` ou `test`, exige URLs PostgreSQL locais e bancos de desenvolvimento e teste distintos, e nunca utiliza `DATABASE_URL` como fallback durante testes.

Executar duas vezes é seguro e não duplica organizações ou usuários:

```bash
npm run db:seed
npm run db:seed
```

Credencial pública exclusivamente demonstrativa e local:

| Organização | Perfil | E-mail |
| --- | --- | --- |
| Organização A | `OWNER` | `owner.a@demo.ciclera.local` |
| Organização A | `ADMIN` | `admin.a@demo.ciclera.local` |
| Organização A | `TECHNICIAN` | `technician.a@demo.ciclera.local` |
| Organização B | `OWNER` | `owner.b@demo.ciclera.local` |
| Organização B | `ADMIN` | `admin.b@demo.ciclera.local` |
| Organização B | `TECHNICIAN` | `technician.b@demo.ciclera.local` |

Todos usam a senha demonstrativa `CicleraLocalOnly!2026`. Ela é pública, não é secret e nunca deve ser reutilizada fora do ambiente local. O banco persiste somente hashes Argon2id com salts independentes. Após executar o seed, essas contas podem ser usadas somente no login local documentado abaixo.

Exemplo manual sem expor tokens no terminal; o arquivo temporário recebe os
cookies e deve ser removido ao final:

```bash
curl -i -c .ciclera-local-cookies.txt \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"email":"owner.a@demo.ciclera.local","password":"CicleraLocalOnly!2026"}' \
  http://localhost:3333/api/v1/auth/login

curl -i -b .ciclera-local-cookies.txt \
  http://localhost:3333/api/v1/auth/me

curl -i -b .ciclera-local-cookies.txt -c .ciclera-local-cookies.txt \
  -H "Origin: http://localhost:3000" \
  -X POST http://localhost:3333/api/v1/auth/refresh

curl -i -b .ciclera-local-cookies.txt -c .ciclera-local-cookies.txt \
  -H "Origin: http://localhost:3000" \
  -X POST http://localhost:3333/api/v1/auth/logout
```

Recuperação local: faça a solicitação e copie o valor depois de `#token=` do
evento `auth.password-reset.local-delivery` exibido exclusivamente no terminal
da API em desenvolvimento. A rota visual `/redefinir-senha` pertence ao CP-10;
até lá, envie o token diretamente para a API:

```powershell
$headers = @{ Origin = 'http://localhost:3000' }
$forgotBody = @{ email = 'owner.a@demo.ciclera.local' } | ConvertTo-Json

Invoke-WebRequest `
  -Uri 'http://localhost:3333/api/v1/auth/forgot-password' `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $forgotBody

$resetBody = @{
  token = 'COLE_AQUI_O_TOKEN_LOCAL'
  password = 'NovaSenhaLocal!2026'
} | ConvertTo-Json

Invoke-WebRequest `
  -Uri 'http://localhost:3333/api/v1/auth/reset-password' `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $resetBody
```

O link e o token locais são credenciais temporárias. Não os envie para logs de
produção, tickets ou analytics.

`.ciclera-local-cookies.txt` está ignorado pelo Git e deve ser removido depois
do teste porque contém credenciais temporárias de sessão.

O `npm run test:integration` aplica migrations e executa o seed duas vezes somente em `TEST_DATABASE_URL`. O teste valida perfis, isolamento, unicidade, hashes e bloqueios de ambiente, e remove apenas os IDs reservados criados pelo próprio seed.

O conteúdo operacional abaixo representa a evolução final esperada do seed após os respectivos models serem implementados em checkpoints posteriores; ele não faz parte do CP-06:

Conteúdo mínimo:

- Duas organizações distintas.
- Um `OWNER` e um `ADMIN`.
- Pelo menos dois `TECHNICIAN`.
- Clientes, locais e equipamentos fictícios.
- Ordens em todos os estados relevantes.
- Uma execução completa aguardando revisão.
- Uma ordem com pendência.
- Uma ordem pronta para faturar.
- Uma ordem faturada.

Credenciais de seed devem ser apenas de desenvolvimento, documentadas localmente e nunca reutilizadas em produção.

As duas organizações são obrigatórias para permitir testes manuais e automatizados de isolamento multi-tenant.

## Testes

### Testes unitários

Priorizar regras puras e casos de uso:

- State machine da ordem.
- Políticas de autorização dependentes do recurso.
- Cálculo de valores.
- Validação de checklist.
- Aprovação e correção.
- Controle de concorrência.
- Normalização e value objects.

Mocks devem representar portas, não reproduzir internals do Prisma.

### Testes de integração

Executar contra PostgreSQL real e isolado. SQLite não deve substituir PostgreSQL porque constraints, tipos, timezone, transações e SQL diferem.

Cobrir:

- Repositórios multi-tenant.
- Constraints e índices essenciais.
- Transações.
- Migrations aplicáveis em banco vazio.
- Sessões e rotação de refresh token.
- Upload intent e confirmação com adapter de storage controlado.

### Testes end-to-end

Fluxos mínimos:

1. Login, refresh e logout.
2. Recuperação e redefinição de senha.
3. Bloqueio de usuário inativo.
4. Tentativa de acesso entre duas organizações.
5. Tentativa de técnico acessar ordem não atribuída.
6. Cadastro de cliente, local e equipamento.
7. Criação, agendamento e atribuição de ordem.
8. Execução, checklist e evidência.
9. Rejeição de submissão incompleta.
10. Solicitação e correção de pendência.
11. Aprovação e cálculo do valor final.
12. Entrada na fila pronta para faturar.
13. Marcação como faturada sem duplicidade.
14. Conflito de versão simultânea.

### Testes de isolamento obrigatórios

Para cada domínio multi-tenant importante, criar cenário com:

- Organização A autenticada.
- Recurso válido pertencente à organização B.
- ID real do recurso B enviado na rota.
- Resposta sem exposição dos dados.
- Confirmação de que nenhuma mutation ocorreu.

Não considerar o multi-tenancy testado apenas porque uma query unitária contém `organizationId`.

### Cobertura

Não perseguir percentual artificial. Priorizar caminhos que possam:

- Expor dados de outra empresa.
- Permitir ação não autorizada.
- Corromper o ciclo da ordem.
- Duplicar valores ou histórico.
- Perder evidências.
- Impedir operação dos pilotos.

## Performance e escalabilidade

Para o MVP, simplicidade operacional tem prioridade, mas decisões básicas devem evitar gargalos previsíveis.

- API stateless, exceto dados persistidos em serviços externos apropriados.
- Pool de conexões dimensionado conforme banco e quantidade de réplicas.
- Paginação em listagens crescentes.
- Índices alinhados a tenant, status, datas e relacionamentos frequentes.
- Seleção apenas de campos necessários.
- Evitar N+1.
- Não carregar arquivos pela API quando upload direto for possível.
- Não calcular dashboards percorrendo dados em memória.
- Agregações executadas no banco com filtros e índices.
- Não adicionar cache antes de identificar leitura cara, frequência e estratégia de invalidação.
- Se cache for introduzido, a chave deve incluir organização e parâmetros relevantes.
- Não usar Redis apenas para armazenar dados que PostgreSQL atende adequadamente no estágio atual.

Antes de otimizar uma query, observar plano de execução e volume esperado. Toda otimização multi-tenant precisa preservar o filtro por organização.

## Resiliência

- Timeouts explícitos em chamadas externas.
- Retry apenas para falhas transitórias e operações idempotentes.
- Backoff limitado.
- Falha de e-mail não pode produzir estado de senha redefinida incorreto.
- Falha de confirmação de upload não pode marcar evidência como disponível.
- Graceful shutdown para concluir requests em andamento e fechar conexões.
- Não capturar exceções para retornar sucesso falso.
- Erros de dependência devem ser diferenciados de erros do usuário.

Fila e outbox só devem ser introduzidas quando e-mail, processamento de arquivos ou integrações criarem necessidade operacional comprovada.

## Observabilidade

Mínimo para produção:

- Logs estruturados e centralizáveis.
- Request ID.
- Captura de erros inesperados.
- Métricas básicas de latência, taxa de erro e disponibilidade quando a infraestrutura permitir.
- Health checks.
- Correlação com deploy ou release.
- Alertas proporcionais ao estágio do produto.

Nunca enviar senha, token, cookie, documento completo, evidência ou payload sensível para observabilidade.

## Deploy e operação

- Executar build reproduzível.
- Utilizar `NODE_ENV=production`.
- Injetar secrets pelo ambiente.
- Aplicar migrations uma vez por deploy, fora do startup concorrente das réplicas.
- Executar a API com usuário sem privilégios excessivos.
- Expor somente a porta necessária.
- Utilizar HTTPS no ponto de entrada.
- Configurar CORS e cookies conforme os domínios reais.
- Configurar graceful shutdown.
- Manter backup automático do PostgreSQL.
- Testar restauração do backup, não apenas sua criação.
- Definir retenção de backups e evidências.
- Separar ambientes de desenvolvimento, teste e produção.

Provedor específico deve ser documentado somente após escolha real.

## Ordem recomendada de implementação

1. Bootstrap, configuração validada, logging, erros e health checks.
2. Prisma, PostgreSQL, migrations e seed com duas organizações.
3. Autenticação, sessões e recuperação de senha.
4. Contexto autenticado, RBAC e testes multi-tenant.
5. Organizações e usuários.
6. Clientes, locais e equipamentos.
7. Ordens, numeração, atribuição e state machine.
8. Agenda e consultas do técnico.
9. Execução e checklist versionado.
10. Evidências privadas e upload intent.
11. Itens adicionais e cálculo monetário.
12. Revisão, correção e aprovação.
13. Fila pronta para faturar e marcação como faturada.
14. Dashboard e histórico.
15. Testes end-to-end, hardening, observabilidade e deploy.

Cada etapa deve entregar contratos reais utilizáveis pelo frontend. Evitar criar todos os controllers com respostas mockadas antes de implementar persistência e invariantes.

## Definition of Done de um endpoint

Um endpoint está concluído quando:

- Possui autenticação apropriada.
- Valida perfil e relacionamento com o recurso.
- Restringe dados à organização autenticada.
- Valida params, query e body.
- Aplica a regra de negócio no caso de uso.
- Usa transação quando necessário.
- Retorna contrato tipado e documentado.
- Não expõe campos internos ou sensíveis.
- Possui erros estáveis e seguros.
- Registra histórico ou auditoria quando aplicável.
- Possui testes proporcionais ao risco.
- Não introduz query sem índice em fluxo crescente sem análise.
- Mantém lint, typecheck, testes e build aprovados.

## Definition of Done da API do MVP

A API está pronta para piloto quando:

- Organizações e usuários iniciais podem ser provisionados com segurança.
- Login, refresh, logout e recuperação de senha funcionam.
- Sessões podem ser revogadas.
- Perfis são aplicados no servidor.
- Testes impedem acesso entre organizações.
- Clientes, locais e equipamentos podem ser gerenciados.
- Ordens podem ser criadas, numeradas, atribuídas e agendadas.
- Técnico acessa somente ordens autorizadas.
- Execução, checklist e itens adicionais são persistidos.
- Evidências são armazenadas de forma privada e autorizada.
- Submissão incompleta é rejeitada corretamente.
- Revisão aprova ou solicita correção preservando histórico.
- Valor final é calculado sem ponto flutuante.
- Ordem aprovada entra em `READY_TO_BILL`.
- Marcação como faturada é segura contra duplicidade.
- Ações críticas possuem auditoria.
- OpenAPI representa os endpoints reais.
- Migrations funcionam em banco vazio.
- Seed fornece duas organizações de teste.
- Health checks, logs e request IDs funcionam.
- Lint, typecheck, testes e build são aprovados.
- Existe estratégia de backup e migration para produção.

## Checklist antes de pull request

```bash
npm run lint
npm run typecheck
npm run prisma:validate
npm test
npm run test:integration
npm run build
```

Quando a mudança afetar fluxo HTTP crítico:

```bash
npm run test:e2e
```

Confirmar também:

- Migration foi criada e revisada quando necessária.
- `.env.example` foi atualizado.
- OpenAPI foi atualizado.
- Nenhum secret ou dado pessoal foi incluído.
- Queries novas incluem escopo da organização.
- Índices e constraints foram considerados.
- Transações e concorrência foram avaliadas.
- Erros não expõem detalhes internos.
- O contrato continua compatível com `ciclera-web`.

## Instruções para assistentes de IA

Ao trabalhar nesta API:

1. Leia o README raiz e este arquivo antes de alterar código.
2. Inspecione `package.json`, schema Prisma, migrations e padrões existentes.
3. Não recrie a aplicação ou troque sua arquitetura sem solicitação explícita.
4. Não suponha endpoints, scripts, providers ou variáveis que não existam.
5. Não adicione funcionalidades fora do escopo do MVP.
6. Não adicione Redis, filas, microservices ou event bus preventivamente.
7. Nunca consulte recurso multi-tenant apenas pelo ID quando o tenant puder fazer parte da query.
8. Nunca aceite `organizationId` do cliente como fonte confiável.
9. Nunca mova autorização ou invariantes críticas para o frontend.
10. Não implemente mudança de status por update genérico.
11. Preserve transações, histórico e auditoria nas ações críticas.
12. Não utilize `float` para dinheiro.
13. Não armazene arquivos no PostgreSQL nem torne evidências públicas.
14. Não exponha objetos Prisma diretamente como contrato HTTP.
15. Não crie abstrações genéricas antes de existirem usos concretos.
16. Atualize migration, OpenAPI, testes e documentação junto da mudança.
17. Adicione teste entre duas organizações ao criar um novo domínio multi-tenant.
18. Execute lint, typecheck, validação Prisma, testes e build antes de concluir.
19. Relate arquivos alterados, decisões, comandos executados e pendências reais.
20. Se uma decisão conflitar com o README raiz ou com contrato existente, pare e sinalize o conflito.

Prioridade em caso de dúvida:

1. Isolamento entre organizações.
2. Autorização e segurança.
3. Integridade e rastreabilidade.
4. Regras do ciclo da ordem.
5. Fluxo utilizável do MVP.
6. Simplicidade operacional.
7. Preferências de implementação.

## Documentação relacionada

- [README raiz](../README.md): produto, escopo e regras compartilhadas.
- [README web](../ciclera-web/README.md): rotas, UX e consumo da API.
- OpenAPI/Swagger: contratos implementados.
- `prisma/schema.prisma`: modelo persistido.
- `prisma/migrations`: evolução versionada do banco.
- `.env.example`: configuração exigida.

Este README explica decisões e invariantes. O schema, migrations, testes e OpenAPI devem refletir a implementação real e ser atualizados junto com ela.

---

**Ciclera API — segurança e rastreabilidade do chamado ao caixa.**
