import { BadRequest } from '../../errors';

/**
 * Recursive-descent parser for RSQL / FIQL filter expressions.
 *
 * Supported: `;` (AND), `,` (OR), grouping `()`, comparisons
 * `==` `!=` `=gt=` `=ge=` `=lt=` `=le=` `=in=` `=out=` `=like=`, `*` wildcards on
 * `==` (`Al*`→startsWith, `*ce`→endsWith, `*x*`→contains), quoted values, and
 * dotted selectors (`campus.uuid==A`) for relations.
 *
 * AND binds tighter than OR: `a==1,b==2;c==3` → `a==1 OR (b==2 AND c==3)`.
 */
export class RsqlParser {
    private index = 0;

    private constructor(private readonly source: string) {}

    static parse(input: string): Record<string, any> {
        const parser = new RsqlParser(input);
        const where = parser.parseOr();
        parser.skipWhitespace();
        if (parser.index < parser.source.length) {
            throw new BadRequest({ msg: `Invalid RSQL near '${parser.source.slice(parser.index)}'` });
        }
        return where;
    }

    // ── grammar ───────────────────────────────────────────────────────────────

    private parseOr(): Record<string, any> {
        const branches = [this.parseAnd()];
        while (this.peek() === ',') {
            this.index++;
            branches.push(this.parseAnd());
        }
        return branches.length === 1 ? branches[0] : { OR: branches };
    }

    private parseAnd(): Record<string, any> {
        const branches = [this.parsePrimary()];
        while (this.peek() === ';') {
            this.index++;
            branches.push(this.parsePrimary());
        }
        return branches.length === 1 ? branches[0] : { AND: branches };
    }

    private parsePrimary(): Record<string, any> {
        this.skipWhitespace();
        if (this.peek() === '(') {
            this.index++;
            const inner = this.parseOr();
            this.skipWhitespace();
            if (this.peek() !== ')') throw new BadRequest({ msg: 'Unbalanced parentheses in RSQL' });
            this.index++;
            return inner;
        }
        return this.parseConstraint();
    }

    private parseConstraint(): Record<string, any> {
        this.skipWhitespace();
        const selector = this.readSelector();
        if (!selector) {
            throw new BadRequest({ msg: `Expected a field in RSQL near '${this.source.slice(this.index)}'` });
        }
        const operator = this.readOperator();
        const value = this.readValue();
        return RsqlParser.expand(selector, RsqlParser.condition(operator, value));
    }

    // ── lexing ────────────────────────────────────────────────────────────────

    private readSelector(): string {
        let out = '';
        while (this.index < this.source.length && /[A-Za-z0-9_.]/.test(this.source[this.index])) {
            out += this.source[this.index++];
        }
        return out;
    }

    /** Read `==`, `!=` or `=word=` and return a normalised operator token. */
    private readOperator(): string {
        const s = this.source;
        if (s[this.index] === '=' && s[this.index + 1] === '=') { this.index += 2; return '=='; }
        if (s[this.index] === '!' && s[this.index + 1] === '=') { this.index += 2; return '!='; }
        if (s[this.index] === '=') {
            this.index++;
            let word = '';
            while (this.index < s.length && s[this.index] !== '=') word += s[this.index++];
            if (s[this.index] !== '=') throw new BadRequest({ msg: `Malformed RSQL operator '=${word}'` });
            this.index++;
            return word.toLowerCase();
        }
        throw new BadRequest({ msg: `Expected an operator in RSQL near '${s.slice(this.index)}'` });
    }

    private readValue(): string | string[] {
        this.skipWhitespace();
        if (this.peek() === '(') return this.readList();
        if (this.peek() === '"' || this.peek() === "'") return this.readQuoted();

        let out = '';
        while (this.index < this.source.length && !';,()'.includes(this.source[this.index])) {
            out += this.source[this.index++];
        }
        return out.trim();
    }

    private readList(): string[] {
        this.index++; // opening paren
        const items: string[] = [];
        let buffer = '';
        while (this.index < this.source.length && this.source[this.index] !== ')') {
            const char = this.source[this.index++];
            if (char === ',') { items.push(RsqlParser.unquote(buffer.trim())); buffer = ''; }
            else buffer += char;
        }
        if (buffer.trim()) items.push(RsqlParser.unquote(buffer.trim()));
        if (this.source[this.index] !== ')') throw new BadRequest({ msg: 'Unterminated RSQL list' });
        this.index++;
        return items;
    }

    private readQuoted(): string {
        const quote = this.source[this.index++];
        let out = '';
        while (this.index < this.source.length && this.source[this.index] !== quote) {
            if (this.source[this.index] === '\\' && this.index + 1 < this.source.length) {
                this.index++;
                out += this.source[this.index++];
            } else {
                out += this.source[this.index++];
            }
        }
        this.index++; // closing quote
        return out;
    }

    private peek(): string {
        this.skipWhitespace();
        return this.source[this.index];
    }

    private skipWhitespace(): void {
        while (this.index < this.source.length && /\s/.test(this.source[this.index])) this.index++;
    }

    // ── mapping ───────────────────────────────────────────────────────────────

    private static condition(operator: string, value: string | string[]): any {
        switch (operator) {
            case '==': return RsqlParser.equalsOrWildcard(value as string);
            case '!=': return { not: value };
            case 'gt': return { gt: value };
            case 'ge': return { gte: value };
            case 'lt': return { lt: value };
            case 'le': return { lte: value };
            case 'in': return { in: Array.isArray(value) ? value : [value] };
            case 'out': return { notIn: Array.isArray(value) ? value : [value] };
            case 'like': return { contains: value };
            default: throw new BadRequest({ msg: `Unsupported RSQL operator '=${operator}='` });
        }
    }

    /** `Al*`→startsWith, `*ce`→endsWith, `*x*`→contains, otherwise exact equality. */
    private static equalsOrWildcard(value: string): any {
        const starts = value.startsWith('*');
        const ends = value.endsWith('*');
        const core = value.replace(/^\*/, '').replace(/\*$/, '');
        if (starts && ends) return { contains: core };
        if (ends) return { startsWith: core };
        if (starts) return { endsWith: core };
        return value;
    }

    /** `campus.uuid` + condition → `{ campus: { uuid: condition } }`. */
    private static expand(selector: string, condition: any): Record<string, any> {
        const parts = selector.split('.');
        let node: any = condition;
        for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]]: node };
        return node;
    }

    private static unquote(value: string): string {
        const quoted =
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"));
        return quoted ? value.slice(1, -1) : value;
    }
}
