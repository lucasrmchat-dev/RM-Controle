// Política compartilhada pelo login, pela verificação de inatividade e pelo contador.
export const SESSION_DURATION_SECONDS = 9 * 60 * 60;

export function formatarTempoSessao(segundos) {
  const total = Math.max(0, Math.floor(Number(segundos) || 0));
  const horas = Math.floor(total / 3600);
  const minutos = Math.floor((total % 3600) / 60);
  const restante = String(total % 60).padStart(2, '0');
  return horas > 0
    ? `${horas}:${String(minutos).padStart(2, '0')}:${restante}`
    : `${minutos}:${restante}`;
}
