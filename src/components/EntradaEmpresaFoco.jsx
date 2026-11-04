'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { addEmpresaCredencial, fetchDestinoPedirAcesso, fetchServidoresConfig, getEmpresaCredenciais, getServidoresConfig, logVisualizacaoSenha, pedirAcessoAoCliente, updateEmpresaCredencial } from '@/lib/storage';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Entrada na empresa (Demandas): antes de abrir a empresa, uma tela de foco com o acesso.
//  Acesso: e-mail e senha de administrador, botão para entrar no servidor do cliente e a resposta
//     "consegui" (segue sem avisar ninguém) ou "não consegui" (pede o acesso no grupo do cliente ou corrige o acesso).
//  Depois abre a empresa (Cockpit), que já mostra a demanda, o cronômetro e as soluções.
// Mesmo visual do Modo foco (tela cheia, fundo com luzes suaves, cartão grande).
// ------------------------------------------------------------------------------
const MOLA = { type: 'spring', bounce: 0.25, duration: 0.55 };
const BOTAO_SUAVE = 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15';
const CAMPO = 'w-full h-12 px-4 rounded-2xl bg-white dark:bg-white/[0.07] ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[15px] outline-none focus:ring-2 focus:ring-rm-acento-medio';

function Linha({ rotulo, valor, copiavel, oculto, onCopiar, onVer, visivel }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-black/[0.035] dark:bg-white/[0.06] px-4 h-14">
      <span className="w-16 text-[12.5px] text-black/45 dark:text-white/50 flex-shrink-0">{rotulo}</span>
      <span className="flex-1 min-w-0 truncate font-mono text-[15px]">{oculto && !visivel ? '••••••••••••' : valor || '—'}</span>
      {oculto && (
        <button type="button" onClick={onVer} className="h-9 px-3 rounded-full text-[12.5px] font-medium hover:bg-black/[0.06] dark:hover:bg-white/10 cursor-pointer">
          {visivel ? 'Ocultar' : 'Ver'}
        </button>
      )}
      {copiavel && valor && (
        <button type="button" onClick={onCopiar} className="h-9 px-3 rounded-full text-[12.5px] font-medium hover:bg-black/[0.06] dark:hover:bg-white/10 cursor-pointer">
          Copiar
        </button>
      )}
    </div>
  );
}

export default function EntradaEmpresaFoco({ chamado, empresa, userEmail, onContinuar, onSair }) {
  const [etapa, setEtapa] = useState('acesso'); // acesso | sem_acesso | editar
  const [credenciais, setCredenciais] = useState(() => getEmpresaCredenciais(empresa?.id));
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [servidores, setServidores] = useState(() => getServidoresConfig() || {});
  const [destino, setDestino] = useState(undefined); // undefined: carregando | null: sem grupo | { nome, grupo }
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
    fetchDestinoPedirAcesso(empresa?.id, chamado?.id).then((r) => setDestino(r?.destino || null)).catch(() => setDestino(null));
  }, [empresa?.id, chamado?.id]);

  // Tela cheia de verdade: sem rolagem da página por trás
  useEffect(() => {
    const html = document.documentElement;
    const antes = [html.style.overflow, document.body.style.overflow];
    html.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      [html.style.overflow, document.body.style.overflow] = antes;
    };
  }, []);
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && !e.target.closest?.('input, textarea') && onSair();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onSair]);

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
      setEtapa('acesso');
    } catch (err) {
      showToast(err.message || 'Não foi possível salvar o acesso.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const cartao = 'max-h-full overflow-y-auto flex flex-col rounded-[32px] bg-white/80 dark:bg-white/[0.06] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/10 shadow-[0_30px_90px_-40px_rgba(0,0,0,0.35)] dark:shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)] p-6 sm:p-10';
  const botaoPrincipal = 'h-14 px-8 rounded-full text-[16px] font-semibold text-white shadow-[0_14px_40px_-10px_rgb(var(--rm-acento-medio)/0.8)] cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2';
  const fundoPrincipal = { background: 'linear-gradient(135deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento)))' };

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[46] h-[100dvh] overflow-hidden overscroll-none bg-rm-fundo dark:bg-[#0b0d12] text-[#1d1d1f] dark:text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div className="absolute -top-40 -left-40 w-[620px] h-[620px] rounded-full blur-[120px] opacity-50 dark:opacity-100" style={{ background: 'rgb(var(--rm-acento-medio) / 0.35)' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full blur-[130px] bg-violet-500/15 dark:bg-violet-500/25" animate={{ x: [0, -60, 0], y: [0, -40, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="relative h-full flex flex-col max-w-[980px] mx-auto px-4 sm:px-8 pb-6 sm:pb-8 pt-6 sm:pt-[84px] lg:pt-[92px]">
        <div className="flex items-center gap-6 flex-shrink-0">
          <p className="text-[13.5px] font-medium text-black/55 dark:text-white/60">Entrada na empresa</p>
          <button type="button" onClick={onSair} className={`ml-auto h-10 px-4 rounded-full ${BOTAO_SUAVE} text-[13px] font-medium cursor-pointer whitespace-nowrap`}>
            Voltar às demandas <kbd className="hidden sm:inline ml-1.5 px-1.5 py-0.5 rounded-md bg-black/[0.06] dark:bg-white/10 text-[10.5px] font-medium text-black/45 dark:text-white/60 font-sans">Esc</kbd>
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col justify-center py-4 sm:py-6">
          <AnimatePresence mode="wait">
            <motion.article key={etapa} initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={MOLA} className={cartao}>
              {etapa === 'acesso' && (
                <>
                  <p className="text-[12.5px] font-semibold tracking-wide uppercase text-black/45 dark:text-white/50">Primeiro, entre na empresa</p>
                  <h2 className="mt-3 text-[30px] sm:text-[44px] font-semibold tracking-[-0.03em] leading-[1.05] break-words">{empresa?.nome || chamado?.empresa_nome}</h2>
                  <p className="mt-2 text-[14px] text-black/50 dark:text-white/55">Acesso de administrador · {nomeServidor}</p>
                  <div className="mt-6 space-y-2.5">
                    {principal && (principal.usuario_email || principal.senha) ? (
                      <>
                        <Linha rotulo="E-mail" valor={principal.usuario_email} copiavel onCopiar={() => copiar(principal.usuario_email, 'E-mail copiado.')} />
                        <Linha rotulo="Senha" valor={principal.senha} oculto visivel={senhaVisivel} onVer={() => setSenhaVisivel((v) => !v)} copiavel onCopiar={() => copiar(principal.senha, 'Senha copiada.')} />
                      </>
                    ) : (
                      <p className="rounded-2xl bg-amber-500/10 text-amber-800 dark:text-amber-300 px-4 py-3 text-[14px]">Esta empresa ainda não tem e-mail e senha de administrador cadastrados.</p>
                    )}
                  </div>
                  <div className="mt-6 flex flex-wrap items-center gap-2.5">
                    <motion.button type="button" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.96 }} onClick={acessar} className={botaoPrincipal} style={fundoPrincipal}>
                      Acessar a empresa ↗
                    </motion.button>
                    <span className="text-[12.5px] text-black/45 dark:text-white/50">Copia a senha e abre o {nomeServidor}.</span>
                  </div>
                  <div className="mt-8 pt-6 border-t border-black/[0.07] dark:border-white/10">
                    <p className="text-[14px] font-medium mb-3">Conseguiu entrar?</p>
                    <div className="flex flex-wrap gap-2.5">
                      <button type="button" onClick={onContinuar} className="h-14 px-7 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[15px] font-semibold cursor-pointer">
                        ✓ Consegui acessar
                      </button>
                      <button type="button" onClick={() => setEtapa('sem_acesso')} className="h-14 px-7 rounded-full bg-rose-500/12 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[15px] font-semibold cursor-pointer">
                        ✕ Não consegui acessar
                      </button>
                    </div>
                  </div>
                </>
              )}

              {etapa === 'sem_acesso' && (
                <>
                  <p className="text-[12.5px] font-semibold tracking-wide uppercase text-black/45 dark:text-white/50">Não conseguiu entrar</p>
                  <h2 className="mt-3 text-[28px] sm:text-[38px] font-semibold tracking-[-0.03em] leading-[1.1]">O que você quer fazer?</h2>
                  <div className="mt-6 grid sm:grid-cols-2 gap-3">
                    <button type="button" disabled={destino === undefined || destino === null || pedido !== 'nao'} onClick={pedirAoCliente} className="text-left rounded-3xl p-5 ring-1 ring-black/[0.08] dark:ring-white/12 bg-white/70 dark:bg-white/[0.05] hover:ring-rm-acento-medio disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-shadow">
                      <span className="block text-[17px] font-semibold">{pedido === 'enviado' ? '✓ Pedido enviado' : pedido === 'enviando' ? 'Enviando…' : 'Pedir o acesso ao cliente'}</span>
                      <span className="mt-1 block text-[13.5px] leading-snug text-black/55 dark:text-white/60">
                        {destino === undefined ? 'Procurando o grupo da empresa…' : destino ? `Manda agora, ${destino.grupo ? 'no grupo' : 'na conversa'} “${destino.nome}”: não conseguimos acessar e pedimos o e-mail e a senha.` : 'Esta empresa não tem grupo de WhatsApp ligado. Peça o acesso pelo Chat.'}
                      </span>
                    </button>
                    <button type="button" onClick={() => { setNovoEmail(principal?.usuario_email || ''); setNovaSenha(''); setEtapa('editar'); }} className="text-left rounded-3xl p-5 ring-1 ring-black/[0.08] dark:ring-white/12 bg-white/70 dark:bg-white/[0.05] hover:ring-rm-acento-medio cursor-pointer transition-shadow">
                      <span className="block text-[17px] font-semibold">Atualizar e-mail e senha</span>
                      <span className="mt-1 block text-[13.5px] leading-snug text-black/55 dark:text-white/60">O cliente já mandou o acesso certo (no privado ou pelo Super)? Troque aqui e tente entrar de novo.</span>
                    </button>
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <button type="button" onClick={() => setEtapa('acesso')} className={`h-12 px-6 rounded-full ${BOTAO_SUAVE} text-[14px] font-medium cursor-pointer`}>← Voltar ao acesso</button>
                    <button type="button" onClick={onContinuar} className="h-12 px-6 rounded-full text-black/60 hover:text-black dark:text-white/70 dark:hover:text-white hover:bg-black/[0.04] dark:hover:bg-white/[0.06] text-[14px] font-medium cursor-pointer">Abrir a empresa mesmo assim →</button>
                  </div>
                </>
              )}

              {etapa === 'editar' && (
                <form onSubmit={salvarAcesso}>
                  <p className="text-[12.5px] font-semibold tracking-wide uppercase text-black/45 dark:text-white/50">Acesso de administrador</p>
                  <h2 className="mt-3 text-[28px] sm:text-[38px] font-semibold tracking-[-0.03em] leading-[1.1]">Novo e-mail e senha</h2>
                  <div className="mt-6 space-y-3">
                    <input autoFocus value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="E-mail do administrador" className={CAMPO} autoComplete="off" />
                    <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder={principal?.senha ? 'Nova senha (vazio mantém a atual)' : 'Senha'} className={CAMPO} autoComplete="off" />
                  </div>
                  <div className="mt-6 flex flex-wrap gap-2.5">
                    <button type="submit" disabled={salvando} className={botaoPrincipal} style={fundoPrincipal}>{salvando ? 'Salvando…' : 'Salvar e tentar de novo'}</button>
                    <button type="button" onClick={() => setEtapa('sem_acesso')} className={`h-14 px-6 rounded-full ${BOTAO_SUAVE} text-[15px] font-medium cursor-pointer`}>Cancelar</button>
                  </div>
                </form>
              )}

            </motion.article>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
