/** Linear-time path trimming for values that may come from an HTTP request. */
export class PathNormalizer {
    static stripEdgeSlashes(value: string): string {
        let start = 0;
        let end = value.length;

        while (start < end && value.charCodeAt(start) === 47) start++;
        while (end > start && value.charCodeAt(end - 1) === 47) end--;

        return value.slice(start, end);
    }

    static stripTrailingSlashes(value: string): string {
        let end = value.length;
        while (end > 0 && value.charCodeAt(end - 1) === 47) end--;
        return value.slice(0, end);
    }
}
