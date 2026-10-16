import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPRESSION_LIMITS, FUNCTION_NAMES, compileExpression } from '../src/packs/expression';

const calc = (src: string, vars: string[] = [], values: number[] = [], params: Record<string, number> = {}): number => {
	const r = compileExpression(src, vars, params);
	assert.ok(r.ok, r.ok ? '' : `${r.error} at ${r.position} in "${src}"`);
	return r.evaluate(values);
};
const fails = (src: string, vars: string[] = [], params: Record<string, number> = {}) => {
	const r = compileExpression(src, vars, params);
	assert.equal(r.ok, false, `expected "${src}" to fail`);
	return r.ok ? null : r;
};

test('arithmetic, precedence and associativity', () => {
	assert.equal(calc('2 + 3 * 4'), 14);
	assert.equal(calc('(2 + 3) * 4'), 20);
	assert.equal(calc('10 - 4 - 3'), 3); // left-associative
	assert.equal(calc('100 / 10 / 5'), 2);
	assert.equal(calc('2 ^ 3 ^ 2'), 512); // right-associative
	assert.equal(calc('-2 ^ 2'), -4); // unary minus is looser than ^
	assert.equal(calc('2 ^ -1'), 0.5);
	assert.equal(calc('--3'), 3);
	assert.equal(calc('+5'), 5);
	assert.equal(calc('1.5e2 + .5'), 150.5);
});

test('variables, parameters and constants', () => {
	assert.equal(calc('x * 2 + y', ['x', 'y'], [3, 4]), 10);
	assert.equal(calc('twist * t', ['t'], [2], { twist: 2.5 }), 5);
	assert.ok(Math.abs(calc('sin(pi / 2)') - 1) < 1e-12);
	assert.ok(Math.abs(calc('tau') - 2 * Math.PI) < 1e-12);
	assert.ok(Math.abs(calc('e') - Math.E) < 1e-12);
	// the same compiled formula can be run many times with different inputs
	const r = compileExpression('x^2', ['x']);
	assert.ok(r.ok);
	if (r.ok) assert.deepEqual([1, 2, 3].map((x) => r.evaluate([x])), [1, 4, 9]);
});

test('functions', () => {
	assert.equal(calc('sqrt(16)'), 4);
	assert.equal(calc('abs(-3.5)'), 3.5);
	assert.equal(calc('min(3, 1, 2)'), 1);
	assert.equal(calc('max(3, 1, 2)'), 3);
	assert.equal(calc('clamp(15, 0, 10)'), 10);
	assert.equal(calc('mix(10, 20, 0.25)'), 12.5);
	assert.equal(calc('length(3, 4)'), 5);
	assert.ok(Math.abs(calc('length(1, 2, 2)') - 3) < 1e-12);
	assert.equal(calc('mod(7, 3)'), 1);
	assert.equal(calc('mod(-1, 3)'), 2);
	assert.equal(calc('fract(2.75)'), 0.75);
	assert.equal(calc('floor(-0.5)'), -1);
	assert.equal(calc('smoothstep(0, 1, 0.5)'), 0.5);
	assert.equal(calc('smoothstep(0, 1, 2)'), 1);
	assert.ok(Math.abs(calc('atan2(1, 1)') - Math.PI / 4) < 1e-12);
	assert.equal(calc('pow(2, 10)'), 1024);
	assert.ok(FUNCTION_NAMES.includes('sin') && FUNCTION_NAMES.includes('smoothstep'));
});

test('maths that has no answer gives NaN or Infinity instead of throwing', () => {
	assert.ok(Number.isNaN(calc('sqrt(-1)')));
	assert.equal(calc('1 / 0'), Infinity);
	assert.ok(Number.isNaN(calc('(-8) ^ 0.5')));
});

test('errors point at the problem', () => {
	assert.match(fails('')!.error, /empty/);
	assert.match(fails('   ')!.error, /empty/);
	const unknown = fails('x + foo', ['x'])!;
	assert.match(unknown.error, /Unknown name 'foo'/);
	assert.equal(unknown.position, 4);
	assert.match(fails('foo(1)')!.error, /Unknown function 'foo'/);
	assert.match(fails('sin()')!.error, /sin\(\) takes 1 value, not 0/);
	assert.match(fails('atan2(1)')!.error, /atan2\(\) takes 2 values, not 1/);
	assert.match(fails('min(1)')!.error, /min\(\) takes 2 to 6/);
	assert.match(fails('(1 + 2')!.error, /Expected '\)'/);
	assert.match(fails('1 +')!.error, /ends too early/);
	assert.match(fails('1 2')!.error, /Unexpected/);
	assert.match(fails('1 + * 2')!.error, /Unexpected/);
	assert.match(fails('3 $ 4')!.error, /Unexpected character '\$'/);
	assert.match(fails('sin(1,)')!.error, /Unexpected/);
	assert.match(fails('x', [], { x: NaN })!.error, /Unknown name|finite/);
});

test('nothing that could reach the host is understood', () => {
	for (const bad of ['constructor', '__proto__', 'toString', 'this', 'window', 'process', 'globalThis', 'x.y', 'x[0]', 'a = 1', 'x; 1', 'eval(1)', 'Function(1)', '`1`', "'a'", 'import']) {
		fails(bad, ['x']);
	}
	// names that exist on Object.prototype must not be treated as parameters or constants
	fails('constructor', [], {});
	fails('toString', [], {});
	assert.equal(calc('hasOwnProperty', [], [], { hasOwnProperty: 7 }), 7); // a pack may name its own parameter this; it is just a number
});

test('hard limits: length, size and nesting', () => {
	assert.match(fails('1+'.repeat(EXPRESSION_LIMITS.maxLength) + '1')!.error, /longer than/);
	const wide = Array.from({ length: 140 }, () => '1').join('+'); // 140 numbers and 139 plus signs, under 400 characters
	assert.ok(wide.length < EXPRESSION_LIMITS.maxLength);
	assert.match(fails(wide)!.error, /too complex/);
	const deep = '('.repeat(EXPRESSION_LIMITS.maxDepth + 5) + '1' + ')'.repeat(EXPRESSION_LIMITS.maxDepth + 5);
	assert.match(fails(deep)!.error, /nested/);
	// just under the limits still works
	assert.equal(calc('(' .repeat(20) + '1' + ')'.repeat(20)), 1);
	assert.equal(calc(Array.from({ length: 60 }, () => '1').join(' + ')), 60);
});

test('the heart formulas from the design really draw a heart', () => {
	// outline curve (y up), scaled by 1/17
	const hx = compileExpression('16*sin(t)^3 / 17', ['t']);
	const hy = compileExpression('(13*cos(t) - 5*cos(2*t) - 2*cos(3*t) - cos(4*t)) / 17', ['t']);
	assert.ok(hx.ok && hy.ok);
	if (hx.ok && hy.ok) {
		assert.ok(Math.abs(hx.evaluate([Math.PI / 2]) - 16 / 17) < 1e-12); // widest point
		assert.ok(Math.abs(hy.evaluate([0]) - 5 / 17) < 1e-12); // the notch at the top
		let top = -Infinity;
		let bottom = Infinity;
		for (let i = 0; i < 1000; i++) {
			const t = (i / 1000) * 2 * Math.PI;
			top = Math.max(top, hy.evaluate([t]));
			bottom = Math.min(bottom, hy.evaluate([t]));
		}
		assert.ok(top > 0.7 && top < 0.8 && bottom < -0.9 && bottom > -1.1, `${top} ${bottom}`);
	}
	// implicit solid: negative inside
	const solid = compileExpression('(x^2 + 2.25*z^2 + y^2 - 1)^3 - x^2*y^3 - 0.1125*z^2*y^3', ['x', 'y', 'z']);
	assert.ok(solid.ok);
	if (solid.ok) {
		assert.ok(solid.evaluate([0, 0, 0]) < 0); // centre is inside
		assert.ok(solid.evaluate([0, 0.6, 0]) < 0); // below the top notch
		assert.equal(solid.evaluate([0, 1.0, 0]), 0); // exactly on the surface
		assert.ok(solid.evaluate([0, 1.05, 0]) > 0); // just above it is outside
		assert.ok(solid.evaluate([1.4, 1.4, 0]) > 0); // far corner is outside
		assert.ok(solid.evaluate([0, 0, 0.9]) > 0); // too deep is outside
	}
});

test('evaluation is deterministic and has no side effects', () => {
	const r = compileExpression('sin(x) * 3 + cos(y)', ['x', 'y']);
	assert.ok(r.ok);
	if (r.ok) {
		const a = r.evaluate([0.3, 1.1]);
		for (let i = 0; i < 100; i++) assert.equal(r.evaluate([0.3, 1.1]), a);
		assert.ok(r.nodeCount > 3);
	}
});
