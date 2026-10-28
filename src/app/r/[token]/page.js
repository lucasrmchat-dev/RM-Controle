import ConfirmacaoReuniao from '@/components/ConfirmacaoReuniao';

// Página pública: o cliente confirma, remarca ou cancela a reunião pelo link do WhatsApp
export const metadata = {
  title: 'Sua reunião',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

// Next 15: params chega como Promise
export default async function Pagina({ params }) {
  const { token } = await params;
  return <ConfirmacaoReuniao token={token} />;
}
