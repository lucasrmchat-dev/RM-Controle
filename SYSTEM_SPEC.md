# RM Controle — Especificação Técnica, Arquitetura e Manual do Sistema (SYSTEM_SPEC)

> **Documento Oficial de Engenharia, Banco de Dados, Normas de Design e Diretrizes de IA**  
> Este documento deve ser **estritamente consultado** por qualquer agente de inteligência artificial ou desenvolvedor antes de implementar ou modificar qualquer funcionalidade neste projeto, evitando alucinações e garantindo a integridade dos padrões técnicos e de design estabelecidos.

---

## 1. Visão Geral e Propósito do Sistema

O **RM Controle** é a central unificada de comando operacional da RM, desenvolvida para gerenciar com alta precisão e segurança:
1. **Gestão de Empresas Clientes & Instâncias de Mensageria:** Cadastro, status de implantação, infraestrutura de servidores alocados (VPS Linux, Docker/Portainer), formato de atendimento (*Colaborativo* vs *Individual*), catálogo de canais (Meta API Oficial, QR Code Baileys/Evolution, Instagram, Facebook) e credenciais de acesso mascaradas.
2. **Fila de Demandas ao Vivo (Central de Suporte):** Monitoramento contínuo com **dois cronômetros simultâneos** — *Tempo de Espera (Triagem)* e *Tempo de Atendimento Ativo*, categorias de demandas, atribuição para técnicos ou fila geral, e alertas sonoros com síntese de áudio nativa.
3. **Sincronização em Tempo Real Multi-usuário:** Qualquer demanda cadastrada ou alterada por um colaborador reflete instantaneamente em todas as telas abertas da equipe via WebSockets do **Supabase Realtime**, sem custos extras de infraestrutura (plano gratuito).
4. **Dashboard de Produtividade & Métricas de Atendimento:** Análise de TMA (Tempo Médio de Atendimento), TME (Tempo Médio de Espera), volume por empresa, causas recorrentes e ranking de produtividade de atendentes com filtragem por períodos e categorias.
5. **Conformidade Estrita com a LGPD e Segurança Bancária:** Auditoria imutável com logs de todas as ações sensíveis, visualização de senhas sob demanda com registro de rastro, política de senhas fortes, proteção contra inatividade de 30 minutos com carimbo de relógio real (*wall-clock*), e isolamento de dados via Row Level Security (RLS).

---

## 2. Stack Tecnológica e Arquitetura

- **Framework Web:** Next.js 14+ (App Router, Server Components e Client Components com `'use client'`).
- **Linguagem:** JavaScript moderno (ES6+, JSX).
- **Estilização:** Tailwind CSS com suporte completo a tema escuro/claro nativo (`dark:bg-black`, `dark:text-white`).
- **Motion Design:** Framer Motion com orquestração de molas físicas (*physics-based springs*).
- **Banco de Dados & Autenticação:** Supabase PostgreSQL com Row Level Security (RLS), Supabase Auth (JWT) e Supabase Realtime Channels.
- **Áudio Nativo:** Web Audio API (`AudioContext`) para sintetização de timbres em tempo real (zero latência e sem carregar arquivos MP3/WAV externos).
- **Criptografia & Segurança:** Web Crypto API (`crypto.subtle` com SHA-256 e PBKDF2).

---

## 3. Estrutura do Banco de Dados (Supabase PostgreSQL)

### 3.1 Tabela `public.empresas`
Armazena as empresas clientes atendidas pela RM.
| Coluna | Tipo | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único da empresa |
| `nome` | `TEXT` | `NOT NULL UNIQUE` | Razão social ou nome fantasia |
| `formato_atendimento` | `TEXT` | `NOT NULL DEFAULT 'colaborativo' CHECK ('colaborativo', 'individual')` | Formato da fila de atendimento |
| `servidor_alocado` | `TEXT` | `NOT NULL DEFAULT 'servidor_1' CHECK ('servidor_1', 'servidor_2')` | Servidor onde a instância do cliente está hospedada |
| `ativo` | `BOOLEAN` | `NOT NULL DEFAULT true` | Status da conta da empresa |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Data e hora de criação |
| `updated_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Data da última alteração |

### 3.2 Tabela `public.colaboradores_empresas`
Colaboradores vinculados às empresas clientes para abertura de demandas e suporte.
| Coluna | Tipo | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único do colaborador |
| `empresa_id` | `UUID` | `NOT NULL REFERENCES empresas(id) ON DELETE CASCADE` | Vínculo com a empresa |
| `nome` | `TEXT` | `NOT NULL` | Nome completo do solicitante |
| `cargo` | `TEXT` | `NULL` | Cargo ou função na empresa |
| `email` | `TEXT` | `NULL` | E-mail corporativo de contato |
| `telefone` | `TEXT` | `NULL` | WhatsApp / Telefone com DDD |
| `ativo` | `BOOLEAN` | `NOT NULL DEFAULT true` | Status ativo/inativo |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Registro de cadastro |

### 3.3 Tabela `public.suporte_chamados`
Fila operacional ao vivo e histórico de atendimentos prestados.
| Coluna | Tipo | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador único do chamado |
| `empresa_id` | `UUID` | `NOT NULL REFERENCES empresas(id) ON DELETE CASCADE` | Empresa cliente |
| `empresa_nome` | `TEXT` | `NOT NULL` | Nome desnormalizado da empresa |
| `tecnico_email` | `TEXT` | `NOT NULL` | E-mail do operador responsável |
| `atendente` | `TEXT` | `NULL` | Nome de exibição do técnico |
| `colaborador_solicitante` | `TEXT` | `NULL` | Nome do colaborador solicitante |
| `status` | `TEXT` | `NOT NULL DEFAULT 'aguardando_visualizacao' CHECK (status IN ('aguardando_visualizacao', 'em_andamento', 'finalizado', 'cancelado', 'pendente'))` | Estado do chamado |
| `iniciado_em` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Momento do início do chamado |
| `finalizado_em` | `TIMESTAMPTZ` | `NULL` | Momento da conclusão |
| `duracao_segundos` | `INT` | `DEFAULT 0` | Duração ativa do atendimento |
| `motivo` | `TEXT` | `NULL` | Categorias / Motivos do chamado (ex: "Suporte, Financeiro") |
| `observacoes` | `TEXT` | `NULL` | Anotações técnicas e resolução |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Registro do chamado |

### 3.4 Tabela `public.equipe_usuarios`
Colaboradores internos da RM com papéis e controle de primeiro acesso.
| Coluna | Tipo | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador do usuário |
| `nome` | `TEXT` | `NOT NULL` | Nome completo do operador |
| `email` | `TEXT` | `NOT NULL UNIQUE` | E-mail de login corporativo |
| `senha` | `TEXT` | `NOT NULL` | Hash da senha pessoal |
| `papel` | `TEXT` | `NOT NULL DEFAULT 'suporte' CHECK (papel IN ('administrador', 'suporte', 'vendas'))` | Nível hierárquico de permissão |
| `ativo` | `BOOLEAN` | `NOT NULL DEFAULT true` | Se o usuário pode logar |
| `primeiro_acesso_concluido` | `BOOLEAN` | `NOT NULL DEFAULT false` | Flag do Onboarding Apple |
| `primeiro_acesso_data` | `TIMESTAMPTZ` | `NULL` | Data de conclusão do setup inicial |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Data de admissão/cadastro |

### 3.6 Tabela  (Controle de Qualidade & Bugs)
| Coluna | Tipo | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| uid=501(lucasamorim) gid=20(staff) groups=20(staff),12(everyone),61(localaccounts),79(_appserverusr),80(admin),81(_appserveradm),33(_appstore),98(_lpadmin),100(_lpoperator),204(_developer),250(_analyticsusers),395(com.apple.access_ftp),398(com.apple.access_screensharing),399(com.apple.access_ssh),400(com.apple.access_remote_ae),701(com.apple.sharepoint.group.1) |  |  | Identificador do relato |
|  |  |  | Resumo da falha ou sugestão |
|  |  |  | Detalhes do erro e passos para reprodução |
|  |  |  | Empresa ou contexto afetado |
|  |  |  | Classificação (, , , ) |
|  |  |  | Nível de severidade (, , ) |
|  |  |  | Base64 compactado (< 150KB) com print anexado |
|  |  |  | Operador que abriu o reporte |
|  |  |  | Status (, , ) |
|  |  |  | Carimbo de registro |

### 3.5 Tabela `public.auditoria_logs` (Imutável - Art. 37 LGPD)
| Coluna | Tipo | Modificadores | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `UUID` | `PRIMARY KEY DEFAULT gen_random_uuid()` | Identificador do evento |
| `empresa_id` | `TEXT` | `NULL` | Empresa relacionada (se aplicável) |
| `usuario_email` | `TEXT` | `NOT NULL` | Quem realizou a ação |
| `acao` | `TEXT` | `NOT NULL` | Identificador do evento (ex: `visualizou_credencial`) |
| `detalhes` | `JSONB` | `NULL` | Metadados do evento (sem dados sensíveis em texto puro) |
| `created_at` | `TIMESTAMPTZ` | `NOT NULL DEFAULT now()` | Carimbo do evento |

---

## 4. Controle de Acesso Baseado em Papéis (RBAC)

O sistema possui 3 níveis de acesso estritos:

1. **`administrador`:**
   - **Membros Natos:** Lucas Amorim (`admin@rmcontrole.com` e `lucas.rmchat@gmail.com`) ou qualquer usuário com `admin` ou `lucas` no e-mail.
   - **Abas Permitidas:** Todas (`empresas`, `fila`, `dashboard`, `configuracoes`, `canais`, `servidores`, `auditoria`).
   - **Poderes Exclusivos:** Gestão de membros da equipe, remoção de empresas, gestão de infraestrutura de servidores, configuração de canais e visualização de logs completos de auditoria LGPD.

2. **`suporte`:**
   - **Abas Permitidas:** `empresas`, `fila`, `dashboard`, `configuracoes`.
   - **Configurações Gerais Acessíveis:** Somente **Configurações Básicas** (Visualização do Sistema, Alertas Sonoros, Categorias de Demandas e Regras de Atendimento). As abas avançadas (*Canais, Servidores e Auditoria*) exibem aviso elegante de acesso restrito ao administrador.
   - **Ações:** Atendimento de chamados, abertura de demandas na fila, visualização de checklist de servidores e credenciais mascaradas.

3. **`vendas`:**
   - **Abas Permitidas:** `empresas`, `fila`, `dashboard`, `configuracoes`.
   - **Foco:** Prospecção, acompanhamento de contratos, empresas ativas e histórico comercial.

---

## 5. Diretrizes de Design System (Apple & Vercel Design Language)

O RM Controle segue a linguagem de design minimalista, funcional e de alto contraste inspirada no macOS Sonoma/Sequoia e na Vercel:

1. **Paleta de Cores & Contraste:**
   - **Modo Claro:** Fundo neutro suave (`bg-[#f4f4f6]` e `bg-[#f5f5f7]`), cartões e modais em branco gelo com opacidade translúcida (`bg-white/95`), texto primário `#1d1d1f`, texto secundário `#6e6e73`.
   - **Modo Escuro:** Fundo preto absoluto OLED (`bg-[#000000]`), cartões translúcidos escuros (`bg-[#121216]/95` e `bg-[#16161a]`), texto primário `#ffffff`, texto secundário `#a1a1a6`.
   - **Cor de Acento (Verde RM):** `#4d7c0f` no modo claro e `#84cc16` no modo escuro, conferindo alta legibilidade e contraste adequado para botões primários, badges de destaque e switches ativos.
2. **Materiais e Bordas:**
   - Efeito de vidro jateado fosco com `backdrop-blur-3xl` e `backdrop-blur-xl`.
   - Bordas ultrafinas de precisão: `border border-black/[0.06] dark:border-white/[0.08]` no conteúdo e `border-black/12 dark:border-white/15` nos cartões principais.
   - Cantos arredondados generosos: `rounded-3xl` para cartões e `rounded-full` para botões e pílulas.
3. **Tipografia:**
   - Escala San Francisco: Títulos em negrito com tracking reduzido (`tracking-tight`), corpo em `text-xs` e `text-sm` com entrelinha arejada.
   - Família monoespaçada (`font-mono`) com `tabular-nums` obrigatória para cronômetros, identificadores de instância, IPs, e-mails e valores estatísticos para evitar oscilações de layout.
4. **Densidade de Informação (Alternador de Layout):**
   - **Cards / Grade:** Layout visual e acolhedor com cartões independentes e destaques de métricas.
   - **Lista / Tabela:** Layout tabular de alta densidade, ideal para operadores de suporte com muitas empresas e chamados simultâneos.

---

## 6. Normas de Motion Design e Orquestração de Animações

1. **Curvas Físicas Apple (Spring Physics):**
   - NUNCA utilize transições lineares ou easing mecânico desprovido de inércia.
   - Use molas amortecidas: `transition: { type: 'spring', damping: 28, stiffness: 260 }`.
2. **Orquestração Hierárquica (Staggering):**
   - Transições de entrada de páginas e modais devem acionar animações em cascata nos elementos filhos (escalonamento de 40ms a 80ms).
3. **Micro-interações Táteis:**
   - Botões com `whileHover={{ scale: 1.02 }}` e `whileTap={{ scale: 0.98 }}`.
4. **Performance 60fps/120fps:**
   - Animar estritamente propriedades processadas na GPU (`transform` e `opacity`).
   - Evitar animar `height`, `width` ou `margin` diretamente; usar `layout` do Framer Motion com `AnimatePresence mode="wait"`.

---

## 7. Fila de Demandas em Tempo Real & Sistema de Áudio

### 7.1 Dois Cronômetros Simultâneos
- **Cronômetro 1 — Tempo de Espera (TME):** Mede o tempo desde a abertura do chamado até o momento em que um técnico assume o atendimento. Alerta visual em tom âmbar.
- **Cronômetro 2 — Tempo Ativo (TMA):** Disparado assim que o técnico clica em *Assumir* ou abre o chamado em atendimento direto. Alerta visual em tom verde esmeralda pulsante.

### 7.2 Sincronização em Tempo Real (Supabase Realtime)
- A fila assina o canal `suporte_chamados_fila_realtime` da tabela `public.suporte_chamados`.
- Qualquer ação executada em qualquer navegador (novo chamado, assumir, finalizar ou cancelar) é transmitida via WebSocket para todas as telas abertas em milissegundos.
- Um fallback suave de polling a cada 8 segundos é acionado exclusivamente quando a aba está visível (`!document.hidden`).

### 7.3 Alertas Sonoros com Síntese Nativa
- Criado via Web Audio API (`AudioContext`) sem carregar arquivos MP3 ou WAV externos.
- 4 Timbres disponíveis:
  1. **Harmônico Apple:** Acorde límpido arpejado em Dó Maior.
  2. **Alerta Dinâmico:** Bip duplo estilo sonar/radar de alta frequência.
  3. **Sino Suave / Marimba:** Timbre acolhedor e relaxante.
  4. **Incisivo / Alerta Urgente:** Frequência de atenção imediata para triagens críticas.
- Modos de Repetição: *Uma vez*, *Intermitente (loop sem pausas até assumir o chamado)* e *Por Intervalo (slider configurável de 5s a 120s)*.

---

## 8. Regras de Ouro para a Inteligência Artificial (AI Grounding Rules)

Quando um agente de IA estiver trabalhando neste projeto, ele **DEVE SEGUIR RIGOROSAMENTE** as seguintes regras:

1. **NUNCA Sobrescrever Dados Reais com Mocks:** Dados simulados (*MOCK*) existem estritamente para demonstração e homologação. Se o Supabase estiver configurado e retornar dados vazios ou houver erro em uma consulta, a IA **NUNCA deve apagar ou substituir silenciosamente** as entidades do usuário no `localStorage`.
2. **NUNCA Rebaixar o Administrador:** O usuário `Lucas Amorim` (`admin@rmcontrole.com` e `lucas.rmchat@gmail.com`) e qualquer e-mail com `admin` ou `lucas` **deve sempre retornar `administrador`** na função `resolveUserRole`.
3. **Respeitar os Nomes Exatos das Colunas no Supabase:**
   - A tabela `equipe_usuarios` utiliza `created_at` (não ordene por `criado_em`).
   - A tabela `suporte_chamados` utiliza `iniciado_em`, `finalizado_em`, `duracao_segundos`, `motivo`, `observacoes` e `status IN ('aguardando_visualizacao', 'em_andamento', 'finalizado', 'cancelado', 'pendente')`.
4. **Preservar a LGPD e Proteção de Dados:**
   - Senhas de clientes em `empresa_credenciais` nunca devem ser renderizadas em texto puro por padrão; devem estar mascaradas com `••••••••` e sua revelação deve disparar um log em `auditoria_logs`.
   - O timer de inatividade de 30 minutos deve sempre utilizar carimbos de data/hora reais do sistema (*wall-clock timestamp*) para que o tempo seja computado mesmo se a máquina for suspensa ou a aba colocada em segundo plano.
5. **Preservar a Hierarquia Visual Apple:**
   - Manter os botões e formulários com alto contraste, cantos arredondados suaves, espaçamentos generosos e feedbacks de estado (*hover*, *active*, *disabled*).
   - Não inventar dependências pesadas de bibliotecas de componentes externas (como Ant Design ou Material UI). Todo o design é customizado em Tailwind CSS e Framer Motion.
