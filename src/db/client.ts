import { PrismaClient } from "@prisma/client";

let prisma: PrismaClient | null = null;

export function getPrisma(dbPath: string): PrismaClient {
  if (prisma) return prisma;

  process.env.DATABASE_URL = `file:${dbPath}`;
  prisma = new PrismaClient();
  return prisma;
}

export async function closePrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}
