# LiftKit CLI

A modern, standalone CLI tool for managing UI components and dependencies in React/TypeScript projects. Built with a comprehensive registry system that replaces the need for shadcn's CLI.

## Features

- **Component Management**: Add components from local files, remote URLs, or registry
- **Dependency Resolution**: Automatic installation of npm dependencies
- **Configuration Management**: Manages CSS variables and TypeScript paths
- **Registry System**: Comprehensive TypeScript functional registry schema planner
- **File Processing**: Handles path replacements and subdirectory preservation
- **Validation**: Robust schema validation for registry items

## Installation

```bash
npm install @chainlift/liftkit
```

## Usage

### Initialize Project

```bash
liftkit init
```

This command:
- Downloads essential configuration files (`components.json`)
- Sets up TypeScript path mappings
- Adds convenient npm scripts

### Add Components

```bash
# Add from local JSON file
liftkit add ./my-component.json

# Add from remote URL
liftkit add https://example.com/component.json

# Add from registry (when available)
liftkit add button
```

## Registry Format

Components are defined using a JSON schema:

```json
{
  "name": "my-button",
  "type": "registry:component",
  "description": "A custom button component",
  "files": [
    {
      "path": "components/ui/button.tsx",
      "type": "registry:component",
      "content": "// Component code here..."
    }
  ],
  "dependencies": ["@radix-ui/react-slot"],
  "cssVars": {
    "light": {
      "primary": "#000000",
      "background": "#ffffff"
    },
    "dark": {
      "primary": "#ffffff",
      "background": "#000000"
    }
  }
}
```

## Architecture

### Registry System

The CLI uses a comprehensive TypeScript functional registry system that provides:

- **Schema Validation**: Ensures registry items conform to the expected format
- **Dependency Resolution**: Handles both npm and registry dependencies
- **File Processing**: Manages file creation, path replacements, and content transformation
- **Configuration Management**: Handles CSS variables and TypeScript paths

### Key Components

- **RegistryProcessor**: Handles file processing, dependency installation, and content transformation
- **Schema Validation**: Validates registry items against the schema
- **Dependency Tree**: Builds and resolves dependency trees for complex component relationships

## Configuration

### components.json

The CLI uses a `components.json` file for configuration:

```json
{
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.ts",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

### TypeScript Paths

The CLI automatically configures TypeScript path mappings for convenient imports:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Development

### Building

```bash
npm run build
```

### Type Checking

```bash
npm run typecheck
```

### Development Mode

```bash
npm run dev
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT
