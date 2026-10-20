// Supabase em memória que reproduz a semântica do supabase-js: erros são RETORNADOS em { error }, nunca lançados.
import { randomUUID } from 'node:crypto';

export const db = {
  tables: { suporte_chamados: [], feedbacks: [], sistema_config: [], empresas: [], auditoria_logs: [], equipe_usuarios: [] },
  // Colunas aceitas por tabela (simula schema sem a migração quando restrito)
  columns: {
    suporte_chamados: null, // null = aceita qualquer coluna
    feedbacks: null,
  },
  // Permissões simuladas da RLS para o usuário atual
  rls: { deleteAllowed: true, updateAllowed: true },
  // Atraso simulado de rede por operação (ms), para reproduzir condições de corrida
  atraso: { select: 0, insert: 0, update: 0 },
  // Funções do banco (rpc) simuladas: nome -> (args, db) => valor
  rpcs: {},
  // Contas do Supabase Auth simuladas
  authUsers: [],
  reset() {
    this.atraso = { select: 0, insert: 0, update: 0 };
    this.rpcs = {};
    this.authUsers = [];
    this.semSessao = false;
    this.tables = { suporte_chamados: [], feedbacks: [], sistema_config: [], empresas: [], auditoria_logs: [], equipe_usuarios: [] };
    this.columns = { suporte_chamados: null, feedbacks: null };
    this.rls = { deleteAllowed: true, updateAllowed: true };
  },
};

class Query {
  constructor(table) {
    this.table = table;
    this.op = 'select';
    this.filters = [];
    this.payload = null;
    this.umaLinha = false;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(obj) { this.op = 'update'; this.payload = obj; return this; }
  upsert(row, opts = {}) { this.op = 'upsert'; this.payload = Array.isArray(row) ? row : [row]; this.conflito = opts.onConflict || 'id'; return this; }
  gte(col, val) { this.filters.push((r) => (r[col] ?? '') >= val); return this; }
  delete() { this.op = 'delete'; return this; }
  select(colunas) {
    if (typeof colunas === 'string' && colunas.trim() !== '*' && !colunas.includes('(')) {
      this.colunas = colunas.split(',').map((c) => c.trim()).filter(Boolean);
    }
    return this;
  }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
  ilike(col, val) { this.filters.push((r) => String(r[col] ?? '').toLowerCase() === String(val).toLowerCase()); return this; }
  is(col, val) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  order() { return this; }
  limit(n) { this.limite = n; return this; }
  maybeSingle() { this.umaLinha = true; return this; }
  single() { this.umaLinha = true; this.exigeLinha = true; return this; }
  then(resolve, reject) {
    const ms = db.atraso[this.op] || 0;
    // O SELECT "fotografa" o banco no início (como a rede real); insert/update aplicam no fim
    if (this.op === 'select') {
      const resultado = this.run();
      return new Promise((r) => setTimeout(() => r(resultado), ms)).then(resolve, reject);
    }
    return new Promise((r) => setTimeout(r, ms)).then(() => this.run()).then(resolve, reject);
  }

  run() {
    db.tables[this.table] ||= [];
    const rows = db.tables[this.table];
    const match = (r) => this.filters.every((f) => f(r));
    const cols = db.columns[this.table];
    const projetar = (linhas) => (this.colunas ? linhas.map((r) => Object.fromEntries(this.colunas.filter((c) => c in r).map((c) => [c, r[c]]))) : linhas);
    const out = (dadosBrutos) => {
      const data = projetar(dadosBrutos);
      if (this.exigeLinha && data.length !== 1) return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      return { data: this.umaLinha ? (data[0] ?? null) : data, error: null };
    };

    if (this.op === 'insert') {
      for (const p of this.payload) {
        if (cols) {
          const bad = Object.keys(p).find((k) => !cols.includes(k));
          if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}' in the schema cache` } };
        }
      }
      const inserted = this.payload.map((p) => ({ id: randomUUID(), created_at: new Date().toISOString(), finalizado_em: null, ...p }));
      rows.push(...inserted);
      return out(inserted);
    }
    if (this.op === 'upsert') {
      for (const p of this.payload) {
        if (cols) {
          const bad = Object.keys(p).find((k) => !cols.includes(k));
          if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}' in the schema cache` } };
        }
      }
      for (const p of this.payload) {
        const existente = rows.find((r) => r[this.conflito] === p[this.conflito]);
        if (existente) Object.assign(existente, p);
        else rows.push({ ...p });
      }
      return out(this.payload);
    }
    if (this.op === 'update') {
      // RLS bloqueando UPDATE: nenhuma linha afetada, sem erro (comportamento real do PostgREST)
      if (!db.rls.updateAllowed) return out([]);
      const hit = rows.filter(match);
      hit.forEach((r) => Object.assign(r, this.payload));
      return out(hit);
    }
    if (this.op === 'delete') {
      if (!db.rls.deleteAllowed) return out([]);
      const hit = rows.filter(match);
      db.tables[this.table] = rows.filter((r) => !match(r));
      return out(hit);
    }
    const encontrados = rows.filter(match).map((r) => ({ ...r }));
    return out(this.limite ? encontrados.slice(0, this.limite) : encontrados);
  }
}

export const supabase = {
  from: (t) => new Query(t),
  rpc(nome, args) {
    const fn = db.rpcs[nome];
    if (!fn) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${nome}` } });
    try {
      return Promise.resolve({ data: fn(args, db), error: null });
    } catch (e) {
      return Promise.resolve({ data: null, error: { code: e.code || '42501', message: e.message } });
    }
  },
  auth: {
    // Sessão do navegador simulada (o app real só escreve no banco com sessão válida)
    async getSession() {
      if (db.semSessao) return { data: { session: null }, error: null };
      return { data: { session: { expires_at: Math.floor(Date.now() / 1000) + 3600, user: { email: 'teste@rmchat.com' } } }, error: null };
    },
    async refreshSession() {
      if (db.semSessao) return { data: { session: null }, error: { message: 'Refresh Token Not Found' } };
      return this.getSession();
    },
    admin: {
      async createUser({ email, password, user_metadata }) {
        if (db.authUsers.some((u) => u.email === email)) return { data: null, error: { message: 'A user with this email address has already been registered' } };
        const u = { id: randomUUID(), email, password, user_metadata: user_metadata || {} };
        db.authUsers.push(u);
        return { data: { user: u }, error: null };
      },
      async listUsers() {
        return { data: { users: db.authUsers.map((u) => ({ ...u })) }, error: null };
      },
      async updateUserById(id, dados) {
        const u = db.authUsers.find((x) => x.id === id);
        if (!u) return { error: { message: 'not found' } };
        Object.assign(u, dados);
        return { data: { user: u }, error: null };
      },
      async deleteUser(id) {
        db.authUsers = db.authUsers.filter((u) => u.id !== id);
        return { error: null };
      },
    },
  },
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};
export const isSupabaseConfigured = true;
