import FilterValueParser from '../../src/middlewares/utils/filter-value-parser.util';

describe('FilterValueParser.parseStringValue', () => {
    // ── Non-string pass-through ─────────────────────────────────────────────
    it('returns numbers as-is', () => {
        expect(FilterValueParser.parseStringValue(42)).toBe(42);
    });

    it('returns booleans as-is', () => {
        expect(FilterValueParser.parseStringValue(true)).toBe(true);
        expect(FilterValueParser.parseStringValue(false)).toBe(false);
    });

    it('returns null as-is', () => {
        expect(FilterValueParser.parseStringValue(null)).toBeNull();
    });

    it('returns objects as-is', () => {
        const obj = { a: 1 };
        expect(FilterValueParser.parseStringValue(obj)).toBe(obj);
    });

    // ── Null string ─────────────────────────────────────────────────────────
    it('converts "null" string to null', () => {
        expect(FilterValueParser.parseStringValue('null')).toBeNull();
        expect(FilterValueParser.parseStringValue('NULL')).toBeNull();
    });

    // ── String fields must never be coerced ─────────────────────────────────
    it('returns "true" as string when fieldType is String', () => {
        expect(FilterValueParser.parseStringValue('true', 'String')).toBe('true');
    });

    it('returns "false" as string when fieldType is String', () => {
        expect(FilterValueParser.parseStringValue('false', 'String')).toBe('false');
    });

    it('returns "123" as string when fieldType is String', () => {
        expect(FilterValueParser.parseStringValue('123', 'String')).toBe('123');
    });

    it('returns "3.14" as string when fieldType is String', () => {
        expect(FilterValueParser.parseStringValue('3.14', 'String')).toBe('3.14');
    });

    it('returns "ABC-UUID" as string when fieldType is String', () => {
        expect(FilterValueParser.parseStringValue('ABC-UUID', 'String')).toBe('ABC-UUID');
    });

    // ── Boolean coercion (non-String fields) ────────────────────────────────
    it('converts "true" to boolean true for non-String field', () => {
        expect(FilterValueParser.parseStringValue('true')).toBe(true);
        expect(FilterValueParser.parseStringValue('TRUE')).toBe(true);
    });

    it('converts "false" to boolean false for non-String field', () => {
        expect(FilterValueParser.parseStringValue('false')).toBe(false);
        expect(FilterValueParser.parseStringValue('FALSE')).toBe(false);
    });

    it('converts "true" to boolean true for Boolean field', () => {
        expect(FilterValueParser.parseStringValue('true', 'Boolean')).toBe(true);
    });

    // ── Numeric coercion (non-String fields) ────────────────────────────────
    it('parses integer strings to numbers', () => {
        expect(FilterValueParser.parseStringValue('42')).toBe(42);
        expect(FilterValueParser.parseStringValue('0')).toBe(0);
    });

    it('parses float strings to numbers', () => {
        expect(FilterValueParser.parseStringValue('3.14')).toBe(3.14);
    });

    it('does not parse partial number strings (e.g. "3abc")', () => {
        expect(FilterValueParser.parseStringValue('3abc')).toBe('3abc');
    });

    // ── Plain strings pass through ───────────────────────────────────────────
    it('returns non-matching strings as-is', () => {
        expect(FilterValueParser.parseStringValue('hello world')).toBe('hello world');
    });

    // ── Schema-less mode: conservative round-trip guard ─────────────────────
    it('keeps leading-zero strings as-is when the type is unknown', () => {
        // Could be a String column (zip code, padded id) — don't corrupt it.
        expect(FilterValueParser.parseStringValue('01234')).toBe('01234');
    });

    it('keeps oversized integer strings as-is when the type is unknown', () => {
        const big = '99999999999999999999'; // > Number.MAX_SAFE_INTEGER
        expect(FilterValueParser.parseStringValue(big)).toBe(big);
    });

    // ── Typed numeric field: coerce, leading zeros allowed ──────────────────
    it('coerces leading-zero strings for a typed Int field', () => {
        // An Int column can't store "0123" — the user means 123.
        expect(FilterValueParser.parseStringValue('0123', 'Int')).toBe(123);
    });

    it('falls back to the raw string for an Int value past the safe range', () => {
        const big = '99999999999999999999';
        expect(FilterValueParser.parseStringValue(big, 'Int')).toBe(big);
    });

    // ── BigInt field: native BigInt preserves precision ─────────────────────
    it('parses a BigInt field to a native BigInt without precision loss', () => {
        const big = '99999999999999999999';
        expect(FilterValueParser.parseStringValue(big, 'BigInt')).toBe(BigInt(big));
    });
});

describe('FilterValueParser.parseObjectValue', () => {
    it('returns objects with Prisma operators unchanged', () => {
        const obj = { contains: 'foo', mode: 'insensitive' };
        expect(FilterValueParser.parseObjectValue(obj)).toEqual(obj);
    });

    it('recursively parses non-operator objects', () => {
        const obj = { age: '25', active: 'true' };
        expect(FilterValueParser.parseObjectValue(obj)).toEqual({
            age: 25,
            active: true,
        });
    });
});
