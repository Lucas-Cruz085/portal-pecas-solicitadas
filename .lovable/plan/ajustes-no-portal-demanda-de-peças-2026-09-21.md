# Ajustes no portal Demanda de Peças

## Objetivo
Aplicar as imagens fornecidas e atualizar o fluxo de solicitação sem recriar as telas existentes.

## Alterações
- Usar a foto da retroescavadeira como fundo do login e a logo NORMAQ JCB no login e na navegação interna, mantendo contraste no tema escuro.
- Adicionar o rodapé fixo “Desenvolvido por Lucas Cruz” em todas as telas.
- Liberar a leitura da base de estoque para todo usuário autenticado e ativo, mantendo importação restrita ao administrador.
- Trocar a ação da tela inicial: “Solicitar” abre “Registrar Solicitação” e preenche a referência e a descrição selecionadas.
- Manter “Nome do Cliente” obrigatório no navegador e no servidor.
- Permitir várias peças no mesmo envio, cada uma com referência, descrição e quantidade; o sistema registra e audita cada linha como parte do mesmo envio.
- Remover a exigência de estoque zerado: qualquer peça poderá ser adicionada à solicitação.

## Validação
- Conferir login em desktop e celular, logo, fundo e rodapé.
- Conferir leitura do estoque por consultor.
- Conferir redirecionamento com peça preenchida, inclusão/remoção de linhas e bloqueio sem cliente.
- Conferir envio com saldo positivo e atualização das listas/relatórios.

## Detalhes técnicos
- Imagens serão armazenadas como ativos do projeto; a logo também gerará o favicon quadrado.
- A permissão de leitura será alterada por migração com RLS, sem ampliar permissões de escrita.
- O formulário enviará um lote validado; o servidor repetirá a validação e gravará as linhas de forma consistente.
