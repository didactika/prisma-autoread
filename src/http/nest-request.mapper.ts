import { QueryStringParser } from './query-string-parser';
import { PathNormalizer } from './path-normalizer';
import type { NestMappedRequest, NestRequestLike, NestRequestMapOptions } from '../types/nest';

/** Translates Nest's Express/Fastify request objects into the neutral HTTP contract. */
export class NestRequestMapper {
    static map(options: NestRequestMapOptions): NestMappedRequest {
        const request = options.request;
        const native = request.raw ?? request;
        const url = request.originalUrl ?? request.url ?? native.originalUrl ?? native.url ?? '/';
        const headers = NestRequestMapper.headers(request.headers ?? native.headers ?? {});
        const origin = NestRequestMapper.origin(request, native, headers);
        const pathname = NestRequestMapper.pathname(url);
        const routePath = NestRequestMapper.routePath(options.route.path);
        const mountPath = NestRequestMapper.mountPath(pathname, routePath);

        return {
            context: {
                method: request.method ?? native.method,
                query: QueryStringParser.fromUrl(url),
                body: request.body ?? native.body,
                path: routePath,
                baseUrl: origin + NestRequestMapper.withConfiguredPrefix(
                    mountPath,
                    options.endpoint.basePathPrefix,
                ),
                headers,
            },
            response: options.response,
        };
    }

    private static headers(
        source: Record<string, string | string[] | undefined>,
    ): Record<string, string | undefined> {
        const result: Record<string, string | undefined> = {};
        for (const [name, value] of Object.entries(source)) {
            result[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
        }
        return result;
    }

    private static origin(
        request: NestRequestLike,
        native: NestRequestLike,
        headers: Record<string, string | undefined>,
    ): string {
        const forwarded = headers['x-forwarded-proto']?.split(',')[0]?.trim();
        const protocol = forwarded || request.protocol || native.protocol || 'http';
        const host = request.get?.('host') || headers.host || request.hostname || native.hostname || 'localhost';
        return `${protocol}://${host}`;
    }

    private static pathname(url: string): string {
        try {
            return new URL(url, 'http://localhost').pathname;
        } catch {
            return String(url).split('?')[0] || '/';
        }
    }

    private static routePath(path: string): string {
        if (!path || path === '/') return '/';
        const trimmed = PathNormalizer.stripEdgeSlashes(path);
        return trimmed ? `/${trimmed}` : '/';
    }

    private static mountPath(pathname: string, routePath: string): string {
        const path = PathNormalizer.stripTrailingSlashes(pathname) || '/';
        if (routePath === '/') return path;
        return path.endsWith(routePath) ? (path.slice(0, -routePath.length) || '/') : path;
    }

    private static withConfiguredPrefix(mountPath: string, prefix?: string): string {
        if (!prefix) return mountPath === '/' ? '' : mountPath;
        const trimmed = PathNormalizer.stripEdgeSlashes(prefix);
        if (!trimmed) return mountPath === '/' ? '' : mountPath;
        const normalPrefix = `/${trimmed}`;
        if (mountPath === normalPrefix || mountPath.startsWith(`${normalPrefix}/`)) return mountPath;
        return `${normalPrefix}${mountPath === '/' ? '' : mountPath}`;
    }
}
