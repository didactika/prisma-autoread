import { OptionsResolver } from './config/options-resolver';
import { EndpointController } from './http/endpoint-controller';
import { ExpressBinding } from './http/express.binding';
import { FastifyBinding } from './http/fastify.binding';
import { HonoBinding } from './http/hono.binding';
import type { AutoReadOptions, ResolvedOptions } from './types/options';
import type { ExpressRouterLike, FastifyLike, HonoLike } from './types/http';

/**
 * A declared read/search endpoint over a Prisma model.
 *
 * The endpoint owns its resolved configuration and can be bound to any supported
 * framework; the request pipeline itself is framework-agnostic.
 */
export class AutoReadEndpoint {
    private readonly options: ResolvedOptions;

    constructor(options: AutoReadOptions) {
        this.options = OptionsResolver.resolve(options);
    }

    /** The normalised configuration (useful for introspection and testing). */
    get config(): ResolvedOptions {
        return this.options;
    }

    /** Framework-agnostic controller, for custom bindings. */
    createController(): EndpointController {
        return new EndpointController(this.options);
    }

    /** Attach the generated routes to an Express router (returns the same router). */
    applyTo<T extends ExpressRouterLike>(router: T): T {
        new ExpressBinding(this.options).apply(router);
        return router;
    }

    /** Attach the generated routes to a Fastify instance. */
    applyToFastify<T extends FastifyLike>(fastify: T): T {
        new FastifyBinding(this.options).apply(fastify);
        return fastify;
    }

    /** Attach the generated routes to a Hono app. */
    applyToHono<T extends HonoLike>(app: T): T {
        new HonoBinding(this.options).apply(app);
        return app;
    }
}

/**
 * Declare a read/search endpoint over a Prisma model.
 *
 * @example
 * const router = Router();
 * createAutoRead({
 *   model: 'User',
 *   delegate: prisma.user,
 *   methods: ['GET', 'QUERY'],
 *   routes: ['list', 'count'],            // or { count: { path: '/total' } }
 *   searchable: ['firstName', 'email'],
 * }).applyTo(router);
 * app.use('/users', router);
 */
export function createAutoRead(options: AutoReadOptions): AutoReadEndpoint {
    return new AutoReadEndpoint(options);
}
