# Windows 打包抓取链路修复关键记录

本文记录 2026-07-03 这次 Windows packaged 版本从“跑不出来/闪退”到“任务链路跑通并生成 EPUB”的真实关键点。重点不是罗列所有尝试，而是把真正影响结果的节点写清楚，避免后续再被表象误导。

## 最终结论

这次问题不是单一 bug，而是四个问题叠加：

1. `asar:true` 会引入新的资源路径和 native 模块不确定性。先切回 `asar:false` 是正确排查方向。
2. `asar:false` 后，packaged 资源根目录是 `resources/app`，旧代码仍固定找 `resources/app.asar`，导致页面、preload、js-rpc 签名窗口路径错误。
3. GUI 里用 `ace.handle()` + `generate:manifest` 调任务不可靠。manifest 生成失败或命令未注册时，链路会出现“日志看似完成，但真实 Fetch/Generate 根本没执行”的假成功。
4. 真实任务链路跑起来后，又暴露出两个被遮住的问题：
   - 本地 `sharp` 安装不完整，缺 libvips DLL，任务懒加载生成链路时报 native module 错。
   - 单回答、作者回答、收藏夹、话题精华这类“部分回答集合”被当成“整题回答必须完整”校验，导致已经抓到内容仍无法生成。

最终跑通的关键改动：

- 保持 `package.json` 的 `"asar": false`，先保证功能稳定。
- `getAppRootForResources()` 同时兼容 `resources/app.asar` 和 `resources/app`。
- GUI 任务链路改为懒加载命令类，并用 Ace `Kernel.exec()` 显式注册/执行 `InitEnv`、`FetchCustomer`、`GenerateCustomer`。
- 不再在 GUI 运行时调用 `generate:manifest`。
- 执行 `npm rebuild sharp --foreground-scripts`，让 `sharp/build/Release` 补齐 `libglib-2.0-0.dll`、`libgobject-2.0-0.dll`、`libvips-42.dll` 等依赖。
- `Page_Question` 增加 `shouldValidateAnswerCompleteness`，只对整题抓取开启完整性校验；单回答/部分回答集合不再误判为“不完整”。

## 阶段 1：跑不出来和闪退不是“没装成安装包”

用户反馈 `win-unpacked` 可以正常跑，所以第一判断应从“安装器问题”转向 packaged 运行时差异：

- `asar:true` 可能影响 sqlite3、sharp、`.adonisrc.json`、preload、js-rpc、资源文件读取。
- `[TEST]` 入口之前只打日志，没有跑真实任务，所以真实链路的问题被遮住。

因此先把 `package.json` 的 `build.asar` 改回 `false`，重新 `npm run pack`。这是这次排查的分水岭：先稳定功能，不急着优化安装速度。

## 阶段 2：asar:false 后资源路径必须改

`asar:false` 时 electron-builder 输出结构是：

```text
release/win-unpacked/resources/app
```

不是：

```text
release/win-unpacked/resources/app.asar
```

旧的 `getAppRootForResources()` 在 packaged 模式下固定返回 `process.resourcesPath/app.asar`。这会导致：

- 主窗口加载 `dist/client/index.html` 路径错误。
- preload 路径错误。
- 隐藏的 js-rpc 签名窗口路径错误。

修复方式是运行时探测：

```ts
const appAsarPath = path.join(process.resourcesPath, 'app.asar')
if (fs.existsSync(appAsarPath)) {
  return appAsarPath
}
return path.join(process.resourcesPath, 'app')
```

验证结果：

- packaged 版日志显示加载 `release/win-unpacked/resources/app/dist/client/index.html`。
- 通过 CDP 调用 `window.electronAPI['test-js-rpc-window']()` 返回 `true`。
- 日志出现 `js-rpc签名窗口初始化完毕`。

## 阶段 3：任务链路“假成功”的根因是 Ace 调用方式

一开始提交最小任务后，日志出现：

```text
开始抓取数据
开始生成电子书
所有任务执行完毕
```

但中间没有任何：

- `[InitEnv] command start`
- `[FetchCustomer] command start`
- `[GenerateCustomer] command start`
- `准备生成知乎请求签名`

这说明真实命令没有执行。

关键原因：

- GUI 里调用 `ace.handle(['generate:manifest'])` 和 `ace.handle(['Fetch:Customer'])`，这是 CLI 顶层入口思路，不适合主进程内的业务命令派发。
- `generate:manifest` 在 packaged 环境失败时可能走 `process.exit(1)`，且错误不会稳定回到 `runCustomerTask`。
- 没有 manifest 时，自定义命令可能没被找到，造成“看起来执行了，实际没跑”的假成功。

修复方式：

- 删除 GUI 运行时的 `generate:manifest`。
- 在 `asyncRunAceCommand()` 中懒加载命令类。
- 创建 Ace `Kernel`，显式 `register([InitEnv, FetchCustomer, GenerateCustomer])`。
- 用 `kernel.exec(command, [])` 执行。
- 检查 `global.__zhihuhelp_last_command_error` 和 `commandInstance.exitCode`，让失败进入统一日志。

修复后日志开始出现：

```text
[InitEnv] command start
[FetchCustomer] command start
准备生成知乎请求签名
js-rpc签名窗口初始化完毕
问题...回答...成功存入数据库
[GenerateCustomer] command start
```

这才是真正进入任务链路。

## 阶段 4：sharp 不是 asar 问题，而是本地安装不完整

真实链路跑起来后，首次失败在：

```text
Something went wrong installing the "sharp" module
The specified module could not be found.
...\node_modules\sharp\build\Release\sharp-win32-x64.node
```

注意：`sharp-win32-x64.node` 文件本身存在。Windows 上这个错误经常表示 `.node` 依赖的 DLL 找不到，而不是 `.node` 文件不存在。

检查发现 `sharp/build/Release` 最初只有：

```text
libvips-cpp.dll
sharp-win32-x64.node
```

执行：

```powershell
npm rebuild sharp --foreground-scripts
```

之后 `sharp/build/Release` 补齐：

```text
libglib-2.0-0.dll
libgobject-2.0-0.dll
libvips-42.dll
libvips-cpp.dll
sharp-win32-x64.node
```

并且：

```powershell
node -e "const sharp=require('sharp'); console.log(sharp.versions)"
```

可以正常输出版本信息。随后重新 `npm run pack`，release 内也带上完整 DLL 集。

## 阶段 5：无法生成单回答/文章类内容的真实原因是完整性校验过严

单回答任务抓取成功后，生成阶段失败：

```text
问题26784045抓取不完整, 数据库中只有1/16951个回答, 已停止生成电子书。
```

这不是抓取失败，而是生成校验错误地把“单回答任务”当成“整题任务”。

真正应该做完整性校验的场景：

- 抓取某个问题下全部回答。
- 抓取用户提问过的问题，并期望每个问题下回答完整。

不应该做完整性校验的场景：

- 单个回答。
- 用户回答列表。
- 收藏夹内部分回答。
- 话题精华回答。
- 其他本来就是部分集合的内容。

修复方式：

- `Page_Question` 增加 `shouldValidateAnswerCompleteness`，默认 `false`。
- `slice()` 保留这个标志，避免分页后丢失校验语义。
- 只有 `Const_Task_Type_问题` 和“用户提问过的问题”路径创建 `Page_Question` 时显式传 `true`。
- `validateEpubColumn()` 只在该标志为 `true` 时比较 `answer_count`。

结果：

- 单回答任务可以生成 1 条记录的 EPUB/HTML。
- 整题任务仍然会校验回答数，避免半截数据误生成。

## 最终验证

使用 packaged 产物 `release/win-unpacked/知乎助手.exe` 验证：

1. 最小单回答任务：
   - 启动主窗口。
   - 提交 `answer:178802510`。
   - js-rpc 签名窗口初始化成功。
   - 知乎请求签名成功。
   - 回答写入 sqlite 成功。
   - HTML/EPUB 生成成功。

2. 小型整题任务：
   - 提交 `question:2035876773766877676`。
   - 抓取问题信息成功。
   - 抓取 5 个回答成功。
   - 生成 EPUB/HTML 成功。

实际输出示例：

```text
release/win-unpacked/知乎助手输出的电子书/epub/问答混排_2026-07-03 23_46_19.epub
release/win-unpacked/知乎助手输出的电子书/epub/问题_2035876773766877676.epub
```

## 后续注意事项

- 功能稳定前继续保持 `asar:false`。
- 后续若重新开启 `asar:true`，需要单独验证：
  - `resources/app.asar` 路径。
  - `sqlite3` / `sharp` native 模块。
  - `sharp` DLL 是否在 unpack 位置。
  - `.adonisrc.json` / `ace-manifest.json` 是否仍不依赖运行时写入。
  - js-rpc preload 和 index.html 是否能从 asar 内加载。
- 不要再用 `[TEST]` 入口替代真实任务链路做验收；必须至少跑到 `FetchCustomer`、签名、数据库写入和 `GenerateCustomer`。
