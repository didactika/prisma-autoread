/**
 * Mock Prisma DMMF for unit and integration tests.
 *
 * Models:
 *   User          – id(Int), firstName(String), lastName(String), email(String), age(Int), active(Boolean)
 *   Campus        – id(Int), name(String), uuid(String)
 *   UserEnrolment – id(Int), userId(Int), campusId(Int), user→User, campus→Campus
 */

const makeScalar = (name: string, type: string) => ({
    name,
    kind: 'scalar',
    type,
    isList: false,
    isRequired: true,
    isUnique: false,
    isId: name === 'id',
    isReadOnly: false,
    hasDefaultValue: name === 'id',
});

const makeRelation = (name: string, type: string, isList = false) => ({
    name,
    kind: 'object',
    type,
    isList,
    isRequired: !isList,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: false,
    relationName: `${type}Relation`,
});

export const mockDmmf = {
    datamodel: {
        models: [
            {
                name: 'User',
                fields: [
                    makeScalar('id', 'Int'),
                    makeScalar('firstName', 'String'),
                    makeScalar('lastName', 'String'),
                    makeScalar('email', 'String'),
                    makeScalar('age', 'Int'),
                    makeScalar('active', 'Boolean'),
                    makeRelation('enrolments', 'UserEnrolment', true),
                ],
            },
            {
                name: 'Campus',
                fields: [
                    makeScalar('id', 'Int'),
                    makeScalar('name', 'String'),
                    makeScalar('uuid', 'String'),
                    makeRelation('enrolments', 'UserEnrolment', true),
                ],
            },
            {
                name: 'UserEnrolment',
                fields: [
                    makeScalar('id', 'Int'),
                    makeScalar('userId', 'Int'),
                    makeScalar('campusId', 'Int'),
                    makeRelation('user', 'User', false),
                    makeRelation('campus', 'Campus', false),
                ],
            },
        ],
    },
};

/**
 * Call this at the top of test files that need the mock DMMF.
 *
 * @example
 * import { setupPrismaMock } from '../helpers/mock-dmmf';
 * jest.mock('@prisma/client', () => setupPrismaMock());
 */
export function setupPrismaMock() {
    return {
        Prisma: {
            dmmf: mockDmmf,
        },
    };
}
