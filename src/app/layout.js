import './globals.css';

export const metadata = {
  title: 'RM Controle — Gestão de Empresas & Suporte',
  description: 'Plataforma administrativa de controle de empresas, canais WhatsApp (API / QR Code), suporte técnico e requisitos de servidores com conformidade LGPD e RLS.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-zinc-100 antialiased selection:bg-[#4d7c0f]/20 selection:text-[#4d7c0f] dark:selection:bg-[#84cc16]/20 dark:selection:text-[#84cc16] transition-colors duration-200">
        {children}
      </body>
    </html>
  );
}
