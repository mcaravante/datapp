import pRetry, { AbortError } from 'p-retry';

/** Subset of {@link MagentoClientOptions} needed to drive the HTTP layer. */
export interface HttpOptions {
  baseUrl: string;
  adminToken: string;
  /**
   * Maximum requests per second sent against the Magento store. Magento's
   * default rate limit is 4 rps; tune via `MAGENTO_RATE_LIMIT_RPS`.
   */
  rateLimitRps: number;
  /** Per-attempt request timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Number of retry attempts on 5xx / network errors. Default 3. */
  retries?: number;
  /** Inject a custom fetch (for tests). Defaults to global fetch. */
  fetch?: typeof globalThis.fetch;
}

export class MagentoApiError extends Error {
  override readonly name = 'MagentoApiError';
  constructor(
    message: string,
    readonly status: number,
    readonly url: string,
    readonly body: string,
  ) {
    super(message);
  }
}

/**
 * Lean wrapper around `fetch` that:
 *   - applies bearer auth
 *   - throttles requests to a max rps (single-process token bucket)
 *   - retries 5xx / network errors with exponential backoff
 *   - parses JSON or throws a typed `MagentoApiError`
 *
 * NOTE: rate limiting is per-instance / per-process. When workers scale
 * out we'll move this to a Redis token bucket — see Iteration 4 / TODO.
 */
export class MagentoHttpClient {
  private readonly baseUrl: string;
  private readonly adminToken: string;
  private readonly minIntervalMs: number;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  /** Tail of the in-flight queue, used to serialize requests. */
  private gate: Promise<void> = Promise.resolve();

  constructor(options: HttpOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.adminToken = options.adminToken;
    this.minIntervalMs = Math.max(1, Math.ceil(1000 / options.rateLimitRps));
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.retries = options.retries ?? 3;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getJson<T>(path: string, params?: URLSearchParams): Promise<T> {
    const qs = params && params.toString().length > 0 ? `?${params.toString()}` : '';
    const url = `${this.baseUrl}${path}${qs}`;
    return await this.requestJson<T>('GET', url);
  }

  /** POST a JSON body. Used for sales-rule create / coupons/generate. */
  async postJson<T>(path: string, body: unknown): Promise<T> {
    return await this.requestJson<T>('POST', `${this.baseUrl}${path}`, body);
  }

  /** PUT a JSON body. Used for sales-rule update. */
  async putJson<T>(path: string, body: unknown): Promise<T> {
    return await this.requestJson<T>('PUT', `${this.baseUrl}${path}`, body);
  }

  /**
   * DELETE without body. Magento returns either `true` or a JSON object
   * (e.g. `coupons/deleteByIds` returns `{missing_items: [...]}`).
   */
  async deleteJson<T>(path: string): Promise<T> {
    return await this.requestJson<T>('DELETE', `${this.baseUrl}${path}`);
  }

  private async requestJson<T>(method: string, url: string, body?: unknown): Promise<T> {
    return await pRetry(async () => this.attempt<T>(method, url, body), {
      retries: this.retries,
      minTimeout: 500,
      maxTimeout: 5_000,
      factor: 2,
    });
  }

  private async attempt<T>(method: string, url: string, body?: unknown): Promise<T> {
    await this.acquireSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    const headers: Record<string, string> = {
      authorization: `Bearer ${this.adminToken}`,
      accept: 'application/json',
    };
    let bodyText: string | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      bodyText = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers,
        ...(bodyText !== undefined ? { body: bodyText } : {}),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const responseBody = await res.text();
    if (res.status >= 200 && res.status < 300) {
      // Empty 200/204 — Magento sometimes responds with "true" literal,
      // sometimes with an empty body for DELETE. Tolerate both.
      if (responseBody === '' || responseBody === 'null') {
        return null as unknown as T;
      }
      try {
        return JSON.parse(responseBody) as T;
      } catch (err) {
        throw new AbortError(`Magento returned non-JSON 2xx body for ${url}: ${String(err)}`);
      }
    }

    // 4xx (except 429) are non-retryable — the request itself is wrong.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new AbortError(this.formatError(url, res.status, responseBody));
    }

    // 5xx and 429 → retryable
    throw new MagentoApiError(
      this.formatError(url, res.status, responseBody),
      res.status,
      url,
      responseBody,
    );
  }

  /**
   * Acquire one rps slot. We chain promises so that calls execute in the
   * order they were made and no two run within `minIntervalMs`.
   */
  private async acquireSlot(): Promise<void> {
    const previous = this.gate;
    let release!: () => void;
    this.gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    setTimeout(release, this.minIntervalMs);
  }

  private formatError(url: string, status: number, body: string): string {
    const trimmed = body.length > 500 ? `${body.slice(0, 500)}...` : body;
    return `Magento ${status.toString()} for ${url}: ${trimmed}`;
  }
}
