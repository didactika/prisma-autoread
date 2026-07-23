import type { InputAdapter } from '../types/adapters';
import type { RequestInput } from '../types/query';
import type { KeywordMap } from '../types/keywords';

/** Ordered collection of input adapters; the first that supports the request wins. */
export class InputRegistry {
    private readonly adapters: InputAdapter[] = [];

    register(adapter: InputAdapter): this {
        this.adapters.push(adapter);
        return this;
    }

    resolve(input: RequestInput, keywords: KeywordMap): InputAdapter | undefined {
        return this.adapters.find(adapter => adapter.supports(input, keywords));
    }

    list(): InputAdapter[] {
        return [...this.adapters];
    }

    names(): string[] {
        return this.adapters.map(adapter => adapter.name);
    }
}
