## 📌 Descrição das Alterações

<!-- Forneça um resumo objetivo das mudanças introduzidas por este Pull Request. -->

## 🔗 Issue Relacionada
<!-- Todo PR DEVE estar amarrado a uma Issue existente no repositório. -->
Resolve: #

---

## 🛡️ Checklist de Segurança & LGPD
- [ ] **Zero PII em LocalStorage:** Nenhuma informação pessoal (e-mails, CPFs, tokens) está sendo gravada em `localStorage`.
- [ ] **Sessão Segura:** Tokens e acessos sensíveis transitam exclusivamente via cookies HTTP-only.
- [ ] **Supabase RLS:** Nenhuma política vulnerável com `USING (true)` anônimo foi criada; todas exigem papel autenticado.
- [ ] **Sem Segredos Expostos:** Nenhuma chave privada, token ou senha foi versionada ou exposta com prefixo `NEXT_PUBLIC_`.
- [ ] **Sanitização:** Entradas de dados e parâmetros foram rigorosamente validados e sanitizados contra injeções.
- [ ] **Imutabilidade de Auditoria:** Eventos críticos continuam registrando logs com identificador e carimbo temporal imutável.

## 🎨 Checklist de UI/UX & Motion
- [ ] **Estética Apple/Vercel:** Paleta de alto contraste, bordas sutis (1px), materiais translúcidos e tipografia alinhada.
- [ ] **Framer Motion:** Animações baseadas em física spring suave (damping 25-30, stiffness 200-300).
- [ ] **Skeleton Loaders:** Carregamento progressivo presente em estados de espera, sem layout shift (CLS = 0).

## 🧪 Testes e Validação
- [ ] Testado em aba anônima (rotas privadas bloqueadas para usuários não autenticados).
- [ ] Lógica de negócios e dados de clientes integralmente preservados.
- [ ] Executada varredura pré-commit (`npm run security:scan` e `npm run lint`).
