'use client';

import React, { useEffect, useState } from 'react';
import { excluirEmpresa, removerAcentos } from '@/lib/storage';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import { ModalEtapas, ErroRodape, Spinner, classeBotaoTexto } from './FormularioEtapas';
import { showToast } from './ToastNotification';

const normalizar = (s) => removerAcentos(String(s || '')).replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * Exclusão definitiva: pede o nome da empresa e a senha de quem está excluindo.
 * O servidor confere os dois e grava na auditoria quem cadastrou e quem excluiu.
 */
export default function ExcluirEmpresaModal({ aberto, onFechar, empresa, resumo = [], onExcluida }) {
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setNome('');
    setSenha('');
    setErro('');
    setEnviando(false);
  }, [aberto]);

  const nomeConfere = Boolean(empresa?.nome) && normalizar(nome) === normalizar(empresa.nome);
  const pronto = nomeConfere && senha.length > 0 && !enviando;

  const confirmar = async (e) => {
    e?.preventDefault();
    if (!pronto) return;
    setErro('');
    setEnviando(true);
    try {
      await excluirEmpresa(empresa.id, { senha, confirmacaoNome: nome });
      showToast(`${empresa.nome} foi excluída.`, 'success');
      onExcluida?.();
    } catch (err) {
      setErro(err?.message || 'Não foi possível excluir a empresa.');
      setSenha('');
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
        <button
          type="submit"
          form="form-excluir-empresa"
          disabled={!pronto}
          className="h-11 px-5 rounded-full text-sm font-semibold inline-flex items-center justify-center gap-2 bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {enviando && <Spinner />}
          Excluir definitivamente
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={aberto}
      onFechar={onFechar}
      bloqueado={enviando}
      largura="max-w-lg"
      idTitulo="excluir-empresa-titulo"
      titulo="Excluir empresa"
      subtitulo="Essa ação não pode ser desfeita."
      rodape={rodape}
    >
      <form id="form-excluir-empresa" onSubmit={confirmar} className="space-y-5">
        <div className="text-[13px] leading-relaxed text-slate-600 dark:text-zinc-300 space-y-2">
          <p>
            <strong className="text-[#1d1d1f] dark:text-white">{empresa?.nome}</strong> sai da lista de empresas junto com o que está guardado nela:
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {(resumo.length ? resumo : ['acessos e senhas', 'canais', 'checklist e configurações do servidor', 'observações']).map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="text-slate-500 dark:text-zinc-400">Os atendimentos já feitos continuam nos relatórios. A exclusão fica registrada na auditoria com o seu nome.</p>
        </div>

        <div>
          <label htmlFor="exc-nome" className={classeRotulo}>
            Para confirmar, digite <span className="font-semibold text-[#1d1d1f] dark:text-white select-all">{empresa?.nome}</span>
          </label>
          <input
            id="exc-nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            autoFocus
            className={classeCampo}
          />
        </div>

        <div>
          <label htmlFor="exc-senha" className={classeRotulo}>Sua senha</label>
          <input
            id="exc-senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            maxLength={128}
            className={classeCampo}
          />
        </div>
      </form>
    </ModalEtapas>
  );
}
