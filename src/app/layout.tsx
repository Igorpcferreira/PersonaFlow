import type { ReactNode } from 'react';
import './styles.css';

export const metadata = { title: 'PersonaFlow · Kyber', description: 'Painel de automações da Kyber Tech.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
