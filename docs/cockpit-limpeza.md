# Cockpit da empresa: limpeza combinada (04/11/2026)

Contexto: a tela publicada no commit `563d880` ficou poluída (dados repetidos, blocos demais,
tudo com o mesmo peso). O Lucas pediu para limpar, usando o plugin `frontend-design`, sem cortar função.
Arquivo: `src/components/CompanyManagementView.jsx` (aba "cockpit").

## As cinco mudanças

1. **Cartão da empresa enxuto.** Só nome, situação, servidor e o botão "Entrar no servidor".
   Usuário e senha ficam dentro de um recolhível "Ver acesso". Os números (canais, acessos,
   chamados, configuração) viram uma linha pequena de texto.
2. **Avisos fixos só quando existirem.** Sem aviso, fica só um "+ Aviso" discreto (hoje a caixa vazia ocupa espaço).
3. **Suporte em aberto num bloco só.** Cronômetro e botões em cima, relato embaixo, sem moldura dupla.
   O cronômetro e o "Concluir chamado" continuam acompanhando a rolagem.
4. **Tirar "Acessos & Senhas" do Cockpit.** O acesso principal já está à mão no cartão; a lista completa
   fica na aba de credenciais. O Cockpit passa a ter uma coluna só: "Como resolver chamados",
   com as sugestões do relato no topo.
5. **Menos cor.** Só o botão principal fica colorido; o resto em tons neutros (tokens `rm-*`, claro e escuro).
   Menos bordas muito arredondadas e menos selos coloridos.

## Regras

- Não mexer no que não foi listado. Manter o topo (Voltar à esquerda, ações à direita, abas em linha própria).
- Mostrar um mockup ao Lucas e esperar a aprovação antes de publicar.
- Entrada nova em `NOVIDADES` (`src/lib/novidades.js`) ao publicar.

## Em aberto (não faz parte da limpeza)

Login automático no servidor do cliente: extensão do Chrome (preenche e-mail e senha) ou pedir ao
fornecedor um login por link. Hoje o botão copia a senha e abre o servidor.
