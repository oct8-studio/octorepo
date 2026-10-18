{
  "extends": "{{scope}}/config/tsconfig.node.json",
  "compilerOptions": {
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "target": "ES2023",
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "isolatedModules": false,
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "test"]
}
