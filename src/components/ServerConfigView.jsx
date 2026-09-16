'use client';

import React, { useState, useEffect } from 'react';
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
  setConfiguracoesSuporte
} from '@/lib/storage';
import { EyeIcon, EyeOffIcon } from './Icons';
import { generateSecurePassword } from '@/lib/security';

export default function ServerConfigView() {
  const [subTab, setSubTab] = useState('checklist'); // 'checklist' | 'usuarios' | 'geral' | 'formatos'
  
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
  const [senhasEquipeReveladas, setSenhasEquipeReveladas] = useState({});
  const [userRole, setUserRole] = useState('administrador');

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
  };

  useEffect(() => {
    recarregar();

    const handleMockUpdate = () => recarregar();
    const handleRoleUpdate = () => setUserRole(getCurrentUserRole());
    const handleSenhaUpdate = () => setSenhaPadrao(getSenhaPadraoRedefinicao());
    const handleConfigUpdate = () => setConfigSuporte(getConfiguracoesSuporte());

    window.addEventListener('storage_mock_updated', handleMockUpdate);
    window.addEventListener('user_role_updated', handleRoleUpdate);
    window.addEventListener('senha_padrao_updated', handleSenhaUpdate);
    window.addEventListener('config_suporte_updated', handleConfigUpdate);

    return () => {
      window.removeEventListener('storage_mock_updated', handleMockUpdate);
      window.removeEventListener('user_role_updated', handleRoleUpdate);
      window.removeEventListener('senha_padrao_updated', handleSenhaUpdate);
      window.removeEventListener('config_suporte_updated', handleConfigUpdate);
    };
  }, []);

  const handleToggleRegraSuporte = (chave) => {
    const novoValor = !configSuporte[chave];
    const atualizada = { ...configSuporte, [chave]: novoValor };
    setConfigSuporte(atualizada);
    setConfiguracoesSuporte(atualizada);
    setFeedback(`Regra de suporte atualizada: ${novoValor ? 'OBRIGATÓRIO' : 'OPCIONAL'}`);
    setTimeout(() => setFeedback(''), 3500);
  };

  const handleSalvarItemChecklist = (e) => {
    e.preventDefault();
    if (!novoTitulo.trim()) return;

    try {
      addServerChecklistTemplateItem({
        titulo: novoTitulo.trim(),
        descricao: novaDescricao.trim(),
        categoria: novaCategoria,
        obrigatorio: novoObrigatorio,
      });

      setNovoTitulo('');
      setNovaDescricao('');
      setFeedback('Requisito adicionado com sucesso ao modelo de checklist!');
      setTimeout(() => setFeedback(''), 4000);
      recarregar();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoverItemChecklist = (id) => {
    removeServerChecklistTemplateItem(id);
    recarregar();
  };

  const handleCadastrarUsuario = (e) => {
    e.preventDefault();
    if (!novoUsuarioEmail.trim()) return;
    try {
      addEquipeUsuario({
        nome: novoUsuarioNome.trim(),
        email: novoUsuarioEmail.trim(),
        senha: novoUsuarioSenha.trim() || senhaPadrao,
        papel: novoUsuarioPapel,
      });
      setNovoUsuarioNome('');
      setNovoUsuarioEmail('');
      setNovoUsuarioSenha('');
      setFeedback('Membro da equipe cadastrado com sucesso!');
      setTimeout(() => setFeedback(''), 4000);
      recarregar();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleRemoverUsuario = (id) => {
    deleteEquipeUsuario(id);
    recarregar();
  };

  const handleMudarMeuPapel = (novoPapel) => {
    setCurrentUserRole(novoPapel);
    setUserRole(novoPapel);
    setFeedback(`Perfil de visualização alterado para: ${novoPapel.toUpperCase()}`);
    setTimeout(() => setFeedback(''), 4000);
  };

  const handleSalvarSenhaPadrao = (e) => {
    e.preventDefault();
    if (!senhaPadrao.trim()) return;
    setSenhaPadraoRedefinicao(senhaPadrao.trim());
    setSenhaPadraoSalva(true);
    setFeedback('Senha padrão de contingência salva com sucesso!');
    setTimeout(() => {
      setSenhaPadraoSalva(false);
      setFeedback('');
    }, 4000);
  };

  const handleCopiarTexto = (texto) => {
    if (!texto) return;
    navigator.clipboard.writeText(texto);
    setFeedback('Copiado para a área de transferência!');
    setTimeout(() => setFeedback(''), 3000);
  };

  const toggleRevelarSenhaEquipe = (id) => {
    setSenhasEquipeReveladas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const mockAtivo = isMockDataEnabled();

  return (
    <div className="space-y-6 animate-fade-in text-slate-900 dark:text-zinc-100">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Configurações Gerais & Servidores
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Gerencie o checklist padrão dos servidores, usuários da equipe, permissões e a senha geral de contingência.
          </p>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold shadow-sm">
          {feedback}
        </div>
      )}

      {/* Sub-Abas */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800 gap-2 overflow-x-auto">
        <button
          onClick={() => setSubTab('checklist')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            subTab === 'checklist'
              ? 'border-[#4d7c0f] dark:border-[#84cc16] text-[#4d7c0f] dark:text-[#84cc16]'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Checklist de Requisitos ({checklistItems.length})
        </button>

        <button
          onClick={() => setSubTab('usuarios')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            subTab === 'usuarios'
              ? 'border-[#4d7c0f] dark:border-[#84cc16] text-[#4d7c0f] dark:text-[#84cc16]'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Usuários da Equipe & Senhas ({equipe.length})
        </button>

        <button
          onClick={() => setSubTab('geral')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            subTab === 'geral'
              ? 'border-[#4d7c0f] dark:border-[#84cc16] text-[#4d7c0f] dark:text-[#84cc16]'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          🔑 Configurações Gerais & Senha Padrão
        </button>

        <button
          onClick={() => setSubTab('formatos')}
          className={`py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all whitespace-nowrap ${
            subTab === 'formatos'
              ? 'border-[#4d7c0f] dark:border-[#84cc16] text-[#4d7c0f] dark:text-[#84cc16]'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Formatos de Conversa
        </button>
      </div>

      {/* ============================================================================== */}
      {/* SUB-ABA 1: CHECKLIST DE SERVIDORES CONFIGURÁVEL */}
      {/* ============================================================================== */}
      {subTab === 'checklist' && (
        <div className="space-y-6 animate-fade-in">
          
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 text-xs text-slate-600 dark:text-zinc-400 flex items-start justify-between gap-4">
            <div>
              <span className="font-bold text-slate-900 dark:text-white block mb-0.5">
                {mockAtivo ? '⚠️ Modo de Homologação (Mock Dev Ativo)' : '✓ Modo de Produção Limpo (Sem Checklist Padrão Fixo)'}
              </span>
              <p className="text-[11px] leading-relaxed">
                {mockAtivo 
                  ? 'Os requisitos de exemplo estão visíveis para você testar. Ao desativar o "Dados Simulados (Mock Dev)" no menu de perfil, os requisitos simulados somem e apenas os requisitos que você cadastrar aqui abaixo serão atribuídos às novas empresas.' 
                  : 'Nenhum checklist fixo padrão é injetado. Todo novo requisito adicionado por você aqui se tornará o modelo oficial de implantação de servidores.'}
              </p>
            </div>
          </div>

          {/* Formulário para Cadastrar Novo Requisito Global */}
          <div className="surface-card rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
              Cadastrar Novo Requisito para o Checklist de Servidores
            </h3>

            <form onSubmit={handleSalvarItemChecklist} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Título da Etapa / Requisito <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoTitulo}
                    onChange={(e) => setNovoTitulo(e.target.value)}
                    placeholder="Ex: Provisionar VPS Linux / Configurar Let's Encrypt SSL / Instalar Redis"
                    required
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Categoria
                  </label>
                  <select
                    value={novaCategoria}
                    onChange={(e) => setNovaCategoria(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  >
                    <option value="Infraestrutura">Infraestrutura</option>
                    <option value="Rede & SSL">Rede & SSL</option>
                    <option value="Aplicação">Aplicação</option>
                    <option value="Canais">Canais</option>
                    <option value="Segurança & Backup">Segurança & Backup</option>
                    <option value="Suporte">Suporte</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                  Instruções Técnicas ou Descrição (Opcional)
                </label>
                <input
                  type="text"
                  value={novaDescricao}
                  onChange={(e) => setNovaDescricao(e.target.value)}
                  placeholder="Ex: Portas liberadas: 80, 443, 3000 / Chave SSH cadastrada"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={novoObrigatorio}
                    onChange={(e) => setNovoObrigatorio(e.target.checked)}
                    className="w-4 h-4 accent-[#4d7c0f] dark:accent-[#84cc16]"
                  />
                  <span>Requisito Obrigatório</span>
                </label>

                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs shadow-sm hover:opacity-90"
                >
                  + Adicionar ao Modelo de Checklist
                </button>
              </div>
            </form>
          </div>

          {/* Lista de Requisitos Atuais */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3">
              Itens do Checklist Global ({checklistItems.length})
            </h3>

            {checklistItems.length === 0 ? (
              <div className="surface-card rounded-2xl p-10 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] text-center text-xs text-slate-500">
                Nenhum requisito cadastrado no checklist. Adicione o primeiro no formulário acima.
              </div>
            ) : (
              <div className="space-y-2.5">
                {checklistItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className="surface-card rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex items-center justify-between gap-3 shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 font-mono text-xs font-bold flex items-center justify-center text-slate-700 dark:text-zinc-300 mt-0.5">
                        {idx + 1}
                      </span>

                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.titulo}
                          </span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 font-semibold uppercase">
                            {item.categoria}
                          </span>
                          {item.id.includes('mock') && (
                            <span className="text-[9px] uppercase font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300">
                              Exemplo Mock
                            </span>
                          )}
                        </div>

                        {item.descricao && (
                          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                            {item.descricao}
                          </p>
                        )}
                      </div>
                    </div>

                    {!item.id.includes('mock') && (
                      <button
                        onClick={() => handleRemoverItemChecklist(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                        title="Remover requisito"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
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
          
          {/* Cadastro de Novo Usuário na Equipe (com Senha) */}
          <div className="surface-card rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300">
              Cadastrar Novo Membro da Equipe com Senha
            </h3>

            <form onSubmit={handleCadastrarUsuario} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Nome Completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={novoUsuarioNome}
                    onChange={(e) => setNovoUsuarioNome(e.target.value)}
                    placeholder="Ex: Tiago da Silva"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    E-mail de Acesso <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    value={novoUsuarioEmail}
                    onChange={(e) => setNovoUsuarioEmail(e.target.value)}
                    placeholder="tiago@rmcontrole.com"
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-zinc-400">
                      Senha Inicial
                    </label>
                    <button
                      type="button"
                      onClick={() => setNovoUsuarioSenha(senhaPadrao)}
                      className="text-[10px] text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline"
                    >
                      Usar Senha Padrão
                    </button>
                  </div>
                  <input
                    type="text"
                    value={novoUsuarioSenha}
                    onChange={(e) => setNovoUsuarioSenha(e.target.value)}
                    placeholder={senhaPadrao || 'Digite ou use a senha padrão'}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                    Papel / Permissões de Abas <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={novoUsuarioPapel}
                    onChange={(e) => setNovoUsuarioPapel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none font-medium"
                  >
                    <option value="suporte">🛠 Suporte (Empresas, Dashboard, Servidores, Auditoria)</option>
                    <option value="vendas">💼 Vendas (Empresas, Dashboard)</option>
                    <option value="administrador">👑 Administrador Geral (Todas as Abas)</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-xl shadow-sm hover:opacity-90"
                >
                  + Cadastrar Membro da Equipe
                </button>
              </div>
            </form>
          </div>

          {/* Lista de Membros da Equipe */}
          <div className="surface-card rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
              <span>Membros Cadastrados ({equipe.length})</span>
              <span className="text-[10px] text-slate-400">Controle de acesso seguro e senhas</span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-zinc-800">
              {equipe.map((u) => {
                const isRevelada = Boolean(senhasEquipeReveladas[u.id]);
                return (
                  <div key={u.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{u.nome}</span>
                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                          u.papel === 'administrador'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : u.papel === 'suporte'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}>
                          {u.papel}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">{u.email}</p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {/* Senha do Usuário */}
                      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-zinc-800 font-mono text-[11px]">
                        <span className="text-slate-400">Senha:</span>
                        <span className="font-bold text-slate-800 dark:text-zinc-200">
                          {isRevelada ? (u.senha || senhaPadrao) : '••••••••'}
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleRevelarSenhaEquipe(u.id)}
                          className="ml-1 text-slate-500 hover:text-slate-800 dark:hover:text-white"
                          title={isRevelada ? 'Ocultar' : 'Ver'}
                        >
                          {isRevelada ? <EyeOffIcon className="w-3.5 h-3.5" /> : <EyeIcon className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCopiarTexto(u.senha || senhaPadrao)}
                          className="ml-1 text-[10px] font-semibold text-slate-600 dark:text-zinc-400 hover:underline"
                        >
                          Copiar
                        </button>
                      </div>

                      {equipe.length > 1 && u.email !== 'admin@rmcontrole.com' && (
                        <button
                          onClick={() => handleRemoverUsuario(u.id)}
                          className="p-1 text-slate-400 hover:text-red-500"
                          title="Remover usuário"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* ============================================================================== */}
      {/* SUB-ABA 3: CONFIGURAÇÕES GERAIS & SENHA PADRÃO DE REDEFINIÇÃO */}
      {/* ============================================================================== */}
      {subTab === 'geral' && (
        <div className="surface-card rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-5 animate-fade-in">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Senha Padrão de Redefinição / Contingência
            </h2>
            <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
              Esta é a senha padrão que a equipe de suporte utiliza ao redefinir o acesso de qualquer cliente ou funcionário.
            </p>
          </div>

          <form onSubmit={handleSalvarSenhaPadrao} className="max-w-lg space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-zinc-300 mb-1">
                Senha Padrão do Sistema
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={senhaPadrao}
                  onChange={(e) => setSenhaPadrao(e.target.value)}
                  placeholder="Ex: RmSuporte@Padrao2026!"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="submit"
                className="px-4 py-2 bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-bold text-xs rounded-xl shadow-sm hover:opacity-90"
              >
                Salvar Senha Padrão
              </button>

              <button
                type="button"
                onClick={() => handleCopiarTexto(senhaPadrao)}
                className="px-4 py-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 font-semibold text-xs rounded-xl hover:bg-slate-200"
              >
                Copiar Senha Padrão
              </button>

              <button
                type="button"
                onClick={() => setSenhaPadrao(generateSecurePassword(14))}
                className="text-xs text-[#4d7c0f] dark:text-[#84cc16] font-semibold hover:underline ml-2"
              >
                ⚡ Gerar Nova
              </button>
            </div>
          </form>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200/80 dark:border-zinc-800 text-xs text-slate-600 dark:text-zinc-400 space-y-1">
            <span className="font-bold text-slate-900 dark:text-white block">Instrução para a Equipe de Atendimento:</span>
            <p className="text-[11px] leading-relaxed">
              Sempre que um cliente solicitar redefinição de senha e esquecer seus dados, o atendente pode aplicar esta senha padrão e orientar o cliente a alterá-la após o primeiro login.
            </p>
          </div>

          {/* Regras de Encerramento de Suporte (Campos Obrigatórios) */}
          <div className="pt-6 border-t border-slate-200 dark:border-zinc-800 space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Regras de Encerramento de Chamado (Campos Obrigatórios)
              </h3>
              <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
                Defina quais dados o técnico é obrigado a informar ao concluir um atendimento de suporte.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {[
                { chave: 'motivo_obrigatorio', label: 'Motivo / Categoria do Chamado', desc: 'Exige classificar o motivo da solicitação' },
                { chave: 'solucao_obrigatoria', label: 'Resumo da Solução Aplicada', desc: 'Exige descrever o procedimento de resolução' },
                { chave: 'colaborador_obrigatorio', label: 'Colaborador Solicitante', desc: 'Exige selecionar quem solicitou o suporte na empresa' },
                { chave: 'atendente_obrigatorio', label: 'Atendente Técnico Responsável', desc: 'Exige identificar o operador que atendeu a demanda' },
              ].map((item) => (
                <div
                  key={item.chave}
                  onClick={() => handleToggleRegraSuporte(item.chave)}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    configSuporte[item.chave]
                      ? 'border-[#4d7c0f] dark:border-[#84cc16] bg-[#4d7c0f]/10 dark:bg-[#84cc16]/10'
                      : 'border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/50'
                  }`}
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      {item.label}
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5 leading-tight">
                      {item.desc}
                    </p>
                  </div>

                  <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${
                    configSuporte[item.chave]
                      ? 'bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950'
                      : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'
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
      {/* SUB-ABA 4: FORMATOS DE CONVERSA */}
      {/* ============================================================================== */}
      {subTab === 'formatos' && (
        <div className="surface-card rounded-2xl p-6 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] space-y-4 animate-fade-in">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Diretrizes dos Formatos de Conversa
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">Formato Colaborativo</span>
              <p className="text-slate-600 dark:text-zinc-400 leading-relaxed">
                Fila única aberta. Ideal para centrais de atendimento, lojas e vendas ágeis onde qualquer atendente disponível pode puxar o próximo ticket da fila.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 dark:bg-zinc-900/50 border border-slate-200 dark:border-zinc-800 space-y-2">
              <span className="font-bold text-slate-900 dark:text-white block">Formato Individual</span>
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
