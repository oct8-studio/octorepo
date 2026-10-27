# Renders docs/demo/octorepo.gif — run from the repo root: vhs docs/demo/demo.tape
Output docs/demo/octorepo.gif
Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 720
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms

Hide
Type "export PS1='$ ' && cd $(mktemp -d) && clear" Enter
Show

Type "octorepo create shop --preset saas --no-install --no-git" Sleep 400ms Enter
Sleep 3.5s
Type "cd shop && ls apps packages" Sleep 300ms Enter
Sleep 2s
Type "octorepo add app frontend store nuxt --uses api --no-install" Sleep 300ms Enter
Sleep 3s
Type "grep -E '^  [a-z-]+:$' docker-compose.yml" Sleep 300ms Enter
Sleep 3.5s
