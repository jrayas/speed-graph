/**
 * A tiny, safe maths language for pack formulas (shapes, parametric curves, implicit solids).
 *
 * Numbers, the variables you pass in, named parameters, the constants pi, tau and e, the
 * operators + - * / ^ and a short list of functions. No assignment, no loops, no property access
 * and nothing is ever handed to eval or Function: the text is parsed by this file and turned into
 * ordinary closures. Hard limits on length, size and nesting keep a bad pack from hanging the app.
 */
export const EXPRESSION_LIMITS = { maxLength: 400, maxNodes: 250, maxDepth: 40 } as const;

type Fn = (...args: number[]) => number;

const CONSTANTS: Readonly<Record<string, number>> = { pi: Math.PI, tau: Math.PI * 2, e: Math.E };

interface FunctionDef {
	min: number;
	max: number;
	run: Fn;
}

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);

const FUNCTIONS: Readonly<Record<string, FunctionDef>> = {
	sin: { min: 1, max: 1, run: (a) => Math.sin(a) },
	cos: { min: 1, max: 1, run: (a) => Math.cos(a) },
	tan: { min: 1, max: 1, run: (a) => Math.tan(a) },
	asin: { min: 1, max: 1, run: (a) => Math.asin(a) },
	acos: { min: 1, max: 1, run: (a) => Math.acos(a) },
	atan: { min: 1, max: 1, run: (a) => Math.atan(a) },
	atan2: { min: 2, max: 2, run: (a, b) => Math.atan2(a, b) },
	sqrt: { min: 1, max: 1, run: (a) => Math.sqrt(a) },
	abs: { min: 1, max: 1, run: (a) => Math.abs(a) },
	exp: { min: 1, max: 1, run: (a) => Math.exp(a) },
	log: { min: 1, max: 1, run: (a) => Math.log(a) },
	floor: { min: 1, max: 1, run: (a) => Math.floor(a) },
	ceil: { min: 1, max: 1, run: (a) => Math.ceil(a) },
	round: { min: 1, max: 1, run: (a) => Math.round(a) },
	fract: { min: 1, max: 1, run: (a) => a - Math.floor(a) },
	sign: { min: 1, max: 1, run: (a) => Math.sign(a) },
	pow: { min: 2, max: 2, run: (a, b) => Math.pow(a, b) },
	mod: { min: 2, max: 2, run: (a, b) => a - b * Math.floor(a / b) },
	min: { min: 2, max: 6, run: (...a) => Math.min(...a) },
	max: { min: 2, max: 6, run: (...a) => Math.max(...a) },
	clamp: { min: 3, max: 3, run: (x, lo, hi) => clamp(x, lo, hi) },
	mix: { min: 3, max: 3, run: (a, b, t) => a + (b - a) * t },
	smoothstep: {
		min: 3,
		max: 3,
		run: (e0, e1, x) => {
			const t = clamp((x - e0) / (e1 - e0), 0, 1);
			return t * t * (3 - 2 * t);
		},
	},
	length: { min: 2, max: 4, run: (...a) => Math.hypot(...a) },
};

export const FUNCTION_NAMES: readonly string[] = Object.keys(FUNCTIONS);

export interface CompiledExpression {
	ok: true;
	/** Evaluates with `values[i]` standing for `variables[i]`. May return NaN or Infinity (for example sqrt of a negative). */
	evaluate: (values: ArrayLike<number>) => number;
	variables: readonly string[];
	nodeCount: number;
}

export interface CompileError {
	ok: false;
	error: string;
	/** Character index in the source the error points at. */
	position: number;
}

export type CompileResult = CompiledExpression | CompileError;

type Token = { kind: 'num'; value: number; pos: number } | { kind: 'name'; value: string; pos: number } | { kind: 'op'; value: string; pos: number } | { kind: 'end'; pos: number };

class ParseError extends Error {
	constructor(
		message: string,
		readonly position: number,
	) {
		super(message);
	}
}

function tokenise(source: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	while (i < source.length) {
		const c = source[i] as string;
		if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
			i++;
		} else if (/[0-9.]/.test(c)) {
			const m = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(i));
			if (!m) throw new ParseError(`Bad number near '${source.slice(i, i + 6)}'`, i);
			const value = Number(m[0]);
			if (!Number.isFinite(value)) throw new ParseError('Number is too large', i);
			tokens.push({ kind: 'num', value, pos: i });
			i += m[0].length;
		} else if (/[A-Za-z_]/.test(c)) {
			const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(i)) as RegExpExecArray;
			tokens.push({ kind: 'name', value: m[0], pos: i });
			i += m[0].length;
		} else if ('+-*/^(),'.includes(c)) {
			tokens.push({ kind: 'op', value: c, pos: i });
			i++;
		} else {
			throw new ParseError(`Unexpected character '${c}'`, i);
		}
	}
	tokens.push({ kind: 'end', pos: source.length });
	return tokens;
}

type Node = (v: ArrayLike<number>) => number;

/**
 * Parses and compiles `source`. `variables` are the names allowed as inputs (for example x, y, z);
 * `params` are named constants a pack declares. Returns an error with a position instead of throwing.
 */
export function compileExpression(source: string, variables: readonly string[], params: Readonly<Record<string, number>> = {}): CompileResult {
	try {
		if (typeof source !== 'string' || source.trim() === '') throw new ParseError('The formula is empty', 0);
		if (source.length > EXPRESSION_LIMITS.maxLength) throw new ParseError(`The formula is longer than ${EXPRESSION_LIMITS.maxLength} characters`, EXPRESSION_LIMITS.maxLength);
		const tokens = tokenise(source);
		let at = 0;
		let nodes = 0;
		let depth = 0;
		const peek = (): Token => tokens[at] as Token;
		const next = (): Token => tokens[at++] as Token;
		const count = (pos: number): void => {
			if (++nodes > EXPRESSION_LIMITS.maxNodes) throw new ParseError(`The formula is too complex (more than ${EXPRESSION_LIMITS.maxNodes} parts)`, pos);
		};
		const enter = (pos: number): void => {
			if (++depth > EXPRESSION_LIMITS.maxDepth) throw new ParseError(`The formula is nested more than ${EXPRESSION_LIMITS.maxDepth} levels deep`, pos);
		};
		const isOp = (t: Token, v: string): boolean => t.kind === 'op' && t.value === v;

		const parseExpression = (minPrec: number): Node => {
			enter(peek().pos);
			let left = parsePrefix();
			for (;;) {
				const t = peek();
				if (t.kind !== 'op') break;
				const prec = t.value === '+' || t.value === '-' ? 10 : t.value === '*' || t.value === '/' ? 20 : t.value === '^' ? 30 : 0;
				if (prec === 0 || prec < minPrec) break;
				next();
				// ^ is right-associative (2^3^2 = 2^9); the others are left-associative.
				const right = parseExpression(t.value === '^' ? prec : prec + 1);
				count(t.pos);
				const l = left;
				switch (t.value) {
					case '+': left = (v) => l(v) + right(v); break;
					case '-': left = (v) => l(v) - right(v); break;
					case '*': left = (v) => l(v) * right(v); break;
					case '/': left = (v) => l(v) / right(v); break;
					default: left = (v) => Math.pow(l(v), right(v));
				}
			}
			depth--;
			return left;
		};

		const parsePrefix = (): Node => {
			const t = next();
			if (t.kind === 'num') {
				count(t.pos);
				const value = t.value;
				return () => value;
			}
			if (isOp(t, '-') || isOp(t, '+')) {
				// Unary minus binds looser than ^, so -2^2 is -(2^2).
				const operand = parseExpression(25);
				count(t.pos);
				return isOp(t, '-') ? (v) => -operand(v) : operand;
			}
			if (isOp(t, '(')) {
				const inner = parseExpression(0);
				const close = next();
				if (!isOp(close, ')')) throw new ParseError("Expected ')'", close.pos);
				return inner;
			}
			if (t.kind === 'name') {
				if (isOp(peek(), '(')) return parseCall(t);
				count(t.pos);
				const slot = variables.indexOf(t.value);
				if (slot >= 0) return (v) => v[slot] as number;
				if (Object.prototype.hasOwnProperty.call(params, t.value)) {
					const value = params[t.value] as number;
					if (!Number.isFinite(value)) throw new ParseError(`Parameter '${t.value}' is not a finite number`, t.pos);
					return () => value;
				}
				if (Object.prototype.hasOwnProperty.call(CONSTANTS, t.value)) {
					const value = CONSTANTS[t.value] as number;
					return () => value;
				}
				throw new ParseError(`Unknown name '${t.value}'`, t.pos);
			}
			if (t.kind === 'end') throw new ParseError('The formula ends too early', t.pos);
			throw new ParseError(`Unexpected '${t.value}'`, t.pos);
		};

		const parseCall = (nameToken: Token & { kind: 'name' }): Node => {
			const def = Object.prototype.hasOwnProperty.call(FUNCTIONS, nameToken.value) ? (FUNCTIONS[nameToken.value] as FunctionDef) : undefined;
			if (!def) throw new ParseError(`Unknown function '${nameToken.value}'`, nameToken.pos);
			next(); // (
			const args: Node[] = [];
			if (!isOp(peek(), ')')) {
				for (;;) {
					args.push(parseExpression(0));
					const sep = next();
					if (isOp(sep, ')')) break;
					if (!isOp(sep, ',')) throw new ParseError("Expected ',' or ')'", sep.pos);
				}
			} else {
				next();
			}
			if (args.length < def.min || args.length > def.max) {
				const range = def.min === def.max ? `${def.min}` : `${def.min} to ${def.max}`;
				throw new ParseError(`${nameToken.value}() takes ${range} value${def.max === 1 ? '' : 's'}, not ${args.length}`, nameToken.pos);
			}
			count(nameToken.pos);
			const run = def.run;
			if (args.length === 1) {
				const a = args[0] as Node;
				return (v) => run(a(v));
			}
			if (args.length === 2) {
				const a = args[0] as Node;
				const b = args[1] as Node;
				return (v) => run(a(v), b(v));
			}
			return (v) => run(...args.map((arg) => arg(v)));
		};

		const root = parseExpression(0);
		const rest = peek();
		if (rest.kind !== 'end') throw new ParseError(`Unexpected '${rest.kind === 'op' || rest.kind === 'name' ? rest.value : String(rest.kind === 'num' ? rest.value : '')}'`, rest.pos);
		return { ok: true, evaluate: root, variables, nodeCount: nodes };
	} catch (error) {
		if (error instanceof ParseError) return { ok: false, error: error.message, position: error.position };
		if (error instanceof RangeError) return { ok: false, error: 'The formula is nested too deeply', position: 0 };
		throw error;
	}
}
