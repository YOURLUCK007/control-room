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

export function agentBaseUrl(host: string, port = 8765) {
  const clean = host.trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(clean)) return clean;
  return `http://${clean}:${port}`;
}

function requestId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function requestJson<T>(url: string, init: RequestInit, timeoutMs = 5000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const body = (await response.json()) as T & { message?: string };
    if (!response.ok) throw new Error(body.message ?? `Agent request failed (${response.status}).`);
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export async function pairWithAgent(host: string, port: number, code: string) {
  return requestJson<AgentPairResult>(`${agentBaseUrl(host, port)}/pair`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() }),
  });
}

export async function checkAgent(host: string, port = 8765) {
  return requestJson<{ ok: boolean; name: string; protocol: string }>(`${agentBaseUrl(host, port)}/health`, {
    method: 'GET',
  }, 3500);
}

export async function sendNaturalLanguageCommand(host: string, port: number, token: string, text: string, confirm = false) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return requestJson<AgentCommandResult>(`${agentBaseUrl(host, port)}/command`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Laptop-Remote-Timestamp': timestamp,
      'X-Laptop-Remote-Nonce': requestId(),
    },
    body: JSON.stringify({
      request_id: requestId(),
      action: 'NATURAL_LANGUAGE',
      parameters: { text },
      confirm,
    }),
  });
}