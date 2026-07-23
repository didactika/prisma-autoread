import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { DmmfRegistry } from '../../src/core/dmmf/registry';
import { ValueCoercer } from '../../src/core/dmmf/coercer';
import { OperatorRegistry } from '../../src/core/operators';

describe('ValueCoercer.scalar', () => {
    it('coerces by Prisma type', () => {
        expect(ValueCoercer.scalar('30', 'Int')).toBe(30);
        expect(ValueCoercer.scalar('30', 'String')).toBe('30');
        expect(ValueCoercer.scalar('true', 'Boolean')).toBe(true);
        expect(ValueCoercer.scalar('12.5', 'Float')).toBe(12.5);
        expect(ValueCoercer.scalar('10', 'BigInt')).toBe(10n);
        expect(ValueCoercer.scalar('null', 'Int')).toBeNull();
    });

    it('coerces DateTime to a Date', () => {
        expect(ValueCoercer.scalar('2020-01-01T00:00:00.000Z', 'DateTime')).toBeInstanceOf(Date);
    });

    it('is idempotent for already-typed values', () => {
        expect(ValueCoercer.scalar(30, 'Int')).toBe(30);
        expect(ValueCoercer.scalar(true, 'Boolean')).toBe(true);
    });

    it('keeps unsafe integers as strings', () => {
        const big = '99999999999999999999';
        expect(ValueCoercer.scalar(big, 'Int')).toBe(big);
    });
});

describe('ValueCoercer.list / jsonLeaf', () => {
    it('parses comma strings and arrays', () => {
        expect(ValueCoercer.list('1,2', 'Int')).toEqual([1, 2]);
        expect(ValueCoercer.list(['1', '2'], 'Int')).toEqual([1, 2]);
    });

    it('recognises numbers and booleans in JSON leaves', () => {
        expect(ValueCoercer.jsonLeaf('5')).toBe(5);
        expect(ValueCoercer.jsonLeaf('true')).toBe(true);
        expect(ValueCoercer.jsonLeaf('x')).toBe('x');
    });
});

describe('DmmfRegistry', () => {
    beforeEach(() => DmmfRegistry.clear());

    it('exposes fields and relations case-insensitively', () => {
        const user = DmmfRegistry.model('user');
        expect(user.field('firstname')?.name).toBe('firstName');
        expect(user.relation('enrolments')?.isList).toBe(true);
        expect(user.isJson('metadata')).toBe(true);
    });

    it('caches by normalised name', () => {
        expect(DmmfRegistry.model('user')).toBe(DmmfRegistry.model('User'));
    });

    it('throws for an unknown model', () => {
        expect(() => DmmfRegistry.model('Ghost')).toThrow();
    });
});

describe('OperatorRegistry', () => {
    it('resolves field operator aliases', () => {
        expect(OperatorRegistry.field('gte')).toBe('gte');
        expect(OperatorRegistry.field('eq')).toBe('equals');
        expect(OperatorRegistry.field('nin')).toBe('notIn');
        expect(OperatorRegistry.field('isNull')).toBe('isNull');
        expect(OperatorRegistry.field('bogus')).toBeUndefined();
    });

    it('resolves logical operators', () => {
        expect(OperatorRegistry.logical('or')).toBe('OR');
        expect(OperatorRegistry.logical('AND')).toBe('AND');
        expect(OperatorRegistry.logical('not')).toBe('NOT');
        expect(OperatorRegistry.logical('nope')).toBeUndefined();
    });

    it('recognises relation operators', () => {
        expect(OperatorRegistry.isRelation('some')).toBe(true);
        expect(OperatorRegistry.isRelation('nope')).toBe(false);
    });
});
