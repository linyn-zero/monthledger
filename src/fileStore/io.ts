import { clearFileHandle, ensureReadWritePermission, loadFileHandle, saveFileHandle } from "./handleIdb";
import {
  FILE_EXTENSION,
  parseLedgerDocument,
  serializeDocument,
  type LedgerBody,
  type LedgerDocument
} from "./types";
import type { UndoLanes } from "../domain/undo";

const ACCEPT = {
  "application/json": [FILE_EXTENSION]
};

export function supportsFileSystemAccess(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext === true &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

export function fileSystemAccessUnavailableReason(): string {
  if (typeof window === "undefined") {
    return "当前环境无法选择本机文件。";
  }
  if (!window.isSecureContext || window.location.protocol === "http:") {
    const httpsUrl = `https://${window.location.host}${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `打开/保存账本需要 HTTPS。请改用：${httpsUrl}`;
  }
  return "当前浏览器不支持本机文件读写。请使用最新版 Chrome 或 Edge（桌面版）。";
}

export async function writeDocument(
  handle: FileSystemFileHandle,
  body: LedgerBody | null,
  undo: UndoLanes
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(serializeDocument(body, undo));
    await writable.close();
  } catch (err) {
    try {
      await writable.abort();
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export async function readDocument(
  handle: FileSystemFileHandle
): Promise<LedgerDocument> {
  const file = await handle.getFile();
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("账本不是合法 JSON");
  }
  return parseLedgerDocument(parsed);
}

export async function pickOpenLedgerFile(): Promise<FileSystemFileHandle> {
  if (!supportsFileSystemAccess()) {
    throw new Error(fileSystemAccessUnavailableReason());
  }
  const [handle] = await window.showOpenFilePicker({
    multiple: false,
    types: [{ description: "Month Ledger", accept: ACCEPT }]
  });
  const ok = await ensureReadWritePermission(handle);
  if (!ok) throw new Error("未获得文件读写权限");
  await saveFileHandle(handle);
  return handle;
}

export async function pickSaveLedgerFile(
  suggestedName = `ledger${FILE_EXTENSION}`
): Promise<FileSystemFileHandle> {
  if (!supportsFileSystemAccess()) {
    throw new Error(fileSystemAccessUnavailableReason());
  }
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: "Month Ledger", accept: ACCEPT }]
  });
  const ok = await ensureReadWritePermission(handle);
  if (!ok) throw new Error("未获得文件读写权限");
  await saveFileHandle(handle);
  return handle;
}

export async function tryRestoreHandle(): Promise<FileSystemFileHandle | null> {
  const handle = await loadFileHandle();
  if (!handle) return null;
  try {
    const ok = await ensureReadWritePermission(handle);
    if (!ok) {
      await clearFileHandle();
      return null;
    }
    return handle;
  } catch {
    await clearFileHandle();
    return null;
  }
}
