# Roadmap — Demanda de Peças (JCB NORMAQ)

## Feito
- Banco: profiles, user_roles, stock_items, stock_imports, demand_requests, audit_logs, RLS, demand_ranking, admin lucas.cruz/12345
- Auth por usuário (e-mail sintético), cadastro público desligado
- Telas-base: login, início, solicitar, relatório, importar, usuários, auditoria

## Nova rodada (mensagem nova)
- [ ] user_permissions + has_panel_access (RLS/security definer) + validação no backend
- [ ] Tela Gerência de Acessos (matriz usuário × painel, switches, liberar/bloquear todos)
- [ ] Gestão de Usuários: painéis liberados no formulário + badges
- [ ] Rotas: redirecionar se painel não liberado + menu filtrado + msg "Nenhum painel liberado"
- [ ] Auditoria: login/logout, mudança de permissão (antes/depois), linha expansível, export CSV, imutável
- [ ] Visual JCB NORMAQ: login split com escavadeira, header amarelo, sidebar escura recolhível, área clara #EDEBE6, rodapé "Desenvolvido por Lucas Cruz © 2026" em todas as telas
- [ ] Senha mínima 5 no cadastro
- [ ] Importar: resumo inseridos/atualizados/erro + progresso
- [ ] Fix erro relatorio.tsx rpc args
- [ ] Testar: login admin, importar PDF real, fluxos consultor
## Ajuste solicitado (21/09/2026)
- [x] Aplicar wallpaper e logo anexados no login e no shell interno
- [x] Rodapé fixo em todas as telas: Desenvolvido por Lucas Cruz
- [x] Liberar consulta do estoque importado a todos os usuários autenticados
- [x] Solicitar na tela inicial redireciona e preenche a referência
- [x] Permitir várias referências no mesmo envio manual; cliente obrigatório
- [x] Remover bloqueio por saldo de estoque
## Ajuste (24/09/2026)
- [x] Redirecionar para troca de senha quando marcada; menu filtrado por painel
- [x] Pesquisa de peça por descrição no Registrar Solicitação
- [x] "Esqueci minha senha" no login (NMQ@12345 + troca obrigatória)
## Nova funcionalidade (25/09/2026) — e-mail cancelado
- [x] Cancelado: envio por e-mail substituído por exportar PDF e Excel no Relatório
