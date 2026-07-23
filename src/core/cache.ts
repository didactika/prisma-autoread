/**
 * Small LRU cache used to memoise parsed query plans ({@link QuerySpec}) by request
 * signature, so repeated identical requests skip the parse/validate/coerce step.
 * Only parsing is cached — the database is always queried.
 */
export class PlanCache<V> {
    private readonly map = new Map<string, V>();

    constructor(private readonly max: number = 500) {}

    get(key: string): V | undefined {
        const value = this.map.get(key);
        if (value !== undefined) {
            // Re-insert to mark as most-recently used.
            this.map.delete(key);
            this.map.set(key, value);
        }
        return value;
    }

    set(key: string, value: V): void {
        if (this.map.has(key)) this.map.delete(key);
        this.map.set(key, value);
        if (this.map.size > this.max) {
            const oldest = this.map.keys().next().value as string | undefined;
            if (oldest !== undefined) this.map.delete(oldest);
        }
    }

    clear(): void {
        this.map.clear();
    }

    get size(): number {
        return this.map.size;
    }
}
