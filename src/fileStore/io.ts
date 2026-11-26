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
