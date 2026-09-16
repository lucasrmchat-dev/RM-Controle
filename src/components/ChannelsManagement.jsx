'use client';

import React, { useState, useEffect } from 'react';
import { getCanaisCatalogo, createCanalCatalogo } from '@/lib/storage';
import { WhatsAppIcon, FacebookIcon, InstagramIcon, TelegramIcon } from './Icons';

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
    if (lower.includes('whatsapp')) return <WhatsAppIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    if (lower.includes('facebook')) return <FacebookIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    if (lower.includes('instagram')) return <InstagramIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />;
    if (lower.includes('telegram')) return <TelegramIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />;
    return (
      <svg className="w-4 h-4 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in text-slate-900 dark:text-zinc-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
            Catálogo Global de Canais
          </h2>
          <p className="text-xs text-slate-500 dark:text-zinc-400 mt-0.5">
            Gerencie os canais disponíveis para contratação e integração técnica (WhatsApp API, QR Code, redes sociais).
          </p>
        </div>
      </div>

      {feedback && (
        <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300 text-xs font-semibold">
          {feedback}
        </div>
      )}

      {/* Formulário Novo Canal */}
      <div className="surface-card rounded-2xl p-5 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216]">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-zinc-300 mb-3">
          Cadastrar Novo Tipo de Canal
        </h3>

        <form onSubmit={handleCriarCanal} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                Nome do Canal <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: WhatsApp API Cloud Meta, Instagram Direct"
                required
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
                Categoria Técnica
              </label>
              <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
              >
                <option value="api">API Oficial (Meta Cloud / WABA)</option>
                <option value="qrcode">QR Code (Evolution / Baileys)</option>
                <option value="social">Rede Social (Facebook / Instagram)</option>
                <option value="outro">Widget / Webhook</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-zinc-400 mb-1">
              Descrição ou Requisitos Técnicos
            </label>
            <input
              type="text"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex: Requer verificação de empresa Meta BM e template aprovado"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 text-xs focus:outline-none"
            />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-[#4d7c0f] dark:bg-[#84cc16] text-white dark:text-zinc-950 font-semibold text-xs transition-all shadow-sm"
            >
              {loading ? 'Salvando...' : 'Adicionar ao Catálogo'}
            </button>
          </div>
        </form>
      </div>

      {/* Grade de Canais */}
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400 mb-3">
          Canais Ativos no Catálogo ({canais.length})
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {canais.map((c) => (
            <div
              key={c.id}
              className="surface-card rounded-2xl p-4 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#121216] flex flex-col justify-between shadow-sm"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-zinc-800 flex items-center justify-center">
                      {renderIcon(c)}
                    </div>
                    <span className="text-xs font-bold text-slate-900 dark:text-white">{c.nome}</span>
                  </div>
                  <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                    {c.tipo.toUpperCase()}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed">
                  {c.descricao || 'Sem descrição informada.'}
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-slate-100 dark:border-zinc-800 text-[11px] text-slate-400 dark:text-zinc-500 flex items-center justify-between">
                <span className="text-[#4d7c0f] dark:text-[#84cc16] font-medium">Disponível para empresas</span>
                <span className="font-mono">ID: {c.id}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
