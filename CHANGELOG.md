# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.3.0](https://github.com/koduhai/mcp-kit/compare/mcp-kit-v0.2.0...mcp-kit-v0.3.0) (2026-06-11)


### Features

* honor Retry-After + make JWKS path testable ([cfdbecc](https://github.com/koduhai/mcp-kit/commit/cfdbecc242a5498c3d8d9a020cb1a3f717ba8c31))
* honor Retry-After and make JWKS path testable ([3dcf6a3](https://github.com/koduhai/mcp-kit/commit/3dcf6a3e55c1d87b7663607ccdd86fbb5bb4701d))


### Bug Fixes

* upgrade npm in release job for OIDC trusted publishing ([0e0090f](https://github.com/koduhai/mcp-kit/commit/0e0090fe9c61b0ccd2f03d532ee8bc1af2cfbb18))
* upgrade npm in release job for OIDC trusted publishing ([cc3b16a](https://github.com/koduhai/mcp-kit/commit/cc3b16a2453df8d78f79d70d630b542c3917baa7))

## [0.2.0](https://github.com/koduhai/mcp-kit/compare/mcp-kit-v0.1.0...mcp-kit-v0.2.0) (2026-06-11)


### Features

* /server entry point, typed token errors, opt-in retry ([a667566](https://github.com/koduhai/mcp-kit/commit/a667566979f9a03e9d8077921bc2dabaa1ba96d0))
* add /server entry point, typed token errors, and retry ([5bbab1f](https://github.com/koduhai/mcp-kit/commit/5bbab1fd41a27026798e8380d7184414e39d68bb))
* add timeouts to the library's outbound calls ([686b4ec](https://github.com/koduhai/mcp-kit/commit/686b4ec8c285b6a1d5b9c38820e71dca3d12512a))
* cache introspection results to cut AS round trips ([9009aeb](https://github.com/koduhai/mcp-kit/commit/9009aebe0fbbf6ee081884ce6b8821e7ad5caa1c))
* mcp-kit — auth and versioning for MCP servers ([8115e1c](https://github.com/koduhai/mcp-kit/commit/8115e1c071ffeecc1881da6dc4a168af2fc3f477))
* outbound resilience — request timeouts + introspection caching ([5a740ae](https://github.com/koduhai/mcp-kit/commit/5a740ae9feb3303e8542db87a7e7cdf4446cf518))


### Bug Fixes

* require Node &gt;= 20 ([20a9554](https://github.com/koduhai/mcp-kit/commit/20a955481db2ba13b57595b66745336e19622ea1))

## [Unreleased]

## [0.1.0]

Initial release.

- **Upstream auth** (`/upstream`): API key, bearer, and OAuth 2.0
  client-credentials auth with token caching/refresh, plus `createUpstreamFetch`.
- **Versioning** (`/versioning`): pin an upstream API version, send it on every
  request, and expose a `get_version` tool with drift detection.
- **Server OAuth** (`/auth`): one-call OAuth 2.1 Resource Server with JWKS and
  introspection token verifiers and RFC 9728 Protected Resource Metadata.

[Unreleased]: https://github.com/koduhai/mcp-kit/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/koduhai/mcp-kit/releases/tag/v0.1.0
