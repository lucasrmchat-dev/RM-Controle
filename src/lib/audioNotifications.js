/**
 * Sistema de Notificações Sonoras com Web Audio API
 * Sem dependência de arquivos externos (100% autônomo, confiável e nativo do navegador)
 */

let audioCtx = null;
let activeLoopInterval = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function getAudioConfig() {
  if (typeof window === 'undefined') {
    return {
      habilitado: true,
      tipoSom: 'harmonico',
      modoRepeticao: 'uma_vez', // 'uma_vez' | 'intermitente' | 'intervalo'
      intervaloSegundos: 30,
      escopo: 'departamentos', // 'departamentos' | 'atribuidos'
      notificarCriador: false, // se true, toca som para quem acabou de abrir o chamado
    };
  }

  let depsSel = [];
  try {
    depsSel = JSON.parse(localStorage.getItem('rm_audio_departamentos_selecionados') || '[]');
  } catch (e) {}

  return {
    habilitado: localStorage.getItem('rm_audio_habilitado') !== 'false',
    tipoSom: localStorage.getItem('rm_audio_tipo_som') || 'harmonico',
    modoRepeticao: localStorage.getItem('rm_audio_modo') || 'uma_vez',
    intervaloSegundos: parseInt(localStorage.getItem('rm_audio_intervalo') || '30', 10),
    escopo: localStorage.getItem('rm_audio_escopo') || 'departamentos',
    departamentosSelecionados: Array.isArray(depsSel) ? depsSel : [],
    notificarCriador: localStorage.getItem('rm_audio_notificar_criador') === 'true',
  };
}

export function setAudioConfig(newConfig) {
  if (typeof window === 'undefined') return;
  if (newConfig.habilitado !== undefined) {
    localStorage.setItem('rm_audio_habilitado', newConfig.habilitado ? 'true' : 'false');
  }
  if (newConfig.tipoSom !== undefined) {
    localStorage.setItem('rm_audio_tipo_som', newConfig.tipoSom);
  }
  if (newConfig.modoRepeticao !== undefined) {
    localStorage.setItem('rm_audio_modo', newConfig.modoRepeticao);
  }
  if (newConfig.intervaloSegundos !== undefined) {
    localStorage.setItem('rm_audio_intervalo', newConfig.intervaloSegundos.toString());
  }
  if (newConfig.escopo !== undefined) {
    localStorage.setItem('rm_audio_escopo', newConfig.escopo);
  }
  if (newConfig.departamentosSelecionados !== undefined) {
    localStorage.setItem('rm_audio_departamentos_selecionados', JSON.stringify(newConfig.departamentosSelecionados));
  }
  if (newConfig.notificarCriador !== undefined) {
    localStorage.setItem('rm_audio_notificar_criador', newConfig.notificarCriador ? 'true' : 'false');
  }
  window.dispatchEvent(new Event('rm_audio_config_updated'));
}

/**
 * Sintetiza os 4 tipos de toques sonoros
 */
export function playNotificationTone(tipo = 'harmonico') {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  switch (tipo) {
    case 'harmonico': {
      // 1. Harmônico Apple (Acorde suave em C Maior: C5, E5, G5)
      const freqs = [523.25, 659.25, 783.99, 1046.50];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.08);

        gain.gain.setValueAtTime(0, now + idx * 0.08);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.65);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.7);
      });
      break;
    }

    case 'dinamico': {
      // 2. Alerta Dinâmico (Bi-tom estilo radar tecnológico: 880Hz -> 1174Hz)
      const tones = [880, 1174.66];
      tones.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.12);

        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.22, now + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.3);
      });
      break;
    }

    case 'sino': {
      // 3. Sino Suave / Marimba (Toque percussivo calmo e relaxante)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(698.46, now); // F5

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.9);
      break;
    }

    case 'incisivo': {
      // 4. Urgente / Incisivo (Pulsos rápidos e marcantes para chamados críticos)
      [0, 0.14, 0.28].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(740, now + offset);

        gain.gain.setValueAtTime(0, now + offset);
        gain.gain.linearRampToValueAtTime(0.15, now + offset + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.1);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.12);
      });
      break;
    }

    default:
      playNotificationTone('harmonico');
  }
}

/**
 * Dispara notificação sonora para um novo chamado respeitando as regras configuradas
 */
export function triggerSupportNotification({ chamado, userEmail, criadoPorMim = false }) {
  const config = getAudioConfig();
  if (!config.habilitado) return;

  // 1. Se o chamado foi adiado / pausado pelo usuário (Snooze), silencia até expirar o tempo
  if (chamado?.adiado_ate) {
    const adiadoAteMs = new Date(chamado.adiado_ate).getTime();
    if (Date.now() < adiadoAteMs) {
      return; // Alerta adiado, não toca
    }
  }

  const myEmail = (userEmail || '').toLowerCase().trim();
  const criadorEmail = (chamado?.atribuido_por_email || '').toLowerCase().trim();

  // REGRA: Se foi o próprio usuário atual que criou/atribuiu a demanda, NUNCA toca para ele mesmo!
  // (seja atribuindo para si mesmo ou para outro colaborador, quem criou já sabe e não deve ouvir som)
  if (criadoPorMim || (criadorEmail && criadorEmail === myEmail)) {
    return;
  }

  const chamadoTecnicoEmail = (chamado?.tecnico_email || '').toLowerCase().trim();
  const chamadoTecnicoNome = (chamado?.tecnico_nome || chamado?.atendente || '').toLowerCase().trim();

  // REGRA ESTRITA DE ATRIBUIÇÃO DIRETA:
  // Se atribuído diretamente a alguém, toca EXCLUSIVAMENTE para a pessoa designada e para mais ninguém!
  const isAtribuidoDiretamente = Boolean(
    chamadoTecnicoEmail && 
    chamadoTecnicoEmail !== 'geral' && 
    chamadoTecnicoEmail !== '' && 
    !chamado?.is_fila_geral
  );

  if (isAtribuidoDiretamente) {
    const souEuODesignado = 
      chamadoTecnicoEmail === myEmail ||
      (chamadoTecnicoEmail.includes('lucas') && (myEmail.includes('lucas') || myEmail.includes('admin'))) ||
      (chamadoTecnicoEmail.includes('admin') && myEmail.includes('admin')) ||
      (chamadoTecnicoNome.includes('lucas') && (myEmail.includes('lucas') || myEmail.includes('admin')));

    if (!souEuODesignado) {
      return; // Atribuído a outro colaborador: NÃO toca para mim nem para os demais!
    }
  }

  // 4. Se for da Fila Geral (não atribuída especificamente a alguém):
  if (!isAtribuidoDiretamente) {
    // 1. Se o usuário só quer receber alertas do que foi atribuído diretamente a ele
    if (config.escopo === 'apenas_meus' || config.escopo === 'atribuidos') {
      return;
    }

    // 2. Filtro por departamentos personalizados selecionados (ex: gestor)
    if (config.escopo === 'selecionados') {
      const depsAlvo = Array.isArray(config.departamentosSelecionados)
        ? config.departamentosSelecionados.map((d) => (d || '').toLowerCase().trim())
        : [];
      if (depsAlvo.length > 0) {
        const chamadoCats = Array.isArray(chamado?.categorias)
          ? chamado.categorias.map((c) => (c || '').toLowerCase().trim())
          : (chamado?.motivo ? chamado.motivo.split(',').map((s) => s.trim().toLowerCase()) : ['suporte']);
        const pertence = chamadoCats.some((c) => depsAlvo.includes(c));
        if (!pertence) {
          return; // Não pertence a nenhum dos departamentos selecionados
        }
      }
    }

    // 3. Filtro por departamento do operador
    if (config.escopo === 'departamentos') {
      try {
        if (typeof window !== 'undefined') {
          const rawUsers = localStorage.getItem('rm_equipe_usuarios');
          const role = localStorage.getItem('rm_user_role') || '';
          const isAdmin = role === 'administrador' || myEmail === 'admin@rmcontrole.com' || myEmail === 'lucas.rmchat@gmail.com' || myEmail.includes('admin') || myEmail.includes('lucas');

          if (!isAdmin && rawUsers) {
            const equipe = JSON.parse(rawUsers);
            const me = equipe.find((u) => (u.email || '').toLowerCase().trim() === myEmail);
            const meusDeps = Array.isArray(me?.departamentos) && me.departamentos.length > 0
              ? me.departamentos.map((d) => d.toLowerCase().trim())
              : ['suporte'];

            const chamadoCats = Array.isArray(chamado?.categorias)
              ? chamado.categorias.map((c) => c.toLowerCase().trim())
              : (chamado?.motivo ? chamado.motivo.split(',').map((s) => s.trim().toLowerCase()) : ['suporte']);

            const pertenceAoMeuDep = chamadoCats.some((c) => meusDeps.includes(c));
            if (!pertenceAoMeuDep) {
              return; // Demanda não pertence a nenhum departamento do operador
            }
          }
        }
      } catch (e) {}
    }
  }

  // Toca o som imediatamente
  playNotificationTone(config.tipoSom);

  // Limpa loops anteriores
  if (activeLoopInterval) {
    clearInterval(activeLoopInterval);
    activeLoopInterval = null;
  }

  // Se modo for apenas uma vez, não agenda repetição
  if (config.modoRepeticao === 'uma_vez') {
    return;
  }

  const loopCallback = () => {
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('chamados_suporte');
        if (raw) {
          const list = JSON.parse(raw);
          const myEmail = (userEmail || '').toLowerCase().trim();

          const hasPending = list.some((c) => {
            const isPending = c.status === 'aguardando_visualizacao' || c.status === 'pendente';
            if (!isPending) return false;

            // Se o chamado foi adiado pelo usuário e ainda está dentro do período de silêncio, não toca
            if (c.adiado_ate && Date.now() < new Date(c.adiado_ate).getTime()) {
              return false;
            }

            const tec = (c.tecnico_email || '').toLowerCase().trim();
            const isAtribuidoOutro = Boolean(tec && tec !== 'geral' && !c.is_fila_geral && tec !== myEmail);
            if (isAtribuidoOutro) {
              return false; // Atribuído a outro funcionário, não continua tocando para mim
            }

            if (!tec || c.is_fila_geral) {
              if (config.escopo === 'apenas_meus' || config.escopo === 'atribuidos') {
                return false;
              }
            }

            return true;
          });

          if (!hasPending) {
            stopSupportNotificationLoop();
            return;
          }
        }
      }
    } catch (e) {}
    playNotificationTone(config.tipoSom);
  };

  // Modo intermitente: sem tempo mínimo de espera, toca em ciclo contínuo (~1.1s logo após o término do toque)
  if (config.modoRepeticao === 'intermitente') {
    activeLoopInterval = setInterval(loopCallback, 1100);
  } else if (config.modoRepeticao === 'intervalo' || config.modoRepeticao === 'loop') {
    const segs = Math.max(3, config.intervaloSegundos || 30);
    activeLoopInterval = setInterval(loopCallback, segs * 1000);
  }
}

/**
 * Interrompe a repetição do alerta quando o chamado é visualizado/assumido
 */
export function stopSupportNotificationLoop() {
  if (activeLoopInterval) {
    clearInterval(activeLoopInterval);
    activeLoopInterval = null;
  }
}

/**
 * Sintetizador exclusivo de alerta para Reuniões e Agenda (Chime de Calendário Apple/Google)
 * Utiliza 4 harmônicos elegantes com decay suave (E5 -> G#5 -> B5 -> E6)
 */
export function playMeetingAlertTone() {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const notes = [659.25, 830.61, 987.77, 1318.51];
  notes.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(f, now + idx * 0.11);

    gain.gain.setValueAtTime(0, now + idx * 0.11);
    gain.gain.linearRampToValueAtTime(0.25, now + idx * 0.11 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.85);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now + idx * 0.11);
    osc.stop(now + idx * 0.11 + 0.9);
  });
}
