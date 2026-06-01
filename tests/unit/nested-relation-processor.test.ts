import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import NestedRelationProcessor from '../../src/middlewares/utils/nested-relation-processor.util';
import FilterValidator from '../../src/middlewares/utils/filter-validator.util';
import { LikeFilter } from '../../src/types';

let userModel: any;
let enrolmentModel: any;

beforeAll(async () => {
    userModel = await FilterValidator.getModelInfo('user');
    enrolmentModel = await FilterValidator.getModelInfo('userEnrolment');
});

describe('NestedRelationProcessor.processString', () => {
    it('adds a simple relation.field key to filter (no mode)', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'user[firstName]', 'Alice', enrolmentModel, filter, likeFilters
        );

        expect(filter['user.firstName']).toBe('Alice');
        expect(likeFilters).toHaveLength(0);
    });

    it('uses EXACT mode → adds to filter, not likeFilters', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'user[firstName][EXACT]', 'Alice', enrolmentModel, filter, likeFilters
        );

        expect(filter['user.firstName']).toBe('Alice');
        expect(likeFilters).toHaveLength(0);
    });

    it('uses STARTS_WITH mode → adds to likeFilters', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'user[firstName][STARTS_WITH]', 'Al', enrolmentModel, filter, likeFilters
        );

        expect(filter).not.toHaveProperty('user.firstName');
        expect(likeFilters[0]).toMatchObject({
            key: 'user.firstName',
            value: 'Al',
            mode: 'STARTS_WITH',
        });
    });

    it('uses ENDS_WITH mode → adds to likeFilters', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'user[firstName][ENDS_WITH]', 'ce', enrolmentModel, filter, likeFilters
        );

        expect(likeFilters[0].mode).toBe('ENDS_WITH');
    });

    it('uses LIKE mode → adds to likeFilters', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'user[firstName][LIKE]', 'lic', enrolmentModel, filter, likeFilters
        );

        expect(likeFilters[0].mode).toBe('LIKE');
    });

    it('preserves String field type – does not coerce "123" to number', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'campus[uuid]', '123', enrolmentModel, filter, likeFilters
        );

        expect(filter['campus.uuid']).toBe('123');
        expect(typeof filter['campus.uuid']).toBe('string');
    });

    it('coerces Int field value "25" to number 25', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processString(
            'user[age]', '25', enrolmentModel, filter, likeFilters
        );

        expect(filter['user.age']).toBe(25);
    });

    it('throws BadRequest for an unknown field', () => {
        expect(() => {
            NestedRelationProcessor.processString(
                'user[nonexistent]', 'val', enrolmentModel, {}, []
            );
        }).toThrow();
    });

    it('throws BadRequest for an unknown relation', () => {
        expect(() => {
            NestedRelationProcessor.processString(
                'unknownRelation[id]', '1', enrolmentModel, {}, []
            );
        }).toThrow();
    });
});

describe('NestedRelationProcessor.processObject', () => {
    it('converts object notation to dot notation', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processObject(
            'user',
            { firstName: 'Alice', age: '30' },
            enrolmentModel,
            filter,
            likeFilters
        );

        expect(filter['user.firstName']).toBe('Alice');
        expect(filter['user.age']).toBe(30);
    });

    it('throws for an unknown relation', () => {
        expect(() => {
            NestedRelationProcessor.processObject(
                'unknownRelation', { id: '1' }, enrolmentModel, {}, []
            );
        }).toThrow();
    });
});

describe('NestedRelationProcessor.processRecursive', () => {
    it('processes deeply nested objects with explicit mode keys', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processRecursive(
            { firstName: { STARTS_WITH: 'Al' } },
            userModel,
            filter,
            likeFilters,
            'user'
        );

        expect(likeFilters[0]).toMatchObject({
            key: 'user.firstName',
            value: 'Al',
            mode: 'STARTS_WITH',
        });
    });

    it('skips "include" and "search" keys', () => {
        const filter: Record<string, any> = {};
        const likeFilters: LikeFilter[] = [];

        NestedRelationProcessor.processRecursive(
            { include: 'campus', search: 'foo', firstName: 'Bob' },
            userModel,
            filter,
            likeFilters,
            ''
        );

        expect(filter).toEqual({ firstName: 'Bob' });
    });
});
