import { BadRequest } from 'http-response-client/lib/errors/client';
import { Prisma } from '@prisma/client';

/**
 * Utility class for validating and mapping filter fields against the Prisma DMMF.
 */
export default class FilterValidator {
    /**
     * Get model information from the generated Prisma DMMF.
     * @param entityName - Entity name (case-insensitive first letter, e.g. `'user'` or `'User'`)
     * @throws BadRequest if the model is not found in the schema
     */
    static async getModelInfo(entityName: string): Promise<any> {
        const modelName = entityName.charAt(0).toUpperCase() + entityName.slice(1);
        const modelInfo = Prisma.dmmf.datamodel.models.find(m => m.name === modelName);

        if (!modelInfo) {
            throw new BadRequest({
                msg: `Model '${modelName}' not found in Prisma schema`
            });
        }

        return modelInfo;
    }

    /**
     * Validate and map a field name using case-insensitive matching.
     * @param fieldName - Incoming field name (may differ in casing)
     * @param modelInfo - DMMF model object
     * @param type - `'field'` matches scalar/enum fields; `'relation'` matches object fields
     * @returns The correctly-cased field name, or `null` if not found
     */
    static validateAndMapField(fieldName: string, modelInfo: any, type: 'field' | 'relation' = 'field'): string | null {
        if (!modelInfo?.fields) return null;

        const lowerFieldName = fieldName.toLowerCase();
        const field = modelInfo.fields.find((f: any) => {
            const matches = f.name.toLowerCase() === lowerFieldName;
            if (type === 'field') {
                return matches && f.kind !== 'object';
            } else {
                return matches && f.kind === 'object';
            }
        });

        return field?.name || null;
    }

    /**
     * Get the DMMF model and relation metadata for a given relation field.
     * @param relationName - Exact (correctly-cased) relation field name
     * @param modelInfo - DMMF model object containing the relation
     * @returns `{ model, isList }` or `null` if the relation is not found
     */
    static getRelationModelInfo(relationName: string, modelInfo?: any): any {
        if (!modelInfo?.fields) return null;

        const relationField = modelInfo.fields.find(
            (field: any) => field.name === relationName && field.kind === 'object'
        );

        if (!relationField) return null;

        const relatedModel =
            Prisma.dmmf.datamodel.models.find(m => m.name === relationField.type) ?? null;

        return {
            model: relatedModel,
            isList: relationField.isList || false
        };
    }

    /**
     * Returns a comma-separated list of scalar/enum field names for error messages.
     */
    static getAvailableFields(modelInfo?: any): string {
        if (!modelInfo?.fields) return 'none';

        const fields = modelInfo.fields
            .filter((field: any) => field.kind !== 'object')
            .map((field: any) => field.name);

        return fields.length > 0 ? fields.join(', ') : 'none';
    }

    /**
     * Returns a comma-separated list of relation field names for error messages.
     */
    static getAvailableRelations(modelInfo?: any): string {
        if (!modelInfo?.fields) return 'none';

        const relations = modelInfo.fields
            .filter((field: any) => field.kind === 'object')
            .map((field: any) => field.name);

        return relations.length > 0 ? relations.join(', ') : 'none';
    }
}
