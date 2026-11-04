'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { addEmpresaCredencial, fetchDestinoPedirAcesso, fetchServidoresConfig, getEmpresaCredenciais, getServidoresConfig, logVisualizacaoSenha, pedirAcessoAoCliente, updateEmpresaCredencial } from '@/lib/storage';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Entrar na empresa (dentro da tela de atendimento, no visual do Modo foco): mostra e-mail e senha do administrador,
// abre o servidor do cliente e pergunta "consegui / não consegui". Sem acesso: pedir ao cliente (grupo ou conversa)
// ou atualizar e-mail e senha na hora.
// ------------------------------------------------------------------------------
const SUAVE = 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15';
const CAMPO = 'w-full h-12 px-4 rounded-2xl bg-white dark:bg-white/[0.07] ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[15px] outline-none focus:ring-2 focus:ring-rm-acento-medio';
const PRINCIPAL = 'h-12 px-7 rounded-full text-[15px] font-semibold text-white shadow-[0_14px_40px_-12px_rgb(var(--rm-acento-medio)/0.8)] cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2';
const FUNDO_PRINCIPAL = { background: 'linear-gradient(135deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento)))' };

function Segredo({ rotulo, valor, oculto, visivel, onVer, onCopiar }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/[0.035] dark:bg-white/[0.06] px-4 h-12">
      <span className="w-14 text-[12.5px] text-black/45 dark:text-white/50 flex-shrink-0">{rotulo}</span>
      <span className="flex-1 min-w-0 truncate font-mono text-[14px]">{oculto && !visivel ? '••••••••••••' : valor || '—'}</span>
      {oculto && (
        <button type="button" onClick={onVer} className="h-8 px-3 rounded-full text-[12px] font-medium hover:bg-black/[0.06] dark:hover:bg-white/10 cursor-pointer">
          {visivel ? 'Ocultar' : 'Ver'}
        </button>
      )}
      {valor && (
        <button type="button" onClick={onCopiar} className="h-8 px-3 rounded-full text-[12px] font-medium hover:bg-black/[0.06] dark:hover:bg-white/10 cursor-pointer">
          Copiar
        </button>
      )}
    </div>
  );
}

/**
 * empresa, chamado (pode ser null), userEmail; onConsegui(): a pessoa entrou e o painel pode recolher;
 * onFechar(): "Atender mesmo assim" / fechar o painel sem confirmar.
 */
export default function AcessoEmpresaFoco({ empresa, chamado, userEmail, onConsegui, onFechar }) {
  const [tela, setTela] = useState('acesso'); // acesso | sem_acesso | editar
  const [credenciais, setCredenciais] = useState(() => getEmpresaCredenciais(empresa?.id));
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [servidores, setServidores] = useState(() => getServidoresConfig() || {});
  const [destino, setDestino] = useState(undefined); // undefined: procurando | null: sem grupo | { nome, grupo }
  const [pedido, setPedido] = useState('nao'); // nao | enviando | enviado
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);

  const principal = useMemo(() => credenciais.find((c) => c.is_principal) || credenciais[0] || null, [credenciais]);
  const ehServidor2 = (empresa?.servidor_alocado || 'servidor_1') === 'servidor_2';
  const nomeServidor = ehServidor2 ? servidores.servidor_2_nome || 'Servidor 2' : servidores.servidor_1_nome || 'Servidor 1';
  const urlServidor = ehServidor2 ? servidores.servidor_2_url : servidores.servidor_1_url;

  useEffect(() => {
    fetchServidoresConfig().then((c) => c && setServidores(c)).catch(() => {});
  }, []);
  useEffect(() => {
    // O grupo da empresa só importa quando a pessoa não consegue entrar: procura sob demanda
    if (tela !== 'sem_acesso' || destino !== undefined) return;
    fetchDestinoPedirAcesso(empresa?.id, chamado?.id).then((r) => setDestino(r?.destino || null)).catch(() => setDestino(null));
  }, [tela, destino, empresa?.id, chamado?.id]);

  const copiar = useCallback((texto, aviso) => {
    navigator.clipboard?.writeText(texto).then(() => showToast(aviso), () => {});
  }, []);

  // Entrar no servidor do cliente: copia a senha (para colar no login) e abre o servidor numa aba nova
  const acessar = async () => {
    if (!urlServidor) return showToast(`O link do ${nomeServidor} ainda não foi configurado.`, 'error');
    if (principal?.senha) {
      navigator.clipboard?.writeText(principal.senha).catch(() => {});
      showToast('Senha copiada. Cole no login do servidor.');
      Promise.resolve(logVisualizacaoSenha(empresa.id, userEmail, { rotulo: principal.rotulo })).catch(() => {});
    }
    const janela = window.open('about:blank', '_blank');
    if (janela) janela.opener = null;
    const atual = await fetchServidoresConfig().catch(() => null);
    const url = (ehServidor2 ? atual?.servidor_2_url : atual?.servidor_1_url) || urlServidor;
    if (janela) janela.location.href = url;
    else window.open(url, '_blank', 'noopener,noreferrer');
  };

  const pedirAoCliente = async () => {
    setPedido('enviando');
    try {
      const r = await pedirAcessoAoCliente(empresa.id, chamado?.id);
      setPedido('enviado');
      showToast(`Pedido enviado${r?.destino?.nome ? ` em ${r.destino.nome}` : ''}.`);
    } catch (e) {
      setPedido('nao');
      showToast(e.message, 'error');
    }
  };

  const salvarAcesso = async (e) => {
    e.preventDefault();
    if (!novoEmail.trim() && !novaSenha.trim()) return showToast('Informe o e-mail e a senha.', 'error');
    setSalvando(true);
    try {
      if (principal) await updateEmpresaCredencial(empresa.id, principal.id, { usuario_email: novoEmail.trim() || principal.usuario_email || '', senha: novaSenha.trim() || principal.senha || '' }, userEmail);
      else await addEmpresaCredencial(empresa.id, { rotulo: 'Acesso Principal', usuario_email: novoEmail.trim(), senha: novaSenha.trim(), is_principal: true }, userEmail);
      setCredenciais(getEmpresaCredenciais(empresa.id));
      setPedido('nao');
      setSenhaVisivel(false);
      showToast('Acesso atualizado. Tente entrar de novo.');
      setTela('acesso');
    } catch (err) {
      showToast(err.message || 'Não foi possível salvar o acesso.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="rounded-3xl bg-black/[0.025] dark:bg-white/[0.04] ring-1 ring-black/[0.05] dark:ring-white/[0.08] p-5 sm:p-6">
      <p className="flex items-center text-[12px] font-semibold tracking-wide uppercase text-black/45 dark:text-white/50">
        Entrar na empresa
        <span className="ml-auto normal-case tracking-normal font-normal text-[12.5px]">{nomeServidor}</span>
      </p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={tela} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
          {tela === 'acesso' && (
            <>
              <div className="mt-3 space-y-2">
                {principal && (principal.usuario_email || principal.senha) ? (
                  <>
                    <Segredo rotulo="E-mail" valor={principal.usuario_email} onCopiar={() => copiar(principal.usuario_email, 'E-mail copiado.')} />
                    <Segredo rotulo="Senha" valor={principal.senha} oculto visivel={senhaVisivel} onVer={() => setSenhaVisivel((v) => !v)} onCopiar={() => copiar(principal.senha, 'Senha copiada.')} />
                  </>
                ) : (
                  <p className="rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3 text-[14px]">Esta empresa ainda não tem e-mail e senha de administrador cadastrados.</p>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={acessar} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>Acessar a empresa ↗</motion.button>
                <button type="button" onClick={onConsegui} className="h-12 px-5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[14px] font-semibold cursor-pointer">✓ Consegui acessar</button>
                <button type="button" onClick={() => setTela('sem_acesso')} className="h-12 px-5 rounded-full bg-rose-500/12 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[14px] font-semibold cursor-pointer">✕ Não consegui</button>
              </div>
            </>
          )}
          {tela === 'sem_acesso' && (
            <>
              <p className="mt-3 text-[20px] font-semibold tracking-tight">Não conseguiu entrar. O que fazer?</p>
              <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
                <button type="button" disabled={destino === undefined || destino === null || pedido !== 'nao'} onClick={pedirAoCliente} className="text-left rounded-2xl p-4 bg-white/70 dark:bg-white/[0.04] ring-1 ring-black/[0.08] dark:ring-white/12 hover:ring-rm-acento-medio disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
                  <span className="block text-[15px] font-semibold">{pedido === 'enviado' ? '✓ Pedido enviado' : pedido === 'enviando' ? 'Enviando…' : 'Pedir o acesso ao cliente'}</span>
                  <span className="mt-1 block text-[12.5px] leading-snug text-black/55 dark:text-white/60">{destino === undefined ? 'Procurando o grupo da empresa…' : destino ? `Manda agora ${destino.grupo ? 'no grupo' : 'na conversa'} “${destino.nome}”.` : 'Sem grupo ligado a esta empresa. Peça pelo Chat.'}</span>
                </button>
                <button type="button" onClick={() => { setNovoEmail(principal?.usuario_email || ''); setNovaSenha(''); setTela('editar'); }} className="text-left rounded-2xl p-4 bg-white/70 dark:bg-white/[0.04] ring-1 ring-black/[0.08] dark:ring-white/12 hover:ring-rm-acento-medio cursor-pointer">
                  <span className="block text-[15px] font-semibold">Atualizar e-mail e senha</span>
                  <span className="mt-1 block text-[12.5px] leading-snug text-black/55 dark:text-white/60">O cliente mandou o acesso certo no privado ou pelo Super? Troque aqui.</span>
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setTela('acesso')} className={`h-10 px-4 rounded-full ${SUAVE} text-[13px] font-medium cursor-pointer`}>← Voltar</button>
                <button type="button" onClick={onFechar} className="h-10 px-4 rounded-full text-black/55 hover:text-black dark:text-white/65 dark:hover:text-white text-[13px] font-medium cursor-pointer">Atender mesmo assim →</button>
              </div>
            </>
          )}
          {tela === 'editar' && (
            <form onSubmit={salvarAcesso} className="mt-3">
              <div className="space-y-2.5">
                <input autoFocus value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="E-mail do administrador" className={CAMPO} autoComplete="off" />
                <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder={principal?.senha ? 'Nova senha (vazio mantém a atual)' : 'Senha'} className={CAMPO} autoComplete="off" />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="submit" disabled={salvando} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>{salvando ? 'Salvando…' : 'Salvar e tentar de novo'}</button>
                <button type="button" onClick={() => setTela('sem_acesso')} className={`h-12 px-5 rounded-full ${SUAVE} text-[14px] font-medium cursor-pointer`}>Cancelar</button>
              </div>
            </form>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
