export interface TsConfigJson {
  compilerOptions: {
    paths: {
      [key: string]: string[];
    };
    [key: string]: string[] | string | number | boolean | object | undefined;
  };
  [key: string]: string[] | string | number | boolean | object | undefined;
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
