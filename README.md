# Remix of Portal Peças Solicitadas

Crie um portal web chamado "Demanda de Peças" para uma concessionária, com autenticação e as seguintes funcionalidades:

## 1. AUTENTICAÇÃO / LOGIN

- Tela de login com usuário e senha

- NÃO deve existir tela de cadastro/autocadastro público (sem "criar conta", sem "esqueci minha senha" via link de e-mail nesta primeira versão)

- Todos os usuários (consultores e admin) são cadastrados manualmente pelo administrador dentro do sistema, na tela de Gestão de Usuários — o admin define o usuário e a senha de cada pessoa

- Caso o cadastro de usuário inclua um campo de e-mail, ele deve ser apenas informativo (para contato/registro), SEM exigir confirmação por e-mail para ativar a conta — o usuário criado pelo admin já nasce ativo e pronto para uso imediato

- Criar automaticamente um usuário admin inicial:

  - Usuário: lucas.cruz

  - Senha: provisionada no banco, fora deste repositório

  - Papel: Administrador

- Sistema de papéis: Administrador (gerencia usuários/vendedores, cadastra usuário e senha de cada um, e vê todos os relatórios) e Consultor/Vendedor (registra solicitações e vê seus próprios registros)

- Todo o sistema deve usar o fuso horário de Brasília (DF, Brasil) como padrão para datas e horários

## 2. CONTEXTO DO SISTEMA

No processo atual: o cliente liga para o consultor pedindo uma peça. Se a peça não tem saldo/registro no estoque, o consultor não consegue criar o orçamento. Precisamos de um lugar para o consultor "flagar" essa peça procurada e não encontrada, para gerar um relatório de demanda reprimida e avaliar oportunidades de compra.

(Referência do caminho equivalente no Dealer: Produto > Relatório > Estoque > Estoque Demanda)

## 3. IMPORTAÇÃO DA BASE DE ESTOQUE (PDF)

- O admin poderá importar periodicamente um arquivo PDF contendo a base de estoque

- O PDF terá as colunas: REFERENCIA, DESCRIÇÃO, ESTOQUE

- O sistema deve extrair esses dados do PDF e atualizar/popular uma tabela de "itens de estoque" (referência, descrição, quantidade em estoque, data da última atualização)

- Ao reimportar um novo PDF, os valores de estoque devem ser atualizados (upsert por REFERENCIA), mantendo o histórico de importações

- Tela de importação deve mostrar: data/hora da última importação, quantidade de itens importados, e permitir novo upload

## 4. TELA INICIAL (pós-login)

- Matriz/tabela em destaque com o "Top 10 itens mais solicitados" (baseado nas solicitações registradas), com paginação para navegar além dos 10 primeiros até esgotar a lista completa de itens solicitados

- Filtro de busca por Referência e/ou Descrição, aplicável sobre a base de estoque importada

- Cada item listado exibe: Referência, Descrição, Estoque atual

- Botão "Solicitar" ao lado de cada item, com campo de quantidade, no formato:

  ( código: 852852 - peças de motor - quantidade ( 10 ) [Solicitar] )

- O botão "Solicitar" só fica HABILITADO quando o estoque do item está ZERADO (quantidade = 0); se o item tem saldo em estoque, o botão fica desabilitado/oculto

- Ao clicar em "Solicitar", registra a solicitação vinculando: item (referência/descrição), quantidade informada, usuário (vendedor logado), data e hora (fuso Brasília)

## 5. FORMULÁRIO "FLAGAR PEÇA SEM ESTOQUE" (registro manual por atendimento ao cliente)

Formulário simples e rápido de preencher pelo consultor, com os campos:

- Nome do Cliente (texto, OBRIGATÓRIO)

- Partnumber / Código da Peça / Referência (texto, OBRIGATÓRIO)

- Data da Solicitação (preenchida automaticamente, fuso Brasília, não editável)

- Contato do Cliente (e-mail ou telefone, campo único, OPCIONAL)

- Vendedor/Consultor (preenchido automaticamente com o nome do usuário logado, não editável)

- Botão "Registrar Solicitação"

## 6. RELATÓRIO DE DEMANDA

Uma tela de relatório/dashboard mostrando:

- Lista de todas as peças flagadas/solicitadas (referência, descrição, cliente quando houver, vendedor, quantidade quando houver, data, contato)

- Ranking das peças MAIS buscadas e não encontradas (contagem de solicitações por referência, ordenado do maior para o menor) — dado mais importante, indica prioridade de compra

- Filtros por período (data inicial/final), por vendedor e por referência/descrição

- Busca por referência, descrição ou cliente

- Exportação da lista em CSV/Excel

- Indicadores no topo: total de solicitações no período, total de referências únicas, top 5 itens mais pedidos

## 7. AUDITORIA

- TODAS as solicitações (flags e pedidos de quantidade) e TODAS as alterações no sistema (importação de PDF, edição/criação de usuário, edição de registros) devem gerar um registro de auditoria (log)

- Cada entrada de log deve conter: usuário responsável, ação realizada, dado alterado (antes/depois quando aplicável), data e hora (fuso Brasília)

- Tela de Auditoria (apenas admin) para consultar esse histórico, com filtro por usuário, tipo de ação e período

## 8. GESTÃO DE USUÁRIOS (apenas admin)

- Tela onde o admin cadastra novos consultores/vendedores informando diretamente usuário e senha (sem fluxo de convite por e-mail)

- Admin pode editar/redefinir a senha de qualquer usuário e ativar/desativar contas

- Admin pode listar todos os usuários com seus papéis (Admin ou Consultor)

## 9. ESTILO VISUAL

- Tema escuro (dark mode) como padrão, visual profissional e corporativo

- Alta densidade de informação nas telas de relatório e na tela inicial (tabelas compactas, muitos dados visíveis sem excesso de espaço em branco), evitando cards grandes e vazios

- Uso de cores de destaque (accent) sóbrias para indicar prioridade (ex: peças com mais solicitações destacadas em laranja/vermelho no ranking) e para indicar itens zerados (ex: vermelho no campo Estoque quando = 0)

- Layout responsivo, mas priorizando uso em desktop (é uma ferramenta interna de concessionária)

## 10. ESTRUTURA GERAL

- Menu lateral com: Início (matriz/filtro/solicitar), Registrar Solicitação (flag manual), Relatório de Demanda, Importar Estoque (admin), Gestão de Usuários (admin), Auditoria (admin), Sair

- Persistir os dados (usar o banco de dados integrado do Lovable/Supabase)

- Consultores só veem/editam suas próprias solicitações; admin vê tudo

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0a20e766-9b75-47b6-85ac-f153888b8dc8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
