import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { Keywords } from '../../src/config/keywords';
import { ProviderDetector } from '../../src/config/provider';
import { OptionsResolver } from '../../src/config/options-resolver';

const delegate = { findMany: async () => [], count: async () => 0 };

afterEach(() => Keywords.reset());

describe('Keywords', () => {
    it('exposes the defaults', () => {
        expect(Keywords.current().fields).toBe('fields');
        expect(Keywords.current().filter).toBe('filter');
    });

    it('applies global overrides once and keeps them', () => {
        Keywords.configure({ fields: 'select', filter: 'q' });
        expect(Keywords.current().fields).toBe('select');
        expect(Keywords.current().filter).toBe('q');
        expect(Keywords.current().sort).toBe('sort');
    });

    it('layers per-endpoint overrides on top of the global map', () => {
        Keywords.configure({ fields: 'select' });
        const resolved = Keywords.resolve({ limit: 'size' });
        expect(resolved.fields).toBe('select');
        expect(resolved.limit).toBe('size');
    });

    it('ignores empty overrides and resets', () => {
        Keywords.configure({ fields: '   ' });
        expect(Keywords.current().fields).toBe('fields');
        Keywords.configure({ fields: 'select' });
        Keywords.reset();
        expect(Keywords.current().fields).toBe('fields');
    });
});

describe('ProviderDetector', () => {
    it('maps providers to their JSON path syntax', () => {
        expect(ProviderDetector.syntaxFor('mysql')).toBe('string');
        expect(ProviderDetector.syntaxFor('mariadb')).toBe('string');
        expect(ProviderDetector.syntaxFor('postgresql')).toBe('array');
        expect(ProviderDetector.syntaxFor('sqlite')).toBe('array');
        expect(ProviderDetector.syntaxFor(undefined)).toBe('array');
    });

    it('detects the active provider from a Prisma delegate', () => {
        expect(ProviderDetector.detect({ ...delegate, _activeProvider: 'mysql' } as any)).toBe('mysql');
        expect(ProviderDetector.detect({ ...delegate, _client: { _activeProvider: 'postgresql' } } as any))
            .toBe('postgresql');
        expect(ProviderDetector.detect(delegate as any)).toBeUndefined();
    });

    it('honours precedence: explicit syntax > provider > detection', () => {
        expect(ProviderDetector.resolve({ jsonPathSyntax: 'string', provider: 'postgresql' })).toBe('string');
        expect(ProviderDetector.resolve({ provider: 'mysql' })).toBe('string');
        expect(ProviderDetector.resolve({ delegate: { ...delegate, _activeProvider: 'mysql' } as any }))
            .toBe('string');
        expect(ProviderDetector.resolve({})).toBe('array');
    });
});

describe('OptionsResolver', () => {
    it('requires a model and a data source', () => {
        expect(() => OptionsResolver.resolve({ model: '', delegate } as any)).toThrow(/model/);
        expect(() => OptionsResolver.resolve({ model: 'User' } as any)).toThrow(/delegate/);
    });

    it('normalises routes (short form and per-route path)', () => {
        expect(OptionsResolver.resolve({ model: 'User', delegate, routes: ['list', 'count'] }).routes)
            .toEqual([{ name: 'list', path: '/' }, { name: 'count', path: '/count' }]);

        expect(OptionsResolver.resolve({
            model: 'User', delegate, routes: { list: true, count: { path: '/total' } },
        }).routes).toEqual([{ name: 'list', path: '/' }, { name: 'count', path: '/total' }]);
    });

    it('auto-detects the JSON path syntax from the delegate', () => {
        const resolved = OptionsResolver.resolve({
            model: 'User',
            delegate: { ...delegate, _activeProvider: 'mysql' } as any,
        });
        expect(resolved.jsonPathSyntax).toBe('string');
    });

    describe('strict security', () => {
        it('rejects strict mode without an explicit field allow-list', () => {
            expect(() => OptionsResolver.resolve({
                model: 'User', delegate, security: { strict: true },
            })).toThrow(/allow-list/);

            expect(() => OptionsResolver.resolve({
                model: 'User', delegate, security: { strict: true, fields: '*' },
            })).toThrow(/allow-list/);
        });

        it('rejects a relations wildcard in strict mode', () => {
            expect(() => OptionsResolver.resolve({
                model: 'User', delegate, security: { strict: true, fields: ['id'], relations: '*' },
            })).toThrow(/relations/);
        });

        it('denies by default: relations are empty unless listed', () => {
            const resolved = OptionsResolver.resolve({
                model: 'User', delegate, security: { strict: true, fields: ['id', 'firstName'] },
            });
            expect(resolved.security.fields).toEqual(new Set(['id', 'firstname']));
            expect(resolved.security.relations).toEqual(new Set());
        });
    });
});
