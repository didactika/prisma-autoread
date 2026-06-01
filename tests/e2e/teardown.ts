import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

export default async function globalTeardown(): Promise<void> {
    const dbPath = path.resolve(__dirname, '../../test.db');

    const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
    });

    try {
        await prisma.$disconnect();
    } catch {
        // ignore
    }

    // Remove test database files
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const file = dbPath + suffix;
        if (fs.existsSync(file)) {
            try { fs.unlinkSync(file); } catch { /* ignore */ }
        }
    }
}
