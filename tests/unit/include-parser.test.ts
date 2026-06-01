import IncludeParser from '../../src/middlewares/utils/include-parser.util';

describe('IncludeParser.parse', () => {
    // ── Wildcard ─────────────────────────────────────────────────────────────
    it('returns "*" for wildcard string', () => {
        expect(IncludeParser.parse('*')).toBe('*');
    });

    it('returns "*" if any element in array is "*"', () => {
        expect(IncludeParser.parse(['user', '*', 'campus'])).toBe('*');
    });

    // ── Single relation ───────────────────────────────────────────────────────
    it('parses a single relation string', () => {
        expect(IncludeParser.parse('user')).toEqual({ user: true });
    });

    // ── Comma-separated relations ─────────────────────────────────────────────
    it('parses comma-separated relations into an array', () => {
        const result = IncludeParser.parse('user,campus');
        expect(result).toEqual([{ user: true }, { campus: true }]);
    });

    // ── Bracket notation ──────────────────────────────────────────────────────
    it('parses bracket notation for a nested relation', () => {
        expect(IncludeParser.parse('user[enrolments]')).toEqual({
            user: { enrolments: true },
        });
    });

    it('parses bracket wildcard', () => {
        expect(IncludeParser.parse('user[*]')).toEqual({ user: '*' });
    });

    it('parses nested comma-separated relations inside brackets', () => {
        const result = IncludeParser.parse('user[enrolments,campus]');
        expect(result).toEqual({
            user: [{ enrolments: true }, { campus: true }],
        });
    });

    // ── Array input ───────────────────────────────────────────────────────────
    it('parses an array of relation strings', () => {
        const result = IncludeParser.parse(['user', 'campus']);
        expect(result).toEqual([{ user: true }, { campus: true }]);
    });

    // ── Object input ──────────────────────────────────────────────────────────
    it('passes through object format', () => {
        const result = IncludeParser.parse({ user: 'enrolments' });
        expect(result).toEqual({ user: { enrolments: true } });
    });

    // ── Null / empty ─────────────────────────────────────────────────────────
    it('returns null for empty string', () => {
        expect(IncludeParser.parse('')).toBeNull();
    });

    it('returns null for whitespace', () => {
        expect(IncludeParser.parse('   ')).toBeNull();
    });
});
