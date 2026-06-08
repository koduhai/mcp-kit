/**
 * API versioning for MCP servers: pin the upstream API version, send it on every
 * request, expose it to the agent via a `get_version` tool, and detect drift between
 * the version your server speaks and the API's current version.
 */

export interface VersioningOptions {
  /** Header used to send the pinned version upstream, e.g. `Api-Version` or `Koduh-Version`. */
  header: string;
  /** The version this server pins and sends. */
  version: string;
  /** The API's current/latest version, if known. Used to flag drift. */
  current?: string;
  /** Versions this server is known-compatible with. If set, `version` must be one of them. */
  supported?: string[];
}

export interface DriftInfo {
  /** True when the pinned version differs from the API's current version. */
  behind: boolean;
  /** True when `supported` is set and the pinned version is not in it. */
  unsupported: boolean;
  /** A human-readable warning, or null when everything lines up. */
  message: string | null;
}

export interface Versioning {
  readonly header: string;
  readonly version: string;
  readonly current?: string;
  readonly supported?: readonly string[];
  /** Headers to merge into upstream requests (a `HeaderSource` for `createUpstreamFetch`). */
  headers(): Record<string, string>;
  /** Evaluate drift between the pinned version and the API's current version. */
  drift(): DriftInfo;
}

/** Build a {@link Versioning} from options. Throws if the pinned version is unsupported. */
export function apiVersioning(opts: VersioningOptions): Versioning {
  if (!opts.header) throw new Error('apiVersioning: `header` is required');
  if (!opts.version) throw new Error('apiVersioning: `version` is required');
  if (opts.supported && !opts.supported.includes(opts.version)) {
    throw new Error(
      `apiVersioning: pinned version "${opts.version}" is not in supported [${opts.supported.join(', ')}]`,
    );
  }
  const header = opts.header;
  const value = opts.version;

  return {
    header,
    version: opts.version,
    current: opts.current,
    supported: opts.supported,
    headers: () => ({ [header]: value }),
    drift(): DriftInfo {
      const behind = opts.current != null && opts.current !== opts.version;
      const unsupported = opts.supported != null && !opts.supported.includes(opts.version);
      let message: string | null = null;
      if (unsupported) {
        message = `pinned API version ${opts.version} is not in the supported set [${(opts.supported ?? []).join(', ')}]`;
      } else if (behind) {
        message = `pinned API version ${opts.version} is behind the current API version ${opts.current}`;
      }
      return { behind, unsupported, message };
    },
  };
}

/** A transport-agnostic tool definition you can register on any MCP server. */
export interface ToolDescriptor {
  name: string;
  description: string;
  /** JSON Schema for the tool input. */
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown;
}

/**
 * A `get_version` tool that reports which API version the server speaks. Agents
 * (and humans debugging) constantly need this; surfacing it removes a class of
 * "why is the response shaped differently" confusion.
 */
export function versionTool(v: Versioning, name = 'get_version'): ToolDescriptor {
  return {
    name,
    description:
      'Report the upstream API version this MCP server is pinned to, the header it is sent in, ' +
      'the current API version (if known), and whether the two have drifted.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    handler: () => {
      const drift = v.drift();
      return {
        version: v.version,
        header: v.header,
        current: v.current ?? null,
        supported: v.supported ?? null,
        drift: drift.message,
      };
    },
  };
}
