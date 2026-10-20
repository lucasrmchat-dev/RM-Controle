'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  getMotivosSuporte,
  getEquipeUsuarios,
  getEmpresaCredenciais,
  getNomeTecnico,
  registrarSuporteRetroativo,
  getEmpresas,
  getCategoriasDemandas,
} from '@/lib/storage';
import { classeCampo, classeRotulo } from './NovaEmpresaCampos';
import {
  ModalEtapas,
  Etapa,
  Combobox,
  Escolhido,
  Pilulas,
  ErroRodape,
  Spinner,
  normalizarBusca,
  classeBotaoPrimario,
  classeBotaoTexto,
} from './FormularioEtapas';
import { BuildingIcon, CheckIcon, UserIcon } from './Icons';
import { showToast } from './ToastNotification';

const agoraLocal = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

/**
 * Registro de atendimento já concluído (sem passar pela fila), no mesmo formato em etapas da Nova demanda.
 */
export default function RegisterSupportModal({ isOpen, onClose, empresaPreSelecionada = null, userEmail = 'admin@rmcontrole.com', onRegistered }) {
  const [empresas, setEmpresas] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [equipe, setEquipe] = useState([]);
  const [tecnico, setTecnico] = useState(null);
  const [departamentos, setDepartamentos] = useState([]);
  const [departamento, setDepartamento] = useState('');
  const [categorias, setCategorias] = useState([]);
  const [categoria, setCategoria] = useState('');
  const [dataAtendimento, setDataAtendimento] = useState('');
  const [solicitante, setSolicitante] = useState(null);
  const [resumo, setResumo] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const deps = getCategoriasDemandas();
    setDepartamentos(deps);
    setDepartamento(deps.includes('Suporte') ? 'Suporte' : deps[0] || 'Suporte');
    setCategorias(getMotivosSuporte().map((m) => m.nome).filter(Boolean));
    setCategoria('');

    const eq = getEquipeUsuarios() || [];
    const meuNome = getNomeTecnico(userEmail);
    const lista = eq.map((u) => ({ id: u.id || u.email, nome: u.nome, email: u.email, papel: u.papel }));
    if (!lista.some((u) => normalizarBusca(u.nome) === normalizarBusca(meuNome))) lista.unshift({ id: 'eu', nome: meuNome, email: userEmail });
    setEquipe(lista);
    setTecnico(lista.find((u) => normalizarBusca(u.nome) === normalizarBusca(meuNome)) || { nome: meuNome, email: userEmail });

    setDataAtendimento(agoraLocal());
    setSolicitante(null);
    setResumo('');
    setErro('');
    setEnviando(false);

    if (empresaPreSelecionada) {
      setEmpresa(empresaPreSelecionada);
    } else {
      setEmpresa(null);
      getEmpresas({ pageSize: 1000 }).then((res) => {
        const items = Array.isArray(res) ? res : res?.items || [];
        setEmpresas([...items].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR', { sensitivity: 'base' })));
      });
    }
  }, [isOpen, empresaPreSelecionada, userEmail]);

  // Contatos da empresa escolhida, para sugerir quem pediu
  const contatos = useMemo(() => {
    if (!empresa?.id) return [];
    const vistos = new Set();
    const lista = [];
    const add = (nome, detalhe) => {
      const n = (nome || '').trim();
      if (!n || vistos.has(normalizarBusca(n))) return;
      vistos.add(normalizarBusca(n));
      lista.push({ id: n, nome: n, detalhe });
    };
    (empresa.colaboradores || []).forEach((c) => add(c.nome, c.cargo || 'Colaborador'));
    (getEmpresaCredenciais(empresa.id) || []).forEach((c) => add(c.nome_usuario || c.rotulo, c.usuario_email || 'Acesso cadastrado'));
    return lista;
  }, [empresa]);

  const etapa1Ok = Boolean(empresa);
  const etapa2Ok = Boolean(departamento && categoria);

  const salvar = async () => {
    if (enviando) return;
    if (!empresa) return setErro('Escolha a empresa atendida.');
    if (!categoria) return setErro('Escolha a categoria do suporte.');
    setErro('');
    setEnviando(true);
    try {
      await registrarSuporteRetroativo({
        empresa_id: empresa.id,
        empresa_nome: empresa.nome,
        motivo: categoria,
        categorias: [departamento || 'Suporte'],
        observacoes: resumo.trim(),
        solicitante_nome: solicitante?.nome || '',
        atendente: tecnico?.nome || getNomeTecnico(userEmail),
        userEmail,
        data_atendimento: dataAtendimento ? new Date(dataAtendimento).toISOString() : null,
      });
      showToast(`Atendimento de ${empresa.nome} registrado.`, 'success');
      onRegistered?.();
      onClose();
    } catch (e) {
      setErro(e?.message || 'Não foi possível registrar o atendimento.');
    } finally {
      setEnviando(false);
    }
  };

  const rodape = (
    <>
      <ErroRodape erro={erro} />
      <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2.5">
        <p className="hidden md:block text-xs text-slate-500 dark:text-zinc-400 mr-auto max-w-sm">
          Entra no histórico da empresa, nos resolvidos e nos gráficos de categoria, sem alterar o tempo médio.
        </p>
        <button type="button" onClick={onClose} disabled={enviando} className={classeBotaoTexto}>
          Cancelar
        </button>
        <button type="button" onClick={salvar} disabled={enviando} className={classeBotaoPrimario}>
          {enviando ? <Spinner /> : <CheckIcon className="w-4 h-4 stroke-[2.5]" />}
          Salvar atendimento
        </button>
      </div>
    </>
  );

  return (
    <ModalEtapas
      aberto={isOpen}
      onFechar={onClose}
      bloqueado={enviando}
      idTitulo="retroativo-titulo"
      titulo="Registrar atendimento já feito"
      subtitulo="Para suportes resolvidos fora da fila, sem cronômetro."
      contexto={
        <span className="inline-flex items-center h-6 px-2.5 rounded-full bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] font-semibold">
          Suporte retroativo
        </span>
      }
      rodape={rodape}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-12">
        <div>
          <Etapa numero={1} titulo="Empresa e técnico" descricao="Quem foi atendido e quem atendeu." estado={etapa1Ok ? 'concluida' : 'ativa'}>
            <div className="space-y-4">
              <div>
                <span className={classeRotulo}>
                  Empresa <span className="text-red-600 dark:text-red-400">*</span>
                </span>
                {empresa ? (
                  <Escolhido
                    icone={<BuildingIcon className="w-4 h-4" />}
                    titulo={empresa.nome}
                    detalhe={empresa.servidor_alocado === 'servidor_2' ? 'Servidor 2' : empresa.servidor_alocado ? 'Servidor 1' : null}
                    onTrocar={empresaPreSelecionada ? null : () => {
                      setEmpresa(null);
                      setSolicitante(null);
                    }}
                  />
                ) : (
                  <Combobox
                    id="rt-empresa"
                    autoFocus
                    placeholder="Digite o nome da empresa"
                    opcoes={empresas}
                    onEscolher={setEmpresa}
                    renderOpcao={(e) => (
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium truncate">{e.nome}</span>
                        {e.servidor_alocado && (
                          <span className="text-[11px] text-slate-500 dark:text-zinc-400 flex-shrink-0">{e.servidor_alocado === 'servidor_2' ? 'Servidor 2' : 'Servidor 1'}</span>
                        )}
                      </span>
                    )}
                  />
                )}
              </div>

              <div>
                <span className={classeRotulo}>Técnico</span>
                {tecnico ? (
                  <Escolhido
                    icone={<UserIcon className="w-4 h-4" />}
                    titulo={tecnico.nome}
                    detalhe={normalizarBusca(tecnico.nome) === normalizarBusca(getNomeTecnico(userEmail)) ? 'Você' : tecnico.papel || null}
                    onTrocar={() => setTecnico(null)}
                  />
                ) : (
                  <Combobox
                    id="rt-tecnico"
                    placeholder="Buscar pessoa da equipe"
                    opcoes={equipe}
                    onEscolher={setTecnico}
                    renderOpcao={(u) => (
                      <span className="block min-w-0">
                        <span className="block text-sm font-medium truncate">{u.nome}</span>
                        {u.email && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{u.email}</span>}
                      </span>
                    )}
                  />
                )}
              </div>
            </div>
          </Etapa>

          <Etapa numero={2} titulo="Classificação" descricao="Para os relatórios e o histórico da empresa." estado={!etapa1Ok ? 'travada' : etapa2Ok ? 'concluida' : 'ativa'} fimDeColuna>
            <div className="space-y-5">
              <div>
                <span id="rt-dep" className={classeRotulo}>Departamento</span>
                <Pilulas rotuloId="rt-dep" opcoes={departamentos} selecionadas={[departamento]} onAlternar={setDepartamento} />
              </div>
              <div>
                <span id="rt-cat" className={classeRotulo}>
                  Categoria do suporte <span className="text-red-600 dark:text-red-400">*</span>
                </span>
                <Pilulas rotuloId="rt-cat" opcoes={categorias} selecionadas={[categoria]} onAlternar={setCategoria} cor="marca" />
              </div>
            </div>
          </Etapa>
        </div>

        <div className="lg:pl-12 lg:border-l border-black/[0.06] dark:border-white/[0.08]">
          <Etapa numero={3} titulo="Detalhes" descricao="Quando aconteceu e o que foi feito." estado={!etapa2Ok ? 'travada' : resumo.trim() ? 'concluida' : 'ativa'} ultima>
            <div className="space-y-5">
              <div>
                <label htmlFor="rt-data" className={classeRotulo}>Data e hora do atendimento</label>
                <input id="rt-data" type="datetime-local" value={dataAtendimento} onChange={(e) => setDataAtendimento(e.target.value)} className={`${classeCampo} font-mono text-[13px]`} />
              </div>

              <div>
                <span className={classeRotulo}>
                  Quem pediu <span className="font-normal text-slate-500 dark:text-zinc-400">(opcional)</span>
                </span>
                {solicitante ? (
                  <Escolhido icone={<UserIcon className="w-4 h-4" />} titulo={solicitante.nome} detalhe={solicitante.detalhe} onTrocar={() => setSolicitante(null)} />
                ) : (
                  <Combobox
                    id="rt-solicitante"
                    placeholder="Buscar ou digitar um nome"
                    opcoes={contatos}
                    onEscolher={setSolicitante}
                    onNova={(nome) => setSolicitante({ nome, detalhe: 'Informado neste registro' })}
                    opcaoNova={(t) => `Usar “${t}”`}
                    renderOpcao={(c) => (
                      <span className="block min-w-0">
                        <span className="block text-sm font-medium truncate">{c.nome}</span>
                        {c.detalhe && <span className="block text-xs text-slate-500 dark:text-zinc-400 truncate">{c.detalhe}</span>}
                      </span>
                    )}
                  />
                )}
              </div>

              <div>
                <label htmlFor="rt-resumo" className={classeRotulo}>O que foi feito</label>
                <textarea
                  id="rt-resumo"
                  rows={4}
                  value={resumo}
                  onChange={(e) => setResumo(e.target.value)}
                  placeholder="Ex.: reescaneado o QR code da instância e ajustada a fila do comercial."
                  className={`${classeCampo} h-auto py-3 leading-relaxed resize-none`}
                />
              </div>
            </div>
          </Etapa>
        </div>
      </div>
    </ModalEtapas>
  );
}
