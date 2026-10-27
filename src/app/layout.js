import './globals.css';
import AppProviders from '@/components/AppProviders';
import { SCRIPT_TEMA_INICIAL } from '@/lib/tema';
import { SCRIPT_PALETA_INICIAL } from '@/lib/paletas';

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
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_PALETA_INICIAL }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
        />
      </head>
      <body className="min-h-screen bg-rm-fundo dark:bg-rm-fundo-escuro text-[#1d1d1f] dark:text-[#f5f5f7] antialiased selection:bg-rm-acento/20 selection:text-rm-acento dark:selection:bg-rm-acento-escuro/20 dark:selection:text-rm-acento-escuro transition-colors duration-300">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
