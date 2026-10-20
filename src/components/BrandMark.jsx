import React, { useId } from 'react';

// Símbolo do RM Controle: monograma "R" cuja perna termina em um sinal de concluído.
// Controle (o R) + demanda resolvida (o traço verde) — o que o sistema entrega.
export function BrandMark({ size = 40, className = '', title = 'RM Controle' }) {
  const gradId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      role="img"
      aria-label={title}
      className={className}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1f2914" />
          <stop offset="1" stopColor="#0a0c07" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradId})`} />
      <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" stroke="#ffffff" strokeOpacity="0.09" />
      <g transform="translate(-2.2 0.3)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2">
        <path d="M13 11V28.5M13 11H19.5A5 5 0 0 1 19.5 21H13" stroke="#f4f2ec" />
        <path d="M17.5 21L22 27.8L31.5 12.5" stroke="#a3e635" />
      </g>
    </svg>
  );
}

/** Símbolo + nome. `tone="light"` para fundos escuros. */
export function BrandLockup({ size = 36, tone = 'auto', subtitle = null, className = '' }) {
  const corNome =
    tone === 'light' ? 'text-[#f4f2ec]' : tone === 'dark' ? 'text-[#14160f]' : 'text-[#14160f] dark:text-[#f4f2ec]';
  const corSub =
    tone === 'light' ? 'text-[#f4f2ec]/55' : tone === 'dark' ? 'text-[#14160f]/55' : 'text-[#14160f]/55 dark:text-[#f4f2ec]/55';
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <BrandMark size={size} />
      <div className="leading-none">
        <span className={`block text-[15px] font-semibold tracking-[-0.02em] ${corNome}`}>RM Controle</span>
        {subtitle && <span className={`block mt-1 text-[11px] tracking-[0.01em] ${corSub}`}>{subtitle}</span>}
      </div>
    </div>
  );
}

export default BrandMark;
