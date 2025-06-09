export interface TsConfigJson {
	compilerOptions: {
		paths: {
			[key: string]: string[];
		};
		[key: string]: any;
	};
	[key: string]: any;
}

export interface Config {
	repo: string;
	templaterepo: string;
	aliases: Record<string, string>;
	tsconfigjson: TsConfigJson;
}

export const config: Config = {
	repo: 'https://liftkit.pages.dev',
	templaterepo:
		'https://raw.githubusercontent.com/Chainlift/liftkit-template/refs/heads/main',
	aliases: {
		components: '@/components',
		utils: '@/lib/utils',
		ui: '@/components/ui',
		lib: '@/lib',
		hooks: '@/hooks',
	},
	tsconfigjson: {
		compilerOptions: {
			paths: {
				'@/*': ['./src/*'],
			},
		},
	}, 
};
