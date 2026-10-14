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
  reset() {
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
    this.single = false;
  }
  insert(rows) { this.op = 'insert'; this.payload = rows; return this; }
  update(obj) { this.op = 'update'; this.payload = obj; return this; }
  upsert(row, opts = {}) { this.op = 'upsert'; this.payload = Array.isArray(row) ? row : [row]; this.conflito = opts.onConflict || 'id'; return this; }
  gte(col, val) { this.filters.push((r) => (r[col] ?? '') >= val); return this; }
  delete() { this.op = 'delete'; return this; }
  select() { return this; }
  eq(col, val) { this.filters.push((r) => r[col] === val); return this; }
  in(col, vals) { this.filters.push((r) => vals.includes(r[col])); return this; }
  is(col, val) { this.filters.push((r) => (r[col] ?? null) === val); return this; }
  order() { return this; }
  maybeSingle() { this.single = true; return this; }
  then(resolve, reject) { return Promise.resolve(this.run()).then(resolve, reject); }

  run() {
    const rows = db.tables[this.table];
    const match = (r) => this.filters.every((f) => f(r));
    const cols = db.columns[this.table];
    const out = (data) => ({ data: this.single ? (data[0] ?? null) : data, error: null });

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
    return out(rows.filter(match).map((r) => ({ ...r })));
  }
}

export const supabase = {
  from: (t) => new Query(t),
  channel: () => ({ on() { return this; }, subscribe() { return this; } }),
  removeChannel: () => {},
};
export const isSupabaseConfigured = true;
