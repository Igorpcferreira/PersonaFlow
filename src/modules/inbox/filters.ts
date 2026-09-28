import { z } from 'zod';
import { RequestRejected } from '../../shared/operator-context';

const filtersSchema = z.object({ status: z.enum(['all', 'open', 'resolved']).default('all'),
  control: z.enum(['all', 'manual', 'automatic']).default('all'), q: z.string().trim().max(100).default(''),
  from: z.iso.date().refine((value) => value >= '2020-01-01' && value <= '2099-12-31').optional(),
  to: z.iso.date().refine((value) => value >= '2020-01-01' && value <= '2099-12-31').optional() }).strict().refine((value) => !value.from || !value.to || value.from <= value.to);
export type InboxFilters = z.infer<typeof filtersSchema>;
export function parseInboxFilters(value: unknown = {}) {
  const parsed = filtersSchema.safeParse(value);
  if (!parsed.success) throw new RequestRejected(400, 'Revise os filtros e o intervalo de datas.');
  return parsed.data;
}
// Fuso fixo UTC−03:00 da simulação; limite superior exclusivo inclui todo o último dia.
export function dateRange(filters: Pick<InboxFilters, 'from' | 'to'>) {
  return { ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00-03:00`) } : {}),
    ...(filters.to ? { lt: new Date(new Date(`${filters.to}T00:00:00-03:00`).getTime() + 86_400_000) } : {}) };
}
