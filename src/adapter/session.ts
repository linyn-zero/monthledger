import type { ManualLineInput } from "../domain/commands";
import type { MonthSnapshot } from "../domain/formulas";
import type {
  CreditDirection,
  CreditMarker,
  HoldItem,
  LedgerMeta,
  LineItem,
  RecurringRule,
  RuleDeleteMonth
} from "../domain/types";
import {
  pickOpenLedgerFile,
  pickSaveLedgerFile,
  readDocument,
  tryRestoreHandle,
  writeDocument
} from "../fileStore/io";
import { bodyFromDoc, emptyUndo } from "../fileStore/types";
import { WebService } from "./webService";

export type LedgerApi = {
  needsSetup: () => Promise<boolean>;
  getMeta: () => Promise<LedgerMeta>;
  getOverview: (
    fromMonth: string,
    monthCount: number
  ) => Promise<{ meta: LedgerMeta; months: MonthSnapshot[]; holds: HoldItem[] }>;
  confirmItem: (id: string, actualCents: number) => Promise<void>;
  unconfirmItem: (id: string) => Promise<void>;
  updateExpectedDate: (id: string, expectedDate: string | null) => Promise<void>;
  updatePlannedAmount: (id: string, amountCents: number) => Promise<void>;
  updateItemName: (id: string, name: string) => Promise<void>;
  addManualLine: (input: Omit<ManualLineInput, "id">) => Promise<void>;
  createCredit: (input: {
    creditor: string;
    occurDate: string;
    principalCents: number;
    direction?: CreditDirection;
  }) => Promise<void>;
  addRepayment: (input: {
    creditId: string;
    expectedDate: string;
    amountCents: number;
  }) => Promise<void>;
  deleteCredit: (creditId: string) => Promise<void>;
  listCredits: () => Promise<CreditMarker[]>;
  listItems: () => Promise<LineItem[]>;
  saveLine: (item: LineItem) => Promise<void>;
  deleteLine: (id: string) => Promise<void>;
  saveCredit: (marker: CreditMarker) => Promise<void>;
  updateSpreadDaily: (id: string, spreadDaily: boolean | null) => Promise<void>;
  mergeHold: (holdId: string, month: string) => Promise<void>;
  listRules: () => Promise<RecurringRule[]>;
  listRuleDeleteMonths: (ruleId: string) => Promise<RuleDeleteMonth[]>;
  saveRule: (rule: RecurringRule) => Promise<void>;
  deleteRule: (ruleId: string, keepMonths: string[]) => Promise<void>;
  setup: (meta: LedgerMeta) => Promise<void>;
  saveOpeningCash: (cents: number) => Promise<void>;
  exportCsv: () => Promise<{
    overview: string;
    items: string;
    holds: string;
    rules: string;
  }>;
  exportCsvToDir: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    dir?: string;
  }>;
  saveSettings: (settings: { notifyEnabled: boolean }) => Promise<void>;
  saveUndoLimit: (limit: number) => Promise<void>;
  undo: () => Promise<boolean>;
  redo: () => Promise<boolean>;
  dbPath: () => Promise<string>;
  onFocusMonth: (listener: (month: string) => void) => () => void;
};

const DEBOUNCE_MS = 500;

export class LedgerSession {
  readonly service = new WebService();
  private handle: FileSystemFileHandle | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private saveErrorListener: ((message: string) => void) | null = null;

  constructor() {
    this.service.setPersistHandler(() => this.scheduleSave());
    window.addEventListener("beforeunload", () => {
      void this.flushSave();
    });
  }

  onSaveError(fn: (message: string) => void): void {
    this.saveErrorListener = fn;
  }

  private scheduleSave(): void {
    this.dirty = true;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.flushSave();
    }, DEBOUNCE_MS);
  }

  async flushSave(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.dirty || !this.handle) return;
    const dump = this.service.dumpForPersist();
    try {
      if (!dump) {
        await writeDocument(this.handle, null, emptyUndo());
      } else {
        const { meta, ...rest } = dump.body;
        const cleanMeta = { ...meta };
        delete cleanMeta.undoLimit;
        await writeDocument(
          this.handle,
          { meta: cleanMeta, ...rest },
          dump.undo
        );
      }
      this.dirty = false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.saveErrorListener?.(`未保存：${msg}`);
    }
  }

  private async bindHandle(handle: FileSystemFileHandle): Promise<void> {
    this.handle = handle;
    this.service.setFileLabel(handle.name);
  }

  private applyDoc(
    doc: Awaited<ReturnType<typeof readDocument>>
  ): "setup" | "board" {
    const body = bodyFromDoc(doc);
    if (!body) {
      this.service.startEmpty();
      return "setup";
    }
    this.service.hydrate(body, doc.undo);
    return this.service.needsSetup() ? "setup" : "board";
  }

  async tryRestore(): Promise<"setup" | "board" | "picker"> {
    const handle = await tryRestoreHandle();
    if (!handle) return "picker";
    try {
      const doc = await readDocument(handle);
      await this.bindHandle(handle);
      this.dirty = false;
      return this.applyDoc(doc);
    } catch {
      return "picker";
    }
  }

  async openExisting(): Promise<"setup" | "board"> {
    const handle = await pickOpenLedgerFile();
    const doc = await readDocument(handle);
    await this.bindHandle(handle);
    this.dirty = false;
    return this.applyDoc(doc);
  }

  async createNew(): Promise<"setup"> {
    const handle = await pickSaveLedgerFile();
    await this.bindHandle(handle);
    this.service.startEmpty();
    this.dirty = true;
    await this.flushSave();
    return "setup";
  }

  createApi(): LedgerApi {
    const svc = this.service;
    const self = this;
    return {
      needsSetup: async () => svc.needsSetup(),
      getMeta: async () => svc.getMeta(),
      getOverview: async (from, count) => svc.getOverview(from, count),
      confirmItem: async (id, cents) => svc.confirmItem(id, cents),
      unconfirmItem: async (id) => svc.unconfirmItem(id),
      updateExpectedDate: async (id, d) => svc.updateExpectedDate(id, d),
      updatePlannedAmount: async (id, c) => svc.updatePlannedAmount(id, c),
      updateItemName: async (id, n) => svc.updateItemName(id, n),
      addManualLine: async (input) => svc.addManualLine(input),
      createCredit: async (input) => svc.createCredit(input),
      addRepayment: async (input) => svc.addRepayment(input),
      deleteCredit: async (id) => svc.deleteCredit(id),
      listCredits: async () => svc.listCredits(),
      listItems: async () => svc.listItems(),
      saveLine: async (item) => svc.saveLine(item),
      deleteLine: async (id) => svc.deleteLine(id),
      saveCredit: async (m) => svc.saveCredit(m),
      updateSpreadDaily: async (id, s) => svc.updateSpreadDaily(id, s),
      mergeHold: async (id, m) => svc.mergeHold(id, m),
      listRules: async () => svc.listRules(),
      listRuleDeleteMonths: async (id) => svc.listRuleDeleteMonths(id),
      saveRule: async (r) => svc.saveRule(r),
      deleteRule: async (id, keep) => svc.deleteRule(id, keep),
      setup: async (meta) => {
        svc.setup(meta);
        await self.flushSave();
      },
      saveOpeningCash: async (c) => svc.saveOpeningCash(c),
      exportCsv: async () => svc.exportCsv(),
      exportCsvToDir: async () => {
        const csv = svc.exportCsv();
        const blob = new Blob(
          [
            "# overview\n",
            csv.overview,
            "\n# items\n",
            csv.items,
            "\n# holds\n",
            csv.holds,
            "\n# rules\n",
            csv.rules
          ],
          { type: "text/csv;charset=utf-8" }
        );
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "shouzhi-export.csv";
        a.click();
        URL.revokeObjectURL(url);
        return { ok: true };
      },
      saveSettings: async (s) => svc.saveSettings(s),
      saveUndoLimit: async () => undefined,
      undo: async () => svc.undo(),
      redo: async () => svc.redo(),
      dbPath: async () => svc.filePathLabel(),
      onFocusMonth: () => () => undefined
    };
  }
}

declare global {
  interface Window {
    ledgerApi: LedgerApi;
  }
}
