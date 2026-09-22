'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  getServerChecklistTemplate, 
  addServerChecklistTemplateItem, 
  removeServerChecklistTemplateItem, 
  isMockDataEnabled,
  getEquipeUsuarios,
  addEquipeUsuario,
  deleteEquipeUsuario,
  getCurrentUserRole,
  setCurrentUserRole,
  PERMISSOES_PADRAO,
  getSenhaPadraoRedefinicao,
  setSenhaPadraoRedefinicao,
  getConfiguracoesSuporte,
  setConfiguracoesSuporte,
  getMotivosSuporte,
  addMotivoSuporte,
  removeMotivoSuporte,
  updateEquipeUsuario
} from '@/lib/storage';
import { 
  EyeIcon, 
  EyeOffIcon, 
  SparklesIcon, 
  SaveIcon, 
  CopyIcon, 
  TrashIcon, 
  CheckIcon, 
  WrenchIcon, 
  BriefcaseIcon, 
  CrownIcon, 
  ShieldCheckIcon, 
  ServerIcon, 
  UsersIcon,
  XMarkIcon,
  EditIcon
} from './Icons';
import { generateSecurePassword } from '@/lib/security';

export default function ServerConfigView() {
  const [subTab, setSubTab] = useState('checklist'); // 'checklist' | 'usuarios' | 'motivos' | 'geral' | 'formatos'
  
  // Checklist Template
  const [checklistItems, setChecklistItems] = useState([]);
  const [novoTitulo, setNovoTitulo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novaCategoria, setNovaCategoria] = useState('Infraestrutura');
  const [novoObrigatorio, setNovoObrigatorio] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Usuários e Permissões
  const [equipe, setEquipe] = useState([]);
  const [novoUsuarioNome, setNovoUsuarioNome] = useState('');
  const [novoUsuarioEmail, setNovoUsuarioEmail] = useState('');
  const [novoUsuarioSenha, setNovoUsuarioSenha] = useState('');
  const [novoUsuarioPapel, setNovoUsuarioPapel] = useState('suporte');
  const [userRole, setUserRole] = useState('administrador');

  // Modal de Edição de Membro
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPapel, setEditPapel] = useState('suporte');
  const [editSenha, setEditSenha] = useState('');

  // Motivos de Atendimento / Suporte
  const [motivosList, setMotivosList] = useState([]);
  const [novoMotivoNome, setNovoMotivoNome] = useState('');
  const [novoMotivoDesc, setNovoMotivoDesc] = useState('');

  // Configurações Gerais: Senha Padrão & Regras de Suporte
  const [senhaPadrao, setSenhaPadrao] = useState('');
  const [senhaPadraoSalva, setSenhaPadraoSalva] = useState(false);
  const [configSuporte, setConfigSuporte] = useState({
    motivo_obrigatorio: true,
    solucao_obrigatoria: false,
    colaborador_obrigatorio: false,
    atendente_obrigatorio: false,
  });

  const recarregar = () => {
    setChecklistItems(getServerChecklistTemplate());
    setEquipe(getEquipeUsuarios());
    setUserRole(getCurrentUserRole());
    setSenhaPadrao(getSenhaPadraoRedefinicao());
    setConfigSuporte(getConfiguracoesSuporte());
    setMotivosList(getMotivosSuporte());
  };

  useEffect(() => {
    recarregar();
  }, []);

  const showFeedbackMsg = (msg) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3500);
  };

  // Salvar Novo Requisito no Checklist Global
  const handleSalvarItemChecklist = (e) => {
    e.preventDefault();
    if (!novoTitulo.trim()) return;

    try {
      addServerChecklistTemplateItem({
        titulo: novoTitulo,
        descricao: novaDescricao,
        categoria: novaCategoria,
        obrigatorio: novoObrigatorio,
      });

      setNovoTitulo('');
      setNovaDescricao('');
      showFeedbackMsg('Requisito adicionado com sucesso ao modelo de servidores.');
      setChecklistItems(getServerChecklistTemplate());
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoverItemChecklist = (itemId) => {
    if (confirm('Deseja remover este requisito do modelo global de servidores?')) {
      removeServerChecklistTemplateItem(itemId);
      setChecklistItems(getServerChecklistTemplate());
      showFeedbackMsg('Requisito removido do modelo global.');
    }
  };

  // Cadastrar Novo Usuário da Equipe
  const handleCadastrarUsuario = (e) => {
    e.preventDefault();
    if (!novoUsuarioNome.trim() || !novoUsuarioEmail.trim()) return;

    try {
      addEquipeUsuario({
        nome: novoUsuarioNome,
        email: novoUsuarioEmail,
        senha: novoUsuarioSenha || senhaPadrao,
        papel: novoUsuarioPapel,
      });

      setNovoUsuarioNome('');
      setNovoUsuarioEmail('');
      setNovoUsuarioSenha('');
      showFeedbackMsg(`Membro ${novoUsuarioNome} cadastrado com sucesso.`);
      setEquipe(getEquipeUsuarios());
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExcluirUsuario = (usuarioId) => {
    if (confirm('Deseja remover este membro da equipe?')) {
      deleteEquipeUsuario(usuarioId);
      setEquipe(getEquipeUsuarios());
      showFeedbackMsg('Membro removido da equipe.');
    }
  };

  const handleAbrirEdicao = (u) => {
    setUsuarioEditando(u);
    setEditNome(u.nome || '');
    setEditEmail(u.email || '');
    setEditPapel(u.papel || 'suporte');
    setEditSenha('');
  };

  const handleSalvarEdicao = (e) => {
    e.preventDefault();
    if (!usuarioEditando) return;
    if (!editNome.trim() || !editEmail.trim()) {
      alert('Nome e e-mail são obrigatórios.');
      return;
    }

    try {
      updateEquipeUsuario(usuarioEditando.id, {
        nome: editNome.trim(),
        email: editEmail.trim(),
        papel: editPapel,
        senha: editSenha.trim() || undefined,
      });

      showFeedbackMsg(`Perfil de ${editNome} atualizado com sucesso.`);
      setUsuarioEditando(null);
      setEquipe(getEquipeUsuarios());
    } catch (err) {
      alert(err.message);
    }
  };

  // Gerenciamento de Motivos de Chamado
  const handleCriarMotivo = (e) => {
    e.preventDefault();
    if (!novoMotivoNome.trim()) return;

    try {
      addMotivoSuporte({
        nome: novoMotivoNome,
        descricao: novoMotivoDesc,
      });
      setNovoMotivoNome('');
      setNovoMotivoDesc('');
      setMotivosList(getMotivosSuporte());
      showFeedbackMsg('Motivo de atendimento cadastrado com sucesso.');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoverMotivo = (id) => {
    if (confirm('Deseja remover este motivo do catálogo?')) {
      removeMotivoSuporte(id);
      setMotivosList(getMotivosSuporte());
      showFeedbackMsg('Motivo de atendimento removido.');
    }
  };

  // Salvar Senha Padrão
  const handleSalvarSenhaPadrao = (e) => {
    e.preventDefault();
    if (!senhaPadrao.trim()) return;
    setSenhaPadraoRedefinicao(senhaPadrao);
    setSenhaPadraoSalva(true);
    showFeedbackMsg('Senha padrão de contingência atualizada.');
    setTimeout(() => setSenhaPadraoSalva(false), 2500);
  };

  // Alterar Regras de Obrigatoriedade de Suporte
  const handleToggleRegraSuporte = (campo) => {
    const atualizado = setConfiguracoesSuporte({
      [campo]: !configSuporte[campo],
    });
    setConfigSuporte(atualizado);
    showFeedbackMsg('Regras de encerramento de suporte salvas.');
  };

  const mockAtivo = isMockDataEnabled();

  const categoriasChecklist = [
    'Infraestrutura',
    'Rede & SSL',
    'Aplicação',
    'Canais',
    'Suporte',
    'Segurança & Backup'
  ];

  if (userRole !== 'administrador') {
    return (
      <div className="rounded-3xl p-12 border border-black/[0.06] dark:border-white/[0.08] bg-white/80 dark:bg-[#16161a]/85 backdrop-blur-xl text-center space-y-3 shadow-sm">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <ShieldCheckIcon className="w-6 h-6" />
        </div>
        <h3 className="text-base font-bold text-[#1d1d1f] dark:text-white">Acesso Restrito ao Administrador</h3>
        <p className="text-xs text-slate-500 dark:text-zinc-400 max-w-md mx-auto">
          As configurações de Servidor e Infraestrutura do RM Controle são exclusivas para o Administrador Geral. Membros de Suporte e Vendas possuem foco operacional na gestão e atendimento das empresas clientes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
            Configurações do Sistema & Servidores
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Gerencie o checklist técnico de servidores, membros da equipe, catálogo de motivos e senhas de contingência.
          </p>
        </div>
      </div>

      {feedback && (
        <motion.div 
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold shadow-xs flex items-center gap-2"
        >
          <CheckIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{feedback}</span>
        </motion.div>
      )}

      {/* Sub-Abas em Apple Segmented Bar */}
      <div className="flex border-b border-black/[0.06] dark:border-white/[0.08] gap-1.5 overflow-x-auto pb-1">
        {[
          { id: 'checklist', label: 'Checklist de Requisitos', count: checklistItems.length },
          { id: 'usuarios', label: 'Equipe & Senhas', count: equipe.length },
          { id: 'motivos', label: 'Motivos de Atendimento', count: motivosList.length },
          { id: 'geral', label: 'Regras de Suporte & Senha Padrão' },
          { id: 'formatos', label: 'Formatos de Conversa' },
        ].map((tab) => {
          const isActive = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id)}
              className={`py-2.5 px-3.5 text-xs font-semibold rounded-2xl transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
                isActive
                  ? 'bg-black text-white dark:bg-white dark:text-black shadow-xs font-bold'
                  : 'text-slate-500 dark:text-zinc-400 hover:text-black dark:hover:text-white hover:bg-black/[0.03] dark:hover:bg-white/[0.05]'
              }`}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                  isActive
                    ? 'bg-white/20 text-white dark:bg-black/20 dark:text-black'
                    : 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-400'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ============================================================================== */}
      {/* SUB-ABA 1: CHECKLIST DE SERVIDORES CONFIGURÁVEL */}
      {/* ============================================================================== */}
      {subTab === 'checklist' && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="p-4 rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-black/[0.02] dark:bg-white/[0.03] text-xs text-slate-600 dark:text-zinc-400 flex items-start justify-between gap-4">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block mb-0.5">
                {mockAtivo ? 'Modo de Homologação (Mock Ativo)' : 'Modo de Produção Limpo'}
              </span>
              <p className="text-[11px] leading-relaxed">
                {mockAtivo 
                  ? 'Requisitos de exemplo estão ativos para demonstração. Todo novo requisito adicionado aqui será automaticamente propagado às novas empresas.' 
                  : 'Nenhum checklist fixo padrão é injetado. Todo novo requisito adicionado abaixo se tornará o modelo oficial de implantação de servidores.'}
              </p>
            </div>
          </div>

          {/* Formulário Estilo Apple para Cadastrar Novo Requisito */}
          <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Cadastrar Novo Requisito para o Checklist de Servidores
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina o nome, categoria técnica e orientações operacionais do checklist.
              </p>
            </div>

            <form onSubmit={handleSalvarItemChecklist} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
                <div className="sm:col-span-7 space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Título do Requisito <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoTitulo}
                    onChange={(e) => setNovoTitulo(e.target.value)}
                    placeholder="Ex: Instalação e Pareamento da Evolution API"
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white placeholder-slate-400 font-medium"
                  />
                </div>

                <div className="sm:col-span-5 space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Categoria Técnica
                  </label>
                  <select
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium cursor-pointer"
                  >
                    {categoriasChecklist.map((cat) => (
                      <option key={cat} value={cat} className="dark:bg-zinc-900">{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                  Instruções Técnicas ou Descrição (Opcional)
                </label>
                <input
                  type="text"
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  placeholder="Ex: Portas liberadas: 80, 443, 3000 / Chave SSH cadastrada / Certificado SSL emitido"
                  className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white placeholder-slate-400"
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={novoObrigatorio}
                    onChange={(e) => setNovoObrigatorio(e.target.checked)}
                    className="w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16] rounded cursor-pointer"
                  />
                  <span className="font-semibold">Requisito Obrigatório para Ativação do Servidor</span>
                </label>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>+ Adicionar ao Modelo de Checklist</span>
                </button>
              </div>
            </form>
          </div>

          {/* Lista de Requisitos Atuais */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 pl-1">
              Itens do Checklist Global ({checklistItems.length})
            </h3>

            {checklistItems.length === 0 ? (
              <div className="rounded-3xl p-10 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] text-center text-xs text-slate-500">
                Nenhum requisito cadastrado no checklist. Adicione o primeiro no formulário acima.
              </div>
            ) : (
              <div className="space-y-2.5">
                {checklistItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="rounded-2xl p-4 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] flex items-center justify-between gap-3 shadow-xs hover:shadow-apple-hover transition-all"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] font-mono text-xs font-bold flex items-center justify-center text-slate-700 dark:text-zinc-300 mt-0.5 flex-shrink-0">
                        {idx + 1}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                            {item.titulo}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-zinc-300 font-semibold uppercase font-mono">
                            {item.categoria}
                          </span>
                          {item.obrigatorio && (
                            <span className="text-[9px] uppercase font-bold px-1.5 py-0.2 rounded-full bg-red-500/10 text-red-700 dark:text-red-400 border border-red-500/20">
                              Obrigatório
                            </span>
                          )}
                          {item.id.includes('mock') && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                              Exemplo Mock
                            </span>
                          )}
                        </div>

                        {item.descricao && (
                          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5 truncate">
                            {item.descricao}
                          </p>
                        )}
                      </div>
                    </div>

                    {!item.id.includes('mock') && (
                      <button
                        onClick={() => handleRemoverItemChecklist(item.id)}
                        className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors flex-shrink-0 cursor-pointer"
                        title="Remover requisito"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 2: USUÁRIOS DA EQUIPE & SENHAS */}
      {/* ============================================================================== */}
      {subTab === 'usuarios' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Cadastro de Novo Usuário na Equipe */}
          <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Cadastrar Novo Membro da Equipe com Senha
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Crie acessos para operadores de suporte, consultores de vendas ou administradores gerais.
              </p>
            </div>

            <form onSubmit={handleCadastrarUsuario} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Nome Completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoUsuarioNome}
                    onChange={(e) => setNovoUsuarioNome(e.target.value)}
                    placeholder="Ex: Tiago da Silva"
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    E-mail de Acesso <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={novoUsuarioEmail}
                    onChange={(e) => setNovoUsuarioEmail(e.target.value)}
                    placeholder="tiago@rmcontrole.com"
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between pl-1">
                    <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                      Senha Inicial
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setNovoUsuarioSenha(generateSecurePassword(14))}
                        className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <SparklesIcon className="w-3 h-3" />
                        <span>Gerar Segura</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setNovoUsuarioSenha(senhaPadrao)}
                        className="text-[10px] text-slate-500 hover:text-black dark:hover:text-white font-semibold hover:underline cursor-pointer"
                      >
                        Usar Padrão
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    value={novoUsuarioSenha}
                    onChange={(e) => setNovoUsuarioSenha(e.target.value)}
                    placeholder={senhaPadrao || 'Digite ou gere a senha'}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none text-[#1d1d1f] dark:text-white"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Papel / Permissões de Abas <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={novoUsuarioPapel}
                    onChange={(e) => setNovoUsuarioPapel(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium cursor-pointer"
                  >
                    <option value="suporte" className="dark:bg-zinc-900">Suporte Técnico (Acesso a Empresas, Atendimento & Dashboard)</option>
                    <option value="vendas" className="dark:bg-zinc-900">Comercial & Vendas (Acesso a Empresas & Dashboard)</option>
                    <option value="administrador" className="dark:bg-zinc-900">Administrador Geral (Acesso Total: Servidores, Equipe e Auditoria)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-full shadow-sm hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>+ Cadastrar Membro da Equipe</span>
                </button>
              </div>
            </form>
          </div>

          {/* Lista de Membros da Equipe */}
          <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
            <div className="p-5 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span>Membros Cadastrados ({equipe.length})</span>
              <span className="text-[10px] text-slate-400 font-mono">Gestão de acessos, papéis e permissões da equipe</span>
            </div>

            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {equipe.map((u) => {
                return (
                  <div key={u.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-[#4d7c0f]/15 to-[#84cc16]/20 text-[#4d7c0f] dark:text-[#84cc16] font-bold text-xs flex items-center justify-center border border-[#4d7c0f]/20 flex-shrink-0">
                        {u.nome.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-[#1d1d1f] dark:text-white">{u.nome}</span>
                          <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            u.papel === 'administrador'
                              ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-500/20'
                              : u.papel === 'suporte'
                              ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border border-blue-500/20'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                          }`}>
                            {u.papel === 'administrador' && <CrownIcon className="w-3 h-3" />}
                            {u.papel === 'suporte' && <WrenchIcon className="w-3 h-3" />}
                            {u.papel === 'vendas' && <BriefcaseIcon className="w-3 h-3" />}
                            <span>{u.papel}</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-zinc-400 font-mono mt-0.5">{u.email}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleAbrirEdicao(u)}
                        className="px-3 py-1.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.06] hover:bg-black/[0.08] dark:hover:bg-white/[0.1] text-[#1d1d1f] dark:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                        title="Editar perfil e permissões"
                      >
                        <EditIcon className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-400" />
                        <span>Editar</span>
                      </button>

                      {u.email !== 'admin@rmcontrole.com' && (
                        <button
                          type="button"
                          onClick={() => handleExcluirUsuario(u.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded-xl hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remover membro"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Apple de Edição do Perfil de Membro */}
          <AnimatePresence>
            {usuarioEditando && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 10 }}
                  transition={{ duration: 0.2 }}
                  className="w-full max-w-md rounded-3xl bg-white dark:bg-[#16161a] border border-black/[0.08] dark:border-white/[0.1] p-6 sm:p-7 shadow-2xl space-y-5"
                >
                  <div className="flex items-center justify-between border-b border-black/[0.06] dark:border-white/[0.08] pb-3.5">
                    <div>
                      <h3 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
                        Editar Perfil do Membro
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
                        Altere nome, e-mail, papel de acesso ou redefina a senha.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setUsuarioEditando(null)}
                      className="p-1 text-slate-400 hover:text-black dark:hover:text-white rounded-full cursor-pointer"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>

                  <form onSubmit={handleSalvarEdicao} className="space-y-4">
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                        Nome Completo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={editNome}
                        onChange={(e) => setEditNome(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                        E-mail de Acesso <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                        Papel / Permissões de Acesso <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={editPapel}
                        onChange={(e) => setEditPapel(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium cursor-pointer"
                      >
                        <option value="suporte" className="dark:bg-zinc-900">Suporte Técnico (Acesso a Empresas, Atendimento & Dashboard)</option>
                        <option value="vendas" className="dark:bg-zinc-900">Comercial & Vendas (Acesso a Empresas & Dashboard)</option>
                        <option value="administrador" className="dark:bg-zinc-900">Administrador Geral (Acesso Total: Servidores, Equipe e Auditoria)</option>
                      </select>
                    </div>

                    <div className="space-y-1 pt-1">
                      <div className="flex items-center justify-between pl-1">
                        <label className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                          Redefinir Senha de Acesso (Opcional)
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditSenha(generateSecurePassword(14))}
                          className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <SparklesIcon className="w-3 h-3" />
                          <span>Gerar Nova Senha</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editSenha}
                        onChange={(e) => setEditSenha(e.target.value)}
                        placeholder="Deixe em branco para manter a senha atual do membro"
                        className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none text-[#1d1d1f] dark:text-white"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-black/[0.06] dark:border-white/[0.08]">
                      <button
                        type="button"
                        onClick={() => setUsuarioEditando(null)}
                        className="px-4 py-2 rounded-full text-xs font-semibold text-slate-600 dark:text-zinc-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer transition-all"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-full shadow-sm hover:opacity-90 cursor-pointer"
                      >
                        Salvar Alterações
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

        </div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 3: MOTIVOS DE ATENDIMENTO & SUPORTE (MIGRADO DO DASHBOARD) */}
      {/* ============================================================================== */}
      {subTab === 'motivos' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Cadastro de Novo Motivo */}
          <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Cadastrar Novo Motivo de Atendimento
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure as categorias e motivos que os técnicos selecionam ao concluir um chamado.
              </p>
            </div>

            <form onSubmit={handleCriarMotivo} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Nome do Motivo de Suporte <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoMotivoNome}
                    onChange={(e) => setNovoMotivoNome(e.target.value)}
                    placeholder="Ex: Desconexão de Instância / QR Code"
                    required
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 pl-1">
                    Descrição Técnica (Opcional)
                  </label>
                  <input
                    type="text"
                    value={novoMotivoDesc}
                    onChange={(e) => setNovoMotivoDesc(e.target.value)}
                    placeholder="Ex: Instância caiu e precisou de reconexão manual"
                    className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                >
                  <span>+ Cadastrar Motivo no Catálogo</span>
                </button>
              </div>
            </form>
          </div>

          {/* Lista de Motivos Ativos */}
          <div className="rounded-3xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] overflow-hidden shadow-sm">
            <div className="p-5 border-b border-black/[0.05] dark:border-white/[0.06] flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span>Motivos Ativos no Sistema ({motivosList.length})</span>
              <span className="text-[10px] text-slate-400 font-mono">Utilizados no encerramento de chamados</span>
            </div>

            <div className="divide-y divide-black/[0.04] dark:divide-white/[0.05]">
              {motivosList.map((m) => (
                <div key={m.id} className="p-4 sm:p-5 flex items-center justify-between gap-3 hover:bg-black/[0.015] dark:hover:bg-white/[0.02] transition-colors">
                  <div>
                    <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                      {m.nome}
                    </h4>
                    {m.descricao && (
                      <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                        {m.descricao}
                      </p>
                    )}
                  </div>

                  {!['mot_1', 'mot_2', 'mot_3', 'mot_4'].includes(m.id) && (
                    <button
                      onClick={() => handleRemoverMotivo(m.id)}
                      className="p-2 text-slate-400 hover:text-red-500 rounded-full hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Remover motivo"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 4: CONFIGURAÇÕES GERAIS, REGRAS DE SUPORTE & SENHA PADRÃO */}
      {/* ============================================================================== */}
      {subTab === 'geral' && (
        <div className="space-y-6 animate-fade-in">
          
          {/* Senha Padrão de Contingência */}
          <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Senha Padrão de Contingência
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Utilizada para redefinir credenciais de novos membros ou de empresas quando não especificada.
              </p>
            </div>

            <form onSubmit={handleSalvarSenhaPadrao} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input
                type="text"
                value={senhaPadrao}
                onChange={(e) => setSenhaPadrao(e.target.value)}
                placeholder="Ex: RmSuporte@Padrao2026!"
                required
                className="flex-1 px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs font-mono focus:outline-none text-[#1d1d1f] dark:text-white"
              />

              <button
                type="button"
                onClick={() => setSenhaPadrao(generateSecurePassword(14))}
                className="px-4 py-2.5 rounded-full border border-black/10 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/5 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <SparklesIcon className="w-3.5 h-3.5" />
                <span>Gerar Nova</span>
              </button>

              <button
                type="submit"
                className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <SaveIcon className="w-3.5 h-3.5" />
                <span>{senhaPadraoSalva ? 'Salvo!' : 'Salvar Senha Padrão'}</span>
              </button>
            </form>
          </div>

          {/* Regras Obrigatórias para Conclusão de Chamados */}
          <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Regras de Encerramento de Chamado
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Defina quais campos são estritamente obrigatórios quando um técnico for concluir o suporte.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {[
                { chave: 'motivo_obrigatorio', label: 'Motivo do Chamado', desc: 'Exige que o técnico selecione um motivo cadastrado' },
                { chave: 'solucao_obrigatoria', label: 'Resumo da Solução Aplicada', desc: 'Exige que o técnico descreva o que foi feito no atendimento' },
                { chave: 'colaborador_obrigatorio', label: 'Colaborador Solicitante', desc: 'Exige o nome ou e-mail de quem pediu o suporte' },
                { chave: 'atendente_obrigatorio', label: 'Identificação do Atendente', desc: 'Exige a confirmação de qual técnico encerrou o ticket' },
              ].map((item) => (
                <div
                  key={item.chave}
                  onClick={() => handleToggleRegraSuporte(item.chave)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    configSuporte[item.chave]
                      ? 'border-[#4d7c0f]/30 bg-[#4d7c0f]/5 dark:bg-[#84cc16]/5 shadow-xs'
                      : 'border-black/[0.06] dark:border-white/[0.08] bg-black/[0.01] dark:bg-white/[0.02] opacity-70'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold text-[#1d1d1f] dark:text-white">
                      {item.label}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-tight">
                      {item.desc}
                    </p>
                  </div>

                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                    configSuporte[item.chave]
                      ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950'
                      : 'bg-black/[0.05] dark:bg-white/[0.08] text-slate-600 dark:text-zinc-400'
                  }`}>
                    {configSuporte[item.chave] ? 'Obrigatório' : 'Opcional'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 5: FORMATOS DE CONVERSA */}
      {/* ============================================================================== */}
      {subTab === 'formatos' && (
        <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] space-y-4 shadow-sm animate-fade-in">
          <h2 className="text-sm font-bold text-[#1d1d1f] dark:text-white">
            Diretrizes dos Formatos de Conversa
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
              <span className="font-bold text-[#1d1d1f] dark:text-white block">Formato Colaborativo</span>
              <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">
                Fila única aberta. Ideal para centrais de atendimento, lojas e vendas ágeis onde qualquer atendente disponível pode puxar o próximo ticket da fila.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.03] border border-black/[0.06] dark:border-white/[0.08] space-y-2">
              <span className="font-bold text-[#1d1d1f] dark:text-white block">Formato Individual</span>
              <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">
                Isolamento estrito de conversas por operador. Atende aos requisitos da LGPD para setores médicos, jurídicos ou consultorias executivas onde o cliente não pode ter suas mensagens lidas por outros funcionários.
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
