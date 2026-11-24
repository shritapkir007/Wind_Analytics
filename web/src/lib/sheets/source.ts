import "server-only";
import { readFile } from "node:fs/promises";
import type { Grid } from "./normalize";
import { sheetId, WORKBOOKS, type WorkbookId } from "../config";

export interface SheetSource {
  name: string;
  /** All tab titles in the workbook. */
  listTabs(wb: WorkbookId): Promise<string[]>;
  /** Full contents of the given tabs (formatted values, as shown in the sheet). */
  getTabs(wb: WorkbookId, tabs: string[]): Promise<Record<string, Grid>>;
}

// ---------------- Google Sheets API (read-only service account) ----------------

function serviceAccount(): { client_email: string; private_key: string } {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json);
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }
  const email = process.env.GOOGLE_CLIENT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!email || !key) {
    throw new Error("Google credentials missing: set GOOGLE_SERVICE_ACCOUNT_JSON (or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY).");
  }
  return { client_email: email, private_key: key };
}

const quote = (tab: string) => `'${tab.replace(/'/g, "''")}'`;

class GoogleSheetsSource implements SheetSource {
  name = "Google Sheets API";
  private api?: Promise<import("googleapis").sheets_v4.Sheets>;

  private sheets() {
    if (!this.api) {
      this.api = (async () => {
        const { google } = await import("googleapis");
        const sa = serviceAccount();
        const auth = new google.auth.JWT({
          email: sa.client_email,
          key: sa.private_key,
          scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
        });
        return google.sheets({ version: "v4", auth });
      })();
    }
    return this.api;
  }

  private id(wb: WorkbookId) {
    const id = sheetId(wb);
    if (!id) throw new Error(`${WORKBOOKS[wb].env} is not set`);
    return id;
  }

  async listTabs(wb: WorkbookId) {
    const api = await this.sheets();
    const res = await api.spreadsheets.get({ spreadsheetId: this.id(wb), fields: "sheets.properties.title" });
    return (res.data.sheets ?? []).map((s) => s.properties?.title ?? "").filter(Boolean);
  }

  async getTabs(wb: WorkbookId, tabs: string[]) {
    const api = await this.sheets();
    const out: Record<string, Grid> = {};
    // Chunk to stay well inside request-size limits.
    for (let i = 0; i < tabs.length; i += 10) {
      const chunk = tabs.slice(i, i + 10);
      const res = await api.spreadsheets.values.batchGet({
        spreadsheetId: this.id(wb),
        ranges: chunk.map(quote),
        valueRenderOption: "FORMATTED_VALUE",
        majorDimension: "ROWS",
      });
      (res.data.valueRanges ?? []).forEach((vr, j) => {
        out[chunk[j]] = (vr.values ?? []).map((row) => row.map((c) => (c == null ? "" : String(c))));
      });
    }
    return out;
  }
}

// ---------------- Local JSON snapshot (development / tests) ----------------
// File shape: { "workstudy": { "<tab>": string[][] }, "leave": {...}, "overtime": {...} }

class FixtureSource implements SheetSource {
  name: string;
  constructor(private file: string) {
    this.name = `Fixture file (${file})`;
  }
  private data?: Promise<Record<string, Record<string, Grid>>>;
  private load() {
    if (!this.data) this.data = readFile(this.file, "utf8").then((s) => JSON.parse(s));
    return this.data;
  }
  async listTabs(wb: WorkbookId) {
    return Object.keys((await this.load())[wb] ?? {});
  }
  async getTabs(wb: WorkbookId, tabs: string[]) {
    const book = (await this.load())[wb] ?? {};
    const out: Record<string, Grid> = {};
    for (const t of tabs) {
      if (!book[t]) throw new Error(`Fixture has no tab "${t}" in ${wb}`);
      out[t] = book[t];
    }
    return out;
  }
}

export function getSource(): SheetSource {
  const fixture = process.env.SHEETS_FIXTURE_FILE;
  if (fixture) return new FixtureSource(fixture);
  return new GoogleSheetsSource();
}
