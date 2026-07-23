import { EndpointController } from './endpoint-controller';
import { QueryStringParser } from './query-string-parser';
import type { FastifyLike } from '../types/http';
import type { ResolvedOptions } from '../types/options';

/**
 * Fastify binding. Fastify is **not** a dependency — the instance is typed
 * structurally, so nothing is imported at runtime.
 *
 * > To expose the `QUERY` method on Fastify v5, register it once first:
 * > `fastify.addHttpMethod('QUERY', { hasBody: true })`.
 */
export class FastifyBinding {
    constructor(private readonly options: ResolvedOptions) {}

    apply(fastify: FastifyLike): FastifyLike {
        const controller = new EndpointController(this.options);

        for (const route of this.options.routes) {
            fastify.route({
                method: this.options.methods,
                url: route.path,
                handler: async (request: any, reply: any) => {
                    const payload = await controller.handle(route, {
                        method: request.method,
                        // Fastify's default query parser is flat; expand it ourselves.
                        query: QueryStringParser.fromUrl(request.url),
                        body: request.body,
                        path: route.path,
                        baseUrl: FastifyBinding.baseUrl(request, this.options.basePathPrefix),
                        headers: request.headers ?? {},
                    });

                    if (payload.contentType) reply.type(payload.contentType);
                    return reply.code(payload.status).send(payload.body);
                },
            });
        }

        return fastify;
    }

    private static baseUrl(request: any, prefix?: string): string {
        const protocol = request.protocol ?? 'http';
        const host = request.headers?.host ?? 'localhost';
        return `${protocol}://${host}${prefix ?? ''}`;
    }
}
