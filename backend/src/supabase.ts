import type { Env } from "./types";

/** Default subrequest timeout (v1.2.268) — a wedged upstream must never
 * hang the worker forever. Converts hangs into errors so the surrounding
 * fallback chains can degrade gracefully. 15s covers any sane REST op. */
const REST_TIMEOUT_MS = 15_000;

/**
 * Supabase REST helper — uses PostgREST API directly
 * (no client library needed in Cloudflare Workers)
 */
export class SupabaseClient {
  private url: string;
  private key: string;

  constructor(env: Env) {
    this.url = env.SUPABASE_URL;
    this.key = env.SUPABASE_SERVICE_KEY;
  }

  async from(table: string): Promise<SupabaseQueryBuilder> {
    return new SupabaseQueryBuilder(table, this.url, this.key);
  }

  async rpc(fn: string, params: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.url}/rest/v1/rpc/${fn}`, {
      method: "POST",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(params),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase RPC error (${res.status}): ${err}`);
    }
    // Some RPC functions return VOID (empty body).
    // res.json() throws on empty → "Unexpected end of JSON input".
    // Read as text first; only parse if non-empty.
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }
}

class SupabaseQueryBuilder {
  private table: string;
  private url: string;
  private key: string;
  private _select: string = "*";
  private _filters: string[] = [];
  private _order: string = "";
  private _limit: number = 0;

  constructor(table: string, url: string, key: string) {
    this.table = table;
    this.url = url;
    this.key = key;
  }

  select(columns: string = "*"): this {
    this._select = columns;
    return this;
  }

  eq(column: string, value: unknown): this {
    this._filters.push(`${column}=eq.${encodeURIComponent(String(value))}`);
    return this;
  }

  order(column: string, ascending: boolean = true): this {
    this._order = `&order=${column}.${ascending ? "asc" : "desc"}`;
    return this;
  }

  /**
   * Filter where column value is in the provided array (PostgREST `in` operator).
   * Used for cross-device queries (multiple visitor_ids).
   */
  in(column: string, values: string[]): this {
    const encoded = values.map((v) => encodeURIComponent(String(v))).join(",");
    this._filters.push(`${column}=in.(${encoded})`);
    return this;
  }

  limit(count: number): this {
    this._limit = count;
    return this;
  }

  private buildUrl(): string {
    let url = `${this.url}/rest/v1/${this.table}?select=${this._select}`;
    for (const f of this._filters) {
      url += `&${f}`;
    }
    if (this._order) url += this._order;
    if (this._limit > 0) url += `&limit=${this._limit}`;
    return url;
  }

  async get<T>(): Promise<T[]> {
    const res = await fetch(this.buildUrl(), {
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase GET error (${res.status}): ${err}`);
    }
    return res.json();
  }

  async insert<T>(
    data: Record<string, unknown> | Record<string, unknown>[],
  ): Promise<T[]> {
    const res = await fetch(`${this.url}/rest/v1/${this.table}`, {
      method: "POST",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase INSERT error (${res.status}): ${err}`);
    }
    return res.json();
  }

  /**
   * Upsert: insert or update on conflict. PostgREST uses the
   * Prefer: resolution=merge-duplicates header to enable upsert behavior.
   * onConflict specifies the unique column(s) to detect conflicts on.
   */
  async upsert<T>(
    data: Record<string, unknown> | Record<string, unknown>[],
    onConflict?: string,
  ): Promise<T[]> {
    const preferHeader = onConflict
      ? `return=representation,resolution=merge-duplicates,handling=${onConflict}`
      : "return=representation,resolution=merge-duplicates";
    const res = await fetch(`${this.url}/rest/v1/${this.table}`, {
      method: "POST",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: preferHeader,
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase UPSERT error (${res.status}): ${err}`);
    }
    return res.json();
  }

  async update<T>(data: Record<string, unknown>): Promise<T[]> {
    let url = `${this.url}/rest/v1/${this.table}?`;
    for (const f of this._filters) {
      url += `${f}&`;
    }
    const res = await fetch(url, {
      method: "PATCH",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase UPDATE error (${res.status}): ${err}`);
    }
    return res.json();
  }

  async updateEmbedding<T>(embedding: number[]): Promise<T[]> {
    let url = `${this.url}/rest/v1/${this.table}?`;
    for (const f of this._filters) {
      url += `${f}&`;
    }
    // PostgREST requires the vector as a string in the format [0.1,0.2,...]
    const res = await fetch(url, {
      method: "PATCH",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ embedding: `[${embedding.join(",")}]` }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(
        `Supabase UPDATE EMBEDDING error (${res.status}): ${err}`,
      );
    }
    return res.json();
  }

  /** DELETE rows matching the accumulated filters (PostgREST). Used by the
   *  neighbor-thread consolidation to remove duplicate tasks/entities. */
  async delete(): Promise<void> {
    let url = `${this.url}/rest/v1/${this.table}?`;
    for (const f of this._filters) {
      url += `${f}&`;
    }
    const res = await fetch(url, {
      method: "DELETE",
      signal: AbortSignal.timeout(REST_TIMEOUT_MS),
      headers: {
        apikey: this.key,
        Authorization: `Bearer ${this.key}`,
        Prefer: "return=representation",
      },
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Supabase DELETE error (${res.status}): ${err}`);
    }
  }
}
