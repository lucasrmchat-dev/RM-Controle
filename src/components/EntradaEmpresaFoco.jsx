'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { addEmpresaCredencial, fetchDestinoPedirAcesso, fetchServidoresConfig, getEmpresaCredenciais, getNomeTecnico, getServidoresConfig, getSolucoesSuporte, logVisualizacaoSenha, pedirAcessoAoCliente, updateEmpresaCredencial } from '@/lib/storage';
import { sugerirSolucoes } from '@/lib/sugestoesSolucao';
import { showToast } from './ToastNotification';

// ------------------------------------------------------------------------------
// Linha do atendimento (Demandas): ao abrir a empresa de uma demanda, o atendimento vira um caminho de três passos
// em tela de foco, e só o passo da vez fica aberto: 1 Entrar na empresa, 2 Atender, 3 Concluir.
// Mesmo clima do Modo foco (tela cheia, fundo com luzes suaves); "Abrir a empresa completa" leva ao resto (abas).
// ------------------------------------------------------------------------------
const MOLA = { type: 'spring', bounce: 0.2, duration: 0.5 };
const SUAVE = 'bg-black/[0.05] hover:bg-black/[0.08] dark:bg-white/10 dark:hover:bg-white/15';
const CAMPO = 'w-full h-12 px-4 rounded-2xl bg-white dark:bg-white/[0.07] ring-1 ring-black/[0.1] dark:ring-white/[0.14] text-[15px] outline-none focus:ring-2 focus:ring-rm-acento-medio';
const PRINCIPAL = 'h-12 px-7 rounded-full text-[15px] font-semibold text-white shadow-[0_14px_40px_-12px_rgb(var(--rm-acento-medio)/0.8)] cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-2';
const FUNDO_PRINCIPAL = { background: 'linear-gradient(135deg, rgb(var(--rm-acento-medio)), rgb(var(--rm-acento)))' };

const tempo = (segundos) => {
  const s = Math.max(0, segundos);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Uma linha do caminho: bolinha, nome e, à direita, o resumo (passos já feitos ou ainda por vir). */
function LinhaDoPasso({ n, titulo, resumo, estado }) {
  const feito = estado === 'feito';
  return (
    <div className={`flex items-center gap-3 py-2.5 text-[14px] ${estado === 'futuro' ? 'text-black/35 dark:text-white/35' : 'text-black/55 dark:text-white/60'}`}>
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[12px] font-semibold flex-shrink-0 ${feito ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'ring-1 ring-black/20 dark:ring-white/25'}`}>{feito ? '✓' : n}</span>
      <span className="font-medium">{titulo}</span>
      {resumo && <span className="ml-auto text-[12.5px]">{resumo}</span>}
    </div>
  );
}

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
 * chamado: a demanda (já atualizada pela fila); onAssumir(chamado): assume e começa; onConcluir(chamado): abre o formulário de conclusão;
 * onCancelar(chamado): cancela o atendimento; onAbrirEmpresa({ aba?, acao? }): a tela completa da empresa, já na aba ou ação pedida.
 */
export default function EntradaEmpresaFoco({ chamado, empresa, userEmail, onSair, onAssumir, onConcluir, onCancelar, onAbrirEmpresa }) {
  const [passo, setPasso] = useState(1); // 1 Entrar · 2 Atender · 3 Concluir
  const [tela1, setTela1] = useState('acesso'); // acesso | sem_acesso | editar
  const [credenciais, setCredenciais] = useState(() => getEmpresaCredenciais(empresa?.id));
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [servidores, setServidores] = useState(() => getServidoresConfig() || {});
  const [destino, setDestino] = useState(undefined); // undefined: procurando | null: sem grupo | { nome, grupo }
  const [pedido, setPedido] = useState('nao'); // nao | enviando | enviado
  const [novoEmail, setNovoEmail] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [assumindo, setAssumindo] = useState(false);
  const [painel, setPainel] = useState(null); // null | 'solucoes' | 'acesso'
  const [busca, setBusca] = useState('');
  const [agora, setAgora] = useState(Date.now());

  const principal = useMemo(() => credenciais.find((c) => c.is_principal) || credenciais[0] || null, [credenciais]);
  const ehServidor2 = (empresa?.servidor_alocado || 'servidor_1') === 'servidor_2';
  const nomeServidor = ehServidor2 ? servidores.servidor_2_nome || 'Servidor 2' : servidores.servidor_1_nome || 'Servidor 1';
  const urlServidor = ehServidor2 ? servidores.servidor_2_url : servidores.servidor_1_url;
  const emAtendimento = chamado?.status === 'em_andamento';
  const encerrada = chamado && ['finalizado', 'cancelado'].includes(chamado.status);

  useEffect(() => {
    fetchServidoresConfig().then((c) => c && setServidores(c)).catch(() => {});
    fetchDestinoPedirAcesso(empresa?.id, chamado?.id).then((r) => setDestino(r?.destino || null)).catch(() => setDestino(null));
  }, [empresa?.id, chamado?.id]);
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
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
      setTela1('acesso');
    } catch (err) {
      showToast(err.message || 'Não foi possível salvar o acesso.', 'error');
    } finally {
      setSalvando(false);
    }
  };

  const assumir = async () => {
    setAssumindo(true);
    try {
      await onAssumir(chamado);
    } catch (e) {
      showToast(e?.message || 'Não foi possível assumir a demanda.', 'error');
    } finally {
      setAssumindo(false);
    }
  };

  // Passo 2: o relato, o cronômetro e as soluções
  const relato = String(chamado?.observacao_inicial || chamado?.descricao || chamado?.observacoes || '').trim();
  const categorias = Array.isArray(chamado?.categorias) && chamado.categorias.length ? chamado.categorias : String(chamado?.motivo || '').split(',').map((x) => x.trim()).filter(Boolean);
  const solicitante = chamado?.colaborador_solicitante || chamado?.solicitante_nome || '';
  const abertaPor = chamado?.criador_email ? getNomeTecnico(chamado.criador_email) : '';
  const responsavel = chamado?.tecnico_email && chamado.tecnico_email !== 'geral' ? getNomeTecnico(chamado.tecnico_email, chamado.atendente) : '';
  const solucoes = useMemo(() => {
    const todas = getSolucoesSuporte({ empresa_id: empresa?.id });
    return busca.trim() ? getSolucoesSuporte({ empresa_id: empresa?.id, query: busca }).slice(0, 6) : sugerirSolucoes(relato, todas, 4);
  }, [empresa?.id, relato, busca]);
  const segundos = emAtendimento ? Math.floor((agora - new Date(chamado.iniciado_em || agora).getTime()) / 1000) : 0;

  const cartao = 'rounded-[28px] bg-white/85 dark:bg-white/[0.06] backdrop-blur-2xl ring-1 ring-black/[0.06] dark:ring-white/10 shadow-[0_24px_70px_-36px_rgba(0,0,0,0.35)] dark:shadow-[0_30px_90px_-36px_rgba(0,0,0,0.8)] p-6 sm:p-7';

  return createPortal(
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} className="fixed inset-0 z-[46] h-[100dvh] overflow-hidden overscroll-none bg-rm-fundo dark:bg-[#0b0d12] text-[#1d1d1f] dark:text-white">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <motion.div className="absolute -top-40 -left-40 w-[620px] h-[620px] rounded-full blur-[120px] opacity-50 dark:opacity-100" style={{ background: 'rgb(var(--rm-acento-medio) / 0.35)' }} animate={{ x: [0, 80, 0], y: [0, 50, 0] }} transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full blur-[130px] bg-violet-500/15 dark:bg-violet-500/25" animate={{ x: [0, -60, 0], y: [0, -40, 0] }} transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }} />
      </div>

      <div className="relative h-full flex flex-col max-w-[680px] mx-auto px-4 sm:px-6 pb-6 pt-6 sm:pt-[84px] lg:pt-[92px]">
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-wide uppercase text-black/40 dark:text-white/45">Atendimento</p>
            <p className="text-[17px] font-semibold truncate">{empresa?.nome || chamado?.empresa_nome}</p>
          </div>
          <button type="button" onClick={onSair} className={`ml-auto h-10 px-4 rounded-full ${SUAVE} text-[13px] font-medium cursor-pointer whitespace-nowrap`}>
            Voltar às demandas <kbd className="hidden sm:inline ml-1.5 px-1.5 py-0.5 rounded-md bg-black/[0.06] dark:bg-white/10 text-[10.5px] font-medium text-black/45 dark:text-white/60 font-sans">Esc</kbd>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto py-5 [scrollbar-width:thin]">
          {/* 1 · Entrar na empresa */}
          {passo > 1 ? (
            <LinhaDoPasso n={1} titulo="Entrar na empresa" estado="feito" resumo={principal?.usuario_email ? `acesso: ${principal.usuario_email}` : 'acesso conferido'} />
          ) : (
            <motion.div key="p1" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={MOLA} className={cartao}>
              <p className="text-[14px] font-semibold flex items-center gap-2.5"><span className="w-6 h-6 rounded-full bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px]">1</span>Entrar na empresa<span className="ml-auto text-[12.5px] font-normal text-black/45 dark:text-white/50">{nomeServidor}</span></p>
              <AnimatePresence mode="wait">
                <motion.div key={tela1} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
                  {tela1 === 'acesso' && (
                    <>
                      <div className="mt-4 space-y-2">
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
                        <button type="button" onClick={() => setPasso(2)} className="h-12 px-5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[14px] font-semibold cursor-pointer">✓ Consegui acessar</button>
                        <button type="button" onClick={() => setTela1('sem_acesso')} className="h-12 px-5 rounded-full bg-rose-500/12 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 text-[14px] font-semibold cursor-pointer">✕ Não consegui</button>
                      </div>
                    </>
                  )}
                  {tela1 === 'sem_acesso' && (
                    <>
                      <p className="mt-4 text-[20px] font-semibold tracking-tight">Não conseguiu entrar. O que fazer?</p>
                      <div className="mt-3 grid sm:grid-cols-2 gap-2.5">
                        <button type="button" disabled={destino === undefined || destino === null || pedido !== 'nao'} onClick={pedirAoCliente} className="text-left rounded-2xl p-4 ring-1 ring-black/[0.08] dark:ring-white/12 hover:ring-rm-acento-medio disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer">
                          <span className="block text-[15px] font-semibold">{pedido === 'enviado' ? '✓ Pedido enviado' : pedido === 'enviando' ? 'Enviando…' : 'Pedir o acesso ao cliente'}</span>
                          <span className="mt-1 block text-[12.5px] leading-snug text-black/55 dark:text-white/60">{destino === undefined ? 'Procurando o grupo da empresa…' : destino ? `Manda agora ${destino.grupo ? 'no grupo' : 'na conversa'} “${destino.nome}”.` : 'Sem grupo ligado a esta empresa. Peça pelo Chat.'}</span>
                        </button>
                        <button type="button" onClick={() => { setNovoEmail(principal?.usuario_email || ''); setNovaSenha(''); setTela1('editar'); }} className="text-left rounded-2xl p-4 ring-1 ring-black/[0.08] dark:ring-white/12 hover:ring-rm-acento-medio cursor-pointer">
                          <span className="block text-[15px] font-semibold">Atualizar e-mail e senha</span>
                          <span className="mt-1 block text-[12.5px] leading-snug text-black/55 dark:text-white/60">O cliente mandou o acesso certo no privado ou pelo Super? Troque aqui.</span>
                        </button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setTela1('acesso')} className={`h-10 px-4 rounded-full ${SUAVE} text-[13px] font-medium cursor-pointer`}>← Voltar</button>
                        <button type="button" onClick={() => setPasso(2)} className="h-10 px-4 rounded-full text-black/55 hover:text-black dark:text-white/65 dark:hover:text-white text-[13px] font-medium cursor-pointer">Atender mesmo assim →</button>
                      </div>
                    </>
                  )}
                  {tela1 === 'editar' && (
                    <form onSubmit={salvarAcesso} className="mt-4">
                      <div className="space-y-2.5">
                        <input autoFocus value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} placeholder="E-mail do administrador" className={CAMPO} autoComplete="off" />
                        <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} placeholder={principal?.senha ? 'Nova senha (vazio mantém a atual)' : 'Senha'} className={CAMPO} autoComplete="off" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="submit" disabled={salvando} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>{salvando ? 'Salvando…' : 'Salvar e tentar de novo'}</button>
                        <button type="button" onClick={() => setTela1('sem_acesso')} className={`h-12 px-5 rounded-full ${SUAVE} text-[14px] font-medium cursor-pointer`}>Cancelar</button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}

          {/* 2 · Atender */}
          {passo === 2 ? (
            <motion.div key="p2" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={MOLA} className={`${cartao} mt-2`}>
              <p className="text-[14px] font-semibold flex items-center gap-2.5"><span className="w-6 h-6 rounded-full bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px]">2</span>Atender<span className="ml-auto text-[13px] font-normal tabular-nums text-black/45 dark:text-white/50">{emAtendimento ? tempo(segundos) : 'ainda não começou'}</span></p>
              <p className="mt-4 text-[11.5px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/45">O que a pessoa relatou</p>
              {relato ? <p className="mt-1 text-[19px] leading-relaxed whitespace-pre-wrap break-words">{relato}</p> : <p className="mt-1 text-[17px] text-black/40 dark:text-white/45">Sem relato escrito. Use as soluções para achar o caminho.</p>}
              <p className="mt-3 text-[12.5px] text-black/45 dark:text-white/50">{[categorias.length && categorias.join(', '), solicitante && `pedido por ${solicitante}`, abertaPor && `aberta por ${abertaPor}`, responsavel && `responsável: ${responsavel}`].filter(Boolean).join(' · ')}</p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                {emAtendimento ? (
                  <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => setPasso(3)} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>Atendi, concluir →</motion.button>
                ) : (
                  <motion.button type="button" whileTap={{ scale: 0.96 }} disabled={assumindo} onClick={assumir} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>{assumindo ? 'Assumindo…' : '▶ Assumir e começar'}</motion.button>
                )}
                <button type="button" onClick={() => setPainel((p) => (p === 'solucoes' ? null : 'solucoes'))} className={`h-12 px-5 rounded-full ${SUAVE} text-[14px] font-medium cursor-pointer`}>Soluções{solucoes.length && !busca ? ` (${solucoes.length})` : ''}</button>
                <button type="button" onClick={() => setPainel((p) => (p === 'acesso' ? null : 'acesso'))} className={`h-12 px-5 rounded-full ${SUAVE} text-[14px] font-medium cursor-pointer`}>Ver acesso</button>
              </div>

              <AnimatePresence initial={false}>
                {painel === 'acesso' && (
                  <motion.div key="a" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <div className="mt-4 space-y-2">
                      <Segredo rotulo="E-mail" valor={principal?.usuario_email} onCopiar={() => copiar(principal?.usuario_email, 'E-mail copiado.')} />
                      <Segredo rotulo="Senha" valor={principal?.senha} oculto visivel={senhaVisivel} onVer={() => setSenhaVisivel((v) => !v)} onCopiar={() => copiar(principal?.senha, 'Senha copiada.')} />
                      <button type="button" onClick={acessar} className="h-9 px-4 rounded-full text-[13px] font-medium text-black/60 dark:text-white/65 hover:bg-black/[0.05] dark:hover:bg-white/10 cursor-pointer">Abrir o {nomeServidor} ↗</button>
                    </div>
                  </motion.div>
                )}
                {painel === 'solucoes' && (
                  <motion.div key="s" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                    <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar sintoma, código de erro ou descrição" className={`${CAMPO} mt-4`} />
                    <div className="mt-3 space-y-2">
                      {solucoes.length === 0 && <p className="text-[13.5px] text-black/45 dark:text-white/50">{busca.trim() ? 'Nada encontrado para essa busca.' : 'Nenhuma solução parecida com o relato. Pesquise acima.'}</p>}
                      {solucoes.map((s) => (
                        <div key={s.id} className="rounded-2xl bg-black/[0.035] dark:bg-white/[0.06] p-3.5">
                          <div className="flex items-start gap-2">
                            <p className="text-[14px] font-semibold flex-1">{s.titulo}</p>
                            <button type="button" onClick={() => copiar(s.solucao_passos, 'Passos copiados.')} className="h-7 px-2.5 rounded-full text-[12px] font-medium hover:bg-black/[0.06] dark:hover:bg-white/10 cursor-pointer">Copiar</button>
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-black/60 dark:text-white/65 whitespace-pre-wrap line-clamp-5">{s.solucao_passos}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            passo === 3 && <LinhaDoPasso n={2} titulo="Atender" estado="feito" resumo={emAtendimento ? tempo(segundos) : ''} />
          )}
          {passo === 1 && <LinhaDoPasso n={2} titulo="Atender" estado="futuro" />}

          {/* 3 · Concluir */}
          {passo === 3 ? (
            <motion.div key="p3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={MOLA} className={`${cartao} mt-2`}>
              <p className="text-[14px] font-semibold flex items-center gap-2.5"><span className="w-6 h-6 rounded-full bg-[#1d1d1f] text-white dark:bg-white dark:text-[#1d1d1f] flex items-center justify-center text-[12px]">3</span>Concluir e registrar solução</p>
              {encerrada ? (
                <p className="mt-4 text-[19px] leading-relaxed">✓ Demanda encerrada. Bom trabalho!</p>
              ) : (
                <p className="mt-4 text-[17px] leading-relaxed text-black/70 dark:text-white/75">Conte o que resolveu: isso vira uma solução para a próxima vez.</p>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-2">
                {encerrada ? (
                  <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={onSair} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>Voltar às demandas</motion.button>
                ) : (
                  <>
                    <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => onConcluir(chamado)} className={PRINCIPAL} style={FUNDO_PRINCIPAL}>✓ Concluir chamado</motion.button>
                    <button type="button" onClick={() => setPasso(2)} className={`h-12 px-5 rounded-full ${SUAVE} text-[14px] font-medium cursor-pointer`}>← Voltar ao atendimento</button>
                  </>
                )}
              </div>
            </motion.div>
          ) : (
            <LinhaDoPasso n={3} titulo="Concluir e registrar solução" estado="futuro" />
          )}

          {/* Atalhos: tudo o que a tela da empresa tinha continua à mão */}
          <div className="mt-7 pt-5 border-t border-black/[0.07] dark:border-white/10">
            <p className="text-[11.5px] font-semibold uppercase tracking-wide text-black/40 dark:text-white/45">Ir para</p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {urlServidor && <button type="button" onClick={acessar} className={`h-9 px-4 rounded-full ${SUAVE} text-[13px] font-medium cursor-pointer`}>Entrar no servidor ↗</button>}
              {[['canais', 'Canais'], ['servidor', 'Servidor'], ['credenciais', 'Acessos e senhas'], ['recorrencias', 'Problemas recorrentes'], ['contrato', 'Contrato'], ['chamados', 'Histórico']].map(([aba, nome]) => (
                <button key={aba} type="button" onClick={() => onAbrirEmpresa({ aba })} className={`h-9 px-4 rounded-full ${SUAVE} text-[13px] font-medium cursor-pointer`}>{nome}</button>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => onAbrirEmpresa({ acao: 'nova_demanda' })} className="h-9 px-4 rounded-full text-[13px] font-semibold ring-1 ring-black/15 dark:ring-white/20 hover:bg-black/[0.04] dark:hover:bg-white/10 cursor-pointer">+ Nova demanda</button>
              <button type="button" onClick={() => onAbrirEmpresa({ acao: 'registrar' })} className="h-9 px-4 rounded-full text-[13px] font-semibold ring-1 ring-black/15 dark:ring-white/20 hover:bg-black/[0.04] dark:hover:bg-white/10 cursor-pointer">+ Registrar suporte</button>
              {emAtendimento && onCancelar && <button type="button" onClick={() => onCancelar(chamado)} className="h-9 px-4 rounded-full text-[13px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer ml-auto">Cancelar atendimento</button>}
              <button type="button" onClick={() => onAbrirEmpresa({})} className={`h-9 px-3 rounded-full text-[13px] font-medium text-black/50 dark:text-white/55 hover:text-black dark:hover:text-white hover:underline cursor-pointer ${emAtendimento && onCancelar ? '' : 'ml-auto'}`}>Empresa completa →</button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>,
    document.body
  );
}
