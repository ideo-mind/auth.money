set shell := ["sh", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
#set allow-duplicate-recipe
set positional-arguments
set dotenv-filename := ".env"

set export


import? "local.Justfile"


dev:
  wrangler dev

types:
  wrangler types

deploy:
  bun run deploy


d: deploy

clean:
  find . -name "*.js"  -exec rm {} \;


kv name:
  bun wrangler kv namespace create {{name}} 

secret name value:
  #!/bin/bash
  echo -n "{{value}}" | bun wrangler secret put {{name}}