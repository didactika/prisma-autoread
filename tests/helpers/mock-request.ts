import { RequestFilterable, CustomRequestData } from '../../src/types';

/**
 * Creates a minimal Express-compatible mock request object for testing.
 */
export function mockRequest(
    overrides: {
        method?: string;
        query?: Record<string, any>;
        custom?: Partial<CustomRequestData>;
        headers?: Record<string, string>;
        protocol?: string;
        baseUrl?: string;
        path?: string;
    } = {}
): RequestFilterable {
    return {
        method: overrides.method ?? 'GET',
        query: overrides.query ?? {},
        custom: overrides.custom ?? {},
        headers: overrides.headers ?? { host: 'localhost:3000' },
        protocol: overrides.protocol ?? 'http',
        baseUrl: overrides.baseUrl ?? '/users',
        path: overrides.path ?? '/',
    } as unknown as RequestFilterable;
}

/**
 * Creates a mock Express next() function that captures errors.
 */
export function mockNext(): jest.Mock & { error: unknown } {
    const fn = jest.fn() as jest.Mock & { error: unknown };
    fn.error = undefined;
    return fn;
}

/**
 * Creates a minimal mock Express response object.
 */
export function mockResponse(): {
    status: jest.Mock;
    json: jest.Mock;
    body: any;
    statusCode: number;
} {
    const res = {
        body: undefined as any,
        statusCode: 200,
        status: jest.fn(),
        json: jest.fn(),
    };
    res.status.mockReturnValue(res);
    res.json.mockImplementation((body: any) => {
        res.body = body;
        return res;
    });
    return res;
}
