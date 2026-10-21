export type AgentPairResult = {
  success: boolean;
  access_token?: string;
  computer?: { id: string; name: string; os: string };
  message?: string;
};

export type AgentCommandResult = {
  success: boolean;
  message: string;
  requires_confirmation?: boolean;
  unsupported?: boolean;
  data?: Record<string, unknown>;
};

export type AgentAction =
  | 'NATURAL_LANGUAGE'
  | 'SYSTEM_INFO'
  | 'LIST_FILES'
  | 'READ_FILE'
  | 'WRITE_FILE'
  | 'RUN_COMMAND';

export function isPrivateLanHost(input: string) {
  let host = input.trim();
  if (/^https?:\/\//i.test(host)) {
    const match = host.match(/^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::\d+)?(?:[/?#]|$)/i);
    if (!match) return false;
    host = match[1];
  }
  host = host.replace(/^\[|\]$/g, '').split('%')[0].replace(/\.$/, '').toLowerCase();
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

export function agentBaseUrl(host: string, port = 8765, localOnly = true) {
  const clean = host.trim().replace(/\/+$/, '');
  if (localOnly && !isPrivateLanHost(clean)) {
    throw new Error('Local-only mode blocked this host. Use a private LAN address or turn off Local-only mode in Settings.');
  }
  if (!localOnly && !isPrivateLanHost(clean) && !/^https:\/\//i.test(clean)) {
    throw new Error('Non-local hosts require an https:// address so the paired token is not sent over plaintext.');
  }
  if (/^https?:\/\//i.test(clean)) {
    const authority = clean.match(/^https?:\/\/(\[[^\]]+\]|[^/:?#]+)(?::(\d+))?/i);
    if (authority && !authority[2]) return `${authority[0]}:${port}${clean.slice(authority[0].length)}`;
    return clean;
  }
  return `http://${clean}:${port}`;
}

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs = 5000, acceptErrorResponse = false): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json()) as T & { message?: string };
    if (!response.ok && !acceptErrorResponse) throw new Error(body.message ?? `Agent request failed (${response.status}).`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function pairWithAgent(host: string, port: number, code: string, localOnly = true) {
  return requestJson<AgentPairResult>(`${agentBaseUrl(host, port, localOnly)}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  });
}

export async function checkAgent(host: string, port = 8765, localOnly = true) {
  return requestJson<{ ok: boolean; name: string; protocol: string }>(`${agentBaseUrl(host, port, localOnly)}/health`, {
    method: 'GET',
  }, 3500);
}

export async function sendNaturalLanguageCommand(host: string, port: number, token: string, text: string, confirm = false, localOnly = true) {
  return sendAgentAction(host, port, token, 'NATURAL_LANGUAGE', { text }, confirm, localOnly);
}

export async function sendAgentAction(
  host: string,
  port: number,
  token: string,
  action: AgentAction,
  parameters: Record<string, unknown>,
  confirm = false,
  localOnly = true,
) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return requestJson<AgentCommandResult>(`${agentBaseUrl(host, port, localOnly)}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Laptop-Remote-Timestamp': timestamp,
      'X-Laptop-Remote-Nonce': requestId(),
    },
    body: JSON.stringify({
      request_id: requestId(),
      action,
      parameters,
      confirm,
    }),
  }, action === 'RUN_COMMAND' ? 25_000 : 5000, true);
}