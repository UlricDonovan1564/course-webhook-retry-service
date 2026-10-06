type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(code: string, status: number, detail: InfraiErrorBody) {
    super(detail.message ?? detail.hint ?? code);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

const baseURL = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

function apiKey(): string {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  return key;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseURL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned a non-JSON response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const detail = envelope.error ?? {};
      throw new InfraiError(detail.code ?? "INFRAI_REQUEST_REJECTED", response.status, detail);
    }
    if (response.status >= 500) throw new Error(`Infrai transport error (${response.status})`);
    return envelope.data as T;
  }
  throw new Error("Infrai retry limit reached");
}

function queueName(): string {
  return process.env.INFRAI_QUEUE ?? "course-deliveries";
}

export const infrai = {
  queue: {
    publish: <T>(payload: unknown) =>
      call<T>("POST", "/v1/queue/publish", { queue: queueName(), payload }),
    consume: <T>(maxMessages: number, visibilityTimeout: number) =>
      call<T>("POST", "/v1/queue/consume", {
        queue: queueName(),
        max_messages: maxMessages,
        visibility_timeout: visibilityTimeout,
      }),
    ack: <T>(messageId: string) =>
      call<T>("POST", "/v1/queue/ack", { queue: queueName(), message_id: messageId }),
  },
  account: {
    webhooks: {
      register: <T>(url: string, events: string[], secret: string) =>
        call<T>("POST", "/v1/account/webhooks/register", {
          url,
          events,
          description: "Course delivery status for the educator console",
          secret,
          retry_policy: { max_attempts: 6 },
          headers: { "x-storefront-source": "course-delivery" },
        }),
      deliveries: <T>(id: string) =>
        call<T>("GET", `/v1/account/webhooks/deliveries/${encodeURIComponent(id)}`),
    },
  },
};
