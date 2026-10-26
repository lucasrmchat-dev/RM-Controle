import ConfirmacaoReuniao from '@/components/ConfirmacaoReuniao';

// Página pública: o cliente confirma, remarca ou cancela a reunião pelo link do WhatsApp
export const metadata = {
  title: 'Sua reunião',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default function Pagina({ params }) {
  return <ConfirmacaoReuniao token={params.token} />;
}
