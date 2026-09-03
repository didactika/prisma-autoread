import type { AutoReadOptions, ResolvedOptions, ResolvedRoute } from './options';
import type { HttpRequestContext } from './http';

/** One generated Nest controller and the URL prefix mounted on it. */
export interface NestAutoReadRegistration extends AutoReadOptions {
    /** Controller prefix, e.g. `users` or `api/users`. */
    path: string;
}

/** Structural controller type kept independent from Nest's public types. */
export type NestControllerClass = new (...args: any[]) => object;

/** Structural DynamicModule result returned by `AutoReadModule.register`. */
export interface NestDynamicModule {
    module: NestControllerClass;
    controllers: NestControllerClass[];
}

/** Minimal native request surface shared by Nest's Express and Fastify adapters. */
export interface NestRequestLike {
    method: string;
    url?: string;
    originalUrl?: string;
    protocol?: string;
    hostname?: string;
    headers?: Record<string, string | string[] | undefined>;
    body?: unknown;
    raw?: NestRequestLike;
    get?(name: string): string | undefined;
}

/** Minimal passthrough response surface shared by Nest's HTTP adapters. */
export interface NestResponseLike {
    type?(contentType: string): unknown;
    header?(name: string, value: string): unknown;
    setHeader?(name: string, value: string): unknown;
}

/** Internal result of translating a native Nest request into the neutral HTTP contract. */
export interface NestMappedRequest {
    context: HttpRequestContext;
    response: NestResponseLike;
}

/** Constructor input used by the Nest request mapper. */
export interface NestRequestMapOptions {
    request: NestRequestLike;
    response: NestResponseLike;
    endpoint: ResolvedOptions;
    route: ResolvedRoute;
}

/** The subset of optional `@nestjs/swagger` decorators used by the integration. */
export interface NestSwaggerDecorators {
    ApiBody(options: Record<string, unknown>): MethodDecorator;
    ApiOkResponse(options: Record<string, unknown>): MethodDecorator;
    ApiOperation(options: Record<string, unknown>): MethodDecorator;
    ApiProduces(...mimeTypes: string[]): MethodDecorator;
    ApiQuery(options: Record<string, unknown>): MethodDecorator;
    ApiTags(...tags: string[]): ClassDecorator;
}
