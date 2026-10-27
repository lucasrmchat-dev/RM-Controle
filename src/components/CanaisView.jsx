'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { acaoCanal, criarCanal, editarCanal, excluirCanal, fetchCanais, getCategoriasDemandas } from '@/lib/storage';
import { STATUS_CANAL, TIPOS_CANAL } from '@/lib/canais';
import { formatarTelefone } from '@/lib/whatsappAgenda';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ModalEtapas, Etapa, ErroRodape, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';
import { ListSkeleton } from './SkeletonLoaders';

const MOLA = { type: 'spring', bounce: 0.18, duration: 0.42 };

const COR_STATUS = {
  verde: 'bg-[#4d7c0f]/12 text-[#4d7c0f] dark:text-[#a3e635]',
  ambar: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  cinza: 'bg-black/[0.06] dark:bg-white/[0.1] text-slate-500 dark:text-zinc-400',
  vermelho: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
};
const QUALIDADE = { GREEN: 'Alta', YELLOW: 'Média', RED: 'Baixa', UNKNOWN: 'Ainda sem nota' };
const PONTO = { verde: 'bg-[#4d7c0f] dark:bg-[#84cc16]', ambar: 'bg-amber-500', cinza: 'bg-slate-400', vermelho: 'bg-rose-500' };

const IconeWhatsapp = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21l1.65-4.95A8.5 8.5 0 1 1 8 19.4L3 21z" />
    <path d="M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 1c-1-.5-2-1.5-2.5-2.5l1-1-1-2L9 9.5z" />
  </svg>
);
const IconeSelo = ({ className = 'w-3.5 h-3.5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 2l2.4 2.1 3.2-.4.9 3.1 2.8 1.6-1.1 3 1.1 3-2.8 1.6-.9 3.1-3.2-.4L12 22l-2.4-2.1-3.2.4-.9-3.1-2.8-1.6 1.1-3-1.1-3 2.8-1.6.9-3.1 3.2.4L12 2zm-1 13.6l5.3-5.3-1.4-1.4-3.9 3.9-1.9-1.9-1.4 1.4 3.3 3.3z" />
  </svg>
);

function BotaoAcao({ onClick, children, perigo = false, desabilitado = false, titulo }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      title={titulo}
      className={`h-9 px-3.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors disabled:opacity-40 ${
        perigo ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-500/[0.08]' : 'ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.03] dark:hover:bg-white/[0.06]'
      }`}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------------------
// Novo canal
// ------------------------------------------------------------------------------
function CopiarCampo({ rotulo, valor }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <span className={classeRotulo}>{rotulo}</span>
      <div className="flex gap-2">
        <input readOnly value={valor} className={`${classeCampo} font-mono text-[12.5px]`} onFocus={(e) => e.target.select()} />
        <button
          type="button"
          onClick={() => navigator.clipboard?.writeText(valor).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500); })}
          className="h-11 px-4 rounded-xl text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer whitespace-nowrap"
        >
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}

function NovoCanalModal({ tipo, servidorQr, onFechar, onCriado }) {
  const [dados, setDados] = useState({});
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [webhook, setWebhook] = useState(null);
  const departamentos = getCategoriasDemandas();

  useEffect(() => {
    setDados({ nome: '', departamento_padrao: '', evolution_url: '' });
    setErro('');
    setWebhook(null);
  }, [tipo]);

  const campo = (id, rotulo, props = {}) => (
    <label className="block">
      <span className={classeRotulo}>{rotulo}</span>
      <input value={dados[id] ?? ''} onChange={(e) => setDados({ ...dados, [id]: e.target.value })} className={classeCampo} autoComplete="off" {...props} />
    </label>
  );

  const oficial = tipo === 'whatsapp_oficial';
  // QR com o servidor da plataforma: o cliente só dá o nome e lê o QR, como no RM Chat
  const simples = !oficial && servidorQr;

  const salvar = async () => {
    setEnviando(true);
    setErro('');
    try {
      const r = await criarCanal({ tipo, ...dados, ...(simples ? { evolution_url: '', evolution_apikey: '' } : {}) });
      onCriado(r.canal, { conectar: simples });
      if (r.webhook) setWebhook(r.webhook);
      else onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalEtapas
      aberto={Boolean(tipo)}
      onFechar={onFechar}
      bloqueado={enviando}
      largura={simples && !webhook ? 'max-w-lg' : 'max-w-[980px]'}
      idTitulo="novo-canal-titulo"
      titulo={webhook ? 'Último passo: avisos da Meta' : tipo ? `Novo canal · ${TIPOS_CANAL[tipo].rotulo}` : ''}
      subtitulo={webhook ? 'Cole estes dois dados no painel da Meta para as mensagens chegarem aqui.' : tipo ? TIPOS_CANAL[tipo].descricao : ''}
      rodape={
        webhook ? (
          <div className="flex justify-end">
            <button type="button" onClick={onFechar} className={classeBotaoPrimario}>
              Pronto, já colei
            </button>
          </div>
        ) : (
          <>
            <ErroRodape erro={erro} />
            <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
              <button type="button" onClick={onFechar} disabled={enviando} className={`${classeBotaoTexto} sm:mr-auto`}>
                Cancelar
              </button>
              <button type="button" onClick={salvar} disabled={enviando} className={classeBotaoPrimario}>
                {enviando && <Spinner />}
                {oficial ? 'Conferir e salvar' : simples ? 'Criar e gerar QR Code' : 'Salvar canal'}
              </button>
            </div>
          </>
        )
      }
    >
      {webhook ? (
        <div className="space-y-5 max-w-2xl">
          <ol className="space-y-2 text-[14px] leading-relaxed text-slate-600 dark:text-zinc-300 list-decimal pl-5">
            <li>
              Em developers.facebook.com, abra o app › <strong>WhatsApp</strong> › <strong>Configuração</strong>.
            </li>
            <li>
              Em <strong>Webhook</strong>, clique em <strong>Editar</strong> e cole os dois campos abaixo. Clique em <strong>Verificar e salvar</strong>.
            </li>
            <li>
              Em <strong>Campos do webhook</strong>, assine <strong>messages</strong>.
            </li>
          </ol>
          <CopiarCampo rotulo="URL de callback" valor={webhook.url} />
          <CopiarCampo rotulo="Token de verificação" valor={webhook.token_verificacao} />
          <p className="text-[12.5px] text-amber-700 dark:text-amber-400">O token aparece só agora. Se perder, gere outro em Canais › Gerenciar.</p>
        </div>
      ) : (
        tipo && (
          <div className={`grid grid-cols-1 md:gap-x-10 ${simples ? 'max-w-md' : 'md:grid-cols-2'}`}>
            <div>
              <Etapa numero={1} titulo="Identificação" estado={dados.nome?.trim().length >= 2 ? 'concluida' : 'ativa'} ultima={simples}>
                <div className="space-y-3">
                  {campo('nome', 'Nome do canal', { placeholder: 'Ex.: Comercial, Suporte', maxLength: 80 })}
                  <label className="block">
                    <span className={classeRotulo}>Departamento das conversas novas</span>
                    <select value={dados.departamento_padrao || ''} onChange={(e) => setDados({ ...dados, departamento_padrao: e.target.value })} className={`${classeCampo} cursor-pointer`}>
                      <option value="">Sem departamento (todos veem)</option>
                      {departamentos.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </Etapa>
            </div>
            {!simples && (
            <div className="md:pl-10 md:border-l border-black/[0.06] dark:border-white/[0.11]">
              <Etapa numero={2} titulo={oficial ? 'Dados da Meta' : 'Servidor da Evolution API'} estado="ativa" ultima>
                {oficial ? (
                  <div className="space-y-3">
                    {campo('phone_number_id', 'ID do número de telefone', { inputMode: 'numeric', placeholder: 'WhatsApp › Configuração da API' })}
                    {campo('waba_id', 'ID da conta do WhatsApp Business (opcional)', { inputMode: 'numeric' })}
                    {campo('token', 'Token permanente (usuário do sistema)', { type: 'password' })}
                    {campo('app_secret', 'Chave secreta do app', { type: 'password', placeholder: 'Configurações do app › Básico' })}
                    <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">O token e a chave ficam cifrados no servidor e nunca aparecem de novo na tela.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {campo('evolution_url', 'Endereço da Evolution API', { placeholder: 'https://whatsapp.suaempresa.com.br' })}
                    {campo('evolution_apikey', 'API Key (AUTHENTICATION_API_KEY)', { type: 'password' })}
                    <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                      O servidor de WhatsApp da plataforma ainda não foi configurado, então informe um servidor próprio. Depois de salvar, clique em <strong>Conectar</strong> para ler o QR Code.
                    </p>
                  </div>
                )}
              </Etapa>
            </div>
            )}
          </div>
        )
      )}
    </ModalEtapas>
  );
}

// ------------------------------------------------------------------------------
// QR Code
// ------------------------------------------------------------------------------
function QrModal({ canal, onFechar, onAtualizado }) {
  const [qr, setQr] = useState(null);
  const [status, setStatus] = useState(null);
  const [erro, setErro] = useState('');
  const ativo = useRef(false);

  useEffect(() => {
    if (!canal) return undefined;
    ativo.current = true;
    setQr(null);
    setErro('');
    setStatus('conectando');
    let timer = null;
    const consultar = async () => {
      try {
        const r = await acaoCanal(canal.id, { acao: 'situacao' });
        if (!ativo.current) return;
        onAtualizado(r.canal);
        setStatus(r.canal.status);
        if (r.qr) setQr(r.qr);
        if (r.canal.status === 'conectado') {
          showToast(`${r.canal.nome} conectado.`, 'success');
          setTimeout(onFechar, 1400);
          return;
        }
      } catch (e) {
        if (ativo.current) setErro(e.message);
      }
      if (ativo.current) timer = setTimeout(consultar, 3000);
    };
    acaoCanal(canal.id, { acao: 'conectar' })
      .then((r) => {
        if (!ativo.current) return;
        onAtualizado(r.canal);
        setQr(r.qr);
        setStatus(r.canal.status);
        timer = setTimeout(consultar, 3000);
      })
      .catch((e) => ativo.current && setErro(e.message));
    return () => {
      ativo.current = false;
      clearTimeout(timer);
    };
  }, [canal?.id]);

  return (
    <ModalEtapas aberto={Boolean(canal)} onFechar={onFechar} largura="max-w-lg" idTitulo="qr-titulo" titulo={`Conectar ${canal?.nome || ''}`} subtitulo="Abra o WhatsApp no celular › Aparelhos conectados › Conectar um aparelho" rodape={<ErroRodape erro={erro} />}>
      <div className="flex flex-col items-center py-2">
        <div className="relative w-[272px] h-[272px] rounded-[28px] bg-white ring-1 ring-black/[0.08] flex items-center justify-center overflow-hidden">
          <AnimatePresence mode="wait">
            {status === 'conectado' ? (
              <motion.div key="ok" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={MOLA} className="w-20 h-20 rounded-full bg-[#4d7c0f] text-white flex items-center justify-center">
                <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 12.5l4 4L18 8" />
                </svg>
              </motion.div>
            ) : qr ? (
              <motion.img key={qr.slice(-24)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} src={qr} alt="QR Code para conectar o WhatsApp" className="w-[248px] h-[248px]" />
            ) : (
              <motion.div key="carregando" className="flex flex-col items-center gap-3 text-slate-500">
                <Spinner />
                <span className="text-[13px]">{erro ? 'Não foi possível gerar o QR' : 'Gerando o QR Code…'}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <p className="mt-4 text-[13px] text-slate-500 dark:text-zinc-400 text-center max-w-xs">
          {status === 'conectado' ? 'Número conectado. As mensagens já começam a chegar.' : 'O QR muda sozinho a cada poucos segundos. Mantenha esta janela aberta até conectar.'}
        </p>
      </div>
    </ModalEtapas>
  );
}

function TesteModal({ canal, onFechar }) {
  const [telefone, setTelefone] = useState('');
  const [texto, setTexto] = useState('Teste do RM Controle ✅');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const enviar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await acaoCanal(canal.id, { acao: 'testar', telefone, texto });
      showToast('Mensagem de teste enviada.', 'success');
      onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };
  return (
    <ModalEtapas
      aberto={Boolean(canal)}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-md"
      idTitulo="teste-canal-titulo"
      titulo="Enviar mensagem de teste"
      subtitulo={canal?.tipo === 'whatsapp_oficial' ? 'Pela API oficial, o número precisa ter escrito para vocês nas últimas 24 horas.' : `Sai pelo número de ${canal?.nome || ''}.`}
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} className={classeBotaoTexto}>
              Cancelar
            </button>
            <button type="button" onClick={enviar} disabled={enviando || !telefone.trim()} className={classeBotaoPrimario}>
              {enviando && <Spinner />}
              Enviar
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className={classeRotulo}>WhatsApp de destino</span>
          <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="(85) 99999-0000" className={classeCampo} autoFocus />
        </label>
        <label className="block">
          <span className={classeRotulo}>Mensagem</span>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4096} className={`${classeCampo} h-auto py-3 resize-none`} />
        </label>
      </div>
    </ModalEtapas>
  );
}

function EditarCanalModal({ canal, onFechar, onSalvo }) {
  const [dados, setDados] = useState({ nome: '', departamento_padrao: '' });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const departamentos = getCategoriasDemandas();
  useEffect(() => {
    if (canal) setDados({ nome: canal.nome || '', departamento_padrao: canal.departamento_padrao || '' });
    setErro('');
  }, [canal]);
  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const r = await editarCanal({ id: canal.id, nome: dados.nome, departamento_padrao: dados.departamento_padrao });
      onSalvo(r.canal);
      showToast('Canal atualizado.', 'success');
      onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };
  return (
    <ModalEtapas
      aberto={Boolean(canal)}
      onFechar={onFechar}
      bloqueado={salvando}
      largura="max-w-md"
      idTitulo="editar-canal-titulo"
      titulo="Editar canal"
      subtitulo={canal ? `${TIPOS_CANAL[canal.tipo].rotulo}${canal.numero ? ` · ${formatarTelefone(canal.numero)}` : ''}` : ''}
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} className={classeBotaoTexto}>
              Cancelar
            </button>
            <button type="button" onClick={salvar} disabled={salvando || dados.nome.trim().length < 2} className={classeBotaoPrimario}>
              {salvando && <Spinner />}
              Salvar
            </button>
          </div>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className={classeRotulo}>Nome do canal</span>
          <input value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} maxLength={80} className={classeCampo} autoFocus />
        </label>
        <label className="block">
          <span className={classeRotulo}>Departamento padrão</span>
          <select value={dados.departamento_padrao} onChange={(e) => setDados({ ...dados, departamento_padrao: e.target.value })} className={`${classeCampo} cursor-pointer`}>
            <option value="">Sem departamento (todos veem)</option>
            {departamentos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <span className="block mt-1.5 text-[12.5px] text-slate-500 dark:text-zinc-400">Conversas novas deste número entram nesse departamento. As que já existem continuam onde estão (mude em Chat › Transferir).</span>
        </label>
      </div>
    </ModalEtapas>
  );
}

// ------------------------------------------------------------------------------
// Tela
// ------------------------------------------------------------------------------
function CartaoCanal({ canal, admin, onConectar, onAtualizado, onTestar, onRemovido, onEditar }) {
  const [ocupado, setOcupado] = useState(null);
  const st = STATUS_CANAL[canal.status] || STATUS_CANAL.desconectado;
  const oficial = canal.tipo === 'whatsapp_oficial';

  const fazer = async (nome, fn, sucesso) => {
    setOcupado(nome);
    try {
      const r = await fn();
      if (r?.canal) onAtualizado(r.canal);
      if (sucesso) showToast(sucesso, 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={MOLA} className={`rounded-[22px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-5 flex flex-col ${canal.ativo ? '' : 'opacity-60'}`}>
      <div className="flex items-start gap-3">
        <span className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${oficial ? 'bg-sky-500/12 text-sky-700 dark:text-sky-300' : 'bg-[#4d7c0f]/12 text-[#4d7c0f] dark:text-[#a3e635]'}`}>
          <IconeWhatsapp />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="text-[15.5px] font-semibold tracking-tight truncate">{canal.nome}</h3>
            {oficial && canal.config?.nome_verificado && <IconeSelo className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 flex-shrink-0" />}
          </div>
          <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 sm:truncate">
            {TIPOS_CANAL[canal.tipo].rotulo}
            {canal.numero && (
              <span className="block sm:inline tabular-nums">
                <span className="hidden sm:inline"> · </span>
                {formatarTelefone(canal.numero)}
              </span>
            )}
          </p>
        </div>
        <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1.5 flex-shrink-0 ${COR_STATUS[st.cor]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${PONTO[st.cor]} ${canal.status === 'conectado' ? 'animate-pulse' : ''}`} />
          {canal.ativo ? st.rotulo : 'Desativado'}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <div>
          <dt className="text-slate-400 dark:text-zinc-500">Departamento padrão</dt>
          <dd className="font-medium truncate">{canal.departamento_padrao || 'Todos'}</dd>
        </div>
        {oficial ? (
          <>
            <div>
              <dt className="text-slate-400 dark:text-zinc-500">Qualidade</dt>
              <dd className="font-medium">{QUALIDADE[canal.config?.qualidade] || canal.config?.qualidade || '—'}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-slate-400 dark:text-zinc-500">Limite de envio</dt>
              <dd className="font-medium truncate">{canal.config?.limite_envio ? String(canal.config.limite_envio).replace('TIER_', '').replace('_', ' ') + ' conversas/dia' : '—'}</dd>
            </div>
          </>
        ) : (
          <div>
            <dt className="text-slate-400 dark:text-zinc-500">Atualizado</dt>
            <dd className="font-medium">{canal.atualizado_em ? new Date(canal.atualizado_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</dd>
          </div>
        )}
      </dl>
      {canal.status === 'erro' && canal.status_detalhe && <p className="mt-3 text-[12.5px] text-rose-600 dark:text-rose-400 line-clamp-2">{canal.status_detalhe}</p>}

      {admin && (
        <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex flex-wrap items-center gap-2">
          {canal.ativo && !oficial && canal.status !== 'conectado' && (
            <button type="button" onClick={() => onConectar(canal)} className="h-9 px-3.5 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer">
              Conectar
            </button>
          )}
          {canal.ativo && oficial && (
            <BotaoAcao onClick={() => fazer('situacao', () => acaoCanal(canal.id, { acao: 'situacao' }), 'Dados atualizados.')} desabilitado={Boolean(ocupado)}>
              {ocupado === 'situacao' ? 'Conferindo…' : 'Conferir'}
            </BotaoAcao>
          )}
          {canal.ativo && canal.status === 'conectado' && <BotaoAcao onClick={() => onTestar(canal)}>Testar envio</BotaoAcao>}
          {canal.ativo && !oficial && canal.status !== 'desconectado' && (
            <BotaoAcao titulo="Reinicia a conexão sem precisar ler o QR de novo" onClick={() => fazer('reiniciar', () => acaoCanal(canal.id, { acao: 'reiniciar' }), 'Reiniciando o canal.')} desabilitado={Boolean(ocupado)}>
              Reiniciar
            </BotaoAcao>
          )}
          {canal.ativo && !oficial && canal.status === 'conectado' && (
            <BotaoAcao perigo onClick={() => window.confirm(`Desconectar ${canal.nome}? Para voltar, será preciso ler o QR Code de novo.`) && fazer('desconectar', () => acaoCanal(canal.id, { acao: 'desconectar' }), 'Canal desconectado.')} desabilitado={Boolean(ocupado)}>
              Desconectar
            </BotaoAcao>
          )}
          <span className="ml-auto" />
          <BotaoAcao onClick={() => onEditar(canal)} desabilitado={Boolean(ocupado)}>
            Editar
          </BotaoAcao>
          {!canal.ativo && (
            <BotaoAcao
              perigo
              titulo="Apaga o canal. As conversas já recebidas continuam guardadas."
              onClick={() =>
                window.confirm(`Excluir o canal ${canal.nome}? Essa ação não pode ser desfeita.`) &&
                fazer('excluir', async () => {
                  await excluirCanal(canal.id);
                  onRemovido(canal.id);
                }, 'Canal excluído.')
              }
              desabilitado={Boolean(ocupado)}
            >
              Excluir
            </BotaoAcao>
          )}
          <BotaoAcao perigo={canal.ativo} onClick={() => fazer('ativo', () => editarCanal({ id: canal.id, ativo: !canal.ativo }), canal.ativo ? 'Canal desativado.' : 'Canal ativado.')} desabilitado={Boolean(ocupado)}>
            {canal.ativo ? 'Desativar' : 'Ativar'}
          </BotaoAcao>
        </div>
      )}
    </motion.li>
  );
}

export default function CanaisView() {
  const [canais, setCanais] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [erro, setErro] = useState('');
  const [menuAberto, setMenuAberto] = useState(false);
  const [novoTipo, setNovoTipo] = useState(null);
  const [conectando, setConectando] = useState(null);
  const [testando, setTestando] = useState(null);
  const [editando, setEditando] = useState(null);
  const [servidorQr, setServidorQr] = useState(false);

  const carregar = () =>
    fetchCanais()
      .then((r) => {
        setCanais(r.canais);
        setAdmin(r.admin);
        setServidorQr(Boolean(r.servidorQr));
        setErro('');
      })
      .catch((e) => setErro(e.message));

  useEffect(() => {
    carregar();
    // Situação ao vivo: o webhook do provedor atualiza o canal e a tela acompanha
    let canal = null;
    if (isSupabaseConfigured && supabase) {
      canal = supabase.channel('canais_situacao').on('postgres_changes', { event: '*', schema: 'public', table: 'canais' }, () => carregar()).subscribe();
    }
    const intervalo = setInterval(() => document.visibilityState === 'visible' && carregar(), 30000);
    return () => {
      clearInterval(intervalo);
      if (canal) supabase.removeChannel(canal);
    };
  }, []);

  const atualizar = (c) => setCanais((lista) => (lista || []).map((x) => (x.id === c.id ? { ...x, ...c } : x)));
  const conectados = (canais || []).filter((c) => c.ativo && c.status === 'conectado').length;

  return (
    <div className="space-y-8 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-5 pt-2">
        <div>
          <h1 className="text-[30px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-tight">Canais</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500 dark:text-zinc-400 max-w-xl">
            Números de WhatsApp conectados ao atendimento.{canais ? ` ${conectados} de ${canais.length} conectado${canais.length === 1 ? '' : 's'}.` : ''}
          </p>
        </div>
        {admin && (
          <div className="relative">
            <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => setMenuAberto((v) => !v)} aria-expanded={menuAberto} className="h-11 px-5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 text-[14px] font-semibold shadow-md shadow-[#4d7c0f]/20 flex items-center gap-2 cursor-pointer">
              <span className="text-[18px] leading-none -mt-px">+</span>
              Adicionar canal
            </motion.button>
            <AnimatePresence>
              {menuAberto && (
                <motion.div initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.16 }} style={{ transformOrigin: 'top right' }} className="absolute right-0 top-[calc(100%+8px)] z-20 w-[300px] rounded-2xl bg-white dark:bg-[#26262a] ring-1 ring-black/[0.08] dark:ring-white/[0.12] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.3)] p-1.5">
                  {Object.entries(TIPOS_CANAL).map(([id, t]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => {
                        setMenuAberto(false);
                        setNovoTipo(id);
                      }}
                      className="w-full text-left px-3 py-2.5 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] cursor-pointer"
                    >
                      <span className="block text-[14px] font-semibold">{t.rotulo}</span>
                      <span className="block text-[12.5px] text-slate-500 dark:text-zinc-400 leading-snug">{t.descricao}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </header>

      {erro && (
        <div role="alert" className="rounded-[22px] bg-amber-500/10 text-amber-800 dark:text-amber-300 px-5 py-4 text-[14px]">
          {erro}
        </div>
      )}

      {canais === null && !erro ? (
        <div className="p-5 rounded-[22px] bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09]">
          <ListSkeleton linhas={3} />
        </div>
      ) : canais?.length === 0 ? (
        <div className="py-16 flex flex-col items-center text-center">
          <span className="w-14 h-14 rounded-full bg-[#4d7c0f]/10 text-[#4d7c0f] dark:text-[#a3e635] flex items-center justify-center">
            <IconeWhatsapp className="w-6 h-6" />
          </span>
          <p className="mt-4 text-[15px] font-semibold">Nenhum canal ainda</p>
          <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400 max-w-sm">{admin ? 'Conecte o primeiro número de WhatsApp em “Adicionar canal”.' : 'Peça a um administrador para conectar um número.'}</p>
        </div>
      ) : (
        <motion.ul layout className="grid gap-3 grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {(canais || []).map((c) => (
              <CartaoCanal key={c.id} canal={c} admin={admin} onConectar={setConectando} onAtualizado={atualizar} onTestar={setTestando} onRemovido={(id) => setCanais((l) => (l || []).filter((x) => x.id !== id))} onEditar={setEditando} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}

      <NovoCanalModal
        tipo={novoTipo}
        servidorQr={servidorQr}
        onFechar={() => setNovoTipo(null)}
        onCriado={(c, { conectar } = {}) => {
          setCanais((l) => [...(l || []), c]);
          if (conectar) setConectando(c);
        }}
      />
      <QrModal canal={conectando} onFechar={() => setConectando(null)} onAtualizado={atualizar} />
      <TesteModal canal={testando} onFechar={() => setTestando(null)} />
      <EditarCanalModal canal={editando} onFechar={() => setEditando(null)} onSalvo={atualizar} />
    </div>
  );
}

