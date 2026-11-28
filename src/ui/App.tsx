import { useEffect, useState } from "react";
import type { YearMonth } from "../domain/types";
import type { LedgerSession } from "../adapter/session";
import {
  fileSystemAccessUnavailableReason,
  supportsFileSystemAccess
} from "../fileStore/io";
import { BoardPage } from "./pages/BoardPage";
import { EntriesPage } from "./pages/EntriesPage";
import { SettingsPage } from "./pages/SettingsPage";
import { SetupPage } from "./pages/SetupPage";

type AppPage =
  | "booting"
  | "picker"
  | "loading"
  | "setup"
  | "board"
  | "entries"
  | "settings";

export type AppProps = {
  session: LedgerSession;
};

export function App({ session }: AppProps) {
  const [page, setPage] = useState<AppPage>("booting");
  const [bootError, setBootError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [ledgerMonth, setLedgerMonth] = useState<YearMonth | null>(null);
  const [boardFrom, setBoardFrom] = useState<YearMonth | null>(null);
  const [boardCount, setBoardCount] = useState(12);
  const [ledgerEpoch, setLedgerEpoch] = useState(0);
  const [entriesVisited, setEntriesVisited] = useState(false);

  useEffect(() => {
    session.onSaveError((message) => {
      setToast(message);
      window.setTimeout(() => setToast(null), 4000);
    });
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = await session.tryRestore();
        if (cancelled) return;
        if (next === "picker") setPage("picker");
        else setPage(next);
      } catch (err) {
        if (!cancelled) {
          setBootError(err instanceof Error ? err.message : String(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  async function onCreate() {
    try {
      setBootError(null);
      await session.createNew();
      setPage("setup");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }

  async function onOpen() {
    try {
      setBootError(null);
      const next = await session.openExisting();
      setPage(next);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setBootError(err instanceof Error ? err.message : String(err));
    }
  }

  if (bootError && page === "booting") {
    return <p className="app-loading">{bootError}</p>;
  }

  if (page === "booting") {
    return <p className="app-loading">加载中</p>;
  }

  if (page === "picker") {
    const fsOk = supportsFileSystemAccess();
    return (
      <div className="file-gate">
        <h1 className="file-gate__brand">收支台账</h1>
        <p className="file-gate__hint">
          账本保存在你本机的 .monthledger 文件中（JSON 文本），不会上传到服务器。请使用
          Chrome 或 Edge，并用 HTTPS 打开本站。
        </p>
        {!fsOk ? (
          <p className="file-gate__error">{fileSystemAccessUnavailableReason()}</p>
        ) : null}
        {bootError ? <p className="file-gate__error">{bootError}</p> : null}
        <div className="file-gate__actions">
          <button
            type="button"
            className="file-gate__btn"
            disabled={!fsOk}
            onClick={() => void onCreate()}
          >
            新建账本
          </button>
          <button
            type="button"
            className="file-gate__btn"
            disabled={!fsOk}
            onClick={() => void onOpen()}
          >
            打开账本
          </button>
        </div>
      </div>
    );
  }

  if (page === "setup") {
    return <SetupPage onComplete={() => setPage("board")} />;
  }

  function openEntries() {
    setEntriesVisited(true);
    setPage("entries");
  }

  function onLedgerMutated() {
    setLedgerEpoch((n) => n + 1);
  }

  async function onUndo() {
    const ok = await window.ledgerApi.undo();
    if (ok) onLedgerMutated();
  }

  async function onRedo() {
    const ok = await window.ledgerApi.redo();
    if (ok) onLedgerMutated();
  }

  return (
    <>
      {toast ? <p className="app-toast">{toast}</p> : null}
      <div className="app-page" hidden={page !== "board"}>
        <BoardPage
          onOpenEntries={openEntries}
          onOpenSettings={() => setPage("settings")}
          onSelectedMonthChange={setLedgerMonth}
          onWindowChange={(from, count) => {
            setBoardFrom(from);
            setBoardCount(count);
          }}
          reloadNonce={ledgerEpoch}
          onLedgerMutated={onLedgerMutated}
          onUndo={() => void onUndo()}
          onRedo={() => void onRedo()}
        />
      </div>
      {entriesVisited ? (
        <div className="app-page" hidden={page !== "entries"}>
          <EntriesPage
            ledgerMonth={ledgerMonth}
            defaultFrom={boardFrom}
            defaultCount={boardCount}
            reloadNonce={ledgerEpoch}
            onLedgerMutated={onLedgerMutated}
            onOpenBoard={() => setPage("board")}
            onOpenSettings={() => setPage("settings")}
          />
        </div>
      ) : null}
      {page === "settings" ? (
        <SettingsPage
          onBack={() => setPage("board")}
          onOpenEntries={openEntries}
          reloadNonce={ledgerEpoch}
          onLedgerMutated={onLedgerMutated}
        />
      ) : null}
    </>
  );
}
