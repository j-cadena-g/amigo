/**
 * Data Migration Script: PostgreSQL → Cloudflare D1
 *
 * Exports all tables from PostgreSQL, transforms data types to match the
 * D1/SQLite schema, and imports via the D1 HTTP API in resumable batches.
 *
 * Usage:
 *   bun run scripts/migrate-to-d1.ts [flags]
 *
 * Flags:
 *   --dry-run        Validate transforms and log what would be imported
 *   --reset          Delete checkpoint file and start fresh
 *   --table <name>   Import only a single table (e.g. --table households)
 *
 * Environment variables:
 *   DATABASE_URL           PostgreSQL connection string
 *   CLOUDFLARE_ACCOUNT_ID  Cloudflare account ID
 *   CLOUDFLARE_API_TOKEN   Cloudflare API token
 *   D1_DATABASE_ID         D1 database UUID
 */

import postgres from "postgres";
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BATCH_SIZE = 100; // rows per INSERT statement
const API_BATCH_SIZE = 50; // statements per D1 API call
const CHECKPOINT_FILE = "./migration-checkpoint.json";

// Import order respects foreign key constraints
const TABLE_ORDER = [
  "households",
  "users",
  "grocery_tags",
  "grocery_items",
  "grocery_item_tags",
  "budgets",
  "transactions",
  "recurring_transactions",
  "debts",
  "assets",
  "exchange_rates",
  "audit_logs",
] as const;

type TableName = (typeof TABLE_ORDER)[number];

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    reset: { type: "boolean", default: false },
    table: { type: "string" },
  },
  strict: true,
});

const dryRun = args["dry-run"] ?? false;
const resetCheckpoint = args["reset"] ?? false;
const singleTable = args["table"] as TableName | undefined;

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const DATABASE_URL = requireEnv("DATABASE_URL");
const CLOUDFLARE_ACCOUNT_ID = requireEnv("CLOUDFLARE_ACCOUNT_ID");
const CLOUDFLARE_API_TOKEN = requireEnv("CLOUDFLARE_API_TOKEN");
const D1_DATABASE_ID = requireEnv("D1_DATABASE_ID");

const D1_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}`;

// ---------------------------------------------------------------------------
// Checkpoint (resumable progress)
// ---------------------------------------------------------------------------

type Checkpoint = Record<string, number>; // tableName → last successfully imported row index

function loadCheckpoint(): Checkpoint {
  try {
    return JSON.parse(readFileSync(CHECKPOINT_FILE, "utf-8"));
  } catch {
    return {};
  }
}

function saveCheckpoint(cp: Checkpoint): void {
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(cp, null, 2));
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/** Convert a PG timestamptz (Date object or ISO string) to integer milliseconds. */
function timestampToMs(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  const d = new Date(String(value));
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid timestamp value: ${value}`);
  }
  return d.getTime();
}

/** Convert a PG numeric money amount (string) to integer cents. */
function numericToCents(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (isNaN(n)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return Math.round(n * 100);
}

/** Convert a PG numeric to a float (for exchange rates). */
function numericToReal(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  if (isNaN(n)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }
  return n;
}

/** Convert a PG boolean to 0/1 integer. */
function boolToInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

/** Convert a PG date (Date object) to ISO 8601 YYYY-MM-DD text. */
function dateToISOText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  // Already a string date
  const s = String(value);
  // Validate format
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  throw new Error(`Invalid date value: ${value}`);
}

/** Convert jsonb to JSON text string. */
function jsonbToText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** Pass through unchanged (text, uuid, enum, integer). */
function passthrough<T>(value: T): T {
  return value;
}

// ---------------------------------------------------------------------------
// Table-specific transform definitions
// ---------------------------------------------------------------------------

/**
 * Each table defines its column list and a transform function per column.
 * The PG column name (snake_case) maps to a transform that produces the D1 value.
 */
type ColumnTransform = (value: unknown) => unknown;
type TableDef = {
  pgTable: string; // PG table name
  d1Table: string; // D1 table name (same in this migration)
  columns: Array<{ pg: string; d1: string; transform: ColumnTransform }>;
};

const TABLES: Record<TableName, TableDef> = {
  households: {
    pgTable: "households",
    d1Table: "households",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "name", d1: "name", transform: passthrough },
      { pg: "home_currency", d1: "home_currency", transform: passthrough },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
    ],
  },
  users: {
    pgTable: "users",
    d1Table: "users",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "auth_id", d1: "auth_id", transform: passthrough },
      { pg: "email", d1: "email", transform: passthrough },
      { pg: "name", d1: "name", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "role", d1: "role", transform: passthrough },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
      { pg: "deleted_at", d1: "deleted_at", transform: timestampToMs },
    ],
  },
  grocery_tags: {
    pgTable: "grocery_tags",
    d1Table: "grocery_tags",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "name", d1: "name", transform: passthrough },
      { pg: "color", d1: "color", transform: passthrough },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
    ],
  },
  grocery_items: {
    pgTable: "grocery_items",
    d1Table: "grocery_items",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "created_by_user_id", d1: "created_by_user_id", transform: passthrough },
      { pg: "created_by_user_display_name", d1: "created_by_user_display_name", transform: passthrough },
      { pg: "transferred_from_created_by_user_id", d1: "transferred_from_created_by_user_id", transform: passthrough },
      { pg: "item_name", d1: "item_name", transform: passthrough },
      { pg: "category", d1: "category", transform: passthrough },
      { pg: "is_purchased", d1: "is_purchased", transform: boolToInt },
      { pg: "purchased_at", d1: "purchased_at", transform: timestampToMs },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
      { pg: "deleted_at", d1: "deleted_at", transform: timestampToMs },
    ],
  },
  grocery_item_tags: {
    pgTable: "grocery_item_tags",
    d1Table: "grocery_item_tags",
    columns: [
      { pg: "item_id", d1: "item_id", transform: passthrough },
      { pg: "tag_id", d1: "tag_id", transform: passthrough },
    ],
  },
  budgets: {
    pgTable: "budgets",
    d1Table: "budgets",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "user_id", d1: "user_id", transform: passthrough },
      { pg: "transferred_from_user_id", d1: "transferred_from_user_id", transform: passthrough },
      { pg: "name", d1: "name", transform: passthrough },
      { pg: "category", d1: "category", transform: passthrough },
      { pg: "limit_amount", d1: "limit_amount", transform: numericToCents },
      { pg: "currency", d1: "currency", transform: passthrough },
      { pg: "period", d1: "period", transform: passthrough },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
      { pg: "deleted_at", d1: "deleted_at", transform: timestampToMs },
    ],
  },
  transactions: {
    pgTable: "transactions",
    d1Table: "transactions",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "user_id", d1: "user_id", transform: passthrough },
      { pg: "user_display_name", d1: "user_display_name", transform: passthrough },
      { pg: "transferred_from_user_id", d1: "transferred_from_user_id", transform: passthrough },
      { pg: "budget_id", d1: "budget_id", transform: passthrough },
      { pg: "amount", d1: "amount", transform: numericToCents },
      { pg: "currency", d1: "currency", transform: passthrough },
      { pg: "exchange_rate_to_home", d1: "exchange_rate_to_home", transform: numericToReal },
      { pg: "category", d1: "category", transform: passthrough },
      { pg: "description", d1: "description", transform: passthrough },
      { pg: "type", d1: "type", transform: passthrough },
      { pg: "date", d1: "date", transform: dateToISOText },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
      { pg: "deleted_at", d1: "deleted_at", transform: timestampToMs },
    ],
  },
  recurring_transactions: {
    pgTable: "recurring_transactions",
    d1Table: "recurring_transactions",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "user_id", d1: "user_id", transform: passthrough },
      { pg: "user_display_name", d1: "user_display_name", transform: passthrough },
      { pg: "transferred_from_user_id", d1: "transferred_from_user_id", transform: passthrough },
      { pg: "budget_id", d1: "budget_id", transform: passthrough },
      { pg: "amount", d1: "amount", transform: numericToCents },
      { pg: "currency", d1: "currency", transform: passthrough },
      { pg: "category", d1: "category", transform: passthrough },
      { pg: "description", d1: "description", transform: passthrough },
      { pg: "type", d1: "type", transform: passthrough },
      { pg: "frequency", d1: "frequency", transform: passthrough },
      { pg: "interval", d1: "interval", transform: passthrough },
      { pg: "day_of_month", d1: "day_of_month", transform: passthrough },
      { pg: "start_date", d1: "start_date", transform: dateToISOText },
      { pg: "end_date", d1: "end_date", transform: dateToISOText },
      { pg: "last_run_date", d1: "last_run_date", transform: dateToISOText },
      { pg: "next_run_date", d1: "next_run_date", transform: dateToISOText },
      { pg: "active", d1: "active", transform: boolToInt },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
    ],
  },
  debts: {
    pgTable: "debts",
    d1Table: "debts",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "user_id", d1: "user_id", transform: passthrough },
      { pg: "user_display_name", d1: "user_display_name", transform: passthrough },
      { pg: "transferred_from_user_id", d1: "transferred_from_user_id", transform: passthrough },
      { pg: "name", d1: "name", transform: passthrough },
      { pg: "type", d1: "type", transform: passthrough },
      { pg: "balance_initial", d1: "balance_initial", transform: numericToCents },
      { pg: "balance_current", d1: "balance_current", transform: numericToCents },
      { pg: "currency", d1: "currency", transform: passthrough },
      { pg: "exchange_rate_to_home", d1: "exchange_rate_to_home", transform: numericToReal },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
      { pg: "deleted_at", d1: "deleted_at", transform: timestampToMs },
    ],
  },
  assets: {
    pgTable: "assets",
    d1Table: "assets",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "household_id", d1: "household_id", transform: passthrough },
      { pg: "user_id", d1: "user_id", transform: passthrough },
      { pg: "user_display_name", d1: "user_display_name", transform: passthrough },
      { pg: "transferred_from_user_id", d1: "transferred_from_user_id", transform: passthrough },
      { pg: "name", d1: "name", transform: passthrough },
      { pg: "type", d1: "type", transform: passthrough },
      { pg: "balance", d1: "balance", transform: numericToCents },
      { pg: "currency", d1: "currency", transform: passthrough },
      { pg: "exchange_rate_to_home", d1: "exchange_rate_to_home", transform: numericToReal },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
      { pg: "updated_at", d1: "updated_at", transform: timestampToMs },
      { pg: "deleted_at", d1: "deleted_at", transform: timestampToMs },
    ],
  },
  exchange_rates: {
    pgTable: "exchange_rates",
    d1Table: "exchange_rates",
    columns: [
      { pg: "base_currency", d1: "base_currency", transform: passthrough },
      { pg: "target_currency", d1: "target_currency", transform: passthrough },
      { pg: "date", d1: "date", transform: dateToISOText },
      { pg: "rate", d1: "rate", transform: numericToReal },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
    ],
  },
  audit_logs: {
    pgTable: "audit_logs",
    d1Table: "audit_logs",
    columns: [
      { pg: "id", d1: "id", transform: passthrough },
      { pg: "table_name", d1: "table_name", transform: passthrough },
      { pg: "record_id", d1: "record_id", transform: passthrough },
      { pg: "operation", d1: "operation", transform: passthrough },
      { pg: "old_values", d1: "old_values", transform: jsonbToText },
      { pg: "new_values", d1: "new_values", transform: jsonbToText },
      { pg: "changed_by", d1: "changed_by", transform: passthrough },
      { pg: "created_at", d1: "created_at", transform: timestampToMs },
    ],
  },
};

// ---------------------------------------------------------------------------
// PostgreSQL export
// ---------------------------------------------------------------------------

async function exportTable(
  sql: postgres.Sql,
  tableDef: TableDef,
): Promise<Record<string, unknown>[]> {
  const pgCols = tableDef.columns.map((c) => `"${c.pg}"`).join(", ");
  const rows = await sql.unsafe(
    `SELECT ${pgCols} FROM "${tableDef.pgTable}" ORDER BY ctid`,
  );
  return rows as Record<string, unknown>[];
}

// ---------------------------------------------------------------------------
// Data transformation
// ---------------------------------------------------------------------------

function transformRows(
  tableDef: TableDef,
  pgRows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return pgRows.map((row, idx) => {
    const transformed: Record<string, unknown> = {};
    for (const col of tableDef.columns) {
      try {
        transformed[col.d1] = col.transform(row[col.pg]);
      } catch (err) {
        throw new Error(
          `Transform error in ${tableDef.pgTable} row ${idx}, column "${col.pg}": ${err instanceof Error ? err.message : err}`,
          { cause: err },
        );
      }
    }
    return transformed;
  });
}

// ---------------------------------------------------------------------------
// D1 HTTP API import
// ---------------------------------------------------------------------------

/**
 * Build a parameterized multi-row INSERT statement.
 * Returns { sql: string, params: unknown[] }
 */
function buildBatchInsert(
  tableName: string,
  rows: Record<string, unknown>[],
): { sql: string; params: unknown[] } {
  if (rows.length === 0) {
    throw new Error("Cannot build INSERT with 0 rows");
  }

  const columns = Object.keys(rows[0]);
  const colList = columns.map((c) => `"${c}"`).join(", ");
  const placeholderRow = `(${columns.map(() => "?").join(", ")})`;
  const placeholders = rows.map(() => placeholderRow).join(", ");

  const sql = `INSERT INTO "${tableName}" (${colList}) VALUES ${placeholders}`;
  const params: unknown[] = [];
  for (const row of rows) {
    for (const col of columns) {
      params.push(row[col] ?? null);
    }
  }

  return { sql, params };
}

/**
 * Send a batch of SQL statements to D1 via the HTTP API.
 */
async function d1ApiBatch(
  statements: Array<{ sql: string; params: unknown[] }>,
): Promise<void> {
  const url = `${D1_API_BASE}/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(statements),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `D1 API error (${response.status}): ${body}`,
    );
  }

  const result = (await response.json()) as {
    success: boolean;
    errors?: Array<{ message: string }>;
    result?: unknown[];
  };

  if (!result.success) {
    throw new Error(
      `D1 API batch failed: ${JSON.stringify(result.errors)}`,
    );
  }
}

/**
 * Query D1 for a row count.
 */
async function d1RowCount(tableName: string): Promise<number> {
  const url = `${D1_API_BASE}/query`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CLOUDFLARE_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { sql: `SELECT COUNT(*) as count FROM "${tableName}"`, params: [] },
    ]),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`D1 count query failed (${response.status}): ${body}`);
  }

  const result = (await response.json()) as {
    success: boolean;
    result: Array<{ results: Array<{ count: number }> }>;
  };

  return result.result[0].results[0].count;
}

// ---------------------------------------------------------------------------
// Table import (with checkpointing)
// ---------------------------------------------------------------------------

async function importTable(
  tableName: string,
  rows: Record<string, unknown>[],
): Promise<void> {
  const checkpoint = loadCheckpoint();
  const startIndex = checkpoint[tableName] ?? 0;

  if (rows.length === 0) {
    console.log(`  ${tableName}: no rows to import, skipping`);
    return;
  }

  if (startIndex >= rows.length) {
    console.log(
      `  ${tableName}: already fully imported (${rows.length} rows), skipping`,
    );
    return;
  }

  if (startIndex > 0) {
    console.log(
      `  ${tableName}: resuming from row ${startIndex} / ${rows.length}`,
    );
  }

  const remaining = rows.slice(startIndex);
  const rowChunks = chunkArray(remaining, BATCH_SIZE);
  let importedCount = startIndex;

  // Group row chunks into API batches (each API call can hold API_BATCH_SIZE statements)
  const apiBatches = chunkArray(rowChunks, API_BATCH_SIZE);

  for (const apiBatch of apiBatches) {
    const statements = apiBatch.map((chunk) =>
      buildBatchInsert(tableName, chunk),
    );

    if (dryRun) {
      const rowCount = apiBatch.reduce((sum, chunk) => sum + chunk.length, 0);
      console.log(
        `  [dry-run] ${tableName}: would import ${rowCount} rows (${statements.length} statements)`,
      );
      importedCount += rowCount;
    } else {
      await d1ApiBatch(statements);
      const rowCount = apiBatch.reduce((sum, chunk) => sum + chunk.length, 0);
      importedCount += rowCount;

      // Checkpoint after each successful API batch
      checkpoint[tableName] = importedCount;
      saveCheckpoint(checkpoint);
      console.log(
        `  ${tableName}: imported ${importedCount} / ${rows.length} rows`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

async function validate(
  sql: postgres.Sql,
  tablesToValidate: TableName[],
): Promise<boolean> {
  console.log("\n--- Validation ---");
  let allMatch = true;

  for (const tableName of tablesToValidate) {
    const tableDef = TABLES[tableName];

    // PG count
    const pgResult = await sql.unsafe(
      `SELECT COUNT(*) as count FROM "${tableDef.pgTable}"`,
    );
    const pgCount = Number(pgResult[0].count);

    // D1 count
    const d1Count = await d1RowCount(tableDef.d1Table);

    const match = pgCount === d1Count;
    const status = match ? "OK" : "MISMATCH";
    console.log(
      `  ${tableName}: PG=${pgCount} D1=${d1Count} [${status}]`,
    );

    if (!match) allMatch = false;
  }

  return allMatch;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== PostgreSQL → D1 Data Migration ===");
  console.log(`Mode: ${dryRun ? "DRY RUN" : "LIVE"}`);
  if (singleTable) console.log(`Table filter: ${singleTable}`);
  console.log();

  // Handle --reset
  if (resetCheckpoint) {
    if (existsSync(CHECKPOINT_FILE)) {
      unlinkSync(CHECKPOINT_FILE);
      console.log("Checkpoint file deleted.\n");
    } else {
      console.log("No checkpoint file found.\n");
    }
  }

  // Validate --table flag
  if (singleTable && !TABLE_ORDER.includes(singleTable)) {
    console.error(
      `Unknown table: "${singleTable}". Valid tables: ${TABLE_ORDER.join(", ")}`,
    );
    process.exit(1);
  }

  const tablesToMigrate: TableName[] = singleTable
    ? [singleTable]
    : [...TABLE_ORDER];

  // Connect to PostgreSQL
  const sql = postgres(DATABASE_URL, {
    max: 1,
    idle_timeout: 30,
    // postgres.js returns Date objects for timestamps and dates by default
  });

  try {
    console.log("Connected to PostgreSQL.\n");

    // Phase 1: Export & Transform
    console.log("--- Phase 1: Export & Transform ---");
    const tableData = new Map<TableName, Record<string, unknown>[]>();

    for (const tableName of tablesToMigrate) {
      const tableDef = TABLES[tableName];
      process.stdout.write(`  Exporting ${tableName}...`);
      const pgRows = await exportTable(sql, tableDef);
      const d1Rows = transformRows(tableDef, pgRows);
      tableData.set(tableName, d1Rows);
      console.log(` ${pgRows.length} rows exported & transformed`);
    }

    // Phase 2: Import to D1
    console.log("\n--- Phase 2: Import to D1 ---");
    for (const tableName of tablesToMigrate) {
      const rows = tableData.get(tableName)!;
      await importTable(tableName, rows);
    }

    // Phase 3: Validate
    if (!dryRun) {
      const allMatch = await validate(sql, tablesToMigrate);
      if (allMatch) {
        console.log("\nAll row counts match. Migration successful.");
      } else {
        console.error(
          "\nRow count mismatches detected! Review the output above.",
        );
        process.exit(1);
      }
    } else {
      console.log(
        "\n[dry-run] Skipping validation (no data was written to D1).",
      );
    }
  } finally {
    await sql.end();
    console.log("\nPostgreSQL connection closed.");
  }
}

main().catch((err) => {
  console.error("\nMigration failed:", err);
  process.exit(1);
});
