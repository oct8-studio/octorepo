{
  "extends": "{{scope}}/config/tsconfig.react.json",
  "compilerOptions": { "noEmit": true, "types": ["node", "vite/client"] },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
