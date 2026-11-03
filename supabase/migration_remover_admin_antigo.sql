-- admin@rmcontrole.com deixa de ser dono da plataforma.
-- Ninguém usa essa caixa de e-mail, e scripts antigos (create_admin_user.sql, supabase_master_schema.sql)
-- criavam esse usuário com uma senha fixa escrita no repositório. O código também tirou o e-mail
-- da lista de proprietários (src/lib/roles.js).
-- Pode ser rodado de novo sem problema.
BEGIN;

DELETE FROM public.rm_admins_proprietarios WHERE email = 'admin@rmcontrole.com';
-- Sessão de suporte que ele tivesse aberto também acaba
DELETE FROM public.sessoes_suporte WHERE email = 'admin@rmcontrole.com';

COMMIT;
