# Windows 启动白屏、双击启动与任务提交闪退排查记录

本文档记录从 2026-07-03 开始针对 Windows 平台启动问题（白屏 + 需要双击）和后续任务提交闪退问题的排查、根因分析、修复过程及经验总结。基于用户反馈和多次构建验证。

## 背景
- 项目：知乎助手 (Electron + AdonisJS + React/Vite)
- 版本：从原作者 2.4 升级到 2.5 后引入问题
- 用户环境：Windows + pwsh
- 初始症状：
  1. 启动需双击两次才打开。
  2. 打开后白屏。
  3. 安装包极慢。
  4. 即使原作者版本也存在双击问题。
- 后续症状（用户测试 win-unpacked 后）：
  - 提交任务（开始抓取）直接闪退（app 崩溃退出）。

项目使用 `electron-builder` 打包（asar 配置、nsis 安装器），前端构建到 `dist/client`，主进程入口 `dist/index.js`。

## 问题 1：启动白屏 + 双击启动 + 安装慢
### 初步分析（工具：list_dir, read_file, grep, run_terminal_command）
- 检查 `package.json` build 配置：
  - `"asar": false`
  - `"files": ["dist/**/*", "gui/dist/**/*", "node_modules/**/*"]`（gui 已过时，应为 client）
  - nsis: `oneClick: false`
- `release/win-unpacked/resources/app/dist/` 中**没有 `client/` 目录**（`dist/client/index.html` 不存在）。
  - 原因：`npm run dist` = `build-without-sourcemap && buildgui && electron-builder`，但 release 中的 win-unpacked 是旧构建产物，`buildgui` 未执行或失败。
- `src/index.ts` 加载逻辑：
  - 使用 `path.resolve(__dirname, 'client', 'index.html')`
  - mac 特殊 hack：`loadFile('./dist/client/index.html')`（相对路径，cwd 依赖，易失败）
  - js-rpc 窗口总是提前创建。
- `client/vite.config.ts`：
  - `rollupOptions.output.format: 'cjs'` + `base: './'` + `assetsDir: ''`
  - 生产 bundle 输出 CJS，但 html 用 `<script type="module">`，导致脚本不执行 → 白屏（开发用 vite dev server 是 ESM，所以 dev 正常）。
- `client/script/build.js`：不保证 client deps 存在，cp 失败静默。
- 其他：
  - 缺少 `second-instance` 处理 → 双击无响应。
  - asar false + 全 node_modules → 安装时复制几万个小文件，极慢。
  - PathConfig / __dirname 在 packaged (asar) 下指向错误（resources/app vs exe 旁）。

### 修复步骤
1. **vite.config.ts**：移除 `format: 'cjs'`（保留 external/plugin）。生产现在输出正确 ESM。
2. **client/script/build.js**：自动检测 vite bin，缺失时 `npm --prefix client install`；构建/复制失败显式报错。
3. **package.json**：
   - `"asar": true`
   - `"asarUnpack": ["**/node_modules/sqlite3/**", "**/node_modules/sharp/**", "**/*.node"]`
   - `win.requestedExecutionLevel: "asInvoker"`
   - nsis 补充 shortcut 配置
   - files 清理 gui + 排除 map
4. **src/index.ts**：
   - 路径改用 `getAppRootForResources()`（packaged 用 `process.resourcesPath + 'app.asar'`，dev 用 `app.getAppPath()`）
   - preload / loadFile / js-rpc 全部用此函数
   - 移除 mac hack
   - 添加 `second-instance` handler（focus 已有窗口）
   - `show: false` + `backgroundColor` + `ready-to-show` / `did-finish-load` + 2s 兜底强制 show
   - did-fail-load 时注入简易错误页（带 open-devtools 按钮）
   - 清理重复 window 创建逻辑
5. **构建验证**：
   - 多次 `npm run build-without-sourcemap && npm run buildgui && npm run pack`
   - 用 `npx @electron/asar list` 确认 `dist/client/index.html` + bundle 在 asar 内
   - smoke test（启动 win-unpacked exe）日志显示 `加载客户端页面: ...app.asar\dist\client\index.html` + `页面加载完成`
6. **其他**：
   - PathConfig 区分 appDir（读 package.json）与 dataRoot（写 outputs/config/db）
   - 确保 `dist/.adonisrc.json` 打包进 asar
   - CommonConfig.db_uri 改用 PathConfig.rootPath

### 结果
- 白屏根因解决（构建产物存在 + 正确格式 + 健壮路径）。
- 双击问题缓解（second-instance + show 策略）。
- 安装速度提升（asar 减少小文件 I/O）。
- 用户删除旧 `知乎助手 Setup 2.5.1.exe` 及相关（latest.yml 等），保留 win-unpacked 测试。

## 问题 2：提交任务直接闪退
### 初步分析（用户反馈后）
- 用户用 win-unpacked 测试，启动白屏缓解，但“提交任务”（`start-customer-task`）立即闪退。
- 触发路径：
  - client: `customer_task/index.tsx` onFinish → `window.electronAPI['start-customer-task']` → 切到“运行日志” tab
  - main: `ipcMain.handle('start-customer-task')` → `asyncUpdateCookie` → `saveConfig` → `ace.handle` (generate:manifest) → `Init:Env` → `Fetch:Customer` → `Generate:Customer`
  - Fetch 内部通过 `zhihu_encrypt` bridge 调用 `asyncJsRpcTriggerFunc`（需要签名）
- 早期修复中引入的 lazy js-rpc：
  - `ensureJsRpcWindow()` 顶层定义
  - `getAppRootForResources()` 放在 `asyncCreateWindow()` 内部 → **ReferenceError**（当任务提交首次调用 ensure 时）
- 其他潜在：
  - IPC handler 直接 await 整个长任务（响应 pending 很久，期间任何内部 reject 易 unhandled）
  - js-rpc 创建时机、preload 路径在 packaged 下的细微差异
  - renderer 里 fire-and-forget 调用 + 缺少 try/catch
  - uncaughtException / unhandledRejection 只 log，未阻止退出
  - 任务中可能出现的 fs、sqlite、http、eval（js-rpc encrypt string）错误

### 修复步骤
1. **src/index.ts**：
   - hoist `getAppRootForResources()` 到模块顶层（ensure / preload / load 都能访问）
   - ensureJsRpcWindow 统一使用它，清理死代码（getJsRpcIndexPathForLazy）
   - `asyncUpdateCookie` 等调用也用新函数
   - 把 handler 拆成 `runCustomerTask`（后台执行） + 立即返回 `'started'`
   - 加 `.catch` 保护后台任务
   - 保留原有 try/catch + finally（isRunning 管理）
2. **client/src/page/home/component/customer_task/index.tsx**：
   - `start-customer-task` 调用改 await + try/catch
   - 错误只 console.error（日志 tab 里会看到实际执行结果）
   - 不再依赖 handler 返回 'success'/'failed'（现在立即返回，进度靠 runtime.log）
3. **构建**：
   - `npm run build-without-sourcemap && npm run buildgui && npm run pack`
   - 确认 asar 内 `dist/client` + `dist/public/js-rpc` 存在
   - 多次验证 win-unpacked exe

### 结果
- 提交任务现在**立即返回**，不阻塞。
- 作用域错误消除。
- 后台错误被捕获，不会轻易让 submit 导致闪退。
- 用户可通过运行日志观察真实执行（Fetch/Generate 日志持续写入）。

## 当前状态 & 经验总结
### 已验证
- 启动路径（win-unpacked 测试）：加载 `...resources/app.asar/dist/client/index.html`，有 “页面加载完成” 日志。
- 打包产物：client bundle 正确（ESM，非 cjs）。
- asar + 健壮路径：packaged 下用 `process.resourcesPath/app.asar`。
- lazy js-rpc + 非阻塞任务：启动轻量，提交不卡。

### 仍需用户验证（win-unpacked）
- 提交任务后是否不再闪退。
- 运行日志 tab 是否正常刷新。
- DevTools console 是否有剩余错误（preload 加载、签名、cookie 更新等）。
- 完整任务是否能跑完并打开输出文件夹。

### 经验 & 潜在坑（给未来维护）
1. **打包路径陷阱**：
   - `app.getAppPath()` 在 asar:true 下返回 asar 文件路径，`__dirname` 虚拟路径。
   - 始终优先 `process.resourcesPath + 'app.asar'`（对 NSIS 安装器最稳）。
   - Chinese 路径 + asar 组合要多测试。
2. **构建顺序**：
   - 永远 `build-without-sourcemap && buildgui` 再 electron-builder。
   - build 脚本要防御 deps 缺失 + 失败报错。
3. **Electron 启动/窗口**：
   - 双击问题 → 必须 `second-instance` + focus。
   - 白屏 → `show: false` + ready-to-show + did-finish + 兜底 + 失败降级页。
   - 总是创建隐藏窗口（js-rpc）会拖慢启动 → lazy + 按需。
4. **长任务 IPC**：
   - 不要在 handle 里 await 几分钟操作 → 后台执行 + 立即返回 + 日志轮询。
   - renderer 必须 await + try/catch。
5. **错误处理**：
   - 主进程必须有 uncaughtException + unhandledRejection log。
   - 命令层（BaseCommand）已用 global error + rethrow，顶层再 catch。
   - 签名/网络失败要优雅降级（已有 403/429 标记）。
6. **测试建议**：
   - win-unpacked 先验证（快）。
   - 再 `npm run dist` 产新 Setup。
   - 提交任务时开 DevTools 看 console + runtime.log。
   - 注意 asarUnpack 只覆盖 native，JS 文件必须在 asar 里正确。

### 下一步建议
- 用户提供 DevTools console + runtime.log 片段（如果还闪）。
- 如需，可加更细的 try/catch、任务进度事件、或把 js-rpc 签名移到 worker。
- 保持 `win-unpacked` 用于快速迭代，Setup 只在稳定后产。

文档生成时间：2026-07-03（基于多次 terminal 验证、code review、asar list 检查）。
所有修改已 commit（本地，未 push，按用户要求）。

如需补充细节或继续修复，请提供最新日志！