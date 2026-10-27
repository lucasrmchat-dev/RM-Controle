'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { fetchWhatsappAgenda, getWhatsappAgenda, salvarConfigWhatsapp, salvarPreferenciasWhatsapp, testarWhatsapp } from '@/lib/storage';
import {
  CANAIS,
  CONFIG_WHATSAPP_PADRAO,
  LEMBRETE_OPCOES,
  MODOS,
  PREFERENCIAS_PADRAO,
  VARIAVEIS,
  corpoPadrao,
  dadosDaReuniao,
  montarCorpo,
  textoTempoAntes,
  validarConfigWhatsapp,
} from '@/lib/whatsappAgenda';
import { Spinner } from './FormularioEtapas';
import { classeCampo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';

const cartao = 'rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-cartao-escuro p-5 sm:p-8';
const botaoEscuro = 'h-11 px-5 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-sm font-medium disabled:opacity-50 cursor-pointer flex items-center gap-2';

function Opcoes({ opcoes, valor, onMudar, rotulo }) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-2">
      {opcoes.map((o) => {
        const ativo = valor === o.id;
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={ativo}
            onClick={() => onMudar(o.id)}
            className={`min-h-9 px-3.5 py-1.5 rounded-full text-[13px] font-medium border cursor-pointer transition-colors ${
              ativo ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] border-transparent' : 'bg-white dark:bg-white/[0.04] border-black/[0.12] dark:border-white/[0.14] text-slate-700 dark:text-zinc-300 hover:border-black/25 dark:hover:border-white/25'
            }`}
          >
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------
// Configurações básicas: preferência de cada pessoa
// ------------------------------------------------------------------------------
const QUANDO = [
  { id: 'sempre', rotulo: 'Sempre' },
  { id: 'perguntar', rotulo: 'Perguntar em cada reunião' },
  { id: 'nunca', rotulo: 'Nunca' },
];

export function PreferenciasWhatsapp() {
  const [prefs, setPrefs] = useState(() => ({ ...PREFERENCIAS_PADRAO, ...(getWhatsappAgenda()?.preferencias || {}) }));
  const [pronto, setPronto] = useState(Boolean(getWhatsappAgenda()?.pronto));
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    fetchWhatsappAgenda()
      .then((w) => {
        if (!w) return;
        setPrefs({ ...PREFERENCIAS_PADRAO, ...(w.preferencias || {}) });
        setPronto(Boolean(w.pronto));
      })
      .catch(() => {});
  }, []);

  const salvar = async () => {
    setSalvando(true);
    try {
      setPrefs(await salvarPreferenciasWhatsapp(prefs));
      showToast('Preferências do WhatsApp salvas.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className={`${cartao} space-y-8`}>
      <div>
        <h2 className="text-xl font-semibold tracking-tight">WhatsApp nas reuniões</h2>
        <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-2xl">
          Quando a reunião tem o WhatsApp do cliente, o sistema pode pedir a confirmação e lembrar o cliente antes do horário. Escolha o que acontece por padrão nas reuniões que você agenda.
        </p>
        {!pronto && <p className="mt-3 text-[13px] text-amber-700 dark:text-amber-400">O envio ainda não foi ligado pelo administrador. Suas escolhas valem assim que for.</p>}
      </div>

      <div>
        <h3 className="text-[15px] font-semibold">Pedido de confirmação</h3>
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 mb-3">O cliente recebe um link para confirmar, remarcar ou cancelar.</p>
        <Opcoes rotulo="Pedido de confirmação" opcoes={QUANDO} valor={prefs.confirmacao} onMudar={(v) => setPrefs((p) => ({ ...p, confirmacao: v }))} />
      </div>

      <div>
        <h3 className="text-[15px] font-semibold">Lembrete antes da reunião</h3>
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 mb-3">Uma mensagem curta pouco antes do horário.</p>
        <Opcoes rotulo="Lembrete" opcoes={QUANDO} valor={prefs.lembrete} onMudar={(v) => setPrefs((p) => ({ ...p, lembrete: v }))} />
        {prefs.lembrete === 'sempre' && (
          <div className="mt-4">
            <p className="text-[12.5px] font-medium text-slate-500 dark:text-zinc-400 mb-2">Quanto tempo antes</p>
            <Opcoes rotulo="Tempo do lembrete" opcoes={LEMBRETE_OPCOES.map((m) => ({ id: m, rotulo: textoTempoAntes(m) }))} valor={prefs.lembrete_minutos} onMudar={(v) => setPrefs((p) => ({ ...p, lembrete_minutos: v }))} />
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={salvar} disabled={salvando} className={botaoEscuro}>
          {salvando && <Spinner />}
          Salvar
        </button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------------------
// Configurações avançadas: webhook, canal e mensagens (administradores)
// ------------------------------------------------------------------------------
const EXEMPLO = {
  titulo: 'Demonstração do RM Chat',
  participante_nome: 'Ana',
  responsavel_nome: 'Lucas',
  data: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
  hora_inicio: '14:00',
  link_reuniao: 'https://meet.google.com/abc-defg-hij',
  cliente_telefone: '85999990000',
  lembrete_minutos: 60,
};

function EditorMensagem({ tipo, titulo, valor, canal, onMudar }) {
  const modos = CANAIS[canal].modos;
  const inserir = (campo, variavel) => onMudar({ ...valor, [campo]: `${valor[campo] || ''}{${variavel}}` });
  return (
    <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] p-4 sm:p-5 space-y-4">
      <h3 className="text-[15px] font-semibold">{titulo}</h3>
      {modos.length > 1 && <Opcoes rotulo={`Tipo de mensagem: ${titulo}`} opcoes={modos.map((m) => ({ id: m, rotulo: MODOS[m].rotulo }))} valor={valor.modo} onMudar={(m) => onMudar({ ...valor, modo: m })} />}
      <p className="text-[12.5px] text-slate-500 dark:text-zinc-400">{MODOS[valor.modo].descricao}</p>

      {valor.modo === 'personalizada' ? (
        <div>
          <textarea value={valor.mensagem} onChange={(e) => onMudar({ ...valor, mensagem: e.target.value })} rows={5} maxLength={1000} aria-label={`Texto da mensagem: ${titulo}`} className={`${classeCampo} h-auto py-3 resize-y leading-relaxed`} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {VARIAVEIS.filter((v) => v.id !== 'telefone').map((v) => (
              <button key={v.id} type="button" title={v.rotulo} onClick={() => inserir('mensagem', v.id)} className="h-7 px-2.5 rounded-full text-[11.5px] font-medium bg-black/[0.04] dark:bg-white/[0.07] hover:bg-black/[0.08] dark:hover:bg-white/[0.12] cursor-pointer">
                {`{${v.id}}`}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
            <label className="block">
              <span className="block text-[12.5px] font-medium mb-1.5">{valor.modo === 'template' ? 'Nome do template na Meta' : 'Identificação da mensagem fixa (se a plataforma pedir)'}</span>
              <input value={valor.template} onChange={(e) => onMudar({ ...valor, template: e.target.value })} placeholder={tipo === 'lembrete' ? 'lembrete_reuniao' : 'confirmacao_reuniao'} className={`${classeCampo} font-mono text-[13px]`} />
            </label>
            {valor.modo === 'template' && (
              <label className="block">
                <span className="block text-[12.5px] font-medium mb-1.5">Idioma</span>
                <input value={valor.idioma} onChange={(e) => onMudar({ ...valor, idioma: e.target.value })} placeholder="pt_BR" className={`${classeCampo} font-mono text-[13px]`} />
              </label>
            )}
          </div>
          <div>
            <span className="block text-[12.5px] font-medium mb-1.5">Variáveis, na ordem do texto ({'{{1}}'}, {'{{2}}'}…)</span>
            <ol className="space-y-2">
              {valor.variaveis.map((v, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="w-10 text-[12px] font-mono text-slate-400 tabular-nums">{`{{${i + 1}}}`}</span>
                  <select
                    value={VARIAVEIS.some((x) => `{${x.id}}` === v) ? v : '__livre'}
                    onChange={(e) => onMudar({ ...valor, variaveis: valor.variaveis.map((x, k) => (k === i ? (e.target.value === '__livre' ? '' : e.target.value) : x)) })}
                    aria-label={`Variável ${i + 1}`}
                    className={`${classeCampo} flex-1 cursor-pointer`}
                  >
                    {VARIAVEIS.map((x) => (
                      <option key={x.id} value={`{${x.id}}`}>
                        {x.rotulo}
                      </option>
                    ))}
                    <option value="__livre">Texto fixo…</option>
                  </select>
                  {!VARIAVEIS.some((x) => `{${x.id}}` === v) && (
                    <input value={v} onChange={(e) => onMudar({ ...valor, variaveis: valor.variaveis.map((x, k) => (k === i ? e.target.value : x)) })} placeholder="Texto" aria-label={`Texto da variável ${i + 1}`} className={`${classeCampo} flex-1`} />
                  )}
                  <button type="button" onClick={() => onMudar({ ...valor, variaveis: valor.variaveis.filter((_, k) => k !== i) })} aria-label={`Remover variável ${i + 1}`} className="w-9 h-9 rounded-full text-slate-400 hover:text-rose-600 hover:bg-rose-500/[0.08] cursor-pointer">
                    ×
                  </button>
                </li>
              ))}
            </ol>
            {valor.variaveis.length < 10 && (
              <button type="button" onClick={() => onMudar({ ...valor, variaveis: [...valor.variaveis, '{cliente_nome}'] })} className="mt-2 h-8 px-3 rounded-full text-[12.5px] font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] cursor-pointer">
                + Variável
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function WhatsappAgendaSettings() {
  const [config, setConfig] = useState(CONFIG_WHATSAPP_PADRAO);
  const [info, setInfo] = useState(getWhatsappAgenda);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [mostrarCorpo, setMostrarCorpo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [telefoneTeste, setTelefoneTeste] = useState('');
  const [testando, setTestando] = useState(false);

  useEffect(() => {
    fetchWhatsappAgenda()
      .then((w) => {
        if (!w) return;
        setInfo(w);
        setConfig(w.config || CONFIG_WHATSAPP_PADRAO);
      })
      .catch((e) => setErro(e.message));
  }, []);

  const mudarCanal = (canal) => {
    const primeiro = CANAIS[canal].modos[0];
    setConfig((c) => ({
      ...c,
      canal,
      confirmacao: { ...c.confirmacao, modo: CANAIS[canal].modos.includes(c.confirmacao.modo) ? c.confirmacao.modo : primeiro },
      lembrete: { ...c.lembrete, modo: CANAIS[canal].modos.includes(c.lembrete.modo) ? c.lembrete.modo : primeiro },
    }));
  };

  // Prévia com dados de exemplo (mesma função que o servidor usa para enviar)
  const previa = useMemo(() => {
    try {
      const valida = validarConfigWhatsapp(config);
      const dados = dadosDaReuniao(EXEMPLO, { linkConfirmacao: 'https://seu-dominio/r/…', minutosAntes: 60 });
      return { confirmacao: montarCorpo(valida, 'confirmacao', { ...dados, telefone: '5585999990000' }), lembrete: montarCorpo(valida, 'lembrete', { ...dados, telefone: '5585999990000' }), erro: '' };
    } catch (e) {
      return { erro: e.message };
    }
  }, [config]);

  const salvar = async () => {
    setSalvando(true);
    setErro('');
    try {
      const w = await salvarConfigWhatsapp({ valor: config, url: url.trim() || undefined, token: token ? token : undefined });
      setInfo(w);
      setUrl('');
      setToken('');
      showToast('Configuração do WhatsApp salva.', 'success');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  const testar = async (tipo) => {
    setTestando(true);
    try {
      await testarWhatsapp(telefoneTeste, tipo);
      showToast('Mensagem de teste enviada. Confira no WhatsApp.', 'success');
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setTestando(false);
    }
  };

  return (
    <section className={`${cartao} space-y-9`}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">WhatsApp da agenda</h2>
          <p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed max-w-2xl">
            Para onde o sistema manda o pedido de confirmação e o lembrete de reunião. Cada envio é um POST com JSON para o webhook da sua plataforma de atendimento.
          </p>
        </div>
        <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer flex-shrink-0">
          <input type="checkbox" checked={config.ativo} onChange={(e) => setConfig((c) => ({ ...c, ativo: e.target.checked }))} className="w-4 h-4 accent-rm-acento cursor-pointer" />
          Envio ligado
        </label>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <label className="block">
          <span className="block text-[13px] font-semibold mb-1.5">Endereço do webhook</span>
          <input type="password" autoComplete="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={info?.webhook ? `Atual: ${info.webhook} (deixe vazio para manter)` : 'https://…'} className={`${classeCampo} font-mono text-[13px]`} />
          <span className="block mt-1.5 text-[12px] text-slate-500 dark:text-zinc-400">Fica guardado cifrado no servidor e nunca aparece inteiro de novo. Só https.</span>
        </label>
        <label className="block">
          <span className="block text-[13px] font-semibold mb-1.5">
            Token <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
          </span>
          <input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder={info?.tem_token ? 'Token salvo (deixe vazio para manter)' : 'Enviado como Authorization: Bearer'} className={`${classeCampo} font-mono text-[13px]`} />
        </label>
      </div>

      <div>
        <h3 className="text-[15px] font-semibold mb-1">Canal do WhatsApp</h3>
        <p className="text-[13px] text-slate-500 dark:text-zinc-400 mb-3 max-w-2xl">
          Na API oficial da Meta, mensagens que a empresa inicia precisam de um template aprovado: o texto é fixo e só as variáveis mudam. No QR Code dá para mandar texto livre ou uma mensagem fixa cadastrada na plataforma.
        </p>
        <Opcoes rotulo="Canal" opcoes={Object.entries(CANAIS).map(([id, c]) => ({ id, rotulo: c.rotulo }))} valor={config.canal} onMudar={mudarCanal} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <EditorMensagem tipo="confirmacao" titulo="Pedido de confirmação" valor={config.confirmacao} canal={config.canal} onMudar={(v) => setConfig((c) => ({ ...c, confirmacao: v }))} />
        <EditorMensagem tipo="lembrete" titulo="Lembrete" valor={config.lembrete} canal={config.canal} onMudar={(v) => setConfig((c) => ({ ...c, lembrete: v }))} />
      </div>

      <div>
        <h3 className="text-[15px] font-semibold mb-3">Prévia com dados de exemplo</h3>
        {previa.erro ? (
          <p className="text-sm text-rose-600 dark:text-rose-400">{previa.erro}</p>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {['confirmacao', 'lembrete'].map((t) => (
              <div key={t} className="rounded-2xl bg-black/[0.03] dark:bg-white/[0.04] p-4">
                <p className="text-[12px] font-semibold text-slate-500 dark:text-zinc-400 mb-2">{t === 'confirmacao' ? 'Confirmação' : 'Lembrete'}</p>
                <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap">{previa[t].previa}</p>
                <pre className="mt-3 text-[11.5px] font-mono whitespace-pre-wrap break-all text-slate-500 dark:text-zinc-400">{JSON.stringify(previa[t].corpo, null, 2)}</pre>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <button type="button" onClick={() => setMostrarCorpo((v) => !v)} aria-expanded={mostrarCorpo} className="text-[13px] font-semibold underline underline-offset-4 cursor-pointer">
          {mostrarCorpo ? 'Esconder' : 'Ajustar'} o formato do JSON enviado
        </button>
        {mostrarCorpo && (
          <div className="mt-3 space-y-2">
            <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 max-w-3xl">
              Use quando a plataforma esperar outros nomes de campo. Variáveis: {'{telefone}'}, {'{mensagem}'}, {'{template}'}, {'{idioma}'}, {'{tipo}'} e todas as da mensagem. Um campo com exatamente {'"{variaveis}"'} vira a lista de variáveis. Deixe vazio para o padrão.
            </p>
            <textarea
              value={config.corpo}
              onChange={(e) => setConfig((c) => ({ ...c, corpo: e.target.value }))}
              rows={7}
              spellCheck={false}
              placeholder={JSON.stringify(corpoPadrao(config.confirmacao.modo), null, 2)}
              aria-label="Formato do JSON enviado"
              className={`${classeCampo} h-auto py-3 font-mono text-[12.5px] resize-y`}
            />
          </div>
        )}
      </div>

      {erro && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {erro}
        </p>
      )}

      <div className="flex flex-col lg:flex-row lg:items-end gap-4 pt-2 border-t border-black/[0.06] dark:border-white/[0.08]">
        <div className="flex-1 pt-5">
          <span className="block text-[13px] font-semibold mb-1.5">Enviar teste para</span>
          <div className="flex flex-wrap gap-2">
            <input type="tel" value={telefoneTeste} onChange={(e) => setTelefoneTeste(e.target.value)} placeholder="(85) 99999-0000" aria-label="Telefone para teste" className={`${classeCampo} max-w-[220px]`} />
            <button type="button" disabled={testando || !info?.webhook} onClick={() => testar('confirmacao')} className="h-11 px-4 rounded-full text-sm font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] cursor-pointer disabled:opacity-40">
              Testar confirmação
            </button>
            <button type="button" disabled={testando || !info?.webhook} onClick={() => testar('lembrete')} className="h-11 px-4 rounded-full text-sm font-medium ring-1 ring-black/[0.12] dark:ring-white/[0.15] cursor-pointer disabled:opacity-40">
              Testar lembrete
            </button>
          </div>
          {!info?.webhook && <p className="mt-1.5 text-[12px] text-slate-500 dark:text-zinc-400">Salve o endereço do webhook para testar.</p>}
        </div>
        <button type="button" onClick={salvar} disabled={salvando} className={botaoEscuro}>
          {salvando && <Spinner />}
          Salvar configuração
        </button>
      </div>
    </section>
  );
}
