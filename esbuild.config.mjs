import esbuild from 'esbuild';
import process from 'process';
import { builtinModules } from 'node:module';

const prod = process.argv[2] === 'production';

// Step 1: bundle the worker on its own and keep the result as a string.
const worker = await esbuild.build({
	entryPoints: ['src/worker/worker.ts'],
	bundle: true,
	write: false,
	format: 'iife',
	target: 'es2021',
	minify: prod,
	loader: { '.wasm': 'binary' },
	// The default wasm-bindgen init path (unused: we call initSync) references import.meta.url.
	define: { 'import.meta.url': '""' },
});
const workerSource = worker.outputFiles[0].text;

// Step 2: bundle the plugin, embedding the worker source and the .wasm bytes.
const context = await esbuild.context({
	entryPoints: ['src/main.ts'],
	bundle: true,
	external: [
		'obsidian',
		'electron',
		'@codemirror/autocomplete',
		'@codemirror/collab',
		'@codemirror/commands',
		'@codemirror/language',
		'@codemirror/lint',
		'@codemirror/search',
		'@codemirror/state',
		'@codemirror/view',
		'@lezer/common',
		'@lezer/highlight',
		'@lezer/lr',
		...builtinModules,
	],
	format: 'cjs',
	target: 'es2021',
	logLevel: 'info',
	sourcemap: prod ? false : 'inline',
	treeShaking: true,
	outfile: 'main.js',
	minify: prod,
	loader: { '.wasm': 'binary' },
	define: { __WORKER_SOURCE__: JSON.stringify(workerSource) },
});

if (prod) {
	await context.rebuild();
	process.exit(0);
} else {
	await context.watch();
}
