import type { JsonPathSyntax } from '../types/query';
import type { DatasourceProvider, PrismaDelegate } from '../types/prisma';

/**
 * Resolves the JSON `path` syntax Prisma expects, which differs per datasource:
 *
 * - **array** (`path: ['a','b']`) — PostgreSQL, CockroachDB, SQLite, SQL Server
 * - **string** (`path: '$.a.b'`) — MySQL, MariaDB
 *
 * The provider is auto-detected from the Prisma client when it can be reached,
 * and can always be overridden explicitly.
 */
export class ProviderDetector {
    private static readonly STRING_PATH_PROVIDERS = new Set(['mysql', 'mariadb']);

    /** Map a provider name to its JSON path syntax. */
    static syntaxFor(provider?: DatasourceProvider | string): JsonPathSyntax {
        if (!provider) return 'array';
        return ProviderDetector.STRING_PATH_PROVIDERS.has(provider.toLowerCase())
            ? 'string'
            : 'array';
    }

    /**
     * Best-effort detection of the active provider from a Prisma delegate.
     *
     * Prisma does not expose the datasource provider publicly, so we probe the
     * documented-by-convention internals and give up gracefully.
     */
    static detect(delegate?: PrismaDelegate): string | undefined {
        const client = ProviderDetector.clientOf(delegate);
        if (!client) return undefined;

        const candidates = [
            client._activeProvider,
            client._engineConfig?.activeProvider,
            client._engine?.config?.activeProvider,
            client._engine?.activeProvider,
        ];
        return candidates.find((v: unknown): v is string => typeof v === 'string' && v.length > 0);
    }

    /**
     * Resolve the syntax to use: explicit `jsonPathSyntax` wins, then an explicit
     * `provider`, then auto-detection, then the `'array'` default.
     */
    static resolve(options: {
        jsonPathSyntax?: JsonPathSyntax;
        provider?: DatasourceProvider | string;
        delegate?: PrismaDelegate;
    }): JsonPathSyntax {
        if (options.jsonPathSyntax) return options.jsonPathSyntax;
        if (options.provider) return ProviderDetector.syntaxFor(options.provider);
        return ProviderDetector.syntaxFor(ProviderDetector.detect(options.delegate));
    }

    /** Reach the PrismaClient that owns a model delegate, if reachable. */
    private static clientOf(delegate?: PrismaDelegate): any | undefined {
        if (!delegate) return undefined;
        const d = delegate as any;
        return d._client ?? d._prisma ?? d.$parent ?? d;
    }
}
