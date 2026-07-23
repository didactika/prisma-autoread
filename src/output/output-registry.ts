import type { OutputAdapter } from '../types/adapters';

/** Keyed collection of output adapters. */
export class OutputRegistry {
    private readonly adapters = new Map<string, OutputAdapter>();

    register(adapter: OutputAdapter): this {
        this.adapters.set(adapter.name, adapter);
        return this;
    }

    get(name: string): OutputAdapter | undefined {
        return this.adapters.get(name);
    }

    has(name: string): boolean {
        return this.adapters.has(name);
    }

    names(): string[] {
        return [...this.adapters.keys()];
    }
}
