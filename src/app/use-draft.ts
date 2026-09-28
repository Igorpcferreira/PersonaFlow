'use client';
import { useSyncExternalStore } from 'react';

function subscribe(changed: () => void) {
  window.addEventListener('storage', changed); window.addEventListener('personaflow-draft', changed);
  return () => { window.removeEventListener('storage', changed); window.removeEventListener('personaflow-draft', changed); };
}
export function useDraft(accountId: string, conversationId?: string) {
  const key = `personaflow:${accountId}:composer${conversationId ? `:${conversationId}` : ''}`;
  const draft = useSyncExternalStore(subscribe, () => localStorage.getItem(key) ?? '', () => '');
  const save = (value: string) => { localStorage.setItem(key, value); window.dispatchEvent(new Event('personaflow-draft')); };
  return [draft, save] as const;
}
