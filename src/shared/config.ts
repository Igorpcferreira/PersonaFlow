import 'dotenv/config';
import { z } from 'zod';

const databaseUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ['postgres:', 'postgresql:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname) &&
      url.pathname.startsWith('/personaflow_')
    );
  } catch {
    return false;
  }
});

export function parseDatabaseUrl(value: string | undefined): string {
  if (!value || !databaseUrlSchema.safeParse(value).success) {
    throw new Error('DATABASE_URL inválida: use um banco PostgreSQL local personaflow_*; valor omitido por segurança.');
  }
  return value;
}

export function getDatabaseUrl(): string {
  return parseDatabaseUrl(process.env.DATABASE_URL);
}
