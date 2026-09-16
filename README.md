# RM Controle — Gestão de Empresas, Servidores & Suporte

Sistema web profissional e seguro desenvolvido em **Node.js (JavaScript puro, sem TypeScript)** integrado ao **Supabase**, com conformidade rigorosa com a **LGPD (Lei Geral de Proteção de Dados)** e **RLS (Row Level Security)** habilitado em todas as tabelas.

---

## 💎 Funcionalidades Entregues

### 1. Suporte Técnico em Tempo Real & Métricas
- **Botão "Iniciar Suporte"**: Ao abrir qualquer empresa, o técnico pode iniciar o atendimento em tempo real. Um cronômetro ao vivo passa a registrar os segundos e minutos do atendimento.
- **Header Ativo**: A barra flutuante superior exibe um alerta dinâmico com o nome da empresa em atendimento e o tempo decorrido ao vivo (`🔴 Suporte: Empresa (05:21)`), permitindo acesso instantâneo com um clique.
- **Encerramento Inteligente com Motivo**:
  - Modal de fechamento com cálculo de tempo exato de atendimento.
  - Seleção do **Motivo Principal do Chamado** (ex: *Redefinir Senha*, *Desconexão de QR Code*, *Bloqueio na API Meta*, etc.) e campo para resumo da solução aplicada.
  - Opção de **Voltar e Continuar Atendimento** sem pausar ou perder a contagem do cronômetro.
- **Dashboard & Indicadores de Suporte**:
  - Cards de KPIs: **Total de Chamados**, **Chamados em Andamento**, **Tempo Médio de Atendimento (TMA)** e **Principal Motivo de Chamado**.
  - Lista em tempo real de chamados em aberto (iniciados e não finalizados).
  - Distribuição gráfica das principais reclamações e demandas.
  - Métricas e TMA individualizados por empresa.
  - Histórico detalhado de atendimentos com data, hora, técnico, motivo e duração.
  - Gestão e cadastro de novos motivos de chamado pelo administrador.

### 2. Gestão de Múltiplas Credenciais e Acessos por Empresa
- Cada empresa agora suporta **múltiplos acessos técnicos** cadastrados individualmente com:
  - **Rótulo / Função Clara** (ex: *Admin Geral - Marcos*, *Servidor SSH Root*, *Painel Cloudflare*, *Banco de Dados*);
  - **Login / E-mail de Acesso**;
  - **Senha Protegida** com botão de visualização auditado pela LGPD, botão de cópia rápida e edição;
  - Campo de observações (ex: portas, IPs e regras de 2FA).

### 3. Configurações Gerais & Checklist Customizável
- **Sem checklist fixo involuntário**: O checklist padrão simulado só aparece se a opção "Dados Simulados (Mock Dev)" estiver ativada.
- Quando o modo Mock Dev está desativado, o sistema fica completamente limpo.
- Na aba **Servidores**, o administrador pode:
  - Cadastrar, editar e excluir os requisitos globais do checklist de servidores da empresa;
  - Definir categoria, descrição e obrigatoriedade de cada etapa;
  - Cadastrar membros da equipe (Nome, E-mail e Papel: *Administrador*, *Suporte*, *Vendas*);
  - Testar a visão de permissão de cada papel diretamente pelo menu de perfil.

### 4. Controle de Permissões por Aba (RBAC)
- As abas superiores adaptam-se dinamicamente conforme o papel do usuário:
  - **Administrador**: Todas as abas (*Empresas, Dashboard, Canais, Servidores, Auditoria*).
  - **Suporte**: *Empresas, Dashboard, Servidores, Auditoria*.
  - **Vendas**: *Empresas, Dashboard*.

### 5. Ícones Oficiais do WhatsApp
- Substituição de todos os ícones genéricos por vetores SVG nativos, sóbrios e oficiais do WhatsApp (sem estética de IA).

---

## 🚀 Como Executar

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no seu navegador.
