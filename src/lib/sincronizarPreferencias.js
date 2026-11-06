// Sincroniza as preferências da pessoa com a conta (navegador ↔ servidor), sem mexer em cada tela:
//  - ao entrar: a conta manda; o que só existe neste navegador sobe para a conta;
//  - se a conta trouxe algo diferente, grava no navegador e recarrega UMA vez para a tela abrir já no visual certo;
//  - depois, a cada poucos segundos (e ao sair da página), se algo mudou, envia para a conta.
import { assinatura, diferencas, lerPreferenciasLocais, mesclar, validarPreferencias } from './preferenciasConta';

async function chamar(metodo, corpo) {
  const res = await fetch('/api/preferencias', {
    method: metodo,
    credentials: 'same-origin',
    cache: 'no-store',
    keepalive: metodo === 'PUT',
    ...(corpo ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.mensagem || 'Sem resposta do servidor.');
  return json;
}

/** Devolve uma função que para a sincronização. */
export function iniciarSincronizacaoDePreferencias() {
  if (typeof window === 'undefined') return () => {};
  let parado = false;
  let ultimaEnviada = '';
  let indisponivel = false;
  // Só envia depois de ler a conta: antes disso o navegador pode ter só os valores padrão e apagaria o que a pessoa escolheu
  let pronto = false;

  const enviar = async (forcar = false) => {
    if (parado || indisponivel || !pronto) return;
    const locais = lerPreferenciasLocais(localStorage);
    const marca = assinatura(locais);
    if (!forcar && marca === ultimaEnviada) return;
    try {
      const r = await chamar('PUT', { preferencias: locais });
      if (r.indisponivel) indisponivel = true;
      else ultimaEnviada = marca;
    } catch {}
  };

  const lerConta = async () => {
    try {
      const r = await chamar('GET');
      pronto = true;
      if (parado || r.indisponivel) {
        indisponivel = Boolean(r.indisponivel);
        return;
      }
      const conta = validarPreferencias(r.preferencias);
      const locais = lerPreferenciasLocais(localStorage);
      const mudou = diferencas(locais, conta);
      if (mudou.length) {
        mudou.forEach((chave) => {
          try {
            localStorage.setItem(chave, conta[chave]);
          } catch {}
        });
        // Recarrega uma vez por versão da conta (evita laço se o navegador não deixar gravar)
        const marca = String(r.atualizado_em || assinatura(conta));
        let jaFez = null;
        try {
          jaFez = sessionStorage.getItem('rm_prefs_aplicadas');
          sessionStorage.setItem('rm_prefs_aplicadas', marca);
        } catch {}
        if (jaFez !== marca) {
          window.location.reload();
          return;
        }
      }
      // O que só existe neste navegador sobe para a conta
      const total = mesclar(lerPreferenciasLocais(localStorage), conta);
      ultimaEnviada = assinatura(conta);
      if (assinatura(total) !== ultimaEnviada) {
        const lidos = lerPreferenciasLocais(localStorage);
        ultimaEnviada = '';
        await enviar(true);
        if (!ultimaEnviada) ultimaEnviada = assinatura(lidos);
      }
    } catch {
      // Sem resposta agora: tenta de novo daqui a pouco (e não envia nada enquanto isso)
      if (!parado) setTimeout(lerConta, 20000);
    }
  };
  lerConta();

  const intervalo = setInterval(() => enviar(), 5000);
  const aoSair = () => enviar();
  const aoEsconder = () => document.visibilityState === 'hidden' && enviar();
  window.addEventListener('pagehide', aoSair);
  document.addEventListener('visibilitychange', aoEsconder);
  return () => {
    parado = true;
    clearInterval(intervalo);
    window.removeEventListener('pagehide', aoSair);
    document.removeEventListener('visibilitychange', aoEsconder);
  };
}
