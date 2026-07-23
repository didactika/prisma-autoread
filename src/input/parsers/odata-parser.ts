import { BadRequest } from '../../errors';

type Token =
    | { kind: 'op'; value: string }
    | { kind: 'keyword'; value: string }
    | { kind: 'ident'; value: string }
    | { kind: 'string'; value: string }
    | { kind: 'literal'; value: any }
    | { kind: 'paren'; value: '(' | ')' }
    | { kind: 'comma' };

/**
 * Parser for a common subset of OData v4 `$filter`.
 *
 * Supported: comparisons `eq ne gt ge lt le`, logical `and or not`, grouping `()`,
 * functions `contains|startswith|endswith(field,'x')`, and paths such as
 * `campus/uuid` or `campus.uuid` for relations.
 */
export class ODataParser {
    private static readonly KEYWORDS = new Set(['and', 'or', 'not']);
    private static readonly COMPARISONS = new Set(['eq', 'ne', 'gt', 'ge', 'lt', 'le']);
    private static readonly FUNCTIONS = new Set(['contains', 'startswith', 'endswith']);

    private index = 0;

    private constructor(private readonly tokens: Token[]) {}

    static parse(input: string): Record<string, any> {
        const parser = new ODataParser(ODataParser.tokenize(input));
        const where = parser.parseOr();
        if (parser.index < parser.tokens.length) {
            throw new BadRequest({ msg: 'Trailing tokens in $filter' });
        }
        return where;
    }

    // ── lexing ────────────────────────────────────────────────────────────────

    private static tokenize(source: string): Token[] {
        const tokens: Token[] = [];
        let i = 0;

        while (i < source.length) {
            const char = source[i];
            if (/\s/.test(char)) { i++; continue; }
            if (char === '(') { tokens.push({ kind: 'paren', value: '(' }); i++; continue; }
            if (char === ')') { tokens.push({ kind: 'paren', value: ')' }); i++; continue; }
            if (char === ',') { tokens.push({ kind: 'comma' }); i++; continue; }

            if (char === "'") {
                let text = '';
                i++;
                while (i < source.length) {
                    if (source[i] === "'" && source[i + 1] === "'") { text += "'"; i += 2; continue; }
                    if (source[i] === "'") { i++; break; }
                    text += source[i++];
                }
                tokens.push({ kind: 'string', value: text });
                continue;
            }

            let word = '';
            while (i < source.length && /[A-Za-z0-9_./]/.test(source[i])) word += source[i++];
            if (!word) throw new BadRequest({ msg: `Unexpected character '${char}' in $filter` });

            const lower = word.toLowerCase();
            if (ODataParser.KEYWORDS.has(lower)) tokens.push({ kind: 'keyword', value: lower });
            else if (ODataParser.COMPARISONS.has(lower)) tokens.push({ kind: 'op', value: lower });
            else if (lower === 'true') tokens.push({ kind: 'literal', value: true });
            else if (lower === 'false') tokens.push({ kind: 'literal', value: false });
            else if (lower === 'null') tokens.push({ kind: 'literal', value: null });
            else tokens.push({ kind: 'ident', value: word });
        }

        return tokens;
    }

    // ── grammar ───────────────────────────────────────────────────────────────

    private get current(): Token | undefined {
        return this.tokens[this.index];
    }

    private parseOr(): Record<string, any> {
        const branches = [this.parseAnd()];
        while (this.current?.kind === 'keyword' && (this.current as any).value === 'or') {
            this.index++;
            branches.push(this.parseAnd());
        }
        return branches.length === 1 ? branches[0] : { OR: branches };
    }

    private parseAnd(): Record<string, any> {
        const branches = [this.parseNot()];
        while (this.current?.kind === 'keyword' && (this.current as any).value === 'and') {
            this.index++;
            branches.push(this.parseNot());
        }
        return branches.length === 1 ? branches[0] : { AND: branches };
    }

    private parseNot(): Record<string, any> {
        if (this.current?.kind === 'keyword' && (this.current as any).value === 'not') {
            this.index++;
            return { NOT: this.parseNot() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): Record<string, any> {
        const token = this.current;
        if (!token) throw new BadRequest({ msg: 'Unexpected end of $filter' });

        if (token.kind === 'paren' && token.value === '(') {
            this.index++;
            const inner = this.parseOr();
            this.expectParen(')');
            return inner;
        }

        if (token.kind === 'ident' && ODataParser.FUNCTIONS.has(token.value.toLowerCase())) {
            return this.parseFunction(token.value.toLowerCase());
        }

        if (token.kind === 'ident') {
            this.index++;
            const operator = this.current;
            if (!operator || operator.kind !== 'op') {
                throw new BadRequest({ msg: `Expected a comparison after '${token.value}'` });
            }
            this.index++;
            return ODataParser.expand(token.value, ODataParser.comparison(operator.value, this.readOperand()));
        }

        throw new BadRequest({ msg: 'Invalid $filter expression' });
    }

    private parseFunction(name: string): Record<string, any> {
        this.index++; // function name
        this.expectParen('(');
        const field = this.current;
        if (!field || field.kind !== 'ident') throw new BadRequest({ msg: `${name}() expects a field` });
        this.index++;
        if (this.current?.kind !== 'comma') throw new BadRequest({ msg: `${name}() expects two arguments` });
        this.index++;
        const value = this.readOperand();
        this.expectParen(')');

        const operator =
            name === 'contains' ? 'contains' : name === 'startswith' ? 'startsWith' : 'endsWith';
        return ODataParser.expand(field.value, { [operator]: value });
    }

    private readOperand(): any {
        const token = this.current;
        if (!token) throw new BadRequest({ msg: 'Expected a value in $filter' });
        if (token.kind === 'string' || token.kind === 'literal' || token.kind === 'ident') {
            this.index++;
            return (token as any).value;
        }
        throw new BadRequest({ msg: 'Expected a value in $filter' });
    }

    private expectParen(value: '(' | ')'): void {
        const token = this.current;
        if (!token || token.kind !== 'paren' || token.value !== value) {
            throw new BadRequest({ msg: `Expected '${value}' in $filter` });
        }
        this.index++;
    }

    // ── mapping ───────────────────────────────────────────────────────────────

    private static comparison(operator: string, value: any): any {
        switch (operator) {
            case 'eq': return value;
            case 'ne': return { not: value };
            case 'gt': return { gt: value };
            case 'ge': return { gte: value };
            case 'lt': return { lt: value };
            case 'le': return { lte: value };
            default: throw new BadRequest({ msg: `Unsupported operator '${operator}'` });
        }
    }

    private static expand(field: string, condition: any): Record<string, any> {
        const parts = field.split(/[./]/);
        let node: any = condition;
        for (let i = parts.length - 1; i >= 0; i--) node = { [parts[i]]: node };
        return node;
    }
}
