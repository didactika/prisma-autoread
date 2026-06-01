import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { mockRequest, mockResponse, mockNext } from '../helpers/mock-request';
import FilterMiddleware from '../../src/middlewares/filter.middleware';

// Helper: run the async middleware and await the result
async function runFilterMiddleware(
    entityName: string | undefined,
    query: Record<string, any>
) {
    const req = mockRequest({ query });
    const res = mockResponse() as any;
    const next = mockNext();

    const middleware = FilterMiddleware.processQueryFilters(entityName);
    await middleware(req, res, next);

    return { req, res, next };
}

describe('FilterMiddleware.processQueryFilters – basic field filters', () => {
    it('populates req.custom.filter with a scalar integer field', async () => {
        const { req } = await runFilterMiddleware('user', { age: '30' });
        expect(req.custom?.filter?.age).toBe(30);
    });

    it('preserves String field values as strings (no boolean coercion)', async () => {
        const { req } = await runFilterMiddleware('user', { firstName: 'true' });
        expect(req.custom?.filter?.firstName).toBe('true');
    });

    it('preserves String field values as strings (no numeric coercion)', async () => {
        const { req } = await runFilterMiddleware('user', { firstName: '123' });
        expect(req.custom?.filter?.firstName).toBe('123');
    });

    it('coerces "true" to boolean for a Boolean field', async () => {
        const { req } = await runFilterMiddleware('user', { active: 'true' });
        expect(req.custom?.filter?.active).toBe(true);
    });

    it('normalises field name casing', async () => {
        const { req } = await runFilterMiddleware('user', { firstname: 'Bob' });
        expect(req.custom?.filter?.firstName).toBe('Bob');
        expect(req.custom?.filter?.firstname).toBeUndefined();
    });

    it('converts "null" string to null', async () => {
        const { req } = await runFilterMiddleware('user', { age: 'null' });
        expect(req.custom?.filter?.age).toBeNull();
    });

    it('ignores reserved params (page, limit, sort, order, include, search)', async () => {
        const { req } = await runFilterMiddleware('user', {
            page: '2', limit: '20', sort: 'id', order: 'asc',
            include: 'campus', search: 'foo',
        });
        expect(req.custom?.filter).toEqual({});
    });

    it('throws (calls next with error) for unknown field', async () => {
        const { next } = await runFilterMiddleware('user', { unknownField: 'value' });
        expect(next.mock.calls[0][0]).toBeDefined();
    });
});

describe('FilterMiddleware.processQueryFilters – LIKE filter modes', () => {
    it('adds STARTS_WITH to likeFilters', async () => {
        const { req } = await runFilterMiddleware('user', {
            'firstName[STARTS_WITH]': 'Al',
        });
        const lf = req.custom?.likeFilters?.find(f => f.key === 'firstName');
        expect(lf?.mode).toBe('STARTS_WITH');
        expect(lf?.value).toBe('Al');
    });

    it('adds ENDS_WITH to likeFilters', async () => {
        const { req } = await runFilterMiddleware('user', {
            'firstName[ENDS_WITH]': 'ce',
        });
        const lf = req.custom?.likeFilters?.find(f => f.key === 'firstName');
        expect(lf?.mode).toBe('ENDS_WITH');
    });

    it('adds LIKE to likeFilters', async () => {
        const { req } = await runFilterMiddleware('user', {
            'firstName[LIKE]': 'lic',
        });
        const lf = req.custom?.likeFilters?.find(f => f.key === 'firstName');
        expect(lf?.mode).toBe('LIKE');
    });

    it('handles EXACT mode → adds to filter, not likeFilters', async () => {
        const { req } = await runFilterMiddleware('user', {
            'firstName[EXACT]': 'Alice',
        });
        expect(req.custom?.filter?.firstName).toBe('Alice');
        expect(req.custom?.likeFilters?.find(f => f.key === 'firstName')).toBeUndefined();
    });
});

describe('FilterMiddleware.processQueryFilters – nested relation filters (bracket notation)', () => {
    it('creates dot-notation filter for campus.uuid (String field)', async () => {
        const { req } = await runFilterMiddleware('userEnrolment', {
            'campus[uuid]': 'ABC-123',
        });
        expect(req.custom?.filter?.['campus.uuid']).toBe('ABC-123');
        expect(typeof req.custom?.filter?.['campus.uuid']).toBe('string');
    });

    it('creates dot-notation filter for user.age (Int field)', async () => {
        const { req } = await runFilterMiddleware('userEnrolment', {
            'user[age]': '25',
        });
        expect(req.custom?.filter?.['user.age']).toBe(25);
    });

    it('creates likeFilter for campus.uuid STARTS_WITH', async () => {
        const { req } = await runFilterMiddleware('userEnrolment', {
            'campus[uuid][STARTS_WITH]': 'A',
        });
        const lf = req.custom?.likeFilters?.find(f => f.key === 'campus.uuid');
        expect(lf?.mode).toBe('STARTS_WITH');
    });
});

describe('FilterMiddleware.processQueryFilters – qs object notation', () => {
    it('handles qs-parsed nested object { user: { firstName: "Alice" } }', async () => {
        const { req } = await runFilterMiddleware('userEnrolment', {
            user: { firstName: 'Alice' },
        });
        expect(req.custom?.filter?.user?.firstName).toBe('Alice');
    });

    it('preserves String value in qs object notation', async () => {
        const { req } = await runFilterMiddleware('userEnrolment', {
            campus: { uuid: '123-456' },
        });
        expect(req.custom?.filter?.campus?.uuid).toBe('123-456');
        expect(typeof req.custom?.filter?.campus?.uuid).toBe('string');
    });
});

describe('FilterMiddleware.processQueryFilters – search and include', () => {
    it('populates req.custom.search', async () => {
        const { req } = await runFilterMiddleware('user', { search: 'Alice' });
        expect(req.custom?.search).toBe('Alice');
    });

    it('populates req.custom.include for a single relation', async () => {
        const { req } = await runFilterMiddleware('user', { include: 'enrolments' });
        expect(req.custom?.include).toContainEqual({ enrolments: true });
    });

    it('sets req.custom.include to "*" for wildcard', async () => {
        const { req } = await runFilterMiddleware('user', { include: '*' });
        expect(req.custom?.include).toBe('*');
    });
});

describe('FilterMiddleware.processQueryFilters – no entityName (schema-less mode)', () => {
    it('accepts any field without validation', async () => {
        const { req, next } = await runFilterMiddleware(undefined, {
            someField: 'value',
            anotherField: '42',
        });
        expect(next).toHaveBeenCalledWith();
        expect(req.custom?.filter?.someField).toBe('value');
        expect(req.custom?.filter?.anotherField).toBe(42);
    });
});
