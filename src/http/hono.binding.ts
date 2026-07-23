import { EndpointController } from './endpoint-controller';
import { QueryStringParser } from './query-string-parser';
import type { HonoLike } from '../types/http';
import type { ResolvedOptions } from '../types/options';

/**
 * Hono binding. Hono is **not** a dependency — the instance is typed structurally,
 * so nothing is imported at runtime. `app.on(method, path, handler)` routes any
 * method, including `QUERY`.
 */
export class HonoBinding {
    constructor(private readonly options: ResolvedOptions) {}

    apply(app: HonoLike): HonoLike {
        const controller = new EndpointController(this.options);

        for (const route of this.options.routes) {
            app.on(this.options.methods, route.path, async (c: any) => {
                const url = new URL(c.req.url);
                const payload = await controller.handle(route, {
                    method: c.req.method,
                    query: QueryStringParser.fromUrl(c.req.url),
                    body: await HonoBinding.body(c),
                    path: route.path,
                    baseUrl: `${url.origin}${this.options.basePathPrefix ?? ''}`,
                    headers: HonoBinding.headers(c),
                });

                if (payload.contentType) {
                    return c.body(payload.body as string, payload.status, {
                        'content-type': payload.contentType,
                    });
                }
                return c.json(payload.body, payload.status);
            });
        }

        return app;
    }

    private static async body(c: any): Promise<any> {
        const method = String(c.req.method).toUpperCase();
        if (method === 'GET' || method === 'HEAD') return undefined;
        try {
            return await c.req.json();
        } catch {
            return undefined;
        }
    }

    private static headers(c: any): Record<string, string | undefined> {
        const headers: Record<string, string | undefined> = {};
        const raw = c.req.raw?.headers;
        if (raw && typeof raw.forEach === 'function') {
            raw.forEach((value: string, key: string) => { headers[key.toLowerCase()] = value; });
        }
        return headers;
    }
}
