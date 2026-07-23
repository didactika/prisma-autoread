import JsonFilterProcessor from '../../src/legacy/utils/json-filter-processor.util';
import { JsonFilter } from '../../src/types';

describe('JsonFilterProcessor.process', () => {
    it('emits an EXACT filter for a single-level path', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('metadata', { theme: 'dark' }, out);

        expect(out).toEqual([
            { field: 'metadata', path: ['theme'], mode: 'EXACT', value: 'dark' },
        ]);
    });

    it('descends into nested objects to build a deep path', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('metadata', { address: { city: 'Vigo' } }, out);

        expect(out).toEqual([
            { field: 'metadata', path: ['address', 'city'], mode: 'EXACT', value: 'Vigo' },
        ]);
    });

    it('recognises an explicit string operator at the leaf', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('metadata', { bio: { LIKE: 'dev' } }, out);

        expect(out).toEqual([
            { field: 'metadata', path: ['bio'], mode: 'LIKE', value: 'dev' },
        ]);
    });

    it('coerces numeric and boolean leaf values', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('metadata', { count: '5' }, out);
        JsonFilterProcessor.process('metadata', { active: 'true' }, out);

        expect(out[0]).toEqual({ field: 'metadata', path: ['count'], mode: 'EXACT', value: 5 });
        expect(out[1]).toEqual({ field: 'metadata', path: ['active'], mode: 'EXACT', value: true });
    });

    it('emits one entry per key when several are present', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('metadata', { theme: 'dark', locale: 'es' }, out);

        expect(out).toHaveLength(2);
        expect(out).toEqual(
            expect.arrayContaining([
                { field: 'metadata', path: ['theme'], mode: 'EXACT', value: 'dark' },
                { field: 'metadata', path: ['locale'], mode: 'EXACT', value: 'es' },
            ])
        );
    });

    it('keeps a relation-prefixed field path intact', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('profile.settings', { theme: 'dark' }, out);

        expect(out[0].field).toBe('profile.settings');
        expect(out[0].path).toEqual(['theme']);
    });

    it('treats a bare scalar value as a whole-document EXACT match', () => {
        const out: JsonFilter[] = [];
        JsonFilterProcessor.process('metadata', 'raw', out);

        expect(out).toEqual([{ field: 'metadata', path: [], mode: 'EXACT', value: 'raw' }]);
    });
});
