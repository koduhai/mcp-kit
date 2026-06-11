# Contributing to @koduhai/mcp-kit

Thanks for taking the time to contribute. This project aims to be small, sharp, and
dependable, so the bar is "boring and well-tested" rather than "clever". The guide
below should get you from clone to merged PR with no surprises.

By participating you agree to abide by our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Getting started

Requirements: **Node.js >= 20** and npm.

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
  server/       # serveTools: mount ToolDescriptors on an MCP Server (optional peer)
  internal/     # shared, non-exported helpers (fetch timeout/retry)
  index.ts      # root entry: re-exports the zero-dep modules
examples/       # reference servers (stdio + remote OAuth), typechecked in CI
```

Each module has a colocated `*.test.ts`. The library has **zero runtime dependencies**
in `/upstream` and `/versioning`; `/auth`'s peers (`@modelcontextprotocol/sdk`,
`express`, `jose`) are declared **optional** so the lightweight paths stay light. Please
keep it that way — see [Design principles](#design-principles).

## Development workflow

| Command                 | What it does                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `npm test`              | Run the vitest suite once                                            |
| `npm run test:watch`    | Run vitest in watch mode                                             |
| `npm run typecheck`     | `tsc --noEmit` (strict)                                              |
| `npm run lint`          | ESLint over `src` + `examples`                                       |
| `npm run format`        | Apply Prettier formatting                                            |
| `npm run format:check`  | Verify formatting (what CI checks)                                   |
| `npm run build`         | Emit `dist/` via `tsc`                                               |
| `npm run check`         | typecheck + lint + format:check + test, in one shot                  |
| `npm run test:coverage` | Run tests with coverage + thresholds                                 |
| `npm run check:exports` | Validate the published package (publint + attw); needs a build first |
| `npm run docs`          | Generate the TypeDoc API reference                                   |

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

## Commit messages and PR titles

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <imperative summary>
```

Allowed `<type>`s: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `ci`,
`build`. Keep the subject under ~72 characters, start it lowercase, no trailing period,
and use the body to explain **why** (e.g. `fix: refresh client-credentials token before exp, not after`).

**The PR title is what matters most.** PRs are **squash-merged**, so the PR title becomes
the single commit on `main` — and our release tooling ([release-please](https://github.com/googleapis/release-please))
turns those commits into the version bump and `CHANGELOG.md` entry:

- `fix:` → patch release · `feat:` → minor release · `feat!:` / a `BREAKING CHANGE:`
  footer in the PR body → major release.
- `chore:`/`docs:`/`ci:`/etc. don't trigger a release on their own.

A CI check (**Validate PR title**) enforces the title, so a non-conforming title blocks
merge. A husky `commit-msg` hook (installed automatically by `npm install`) also runs
commitlint on each local commit — bypass it with `git commit --no-verify` if you need to.
Local commits are squashed on merge, so the PR title is what lands on `main`.

## Opening a pull request

- Give the PR a Conventional-Commits title (see above) — it's the commit + release note.
- Fill out the PR template (it's short) and link any related issue (`Closes #123`).
- Make sure CI is green. PRs are gated on PR-title validation, lint, format, typecheck,
  build, the test suite across Node 20 / 22 / 24, coverage thresholds, and package
  (publint/attw) checks.
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
