import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { operatorContext } from '@/shared/operator-context';
import { getAuthRuntime } from '@/shared/auth-runtime';
import AccountShell from '@/app/account-shell';

export default async function AccountPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  let allowed = false;
  try {
    const { config } = getAuthRuntime();
    await operatorContext(new Request(`${config.baseURL}/accounts/${accountId}`, { headers: await headers() }), accountId);
    allowed = true;
  } catch { /* Sem dados protegidos na resposta para sessão/contexto inválidos. */ }
  if (!allowed) redirect('/');
  return <AccountShell accountId={accountId} />;
}
