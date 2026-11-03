import { acessoAoChat, juntarDetalhes, podeVerContato, podeVerConversa } from '@/lib/server/canais/chat';
import { provedorDo, segredosDo } from '@/lib/server/canais/index';
import { guardarArquivo } from '@/lib/server/canais/midia';
import { ehGrupo, formasDoTelefone, telefoneCanonico } from '@/lib/canais';
import { normalizarTelefone } from '@/lib/whatsappAgenda';
import { isValidUUID } from '@/lib/sanitize';
import { conferirEtiquetasNovas, etiquetasDaEmpresa } from '@/lib/server/etiquetas';

export const dynamic = 'force-dynamic';

/**
 * Perfil do contato no Chat.
 *  GET ?id=                                            dados, empresa ligada e conversas que a pessoa pode ver
 *  GET ?lista=1&q=&pagina=&limite=                     lista de contatos (pessoas; grupos ficam de fora; limite até 500)
 *  PATCH { id, nome, observacoes, etiquetas, empresa_id }
 *  POST { id, acao: 'foto' }                           busca a foto do perfil no WhatsApp (guardada na pasta da empresa)
 *  POST { acao: 'criar', nome, telefone }              novo contato (número com código do país)
 */
const json = (corpo, status = 200) => Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });

async function inicio(request, id) {
  const r = await acessoAoChat(request);
  if (r.erro) return r;
  if (!(await podeVerContato(r.ctx.db, r.perm, id))) return { erro: json({ ok: false, mensagem: 'Contato não encontrado.' }, 404) };
  return r;
}

async function perfil(db, perm, id) {
  const [{ data: contato }, { data: conversas }] = await Promise.all([db.from('contatos').select('*').eq('id', id).maybeSingle(), db.from('conversas').select('*').eq('contato_id', id)]);
  let empresa = null;
  if (contato?.empresa_id) {
    const { data } = await db.from('empresas').select('id, nome').eq('id', contato.empresa_id).maybeSingle();
    empresa = data || null;
  }
  const visiveis = (conversas || []).filter((c) => podeVerConversa(perm, c)).sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  return { contato: { ...contato, tem_foto: Boolean(contato?.foto_url), foto_url: undefined }, empresa, conversas: await juntarDetalhes(db, visiveis.slice(0, 20)), total_conversas: (conversas || []).length };
}

export async function GET(request) {
  const busca = new URL(request.url).searchParams;
  if (busca.get('lista')) return listar(request, busca);
  const id = busca.get('id');
  const r = await inicio(request, id);
  if (r.erro) return r.erro;
  return json({ ok: true, ...(await perfil(r.ctx.db, r.perm, id)) });
}

export async function PATCH(request) {
  const body = (await request.json().catch(() => null)) || {};
  const r = await inicio(request, body.id);
  if (r.erro) return r.erro;
  const campos = { atualizado_em: new Date().toISOString() };
  if (body.nome !== undefined) campos.nome = String(body.nome || '').trim().slice(0, 120) || null;
  if (body.observacoes !== undefined) campos.observacoes = String(body.observacoes || '').slice(0, 2000) || null;
  if (body.etiquetas !== undefined) {
    if (!Array.isArray(body.etiquetas)) return json({ ok: false, mensagem: 'Etiquetas inválidas.' }, 400);
    // Etiqueta nova só se estiver cadastrada (Configurações › Etiquetas); as que já estavam continuam
    const { data: atual } = await r.ctx.db.from('contatos').select('etiquetas').eq('id', body.id).maybeSingle();
    const conferida = conferirEtiquetasNovas(await etiquetasDaEmpresa(r.ctx.db, 'chat').catch(() => []), atual?.etiquetas || [], body.etiquetas);
    if (conferida.erro) return json({ ok: false, mensagem: conferida.erro }, 400);
    campos.etiquetas = conferida.lista;
  }
  if (body.empresa_id !== undefined) {
    if (body.empresa_id && !isValidUUID(body.empresa_id)) return json({ ok: false, mensagem: 'Empresa inválida.' }, 400);
    if (body.empresa_id) {
      const { data } = await r.ctx.db.from('empresas').select('id').eq('id', body.empresa_id).maybeSingle();
      if (!data) return json({ ok: false, mensagem: 'Empresa não encontrada.' }, 400);
    }
    campos.empresa_id = body.empresa_id || null;
  }
  const { error } = await r.ctx.db.from('contatos').update(campos).eq('id', body.id);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, ...(await perfil(r.ctx.db, r.perm, body.id)) });
}

export async function POST(request) {
  const body = (await request.json().catch(() => null)) || {};
  if (body.acao === 'criar') return criar(request, body);
  const r = await inicio(request, body.id);
  if (r.erro) return r.erro;
  if (body.acao !== 'foto') return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
  const { db } = r.ctx;
  const { data: contato } = await db.from('contatos').select('*').eq('id', body.id).single();
  const { data: conversas } = await db.from('conversas').select('canal_id').eq('contato_id', contato.id);
  const { data: canais } = await db.from('canais').select('*').in('id', [...new Set((conversas || []).map((c) => c.canal_id))]);
  const canal = (canais || []).find((c) => c.ativo && c.status === 'conectado' && provedorDo(c).fotoDoPerfil);
  if (!canal) return json({ ok: true, tem_foto: Boolean(contato.foto_url) });
  try {
    const url = await provedorDo(canal).fotoDoPerfil(canal, segredosDo(canal), contato.telefone);
    if (!url || !/^https:\/\//.test(url)) return json({ ok: true, tem_foto: false });
    const res = await fetch(url, { redirect: 'follow' });
    const tipo = res.headers.get('content-type') || 'image/jpeg';
    if (!res.ok || !/^image\/(jpeg|png|webp)/.test(tipo)) return json({ ok: true, tem_foto: false });
    const dados = Buffer.from(await res.arrayBuffer());
    if (dados.length > 2 * 1024 * 1024) return json({ ok: true, tem_foto: false });
    const g = await guardarArquivo({ organizacaoId: contato.organizacao_id, conversaId: 'contatos', mensagemId: contato.id, dados, mime: tipo });
    await db.from('contatos').update({ foto_url: g.caminho, atualizado_em: new Date().toISOString() }).eq('id', contato.id);
    return json({ ok: true, tem_foto: true, grupo: ehGrupo(contato.telefone) });
  } catch {
    return json({ ok: true, tem_foto: Boolean(contato.foto_url) });
  }
}

/** Lista de contatos da empresa (como a agenda do RM Chat), com busca por nome ou número. */
async function listar(request, busca) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const termo = String(busca.get('q') || '').trim().slice(0, 80);
  const pagina = Math.max(0, Math.min(500, Number(busca.get('pagina')) || 0));
  const POR_PAGINA = Math.max(1, Math.min(500, Number(busca.get('limite')) || 40));
  let q = r.ctx.db.from('contatos').select('id, telefone, nome, foto_url, empresa_id, etiquetas').not('telefone', 'like', '%@g.us');
  if (termo) {
    const digitos = termo.replace(/\D/g, '');
    const nome = termo.replace(/[%_,()]/g, ' ').trim();
    q = digitos.length >= 4 ? q.or(`nome.ilike.%${nome}%,telefone.like.%${digitos}%`) : q.ilike('nome', `%${nome}%`);
  }
  const { data, error } = await q.order('nome', { ascending: true, nullsFirst: false }).range(pagina * POR_PAGINA, pagina * POR_PAGINA + POR_PAGINA);
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  const lista = (data || []).slice(0, POR_PAGINA).map(({ foto_url, ...c }) => ({ ...c, tem_foto: Boolean(foto_url) }));
  return json({ ok: true, contatos: lista, temMais: (data || []).length > POR_PAGINA });
}

/** Novo contato: nome e número (com código do país). Não duplica: devolve o existente, nas duas formas do número. */
async function criar(request, body) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const telefone = telefoneCanonico(normalizarTelefone(body.telefone) || '');
  if (!telefone || telefone.length < 10) return json({ ok: false, mensagem: 'Informe o número com DDD (e o código do país, se não for do Brasil).' }, 400);
  const nome = String(body.nome || '').trim().slice(0, 120) || null;
  const { db } = r.ctx;
  const { data: existentes } = await db.from('contatos').select('id').in('telefone', formasDoTelefone(telefone));
  if (existentes?.length) return json({ ok: true, contato: { id: existentes[0].id }, ja_existia: true });
  const { data, error } = await db.from('contatos').insert([{ telefone, nome }]).select('id, telefone, nome').single();
  if (error) return json({ ok: false, mensagem: error.message }, 500);
  return json({ ok: true, contato: { ...data, tem_foto: false } }, 201);
}
