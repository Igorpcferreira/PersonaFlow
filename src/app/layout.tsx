import type { ReactNode } from 'react';
import './styles.css';

export const metadata = { title: 'PersonaFlow · Simulação local', description: 'Demonstração local de automações com contas fictícias.' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
