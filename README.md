# monthledger（收支台账 · Web）

Chrome / Edge 静态网页版「收支台账」。账本保存在本机 `.monthledger`（JSON 文本；扩展名受 Chromium ≤16 字符限制，故不用 `.monthledger.json`），无账号、无云端同步。

- 本地：`npm install` → `npm run dev`（开发时也可设 Vite `base: '/'` 临时调试；生产 Pages 使用 `/monthledger/`）
- 测试：`npm test`
- 构建：`npm run build` → `dist/`
- 线上：`https://linyn-zero.github.io/monthledger/`

规格：`docs/superpowers/specs/2026-11-26-monthledger-web-design.md`
