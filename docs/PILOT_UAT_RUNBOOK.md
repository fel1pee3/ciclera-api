# UAT e readiness do primeiro piloto

Este documento prepara o CP-45. Ele não autoriza cliente real e não substitui a
execução manual contra staging. O UAT só começa depois que todas as evidências do
CP-44 estiverem aprovadas.

## Dados fictícios necessários

- Uma organização piloto A e uma organização sentinela B, com timezones
  definidos.
- Na organização A: um owner, um admin e três técnicos ativos; mais um técnico
  que será desativado.
- Na organização B: um owner e um técnico usados apenas nos testes de isolamento.
- Cinco clientes fictícios, com pelo menos dois locais por cliente e dez
  equipamentos distribuídos entre os locais.
- Arquivos JPEG, PNG e WebP fictícios dentro e fora dos limites permitidos; nunca
  usar fotos, documentos ou contatos reais.
- Uma planilha CSV válida e cópias com cabeçalho inválido, duplicidade e fórmulas
  iniciadas por `=`, `+`, `-` e `@`.

As credenciais devem ser exclusivas de staging, temporárias e entregues por canal
seguro. Elas não entram neste documento, tickets, screenshots ou logs.

## Matriz mínima de dez ordens

| OS | Variação obrigatória | Resultado esperado |
| --- | --- | --- |
| 1 | Fluxo simples com fotos do atendimento | Aprovada, pronta e faturada |
| 2 | Checklist parcialmente salvo e reload | Dados confirmados persistem |
| 3 | Foto obrigatória ausente | Submissão bloqueada com mensagem útil |
| 4 | Upload interrompido e retomado | Retry seguro sem evidência duplicada |
| 5 | Material e serviço adicional | Total exato em centavos no detalhe, PDF e CSV |
| 6 | Correção solicitada pelo admin | Técnico corrige, reenvia e histórico permanece |
| 7 | Reatribuição e reagendamento | Timeline preserva atribuições e horários |
| 8 | Duas abas com a mesma versão | Segunda escrita recebe conflito sem sobrescrever |
| 9 | Cancelamento administrativo válido | Estado e auditoria coerentes; execução impedida |
| 10 | Próxima da virada do dia no timezone | Agenda e dashboard exibem o dia correto |

## Execução ordenada

1. Confirmar releases, HTTPS, health checks, migration única, backup restaurável,
   logs e storage privado conforme o runbook de staging.
2. Abrir a landing sem autenticação, enviar lead fictício e confirmar que sucesso
   só aparece após entrega real. Validar termos e privacidade.
3. Entrar como owner A, renovar a sessão, recarregar e confirmar logout. Testar
   senha inválida, recuperação genérica e link inválido sem enumeração.
4. Criar e editar o time A, validar permissões de owner/admin/técnico e preparar o
   usuário que será desativado no fim.
5. Baixar o modelo de importação, validar preview, erros por linha e commit único;
   recarregar clientes, locais e equipamentos importados.
6. Criar as dez ordens da matriz, agendar e atribuir. Conferir filtros, números,
   timezone, timeline e histórico.
7. Em navegador mobile, cada técnico acessa somente suas ordens, inicia a
   execução, salva observações/checklist, recarrega e anexa evidências pela câmera
   e galeria. Exercitar progresso, falha de rede e retry sem duplicação.
8. Concluir as variações inválidas e confirmar bloqueios. Enviar as válidas para
   revisão, solicitar correção na OS 6 e validar o ciclo completo.
9. Aprovar, conferir dashboard e aging, marcar como faturadas e comparar valores
   em detalhe, PDF e CSV. Abrir as evidências apenas por URLs temporárias e
   confirmar expiração.
10. Repetir leituras e escritas usando IDs da organização A autenticado como
    usuários B. Todas devem falhar sem revelar dados ou existência do recurso.
11. Desativar o técnico reservado, confirmar revogação da sessão e impossibilidade
    de novo acesso. Executar logout global do owner e validar refresh revogado.
12. Localizar uma requisição pelo `requestId` nos logs sem encontrar cookie,
    token, senha, URL assinada, payload pessoal ou URL de banco.
13. Repetir o smoke e os health checks, criar backup pós-UAT e restaurá-lo em base
    isolada antes da decisão final.

Executar jornadas administrativas em desktop (mínimo 1280 px) e as jornadas de
campo em 360 e 390 px; repetir as telas críticas em 768 e 1024 px. Registrar
browser, sistema, viewport, release e horário.

## Registro de resultado

Para cada passo e OS, registrar `PASS`, `FAIL` ou `BLOCKED`, release, usuário,
tenant, horário, resultado observado e `requestId` quando houver erro. Não anexar
tokens, cookies, URLs temporárias ou evidências privadas ao relatório.

Classificação de defeitos:

- `P0`: vazamento, perda/corrupção de dados, evidência pública ou credencial
  exposta. Resultado imediato `NO-GO`.
- `P1`: impede criar, executar, revisar ou faturar sem alternativa segura.
  Resultado `NO-GO`.
- `P2`: degrada fluxo importante com alternativa documentada; exige decisão
  explícita antes do piloto.
- `P3`: problema cosmético ou de baixa fricção, sem risco de dados/receita.

## Checklist de onboarding

- Organização, timezone e responsáveis confirmados.
- Dono da conta e canal seguro de credenciais definidos.
- Técnicos treinados em evidências, retry e conflitos.
- Modelo de importação validado com dados fictícios antes dos dados autorizados.
- Política de retenção, privacidade e responsáveis por evidências acordados.
- Canal e horário de suporte, severidades e SLA inicial informados.
- Limitações conhecidas e plano de contingência documentados.
- Backup, restauração e rollback exercitados para o release do piloto.

## Procedimento de suporte

1. Solicitar horário, ação, perfil, tela e `requestId`; nunca pedir senha, token,
   cookie, URL assinada ou arquivo privado por canal inseguro.
2. Correlacionar `requestId`, release e tenant em logs redigidos.
3. Classificar severidade e impacto, preservar evidências técnicas seguras e
   comunicar a próxima atualização.
4. Para suspeita cross-tenant, exposição de evidência ou corrupção, suspender o
   piloto e seguir incidente P0.
5. Encerrar somente após reprodução, correção validada ou risco explicitamente
   aceito pelo responsável.

## Relatório e decisão

O relatório final deve conter releases, infraestrutura validada, resumo dos
passos, resultado das dez OS, defeitos por severidade, riscos aceitos, limitações
para o cliente e decisão `GO` ou `NO-GO` assinada pelo responsável.

`GO` exige zero P0/P1, isolamento aprovado, evidências privadas e recuperáveis,
backup restaurado, logs úteis, fluxo mobile concluído, receita bloqueada visível e
PDF/CSV utilizáveis. Qualquer item ausente mantém o CP-45 pendente ou determina
`NO-GO`.
