-- Agendador do RM Controle no Supabase (pg_cron + pg_net): a cada minuto chama /api/envios/processar,
-- que manda as mensagens dos envios em massa na hora certa (o plano gratuito da Vercel só agenda 1x por dia).
-- Não rode direto: use scripts/agendador/ligar-agendador.sh, que pede o endereço e o CRON_SECRET escondido.
-- O endereço e o segredo ficam no cofre do Supabase (Vault), nunca no texto da tarefa agendada.
\set ON_ERROR_STOP 1

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT vault.update_secret(id, :'cron_secret') FROM vault.secrets WHERE name = 'rm_cron_secret';
SELECT vault.create_secret(:'cron_secret', 'rm_cron_secret', 'CRON_SECRET da Vercel (agendador do RM Controle)')
  WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rm_cron_secret');
SELECT vault.update_secret(id, :'app_url') FROM vault.secrets WHERE name = 'rm_app_url';
SELECT vault.create_secret(:'app_url', 'rm_app_url', 'Endereço do RM Controle (agendador)')
  WHERE NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'rm_app_url');

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'rm-envios-massa';
SELECT cron.schedule(
  'rm-envios-massa',
  '* * * * *',
  $$ SELECT net.http_post(
       url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rm_app_url') || '/api/envios/processar',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'rm_cron_secret')
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);

SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'rm-envios-massa';
