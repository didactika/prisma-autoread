import express from 'express';
import { EndpointController } from './endpoint-controller';
import { QueryStringParser } from './query-string-parser';
import { obtainUrl } from '../utils/url.utils';
import type { ExpressRouterLike } from '../types/http';
import type { ResolvedOptions } from '../types/options';

const BODY_METHODS = new Set(['QUERY', 'POST']);

/**
 * Express binding. Registers every configured route with `router.all` and
 * dispatches on `req.method`, so non-standard methods such as `QUERY` are routed
 * exactly like `GET`.
 */
export class ExpressBinding {
    constructor(private readonly options: ResolvedOptions) {}

    apply(router: ExpressRouterLike): ExpressRouterLike {
        const controller = new EndpointController(this.options);

        if (this.options.methods.some(method => BODY_METHODS.has(method))) {
            router.use(express.json());
        }

        for (const route of this.options.routes) {
            router.all(route.path, async (req: any, res: any, next: any) => {
                try {
                    if (!controller.handles(req.method)) return next();

                    const payload = await controller.handle(route, {
                        method: req.method,
                        // Parsed here rather than read from `req.query`: Express 4 and 5
                        // disagree on bracket expansion, this does not.
                        query: QueryStringParser.fromUrl(req.originalUrl ?? req.url),
                        body: req.body,
                        path: req.path,
                        baseUrl: obtainUrl(req, this.options.basePathPrefix),
                        headers: req.headers ?? {},
                    });

                    if (payload.contentType) {
                        res.status(payload.status).type(payload.contentType).send(payload.body as string);
                    } else {
                        res.status(payload.status).json(payload.body);
                    }
                } catch (err) {
                    next(err);
                }
            });
        }

        return router;
    }
}
