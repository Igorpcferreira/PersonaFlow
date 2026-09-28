import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { getDatabaseUrl } from './config';

export function createPrisma() {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: getDatabaseUrl() }) });
}

export type Database = ReturnType<typeof createPrisma>;
