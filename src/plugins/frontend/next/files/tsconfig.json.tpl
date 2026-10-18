{
  "extends": "{{scope}}/config/tsconfig.react.json",
  "compilerOptions": {
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowJs": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "next.config.ts", "app", "src", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
