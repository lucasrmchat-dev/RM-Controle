import { verifySessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { obterPapelServidor } from '@/lib/server/acesso';
import { getSupabaseAdmin } from '@/lib/server/integracaoSuporte';

export const dynamic = 'force-dynamic';

/**
 * Configurações globais compartilhadas por toda a equipe (antes ficavam no navegador de cada um).
 * Valores comuns ficam em public.sistema_config; a senha padrão fica cifrada em public.rm_segredos.
 */
const SERVIDORES_PADRAO = {
  servidor_1_nome: 'Servidor 1',
  servidor_1_url: '',
  servidor_2_nome: 'Servidor 2',
  servidor_2_url: '',
};

function urlValida(valor) {
  try {
    const u = new URL(String(valor || '').trim());
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

// chave -> quem lê, quem grava e como validar
const CHAVES = {
  servidores_urls: {
    ler: 'equipe',
    gravar: 'admin',
    validar(valor) {
      const config = { ...SERVIDORES_PADRAO };
      for (const n of [1, 2]) {
        // Vazio = ainda não configurado (antes um endereço fictício entrava no lugar)
        const bruto = String(valor?.[`servidor_${n}_url`] ?? '').trim();
        const url = bruto ? urlValida(bruto) : '';
        if (bruto && !url) throw new Error(`A URL do Servidor ${n} é inválida. Use o formato https://exemplo.com.br`);
        config[`servidor_${n}_url`] = url;
        config[`servidor_${n}_nome`] = String(valor?.[`servidor_${n}_nome`] ?? config[`servidor_${n}_nome`]).trim().slice(0, 40) || `Servidor ${n}`;
      }
      return config;
    },
  },
  departamentos: {
    ler: 'equipe',
    gravar: 'admin',
    validar(valor) {
      if (!Array.isArray(valor)) throw new Error('Departamentos devem ser uma lista.');
      const limpos = [...new Set(valor.map((d) => String(d || '').trim().slice(0, 60)).filter(Boolean))];
      if (limpos.length === 0) throw new Error('Mantenha ao menos um departamento.');
      return limpos;
    },
  },
  configuracoes_suporte: {
    ler: 'equipe',
    gravar: 'operacao',
    validar(valor) {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Configuração inválida.');
      return valor;
    },
  },
  servidor_config_padrao: {
    ler: 'equipe',
    gravar: 'admin',
    validar(valor) {
      if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Configuração inválida.');
      return valor;
    },
  },
  // Segredo: cifrado no banco (AES-256, chave no Supabase Vault)
  senha_padrao: {
    ler: 'operacao',
    gravar: 'operacao',
    segredo: true,
    validar(valor) {
      const senha = String(valor || '').trim();
      if (senha.length < 8) throw new Error('A senha padrão precisa ter pelo menos 8 caracteres.');
      return senha;
    },
  },
};

function permitido(papel, nivel) {
  if (nivel === 'equipe') return Boolean(papel);
  if (nivel === 'operacao') return papel === 'administrador' || papel === 'suporte';
  return papel === 'administrador';
}

function json(corpo, status = 200) {
  return Response.json(corpo, { status });
}

async function contexto(request) {
  const sessao = await verifySessionToken(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  if (!sessao) return { erro: json({ ok: false, mensagem: 'Sessão expirada.' }, 401) };
  const db = getSupabaseAdmin();
  if (!db) return { erro: json({ ok: false, mensagem: 'Servidor sem SUPABASE_SERVICE_ROLE_KEY configurada.' }, 503) };
  return { db, papel: await obterPapelServidor(sessao.sub) };
}

export async function GET(request) {
  const { erro, db, papel } = await contexto(request);
  if (erro) return erro;

  const comuns = Object.keys(CHAVES).filter((k) => !CHAVES[k].segredo && permitido(papel, CHAVES[k].ler));
  const { data, error } = await db.from('sistema_config').select('chave, valor').in('chave', comuns);
  if (error) return json({ ok: false, mensagem: `Não foi possível ler as configurações: ${error.message}` }, 500);

  const config = Object.fromEntries((data || []).map((l) => [l.chave, l.valor]));
  if (permitido(papel, CHAVES.senha_padrao.ler)) {
    const { data: senha, error: erroSegredo } = await db.rpc('rm_ler_segredo', { p_chave: 'senha_padrao' });
    if (!erroSegredo && senha) config.senha_padrao = senha;
  }
  // Chaves ainda não salvas no banco: o navegador pode enviar o valor local (migração inicial)
  const ausentes = Object.keys(CHAVES).filter((k) => config[k] === undefined && permitido(papel, CHAVES[k].gravar));
  config.servidores_urls = { ...SERVIDORES_PADRAO, ...(config.servidores_urls || {}) };
  return json({ ok: true, config, ausentes });
}

export async function PUT(request) {
  const { erro, db, papel } = await contexto(request);
  if (erro) return erro;
  const body = await request.json().catch(() => ({}));
  const def = CHAVES[body.chave];
  if (!def) return json({ ok: false, mensagem: 'Configuração desconhecida.' }, 400);
  if (!permitido(papel, def.gravar)) return json({ ok: false, mensagem: 'Seu perfil não pode alterar esta configuração.' }, 403);

  let valor;
  try {
    valor = def.validar(body.valor);
  } catch (e) {
    return json({ ok: false, mensagem: e.message }, 400);
  }

  const { error } = def.segredo
    ? await db.rpc('rm_gravar_segredo', { p_chave: body.chave, p_valor: valor })
    : await db.from('sistema_config').upsert({ chave: body.chave, valor, updated_at: new Date().toISOString() }, { onConflict: 'chave' });
  if (error) return json({ ok: false, mensagem: `Não foi possível salvar: ${error.message}` }, 500);
  return json({ ok: true, valor: def.segredo ? undefined : valor });
}
