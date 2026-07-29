/**
 * 15 · MongoDB embedded documents (composite types)
 *
 * A `type` block is not a model: Prisma stores it inside the parent document and
 * filters it with `is`/`isNot` (single) or `some`/`every`/`none` (list). Those
 * fields are addressed exactly like relations here — the wrapper is inserted for
 * you, at any depth, with per-field validation and type coercion.
 *
 * Schema this example assumes:
 *
 *   model CourseSchedule {
 *     id        String    @id @default(auto()) @map("_id") @db.ObjectId
 *     uuid      String    @unique
 *     groupTerm String
 *     startDate DateTime
 *     program   Program
 *     @@map("course_schedule")
 *   }
 *
 *   type Program  { shortname String  name String  uuid String  subjects Subject[] }
 *   type Subject  { shortname String  type String  uuid String  startDate DateTime
 *                   activities Activity[] }
 *   type Activity { codeSuffix String  extraRanges Json? }
 */
import express, { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { createAutoRead } from '@didactika/prisma-autoread';

const prisma = new PrismaClient();
const app = express();

const schedules = Router();
createAutoRead({
    model: 'CourseSchedule',
    delegate: (prisma as any).courseSchedule,
    legacy: false,
    methods: ['GET', 'QUERY'],
    routes: ['list', 'count'],
    defaults: { sort: 'startDate', order: 'desc', limit: 20 },
    // Embedded fields are covered by `fields`/`hidden` like any other column, and
    // a dotted path reaches inside the document.
    security: { hidden: ['program.uuid'] },
}).applyTo(schedules);
app.use('/course-schedules', schedules);

app.use((err: any, _req: any, res: any, _next: any) =>
    res.status(err.status ?? 500).json({ error: err.message }),
);
app.listen(3000);

/* Try:

   # single embedded document → wrapped in `is`
   GET /course-schedules?filter[program][shortname]=MAT
   → where: { program: { is: { shortname: 'MAT' } } }

   # embedded list → wrapped in `some`
   GET /course-schedules?filter[program][subjects][type]=lab
   → where: { program: { is: { subjects: { some: { type: 'lab' } } } } }

   # operators and coercion work inside the document
   GET /course-schedules?filter[program][shortname][startsWith]=MA
   GET /course-schedules?filter[program][subjects][startDate][gte]=2026-01-01

   # three levels down
   GET /course-schedules?filter[program][subjects][activities][codeSuffix]=A1

   # write the wrapper yourself when you need a different one
   GET /course-schedules?filter[program][isNot][shortname]=MAT
   GET /course-schedules?filter[program][is][subjects][every][type]=lab

   # combine with everything else
   GET /course-schedules?filter[groupTerm]=2026-1&filter[program][shortname]=MAT&limit=50
   GET /course-schedules/count?filter[program][subjects][type]=lab

   # projection: the whole document, since Prisma returns it with the row
   GET /course-schedules?fields=uuid,program
   # `include=program` is a no-op — embedded documents always come back
   # `program.uuid` is hidden: absent from every row, and 400 if filtered on

   The old GET syntax reads the same paths:
   GET /course-schedules?program[shortname]=MAT
   GET /course-schedules?program[shortname][STARTS_WITH]=MA
*/
