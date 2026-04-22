import { Pool } from "pg";
import type { Database } from "@/lib/db/types";

type QueryError = { message: string };
type QueryResult<T> = { data: T; error: QueryError | null };
type OrderOptions = { ascending?: boolean };
type UpsertOptions = { onConflict?: string };

type PublicTables = Database["public"]["Tables"];
type TableName = keyof PublicTables;
type RowOf<T extends TableName> = PublicTables[T]["Row"];
type InsertOf<T extends TableName> = PublicTables[T]["Insert"];
type UpdateOf<T extends TableName> = PublicTables[T]["Update"];

type Filter = { op: "eq"; column: string; value: unknown } | { op: "in"; column: string; values: unknown[] };

function getPool() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("Missing environment variable: DATABASE_URL");
  return new Pool({
    connectionString,
    max: 10,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });
}

const globalForDb = globalThis as unknown as { __mihPgPool?: Pool };
const pool = globalForDb.__mihPgPool ?? getPool();
if (!globalForDb.__mihPgPool) globalForDb.__mihPgPool = pool;

function quoteIdent(value: string) {
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function parseColumns(value: string | undefined) {
  if (!value || value.trim() === "*" || value.trim() === "") return "*";
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => quoteIdent(part))
    .join(", ");
}

class TableQuery<T extends TableName> {
  private readonly table: T;
  private mode: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private selectColumns = "*";
  private filters: Filter[] = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private rowLimit: number | null = null;
  private payload: InsertOf<T> | InsertOf<T>[] | UpdateOf<T> | null = null;
  private onConflict: string | null = null;
  private expectOne: "single" | "maybeSingle" | null = null;

  constructor(table: T) {
    this.table = table;
  }

  select(columns?: string) {
    this.selectColumns = parseColumns(columns);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push({ op: "in", column, values });
    return this;
  }

  order(column: string, options?: OrderOptions) {
    this.orderBy = { column, ascending: options?.ascending !== false };
    return this;
  }

  limit(value: number) {
    this.rowLimit = Math.max(0, Math.floor(value));
    return this;
  }

  insert(values: InsertOf<T> | InsertOf<T>[]) {
    this.mode = "insert";
    this.payload = values;
    return this;
  }

  upsert(values: InsertOf<T> | InsertOf<T>[], options?: UpsertOptions) {
    this.mode = "upsert";
    this.payload = values;
    this.onConflict = options?.onConflict?.trim() ?? null;
    return this;
  }

  update(values: UpdateOf<T>) {
    this.mode = "update";
    this.payload = values;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  single() {
    this.expectOne = "single";
    return this.executeSingle();
  }

  maybeSingle() {
    this.expectOne = "maybeSingle";
    return this.executeMaybeSingle();
  }

  then<TResult1 = QueryResult<RowOf<T>[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<RowOf<T>[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.executeMany().then(onfulfilled, onrejected);
  }

  private buildWhere(values: unknown[]) {
    if (!this.filters.length) return "";
    const chunks: string[] = [];
    for (const filter of this.filters) {
      if (filter.op === "eq") {
        values.push(filter.value);
        chunks.push(`${quoteIdent(filter.column)} = $${values.length}`);
      } else {
        if (!filter.values.length) {
          chunks.push("1=0");
          continue;
        }
        const refs: string[] = [];
        for (const entry of filter.values) {
          values.push(entry);
          refs.push(`$${values.length}`);
        }
        chunks.push(`${quoteIdent(filter.column)} IN (${refs.join(", ")})`);
      }
    }
    return ` WHERE ${chunks.join(" AND ")}`;
  }

  private async executeRaw() {
    const values: unknown[] = [];
    let sql = "";

    if (this.mode === "select") {
      sql = `SELECT ${this.selectColumns} FROM ${quoteIdent(this.table)}`;
      sql += this.buildWhere(values);
      if (this.orderBy) {
        sql += ` ORDER BY ${quoteIdent(this.orderBy.column)} ${this.orderBy.ascending ? "ASC" : "DESC"}`;
      }
      if (this.rowLimit !== null) {
        values.push(this.rowLimit);
        sql += ` LIMIT $${values.length}`;
      }
    } else if (this.mode === "insert" || this.mode === "upsert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as InsertOf<T>];
      if (!rows.length) throw new Error("insert payload empty");
      const keys = Object.keys(rows[0] as Record<string, unknown>);
      if (!keys.length) throw new Error("insert payload empty");
      const groups: string[] = [];
      for (const row of rows) {
        const refs: string[] = [];
        for (const key of keys) {
          values.push((row as Record<string, unknown>)[key]);
          refs.push(`$${values.length}`);
        }
        groups.push(`(${refs.join(", ")})`);
      }
      sql = `INSERT INTO ${quoteIdent(this.table)} (${keys.map(quoteIdent).join(", ")}) VALUES ${groups.join(", ")}`;
      if (this.mode === "upsert" && this.onConflict) {
        const conflictCols = this.onConflict
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);
        const updates = keys
          .filter((key) => !conflictCols.includes(key))
          .map((key) => `${quoteIdent(key)} = EXCLUDED.${quoteIdent(key)}`);
        if (updates.length) {
          sql += ` ON CONFLICT (${conflictCols.map(quoteIdent).join(", ")}) DO UPDATE SET ${updates.join(", ")}`;
        } else {
          sql += ` ON CONFLICT (${conflictCols.map(quoteIdent).join(", ")}) DO NOTHING`;
        }
      }
      sql += ` RETURNING ${this.selectColumns}`;
    } else if (this.mode === "update") {
      const payload = (this.payload ?? {}) as Record<string, unknown>;
      const keys = Object.keys(payload);
      if (!keys.length) throw new Error("update payload empty");
      const sets: string[] = [];
      for (const key of keys) {
        values.push(payload[key]);
        sets.push(`${quoteIdent(key)} = $${values.length}`);
      }
      sql = `UPDATE ${quoteIdent(this.table)} SET ${sets.join(", ")}`;
      sql += this.buildWhere(values);
      sql += ` RETURNING ${this.selectColumns}`;
    } else {
      sql = `DELETE FROM ${quoteIdent(this.table)}`;
      sql += this.buildWhere(values);
      if (this.selectColumns !== "*") {
        sql += ` RETURNING ${this.selectColumns}`;
      }
    }

    return pool.query(sql, values);
  }

  private async executeMany(): Promise<QueryResult<RowOf<T>[]>> {
    try {
      const res = await this.executeRaw();
      return { data: res.rows as RowOf<T>[], error: null };
    } catch (error) {
      return { data: [] as RowOf<T>[], error: { message: error instanceof Error ? error.message : "query failed" } };
    }
  }

  private async executeSingle(): Promise<QueryResult<RowOf<T>>> {
    try {
      const res = await this.executeRaw();
      if (res.rows.length !== 1) return { data: {} as RowOf<T>, error: { message: "Expected exactly one row" } };
      return { data: res.rows[0] as RowOf<T>, error: null };
    } catch (error) {
      return { data: {} as RowOf<T>, error: { message: error instanceof Error ? error.message : "query failed" } };
    }
  }

  private async executeMaybeSingle(): Promise<QueryResult<RowOf<T> | null>> {
    try {
      const res = await this.executeRaw();
      if (res.rows.length > 1) return { data: null, error: { message: "Expected at most one row" } };
      return { data: (res.rows[0] as RowOf<T>) ?? null, error: null };
    } catch (error) {
      return { data: null, error: { message: error instanceof Error ? error.message : "query failed" } };
    }
  }
}

export function createDbAdminClient() {
  return {
    from<T extends TableName>(table: T) {
      return new TableQuery<T>(table);
    },
  };
}
