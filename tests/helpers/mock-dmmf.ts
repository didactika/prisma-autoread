/**
 * Mock Prisma DMMF for unit and integration tests.
 *
 * Models:
 *   User           – id(Int), firstName(String), lastName(String), email(String), age(Int), active(Boolean), metadata(Json)
 *   Campus         – id(Int), name(String), uuid(String), settings(Json)
 *   UserEnrolment  – id(Int), userId(Int), campusId(Int), user→User, campus→Campus
 *   CourseSchedule – id(String), uuid(String), groupTerm(String), program→Program (composite)
 *
 * Composite types (MongoDB `type` blocks, which live under `datamodel.types`):
 *   Program – shortname, name, uuid, subjects→Subject[]
 *   Subject – shortname, type, uuid, activities→Activity[]
 *   Activity – codeSuffix, extraRanges(Json)
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

/** Embedded composite-type field: like a relation, but with no `relationName`. */
const makeComposite = (name: string, type: string, isList = false) => ({
    name,
    kind: 'object',
    type,
    isList,
    isRequired: !isList,
    isUnique: false,
    isId: false,
    isReadOnly: false,
    hasDefaultValue: false,
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
                    makeScalar('metadata', 'Json'),
                    makeRelation('enrolments', 'UserEnrolment', true),
                ],
            },
            {
                name: 'Campus',
                fields: [
                    makeScalar('id', 'Int'),
                    makeScalar('name', 'String'),
                    makeScalar('uuid', 'String'),
                    makeScalar('settings', 'Json'),
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
            {
                name: 'CourseSchedule',
                fields: [
                    makeScalar('id', 'String'),
                    makeScalar('uuid', 'String'),
                    makeScalar('groupTerm', 'String'),
                    makeScalar('startDate', 'DateTime'),
                    makeComposite('program', 'Program', false),
                ],
            },
        ],
        types: [
            {
                name: 'Program',
                fields: [
                    makeScalar('shortname', 'String'),
                    makeScalar('name', 'String'),
                    makeScalar('uuid', 'String'),
                    makeComposite('subjects', 'Subject', true),
                ],
            },
            {
                name: 'Subject',
                fields: [
                    makeScalar('shortname', 'String'),
                    makeScalar('type', 'String'),
                    makeScalar('uuid', 'String'),
                    makeScalar('startDate', 'DateTime'),
                    makeComposite('activities', 'Activity', true),
                ],
            },
            {
                name: 'Activity',
                fields: [
                    makeScalar('codeSuffix', 'String'),
                    makeScalar('extraRanges', 'Json'),
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
