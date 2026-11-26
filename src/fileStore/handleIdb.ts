const DB_NAME = "monthledger";
const STORE = "handles";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
}

export async function saveFileHandle(handle: FileSystemFileHandle): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(handle, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("保存文件句柄失败"));
  });
  db.close();
}

export async function loadFileHandle(): Promise<FileSystemFileHandle | null> {
  const db = await openDb();
  const handle = await new Promise<FileSystemFileHandle | null>((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as FileSystemFileHandle) ?? null);
    req.onerror = () => reject(req.error ?? new Error("读取文件句柄失败"));
  });
  db.close();
  return handle;
}

export async function clearFileHandle(): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("清除文件句柄失败"));
  });
  db.close();
}

export async function ensureReadWritePermission(
  handle: FileSystemFileHandle
): Promise<boolean> {
  const opts = { mode: "readwrite" as const };
  // FileSystemHandlePermissionDescriptor
  const anyHandle = handle as FileSystemFileHandle & {
    queryPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (o: { mode: "readwrite" }) => Promise<PermissionState>;
  };
  if (anyHandle.queryPermission) {
    let state = await anyHandle.queryPermission(opts);
    if (state === "granted") return true;
    if (anyHandle.requestPermission) {
      state = await anyHandle.requestPermission(opts);
      return state === "granted";
    }
  }
  return true;
}
