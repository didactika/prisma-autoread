import { Serializer } from '../../src/output/serializer';
import { HalOutput } from '../../src/output/hal.adapter';
import { PlainOutput } from '../../src';
import { JsonApiOutput } from '../../src';
import { CsvOutput } from '../../src/output/csv.adapter';
import { Keywords } from '../../src/config/keywords';
import type { OutputContext } from '../../src/types/adapters';

describe('Serializer.sanitize', () => {
    it('converts small BigInt to number, large to string', () => {
        expect(Serializer.sanitize(10n)).toBe(10);
        const big = BigInt(Number.MAX_SAFE_INTEGER) + 10n;
        expect(Serializer.sanitize(big)).toBe(big.toString());
    });

    it('converts a Prisma Decimal to number', () => {
        expect(Serializer.sanitize({ toNumber: () => 3.14, d: [3, 14] })).toBe(3.14);
    });

    it('keeps Date instances', () => {
        const date = new Date('2020-01-01T00:00:00.000Z');
        expect(Serializer.sanitize(date)).toBe(date);
    });

    it('drops circular references', () => {
        const circular: any = { a: 1 };
        circular.self = circular;
        const out = Serializer.sanitize(circular);
        expect(out.a).toBe(1);
        expect(out.self).toBeNull();
    });
});

const ctx: OutputContext = {
    page: 2,
    limit: 10,
    total: 25,
    baseUrl: 'http://host/users',
    query: { filter: { age: '30' }, page: '2', limit: '10' },
    resource: 'User',
    keywords: Keywords.current(),
};

describe('HalOutput', () => {
    it('builds data, pagination and HATEOAS links', () => {
        const payload: any = new HalOutput().format({ data: [{ id: 1 }], total: 25 }, ctx);
        const json = JSON.parse(JSON.stringify(payload));

        expect(json.data).toEqual([{ id: 1 }]);
        expect(json.pagination).toMatchObject({
            page: 2, limit: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: true,
        });
        expect(json._links.self.href).toContain('page=2&limit=10');
        expect(json._links.self.href).toContain('filter%5Bage%5D=30');
        expect(json._links.next.href).toContain('page=3');
        expect(json._links.prev.href).toContain('page=1');
    });

    it('omits prev on the first page and next on the last', () => {
        const first = JSON.parse(JSON.stringify(
            new HalOutput().format({ data: [], total: 25 }, { ...ctx, page: 1 }),
        ));
        expect(first._links.prev).toBeUndefined();
        expect(first._links.next).toBeDefined();

        const last = JSON.parse(JSON.stringify(
            new HalOutput().format({ data: [], total: 25 }, { ...ctx, page: 3 }),
        ));
        expect(last._links.next).toBeUndefined();
        expect(last._links.prev).toBeDefined();
    });

    it('switches to cursor links when nextCursor is set', () => {
        const payload = JSON.parse(JSON.stringify(
            new HalOutput().format({ data: [{ id: 9 }], total: 25 }, { ...ctx, nextCursor: 9 }),
        ));
        expect(payload.pagination.nextCursor).toBe(9);
        expect(payload._links.next.href).toContain('cursor=9');
        expect(payload._links.first).toBeUndefined();
    });

    it('honours renamed keywords in links', () => {
        const keywords = { ...Keywords.current(), page: 'p', limit: 'size' };
        const payload = JSON.parse(JSON.stringify(
            new HalOutput().format({ data: [], total: 25 }, { ...ctx, keywords, query: {} }),
        ));
        expect(payload._links.self.href).toContain('p=2&size=10');
    });
});

describe('PlainOutput', () => {
    it('builds data + meta without links', () => {
        const out: any = new PlainOutput().format({ data: [{ id: 1 }], total: 25 }, ctx);
        expect(out.data).toEqual([{ id: 1 }]);
        expect(out.meta).toEqual({
            page: 2, limit: 10, total: 25, totalPages: 3, hasNext: true, hasPrev: true,
        });
        expect(out._links).toBeUndefined();
    });
});

describe('JsonApiOutput', () => {
    it('builds resource objects with type/id/attributes', () => {
        const out: any = new JsonApiOutput().format(
            { data: [{ id: 1, firstName: 'Alice' }], total: 25 },
            ctx,
        );
        expect(out.data[0]).toEqual({ type: 'User', id: 1, attributes: { firstName: 'Alice' } });
        expect(out.meta.totalPages).toBe(3);
        expect(out.links.self).toContain('page=2');
    });
});

describe('CsvOutput', () => {
    it('renders a header and escaped rows', () => {
        const adapter = new CsvOutput();
        const csv = adapter.format(
            { data: [{ id: 1, name: 'A,B' }, { id: 2, name: 'plain' }], total: 2 },
            ctx,
        );
        expect(adapter.contentType).toContain('text/csv');
        expect(csv.split('\r\n')[0]).toBe('id,name');
        expect(csv).toContain('"A,B"');
    });

    it('returns an empty string with no rows', () => {
        expect(new CsvOutput().format({ data: [], total: 0 }, ctx)).toBe('');
    });
});
