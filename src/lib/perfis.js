/**
 * Perfis de acesso: regra única do que cada pessoa vê (módulos e departamentos).
 * Funções puras, usadas no navegador e no servidor (testadas em tests/perfis.test.js).
 *
 * Ordem de decisão:
 *  1. Proprietários (lista de administradores) → acesso total
 *  2. Membro com perfil → o que o perfil define (perfil "Administrador" = acesso total)
 *  3. Membro sem perfil → acesso de hoje pelo papel (e bloqueios antigos de departamento)
 */
import { listaAdministradores, normalizarEmail } from './roles';

export const MODULOS = [
  { id: 'chat', rotulo: 'Chat', descricao: 'Atender as conversas do WhatsApp' },
  // Sub-módulo do Chat: aba própria no cabeçalho para mandar uma mensagem a vários contatos e grupos
  { id: 'envios', rotulo: 'Chat: envios em massa', descricao: 'Mandar uma mensagem para vários contatos e grupos, na hora ou agendada' },
  { id: 'fila', rotulo: 'Demandas', descricao: 'Ver, assumir e concluir demandas' },
  { id: 'empresas', rotulo: 'Empresas', descricao: 'Cadastro, acessos e servidores das empresas' },
  { id: 'agenda', rotulo: 'Agenda', descricao: 'Reuniões e Google Agenda' },
  { id: 'daily', rotulo: 'Daily', descricao: 'Metas da semana, resumo das dailies e atualizações' },
  { id: 'comercial', rotulo: 'Comercial', descricao: 'Reuniões e acompanhamento por colaborador' },
  // Não é uma aba: libera, dentro do Comercial, as vendas e comissões de toda a equipe (gestor)
  { id: 'comercial_gestao', rotulo: 'Comercial: gestor da equipe', descricao: 'Vê vendas e comissões de todos os vendedores e registra vendas por eles' },
  { id: 'dashboard', rotulo: 'Dashboard', descricao: 'Métricas de atendimento' },
  { id: 'feedbacks', rotulo: 'Feedbacks', descricao: 'Feedbacks dos clientes' },
  { id: 'conexoes', rotulo: 'Canais', descricao: 'Conectar e gerenciar números de WhatsApp' },
  { id: 'fluxos', rotulo: 'Fluxo Inteligente', descricao: 'Automações com gatilhos, mensagens e agenda' },
  { id: 'configuracoes', rotulo: 'Configurações básicas', descricao: 'Alertas, visualização e regras' },
];
const IDS_MODULOS = MODULOS.map((m) => m.id);

// Módulos exclusivos de administradores, fora do catálogo dos perfis comuns.
export const ABAS_ADMIN = ['canais', 'servidores', 'auditoria'];

// Acesso atual (antes dos perfis) por papel fixo
const ABAS_POR_PAPEL = {
  administrador: [...IDS_MODULOS, ...ABAS_ADMIN],
  // Comercial, Canais, Fluxo e Envios em massa: só administradores por padrão (um perfil pode liberar)
  suporte: IDS_MODULOS.filter((id) => !['comercial', 'comercial_gestao', 'conexoes', 'fluxos', 'envios'].includes(id)),
  vendas: IDS_MODULOS.filter((id) => !['comercial', 'comercial_gestao', 'conexoes', 'fluxos', 'envios'].includes(id)),
};

const norm = (s) => String(s || '').toLowerCase().trim();

/**
 * @returns {{ administrador: boolean, modulos: string[], departamentos: string[]|null, bloqueados: string[], perfil: object|null }}
 *   departamentos = null → todos; bloqueados = lista de departamentos ocultos (regra antiga, sem perfil)
 */
export function permissoesEfetivas(opcoes) {
  const perm = permissoesSemContrato(opcoes);
  // Módulos que a empresa contratou limitam todo mundo, inclusive administradores (Configurações sempre fica)
  const contratados = opcoes?.modulosDaEmpresa;
  if (!Array.isArray(contratados)) return perm;
  // "Comercial: gestor" vem junto com o Comercial contratado; "Chat: envios em massa", com o Chat
  const SUB_MODULOS = { comercial_gestao: 'comercial', envios: 'chat' };
  const contratado = (m) => contratados.includes(SUB_MODULOS[m] || m);
  return { ...perm, modulos: perm.modulos.filter((m) => m === 'configuracoes' || ABAS_ADMIN.includes(m) || contratado(m)) };
}

function permissoesSemContrato({ email, equipe = [], perfis = [], adminsExtras = '', verComoPerfilId = null }) {
  const alvo = normalizarEmail(email);
  const total = { administrador: true, modulos: ABAS_POR_PAPEL.administrador, departamentos: null, bloqueados: [], perfil: null };
  const proprietario = alvo && listaAdministradores(adminsExtras).has(alvo);
  const membro = (equipe || []).find((u) => normalizarEmail(u?.email) === alvo && u?.ativo !== false) || null;

  // Administrador simulando outro perfil ("Ver o sistema como")
  const perfilSimulado = verComoPerfilId && (proprietario || membro?.papel === 'administrador') ? perfis.find((p) => p.id === verComoPerfilId) : null;
  const perfil = perfilSimulado || (proprietario ? null : perfis.find((p) => p.id === membro?.perfil_id) || null);

  if (perfil) {
    if (perfil.administrador) return { ...total, perfil };
    return {
      administrador: false,
      modulos: (perfil.modulos || []).filter((m) => IDS_MODULOS.includes(m)),
      departamentos: perfil.todos_departamentos ? null : (perfil.departamentos || []).map(String),
      bloqueados: [],
      perfil,
    };
  }
  if (proprietario) return total;

  const papel = membro?.papel || 'suporte';
  if (papel === 'administrador') return total;
  return {
    administrador: false,
    modulos: ABAS_POR_PAPEL[papel] || ABAS_POR_PAPEL.suporte,
    departamentos: null,
    bloqueados: Array.isArray(membro?.departamentos_bloqueados) ? membro.departamentos_bloqueados : [],
    perfil: null,
  };
}

/** Gestor do comercial: vê e lança vendas e comissões de toda a equipe. */
export const ehGestorComercial = (perm) => Boolean(perm?.administrador || perm?.modulos?.includes('comercial_gestao'));

/** Departamentos de uma demanda (categorias; nas antigas, o texto de "motivo"). */
export function departamentosDaDemanda(ch) {
  if (Array.isArray(ch?.categorias) && ch.categorias.length) return ch.categorias;
  if (ch?.motivo) return String(ch.motivo).split(',').map((s) => s.trim()).filter(Boolean);
  return ['Suporte'];
}

/** A pessoa enxerga este departamento? */
export function podeVerDepartamento(perm, departamento) {
  if (!perm || perm.administrador) return true;
  const d = norm(departamento);
  if (perm.departamentos) return perm.departamentos.some((x) => norm(x) === d);
  return !perm.bloqueados.some((x) => norm(x) === d);
}

/** A pessoa enxerga esta demanda? (basta um dos departamentos dela ser visível) */
export function podeVerDemanda(perm, ch) {
  if (!perm || perm.administrador) return true;
  return departamentosDaDemanda(ch).some((d) => podeVerDepartamento(perm, d));
}

/** Filtra a lista de departamentos do sistema pelo que a pessoa enxerga. */
export function departamentosVisiveis(perm, todos = []) {
  return (todos || []).filter((d) => podeVerDepartamento(perm, d));
}
