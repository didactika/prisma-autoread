import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { QueryBuilder } from '../../src/core/query-builder';
import { DmmfRegistry, ModelMeta } from '../../src/core/dmmf/registry';
import { HalOutput } from '../../src/output/hal.adapter';
import { PlainOutput } from '../../src/output/plain.adapter';
import { Keywords } from '../../src/config/keywords';
import { BuildContext } from '../../src/types/query';

const ctx: BuildContext = {
    defaults: { limit: 10, maxLimit: 100, sort: 'id', order: 'asc' },
    searchable: [],
};

const OID = '507f1f77bcf86cd799439011';

let user: ModelMeta;
let schedule: ModelMeta;

beforeAll(() => {
    DmmfRegistry.clear();
    user = DmmfRegistry.model('user');
    schedule = DmmfRegistry.model('courseSchedule');
});

describe('ObjectId validation', () => {
    it('reads the native type from the DMMF', () => {
        expect(schedule.field('id')?.nativeType).toBe('ObjectId');
        expect(schedule.field('uuid')?.nativeType).toBeUndefined();
    });

    it('rejects a malformed ObjectId cursor with a 400 instead of reaching Prisma', () => {
        expect(() => QueryBuilder.build({ cursor: '2' }, schedule, ctx)).toThrow(
            /Invalid value '2' for field 'id': expected a 24-character hex ObjectId/,
        );
    });

    it('accepts a well-formed ObjectId cursor', () => {
        expect(QueryBuilder.build({ cursor: OID }, schedule, ctx).cursor).toEqual({ id: OID });
    });

    it('rejects a malformed ObjectId in a filter', () => {
        expect(() => QueryBuilder.build({ where: { id: '2' } }, schedule, ctx)).toThrow(/ObjectId/);
        expect(() => QueryBuilder.build({ where: { id: { equals: '2' } } }, schedule, ctx))
            .toThrow(/ObjectId/);
        expect(() => QueryBuilder.build({ where: { id: { in: `${OID},2` } } }, schedule, ctx))
            .toThrow(/ObjectId/);
        expect(() => QueryBuilder.build({ where: { id: { not: '2' } } }, schedule, ctx))
            .toThrow(/ObjectId/);
    });

    it('accepts well-formed ObjectIds in filters', () => {
        expect(QueryBuilder.build({ where: { id: OID } }, schedule, ctx).where).toEqual({ id: OID });
        expect(QueryBuilder.build({ where: { id: { in: `${OID},${OID}` } } }, schedule, ctx).where)
            .toEqual({ id: { in: [OID, OID] } });
    });

    it('leaves fragment operators alone', () => {
        // `startsWith` carries a fragment, so the 24-hex rule must not apply.
        expect(QueryBuilder.build({ where: { id: { startsWith: '507f' } } }, schedule, ctx).where)
            .toEqual({ id: { startsWith: '507f' } });
    });

    it('does not constrain plain String columns', () => {
        expect(QueryBuilder.build({ where: { uuid: '2' } }, schedule, ctx).where).toEqual({ uuid: '2' });
    });

    it('still coerces a non-ObjectId cursor to the id type', () => {
        expect(QueryBuilder.build({ cursor: '42' }, user, ctx).cursor).toEqual({ id: 42 });
    });

    it('coerces the object cursor form and passes compound uniques through', () => {
        expect(QueryBuilder.build({ cursor: { id: '42' } }, user, ctx).cursor).toEqual({ id: 42 });
        expect(() => QueryBuilder.build({ cursor: { id: '2' } }, schedule, ctx)).toThrow(/ObjectId/);

        const compound = { userId_campusId: { userId: 1, campusId: 2 } };
        expect(QueryBuilder.build({ cursor: compound }, user, ctx).cursor).toEqual(compound);
    });
});

describe('Cursor pagination – end of stream', () => {
    const keywords = Keywords.resolve();
    const base = {
        page: 1,
        limit: 2,
        total: 10,
        baseUrl: 'http://localhost/users',
        query: {},
        keywords,
        cursorMode: true,
    };

    it('reports hasNext false and emits no next link once exhausted', () => {
        const hal: any = new HalOutput().format({ data: [], total: 10 }, base);
        expect(hal.pagination.hasNext).toBe(false);
        expect(hal.pagination.nextCursor).toBeUndefined();
        expect(hal.getLink('next')).toBeUndefined();
        expect(hal.getLink('self')).toBeDefined();
        // Offset links would be wrong here: there is no page N to jump to.
        expect(hal.getLink('last')).toBeUndefined();

        const plain: any = new PlainOutput().format({ data: [], total: 10 }, base);
        expect(plain.meta.hasNext).toBe(false);
    });

    it('still advertises the next page while the cursor stream continues', () => {
        const withCursor = { ...base, nextCursor: 7 };
        const hal: any = new HalOutput().format({ data: [{ id: 7 }], total: 10 }, withCursor);
        expect(hal.pagination.hasNext).toBe(true);
        expect(hal.pagination.nextCursor).toBe(7);
        expect(hal.getLink('next').href).toContain('cursor=7');
    });

    it('leaves offset mode untouched', () => {
        const hal: any = new HalOutput().format({ data: [{ id: 1 }], total: 10 }, { ...base, cursorMode: false });
        expect(hal.pagination.hasNext).toBe(true);
        expect(hal.getLink('next').href).toContain('page=2');
    });
});
