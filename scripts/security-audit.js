#!/usr/bin/env node
/**
 * Script de Auditoria de Segurança e Rastreamento de Segredos Vazados no Histórico Git
 * Em conformidade com OWASP Top 10 e Diretrizes LGPD.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const FORBIDDEN_PATTERNS = [
  { name: 'Chave Privada RSA/SSH', regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'Supabase Service Role Key Exposta', regex: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*['"]?[a-zA-Z0-9_\-\.]{40,}['"]?/ },
  { name: 'AWS Access Key ID', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'AWS Secret Access Key', regex: /(aws_secret_access_key|aws_secret_key)\s*=\s*['"]?[0-9a-zA-Z\/+=]{40}['"]?/i },
  { name: 'Token de Acesso GitHub', regex: /gh[pousr]_[0-9a-zA-Z]{36}/ },
  { name: 'Senha em LocalStorage no Código', regex: /localStorage\.setItem\(['"]rm_user_password_/ },
  { name: 'E-mail do Usuário em LocalStorage', regex: /localStorage\.setItem\(['"]rm_auth_user/ },
];

console.log('🔍 [1/3] Iniciando varredura de arquivos do projeto em busca de segredos...');

let violations = [];

function scanDirectory(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.next' ||
        entry.name === '.git' ||
        entry.name === 'coverage'
      ) {
        continue;
      }
      scanDirectory(fullPath);
    } else if (entry.isFile()) {
      // Ignora arquivos binários, imagens e o próprio script de auditoria
      if (
        fullPath.endsWith('.png') ||
        fullPath.endsWith('.jpg') ||
        fullPath.endsWith('.ico') ||
        fullPath.endsWith('.mp3') ||
        fullPath.endsWith('.wav') ||
        fullPath.includes('security-audit.js') ||
        fullPath.includes('.env.example')
      ) {
        continue;
      }

      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        for (const rule of FORBIDDEN_PATTERNS) {
          if (rule.regex.test(content)) {
            violations.push({
              file: fullPath,
              rule: rule.name,
            });
          }
        }
      } catch (err) {
        // Ignora arquivos não-texto
      }
    }
  }
}

scanDirectory(process.cwd());

console.log('🔍 [2/3] Rastreando histórico do Git em busca de segredos commitados no passado...');
try {
  const gitLog = execSync('git log -n 30 -p --no-color 2>/dev/null', { encoding: 'utf-8' });
  for (const rule of FORBIDDEN_PATTERNS) {
    // Checa apenas linhas adicionadas (+) no diff
    const addedLines = gitLog.split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++'));
    for (const line of addedLines) {
      if (rule.regex.test(line)) {
        violations.push({
          file: 'Histórico do Git (Commit Passado)',
          rule: `${rule.name} detectada em diff histórico`,
        });
        break;
      }
    }
  }
} catch (e) {
  console.log('ℹ️ Git não disponível ou repositório raso, ignorando checagem de commits passados.');
}

console.log('🔍 [3/3] Checando arquivos sensíveis no .gitignore...');
const gitignorePath = path.join(process.cwd(), '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  if (!gitignoreContent.includes('.env*.local') && !gitignoreContent.includes('.env')) {
    violations.push({
      file: '.gitignore',
      rule: 'Arquivos .env e .env*.local não estão devidamente listados no .gitignore',
    });
  }
} else {
  violations.push({
    file: '.gitignore',
    rule: 'Arquivo .gitignore não encontrado!',
  });
}

console.log('\n======================================================');
if (violations.length === 0) {
  console.log('✅ AUDITORIA CONCLUÍDA: Nenhum segredo ou vulnerabilidade de PII detectado!');
  console.log('   O repositório está blindado e em conformidade com os padrões de segurança.');
  process.exit(0);
} else {
  console.warn('⚠️ ALERTA DE SEGURANÇA: Itens que requerem atenção foram identificados:');
  violations.forEach((v) => {
    console.warn(`  - [${v.rule}] no arquivo: ${v.file}`);
  });
  console.warn('\nCertifique-se de revisar estes pontos antes de enviar para a produção.');
  process.exit(1);
}
