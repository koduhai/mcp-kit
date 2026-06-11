# Contributing to @koduhai/mcp-kit

Thanks for taking the time to contribute. This project aims to be small, sharp, and
dependable, so the bar is "boring and well-tested" rather than "clever". The guide
below should get you from clone to merged PR with no surprises.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting started

Requirements: **Node.js >= 18** and npm.

```bash
git clone https://github.com/koduhai/mcp-kit.git
cd mcp-kit
npm install
```

Verify your checkout is healthy before changing anything:

```bash
npm run check   # typecheck + lint + format:check + test, the same gates CI runs
```

## Project layout

```
src/
  upstream/     # zero-dep: how your server authenticates to the API it wraps
  versioning/   # zero-dep: pin/send an API version, expose get_version
  auth/         # server-side OAuth 2.1 Resource Server helpers (optional peers)
  index.ts      # root entry: re-exports the zero-dep modules
examples/       # runnable reference servers (stdio + remote OAuth)
```

Each module has a colocated `*.test.ts`. The library has **zero runtime dependencies**
in `/upstream` and `/versioning`; `/auth`'s peers (`@modelcontextprotocol/sdk`,
`express`, `jose`) are declared **optional** so the lightweight paths stay light. Please
keep it that way — see [Design principles](#design-principles).

## Development workflow

| Command                | What it does                       |
| ---------------------- | ---------------------------------- |
| `npm test`             | Run the vitest suite once          |
| `npm run test:watch`   | Run vitest in watch mode           |
| `npm run typecheck`    | `tsc --noEmit` (strict)            |
| `npm run lint`         | ESLint over `src` + `examples`     |
| `npm run format`       | Apply Prettier formatting          |
| `npm run format:check` | Verify formatting (what CI checks) |
| `npm run build`        | Emit `dist/` via `tsc`             |
| `npm run check`        | All of the above gates in one shot |

## Making a change

1. **Branch off `main`.** Use `<type>/<short-kebab-description>`, where `<type>` is one
   of `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `ci`, `build`
   (e.g. `feat/introspection-caching`).
2. **Write a test first** when fixing a bug or adding behavior. Network calls and clocks
   are injectable throughout the codebase — tests run fully offline, so reach for an
   injected `fetch`/`now` rather than mocking globals.
3. **Keep the diff minimal and focused.** One logical change per PR.
4. **Run `npm run check`** and make sure it's green.
5. **Update docs** (`README.md`) and **`CHANGELOG.md`** under `## [Unreleased]` if your
   change is user-visible.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/) for subjects:

```
<type>: <imperative summary>
```

e.g. `fix: refresh client-credentials token before exp, not after`. Keep the subject
under ~72 characters and use the body to explain **why**, not just what.

## Opening a pull request

- Fill out the PR template (it's short).
- Link any related issue (`Closes #123`).
- Make sure CI is green. PRs are gated on lint, format, typecheck, build, and the test
  suite across Node 18 / 20 / 22.
- A maintainer will review. Small, well-tested PRs get merged fastest.

## Design principles

These are the things a reviewer will push back on, so they're worth stating up front:

- **No needless dependencies.** `/upstream` and `/versioning` must stay dependency-free.
  Don't add a package for something a few lines of standard JS can do.
- **Inject side effects.** Anything that touches the network or the clock takes an
  injectable `fetch`/`now`, so it stays testable offline.
- **Spec-faithful auth.** The `/auth` module follows the MCP 2025-06-18 authorization
  spec: an MCP server is a Resource Server (it verifies tokens, serves RFC 9728
  metadata), never an Authorization Server. Changes here should cite the relevant spec.
- **Strict TypeScript, no `any`** in library code unless there's a justified, commented
  reason.

## Reporting bugs and requesting features

Open an [issue](https://github.com/koduhai/mcp-kit/issues) using the templates. For
**security** vulnerabilities, do **not** open a public issue — see
[SECURITY.md](./SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](./LICENSE) that covers this project.
