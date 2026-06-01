import { execSync } from 'child_process';
import path from 'path';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(__dirname, '../../');

export default async function globalSetup(): Promise<void> {
    // Set DATABASE_URL for E2E SQLite database
    process.env.DATABASE_URL = 'file:' + path.join(ROOT, 'test.db');

    // Apply the test schema to SQLite (force-reset is already done by the npm script,
    // but we run db push here as a safety net for direct jest --testPathPattern=e2e invocations)
    try {
        execSync('npx prisma db push --force-reset --skip-generate', {
            cwd: ROOT,
            stdio: 'pipe',
            env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
        });
    } catch {
        // db push may fail if prisma generate was not run; ignore in CI where it was pre-run
    }

    // Seed test data
    const prisma = new PrismaClient({
        datasources: { db: { url: process.env.DATABASE_URL } },
    });

    try {
        // Users
        const alice = await prisma.user.upsert({
            where: { email: 'alice@example.com' },
            update: {},
            create: { firstName: 'Alice', lastName: 'Smith', email: 'alice@example.com', age: 30, active: true },
        });

        const bob = await prisma.user.upsert({
            where: { email: 'bob@example.com' },
            update: {},
            create: { firstName: 'Bob', lastName: 'Jones', email: 'bob@example.com', age: 25, active: false },
        });

        const charlie = await prisma.user.upsert({
            where: { email: 'charlie@example.com' },
            update: {},
            create: { firstName: 'Charlie', lastName: 'Brown', email: 'charlie@example.com', age: 35, active: true },
        });

        // Campuses
        const campusA = await prisma.campus.upsert({
            where: { uuid: 'campus-uuid-alpha' },
            update: {},
            create: { name: 'Alpha Campus', uuid: 'campus-uuid-alpha' },
        });

        const campusB = await prisma.campus.upsert({
            where: { uuid: 'campus-uuid-beta' },
            update: {},
            create: { name: 'Beta Campus', uuid: 'campus-uuid-beta' },
        });

        // Enrolments — the DB is force-reset on every run, so no de-dup is needed
        // (`skipDuplicates` isn't supported by the SQLite provider anyway).
        await prisma.userEnrolment.createMany({
            data: [
                { userId: alice.id, campusId: campusA.id },
                { userId: bob.id, campusId: campusA.id },
                { userId: charlie.id, campusId: campusB.id },
            ],
        });
    } finally {
        await prisma.$disconnect();
    }
}
