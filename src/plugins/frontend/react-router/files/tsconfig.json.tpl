{
  "extends": "{{scope}}/config/tsconfig.react.json",
  "compilerOptions": {
    "types": ["node", "vite/client"],
    "rootDirs": [".", "./.react-router/types"],
    "noEmit": true
  },
  "include": ["app", "src", "*.ts", ".react-router/types/**/*"]
}
