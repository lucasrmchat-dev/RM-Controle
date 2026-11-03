import {
  CONFIG_COMERCIAL_PADRAO,
  DESFECHOS_COMERCIAIS,
  validarConfigComercial,
} from '@/lib/comercial';
import { etiquetaCadastrada } from '@/lib/etiquetas';
import { isValidUUID } from '@/lib/sanitize';
import { avisarAoVivo } from '@/lib/server/canais/aoVivo';
import {
  acessoAoChat,
  auditarChat,
  podeVerConversa,
  registrarSistema,
} from '@/lib/server/canais/chat';
import { etiquetasDaEmpresa } from '@/lib/server/etiquetas';
import { consumirLimite } from '@/lib/server/protecao';

export const dynamic = 'force-dynamic';

/**
 * Ações em massa nas conversas escolhidas na lista do Chat (contatos e grupos).
 *  POST { ids: [conversa…], acao, … }
 *   acao: 'resolver'
 *         'transferir_atendente'    { email }          (vazio = volta para a fila)
 *         'transferir_departamento' { departamento }   (vazio = todos os departamentos)
 *         'etiqueta_adicionar' | 'etiqueta_remover' { etiqueta }   (no contato ou grupo)
 *         'atendente_padrao'        { email }          (vazio = tira; só administradores)
 *         'lead'                    { pipeline_id, etapa_id } ou { remover: true } (quem tem o Comercial)
 * Só entram as conversas que a pessoa pode ver (as outras contam como ignoradas).
 */
const MAX_CONVERSAS = 300;
const json = (corpo, status = 200) =>
  Response.json(corpo, { status, headers: { 'Cache-Control': 'no-store' } });
const texto = (v, max) =>
  String(v ?? '')
    .trim()
    .slice(0, max);

export async function POST(request) {
  const r = await acessoAoChat(request);
  if (r.erro) return r.erro;
  const { ctx, perm } = r;
  const { db } = ctx;
  if (!(await consumirLimite(`chat_massa_${perm.email}`, 20, 60)))
    return json({ ok: false, mensagem: 'Muitas ações seguidas. Aguarde um minuto.' }, 429);
  const body = (await request.json().catch(() => null)) || {};
  const ids = [...new Set(Array.isArray(body.ids) ? body.ids.filter(isValidUUID) : [])];
  if (!ids.length) return json({ ok: false, mensagem: 'Escolha ao menos uma conversa.' }, 400);
  if (ids.length > MAX_CONVERSAS)
    return json(
      { ok: false, mensagem: `Escolha no máximo ${MAX_CONVERSAS} conversas por vez.` },
      400,
    );

  const { data: lidas, error } = await db.from('conversas').select('*').in('id', ids);
  if (error) return json({ ok: false, mensagem: 'Não foi possível ler as conversas.' }, 500);
  const conversas = (lidas || []).filter((c) => podeVerConversa(perm, c));
  const ignoradas = ids.length - conversas.length;
  const autor = { email: perm.email, nome: perm.nome };
  const contatoIds = [...new Set(conversas.map((c) => c.contato_id))];
  let feitas = 0;

  try {
    switch (body.acao) {
      case 'resolver': {
        for (const c of conversas.filter((x) => x.status !== 'resolvida')) {
          await db
            .from('conversas')
            .update({ status: 'resolvida', resolvida_em: new Date().toISOString(), nao_lidas: 0 })
            .eq('id', c.id);
          await registrarSistema(
            db,
            c.id,
            `${autor.nome} resolveu a conversa (ação em massa)`,
            autor,
          );
          await auditarChat(db, perm, 'chat_resolveu', c, { em_massa: true });
          feitas += 1;
        }
        break;
      }
      case 'transferir_atendente': {
        const email = texto(body.email, 160).toLowerCase();
        let campos;
        let aviso;
        if (email) {
          const { data: membro } = await db
            .from('equipe_usuarios')
            .select('email, nome, ativo')
            .eq('email', email)
            .maybeSingle();
          if (!membro || membro.ativo === false)
            return json({ ok: false, mensagem: 'Pessoa não encontrada na equipe.' }, 400);
          const nome = membro.nome || membro.email.split('@')[0];
          campos = () => ({ responsavel_email: membro.email, responsavel_nome: nome });
          aviso = `Transferida para ${nome}`;
        } else {
          campos = (c) => ({
            responsavel_email: null,
            responsavel_nome: null,
            status: c.status === 'resolvida' ? 'resolvida' : 'aguardando',
          });
          aviso = 'Devolvida para a fila';
        }
        for (const c of conversas) {
          await db.from('conversas').update(campos(c)).eq('id', c.id);
          await registrarSistema(db, c.id, `${aviso} por ${autor.nome} (ação em massa)`, autor);
          await auditarChat(db, perm, 'chat_transferiu', c, { para: aviso, em_massa: true });
          feitas += 1;
        }
        break;
      }
      case 'transferir_departamento': {
        const departamento = texto(body.departamento, 60) || null;
        const aviso = `Transferida para ${departamento || 'todos os departamentos'}`;
        for (const c of conversas) {
          await db.from('conversas').update({ departamento }).eq('id', c.id);
          await registrarSistema(db, c.id, `${aviso} por ${autor.nome} (ação em massa)`, autor);
          await auditarChat(db, perm, 'chat_transferiu', c, { para: aviso, em_massa: true });
          feitas += 1;
        }
        break;
      }
      case 'etiqueta_adicionar':
      case 'etiqueta_remover': {
        let etiqueta = texto(body.etiqueta, 30);
        if (!etiqueta) return json({ ok: false, mensagem: 'Escolha a etiqueta.' }, 400);
        // Para adicionar, só as cadastradas (Configurações › Etiquetas); para tirar, qualquer uma
        if (body.acao === 'etiqueta_adicionar') {
          etiqueta = etiquetaCadastrada(await etiquetasDaEmpresa(db, 'chat'), etiqueta);
          if (!etiqueta)
            return json(
              {
                ok: false,
                mensagem: 'Essa etiqueta não está cadastrada. Cadastre em Configurações › Etiquetas.',
              },
              400,
            );
        }
        const mesma = (t) => t.toLowerCase() === etiqueta.toLowerCase();
        const { data: contatos } = await db
          .from('contatos')
          .select('id, etiquetas')
          .in('id', contatoIds);
        for (const ct of contatos || []) {
          const atuais = Array.isArray(ct.etiquetas) ? ct.etiquetas : [];
          const novas =
            body.acao === 'etiqueta_adicionar'
              ? atuais.some(mesma)
                ? atuais
                : [...atuais, etiqueta].slice(0, 20)
              : atuais.filter((t) => !mesma(t));
          if (novas.length === atuais.length && novas.every((t, i) => t === atuais[i])) continue;
          await db.from('contatos').update({ etiquetas: novas }).eq('id', ct.id);
          feitas += 1;
        }
        break;
      }
      case 'atendente_padrao': {
        if (!perm.administrador)
          return json(
            { ok: false, mensagem: 'Só administradores definem o atendente padrão.' },
            403,
          );
        const email = texto(body.email, 160).toLowerCase();
        let campos = { responsavel_padrao_email: null, responsavel_padrao_nome: null };
        if (email) {
          const { data: membro } = await db
            .from('equipe_usuarios')
            .select('email, nome, ativo')
            .eq('email', email)
            .maybeSingle();
          if (!membro || membro.ativo === false)
            return json({ ok: false, mensagem: 'Pessoa não encontrada na equipe.' }, 400);
          campos = {
            responsavel_padrao_email: membro.email,
            responsavel_padrao_nome: membro.nome || membro.email.split('@')[0],
          };
        }
        const { error: erroPadrao } = await db.from('contatos').update(campos).in('id', contatoIds);
        if (erroPadrao) {
          const semColuna = /responsavel_padrao|column|schema cache/i.test(
            erroPadrao.message || '',
          );
          return json(
            {
              ok: false,
              mensagem: semColuna
                ? 'Falta instalar no banco: rode supabase/migration_chat_massa.sql no Supabase.'
                : 'Não foi possível salvar o atendente padrão.',
            },
            semColuna ? 503 : 500,
          );
        }
        feitas = contatoIds.length;
        break;
      }
      case 'lead': {
        if (!perm.modulos.includes('comercial') && !perm.administrador)
          return json({ ok: false, mensagem: 'Seu perfil não tem acesso ao Comercial.' }, 403);
        if (body.remover) {
          const { data: apagados, error: erroLead } = await db
            .from('comercial_leads')
            .delete()
            .in('contato_id', contatoIds)
            .is('integracao_id', null)
            .select('id');
          if (erroLead) throw erroLead;
          feitas = (apagados || []).length;
          break;
        }
        const { data: cfg } = await db
          .from('sistema_config')
          .select('valor')
          .eq('chave', 'comercial')
          .maybeSingle();
        let config;
        try {
          config = validarConfigComercial(cfg?.valor || CONFIG_COMERCIAL_PADRAO);
        } catch {
          config = CONFIG_COMERCIAL_PADRAO;
        }
        const processo = (config.pipelines || []).find((p) => p.id === body.pipeline_id);
        const etapa =
          processo &&
          [...(processo.etapas || []), ...DESFECHOS_COMERCIAIS].find((e) => e.id === body.etapa_id);
        if (!processo || !etapa)
          return json(
            { ok: false, mensagem: 'Escolha um processo comercial e uma etapa que existam.' },
            400,
          );
        if (!config.departamentos.length)
          return json(
            {
              ok: false,
              mensagem:
                'Cadastre os departamentos do Comercial em Configurações › Comercial antes.',
            },
            400,
          );
        const agora = new Date().toISOString();
        const { data: contatos } = await db
          .from('contatos')
          .select('id, nome, telefone')
          .in('id', contatoIds);
        const porContato = new Map((contatos || []).map((ct) => [ct.id, ct]));
        for (const c of conversas.filter(
          (x, i, l) => l.findIndex((y) => y.contato_id === x.contato_id) === i,
        )) {
          const ct = porContato.get(c.contato_id);
          if (!ct) continue;
          // Departamento do lead: o da conversa, se for do Comercial; senão o primeiro do Comercial
          const departamento =
            config.departamentos.find(
              (d) => d.toLowerCase() === String(c.departamento || '').toLowerCase(),
            ) || config.departamentos[0];
          const { data: existente } = await db
            .from('comercial_leads')
            .select('id')
            .eq('contato_id', ct.id)
            .maybeSingle();
          const campos = {
            comercial_pipeline_id: processo.id,
            comercial_etapa_id: etapa.id,
            nome: ct.nome || ct.telefone,
            telefone: ct.telefone || '',
            updated_at: agora,
            ultima_ocorrencia_em: agora,
          };
          const res = existente
            ? await db.from('comercial_leads').update(campos).eq('id', existente.id)
            : await db.from('comercial_leads').insert([
                {
                  ...campos,
                  contato_id: ct.id,
                  integracao_id: null,
                  externo_id: `chat:${ct.id}`,
                  email: '',
                  departamento,
                },
              ]);
          if (res.error) throw res.error;
          await registrarSistema(
            db,
            c.id,
            `${autor.nome} colocou o contato em ${etapa.nome} (${processo.nome}) no Comercial`,
            autor,
          );
          feitas += 1;
        }
        break;
      }
      default:
        return json({ ok: false, mensagem: 'Ação desconhecida.' }, 400);
    }
  } catch (e) {
    const semMigracao =
      /contato_id|integracao_id|responsavel_padrao|column|schema cache|null value/i.test(
        String(e?.message || ''),
      );
    return json(
      {
        ok: false,
        mensagem: semMigracao
          ? 'Falta instalar no banco: rode supabase/migration_chat_massa.sql no Supabase.'
          : `Não foi possível concluir: ${e?.message || e}`,
        feitas,
      },
      semMigracao ? 503 : 500,
    );
  }

  await avisarAoVivo(ctx.org?.id || null).catch(() => {});
  return json({ ok: true, feitas, ignoradas, total: ids.length });
}
