import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import { QueryBuilder } from '../../src/core/query-builder';
import { DmmfRegistry, ModelMeta } from '../../src/core/dmmf/registry';
import CompositeWhereNormalizer from '../../src/legacy/utils/composite-where.util';
import FilterValidator from '../../src/legacy/utils/filter-validator.util';
import { BuildContext } from '../../src/types/query';

const ctx: BuildContext = {
    defaults: { limit: 10, maxLimit: 100, sort: 'id', order: 'asc' },
    searchable: [],
};

let schedule: ModelMeta;

beforeAll(() => {
    DmmfRegistry.clear();
    schedule = DmmfRegistry.model('courseSchedule');
});

describe('DmmfRegistry – composite types', () => {
    it('separates composite fields from relations', () => {
        expect(schedule.composite('program')).toEqual({
            name: 'program',
            target: 'Program',
            isList: false,
        });
        expect(schedule.relation('program')).toBeUndefined();
        expect(schedule.compositeNames()).toEqual(['program']);
    });

    it('resolves a composite type as its own metadata view', () => {
        const program = DmmfRegistry.composite('Program');
        expect(program.isComposite).toBe(true);
        expect(program.field('shortname')?.type).toBe('String');
        expect(program.composite('subjects')?.isList).toBe(true);
    });

    it('reports a missing composite type distinctly from a missing model', () => {
        expect(() => DmmfRegistry.composite('Nope')).toThrow(/Composite type 'Nope' not found/);
        expect(() => DmmfRegistry.model('Nope')).toThrow(/Model 'Nope' not found/);
    });
});

describe('QueryBuilder – composite filtering', () => {
    it('wraps a single embedded document in `is`', () => {
        const spec = QueryBuilder.build(
            { where: { program: { shortname: 'MAT' } } },
            schedule,
            ctx,
        );
        expect(spec.where).toEqual({ program: { is: { shortname: 'MAT' } } });
    });

    it('wraps an embedded list in `some`', () => {
        const spec = QueryBuilder.build(
            { where: { program: { subjects: { type: 'lab' } } } },
            schedule,
            ctx,
        );
        expect(spec.where).toEqual({
            program: { is: { subjects: { some: { type: 'lab' } } } },
        });
    });

    it('walks three composite levels deep', () => {
        const spec = QueryBuilder.build(
            { where: { program: { subjects: { activities: { codeSuffix: 'A1' } } } } },
            schedule,
            ctx,
        );
        expect(spec.where).toEqual({
            program: { is: { subjects: { some: { activities: { some: { codeSuffix: 'A1' } } } } } },
        });
    });

    it('honours explicit composite operators', () => {
        expect(
            QueryBuilder.build(
                { where: { program: { isNot: { shortname: 'MAT' } } } },
                schedule,
                ctx,
            ).where,
        ).toEqual({ program: { isNot: { shortname: 'MAT' } } });

        expect(
            QueryBuilder.build(
                { where: { program: { is: { subjects: { every: { type: 'lab' } } } } } },
                schedule,
                ctx,
            ).where,
        ).toEqual({ program: { is: { subjects: { every: { type: 'lab' } } } } });
    });

    it('coerces scalars inside embedded documents', () => {
        const spec = QueryBuilder.build(
            { where: { program: { subjects: { startDate: { gte: '2026-01-01' } } } } },
            schedule,
            ctx,
        );
        const gte = (spec.where as any).program.is.subjects.some.startDate.gte;
        expect(gte).toBeInstanceOf(Date);
    });

    it('supports operators on embedded scalars', () => {
        const spec = QueryBuilder.build(
            { where: { program: { shortname: { startsWith: 'MA' } } } },
            schedule,
            ctx,
        );
        expect(spec.where).toEqual({ program: { is: { shortname: { startsWith: 'MA' } } } });
    });

    it('rejects an unknown field inside a composite type', () => {
        expect(() =>
            QueryBuilder.build({ where: { program: { nope: 'x' } } }, schedule, ctx),
        ).toThrow(/Unknown field 'nope' on Program/);
    });

    it('rejects an invalid operator for the composite shape', () => {
        expect(() =>
            QueryBuilder.build({ where: { program: { some: { uuid: 'x' } } } }, schedule, ctx),
        ).toThrow(/Unknown field 'some' on Program/);
    });

    it('selects a whole embedded document', () => {
        const spec = QueryBuilder.build({ select: { uuid: true, program: true } }, schedule, ctx);
        expect(spec.select).toEqual({ uuid: true, program: true });
    });

    it('drops composites from include (Prisma returns them anyway)', () => {
        const spec = QueryBuilder.build({ include: { program: true } }, schedule, ctx);
        expect(spec.include).toBeUndefined();
    });

    it('applies the fields allow-list to composites', () => {
        const secure = {
            ...ctx,
            security: { fields: new Set(['uuid']), relations: '*' as const, maxDepth: 12 },
        };
        expect(() =>
            QueryBuilder.build({ where: { program: { shortname: 'MAT' } } }, schedule, secure),
        ).toThrow(/Cannot filter by field 'program'/);
    });
});

describe('CompositeWhereNormalizer – legacy engine', () => {
    it('wraps composite levels built by the legacy pipeline', () => {
        const where = { uuid: 'U1', program: { shortname: 'MAT' } };
        expect(CompositeWhereNormalizer.normalize(where, 'CourseSchedule')).toEqual({
            uuid: 'U1',
            program: { is: { shortname: 'MAT' } },
        });
    });

    it('wraps nested composite lists', () => {
        const where = { program: { subjects: { shortname: { contains: 'MA' } } } };
        expect(CompositeWhereNormalizer.normalize(where, 'CourseSchedule')).toEqual({
            program: { is: { subjects: { some: { shortname: { contains: 'MA' } } } } },
        });
    });

    it('walks AND / OR branches', () => {
        const where = { AND: [{ program: { uuid: 'P1' } }, { groupTerm: 'T1' }] };
        expect(CompositeWhereNormalizer.normalize(where, 'CourseSchedule')).toEqual({
            AND: [{ program: { is: { uuid: 'P1' } } }, { groupTerm: 'T1' }],
        });
    });

    it('leaves an already-wrapped filter alone', () => {
        const where = { program: { is: { uuid: 'P1' } } };
        expect(CompositeWhereNormalizer.normalize(where, 'CourseSchedule')).toEqual(where);
    });

    it('leaves real relations untouched', () => {
        const where = { campus: { uuid: 'A' } };
        expect(CompositeWhereNormalizer.normalize(where, 'UserEnrolment')).toEqual(where);
    });
});

describe('FilterValidator – composite targets', () => {
    it('resolves a composite type instead of reporting a missing model', () => {
        const model = mockModel('CourseSchedule');
        const info = FilterValidator.getRelationModelInfo('program', model);
        expect(info.isComposite).toBe(true);
        expect(info.model.name).toBe('Program');
    });

    it('still resolves real relations as models', () => {
        const info = FilterValidator.getRelationModelInfo('campus', mockModel('UserEnrolment'));
        expect(info.isComposite).toBe(false);
        expect(info.model.name).toBe('Campus');
    });
});

function mockModel(name: string): any {
    const { Prisma } = jest.requireMock('@prisma/client');
    return Prisma.dmmf.datamodel.models.find((m: any) => m.name === name);
}
