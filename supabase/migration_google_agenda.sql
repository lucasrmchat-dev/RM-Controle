-- Sincronização bidirecional com o Google Agenda (Agenda → Google e Google → Agenda).
-- Cada evento sincronizado guarda de qual agenda Google veio e o id do evento lá.
ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT,
  ADD COLUMN IF NOT EXISTS google_ical_uid TEXT,
  ADD COLUMN IF NOT EXISTS google_atualizado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dia_inteiro BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem TEXT NOT NULL DEFAULT 'sistema';

-- Um evento do Google aparece uma única vez por agenda (NULLs não conflitam: eventos só do sistema)
CREATE UNIQUE INDEX IF NOT EXISTS agenda_eventos_google_uk
  ON public.agenda_eventos (google_calendar_id, google_event_id);
CREATE INDEX IF NOT EXISTS idx_agenda_google_calendar ON public.agenda_eventos (google_calendar_id);
