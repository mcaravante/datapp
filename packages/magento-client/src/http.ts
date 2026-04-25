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

    return await pRetry(async () => this.attempt<T>(url), {
      retries: this.retries,
      minTimeout: 500,
      maxTimeout: 5_000,
      factor: 2,
    });
  }

  private async attempt<T>(url: string): Promise<T> {
    await this.acquireSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${this.adminToken}`,
          accept: 'application/json',
        },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    const body = await res.text();
    if (res.status >= 200 && res.status < 300) {
      try {
        return JSON.parse(body) as T;
      } catch (err) {
        throw new AbortError(`Magento returned non-JSON 2xx body for ${url}: ${String(err)}`);
      }
    }

    // 4xx (except 429) are non-retryable — the request itself is wrong.
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      throw new AbortError(this.formatError(url, res.status, body));
    }

    // 5xx and 429 → retryable
    throw new MagentoApiError(this.formatError(url, res.status, body), res.status, url, body);
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
