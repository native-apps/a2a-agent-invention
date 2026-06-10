import type { Env } from "./types";

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
    return res.json();
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

  async update<T>(data: Record<string, unknown>): Promise<T[]> {
    let url = `${this.url}/rest/v1/${this.table}?`;
    for (const f of this._filters) {
      url += `${f}&`;
    }
    const res = await fetch(url, {
      method: "PATCH",
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
}
