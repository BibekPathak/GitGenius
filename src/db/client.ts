import { PrismaClient } from "@prisma/client";

const clients = new Map<string, PrismaClient>();

export function getPrisma(dbPath: string): PrismaClient {
  const existing = clients.get(dbPath);
  if (existing) return existing;

  const prisma = new PrismaClient({
    datasources: { db: { url: `file:${dbPath}` } },
  });
  clients.set(dbPath, prisma);
  return prisma;
}

export async function closePrisma(dbPath?: string): Promise<void> {
  if (dbPath) {
    const client = clients.get(dbPath);
    if (client) {
      await client.$disconnect();
      clients.delete(dbPath);
    }
    return;
  }

  for (const [path, client] of clients) {
    await client.$disconnect();
    clients.delete(path);
  }
}

export function clearPrismaClients(): void {
  for (const [, client] of clients) {
    client.$disconnect();
  }
  clients.clear();
}
