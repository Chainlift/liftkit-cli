// Registry process/fetch/build logic
import type {
	RegistrySchema,
	RegistryItem,
	RegistryIndex,
	DependencyNode,
	EnhancedSchemaProcessor,
	SchemaProcessor,
} from './registry-types.js';

// Schema fetching
export const fetchSchema = async (
	url: string = 'https://ui.shadcn.com/schema/registry-item.json',
): Promise<RegistrySchema> => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch schema: ${response.status} ${response.statusText}`,
		);
	}
	return response.json();
};

// Fetch registry index
export const fetchRegistryIndex = async (
	baseUrl: string = 'https://ui.shadcn.com/registry',
): Promise<RegistryIndex> => {
	const response = await fetch(`${baseUrl}/index.json`);
	if (!response.ok) {
		throw new Error(`Failed to fetch registry index: ${response.status}`);
	}
	return response.json();
};

// Fetch individual registry item
export const fetchRegistryItem = async (
	name: string,
	baseUrl: string = 'https://ui.shadcn.com/registry',
): Promise<RegistryItem> => {
	const response = await fetch(`${baseUrl}/${name}.json`);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch registry item '${name}': ${response.status}`,
		);
	}
	return response.json();
};

// Batch fetch registry items
export const fetchRegistryItems = async (
	names: string[],
	baseUrl?: string,
): Promise<RegistryItem[]> => {
	const fetchPromises = names.map(name => fetchRegistryItem(name, baseUrl));
	return Promise.all(fetchPromises);
};

// Dependency resolution utilities
export const extractRegistryDependencies = (item: RegistryItem): string[] =>
	item.registryDependencies || [];
export const extractNpmDependencies = (item: RegistryItem): string[] => [
	...(item.dependencies || []),
	...(item.devDependencies || []),
];

// Build dependency tree
export const buildDependencyTree = async (
	rootItemName: string,
	baseUrl: string = 'https://ui.shadcn.com/registry',
	visited: Set<string> = new Set(),
	depth: number = 0,
): Promise<DependencyNode> => {
	if (visited.has(rootItemName)) {
		throw new Error(`Circular dependency detected: ${rootItemName}`);
	}
	visited.add(rootItemName);
	const rootItem = await fetchRegistryItem(rootItemName, baseUrl);
	const registryDeps = extractRegistryDependencies(rootItem);
	const depNodes = await Promise.all(
		registryDeps.map(depName =>
			buildDependencyTree(depName, baseUrl, new Set(visited), depth + 1),
		),
	);
	return {
		name: rootItemName,
		item: rootItem,
		dependencies: [],
		registryDependencies: depNodes,
		depth,
	};
};

// Flatten dependency tree
export const flattenDependencyTree = (tree: DependencyNode): RegistryItem[] => {
	const items: RegistryItem[] = [];
	const visited = new Set<string>();
	const traverse = (node: DependencyNode): void => {
		switch (visited.has(node.name)) {
			case false:
				visited.add(node.name);
				items.push(node.item);
				node.registryDependencies.forEach(traverse);
				break;
			default:
				break;
		}
	};
	traverse(tree);
	return items;
};

// Get all dependencies (including transitive)
export const getAllDependencies = (tree: DependencyNode) => {
	const allItems = flattenDependencyTree(tree);
	const registryDeps = new Set<string>();
	const npmDeps = new Set<string>();
	allItems.forEach(item => {
		extractRegistryDependencies(item).forEach(dep => registryDeps.add(dep));
		extractNpmDependencies(item).forEach(dep => npmDeps.add(dep));
	});
	return {
		registryDependencies: Array.from(registryDeps),
		npmDependencies: Array.from(npmDeps),
		allItems,
	};
};

// Calculate installation order (topological sort)
export const calculateInstallationOrder = (
	tree: DependencyNode,
): RegistryItem[] => {
	const result: RegistryItem[] = [];
	const visited = new Set<string>();
	const visit = (node: DependencyNode): void => {
		switch (visited.has(node.name)) {
			case true:
				return;
			default:
				break;
		}
		node.registryDependencies.forEach(visit);
		visited.add(node.name);
		result.push(node.item);
	};
	visit(tree);
	return result;
};

// Enhanced registry processor with dependency resolution
export const createEnhancedSchemaProcessor = async (
	schema: RegistrySchema,
	baseUrl?: string,
): Promise<EnhancedSchemaProcessor> => {
	const {createSchemaProcessor} = await import('./registry-utils.js');
	const baseProcessor: SchemaProcessor = createSchemaProcessor(schema);
	return {
		...baseProcessor,
		fetchItem: (name: string) => fetchRegistryItem(name, baseUrl),
		fetchItems: (names: string[]) => fetchRegistryItems(names, baseUrl),
		buildDependencyTree: async (itemName: string) => {
			const root = await buildDependencyTree(itemName, baseUrl);
			const allNodes = new Map<string, DependencyNode>();
			const collectNodes = (node: DependencyNode): void => {
				allNodes.set(node.name, node);
				node.registryDependencies.forEach(collectNodes);
			};
			collectNodes(root);
			return {
				root,
				allNodes,
				flatDependencies: flattenDependencyTree(root),
			};
		},
		getInstallationOrder: async (itemName: string) => {
			const root = await buildDependencyTree(itemName, baseUrl);
			return calculateInstallationOrder(root);
		},
		getAllDependencies: async (itemName: string) => {
			const root = await buildDependencyTree(itemName, baseUrl);
			return getAllDependencies(root);
		},
		fetchIndex: () => fetchRegistryIndex(baseUrl),
	};
};

// Main API functions
export const processRegistry = async (
	url?: string,
): Promise<SchemaProcessor> => {
	const schema = await fetchSchema(url);
	const {createSchemaProcessor} = await import('./registry-utils.js');
	return createSchemaProcessor(schema);
};

export const processRegistryWithDependencies = async (
	schemaUrl: string = 'https://ui.shadcn.com/schema/registry-item.json',
	registryBaseUrl: string = 'https://ui.shadcn.com/registry',
): Promise<EnhancedSchemaProcessor> => {
	const schema = await fetchSchema(schemaUrl);
	return createEnhancedSchemaProcessor(schema, registryBaseUrl);
};
