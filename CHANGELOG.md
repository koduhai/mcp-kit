# Changelog

All notable changes to this project are documented in this file. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
