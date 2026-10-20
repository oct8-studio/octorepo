{
  "extends": "{{scope}}/config/tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
