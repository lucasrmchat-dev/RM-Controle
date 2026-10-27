'use client';
import { useEffect, useRef, useState } from 'react';
import { fetchModelosTitulosAgenda, getCategoriasDemandas, salvarModelosTitulosAgenda } from '@/lib/storage';
import { MODELO_TITULO_PADRAO, sugestaoTituloReuniao } from '@/lib/titulosAgenda';
import { classeCampo } from './NovaEmpresaCampos';
import { showToast } from './ToastNotification';

function ModeloDepartamento({ departamento, valor, onMudar, bloqueado }) {
  const campo = useRef(null);
  const inserir = (variavel) => {
    const inicio = campo.current?.selectionStart ?? valor.length;
    const fim = campo.current?.selectionEnd ?? inicio;
    onMudar(valor.slice(0, inicio) + variavel + valor.slice(fim));
    requestAnimationFrame(() => { campo.current?.focus(); campo.current?.setSelectionRange(inicio + variavel.length, inicio + variavel.length); });
  };
  return <div className="rounded-2xl border border-black/[0.08] dark:border-white/[0.12] p-4 sm:p-5 space-y-3">
    <label className="block text-sm font-semibold"><span>{departamento}</span><textarea ref={campo} value={valor} onChange={(e) => onMudar(e.target.value)} disabled={bloqueado} maxLength={200} rows={2} placeholder={MODELO_TITULO_PADRAO} className={`${classeCampo} mt-2 h-auto py-3 resize-y font-normal`} /></label>
    <div className="flex flex-wrap gap-2">{['{cliente}', '{departamento}'].map((variavel) => <button key={variavel} type="button" disabled={bloqueado} onClick={() => inserir(variavel)} className="text-xs font-medium px-3 py-1.5 rounded-full border border-black/10 dark:border-white/15 cursor-pointer disabled:opacity-50">Inserir {variavel}</button>)}</div>
    <p className="text-xs text-slate-500 dark:text-zinc-400">Prévia: <span className="text-slate-700 dark:text-zinc-200">{sugestaoTituloReuniao(departamento, 'Cliente Exemplo', { [departamento]: valor })}</span></p>
  </div>;
}

export default function TitulosReuniaoSettings() {
  const [departamentos, setDepartamentos] = useState(getCategoriasDemandas);
  const [modelos, setModelos] = useState({});
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [tentativa, setTentativa] = useState(0);
  const [leituraOk, setLeituraOk] = useState(false);
  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    setLeituraOk(false);
    fetchModelosTitulosAgenda().then((lista) => { if (ativo) { setModelos(lista); setLeituraOk(true); } })
      .catch((e) => { if (ativo) setErro(e.message); })
      .finally(() => { if (ativo) setCarregando(false); });
    const atualizar = () => setDepartamentos(getCategoriasDemandas());
    window.addEventListener('departamentos_updated', atualizar);
    return () => { ativo = false; window.removeEventListener('departamentos_updated', atualizar); };
  }, [tentativa]);
  const salvar = async () => {
    if (salvando || !leituraOk) return;
    setSalvando(true); setErro('');
    try { setModelos(await salvarModelosTitulosAgenda(modelos)); showToast('Modelos de títulos salvos para a equipe.', 'success'); }
    catch (e) { setErro(e.message); }
    finally { setSalvando(false); }
  };
  return <section className="rounded-3xl border border-black/[0.08] dark:border-white/[0.12] bg-white dark:bg-rm-cartao-escuro p-5 sm:p-8 space-y-6">
    <div><h2 className="text-xl font-semibold tracking-tight">Títulos das reuniões</h2><p className="text-sm text-slate-500 dark:text-zinc-400 mt-2 leading-relaxed">Defina uma sugestão para cada departamento. Ao escolher o departamento e o cliente na agenda, o título fica pronto para usar. Quem agenda pode escrever outro.</p></div>
    <div className="text-sm bg-black/[0.03] dark:bg-white/[0.04] rounded-2xl p-4 space-y-2"><p><code>{'{cliente}'}</code> recebe o nome de quem participa da reunião.</p><p><code>{'{departamento}'}</code> recebe o departamento escolhido.</p><p className="text-xs text-slate-500 dark:text-zinc-400">Deixe um modelo vazio para usar o padrão: {MODELO_TITULO_PADRAO}</p></div>
    {erro && <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">{erro}</p>}
    {carregando ? <div role="status" aria-label="Carregando modelos de títulos" className="h-32 rounded-2xl animate-pulse bg-black/[0.04] dark:bg-white/[0.06]" /> : !leituraOk ? <button onClick={() => setTentativa((n) => n + 1)} className="text-sm underline cursor-pointer">Tentar carregar novamente</button> : <>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{departamentos.map((departamento) => <ModeloDepartamento key={departamento} departamento={departamento} valor={modelos[departamento] || ''} onMudar={(texto) => setModelos((atual) => ({ ...atual, [departamento]: texto }))} bloqueado={salvando} />)}</div>
      {!departamentos.length && <p className="text-sm text-slate-500 dark:text-zinc-400">Cadastre os departamentos para definir seus modelos.</p>}
      <div className="flex justify-end"><button type="button" onClick={salvar} disabled={salvando || !departamentos.length} className="px-5 py-3 rounded-full bg-[#1d1d1f] dark:bg-white text-white dark:text-[#1d1d1f] text-sm font-medium disabled:opacity-50 cursor-pointer">{salvando ? 'Salvando…' : 'Salvar modelos'}</button></div>
    </>}
  </section>;
}
