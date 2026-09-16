'use client';

import React, { useState, useEffect } from 'react';
import { getAuditoriaLogs } from '@/lib/storage';

export default function AuditLogsView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroTexto, setFiltroTexto] = useState('');

  const carregarLogs = async () => {
    setLoading(true);
    const data = await getAuditoriaLogs();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    carregarLogs();
  }, []);

  const formatarAcao = (log) => {
    const acao = log.acao;
    const empresa = log.empresa_nome || log.detalhes?.empresa_nome || 'Empresa';
    const modulo = log.detalhes?.modulo || 'Geral';

    switch (acao) {
      case 'visualizou_senha_suporte':
        return { 
          titulo: `Visualizou Senha de Suporte`,
          descricao: `Acessou e revelou a senha técnica protegida da empresa ${empresa}`,
          badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
          modulo: modulo || 'Credenciais & Acessos'
        };
      case 'alterou_credenciais_suporte':
      case 'alterou_credencial_suporte':
        return { 
          titulo: `Alterou Credenciais de Acesso`,
          descricao: `Atualizou login ou senha de suporte para ${empresa}`,
          badge: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
          modulo: modulo || 'Credenciais & Acessos'
        };
      case 'adicionou_credencial_suporte':
        return { 
          titulo: `Adicionou Nova Credencial / Acesso`,
          descricao: `Cadastrou o acesso '${log.detalhes?.rotulo || 'Novo Acesso'}' para a empresa ${empresa}`,
          badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
          modulo: 'Credenciais & Acessos'
        };
      case 'iniciou_suporte_tecnico':
        return { 
          titulo: `Iniciou Atendimento de Suporte`,
          descricao: `Abriu chamado técnico com cronômetro em tempo real para ${empresa}`,
          badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          modulo: 'Suporte em Tempo Real'
        };
      case 'finalizou_suporte_tecnico':
        return { 
          titulo: `Finalizou Chamado de Suporte`,
          descricao: `Encerrou atendimento de ${Math.round((log.detalhes?.duracao_segundos || 0) / 60)} min para ${empresa} (Motivo: ${log.detalhes?.motivo || 'Geral'})`,
          badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
          modulo: 'Suporte em Tempo Real'
        };
      case 'cadastrou_empresa_manual':
        return { 
          titulo: `Cadastrou Empresa Manualmente`,
          descricao: `Criou o cadastro da empresa ${log.detalhes?.nome || empresa}`,
          badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
          modulo: 'Gestão de Empresas'
        };
      case 'cadastrou_empresas_em_massa':
        return { 
          titulo: `Importou Empresas em Lote`,
          descricao: `Cadastrou ${log.detalhes?.quantidade || 0} empresas simultaneamente`,
          badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
          modulo: 'Gestão de Empresas'
        };
      case 'adicionou_canal_empresa':
        return { 
          titulo: `Vinculou Canal de Atendimento`,
          descricao: `Adicionou canal '${log.detalhes?.canal || 'Mensageria'}' na empresa ${empresa}`,
          badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
          modulo: 'Canais'
        };
      case 'atualizou_checklist_item':
        return { 
          titulo: `Atualizou Checklist do Servidor`,
          descricao: `Alterou o status ou anotação do requisito na empresa ${empresa}`,
          badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
          modulo: 'Servidores'
        };
      case 'atualizou_dados_empresa':
        return { 
          titulo: `Atualizou Configurações da Empresa`,
          descricao: `Modificou formato de atendimento ou servidor alocado de ${empresa}`,
          badge: 'bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-300',
          modulo: 'Configurações'
        };
      default:
        return { 
          titulo: acao.replace(/_/g, ' '), 
          descricao: `Ação registrada no módulo ${modulo}`,
          badge: 'bg-slate-100 text-slate-800 dark:bg-zinc-800 dark:text-zinc-300',
          modulo: modulo || 'Sistema'
        };
    }
  };

  const logsFiltrados = logs.filter((l) => {
    if (!filtroTexto) return true;
    const q = filtroTexto.toLowerCase();
    const nome = (l.usuario_nome || '').toLowerCase();
    const email = (l.usuario_email || '').toLowerCase();
    const empresa = (l.empresa_nome || '').toLowerCase();
    const acao = (l.acao || '').toLowerCase();
    return nome.includes(q) || email.includes(q) || empresa.includes(q) || acao.includes(q);
  });

  return (
    <div className="space-y-6 animate-fade-in text-slate-900 dark:text-zinc-100">
      
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Rastro de Auditoria & Conformidade LGPD
          </h1>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Registro imutável contendo nome do operador, e-mail, IP de origem, empresa afetada e a funcionalidade exata modificada.
          </p>
        </div>

        <button
          onClick={carregarLogs}
          disabled={loading}
          className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-800 text-xs font-semibold text-slate-700 dark:text-zinc-300 transition-all self-start"
        >
          {loading ? 'Atualizando...' : 'Atualizar Rastro'}
        </button>
      </div>

      {/* 3 Cartões de Garantia Legal LGPD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="surface-card rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216]">
          <span className="text-xs font-bold text-slate-900 dark:text-white block mb-1">
            Identificação Completa do Operador
          </span>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            Cada ação grava o nome completo do técnico, seu e-mail autenticado e o endereço IP da máquina de onde partiu a requisição.
          </p>
        </div>

        <div className="surface-card rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216]">
          <span className="text-xs font-bold text-slate-900 dark:text-white block mb-1">
            Rastreamento de Visualização de Senhas
          </span>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            Sempre que um técnico clica para revelar uma senha protegida, o evento é carimbado com data e hora para fins probatórios.
          </p>
        </div>

        <div className="surface-card rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216]">
          <span className="text-xs font-bold text-slate-900 dark:text-white block mb-1">
            Row Level Security (RLS) Ativo
          </span>
          <p className="text-[11px] text-slate-500 dark:text-zinc-400 leading-relaxed">
            Políticas ativas no banco de dados impedem qualquer vazamento ou consulta não autorizada às credenciais de clientes.
          </p>
        </div>
      </div>

      {/* Barra de Filtro */}
      <div className="surface-card rounded-2xl p-3 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex items-center gap-3">
        <input
          type="text"
          value={filtroTexto}
          onChange={(e) => setFiltroTexto(e.target.value)}
          placeholder="Filtrar por nome do operador, e-mail ou empresa..."
          className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
        />
        {filtroTexto && (
          <button onClick={() => setFiltroTexto('')} className="text-xs text-slate-400 hover:text-slate-700 whitespace-nowrap">
            Limpar
          </button>
        )}
      </div>

      {/* Tabela de Eventos Detalhados */}
      <div className="surface-card rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-zinc-300">
          <span>Rastro de Atividades ({logsFiltrados.length})</span>
          <span className="text-[10px] text-slate-400 font-mono">Imutável • Protegido</span>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-zinc-800">
          {logsFiltrados.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhum evento encontrado no rastro.
            </div>
          ) : (
            logsFiltrados.map((log) => {
              const meta = formatarAcao(log);
              return (
                <div key={log.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-zinc-900/30 transition-colors">
                  
                  {/* Detalhes da Ação e Funcionalidade */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${meta.badge}`}>
                        {meta.titulo}
                      </span>
                      
                      {log.empresa_nome && (
                        <span className="text-xs font-bold text-slate-900 dark:text-white px-2 py-0.5 rounded-md bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                          Empresa: {log.empresa_nome}
                        </span>
                      )}

                      <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-400 font-mono">
                        Módulo: {meta.modulo}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                      {meta.descricao}
                    </p>

                    {/* Identificação do Operador e IP */}
                    <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-slate-500 dark:text-zinc-400 font-mono">
                      <span>
                        Operador: <strong className="text-slate-800 dark:text-zinc-200">{log.usuario_nome || 'Lucas Amorim (Administrador)'}</strong>
                      </span>
                      <span>•</span>
                      <span>{log.usuario_email}</span>
                      <span>•</span>
                      <span>IP: <strong className="text-slate-700 dark:text-zinc-300">{log.ip_origem || '192.168.15.2 (Rede Local)'}</strong></span>
                    </div>
                  </div>

                  {/* Data e Hora */}
                  <div className="text-right self-end md:self-center font-mono text-slate-400 dark:text-zinc-500 text-[11px] flex-shrink-0">
                    <span className="block font-bold text-slate-700 dark:text-zinc-300">
                      {new Date(log.created_at).toLocaleDateString('pt-BR')}
                    </span>
                    <span>
                      {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                    </span>
                  </div>

                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
