'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { getCanaisCatalogo, createCanalCatalogo } from '@/lib/storage';
import { MessageChannelIcon, FacebookIcon, InstagramIcon, TelegramIcon } from './Icons';

export default function ChannelsManagement() {
  const [canais, setCanais] = useState([]);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState('api'); // 'api' | 'qrcode' | 'social' | 'outro'
  const [descricao, setDescricao] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');

  const carregarCanais = async () => {
    const data = await getCanaisCatalogo();
    setCanais(data);
  };

  useEffect(() => {
    carregarCanais();
  }, []);

  const handleCriarCanal = async (e) => {
    e.preventDefault();
    if (!nome.trim()) return;

    try {
      setLoading(true);
      await createCanalCatalogo({
        nome: nome.trim(),
        tipo,
        descricao: descricao.trim(),
      });
      setNome('');
      setDescricao('');
      setFeedback('Canal cadastrado com sucesso no catálogo.');
      setTimeout(() => setFeedback(''), 4000);
      await carregarCanais();
    } catch (err) {
      setFeedback('Erro ao cadastrar canal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const renderIcon = (c) => {
    const lower = (c.nome || '').toLowerCase();
    if (lower.includes('whatsapp') || lower.includes('api') || lower.includes('qrcode')) {
      return <MessageChannelIcon className="w-4 h-4 text-[#4d7c0f] dark:text-[#84cc16]" />;
    }
    if (lower.includes('facebook')) return <FacebookIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    if (lower.includes('instagram')) return <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />;
    if (lower.includes('telegram')) return <TelegramIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    return (
      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
        <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    );
  };

  return (
    <div className="space-y-6 text-[#1d1d1f] dark:text-[#f5f5f7]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[#1d1d1f] dark:text-white">
            Catálogo Global de Canais
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-zinc-400 mt-0.5">
            Gerencie os canais disponíveis para integração técnica e mensageria empresarial.
          </p>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
          {feedback}
        </div>
      )}

      {/* Formulário Novo Canal Estilo Apple */}
      <div className="rounded-3xl p-6 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-4">
          Cadastrar Novo Tipo de Canal
        </h3>

        <form onSubmit={handleCriarCanal} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                Nome do Canal <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Mensageria Cloud API, Instagram Direct"
                required
                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none focus:ring-2 focus:ring-[#4d7c0f]/20 text-[#1d1d1f] dark:text-white placeholder-slate-400"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
                Categoria Técnica
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white font-medium"
              >
                <option value="api">Canal API Cloud Oficial (Meta WABA)</option>
                <option value="qrcode">Canal Pareamento QR Code (Instância)</option>
                <option value="social">Rede Social (Facebook / Instagram)</option>
                <option value="outro">Widget / Webhook</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-zinc-400 pl-1">
              Descrição ou Requisitos Técnicos
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Requer verificação de BM empresarial e template aprovado"
              className="w-full px-4 py-2.5 rounded-2xl bg-black/[0.02] dark:bg-white/[0.04] border border-black/[0.08] dark:border-white/[0.1] text-xs focus:outline-none text-[#1d1d1f] dark:text-white placeholder-slate-400"
            />
          </div>

          <div className="flex justify-end pt-1">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-full bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs transition-all shadow-sm disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Adicionar ao Catálogo'}
            </motion.button>
          </div>
        </form>
      </div>

      {/* Grade de Canais Expandida Widescreen */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3 pl-1">
          Canais Ativos no Catálogo ({canais.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {canais.map((c) => (
            <div
              key={c.id}
              className="rounded-3xl p-5 border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#16161a] hover:shadow-apple-hover transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-2xl bg-black/[0.03] dark:bg-white/[0.05] border border-black/[0.04] dark:border-white/[0.06] flex items-center justify-center">
                      {renderIcon(c)}
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-[#1d1d1f] dark:text-white">
                        {c.nome}
                      </h4>
                      <span className="text-[10px] text-slate-400 font-mono uppercase">
                        {c.tipo}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                    Disponível
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                  {c.descricao || 'Sem descrição cadastrada.'}
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-black/[0.04] dark:border-white/[0.05] flex items-center justify-between text-[11px] text-slate-400">
                <span>Catálogo Global</span>
                <span className="text-[#4d7c0f] dark:text-[#84cc16] font-medium">Ativo</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
