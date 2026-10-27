'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { acaoPlataforma, fetchPlataforma } from '@/lib/storage';
import { MODULOS_CONTRATAVEIS, RECURSOS_LIMITE, STATUS_CONTRATO, consumo, formatarMoeda } from '@/lib/plataforma';
import { ModalEtapas, Etapa, ErroRodape, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';
import { ListSkeleton } from './SkeletonLoaders';

const MOLA = { type: 'spring', bounce: 0.18, duration: 0.42 };

const COR_STATUS = {
  ativa: 'bg-rm-acento/12 text-rm-acento dark:text-rm-acento-vivo',
  suspensa: 'bg-amber-500/14 text-amber-700 dark:text-amber-300',
  cancelada: 'bg-black/[0.06] dark:bg-white/[0.1] text-slate-500 dark:text-zinc-400',
};
const ROTULO_STATUS = { ativa: 'Ativa', suspensa: 'Suspensa', cancelada: 'Cancelada' };

function Segmentado({ opcoes, valor, onMudar, rotulo }) {
  return (
    <div role="tablist" aria-label={rotulo} className="inline-flex max-w-full overflow-x-auto gap-1 p-1 rounded-full bg-black/[0.05] dark:bg-white/[0.07] [scrollbar-width:none]">
      {opcoes.map((op) => (
        <button
          key={op.id}
          type="button"
          role="tab"
          aria-selected={valor === op.id}
          onClick={() => onMudar(op.id)}
          className={`h-8 px-3.5 rounded-full text-[13px] font-medium cursor-pointer transition-colors whitespace-nowrap ${valor === op.id ? 'bg-white dark:bg-rm-campo-escuro text-[#1d1d1f] dark:text-white shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : 'text-slate-500 dark:text-zinc-400 hover:text-[#1d1d1f] dark:hover:text-white'}`}
        >
          {op.rotulo}
          {op.contador > 0 && <span className="ml-1.5 text-slate-400 tabular-nums">{op.contador}</span>}
        </button>
      ))}
    </div>
  );
}

function Metrica({ rotulo, valor, detalhe }) {
  return (
    <div className="rounded-[22px] bg-white dark:bg-rm-cartao-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.09] px-5 py-4">
      <p className="text-[12.5px] font-medium text-slate-500 dark:text-zinc-400">{rotulo}</p>
      <p className="mt-1 text-[21px] sm:text-[26px] font-semibold tracking-tight tabular-nums break-words leading-tight">{valor}</p>
      {detalhe && <p className="text-[12px] text-slate-400 dark:text-zinc-500">{detalhe}</p>}
    </div>
  );
}

function BarraConsumo({ item }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-slate-500 dark:text-zinc-400 truncate">{item.rotulo}</span>
        <span className={`tabular-nums font-medium ${item.esgotado ? 'text-rose-600 dark:text-rose-400' : ''}`}>
          {item.usado}
          {item.limite !== null ? `/${item.limite}` : ''}
        </span>
      </div>
      <div className="mt-1 h-1 rounded-full bg-black/[0.07] dark:bg-white/[0.1] overflow-hidden">
        <div className={`h-full rounded-full ${item.esgotado ? 'bg-rose-500' : 'bg-[#1d1d1f] dark:bg-white'}`} style={{ width: item.limite ? `${item.fracao * 100}%` : '0%' }} />
      </div>
    </div>
  );
}

// ------------------------------------------------------------------------------
// Formulários
// ------------------------------------------------------------------------------
function CamposLimites({ tipo, valor, onMudar }) {
  // Sem lista salva, a empresa tem todos os módulos
  const marcados = Array.isArray(valor.modulos) ? valor.modulos : MODULOS_CONTRATAVEIS.map((m) => m.id);
  const alternar = (id) => onMudar({ ...valor, modulos: marcados.includes(id) ? marcados.filter((m) => m !== id) : [...marcados, id] });
  return (
    <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3">
      {RECURSOS_LIMITE.filter((r) => !r.so || r.so === tipo).map((r) => (
        <label key={r.id} className="block">
          <span className={classeRotulo}>{r.rotulo}</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            value={valor[r.id] ?? ''}
            onChange={(e) => onMudar({ ...valor, [r.id]: e.target.value })}
            placeholder="Sem limite"
            className={classeCampo}
          />
        </label>
      ))}
    </div>
    <fieldset>
      <legend className={classeRotulo}>Módulos contratados</legend>
      <p className="text-[12px] text-slate-500 dark:text-zinc-400 mb-2">Só os módulos marcados aparecem para a empresa. Os perfis de acesso dela escolhem, dentro destes, o que cada pessoa vê.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {MODULOS_CONTRATAVEIS.map((m) => (
          <label key={m.id} className="flex items-center gap-2.5 px-3 py-2 rounded-xl ring-1 ring-black/[0.07] dark:ring-white/[0.1] cursor-pointer hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
            <input type="checkbox" checked={marcados.includes(m.id)} onChange={() => alternar(m.id)} className="w-4 h-4 accent-rm-acento" />
            <span className="text-[13px] font-medium">{m.rotulo}</span>
          </label>
        ))}
      </div>
    </fieldset>
    </div>
  );
}

function CamposContrato({ valor, onMudar }) {
  const campo = (id, rotulo, props = {}) => (
    <label className="block">
      <span className={classeRotulo}>{rotulo}</span>
      <input value={valor[id] ?? ''} onChange={(e) => onMudar({ ...valor, [id]: e.target.value })} className={classeCampo} {...props} />
    </label>
  );
  return (
    <div className="space-y-3">
      {campo('plano', 'Plano', { placeholder: 'Ex.: Essencial', maxLength: 80 })}
      <div className="grid grid-cols-2 gap-3">
        {campo('valor_mensal', 'Valor mensal (R$)', { inputMode: 'decimal', placeholder: '0,00' })}
        {campo('dia_vencimento', 'Dia do vencimento', { type: 'number', min: 1, max: 28, placeholder: '10' })}
        {campo('inicio', 'Início', { type: 'date' })}
        {campo('fim', 'Término (opcional)', { type: 'date' })}
      </div>
    </div>
  );
}

const gerarSenha = () => {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `${Array.from(bytes, (b) => letras[b % letras.length]).join('')}#9`;
};

function NovaEmpresaModal({ aberto, onFechar, nivel, revendas, onCriada }) {
  const [tipo, setTipo] = useState('assinante');
  const [dados, setDados] = useState({ nome: '', documento: '', contato_nome: '', contato_email: '', contato_telefone: '' });
  const [paiId, setPaiId] = useState('');
  const [limites, setLimites] = useState({});
  const [contrato, setContrato] = useState({ plano: '', valor_mensal: '', dia_vencimento: '', inicio: new Date().toISOString().slice(0, 10), fim: '' });
  const [admin, setAdmin] = useState({ nome: '', email: '', senha: '' });
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setTipo('assinante');
    setDados({ nome: '', documento: '', contato_nome: '', contato_email: '', contato_telefone: '' });
    setPaiId('');
    setLimites({});
    setContrato({ plano: '', valor_mensal: '', dia_vencimento: '', inicio: new Date().toISOString().slice(0, 10), fim: '' });
    setAdmin({ nome: '', email: '', senha: gerarSenha() });
    setErro('');
  }, [aberto]);

  const enviar = async () => {
    setEnviando(true);
    setErro('');
    try {
      const r = await acaoPlataforma({
        acao: 'criar',
        tipo,
        ...dados,
        pai_id: paiId || null,
        limites,
        contrato: contrato.plano.trim() ? contrato : null,
        admin,
      });
      onCriada(r.organizacao, admin);
      onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const etapa1 = dados.nome.trim().length >= 2;
  const etapa3 = admin.email.includes('@') && admin.senha.length >= 8;

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-[1080px]"
      idTitulo="nova-org-titulo"
      titulo={tipo === 'revenda' ? 'Nova revenda' : 'Nova empresa assinante'}
      subtitulo="A empresa nasce com dados, usuários e configurações separados de todas as outras."
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
            <button type="button" onClick={onFechar} disabled={enviando} className={`${classeBotaoTexto} sm:mr-auto`}>
              Cancelar
            </button>
            <button type="button" onClick={enviar} disabled={enviando || !etapa1 || !etapa3} className={classeBotaoPrimario}>
              {enviando && <Spinner />}
              Criar empresa
            </button>
          </div>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 md:gap-x-10">
        <div>
          <Etapa numero={1} titulo="Empresa" estado={etapa1 ? 'concluida' : 'ativa'}>
            {nivel === 'plataforma' && (
              <div className="mb-4">
                <Segmentado
                  rotulo="Tipo"
                  valor={tipo}
                  onMudar={setTipo}
                  opcoes={[
                    { id: 'assinante', rotulo: 'Assinante' },
                    { id: 'revenda', rotulo: 'Revenda' },
                  ]}
                />
                <p className="mt-2 text-[12.5px] text-slate-500 dark:text-zinc-400">
                  {tipo === 'revenda' ? 'Revenda cria e administra as próprias assinantes.' : 'Assinante usa o sistema com a equipe e os clientes dela.'}
                </p>
              </div>
            )}
            <div className="space-y-3">
              <label className="block">
                <span className={classeRotulo}>Nome</span>
                <input value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} maxLength={120} className={classeCampo} placeholder="Ex.: Clínica Vida Plena" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className={classeRotulo}>CNPJ ou CPF</span>
                  <input value={dados.documento} onChange={(e) => setDados({ ...dados, documento: e.target.value })} maxLength={30} className={classeCampo} />
                </label>
                <label className="block">
                  <span className={classeRotulo}>Telefone</span>
                  <input value={dados.contato_telefone} onChange={(e) => setDados({ ...dados, contato_telefone: e.target.value })} maxLength={30} className={classeCampo} />
                </label>
              </div>
            </div>
            {nivel === 'plataforma' && tipo === 'assinante' && revendas.length > 0 && (
              <label className="block mt-4">
                <span className={classeRotulo}>Vendida por</span>
                <select value={paiId} onChange={(e) => setPaiId(e.target.value)} className={`${classeCampo} cursor-pointer`}>
                  <option value="">Direto pela plataforma</option>
                  {revendas.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </Etapa>
          <Etapa numero={2} titulo="Plano e limites" descricao="Vazio = sem limite. Você pode mudar depois." estado={!etapa1 ? 'travada' : 'concluida'} fimDeColuna="md">
            <CamposLimites tipo={tipo} valor={limites} onMudar={setLimites} />
            <div className="mt-5">
              <CamposContrato valor={contrato} onMudar={setContrato} />
            </div>
          </Etapa>
        </div>
        <div className="md:pl-10 md:border-l border-black/[0.06] dark:border-white/[0.11]">
          <Etapa numero={3} titulo="Primeiro administrador" descricao="Quem vai entrar primeiro. Ele troca a senha no primeiro acesso e cadastra o resto da equipe." estado={!etapa1 ? 'travada' : etapa3 ? 'concluida' : 'ativa'} ultima>
            <div className="space-y-3">
              <label className="block">
                <span className={classeRotulo}>Nome</span>
                <input value={admin.nome} onChange={(e) => setAdmin({ ...admin, nome: e.target.value })} maxLength={120} className={classeCampo} />
              </label>
              <label className="block">
                <span className={classeRotulo}>E-mail de acesso</span>
                <input type="email" autoComplete="off" value={admin.email} onChange={(e) => setAdmin({ ...admin, email: e.target.value })} className={classeCampo} placeholder="admin@empresa.com.br" />
              </label>
              <label className="block">
                <span className={classeRotulo}>Senha inicial</span>
                <div className="flex gap-2">
                  <input value={admin.senha} onChange={(e) => setAdmin({ ...admin, senha: e.target.value })} className={`${classeCampo} font-mono`} autoComplete="new-password" />
                  <button type="button" onClick={() => setAdmin({ ...admin, senha: gerarSenha() })} className="h-11 px-3.5 rounded-xl text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] cursor-pointer whitespace-nowrap">
                    Gerar outra
                  </button>
                </div>
                <span className="block mt-1.5 text-[12px] text-slate-500 dark:text-zinc-400">Envie por um canal seguro. Ela vale só para o primeiro acesso.</span>
              </label>
            </div>
          </Etapa>
        </div>
      </div>
    </ModalEtapas>
  );
}

function GerenciarModal({ org, onFechar, onAtualizada }) {
  const [aba, setAba] = useState('contrato');
  const [limites, setLimites] = useState({});
  const [contrato, setContrato] = useState({});
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!org) return;
    setAba('contrato');
    setLimites(org.limites || {});
    setContrato({ plano: org.contrato?.plano || '', valor_mensal: org.contrato?.valor_mensal ?? '', dia_vencimento: org.contrato?.dia_vencimento ?? '', inicio: new Date().toISOString().slice(0, 10), fim: '' });
    setMotivo('');
    setErro('');
  }, [org?.id]);

  const fazer = async (corpo, sucesso) => {
    setEnviando(true);
    setErro('');
    try {
      await acaoPlataforma({ id: org.id, ...corpo });
      showToast(sucesso, 'success');
      onAtualizada();
      onFechar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <ModalEtapas
      aberto={Boolean(org)}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-xl"
      idTitulo="gerenciar-org-titulo"
      titulo={org?.nome || ''}
      subtitulo={org ? `${org.tipo === 'revenda' ? 'Revenda' : 'Assinante'} · ${ROTULO_STATUS[org.status]}` : ''}
      rodape={<ErroRodape erro={erro} />}
    >
      {org && (
        <div className="space-y-6">
          <Segmentado
            rotulo="Seções"
            valor={aba}
            onMudar={setAba}
            opcoes={[
              { id: 'contrato', rotulo: 'Plano e contrato' },
              { id: 'situacao', rotulo: 'Situação' },
            ]}
          />
          {aba === 'contrato' ? (
            <div className="space-y-5">
              {org.contrato && (
                <div className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] px-4 py-3 text-[13px]">
                  <p className="font-semibold">
                    Atual: {org.contrato.plano} · {formatarMoeda(org.contrato.valor_mensal)}/mês
                  </p>
                  <p className="text-slate-500 dark:text-zinc-400">
                    Desde {new Date(`${org.contrato.inicio}T12:00:00`).toLocaleDateString('pt-BR')}
                    {org.contrato.dia_vencimento ? ` · vence todo dia ${org.contrato.dia_vencimento}` : ''} · {STATUS_CONTRATO[org.contrato.status]}
                  </p>
                </div>
              )}
              <CamposLimites tipo={org.tipo} valor={limites} onMudar={setLimites} />
              <CamposContrato valor={contrato} onMudar={setContrato} />
              <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">Salvar registra um novo contrato a partir da data de início e encerra o anterior. Os limites passam a valer na hora.</p>
              <div className="flex justify-end">
                <button type="button" disabled={enviando || !contrato.plano?.trim()} onClick={() => fazer({ acao: 'contrato', contrato, limites }, 'Contrato registrado.')} className={classeBotaoPrimario}>
                  {enviando && <Spinner />}
                  Registrar contrato
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block">
                <span className={classeRotulo}>Motivo (fica registrado para a empresa)</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={classeCampo} placeholder="Ex.: pagamento em atraso" />
              </label>
              <div className="flex flex-wrap gap-2">
                {org.status !== 'ativa' && (
                  <button type="button" disabled={enviando} onClick={() => fazer({ acao: 'status', status: 'ativa', motivo }, 'Empresa reativada.')} className={classeBotaoPrimario}>
                    Reativar
                  </button>
                )}
                {org.status === 'ativa' && (
                  <button type="button" disabled={enviando} onClick={() => fazer({ acao: 'status', status: 'suspensa', motivo }, 'Empresa suspensa.')} className="h-11 px-5 rounded-full text-sm font-semibold bg-amber-500 text-white cursor-pointer disabled:opacity-50">
                    Suspender acesso
                  </button>
                )}
                {org.status !== 'cancelada' && (
                  <button type="button" disabled={enviando} onClick={() => fazer({ acao: 'status', status: 'cancelada', motivo }, 'Empresa cancelada.')} className="h-11 px-5 rounded-full text-sm font-semibold text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30 cursor-pointer disabled:opacity-50">
                    Cancelar contrato
                  </button>
                )}
              </div>
              <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                Suspensa ou cancelada: ninguém da empresa entra, na hora. Nenhum dado é apagado; ao reativar, tudo volta como estava.
              </p>
            </div>
          )}
        </div>
      )}
    </ModalEtapas>
  );
}

function EntrarSuporteModal({ org, onFechar }) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    setMotivo('');
    setErro('');
  }, [org?.id]);
  const entrar = async () => {
    setEnviando(true);
    setErro('');
    try {
      await acaoPlataforma({ acao: 'entrar_suporte', id: org.id, motivo });
      window.location.reload();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };
  return (
    <ModalEtapas
      aberto={Boolean(org)}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-lg"
      idTitulo="suporte-org-titulo"
      titulo={`Entrar em ${org?.nome || ''}`}
      subtitulo="Você vê o sistema como administrador desta empresa por 2 horas."
      rodape={
        <>
          <ErroRodape erro={erro} />
          <div className="flex justify-end gap-2.5">
            <button type="button" onClick={onFechar} disabled={enviando} className={classeBotaoTexto}>
              Cancelar
            </button>
            <button type="button" onClick={entrar} disabled={enviando || motivo.trim().length < 3} className={classeBotaoPrimario}>
              {enviando && <Spinner />}
              Entrar
            </button>
          </div>
        </>
      }
    >
      <label className="block">
        <span className={classeRotulo}>Motivo do acesso</span>
        <input autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={300} className={classeCampo} placeholder="Ex.: cliente pediu ajuda para configurar a fila" />
      </label>
      <p className="mt-3 text-[12.5px] text-slate-500 dark:text-zinc-400 leading-relaxed">
        A entrada, o motivo e a saída ficam na auditoria da própria empresa (LGPD). Para voltar, use “Sair do suporte” na barra que aparece embaixo.
      </p>
    </ModalEtapas>
  );
}

// ------------------------------------------------------------------------------
// Tela
// ------------------------------------------------------------------------------
export default function PlataformaView() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState('todas');
  const [busca, setBusca] = useState('');
  const [novaAberta, setNovaAberta] = useState(false);
  const [gerenciar, setGerenciar] = useState(null);
  const [suporte, setSuporte] = useState(null);

  const carregar = () =>
    fetchPlataforma()
      .then((d) => {
        setDados(d);
        setErro('');
      })
      .catch((e) => setErro(e.message));
  useEffect(() => {
    carregar();
  }, []);

  const nivel = dados?.gestao?.nivel || 'plataforma';
  const orgs = dados?.organizacoes || [];
  const revendas = orgs.filter((o) => o.tipo === 'revenda');
  const nomePorId = useMemo(() => Object.fromEntries(orgs.map((o) => [o.id, o.nome])), [orgs]);
  const termo = busca.trim().toLowerCase();
  const visiveis = orgs.filter((o) => {
    if (filtro === 'assinantes' && o.tipo !== 'assinante') return false;
    if (filtro === 'revendas' && o.tipo !== 'revenda') return false;
    if (filtro === 'suspensas' && o.status === 'ativa') return false;
    return !termo || [o.nome, o.documento, o.contato_email].some((t) => String(t || '').toLowerCase().includes(termo));
  });
  const ativas = orgs.filter((o) => o.status === 'ativa');
  const receita = ativas.reduce((soma, o) => soma + (o.contrato && o.contrato.status !== 'encerrado' ? Number(o.contrato.valor_mensal) || 0 : 0), 0);

  return (
    <div className="space-y-8 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-5 pt-2">
        <div>
          <h1 className="text-[30px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-tight">{nivel === 'revenda' ? 'Revenda' : 'Plataforma'}</h1>
          <p className="mt-1.5 text-[14.5px] text-slate-500 dark:text-zinc-400 max-w-xl">
            {nivel === 'revenda' ? 'As empresas que você vende: plano, limites, situação e suporte.' : 'Revendas e empresas assinantes do RM Controle: contratos, limites, situação e suporte.'}
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.97 }} type="button" onClick={() => setNovaAberta(true)} className="h-11 px-5 rounded-full bg-rm-acento dark:bg-rm-acento-escuro text-white dark:text-zinc-950 text-[14px] font-semibold shadow-md shadow-rm-acento/20 flex items-center gap-2 cursor-pointer">
          <span className="text-[18px] leading-none -mt-px">+</span>
          Nova empresa
        </motion.button>
      </header>

      {erro && (
        <div role="alert" className="rounded-[22px] bg-amber-500/10 text-amber-800 dark:text-amber-300 px-5 py-4 text-[14px]">
          {erro}
        </div>
      )}

      {!dados && !erro ? (
        <div className="p-5 rounded-[22px] bg-white dark:bg-rm-cartao-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.09]">
          <ListSkeleton linhas={4} />
        </div>
      ) : dados ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metrica rotulo="Assinantes ativas" valor={ativas.filter((o) => o.tipo === 'assinante').length} detalhe={`${orgs.filter((o) => o.tipo === 'assinante').length} no total`} />
            {nivel === 'plataforma' && <Metrica rotulo="Revendas" valor={revendas.length} detalhe={`${revendas.filter((r) => r.status === 'ativa').length} ativas`} />}
            <Metrica rotulo="Receita mensal contratada" valor={formatarMoeda(receita)} detalhe="contratos ativos" />
            <Metrica rotulo="Suspensas ou canceladas" valor={orgs.length - ativas.length} />
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <Segmentado
              rotulo="Filtro"
              valor={filtro}
              onMudar={setFiltro}
              opcoes={[
                { id: 'todas', rotulo: 'Todas', contador: orgs.length },
                { id: 'assinantes', rotulo: 'Assinantes' },
                ...(nivel === 'plataforma' ? [{ id: 'revendas', rotulo: 'Revendas' }] : []),
                { id: 'suspensas', rotulo: 'Suspensas' },
              ]}
            />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome, documento ou e-mail"
              aria-label="Buscar empresas"
              className="lg:ml-auto w-full lg:w-[320px] h-10 px-4 rounded-full bg-white dark:bg-white/[0.06] ring-1 ring-black/[0.08] dark:ring-white/[0.1] text-[13.5px] outline-none focus:ring-2 focus:ring-rm-acento/30 placeholder:text-slate-400"
            />
          </div>

          {visiveis.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[15px] font-semibold">{orgs.length ? 'Nada encontrado' : 'Nenhuma empresa ainda'}</p>
              <p className="mt-1 text-[13px] text-slate-500 dark:text-zinc-400">{orgs.length ? 'Ajuste a busca ou o filtro.' : 'Crie a primeira empresa em “Nova empresa”.'}</p>
            </div>
          ) : (
            <motion.ul layout className="grid gap-3 grid-cols-1 xl:grid-cols-2">
              <AnimatePresence initial={false}>
                {visiveis.map((o) => (
                  <motion.li key={o.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={MOLA} className="rounded-[22px] bg-white dark:bg-rm-cartao-escuro ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-5">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-[16px] font-semibold tracking-tight truncate">{o.nome}</h3>
                          <span className={`h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center ${COR_STATUS[o.status]}`}>{ROTULO_STATUS[o.status]}</span>
                          {o.tipo === 'revenda' && <span className="h-6 px-2.5 rounded-full text-[11px] font-semibold inline-flex items-center bg-violet-500/12 text-violet-700 dark:text-violet-300">Revenda</span>}
                        </div>
                        <p className="mt-0.5 text-[12.5px] text-slate-500 dark:text-zinc-400 truncate">
                          {o.contrato ? `${o.contrato.plano} · ${formatarMoeda(o.contrato.valor_mensal)}/mês` : 'Sem contrato registrado'}
                          {o.pai_id && nomePorId[o.pai_id] ? ` · vendida por ${nomePorId[o.pai_id]}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3">
                      {consumo(o.uso, o.limites).map((item) => (
                        <BarraConsumo key={item.id} item={item} />
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t border-black/[0.06] dark:border-white/[0.08] flex items-center gap-2">
                      {o.id === dados.minhaOrganizacao ? (
                        <span className="h-9 px-3.5 rounded-full text-[13px] font-medium bg-rm-acento/10 text-rm-acento dark:text-rm-acento-vivo inline-flex items-center">Sua empresa</span>
                      ) : o.tipo === 'assinante' && o.status === 'ativa' && (
                        <button type="button" onClick={() => setSuporte(o)} className="h-9 px-3.5 rounded-full text-[13px] font-semibold bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] cursor-pointer">
                          Entrar para suporte
                        </button>
                      )}
                      <button type="button" onClick={() => setGerenciar(o)} className="h-9 px-3.5 rounded-full text-[13px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] hover:bg-black/[0.03] dark:hover:bg-white/[0.06] cursor-pointer">
                        Gerenciar
                      </button>
                      <span className="ml-auto text-[12px] text-slate-400">desde {new Date(o.criado_em).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}</span>
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </>
      ) : null}

      <NovaEmpresaModal
        aberto={novaAberta}
        onFechar={() => setNovaAberta(false)}
        nivel={nivel}
        revendas={revendas.filter((r) => r.status === 'ativa')}
        onCriada={(org, admin) => {
          showToast(`${org.nome} criada. Acesso do administrador: ${admin.email}`, 'success');
          carregar();
        }}
      />
      <GerenciarModal org={gerenciar} onFechar={() => setGerenciar(null)} onAtualizada={carregar} />
      <EntrarSuporteModal org={suporte} onFechar={() => setSuporte(null)} />
    </div>
  );
}

/** Barra fixa enquanto alguém da plataforma está dentro de uma empresa para dar suporte. */
export function BarraSuporte({ organizacao }) {
  const [saindo, setSaindo] = useState(false);
  if (!organizacao?.suporte) return null;
  const sair = async () => {
    setSaindo(true);
    try {
      await acaoPlataforma({ acao: 'sair_suporte' });
    } finally {
      window.location.reload();
    }
  };
  return (
    // O deslocamento horizontal fica no próprio movimento (uma classe translate seria sobrescrita pela animação)
    <motion.div initial={{ y: 40, x: '-50%', opacity: 0 }} animate={{ y: 0, x: '-50%', opacity: 1 }} transition={MOLA} role="status" className="fixed z-[45] left-1/2 bottom-[88px] md:bottom-6 flex items-center gap-3 pl-4 pr-1.5 py-1.5 rounded-full bg-amber-500 text-white shadow-[0_14px_34px_-10px_rgba(0,0,0,0.4)] max-w-[calc(100vw-120px)]">
      <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" aria-hidden="true" />
      <span className="text-[13px] font-medium truncate">
        Suporte em <strong>{organizacao.nome}</strong> · registrado na auditoria dela
      </span>
      <button type="button" onClick={sair} disabled={saindo} className="h-8 px-3.5 rounded-full bg-white text-amber-700 text-[12.5px] font-semibold cursor-pointer disabled:opacity-60 flex-shrink-0">
        Sair do suporte
      </button>
    </motion.div>
  );
}
