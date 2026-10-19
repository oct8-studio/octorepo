{
  "extends": "{{scope}}/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "types": ["node", "@solidjs/start/env"],
    "noEmit": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
