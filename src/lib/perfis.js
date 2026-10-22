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
  { id: 'fila', rotulo: 'Fila de Demandas', descricao: 'Ver, assumir e concluir demandas' },
  { id: 'empresas', rotulo: 'Empresas', descricao: 'Cadastro, acessos e servidores das empresas' },
  { id: 'agenda', rotulo: 'Agenda', descricao: 'Reuniões e Google Agenda' },
  { id: 'dashboard', rotulo: 'Dashboard', descricao: 'Métricas de atendimento' },
  { id: 'feedbacks', rotulo: 'Feedbacks', descricao: 'Feedbacks dos clientes' },
  { id: 'configuracoes', rotulo: 'Configurações básicas', descricao: 'Alertas, visualização e regras' },
];
const IDS_MODULOS = MODULOS.map((m) => m.id);

// Abas exclusivas de quem administra (Configurações Avançadas)
export const ABAS_ADMIN = ['canais', 'servidores', 'auditoria'];

// Acesso atual (antes dos perfis) por papel fixo
const ABAS_POR_PAPEL = {
  administrador: [...IDS_MODULOS, ...ABAS_ADMIN],
  suporte: IDS_MODULOS,
  vendas: IDS_MODULOS,
};

const norm = (s) => String(s || '').toLowerCase().trim();

/**
 * @returns {{ administrador: boolean, modulos: string[], departamentos: string[]|null, bloqueados: string[], perfil: object|null }}
 *   departamentos = null → todos; bloqueados = lista de departamentos ocultos (regra antiga, sem perfil)
 */
export function permissoesEfetivas({ email, equipe = [], perfis = [], adminsExtras = '', verComoPerfilId = null }) {
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
