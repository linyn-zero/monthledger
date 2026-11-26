# monthledger Web 设计规格

日期：2026-11-26  
状态：已批准（对话 brainstorming → 执行）

## 1. 目标

将「收支台账」以 **Chrome/Edge 纯静态 Web** 交付：访客打开 GitHub Pages 即可用；账本只存在本机 `.monthledger.json`；无账号、无云端同步、无服务器。

产品界面名仍为 **收支台账**；仓库与文件格式名为 **monthledger** / **`.monthledger.json`**。

## 2. 非目标

- 云服务器、账号、多用户云同步
- Electron / Windows 安装包（桌面仓 `个人财务管理` 仅作归档对照）
- Safari / Firefox
- 线上演示种子账本 / `SHOUZHI_SEED`
- 修改首页仓 `linyn-zero/linyn-zero`（外链由作者自行添加）
- 从旧 SQLite 一键迁移（二期可选）

产品功能边界仍对齐桌面规格 [收支台账 cashflow-board](../../../个人财务管理/docs/superpowers/specs/2026-09-16-cashflow-board-design.md) 的做/不做（不做 AI、银行导入、多账本等）。本仓不依赖该相对路径运行。

## 3. 架构

```
ui (React) → adapter → domain（纯计算）
                ↘ fileStore → 本机 .monthledger.json
                     ↕ IndexedDB 存 FileSystemFileHandle（刷新恢复）
```

| 目录 | 职责 |
| --- | --- |
| `src/domain/` | 公式、命令、类型、undo 算法、CSV、seed（仅测） |
| `src/adapter/` | 内存态 + 与 `ledgerApi` 同形 API；写入前 `pushUndo` |
| `src/fileStore/` | File System Access 读写 JSON；句柄持久化 |
| `src/ui/` | 台账表、规则、条目、设置、首次向导 |

## 4. 文件格式

顶层：

- `schemaVersion`: `1`
- 正文：`meta`, `rules`, `items`, `holds`, `markers`（与桌面 `LedgerState` 对等）
- `undo`: `{ past, future }`，各为完整快照数组，**合计可回撤深度上限 10**（`past` 最多 10；新编辑清空 `future`）

`meta` **不**再暴露可配置 `undoLimit`（常量 10）。金额整数分；日历 Asia/Shanghai。

写盘：debounce ≈500ms，正文与 `undo` 一次序列化；`beforeunload` 冲刺写盘；失败 Toast「未保存」。

## 5. 回撤

- 快照式（复用 `domain/undo.ts`），非按操作反做
- UI：工具栏回撤/反回撤按钮；**不绑** Ctrl+Z/Y（可后加）
- 无「可回撤次数」设置项

## 6. 启动与句柄

- 入口：新建账本（`showSaveFilePicker`）或打开已有文件；尝试从 IndexedDB 恢复句柄
- 无 meta → 首次向导（现金/负债/起始月）
- 无演示种子入口

## 7. 部署

- GitHub：`linyn-zero/monthledger`
- Pages：`base` = `/monthledger/`
- 仅静态资源

## 8. 验收

- Chrome/Edge：新建 → 向导 → 编辑 → 回撤/反回撤；刷新后句柄可恢复则继续
- `npx vitest run` 全绿；`npm run build` 成功
