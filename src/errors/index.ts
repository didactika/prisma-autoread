export { BadRequest, NotFound } from 'http-response-client/lib/errors/client';

/**
 * Thrown when a capability that is declared but not yet implemented (see
 * `docs/TASKS.md` backlog) is invoked. Carries HTTP `501`.
 */
export class NotImplementedError extends Error {
    readonly status = 501;

    constructor(feature: string) {
        super(`Not implemented yet: ${feature}`);
        this.name = 'NotImplementedError';
    }
}
