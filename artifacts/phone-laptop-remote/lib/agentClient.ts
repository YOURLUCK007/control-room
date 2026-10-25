export type AgentScheme = 'http' | 'https';

/**
 * Everything needed to talk to a Windows agent. `scheme` is filled in once a
 * connection has succeeded so later requests go straight to the working
 * protocol instead of probing both.
 */
export type AgentTarget = {
  host: string;
  port: number;
  scheme?: AgentScheme;
  token?: string;
  localOnly: boolean;
};

export type AgentPairResult = {
  success: boolean;
  access_token?: string;
  computer?: { id: string; name: string; os: string };
  message?: string;
  scheme?: AgentScheme;
};

export type AgentHealth = {
  ok: boolean;
  name: string;
  agent?: string;
  protocol?: string;
  scheme?: AgentScheme;
  latencyMs?: number;
};

export type AgentCommandResult = {
  success: boolean;
  message: string;
  requires_confirmation?: boolean;
  unsupported?: boolean;
  data?: Record<string, unknown>;
  scheme?: AgentScheme;
};

export type AgentAction =
  | 'NATURAL_LANGUAGE'
  | 'SYSTEM_INFO'
  | 'LIST_FILES'
  | 'READ_FILE'
  | 'WRITE_FILE'
  | 'RUN_COMMAND';

export type AgentFailureCode = 'blocked' | 'unreachable' | 'timeout' | 'invalid-response';

export class AgentError extends Error {
  code: AgentFailureCode;

  constructor(code: AgentFailureCode, message: string) {
    super(message);
    this.name = 'AgentError';
    this.code = code;
  }
}

type ParsedHost = {
  hostname: string;
  scheme?: AgentScheme;
  port?: number;
};

/** Splits "https://192.168.1.4:8765/" into its parts without losing IPv6 brackets. */
export function parseAgentHost(input: string): ParsedHost {
  const trimmed = input.trim().replace(/\/+$/, '');
  const match = trimmed.match(/^(https?):\/\/(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i);
  if (match) {
    return {
      hostname: match[2].replace(/^\[|\]$/g, ''),
      scheme: match[1].toLowerCase() as AgentScheme,
      port: match[3] ? Number(match[3]) : undefined,
    };
  }
  return { hostname: trimmed.replace(/^\[|\]$/g, '') };
}

export function isPrivateLanHost(input: string) {
  const { hostname } = parseAgentHost(input);
  const host = hostname.split('%')[0].replace(/\.$/, '').toLowerCase();
  if (!host) return false;
  if (host === '::1' || host.startsWith('fe80:') || ((host.startsWith('fc') || host.startsWith('fd')) && host.includes(':'))) return true;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.lan') || host.endsWith('.home') || host.endsWith('.internal')) return true;
  if (!host.includes('.')) return /^[a-z0-9][a-z0-9-]*$/i.test(host);
  const ipv4 = host.split('.');
  if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const [first, second] = ipv4.map(Number);
    return first === 10
      || first === 127
      || (first === 192 && second === 168)
      || (first === 172 && second >= 16 && second <= 31)
      || (first === 169 && second === 254);
  }
  return false;
}

/** Builds the URL for a known protocol. Throws before building when policy forbids the host. */
export function agentUrl(target: AgentTarget, scheme: AgentScheme, path: string) {
  const parsed = parseAgentHost(target.host);
  const hostname = parsed.hostname;
  if (!hostname) throw new AgentError('blocked', 'Enter the laptop address before connecting.');
  const port = parsed.port ?? target.port;
  const host = hostname.includes(':') ? `[${hostname}]` : hostname;
  return `${scheme}://${host}:${port}${path}`;
}

function protocolsFor(target: AgentTarget): AgentScheme[] {
  const parsed = parseAgentHost(target.host);
  if (!parsed.hostname) throw new AgentError('blocked', 'Enter the laptop address before connecting.');
  const local = isPrivateLanHost(target.host);
  if (target.localOnly && !local) {
    throw new AgentError('blocked', 'Local-only mode blocked this host. Use a private LAN address or turn off Local-only mode in Settings.');
  }
  if (!local && !parsed.scheme) {
    throw new AgentError('blocked', 'Non-local hosts need an https:// address so the paired token is never sent in plaintext.');
  }
  if (parsed.scheme) return [parsed.scheme];
  if (target.scheme) return [target.scheme];
  if (!local) return ['https'];
  // A trusted LAN may run the agent with a self-signed certificate or in
  // --allow-insecure-dev mode, so try the encrypted endpoint first.
  return ['https', 'http'];
}

type RequestOptions = {
  timeoutMs?: number;
  /** When true an HTTP error status still returns the parsed JSON body. */
  returnErrorBody?: boolean;
};

type AgentResponse<T> = {
  body: T;
  scheme: AgentScheme;
  status: number;
};

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requestAgent<T>(
  target: AgentTarget,
  path: string,
  init: RequestInit,
  { timeoutMs = 6000, returnErrorBody = false }: RequestOptions = {},
): Promise<AgentResponse<T>> {
  const protocols = protocolsFor(target);
  let lastError: unknown = null;

  for (const scheme of protocols) {
    const url = agentUrl(target, scheme, path);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      const text = await response.text();
      let body: T & { message?: string };
      try {
        body = JSON.parse(text) as T & { message?: string };
      } catch {
        throw new AgentError('invalid-response', `${scheme.toUpperCase()} answered, but not like a Laptop Remote agent. Check the address and port.`);
      }
      if (!response.ok && !returnErrorBody) {
        throw new AgentError('invalid-response', body.message ?? `The agent rejected the request (${response.status}).`);
      }
      return { body, scheme, status: response.status };
    } catch (error) {
      lastError = error;
      if (error instanceof AgentError) throw error;
      // Fall back to the other protocol only when this attempt never returned.
      if ((error as Error)?.name !== 'AbortError') continue;
    } finally {
      clearTimeout(timer);
    }
  }

  if (lastError instanceof AgentError) throw lastError;
  if ((lastError as Error)?.name === 'AbortError') {
    throw new AgentError('timeout', `The laptop did not answer within ${Math.round(timeoutMs / 1000)} seconds. Make sure the agent is running and on the same network.`);
  }
  const detail = (lastError as Error)?.message;
  throw new AgentError(
    'unreachable',
    detail && !/network request failed|failed to fetch|networkerror/i.test(detail)
      ? detail
      : 'Could not reach the laptop agent. Check that its window is still open, the address and port are right, and both devices share the same network.',
  );
}

export async function pairWithAgent(target: AgentTarget, code: string) {
  const response = await requestAgent<AgentPairResult>(
    target,
    '/pair',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    },
    { timeoutMs: 8000, returnErrorBody: true },
  );
  return { ...response.body, scheme: response.scheme };
}

export async function checkAgent(target: AgentTarget) {
  const startedAt = Date.now();
  const response = await requestAgent<AgentHealth>(target, '/health', { method: 'GET' }, { timeoutMs: 4500 });
  return {
    ...response.body,
    scheme: response.scheme,
    latencyMs: Date.now() - startedAt,
  };
}

export async function sendNaturalLanguageCommand(target: AgentTarget, text: string, confirm = false) {
  return sendAgentAction(target, 'NATURAL_LANGUAGE', { text }, confirm);
}

export async function sendAgentAction(
  target: AgentTarget,
  action: AgentAction,
  parameters: Record<string, unknown>,
  confirm = false,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const response = await requestAgent<AgentCommandResult>(
    target,
    '/command',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${target.token ?? ''}`,
        'X-Laptop-Remote-Timestamp': timestamp,
        'X-Laptop-Remote-Nonce': requestId(),
      },
      body: JSON.stringify({ request_id: requestId(), action, parameters, confirm }),
    },
    { timeoutMs: action === 'RUN_COMMAND' ? 25_000 : 8000, returnErrorBody: true },
  );
  return { ...response.body, scheme: response.scheme };
}

/** Human-friendly text for the errors this module and fetch can raise. */
export function agentErrorMessage(error: unknown) {
  if (error instanceof AgentError) return error.message;
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'The laptop did not answer in time. Make sure the agent is running.';
    if (/network request failed|failed to fetch/i.test(error.message)) return 'No route to the laptop. Check Wi-Fi and that the agent is still running.';
    return error.message;
  }
  return 'The laptop could not be reached.';
}
