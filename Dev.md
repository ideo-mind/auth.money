# Setup

## IDE

VSCode: install recommended extensions in `.vscode/extensions.json`

# Low Level Design

The project follows the MVC pattern, with the database being Cloudflare KV store. Model definitions are abstracted, and controllers are defined in classes in the `db/` directory. API routes are organized in the `src/routes` directory, with each route having its own subdirectory. For example, the code for the `/authenticate` route can be found in `src/routes/authenticate/index.ts`.

Developers have the flexibility to use multiple files but should export from the specific `path/index.ts` package.
