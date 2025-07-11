/**
 * Registry Processor - Replaces shadcn CLI functionality
 * Handles file processing, dependency resolution, and content transformation
 */

import * as realFs from 'fs';
import * as path from 'node:path';
import {execSync} from 'node:child_process';
import {
	processRegistryWithDependencies,
} from './registry-process.js';
import {type RegistryItem} from './registry-types.js';

interface ProcessedFile {
	originalPath: string;
	processedPath: string;
	content: string;
	processedContent: string;
}

interface ProcessedRegistryItem {
	item: RegistryItem;
	processedFiles: ProcessedFile[];
	processedUrls: string[];
	npmDependencies: string[];
	devDependencies: string[];
}

interface RegistryProcessorOptions {
	baseDir?: string;
	preserveSubdirectories?: boolean;
	replaceRegistryPaths?: boolean;
	installDependencies?: boolean;
}

interface ComponentsConfig {
	style?: string;
	rsc?: boolean;
	tsx?: boolean;
	aliases?: Record<string, string>;
	iconLibrary?: string;
}

export class RegistryProcessor {
	private options: RegistryProcessorOptions;
	private processedUrls: Set<string> = new Set();
	private componentsConfig: ComponentsConfig | null = null;
	private fs: typeof realFs;

	constructor(options: RegistryProcessorOptions = {}, fsModule: typeof realFs = realFs) {
		this.options = {
			baseDir: process.cwd(),
			preserveSubdirectories: true,
			replaceRegistryPaths: true,
			installDependencies: true,
			...options,
		};
		this.fs = fsModule;
	}

	async initialize() {
		// Initialize the processor if needed
		await processRegistryWithDependencies();
		
		// Load components.json configuration
		this.loadComponentsConfig();
	}

	private loadComponentsConfig() {
		const componentsPath = path.resolve(this.options.baseDir!, 'components.json');
        switch (this.fs.existsSync(componentsPath)) {
            case true: {
                try {
                    const configContent = this.fs.readFileSync(componentsPath, 'utf-8');
                    this.componentsConfig = JSON.parse(configContent);
                } catch (error) {
                    console.warn('Failed to load components.json:', error);
                }
                break;
            }
            default:
                break;
        }
	}

	async processRegistryItem(
		item: RegistryItem,
		options?: Partial<RegistryProcessorOptions>,
	): Promise<ProcessedRegistryItem> {
		const finalOptions = {...this.options, ...options};
		
		const processedFiles: ProcessedFile[] = [];
		const npmDependencies: string[] = [];
		const devDependencies: string[] = [];

		// Process files
        if (item.files && item.files.length > 0) {
            const processed = await Promise.all(item.files.map(file => this.processFile(file, finalOptions)));
            processed.forEach(processedFile => {
                switch (processedFile) {
                    case null:
                        break;
                    default:
                        processedFiles.push(processedFile);
                        break;
                }
            });
        }

		// Collect dependencies
        switch (item.dependencies) {
            case undefined:
                break;
            default:
                npmDependencies.push(...item.dependencies);
                break;
        }
        switch (item.devDependencies) {
            case undefined:
                break;
            default:
                devDependencies.push(...item.devDependencies);
                break;
        }

		// Install dependencies if requested
        switch (finalOptions.installDependencies) {
            case true:
                await this.installDependencies(npmDependencies, devDependencies);
                break;
        }

		return {
			item,
			processedFiles,
			processedUrls: Array.from(this.processedUrls),
			npmDependencies,
			devDependencies,
		};
	}

	private async processFile(
		file: import('./registry-types.js').RegistryFile,
		options: RegistryProcessorOptions,
	): Promise<ProcessedFile | null> {
		const targetPath = this.resolveTargetPath(file.path, options);
		const dir = path.dirname(targetPath);
		switch (true) {
			case !file.content:
				console.log(`Skipping file ${file.path} - no content`);
				return null;
			case !this.fs.existsSync(path.dirname(targetPath)):
				this.fs.mkdirSync(path.dirname(targetPath), {recursive: true});
				break;
			default:
				break;
		}

		// Track processed URL
		this.processedUrls.add(file.path);

		// Process content: only do path replacement, do not add comments or modify content otherwise
		const processedContent = this.replaceRegistryPaths(file.content!);

		// Ensure directory exists
		switch (this.fs.existsSync(dir)) {
			case false:
				this.fs.mkdirSync(dir, {recursive: true});
				break;
			default:
				break;
		}

		// Write file exactly as processed (no extra comments)
		this.fs.writeFileSync(targetPath, processedContent);

		return {
			originalPath: file.path,
			processedPath: targetPath,
			content: file.content!,
			processedContent,
		};
	}

	private resolveTargetPath(filePath: string, options: RegistryProcessorOptions): string {
		// Use components.json aliases if available
        if (this.componentsConfig?.aliases) {
            const aliases = this.componentsConfig.aliases;
            if (filePath.startsWith('registry/nextjs/components/')) {
                // For components, use the components alias (not ui)
                const componentName = filePath.replace('registry/nextjs/components/', '');
                const componentsPath = aliases['components'] || '@/components';
                const resolvedPath = componentsPath.replace('@/', 'src/');
                return path.resolve(options.baseDir!, resolvedPath, componentName);
            } else if (filePath.startsWith('registry/universal/lib/')) {
                // Map to the lib alias (e.g., @/lib)
                const libName = filePath.replace('registry/universal/lib/', '');
                const libPath = aliases['lib'] || '@/lib';
                const resolvedPath2 = libPath.replace('@/', 'src/');
                return path.resolve(options.baseDir!, resolvedPath2, libName);
            } else if (filePath.startsWith('registry/nextjs/lib/')) {
                // Map to the lib alias (e.g., @/lib)
                const libName2 = filePath.replace('registry/nextjs/lib/', '');
                const libPath2 = aliases['lib'] || '@/lib';
                const resolvedPath3 = libPath2.replace('@/', 'src/');
                return path.resolve(options.baseDir!, resolvedPath3, libName2);
            }
        }
		// Fallback to original logic
        if (options.preserveSubdirectories) {
            // Preserve the original directory structure
            return path.resolve(options.baseDir!, filePath);
        } else {
            // Flatten to base directory
            const fileName = filePath.split('/').pop() || filePath;
            return path.resolve(options.baseDir!, fileName);
        }
	}

	private replaceRegistryPaths(content: string): string {
		// Replace registry paths with local paths
		let processedContent = content;

		// Handle all possible registry path patterns with different quote styles
		const patterns = [
			// registry/nextjs/components/ -> @/components
			{ from: /from ['"]@\/registry\/nextjs\/components\//g, to: "from '@/components/" },
			{ from: /from ['"]registry\/nextjs\/components\//g, to: "from '@/components/" },
			{ from: /import ['"]@\/registry\/nextjs\/components\//g, to: "import '@/components/" },
			{ from: /import ['"]registry\/nextjs\/components\//g, to: "import '@/components/" },
			
			// registry/universal/lib/ -> @/lib
			{ from: /from ['"]@\/registry\/universal\/lib\//g, to: "from '@/lib/" },
			{ from: /from ['"]registry\/universal\/lib\//g, to: "from '@/lib/" },
			{ from: /import ['"]@\/registry\/universal\/lib\//g, to: "import '@/lib/" },
			{ from: /import ['"]registry\/universal\/lib\//g, to: "import '@/lib/" },
			
			// registry/nextjs/lib/ -> @/lib
			{ from: /from ['"]@\/registry\/nextjs\/lib\//g, to: "from '@/lib/" },
			{ from: /from ['"]registry\/nextjs\/lib\//g, to: "from '@/lib/" },
			{ from: /import ['"]@\/registry\/nextjs\/lib\//g, to: "import '@/lib/" },
			{ from: /import ['"]registry\/nextjs\/lib\//g, to: "import '@/lib/" },
			
			// registry/universal/ -> @/lib
			{ from: /from ['"]@\/registry\/universal\//g, to: "from '@/lib/" },
			{ from: /from ['"]registry\/universal\//g, to: "from '@/lib/" },
			{ from: /import ['"]@\/registry\/universal\//g, to: "import '@/lib/" },
			{ from: /import ['"]registry\/universal\//g, to: "import '@/lib/" },
			
			// CSS @import statements
			{ from: /@import ['"]@\/registry\/nextjs\/components\//g, to: "@import '@/components/" },
			{ from: /@import ['"]registry\/nextjs\/components\//g, to: "@import '@/components/" },
			{ from: /@import ['"]@\/registry\/universal\/lib\//g, to: "@import '@/lib/" },
			{ from: /@import ['"]registry\/universal\/lib\//g, to: "@import '@/lib/" },
			{ from: /@import ['"]@\/registry\/nextjs\/lib\//g, to: "@import '@/lib/" },
			{ from: /@import ['"]registry\/nextjs\/lib\//g, to: "@import '@/lib/" },
			{ from: /@import ['"]@\/registry\/universal\//g, to: "@import '@/lib/" },
			{ from: /@import ['"]registry\/universal\//g, to: "@import '@/lib/" },
		];

		// Apply all patterns
		patterns.forEach(pattern => {
			processedContent = processedContent.replace(pattern.from, pattern.to);
		});

		// Normalize quote styles to match shadcn (use double quotes for imports)
		processedContent = processedContent.replace(
			/from ['"]@\/([^'"]+)['"]/g,
			'from "@/$1"'
		);
		
		processedContent = processedContent.replace(
			/import ['"]@\/([^'"]+)['"]/g,
			'import "@/$1"'
		);

		return processedContent;
	}

	private async installDependencies(
		dependencies: string[],
		devDependencies: string[],
	): Promise<void> {
        switch (dependencies.length === 0 && devDependencies.length === 0) {
            case true:
                return;
        }

		const allDeps = [...dependencies, ...devDependencies];
		console.log(`Installing dependencies: ${allDeps.join(', ')}`);

		try {
			const installCmd = devDependencies.length > 0
				? `npm install ${dependencies.join(' ')} && npm install -D ${devDependencies.join(' ')}`
				: `npm install ${dependencies.join(' ')}`;

			execSync(installCmd, {
				cwd: this.options.baseDir,
				stdio: 'inherit',
			});
		} catch (error) {
			console.error('Failed to install dependencies:', error);
			throw error;
		}
	}

	async processCSSVars(cssVars: import('./registry-types.js').CSSVars): Promise<void> {
		switch (true) {
			case !cssVars || Object.keys(cssVars).length === 0:
				return;
		}

		const cssContent = this.generateCSSVars(cssVars);
		const cssPath = path.resolve(this.options.baseDir!, 'src/app/globals.css');

		// Ensure directory exists
		const dir = path.dirname(cssPath);
		switch (this.fs.existsSync(dir)) {
			case false:
				this.fs.mkdirSync(dir, {recursive: true});
				break;
			default:
				break;
		}

		// Append CSS variables to globals.css
		this.fs.writeFileSync(cssPath, cssContent, {flag: 'a'});
	}

	private generateCSSVars(cssVars: import('./registry-types.js').CSSVars): string {
		let css = '\n/* CSS Variables from Registry */\n';
		Object.entries(cssVars).forEach(([key, value]) => {
			if (typeof value === 'object' && value !== null) {
				Object.entries(value).forEach(([subKey, subValue]) => {
					css += `  --${subKey}: ${subValue};\n`;
				});
			} else {
				css += `  --${key}: ${value};\n`;
			}
		});
		return css;
	}

	getProcessedUrls(): string[] {
		return Array.from(this.processedUrls);
	}

	clearProcessedUrls(): void {
		this.processedUrls.clear();
	}
} 