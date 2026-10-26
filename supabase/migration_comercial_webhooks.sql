-- Webhooks de entrada do Comercial. Executar no SQL Editor do Supabase.
BEGIN;
CREATE TABLE IF NOT EXISTS public.comercial_integracoes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), nome text NOT NULL, tenant_id text NOT NULL,
 pipeline_id text NOT NULL, departamento text NOT NULL, etapa_inicial_id text NOT NULL,
 regras jsonb NOT NULL DEFAULT '[]', ativo boolean NOT NULL DEFAULT false,
 token_hash text NOT NULL UNIQUE, token_prefixo text NOT NULL,
 criado_por text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.comercial_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), integracao_id uuid NOT NULL REFERENCES public.comercial_integracoes(id),
 externo_id text NOT NULL, nome text NOT NULL, email text NOT NULL DEFAULT '', telefone text NOT NULL DEFAULT '',
 departamento text NOT NULL, comercial_pipeline_id text NOT NULL, comercial_etapa_id text NOT NULL,
 responsavel_email text, responsavel_nome text, ultima_ocorrencia_em timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(integracao_id, externo_id)
);
CREATE TABLE IF NOT EXISTS public.comercial_webhook_eventos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), integracao_id uuid NOT NULL REFERENCES public.comercial_integracoes(id),
 evento_id text NOT NULL, payload_hash text NOT NULL, externo_id text NOT NULL, evento text NOT NULL,
 etapa_anterior text, etapa_destino text, resultado jsonb NOT NULL DEFAULT '{}', recebido_em timestamptz NOT NULL DEFAULT now(),
 UNIQUE(integracao_id, evento_id)
);
CREATE INDEX IF NOT EXISTS comercial_leads_departamento_idx ON public.comercial_leads(departamento, updated_at);
CREATE INDEX IF NOT EXISTS comercial_webhooks_recentes_idx ON public.comercial_webhook_eventos(integracao_id, recebido_em DESC);
ALTER TABLE public.comercial_integracoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comercial_webhook_eventos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.comercial_integracoes, public.comercial_leads, public.comercial_webhook_eventos FROM anon, authenticated;
GRANT ALL ON public.comercial_integracoes, public.comercial_leads, public.comercial_webhook_eventos TO service_role;

-- Recibo + criação/movimentação na mesma transação; chamadas concorrentes do mesmo ticket são serializadas.
CREATE OR REPLACE FUNCTION public.rm_receber_lead_comercial(p_integracao uuid, p_token_hash text, p_evento_id text, p_hash text, p_dados jsonb, p_etapa text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i public.comercial_integracoes; l public.comercial_leads; recibo public.comercial_webhook_eventos;
 c jsonb; pipeline jsonb; destino_pipeline text; destino text; resposta jsonb; nova boolean; ocorrido timestamptz;
BEGIN
 SELECT * INTO i FROM public.comercial_integracoes WHERE id = p_integracao AND token_hash = p_token_hash AND ativo FOR SHARE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'codigo','token_invalido'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_integracao::text || ':' || (p_dados->>'externo_id'), 0));
 INSERT INTO public.comercial_webhook_eventos(integracao_id,evento_id,payload_hash,externo_id,evento)
 VALUES(i.id,p_evento_id,p_hash,p_dados->>'externo_id',p_dados->>'evento') ON CONFLICT DO NOTHING RETURNING * INTO recibo;
 IF NOT FOUND THEN
   SELECT * INTO recibo FROM public.comercial_webhook_eventos WHERE integracao_id=i.id AND evento_id=p_evento_id;
   IF recibo.payload_hash <> p_hash THEN RETURN jsonb_build_object('ok',false,'codigo','evento_conflitante'); END IF;
   RETURN recibo.resultado || jsonb_build_object('repetido',true);
 END IF;
 SELECT valor INTO c FROM public.sistema_config WHERE chave='comercial' FOR SHARE;
 SELECT * INTO l FROM public.comercial_leads WHERE integracao_id=i.id AND externo_id=p_dados->>'externo_id' FOR UPDATE;
 nova := NOT FOUND; ocorrido := (p_dados->>'ocorrido_em')::timestamptz;
 destino_pipeline := CASE WHEN NOT nova AND p_etapa IS NULL THEN l.comercial_pipeline_id ELSE i.pipeline_id END;
 SELECT value INTO pipeline FROM jsonb_array_elements(c->'pipelines') WHERE value->>'id'=destino_pipeline;
 IF pipeline IS NULL OR NOT (c->'departamentos' ? i.departamento) THEN RAISE EXCEPTION 'Configuração comercial indisponível'; END IF;
 destino := COALESCE(p_etapa, CASE WHEN nova THEN i.etapa_inicial_id ELSE l.comercial_etapa_id END);
 IF destino NOT IN ('ganho','perda') AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(pipeline->'etapas') WHERE value->>'id'=destino) THEN RAISE EXCEPTION 'Etapa indisponível'; END IF;
 IF NOT nova AND ocorrido <= l.ultima_ocorrencia_em THEN
   resposta := jsonb_build_object('ok',true,'ignorado',true,'motivo','evento_antigo','lead_id',l.id);
 ELSE
   IF nova THEN
     INSERT INTO public.comercial_leads(integracao_id,externo_id,nome,email,telefone,departamento,comercial_pipeline_id,comercial_etapa_id,ultima_ocorrencia_em)
     VALUES(i.id,p_dados->>'externo_id',p_dados->>'nome',p_dados->>'email',p_dados->>'telefone',i.departamento,destino_pipeline,destino,ocorrido) RETURNING * INTO l;
   ELSE
     UPDATE public.comercial_leads SET nome=p_dados->>'nome',email=p_dados->>'email',telefone=p_dados->>'telefone',
       departamento=i.departamento,comercial_pipeline_id=destino_pipeline,comercial_etapa_id=destino,ultima_ocorrencia_em=ocorrido,updated_at=now()
       WHERE id=l.id;
   END IF;
   resposta := jsonb_build_object('ok',true,'criado',nova,'lead_id',l.id,'etapa_id',destino);
 END IF;
 UPDATE public.comercial_webhook_eventos SET resultado=resposta,etapa_anterior=CASE WHEN nova THEN NULL ELSE l.comercial_etapa_id END,etapa_destino=destino WHERE id=recibo.id;
 RETURN resposta;
END $$;
REVOKE ALL ON FUNCTION public.rm_receber_lead_comercial(uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rm_receber_lead_comercial(uuid,text,text,text,jsonb,text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
