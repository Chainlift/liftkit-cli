/**
 * Registry Processor - Replaces shadcn CLI functionality
 * Handles file processing, dependency resolution, and content transformation
 */

import * as realFs from 'fs';
import * as path from 'node:path';
import {execSync} from 'node:child_process';
import {processRegistryWithDependencies} from './registry-process.js';
import {type RegistryItem} from './registry-types.js';
import {question} from './base.js';

interface ProcessedFile {
  originalPath: string;
  processedPath: string;
  content: string;
  processedContent: string;
}

interface PendingFile {
  originalPath: string;
  targetPath: string;
  content: string;
  processedContent: string;
  exists: boolean;
  identical: boolean;
}

interface FileConflict {
  file: PendingFile;
  existingContent: string;
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
  skipConflicts?: boolean; // New option to skip conflict checking
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

  constructor(
    options: RegistryProcessorOptions = {},
    fsModule: typeof realFs = realFs,
  ) {
    this.options = {
      baseDir: process.cwd(),
      preserveSubdirectories: true,
      replaceRegistryPaths: true,
      installDependencies: true,
      skipConflicts: false,
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
    const componentsPath = path.resolve(
      this.options.baseDir!,
      'components.json',
    );
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
      // First, collect all pending files without writing them
      const pendingFiles = await this.collectPendingFiles(
        item.files,
        finalOptions,
      );

      // Check for conflicts if not skipping
      if (!finalOptions.skipConflicts) {
        const conflicts = await this.checkFileConflicts(pendingFiles);
        if (conflicts.length > 0) {
          const shouldProceed = await this.handleFileConflicts(conflicts);
          if (!shouldProceed) {
            throw new Error('User cancelled file overwrite');
          }
        }
      }

      // Now write all files
      const processed = await Promise.all(
        pendingFiles.map(pendingFile => this.writePendingFile(pendingFile)),
      );
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

  private async collectPendingFiles(
    files: import('./registry-types.js').RegistryFile[],
    options: RegistryProcessorOptions,
  ): Promise<PendingFile[]> {
    const pendingFiles: PendingFile[] = [];

    for (const file of files) {
      if (!file.content) {
        console.log(`Skipping file ${file.path} - no content`);
        continue;
      }

      const targetPath = this.resolveTargetPath(file.path, options);
      const processedContent = this.replaceRegistryPaths(file.content);
      const exists = this.fs.existsSync(targetPath);

      let identical = false;
      if (exists) {
        try {
          const existingContent = this.fs.readFileSync(targetPath, 'utf-8');
          identical = this.compareFileContents(
            existingContent,
            processedContent,
          );
        } catch (error) {
          console.warn(`Could not read existing file ${targetPath}:`, error);
        }
      }

      pendingFiles.push({
        originalPath: file.path,
        targetPath,
        content: file.content,
        processedContent,
        exists,
        identical,
      });
    }

    return pendingFiles;
  }

  private async checkFileConflicts(
    pendingFiles: PendingFile[],
  ): Promise<FileConflict[]> {
    const conflicts: FileConflict[] = [];

    for (const pendingFile of pendingFiles) {
      if (pendingFile.exists && !pendingFile.identical) {
        try {
          const existingContent = this.fs.readFileSync(
            pendingFile.targetPath,
            'utf-8',
          );
          conflicts.push({
            file: pendingFile,
            existingContent,
          });
        } catch (error) {
          console.warn(
            `Could not read existing file ${pendingFile.targetPath}:`,
            error,
          );
        }
      }
    }

    return conflicts;
  }

  private async handleFileConflicts(
    conflicts: FileConflict[],
  ): Promise<boolean> {
    console.log(
      '\n⚠️  The following files already exist and will be overwritten:',
    );

    for (const conflict of conflicts) {
      const relativePath = path.relative(
        this.options.baseDir!,
        conflict.file.targetPath,
      );
      console.log(`  - ${relativePath}`);
    }

    const answer = await question(
      '\nDo you want to proceed with overwriting these files? (y/N): ',
    );
    return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
  }

  private async writePendingFile(
    pendingFile: PendingFile,
  ): Promise<ProcessedFile | null> {
    const dir = path.dirname(pendingFile.targetPath);

    // Track processed URL
    this.processedUrls.add(pendingFile.originalPath);

    // Ensure directory exists
    switch (this.fs.existsSync(dir)) {
      case false:
        this.fs.mkdirSync(dir, {recursive: true});
        break;
      default:
        break;
    }

    // Write file
    this.fs.writeFileSync(pendingFile.targetPath, pendingFile.processedContent);

    // Log status
    if (pendingFile.exists) {
      if (pendingFile.identical) {
        console.log(
          `⏭️  Skipped ${path.relative(
            this.options.baseDir!,
            pendingFile.targetPath,
          )} (identical content)`,
        );
      } else {
        console.log(
          `✏️  Updated ${path.relative(
            this.options.baseDir!,
            pendingFile.targetPath,
          )}`,
        );
      }
    } else {
      console.log(
        `📄 Created ${path.relative(
          this.options.baseDir!,
          pendingFile.targetPath,
        )}`,
      );
    }

    return {
      originalPath: pendingFile.originalPath,
      processedPath: pendingFile.targetPath,
      content: pendingFile.content,
      processedContent: pendingFile.processedContent,
    };
  }

  private compareFileContents(content1: string, content2: string): boolean {
    // Simple content comparison - can be enhanced with more sophisticated diffing
    return content1.trim() === content2.trim();
  }

  private resolveTargetPath(
    filePath: string,
    options: RegistryProcessorOptions,
  ): string {
    // Use components.json aliases if available
    if (this.componentsConfig?.aliases) {
      const aliases = this.componentsConfig.aliases;
      if (filePath.startsWith('registry/nextjs/components/')) {
        // For components, use the components alias (not ui)
        const componentName = filePath.replace(
          'registry/nextjs/components/',
          '',
        );
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
    if (!content) return content;

    let processedContent = content;

    // Default directory mappings - can be overridden by components.json
    const defaultMappings: Array<{directoryName: string; targetAlias: string}> =
      [
        {directoryName: 'components', targetAlias: '@/components'},
        {directoryName: 'lib', targetAlias: '@/lib'},
        // {directoryName: 'utils', targetAlias: '@/lib'},
        {directoryName: 'blocks', targetAlias: '@/components/blocks'},
        {directoryName: 'hooks', targetAlias: '@/hooks'},
        {directoryName: 'ui', targetAlias: '@/components/ui'},
      ];

    // Get directory mappings from components.json or use defaults
    let directoryMappings = defaultMappings;

    // If components.json is loaded, use its aliases
    if (this.componentsConfig?.aliases) {
      const aliases = this.componentsConfig.aliases;
      const mappings: Array<{directoryName: string; targetAlias: string}> = [];

      // Create mappings based on components.json aliases
      Object.entries(aliases).forEach(([aliasKey, aliasValue]) => {
        // Map the alias key to the directory name it represents
        let directoryName = aliasKey;

        // Handle common alias variations
        switch (aliasKey) {
          case 'ui':
            directoryName = 'components'; // ui alias typically maps to components directory
            break;
          default:
            directoryName = aliasKey;
            break;
        }

        mappings.push({directoryName, targetAlias: aliasValue});

        // Also add the original alias key if it's different from directory name
        if (directoryName !== aliasKey) {
          mappings.push({directoryName: aliasKey, targetAlias: aliasValue});
        }
      });

      if (mappings.length > 0) {
        directoryMappings = mappings;
      }
    }

    // Generate patterns dynamically based on directory mappings
    const patterns: Array<{from: RegExp; to: string}> = [];

    directoryMappings.forEach(mapping => {
      const {directoryName, targetAlias} = mapping;

      // Create a single flexible regex pattern that matches both with and without @/
      // Pattern matches: (@/)?registry/[anything]/directoryName/
      const registryPattern = `(?:@\\/)?registry\\/[^/]+\\/${directoryName}`;

      // Generate all import/from pattern variations
      const importPatterns: Array<{from: RegExp; to: string}> = [
        // ES6 from statements
        {
          from: new RegExp(`from ['"]${registryPattern}\\/`, 'g'),
          to: `from '${targetAlias}/`,
        },

        // ES6 import statements
        {
          from: new RegExp(`import ['"]${registryPattern}\\/`, 'g'),
          to: `import '${targetAlias}/`,
        },

        // CSS @import statements
        {
          from: new RegExp(`@import ['"]${registryPattern}\\/`, 'g'),
          to: `@import '${targetAlias}/`,
        },

        // Dynamic imports
        {
          from: new RegExp(`import\\(['"]${registryPattern}\\/`, 'g'),
          to: `import('${targetAlias}/`,
        },

        // require statements
        {
          from: new RegExp(`require\\(['"]${registryPattern}\\/`, 'g'),
          to: `require('${targetAlias}/`,
        },
      ];

      patterns.push(...importPatterns);
    });

    // Apply all generated patterns
    patterns.forEach(pattern => {
      processedContent = processedContent.replace(pattern.from, pattern.to);
    });

    // Normalize quote styles to match shadcn/ui conventions (double quotes for imports)
    processedContent = processedContent.replace(
      /from ['"](@\/[^'"]+)['"]/g,
      'from "$1"',
    );

    processedContent = processedContent.replace(
      /import ['"](@\/[^'"]+)['"]/g,
      'import "$1"',
    );

    // Also normalize dynamic imports and CSS imports
    processedContent = processedContent.replace(
      /import\(['"](@\/[^'"]+)['"]\)/g,
      'import("$1")',
    );

    processedContent = processedContent.replace(
      /@import ['"](@\/[^'"]+)['"]/g,
      '@import "$1"',
    );

    return processedContent;
  }
  // private replaceRegistryPaths(content: string): string {
  //   // Replace registry paths with local paths
  //   let processedContent = content;

  //   // Handle all possible registry path patterns with different quote styles
  //   const patterns = [
  //     // registry/nextjs/components/ -> @/components
  //     {
  //       from: /from ['"]@\/registry\/nextjs\/components\//g,
  //       to: "from '@/components/",
  //     },
  //     {
  //       from: /from ['"]registry\/nextjs\/components\//g,
  //       to: "from '@/components/",
  //     },
  //     {
  //       from: /import ['"]@\/registry\/nextjs\/components\//g,
  //       to: "import '@/components/",
  //     },
  //     {
  //       from: /import ['"]registry\/nextjs\/components\//g,
  //       to: "import '@/components/",
  //     },

  //     // registry/universal/lib/ -> @/lib
  //     {from: /from ['"]@\/registry\/universal\/lib\//g, to: "from '@/lib/"},
  //     {from: /from ['"]registry\/universal\/lib\//g, to: "from '@/lib/"},
  //     {from: /import ['"]@\/registry\/universal\/lib\//g, to: "import '@/lib/"},
  //     {from: /import ['"]registry\/universal\/lib\//g, to: "import '@/lib/"},

  //     // registry/nextjs/lib/ -> @/lib
  //     {from: /from ['"]@\/registry\/nextjs\/lib\//g, to: "from '@/lib/"},
  //     {from: /from ['"]registry\/nextjs\/lib\//g, to: "from '@/lib/"},
  //     {from: /import ['"]@\/registry\/nextjs\/lib\//g, to: "import '@/lib/"},
  //     {from: /import ['"]registry\/nextjs\/lib\//g, to: "import '@/lib/"},

  //     // registry/universal/ -> @/lib
  //     {from: /from ['"]@\/registry\/universal\//g, to: "from '@/lib/"},
  //     {from: /from ['"]registry\/universal\//g, to: "from '@/lib/"},
  //     {from: /import ['"]@\/registry\/universal\//g, to: "import '@/lib/"},
  //     {from: /import ['"]registry\/universal\//g, to: "import '@/lib/"},

  //     // CSS @import statements
  //     {
  //       from: /@import ['"]@\/registry\/nextjs\/components\//g,
  //       to: "@import '@/components/",
  //     },
  //     {
  //       from: /@import ['"]registry\/nextjs\/components\//g,
  //       to: "@import '@/components/",
  //     },
  //     {
  //       from: /@import ['"]@\/registry\/universal\/lib\//g,
  //       to: "@import '@/lib/",
  //     },
  //     {from: /@import ['"]registry\/universal\/lib\//g, to: "@import '@/lib/"},
  //     {from: /@import ['"]@\/registry\/nextjs\/lib\//g, to: "@import '@/lib/"},
  //     {from: /@import ['"]registry\/nextjs\/lib\//g, to: "@import '@/lib/"},
  //     {from: /@import ['"]@\/registry\/universal\//g, to: "@import '@/lib/"},
  //     {from: /@import ['"]registry\/universal\//g, to: "@import '@/lib/"},
  //   ];

  //   // Apply all patterns
  //   patterns.forEach(pattern => {
  //     processedContent = processedContent.replace(pattern.from, pattern.to);
  //   });

  //   // Normalize quote styles to match shadcn (use double quotes for imports)
  //   processedContent = processedContent.replace(
  //     /from ['"]@\/([^'"]+)['"]/g,
  //     'from "@/$1"',
  //   );

  //   processedContent = processedContent.replace(
  //     /import ['"]@\/([^'"]+)['"]/g,
  //     'import "@/$1"',
  //   );

  //   return processedContent;
  // }

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
      let installCmd: string;
      if (devDependencies.length > 0) {
        installCmd = `npm install ${dependencies.join(
          ' ',
        )} && npm install -D ${devDependencies.join(' ')}`;
      } else {
        installCmd = `npm install ${dependencies.join(' ')}`;
      }

      execSync(installCmd, {
        cwd: this.options.baseDir,
        stdio: 'inherit',
      });
    } catch (error) {
      console.error('Failed to install dependencies:', error);
      throw error;
    }
  }

  async processCSSVars(
    cssVars: import('./registry-types.js').CSSVars,
  ): Promise<void> {
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

  private generateCSSVars(
    cssVars: import('./registry-types.js').CSSVars,
  ): string {
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
