import './globals.css';

export const metadata = {
  title: 'RM Controle — Gestão de Empresas & Suporte',
  description: 'Plataforma administrativa de controle de empresas, canais de mensageria (API Cloud / QR Code), suporte técnico e requisitos de servidores com conformidade LGPD e RLS.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-[#f5f5f7] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] antialiased selection:bg-[#4d7c0f]/20 selection:text-[#4d7c0f] dark:selection:bg-[#84cc16]/20 dark:selection:text-[#84cc16] transition-colors duration-300">
        {children}
      </body>
    </html>
  );
}
