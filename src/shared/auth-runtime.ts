import { createPrisma } from './db';
import { createAuth } from './auth';
import { parseAuthConfig } from './auth-config';

// Lazy: build sem conexão e sem segredo; configuração exigida somente em request.
const runtime = globalThis as typeof globalThis & { personaAuth?: ReturnType<typeof createRuntime> };
function createRuntime() {
  const config = parseAuthConfig(process.env);
  const db = createPrisma();
  return { config, db, auth: createAuth(db, config) };
}
export function getAuthRuntime() {
  return runtime.personaAuth ??= createRuntime();
}
