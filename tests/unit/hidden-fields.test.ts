import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { FieldMask } from '../../src/core/mask';
import { QueryBuilder } from '../../src/core/query-builder';
import { SpecGuard } from '../../src/core/spec-guard';
import { OptionsResolver } from '../../src/config/options-resolver';
import { DmmfRegistry, ModelMeta } from '../../src/core/dmmf/registry';
import { BuildContext, ResolvedSecurity } from '../../src/types/query';

let user: ModelMeta;
let schedule: ModelMeta;

beforeAll(() => {
    DmmfRegistry.clear();
    user = DmmfRegistry.model('user');
    schedule = DmmfRegistry.model('courseSchedule');
});

function security(hidden: string[]): ResolvedSecurity {
    return { fields: '*', relations: '*', hidden: FieldMask.compile(hidden), maxDepth: 12 };
}

function ctx(hidden: string[]): BuildContext {
    return {
        defaults: { limit: 10, maxLimit: 100, sort: 'id', order: 'asc' },
        searchable: [],
        security: security(hidden),
    };
}

describe('FieldMask', () => {
    it('strips hidden keys from an object', () => {
        const mask = FieldMask.compile(['email']);
        expect(FieldMask.apply({ id: 1, email: 'a@b.c' }, mask)).toEqual({ id: 1 });
    });

    it('is case-insensitive', () => {
        const mask = FieldMask.compile(['EMAIL']);
        expect(FieldMask.apply({ email: 'a@b.c' }, mask)).toEqual({});
    });

    it('follows dotted paths into nested objects and arrays', () => {
        const mask = FieldMask.compile(['enrolments.secret']);
        const row = {
            id: 1,
            secret: 'kept at root',
            enrolments: [
                { id: 10, secret: 'gone' },
                { id: 11, secret: 'gone' },
            ],
        };
        expect(FieldMask.apply(row, mask)).toEqual({
            id: 1,
            secret: 'kept at root',
            enrolments: [{ id: 10 }, { id: 11 }],
        });
    });

    it('reaches into embedded composite documents', () => {
        const mask = FieldMask.compile(['program.subjects.uuid']);
        const row = { program: { name: 'P', subjects: [{ shortname: 'S', uuid: 'x' }] } };
        expect(FieldMask.apply(row, mask)).toEqual({
            program: { name: 'P', subjects: [{ shortname: 'S' }] },
        });
    });

    it('keeps Date values intact', () => {
        const date = new Date('2026-01-01T00:00:00.000Z');
        const masked: any = FieldMask.apply({ createdAt: date }, FieldMask.compile(['x']));
        expect(masked.createdAt).toBe(date);
    });

    it('returns the value untouched when nothing is hidden', () => {
        const row = { id: 1 };
        expect(FieldMask.apply(row, undefined)).toBe(row);
        expect(FieldMask.compile([])).toBeUndefined();
    });
});

describe('QueryBuilder – hidden fields', () => {
    it('rejects a hidden field in a filter as if it did not exist', () => {
        expect(() => QueryBuilder.build({ where: { email: 'a@b.c' } }, user, ctx(['email'])))
            .toThrow(/Unknown field 'email' on User/);
    });

    it('never names a hidden field in the available-fields hint', () => {
        expect(() => QueryBuilder.build({ where: { nope: 1 } }, user, ctx(['email'])))
            .toThrow(/^(?!.*email).*$/s);
    });

    it('rejects a hidden field in sort, fields, distinct and aggregations', () => {
        const hidden = ctx(['email']);
        expect(() => QueryBuilder.build({ orderBy: [{ email: 'asc' }] }, user, hidden)).toThrow();
        expect(() => QueryBuilder.build({ select: { email: true } }, user, hidden)).toThrow();
        expect(() => QueryBuilder.build({ distinct: 'email' }, user, hidden)).toThrow();
        expect(() => QueryBuilder.build({ max: 'email' }, user, hidden)).toThrow();
        expect(() => QueryBuilder.build({ by: 'email' }, user, hidden)).toThrow();
    });

    it('rejects a hidden relation', () => {
        expect(() => QueryBuilder.build({ include: { enrolments: true } }, user, ctx(['enrolments'])))
            .toThrow(/Cannot include unknown relation 'enrolments'/);
    });

    it('applies the mask one level down a relation', () => {
        const scoped = ctx(['enrolments.campusId']);
        expect(() => QueryBuilder.build({ where: { enrolments: { campusId: 1 } } }, user, scoped))
            .toThrow(/Unknown field 'campusId' on UserEnrolment/);
        // The same name at root level is untouched.
        expect(QueryBuilder.build({ where: { age: 30 } }, user, scoped).where).toEqual({ age: 30 });
    });

    it('applies the mask inside composite types', () => {
        expect(() =>
            QueryBuilder.build(
                { where: { program: { uuid: 'P1' } } },
                schedule,
                ctx(['program.uuid']),
            ),
        ).toThrow(/Unknown field 'uuid' on Program/);
    });

    it('drops hidden fields from the search expansion', () => {
        const spec = QueryBuilder.build({ search: 'al' }, user, {
            ...ctx(['email']),
            searchable: ['firstName', 'email'],
        });
        expect(spec.where).toEqual({ OR: [{ firstName: { contains: 'al' } }] });
    });
});

describe('SpecGuard – already-built specs (legacy path)', () => {
    it('rejects a hidden field in a captured where', () => {
        expect(() => SpecGuard.check({ where: { email: 'a@b.c' } }, user, security(['email'])))
            .toThrow(/Unknown field 'email' on User/);
    });

    it('rejects a hidden field nested under a relation', () => {
        expect(() =>
            SpecGuard.check(
                { where: { enrolments: { some: { campusId: 1 } } } },
                user,
                security(['enrolments.campusId']),
            ),
        ).toThrow(/Unknown field 'campusId'/);
    });

    it('rejects a hidden field inside a composite filter', () => {
        expect(() =>
            SpecGuard.check(
                { where: { program: { is: { uuid: 'P1' } } } },
                schedule,
                security(['program.uuid']),
            ),
        ).toThrow(/Unknown field 'uuid' on Program/);
    });

    it('enforces the fields allow-list the legacy engine cannot see', () => {
        const policy: ResolvedSecurity = {
            fields: new Set(['id', 'firstname']),
            relations: '*',
            maxDepth: 12,
        };
        expect(() => SpecGuard.check({ where: { age: 30 } }, user, policy))
            .toThrow(/Cannot filter by field 'age'/);
        expect(() => SpecGuard.check({ orderBy: [{ age: 'asc' }] }, user, policy))
            .toThrow(/Cannot sort by field 'age'/);
        expect(() => SpecGuard.check({ where: { firstName: 'Alice' } }, user, policy)).not.toThrow();
    });

    it('enforces the relations allow-list', () => {
        const policy: ResolvedSecurity = { fields: '*', relations: new Set(), maxDepth: 12 };
        expect(() => SpecGuard.check({ include: { enrolments: true } }, user, policy))
            .toThrow(/Cannot traverse relation 'enrolments'/);
    });

    it('is a no-op when nothing is restricted', () => {
        const policy: ResolvedSecurity = { fields: '*', relations: '*', maxDepth: 12 };
        expect(() => SpecGuard.check({ where: { anything: 1 } }, user, policy)).not.toThrow();
    });
});

describe('OptionsResolver – hidden', () => {
    it('compiles hidden and removes hidden fields from searchable', () => {
        const resolved = OptionsResolver.resolve({
            model: 'User',
            delegate: {} as any,
            searchable: ['firstName', 'email'],
            security: { hidden: ['email'] },
        });
        expect(resolved.searchable).toEqual(['firstName']);
        expect(resolved.security.hidden?.fields.has('email')).toBe(true);
    });

    it('keeps working alongside strict mode', () => {
        const resolved = OptionsResolver.resolve({
            model: 'User',
            delegate: {} as any,
            security: { strict: true, fields: ['id', 'email'], hidden: ['email'] },
        });
        expect(resolved.security.hidden?.fields.has('email')).toBe(true);
    });
});
