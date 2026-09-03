import type { NestSwaggerDecorators } from '../types/nest';

const METADATA = Object.freeze({
    operation: 'swagger/apiOperation',
    parameters: 'swagger/apiParameters',
    produces: 'swagger/apiProduces',
    response: 'swagger/apiResponse',
    tags: 'swagger/apiUseTags',
});

/**
 * Swagger 12 is ESM-only, so CommonJS `require()` cannot load its decorator functions.
 * This adapter writes the same stable metadata contract after package detection.
 */
export class NestSwaggerMetadataAdapter {
    static decorators(): NestSwaggerDecorators {
        return {
            ApiBody: options => NestSwaggerMetadataAdapter.parameter({
                required: true,
                ...options,
                in: 'body',
            }),
            ApiOkResponse: options => (target, propertyKey, descriptor) => {
                if (!descriptor) return;
                const handler = descriptor.value as object;
                const current = Reflect.getMetadata(METADATA.response, handler) ?? {};
                Reflect.defineMetadata(
                    METADATA.response,
                    { ...current, 200: options },
                    handler,
                );
            },
            ApiOperation: options => NestSwaggerMetadataAdapter.method(METADATA.operation, options),
            ApiProduces: (...mimeTypes) => NestSwaggerMetadataAdapter.method(METADATA.produces, mimeTypes),
            ApiQuery: options => NestSwaggerMetadataAdapter.parameter({
                required: true,
                ...options,
                in: 'query',
            }),
            ApiTags: (...tags) => target => {
                const current = Reflect.getMetadata(METADATA.tags, target) ?? [];
                Reflect.defineMetadata(METADATA.tags, [...current, ...tags], target);
            },
        };
    }

    private static method(key: string, value: unknown): MethodDecorator {
        return (_target, _propertyKey, descriptor) => {
            if (!descriptor) return;
            const handler = descriptor.value as object;
            const current = Reflect.getMetadata(key, handler);
            const merged = Array.isArray(value)
                ? [...(Array.isArray(current) ? current : []), ...value]
                : { ...(current ?? {}), ...(value as object) };
            Reflect.defineMetadata(key, merged, handler);
        };
    }

    private static parameter(options: Record<string, unknown>): MethodDecorator {
        return (_target, _propertyKey, descriptor) => {
            if (!descriptor) return;
            const handler = descriptor.value as object;
            const current = Reflect.getMetadata(METADATA.parameters, handler) ?? [];
            Reflect.defineMetadata(METADATA.parameters, [...current, options], handler);
        };
    }
}
