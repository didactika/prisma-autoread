import { RsqlParser } from '../../src/input/parsers/rsql-parser';
import { ODataParser } from '../../src/input/parsers/odata-parser';

describe('parseRsql', () => {
    it('parses comparison operators', () => {
        expect(RsqlParser.parse('age=ge=30')).toEqual({ age: { gte: '30' } });
        expect(RsqlParser.parse('age=lt=18')).toEqual({ age: { lt: '18' } });
        expect(RsqlParser.parse('name!=Bob')).toEqual({ name: { not: 'Bob' } });
    });

    it('parses equality and wildcards', () => {
        expect(RsqlParser.parse('name==Alice')).toEqual({ name: 'Alice' });
        expect(RsqlParser.parse('name==Al*')).toEqual({ name: { startsWith: 'Al' } });
        expect(RsqlParser.parse('name==*ce')).toEqual({ name: { endsWith: 'ce' } });
        expect(RsqlParser.parse('name==*li*')).toEqual({ name: { contains: 'li' } });
    });

    it('parses in / out lists', () => {
        expect(RsqlParser.parse('role=in=(admin,editor)')).toEqual({ role: { in: ['admin', 'editor'] } });
        expect(RsqlParser.parse('role=out=(guest)')).toEqual({ role: { notIn: ['guest'] } });
    });

    it('parses AND (;) and OR (,) with precedence', () => {
        expect(RsqlParser.parse('a==1;b==2')).toEqual({ AND: [{ a: '1' }, { b: '2' }] });
        expect(RsqlParser.parse('a==1,b==2')).toEqual({ OR: [{ a: '1' }, { b: '2' }] });
        // AND binds tighter than OR
        expect(RsqlParser.parse('a==1,b==2;c==3')).toEqual({
            OR: [{ a: '1' }, { AND: [{ b: '2' }, { c: '3' }] }],
        });
    });

    it('parses grouping and dotted selectors', () => {
        expect(RsqlParser.parse('(a==1,b==2);c==3')).toEqual({
            AND: [{ OR: [{ a: '1' }, { b: '2' }] }, { c: '3' }],
        });
        expect(RsqlParser.parse('campus.uuid==A')).toEqual({ campus: { uuid: 'A' } });
    });
});

describe('parseODataFilter', () => {
    it('parses comparisons and literals', () => {
        expect(ODataParser.parse('age gt 30')).toEqual({ age: { gt: '30' } });
        expect(ODataParser.parse("name eq 'Alice'")).toEqual({ name: 'Alice' });
        expect(ODataParser.parse('active eq true')).toEqual({ active: true });
        expect(ODataParser.parse('age ne 18')).toEqual({ age: { not: '18' } });
    });

    it('parses and / or / not', () => {
        expect(ODataParser.parse("age gt 30 and name eq 'Al'")).toEqual({
            AND: [{ age: { gt: '30' } }, { name: 'Al' }],
        });
        expect(ODataParser.parse('a eq 1 or b eq 2')).toEqual({ OR: [{ a: '1' }, { b: '2' }] });
        expect(ODataParser.parse('not (age lt 18)')).toEqual({ NOT: { age: { lt: '18' } } });
    });

    it('parses string functions and paths', () => {
        expect(ODataParser.parse("startswith(name,'Al')")).toEqual({ name: { startsWith: 'Al' } });
        expect(ODataParser.parse("contains(email,'@corp')")).toEqual({ email: { contains: '@corp' } });
        expect(ODataParser.parse("campus/uuid eq 'A'")).toEqual({ campus: { uuid: 'A' } });
    });
});
