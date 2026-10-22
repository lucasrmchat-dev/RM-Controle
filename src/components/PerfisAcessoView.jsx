'use client';

import React, { useEffect, useState } from 'react';
import { getPerfisAcesso, fetchPerfisAcesso, salvarPerfilAcesso, excluirPerfilAcesso, getCategoriasDemandas, getLocalData } from '@/lib/storage';
import { MODULOS } from '@/lib/perfis';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { ModalEtapas, Etapa, ErroRodape, Spinner, classeBotaoPrimario, classeBotaoTexto } from './FormularioEtapas';
import { CheckIcon } from './Icons';
import ConfirmModal from './ConfirmModal';
import { showToast } from './ToastNotification';

const VAZIO = { nome: '', descricao: '', administrador: false, modulos: ['fila'], todos_departamentos: false, departamentos: [] };

function Interruptor({ ligado, onMudar, rotulo }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onMudar(!ligado)}
      className={`relative w-[42px] h-[26px] rounded-full flex-shrink-0 cursor-pointer transition-colors ${ligado ? 'bg-[#4d7c0f] dark:bg-[#84cc16]' : 'bg-black/[0.12] dark:bg-white/[0.18]'}`}
    >
      <span className={`absolute top-[2px] left-[2px] w-[22px] h-[22px] rounded-full bg-white shadow transition-transform ${ligado ? 'translate-x-4' : ''}`} />
    </button>
  );
}

/** Pílula de escolha múltipla (módulos e departamentos). */
function Opcao({ marcada, onClick, titulo, detalhe }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={marcada}
      className={`text-left rounded-2xl px-3.5 py-3 ring-1 transition-colors cursor-pointer flex items-start gap-3 ${
        marcada ? 'ring-[#1d1d1f] dark:ring-white bg-black/[0.03] dark:bg-white/[0.06]' : 'ring-black/[0.1] dark:ring-white/[0.12] hover:ring-black/25 dark:hover:ring-white/25'
      }`}
    >
      <span
        className={`mt-0.5 w-[18px] h-[18px] rounded-md flex items-center justify-center flex-shrink-0 ${
          marcada ? 'bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f]' : 'ring-1 ring-black/20 dark:ring-white/25'
        }`}
      >
        {marcada && <CheckIcon className="w-3 h-3 stroke-[3]" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium">{titulo}</span>
        {detalhe && <span className="block text-[12px] text-slate-500 dark:text-zinc-400">{detalhe}</span>}
      </span>
    </button>
  );
}

function EditorPerfil({ aberto, perfil, onFechar, onSalvo }) {
  const [form, setForm] = useState(VAZIO);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const departamentos = getCategoriasDemandas();

  useEffect(() => {
    if (!aberto) return;
    setForm(perfil ? { ...VAZIO, ...perfil } : VAZIO);
    setErro('');
    setEnviando(false);
  }, [aberto, perfil]);

  const alternar = (campo, valor) =>
    setForm((f) => ({ ...f, [campo]: f[campo].includes(valor) ? f[campo].filter((v) => v !== valor) : [...f[campo], valor] }));

  const salvar = async () => {
    if (!form.nome.trim()) return setErro('Dê um nome ao perfil.');
    if (!form.administrador && !form.modulos.length) return setErro('Escolha pelo menos um módulo.');
    if (!form.administrador && form.modulos.includes('fila') && !form.todos_departamentos && !form.departamentos.length) {
      return setErro('Escolha os departamentos que este perfil enxerga (ou "Todos").');
    }
    setEnviando(true);
    setErro('');
    try {
      await salvarPerfilAcesso({
        id: perfil?.id,
        nome: form.nome,
        descricao: form.descricao,
        administrador: form.administrador,
        modulos: form.modulos,
        todos_departamentos: form.todos_departamentos,
        departamentos: form.departamentos,
      });
      showToast(perfil ? 'Perfil atualizado.' : 'Perfil criado.', 'success');
      onSalvo();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5">
        <button type="button" onClick={onFechar} disabled={enviando} className={classeBotaoTexto}>
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={enviando} className={classeBotaoPrimario}>
          {enviando ? <Spinner /> : <CheckIcon className="w-4 h-4 stroke-[2.5]" />}
          {perfil ? 'Salvar perfil' : 'Criar perfil'}
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-3xl"
      idTitulo="perfil-acesso-titulo"
      titulo={perfil ? `Editar perfil "${perfil.nome}"` : 'Novo perfil de acesso'}
      subtitulo="O que quem tem este perfil enxerga e pode usar no sistema."
      rodape={rodape}
    >
      <Etapa numero={1} titulo="Identificação" descricao="Como o perfil aparece na equipe." estado={form.nome.trim() ? 'concluida' : 'ativa'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pf-nome" className={classeRotulo}>
              Nome <span className="text-red-600 dark:text-red-400">*</span>
            </label>
            <input id="pf-nome" autoFocus value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} maxLength={60} placeholder="Ex.: Suporte N1, Gestor, Comercial" className={classeCampo} />
          </div>
          <div>
            <label htmlFor="pf-desc" className={classeRotulo}>
              Descrição <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
            </label>
            <input id="pf-desc" value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} maxLength={200} placeholder="Para quem é este perfil" className={classeCampo} />
          </div>
        </div>
        <div className="mt-4 rounded-2xl ring-1 ring-black/[0.08] dark:ring-white/[0.1] p-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-[13.5px] font-medium">Administrador</p>
            <p className="text-[12px] text-slate-500 dark:text-zinc-400">Acesso total: todos os módulos, todos os departamentos e as Configurações Avançadas (equipe, perfis, servidores).</p>
          </div>
          <Interruptor ligado={form.administrador} onMudar={(v) => setForm({ ...form, administrador: v })} rotulo="Administrador" />
        </div>
      </Etapa>

      <Etapa numero={2} titulo="Módulos" descricao="Telas que aparecem no menu." estado={form.administrador ? 'travada' : form.modulos.length ? 'concluida' : 'ativa'}>
        {form.administrador ? (
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">Administradores acessam todos os módulos.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {MODULOS.map((m) => (
              <Opcao key={m.id} marcada={form.modulos.includes(m.id)} onClick={() => alternar('modulos', m.id)} titulo={m.rotulo} detalhe={m.descricao} />
            ))}
          </div>
        )}
      </Etapa>

      <Etapa
        numero={3}
        titulo="Departamentos"
        descricao="Demandas, métricas e alertas só destes departamentos. Criar demanda para outro departamento continua possível, mas depois ela não aparece para este perfil."
        estado={form.administrador ? 'travada' : form.todos_departamentos || form.departamentos.length ? 'concluida' : 'ativa'}
        ultima
      >
        {form.administrador ? (
          <p className="text-[13px] text-slate-500 dark:text-zinc-400">Administradores enxergam todos os departamentos.</p>
        ) : (
          <div className="space-y-3">
            <Opcao
              marcada={form.todos_departamentos}
              onClick={() => setForm({ ...form, todos_departamentos: !form.todos_departamentos })}
              titulo="Todos os departamentos"
              detalhe="Inclui os que forem criados depois"
            />
            {!form.todos_departamentos && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {departamentos.map((d) => (
                  <Opcao key={d} marcada={form.departamentos.includes(d)} onClick={() => alternar('departamentos', d)} titulo={d} />
                ))}
              </div>
            )}
          </div>
        )}
      </Etapa>
    </ModalEtapas>
  );
}

/** Configurações › Perfis de acesso: cria, edita e exclui perfis (só administradores). */
export default function PerfisAcessoView() {
  const [perfis, setPerfis] = useState(getPerfisAcesso());
  const [carregado, setCarregado] = useState(false);
  const [editor, setEditor] = useState(null); // { perfil? }
  const [excluir, setExcluir] = useState(null);
  const migracaoPendente = getLocalData('perfis_migracao_pendente', false);

  const carregar = async () => {
    setPerfis(await fetchPerfisAcesso());
    setCarregado(true);
  };
  useEffect(() => {
    carregar();
  }, []);

  const resumoModulos = (p) =>
    p.administrador ? 'Acesso total' : MODULOS.filter((m) => (p.modulos || []).includes(m.id)).map((m) => m.rotulo).join(' · ') || 'Nenhum módulo';
  const resumoDepartamentos = (p) =>
    p.administrador || p.todos_departamentos ? 'Todos os departamentos' : (p.departamentos || []).join(', ') || 'Nenhum departamento';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Perfis de acesso</h3>
          <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1 max-w-2xl">
            Crie perfis com os módulos e departamentos que cada função enxerga e atribua aos membros em Servidores &amp; Equipe. Quem ainda não tem perfil continua com o acesso atual.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ perfil: null })}
          disabled={migracaoPendente}
          className="h-10 px-4 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-[13px] font-semibold hover:opacity-90 disabled:opacity-40 cursor-pointer flex-shrink-0"
        >
          + Novo perfil
        </button>
      </div>

      {migracaoPendente && (
        <div className="rounded-2xl bg-amber-500/[0.08] ring-1 ring-amber-500/20 p-4 text-[13px] text-amber-900 dark:text-amber-200">
          Para usar perfis, rode o script <code className="font-mono text-[12px]">supabase/migration_perfis_acesso.sql</code> no SQL Editor do Supabase e recarregue a página.
        </div>
      )}

      {!carregado && !perfis.length ? (
        <div className="h-32 rounded-3xl bg-black/[0.03] dark:bg-white/[0.04] animate-pulse" />
      ) : perfis.length === 0 ? (
        !migracaoPendente && (
          <div className="rounded-3xl ring-1 ring-dashed ring-black/[0.12] dark:ring-white/[0.15] p-10 text-center">
            <p className="text-[14px] font-medium">Nenhum perfil criado ainda</p>
            <p className="text-[13px] text-slate-500 dark:text-zinc-400 mt-1">Comece por um perfil de gestor (administrador) e outros por função, como Suporte ou Comercial.</p>
          </div>
        )
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {perfis.map((p) => (
            <li key={p.id} className="rounded-3xl bg-white dark:bg-[#1e1e21] ring-1 ring-black/[0.06] dark:ring-white/[0.09] p-5 flex flex-col">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold flex items-center gap-2">
                    {p.nome}
                    {p.administrador && <span className="h-5 px-2 rounded-full text-[10.5px] font-semibold bg-[#4d7c0f]/12 text-[#4d7c0f] dark:text-[#a3e635] flex items-center">Administrador</span>}
                  </p>
                  {p.descricao && <p className="text-[12.5px] text-slate-500 dark:text-zinc-400 mt-0.5">{p.descricao}</p>}
                </div>
                <span className="text-[12px] text-slate-500 dark:text-zinc-400 whitespace-nowrap">
                  {p.membros || 0} {p.membros === 1 ? 'membro' : 'membros'}
                </span>
              </div>
              <dl className="mt-4 space-y-2 text-[12.5px] flex-1">
                <div>
                  <dt className="text-slate-500 dark:text-zinc-400">Módulos</dt>
                  <dd className="font-medium">{resumoModulos(p)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-zinc-400">Departamentos</dt>
                  <dd className="font-medium">{resumoDepartamentos(p)}</dd>
                </div>
              </dl>
              <div className="flex items-center gap-1 mt-4 -mb-1">
                <button type="button" onClick={() => setEditor({ perfil: p })} className="h-8 px-3 rounded-full text-[12.5px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08] cursor-pointer">
                  Editar
                </button>
                <button type="button" onClick={() => setExcluir(p)} className="h-8 px-3 rounded-full text-[12.5px] font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer">
                  Excluir
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <EditorPerfil
        aberto={Boolean(editor)}
        perfil={editor?.perfil || null}
        onFechar={() => setEditor(null)}
        onSalvo={() => {
          setEditor(null);
          carregar();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(excluir)}
        title={`Excluir o perfil "${excluir?.nome || ''}"?`}
        message={
          excluir?.membros
            ? `${excluir.membros} ${excluir.membros === 1 ? 'membro fica' : 'membros ficam'} sem perfil e volta${excluir.membros === 1 ? '' : 'm'} ao acesso padrão de Suporte.`
            : 'Nenhum membro usa este perfil.'
        }
        confirmText="Excluir perfil"
        cancelText="Voltar"
        variant="danger"
        onConfirm={async () => {
          try {
            await excluirPerfilAcesso(excluir.id);
            showToast('Perfil excluído.', 'success');
            carregar();
          } catch (e) {
            showToast(e.message, 'error');
          } finally {
            setExcluir(null);
          }
        }}
        onClose={() => setExcluir(null)}
      />
    </div>
  );
}
