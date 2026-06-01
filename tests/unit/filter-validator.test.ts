import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import FilterValidator from '../../src/middlewares/utils/filter-validator.util';

describe('FilterValidator', () => {
    describe('getModelInfo', () => {
        it('returns model info for a known model (lowercase input)', async () => {
            const info = await FilterValidator.getModelInfo('user');
            expect(info.name).toBe('User');
            expect(info.fields).toBeDefined();
        });

        it('returns model info for Campus (exact casing)', async () => {
            const info = await FilterValidator.getModelInfo('Campus');
            expect(info.name).toBe('Campus');
        });

        it('throws BadRequest for an unknown model', async () => {
            await expect(FilterValidator.getModelInfo('unknownModel')).rejects.toThrow(/not found in Prisma schema/);
        });
    });

    describe('validateAndMapField – scalar fields', () => {
        let userModel: any;

        beforeAll(async () => {
            userModel = await FilterValidator.getModelInfo('user');
        });

        it('returns correct casing for "firstname" → "firstName"', () => {
            expect(FilterValidator.validateAndMapField('firstname', userModel, 'field')).toBe('firstName');
        });

        it('returns correct casing for exact match "firstName"', () => {
            expect(FilterValidator.validateAndMapField('firstName', userModel, 'field')).toBe('firstName');
        });

        it('returns null for a relation name when type=field', () => {
            expect(FilterValidator.validateAndMapField('enrolments', userModel, 'field')).toBeNull();
        });

        it('returns null for an unknown field', () => {
            expect(FilterValidator.validateAndMapField('nonexistent', userModel, 'field')).toBeNull();
        });
    });

    describe('validateAndMapField – relation fields', () => {
        let enrolmentModel: any;

        beforeAll(async () => {
            enrolmentModel = await FilterValidator.getModelInfo('userEnrolment');
        });

        it('returns relation name "user"', () => {
            expect(FilterValidator.validateAndMapField('user', enrolmentModel, 'relation')).toBe('user');
        });

        it('returns relation name "campus"', () => {
            expect(FilterValidator.validateAndMapField('CAMPUS', enrolmentModel, 'relation')).toBe('campus');
        });

        it('returns null for a scalar field when type=relation', () => {
            expect(FilterValidator.validateAndMapField('userId', enrolmentModel, 'relation')).toBeNull();
        });
    });

    describe('getRelationModelInfo', () => {
        let enrolmentModel: any;

        beforeAll(async () => {
            enrolmentModel = await FilterValidator.getModelInfo('userEnrolment');
        });

        it('returns related model for "user" relation', () => {
            const info = FilterValidator.getRelationModelInfo('user', enrolmentModel);
            expect(info).not.toBeNull();
            expect(info.model.name).toBe('User');
            expect(info.isList).toBe(false);
        });

        it('returns isList=true for a list relation', async () => {
            const userModel = await FilterValidator.getModelInfo('user');
            const info = FilterValidator.getRelationModelInfo('enrolments', userModel);
            expect(info.isList).toBe(true);
        });

        it('returns null for a scalar field', () => {
            expect(FilterValidator.getRelationModelInfo('userId', enrolmentModel)).toBeNull();
        });
    });

    describe('getAvailableFields / getAvailableRelations', () => {
        let userModel: any;

        beforeAll(async () => {
            userModel = await FilterValidator.getModelInfo('user');
        });

        it('lists scalar fields and excludes relations', () => {
            const fields = FilterValidator.getAvailableFields(userModel);
            expect(fields).toContain('firstName');
            expect(fields).toContain('age');
            expect(fields).not.toContain('enrolments');
        });

        it('lists only relation fields', () => {
            const relations = FilterValidator.getAvailableRelations(userModel);
            expect(relations).toContain('enrolments');
            expect(relations).not.toContain('firstName');
        });

        it('returns "none" for null/undefined modelInfo', () => {
            expect(FilterValidator.getAvailableFields(null)).toBe('none');
            expect(FilterValidator.getAvailableRelations(undefined)).toBe('none');
        });
    });
});
