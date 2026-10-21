import './globals.css';
import AppProviders from '@/components/AppProviders';
import { SCRIPT_TEMA_INICIAL } from '@/lib/tema';

export const metadata = {
  title: 'RM Controle',
  description: 'Gestão de demandas, clientes e atendimento da sua equipe em um só lugar.',
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f6f2' },
    { media: '(prefers-color-scheme: dark)', color: '#141416' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA_INICIAL }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body className="min-h-screen bg-[#f5f5f7] dark:bg-[#141416] text-[#1d1d1f] dark:text-[#f5f5f7] antialiased selection:bg-[#4d7c0f]/20 selection:text-[#4d7c0f] dark:selection:bg-[#84cc16]/20 dark:selection:text-[#84cc16] transition-colors duration-300">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
