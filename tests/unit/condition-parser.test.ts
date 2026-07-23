import { setupPrismaMock } from '../helpers/mock-dmmf';

jest.mock('@prisma/client', () => setupPrismaMock());

import ConditionParser, { ParsedConditions } from '../../src/legacy/utils/condition-parser.util';
import FilterValidator from '../../src/legacy/utils/filter-validator.util';

let userModel: any;
let enrolmentModel: any;

const empty = (): ParsedConditions => ({ filters: {}, likeFilters: [], jsonFilters: [] });

beforeAll(async () => {
    userModel = await FilterValidator.getModelInfo('user');
    enrolmentModel = await FilterValidator.getModelInfo('userEnrolment');
});

describe('ConditionParser.parse', () => {
    it('parses a scalar equality (String preserved)', () => {
        const out = empty();
        ConditionParser.parse({ firstName: 'Alice' }, userModel, out);
        expect(out.filters).toEqual({ firstName: 'Alice' });
    });

    it('coerces an Int field', () => {
        const out = empty();
        ConditionParser.parse({ age: '30' }, userModel, out);
        expect(out.filters).toEqual({ age: 30 });
    });

    it('normalises field casing', () => {
        const out = empty();
        ConditionParser.parse({ firstname: 'Bob' }, userModel, out);
        expect(out.filters).toEqual({ firstName: 'Bob' });
    });

    it('parses a per-field string operator into likeFilters', () => {
        const out = empty();
        ConditionParser.parse({ firstName: { STARTS_WITH: 'Al' } }, userModel, out);
        expect(out.likeFilters).toEqual([
            { key: 'firstName', value: 'Al', mode: 'STARTS_WITH' },
        ]);
    });

    it('routes EXACT operator to filters, not likeFilters', () => {
        const out = empty();
        ConditionParser.parse({ firstName: { EXACT: 'Alice' } }, userModel, out);
        expect(out.filters).toEqual({ firstName: 'Alice' });
        expect(out.likeFilters).toHaveLength(0);
    });

    it('parses a nested relation into a dot-notation key', () => {
        const out = empty();
        ConditionParser.parse({ campus: { uuid: 'ABC' } }, enrolmentModel, out);
        expect(out.filters).toEqual({ 'campus.uuid': 'ABC' });
    });

    it('parses a Json column into jsonFilters', () => {
        const out = empty();
        ConditionParser.parse({ metadata: { theme: 'dark' } }, userModel, out);
        expect(out.jsonFilters).toEqual([
            { field: 'metadata', path: ['theme'], mode: 'EXACT', value: 'dark' },
        ]);
    });

    it('parses a Json column on a related model', () => {
        const out = empty();
        ConditionParser.parse({ campus: { settings: { active: 'true' } } }, enrolmentModel, out);
        expect(out.jsonFilters).toEqual([
            { field: 'campus.settings', path: ['active'], mode: 'EXACT', value: true },
        ]);
    });

    it('throws BadRequest for an unknown field', () => {
        expect(() => ConditionParser.parse({ nope: 'x' }, userModel, empty())).toThrow();
    });

    it('works in schema-less mode (no modelInfo)', () => {
        const out = empty();
        ConditionParser.parse({ anything: '42' }, null, out);
        expect(out.filters).toEqual({ anything: 42 });
    });
});
