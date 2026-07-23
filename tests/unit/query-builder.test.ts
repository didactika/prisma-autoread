import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { QueryBuilder } from '../../src/core/query-builder';
import { DmmfRegistry, ModelMeta } from '../../src/core/dmmf/registry';
import { BuildContext } from '../../src/types/query';

const ctx: BuildContext = {
    defaults: { limit: 10, maxLimit: 100, sort: 'id', order: 'asc' },
    searchable: [],
};

let user: ModelMeta;
let enrolment: ModelMeta;

beforeAll(() => {
    DmmfRegistry.clear();
    user = DmmfRegistry.model('user');
    enrolment = DmmfRegistry.model('userEnrolment');
});

describe('QueryBuilder – where', () => {
    it('coerces a scalar Int equality', () => {
        const spec = QueryBuilder.build({ where: { age: '30' } }, user, ctx);
        expect(spec.where).toEqual({ age: 30 });
    });

    it('preserves String values', () => {
        const spec = QueryBuilder.build({ where: { firstName: '30' } }, user, ctx);
        expect(spec.where).toEqual({ firstName: '30' });
    });

    it('maps operators and coerces (gte)', () => {
        const spec = QueryBuilder.build({ where: { age: { gte: '30' } } }, user, ctx);
        expect(spec.where).toEqual({ age: { gte: 30 } });
    });

    it('supports alias operators (eq, contains)', () => {
        const spec = QueryBuilder.build({ where: { firstName: { contains: 'Al' } } }, user, ctx);
        expect(spec.where).toEqual({ firstName: { contains: 'Al' } });
    });

    it('coerces in-lists (comma string or array)', () => {
        expect(QueryBuilder.build({ where: { age: { in: '25,30' } } }, user, ctx).where)
            .toEqual({ age: { in: [25, 30] } });
        expect(QueryBuilder.build({ where: { age: { in: ['25', '30'] } } }, user, ctx).where)
            .toEqual({ age: { in: [25, 30] } });
    });

    it('treats a bare array as an in-list', () => {
        const spec = QueryBuilder.build({ where: { age: ['25', '30'] } }, user, ctx);
        expect(spec.where).toEqual({ age: { in: [25, 30] } });
    });

    it('handles isNull', () => {
        expect(QueryBuilder.build({ where: { lastName: { isNull: 'true' } } }, user, ctx).where)
            .toEqual({ lastName: { equals: null } });
        expect(QueryBuilder.build({ where: { lastName: { isNull: 'false' } } }, user, ctx).where)
            .toEqual({ lastName: { not: null } });
    });

    it('handles logical OR / AND / NOT', () => {
        const spec = QueryBuilder.build({
            where: { or: [{ firstName: 'Alice' }, { age: '30' }] },
        }, user, ctx);
        expect(spec.where).toEqual({ OR: [{ firstName: 'Alice' }, { age: 30 }] });

        const spec2 = QueryBuilder.build({ where: { NOT: { active: 'true' } } }, user, ctx);
        expect(spec2.where).toEqual({ NOT: { active: true } });
    });

    it('to-one relation → direct nested filter', () => {
        const spec = QueryBuilder.build({ where: { campus: { uuid: 'A' } } }, enrolment, ctx);
        expect(spec.where).toEqual({ campus: { uuid: 'A' } });
    });

    it('to-many relation → wrapped in some', () => {
        const spec = QueryBuilder.build({ where: { enrolments: { campusId: '1' } } }, user, ctx);
        expect(spec.where).toEqual({ enrolments: { some: { campusId: 1 } } });
    });

    it('explicit relation operator (some/none)', () => {
        const spec = QueryBuilder.build({
            where: { enrolments: { none: { campusId: '2' } } },
        }, user, ctx);
        expect(spec.where).toEqual({ enrolments: { none: { campusId: 2 } } });
    });

    it('JSON field passes through with a normalised path array', () => {
        const spec = QueryBuilder.build({
            where: { metadata: { path: ['theme'], equals: 'dark' } },
        }, user, ctx);
        expect(spec.where).toEqual({ metadata: { path: ['theme'], equals: 'dark' } });
    });

    it('throws 400 for an unknown field', () => {
        expect(() => QueryBuilder.build({ where: { nope: 'x' } }, user, ctx)).toThrow();
    });

    it('throws 400 for an unknown operator', () => {
        expect(() => QueryBuilder.build({ where: { age: { between: '1' } } }, user, ctx)).toThrow();
    });
});

describe('QueryBuilder – search', () => {
    it('expands search into an OR over searchable fields, AND-ed with where', () => {
        const spec = QueryBuilder.build(
            { where: { active: 'true' }, search: 'ali' },
            user,
            { ...ctx, searchable: ['firstName', 'email'] },
        );
        expect(spec.where).toEqual({
            AND: [
                { active: true },
                { OR: [{ firstName: { contains: 'ali' } }, { email: { contains: 'ali' } }] },
            ],
        });
    });
});

describe('QueryBuilder – orderBy / select / pagination', () => {
    it('applies the default sort when none is given', () => {
        const spec = QueryBuilder.build({}, user, ctx);
        expect(spec.orderBy).toEqual([{ id: 'asc' }]);
    });

    it('builds and validates orderBy', () => {
        const spec = QueryBuilder.build({ orderBy: [{ lastName: 'desc' }, { age: 'asc' }] }, user, ctx);
        expect(spec.orderBy).toEqual([{ lastName: 'desc' }, { age: 'asc' }]);
    });

    it('throws for an unknown sort field', () => {
        expect(() => QueryBuilder.build({ orderBy: [{ nope: 'asc' }] }, user, ctx)).toThrow();
    });

    it('builds select from fields', () => {
        const spec = QueryBuilder.build({ select: { id: true, firstName: true } }, user, ctx);
        expect(spec.select).toEqual({ id: true, firstName: true });
        expect(spec.include).toBeUndefined();
    });

    it('select wins over include', () => {
        const spec = QueryBuilder.build(
            { select: { id: true }, include: { enrolments: true } },
            user,
            ctx,
        );
        expect(spec.select).toEqual({ id: true });
        expect(spec.include).toBeUndefined();
    });

    it('computes skip/take from page/limit, capped by maxLimit', () => {
        const spec = QueryBuilder.build({ page: 3, limit: 20 }, user, ctx);
        expect(spec.take).toBe(20);
        expect(spec.skip).toBe(40);

        const capped = QueryBuilder.build({ page: 1, limit: 999 }, user, ctx);
        expect(capped.take).toBe(100);
    });
});
