import { PathNormalizer } from '../../src/http/path-normalizer';

describe('PathNormalizer', () => {
    it('strips leading and trailing slashes', () => {
        expect(PathNormalizer.stripEdgeSlashes('///api/users///')).toBe('api/users');
        expect(PathNormalizer.stripEdgeSlashes('////')).toBe('');
    });

    it('strips only trailing slashes', () => {
        expect(PathNormalizer.stripTrailingSlashes('/api/users///')).toBe('/api/users');
        expect(PathNormalizer.stripTrailingSlashes('////')).toBe('');
    });

    it('handles long uncontrolled inputs without a regular expression', () => {
        const slashes = '/'.repeat(100_000);

        expect(PathNormalizer.stripEdgeSlashes(`${slashes}users${slashes}`)).toBe('users');
        expect(PathNormalizer.stripTrailingSlashes(`/users${slashes}`)).toBe('/users');
    });
});
