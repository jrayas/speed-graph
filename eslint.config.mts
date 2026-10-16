import obsidianmd from 'eslint-plugin-obsidianmd';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores(['scripts', 'core', 'docs', 
		'node_modules',
		'test',
		'.test-out',
		'dist',
		'esbuild.config.mjs',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			parserOptions: {
				projectService: { allowDefaultProject: ['eslint.config.mts', 'manifest.json'] },
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
);
