'use client';

import React, { useEffect, useRef, useState } from 'react';

// Cloudflare Turnstile: captcha sem quebra-cabeça (a maioria das pessoas nem precisa clicar).
// Só aparece quando NEXT_PUBLIC_TURNSTILE_SITE_KEY estiver configurada; o servidor confere o token.
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '';
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let carregamento = null;
function carregarScript() {
  if (typeof window === 'undefined') return Promise.reject();
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!carregamento) {
    carregamento = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(window.turnstile);
      script.onerror = () => {
        carregamento = null;
        reject(new Error('Não foi possível carregar a verificação. Verifique sua conexão.'));
      };
      document.head.appendChild(script);
    });
  }
  return carregamento;
}

export const captchaAtivo = Boolean(SITE_KEY);

export default function CaptchaTurnstile({ onToken, theme = 'light' }) {
  const alvoRef = useRef(null);
  const widgetRef = useRef(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!SITE_KEY) return undefined;
    let cancelado = false;
    carregarScript()
      .then((turnstile) => {
        if (cancelado || !alvoRef.current) return;
        widgetRef.current = turnstile.render(alvoRef.current, {
          sitekey: SITE_KEY,
          action: 'login',
          theme: theme === 'dark' ? 'dark' : 'light',
          size: 'flexible',
          language: 'pt-br',
          callback: (token) => {
            setErro('');
            onTokenRef.current?.(token);
          },
          'expired-callback': () => onTokenRef.current?.(''),
          'error-callback': () => {
            onTokenRef.current?.('');
            setErro('Não foi possível confirmar a verificação. Recarregue a página e tente novamente.');
          },
        });
      })
      .catch((e) => setErro(e.message));

    // Depois de uma tentativa recusada o token já foi usado: gera um novo
    const reiniciar = () => {
      onTokenRef.current?.('');
      if (window.turnstile && widgetRef.current !== null) window.turnstile.reset(widgetRef.current);
    };
    window.addEventListener('rm_captcha_reset', reiniciar);
    return () => {
      cancelado = true;
      window.removeEventListener('rm_captcha_reset', reiniciar);
      if (window.turnstile && widgetRef.current !== null) window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
      onTokenRef.current?.('');
    };
  }, [theme]);

  if (!SITE_KEY) return null;
  return (
    <div className="space-y-1.5">
      <div ref={alvoRef} className="min-h-[65px] w-full [&_iframe]:!w-full rounded-xl overflow-hidden" aria-label="Verificação de segurança" />
      {erro && (
        <p role="alert" className="text-[12.5px] text-[#912018] dark:text-[#fda29b]">
          {erro}
        </p>
      )}
    </div>
  );
}
