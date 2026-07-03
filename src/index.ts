// Modules to control application life and create native browser window
import Electron, { Menu } from 'electron'
import RequestConfig from '~/src/config/request'
import PathConfig from '~/src/config/path'
import CommonConfig from '~/src/config/common'
import CommonUtil from '~/src/library/util/common'
import Logger from '~/src/library/logger'
import { Ignitor } from '@adonisjs/core/build/standalone'
import * as FrontTools from '~/src/library/util/front_tools'
import { setBridgeFunc } from '~/src/library/zhihu_encrypt/index'
import * as Type_TaskConfig from '~/src/type/task_config'
import MSummary from '~/src/model/summary'
import http from '~/src/library/http'
import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'


// 项目初始化时, 自动生成 .adonisrc.json 文件（打包后可能位于asar内只读，失败时忽略）
const adonisRcUri = path.resolve(__dirname, '.adonisrc.json')
const adonisRcTemplateUri = path.resolve(__dirname, 'adonisrc.json')
const adonisRcContent = fs.readFileSync(adonisRcTemplateUri).toString()
const adonisRcConfig = JSON5.parse(adonisRcContent)
try {
  fs.writeFileSync(adonisRcUri, JSON.stringify(adonisRcConfig, null, 2))
} catch (e) {
  // asar true 情况下第一次可能无法写入（只读），后续运行如果已存在于解包位置则可工作
}

const Const_Current_Path = path.resolve(__dirname)
let ace = new Ignitor(Const_Current_Path).ace()
let argv = process.argv
let isDebug = argv.includes('--zhihuhelp-debug')
let { app, BrowserWindow, ipcMain, session, shell } = Electron

// Windows 启动优化开关（减少不必要特性带来的延迟）
// 这些对普通 GUI 应用通常是安全的
app.commandLine.appendSwitch('disable-background-timer-throttling')
app.commandLine.appendSwitch('disable-renderer-backgrounding')
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
  process.exit(0)
}

// Handle second instance launch attempts (e.g. user double-clicks exe/shortcut again).
// Focus the existing window instead of silently doing nothing. This fixes "needs to click twice" symptom on Windows.
app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
  Logger.log('检测到第二次启动实例，聚焦现有主窗口')
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

process.on('uncaughtException', (e) => {
  Logger.log(`主进程未捕获异常=> message:${e?.message}, stack=>${e?.stack}`)
})
process.on('unhandledRejection', (reason) => {
  Logger.log(`主进程未处理Promise异常=>`, reason)
})

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow: Electron.BrowserWindow
// 用于执行远程通信
let jsRpcWindow: Electron.BrowserWindow

let isRunning = false
let isJsRpcReady = false
let resolveJsRpcReady: () => void = () => { }
let jsRpcReadyPromise = new Promise<void>((resolve) => {
  resolveJsRpcReady = resolve
})

// 按需创建 js-rpc 签名窗口（lazy）。首次需要签名时才真正创建第二个 BrowserWindow，
// 显著减少普通启动时的内存和 CPU 开销（用户打开应用看历史数据或配任务时不需要它）。
function ensureJsRpcWindow() {
  if (jsRpcWindow && !jsRpcWindow.isDestroyed()) {
    return jsRpcWindow
  }

  // 重置 ready 状态（万一之前窗口被关闭）
  isJsRpcReady = false
  jsRpcReadyPromise = new Promise<void>((resolve) => {
    resolveJsRpcReady = resolve
  })

  jsRpcWindow = new BrowserWindow({
    enableLargerThanScreen: true,
    width: 760,
    height: 500,
    // 后台签名窗口，彻底隐藏
    show: false,
    skipTaskbar: true,
    // 禁用web安全功能 --> 个人软件
    webPreferences: {
      devTools: true,
      webSecurity: false,
      contextIsolation: true,
      sandbox: false,
      webviewTag: true,
      preload: path.join(getAppRootForResources(), 'dist', 'public', 'js-rpc', 'preload.js'),
    },
  })
  jsRpcWindow.webContents.on('did-finish-load', () => {
    Logger.log(`js-rpc签名窗口页面加载完毕`)
  })
  jsRpcWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    Logger.log(`js-rpc签名窗口页面加载失败:${errorCode}, ${errorDescription}, ${validatedURL}`)
  })
  jsRpcWindow.webContents.on('render-process-gone', (_event, details) => {
    Logger.log(`js-rpc签名窗口渲染进程退出:${JSON.stringify(details)}`)
  })

  const jsRpcUri = getJsRpcIndexPathForLazy() // defined later in scope, fallback
  // Because the helper may not be hoisted, we compute here
  const jsRpcPath = path.join(app.getAppPath(), 'dist', 'public', 'js-rpc', 'index.html')
  jsRpcWindow.loadFile(jsRpcPath)
  return jsRpcWindow
}

// small helper for path (avoid TDZ issues)
function getJsRpcIndexPathForLazy() {
  return path.join(app.getAppPath(), 'dist', 'public', 'js-rpc', 'index.html')
}

const isMacOS = process.platform === 'darwin'

async function asyncCreateWindow() {
  if (process.platform === 'darwin') {
    const template = [
      {
        label: 'Application',
        submenu: [
          {
            label: 'Quit',
            accelerator: 'Command+Q',
            click: function () {
              app.quit()
            },
          },
        ],
      },
      {
        label: 'Edit',
        submenu: [
          { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
          { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
        ],
      },
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
  } else {
    Menu.setApplicationMenu(null)
  }

  const { screen } = Electron
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width,
    height,
    // 自动隐藏菜单栏
    autoHideMenuBar: true,
    // 窗口的默认标题
    title: '知乎助手',
    // 在屏幕中间展示窗口
    center: true,
    // 展示原生窗口栏
    frame: true,
    // 关键：先不 show，避免白屏闪烁，等内容准备好再显示
    show: false,
    backgroundColor: '#ffffff',
    // 禁用web安全功能 --> 个人软件, 要啥自行车
    webPreferences: {
      // 使用preload.js, 以进行rpc通信
      preload: path.join(getAppRootForResources(), 'dist', 'preload.js'),
      // 开启 DevTools.
      devTools: true,
      // 禁用同源策略, 允许加载任何来源的js
      webSecurity: false,
      // 允许 https 页面运行 http url 里的资源
      allowRunningInsecureContent: true,
      // preload + webview 在 Linux 下需要关闭 sandbox
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
      // 启用webview标签
      webviewTag: true,
    },
  })

  // js-rpc 签名窗口现在按需（lazy）创建 —— 大幅提升首屏启动速度。
  // 只有真正开始执行抓取任务、需要签名时才创建第二个渲染进程。
  // 见 ensureJsRpcWindow() 和 asyncJsRpcTriggerFunc。

  // Robust path helpers.
  // Prefer process.resourcesPath + app.asar for packaged installs (NSIS asar:true).
  // Falls back to app.getAppPath() for dev / unpacked.
  function getAppRootForResources() {
    if (app.isPackaged) {
      // In NSIS packaged: resources/app.asar is next to the exe in resources/
      return path.join(process.resourcesPath, 'app.asar')
    }
    return app.getAppPath()
  }
  const appRoot = getAppRootForResources()
  const getClientIndexPath = () => path.join(appRoot, 'dist', 'client', 'index.html')
  const getJsRpcIndexPath = () => path.join(appRoot, 'dist', 'public', 'js-rpc', 'index.html')

  // and load the index.html of the app.
  if (isDebug) {
    // 本地调试 & 打开控制台
    // 注意: 直接访问 http://localhost:8080 是普通浏览器页面, 没有 electronAPI
    // 只有从 Electron 窗口加载时 preload 才会注入 electronAPI
    let useViteDevServer = process.env.ZHIHUHELP_VITE_DEV === '1'
    if (useViteDevServer) {
      mainWindow.loadURL('http://localhost:8080')
    } else {
      // 默认加载已构建页面, 避免 preload 在 dev server 下失效
      const clientPath = getClientIndexPath()
      Logger.log(`[debug] 加载客户端页面: ${clientPath}`)
      mainWindow.loadFile(clientPath)
    }
  } else {
    // 线上地址
    // 构建出来后所有文件都位于dist目录中
    const clientPath = getClientIndexPath()
    Logger.log(`加载客户端页面: ${clientPath}`)
    mainWindow.loadFile(clientPath)

    // 临时打开 DevTools 方便排查白屏问题（用户测试时可以看到 console 错误）
    // 后续可以注释掉
    mainWindow.webContents.openDevTools()

    // 最后兜底：如果 ready-to-show / did-finish 都没触发，2秒后强制显示
    setTimeout(() => {
      if (mainWindow && !mainWindow.isVisible()) {
        Logger.log(`[主窗口] 兜底强制 show 窗口`)
        mainWindow.show()
        mainWindow.focus()
      }
    }, 2000)
  }

  // Log load failures (main cause of white screen if index.html or assets missing after bad build)
  // 失败时加载一个极简的错误页，用户仍可点按钮打开调试面板
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    Logger.log(`[主窗口] 页面加载失败: code=${errorCode}, desc=${errorDescription}, url=${validatedURL}`)
    Logger.log(`[主窗口] 期望的index.html路径: ${getClientIndexPath()}`)
    const errHtml = `<!doctype html><meta charset="utf-8"><style>body{font-family:sans-serif;padding:40px;color:#333;background:#fff} button{padding:8px 16px;margin-top:12px}</style><h2>界面加载失败</h2><p>路径: ${validatedURL || 'unknown'}</p><p>错误: ${errorDescription || errorCode}</p><button onclick="window.electronAPI && window.electronAPI['open-devtools']()">打开调试面板</button>`
    mainWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(errHtml))
  })
  mainWindow.webContents.on('did-finish-load', () => {
    Logger.log(`[主窗口] 页面加载完成`)
  })

  // Standard pattern: show when ready to avoid blank/white screen issues
  mainWindow.once('ready-to-show', () => {
    Logger.log(`[主窗口] ready-to-show`)
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    // @ts-ignore
    mainWindow = null
    // 主窗口关闭时, 如果 js-rpc 子窗口存在也要跟着关闭
    if (jsRpcWindow && !jsRpcWindow.isDestroyed()) {
      jsRpcWindow.close()
    }
    // @ts-ignore
    jsRpcWindow = null
  })

  // 设置ua
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    callback({ cancel: false, requestHeaders: details.requestHeaders })
  })
}

// webview 内知乎登录弹窗会在新窗口打开, 需要拦截后在本 webview 内跳转
app.on('web-contents-created', (_event, contents) => {
  contents.on('render-process-gone', (_event, details) => {
    Logger.log(`渲染进程退出=> type:${contents.getType()}, url:${contents.getURL()}, details:${JSON.stringify(details)}`)
  })

  if (contents.getType() !== 'webview') {
    return
  }
  contents.setWindowOpenHandler(({ url }) => {
    contents.loadURL(url)
    return { action: 'deny' }
  })
})

app.on('child-process-gone', (_event, details) => {
  Logger.log(`Electron子进程退出=> ${JSON.stringify(details)}`)
})

async function asyncUpdateCookie() {
  let cookieContent = ''
  let cookieList = await mainWindow.webContents.session.cookies.get({})
  for (let cookie of cookieList) {
    cookieContent = `${cookie.name}=${cookie.value};${cookieContent}`
  }
  // 将cookie更新到本地配置中
  let config = CommonUtil.getConfig()
  config.requestConfig.cookie = cookieContent
  fs.writeFileSync(PathConfig.configUri, JSON.stringify(config, null, 4))
  Logger.log(`重新载入cookie配置`)
  RequestConfig.reloadTaskConfig()
  return config
}

async function asyncGetZhihuLoginStatus() {
  await asyncUpdateCookie()

  const zhihuCookieList = await session.defaultSession.cookies.get({})
  const zhihuCookieNameList = zhihuCookieList
    .filter((cookie) => {
      const domain = cookie.domain || ''
      return domain === 'zhihu.com' || domain.endsWith('.zhihu.com')
    })
    .map((cookie) => cookie.name)

  return {
    isLogin: zhihuCookieNameList.includes('z_c0'),
    cookieNameList: zhihuCookieNameList,
  }
}

function asyncTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message))
    }, timeoutMs)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((e) => {
        clearTimeout(timer)
        reject(e)
      })
  })
}

async function asyncRunAceCommand(command: string) {
  ; (global as any).__zhihuhelp_last_command_error = null
  await ace.handle([command])
  const commandError = (global as any).__zhihuhelp_last_command_error
  if (commandError) {
    ; (global as any).__zhihuhelp_last_command_error = null
    throw commandError
  }
}

// Quit when all windows are closed.
app.on('window-all-closed', function () {
  // On macOS it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    asyncCreateWindow()
  }
})

// Single place for window + handler registration. Using whenReady is the modern pattern.
app.whenReady().then(() => {
  // Create main window (js-rpc is now lazy)
  asyncCreateWindow()

  // 额外兜底：如果 ready-to-show 比 did-finish-load 更早触发，也确保显示
  if (mainWindow) {
    mainWindow.once('ready-to-show', () => {
      if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show()
        mainWindow.focus()
      }
    })
  }

  // 打开输出文件夹
  ipcMain.handle('open-output-dir', async () => {
    shell.showItemInFolder(PathConfig.outputPath)
    return
  })

  // 获取任务配置
  ipcMain.handle('get-common-config', () => {
    let config = CommonUtil.getConfig()
    return config
  })

  // 检查知乎登录状态
  ipcMain.handle('get-zhihu-login-status', async () => {
    return asyncGetZhihuLoginStatus()
  })

  // 启动任务
  ipcMain.handle('start-customer-task', async (event, { config }: { config: Type_TaskConfig.Type_Task_Config }) => {
    if (isRunning) {
      return '目前尚有任务执行, 请稍后'
    }
    isRunning = true
    try {
      Logger.log('开始工作')

      // 将配置写入本地
      await asyncUpdateCookie()
      let oldConfig = CommonUtil.getConfig()
      config.requestConfig.cookie = oldConfig.requestConfig.cookie
      config.requestConfig.ua = oldConfig.requestConfig.ua
      config.fetchConfig = {
        ...oldConfig.fetchConfig,
        ...config.fetchConfig,
      }
      if ((config.fetchTaskList ?? []).length === 0) {
        throw new Error(`任务配置为空, 未解析到任何可抓取的知乎链接`)
      }
      CommonUtil.saveConfig(config)

      Logger.log(`开始执行任务`)
      Logger.log(`当前抓取方式:${config.fetchConfig?.mode === 'restart' ? '从头抓取' : '继续上次'}`)

      Logger.log(`初始化ace命令集`)
      await ace.handle(['generate:manifest'])
      Logger.log(`初始化运行环境`)
      await asyncRunAceCommand('Init:Env')

      Logger.log(`开始抓取数据`)
      await asyncRunAceCommand('Fetch:Customer')
      Logger.log(`开始生成电子书`)
      await asyncRunAceCommand('Generate:Customer')
      Logger.log(`所有任务执行完毕, 打开电子书文件夹 => `, PathConfig.outputPath)
      // 输出打开文件夹
      shell.showItemInFolder(PathConfig.outputPath)
      return 'success'
    } catch (e: any) {
      Logger.log(`任务执行失败, 已停止后续生成步骤`)
      Logger.log(`失败原因=> message:${e?.message}, stack=>${e?.stack}`)
      return `failed: ${e?.message ?? e}`
    } finally {
      isRunning = false
    }
  })


  ipcMain.handle('get-task-default-title', async (event, { taskId, taskType }: { taskType: any, taskId: string }) => {
    await asyncUpdateCookie()

    let title = await FrontTools.asyncGetTaskDefaultTitle(taskType, taskId)
    return title
  })

  /**
   * 获取数据库内的汇总信息
   */
  ipcMain.handle('get-db-summary-info', async () => {
    const summary = await MSummary.asyncGetSummaryInfo()
    return summary
  })


  // 清空所有登录信息
  ipcMain.handle('clear-all-session-storage', async () => {
    await session.defaultSession.clearCache()
    await session.defaultSession.clearStorageData()
    await session.defaultSession.clearHostResolverCache()

    return true
  })


  /**
   * jsRpc任务管理器
   */
  let taskMap = new Map<
    string,
    {
      method: string
      paramList: any[]
      reslove: (value: any) => void
    }
  >()
  let totalTaskCounter = 0

  async function asyncJsRpcTriggerFunc({ method, paramList }: { method: string; paramList: any[] }) {
    // 关键优化：按需确保 js-rpc 窗口存在（首次抓取时才真正创建）
    ensureJsRpcWindow()

    if (isJsRpcReady === false) {
      Logger.log(`等待js-rpc签名窗口初始化`)
      await asyncTimeout(jsRpcReadyPromise, CommonConfig.request_timeout_ms, `js-rpc签名窗口初始化超时`)
    }
    totalTaskCounter++
    let id = `task-${totalTaskCounter}-${Math.random()}`
    let task = new Promise((reslove) => {
      // 防御：如果窗口被意外销毁再确保一次
      if (!jsRpcWindow || jsRpcWindow.isDestroyed()) {
        ensureJsRpcWindow()
      }
      jsRpcWindow.webContents.send(method, paramList, id)
      taskMap.set(id, {
        method,
        paramList,
        reslove: (value: any) => {
          reslove(value)
        },
      })
    })
    if (isDebug) {
      // Logger.log(
      //   `派发js-rpc请求, 任务id: ${id}, ${JSON.stringify(
      //     {
      //       method,
      //       paramList,
      //       id,
      //     },
      //     null,
      //     2,
      //   )}`,
      // )
    }
    let result = await asyncTimeout(task, CommonConfig.request_timeout_ms, `js-rpc签名请求超时:${id}`)
      .catch((e) => {
        taskMap.delete(id)
        throw e
      })
    if (isDebug) {
      // Logger.log(`id:${id}的js-rpc请求完成`)
    }
    return result
  }
  // 使用js-rpc获取签名
  setBridgeFunc(asyncJsRpcTriggerFunc)

  // 工具函数, 用于在测试时手工触发js-rpc请求
  // ipcMain.handle('js-rpc-trigger', async (event, { method, paramList }) => {
  //   let result = await asyncJsRpcTriggerFunc({ method, paramList })
  //   return JSON.stringify(result)
  // })

  // 回收js-rpc调用响应值
  ipcMain.handle('js-rpc-response', async (event, { id, value }) => {
    // console.log('receive js-rpc-response => ', { id, value })
    if (taskMap.has(id)) {
      taskMap.get(id)?.reslove(value)
      taskMap.delete(id)
    } else {
      Logger.log(`未找到${id}对应的任务`)
    }

    return true
  })

  ipcMain.handle('js-rpc-ready', async () => {
    if (isJsRpcReady === false) {
      Logger.log(`js-rpc签名窗口初始化完毕`)
    }
    isJsRpcReady = true
    resolveJsRpcReady()
    return true
  })

  ipcMain.handle('zhihu-http-get', async (event, { url, params }: { url: string; params: { [key: string]: any } }) => {
    // 调用知乎的get请求
    // console.log('rawUrl => ', url)
    await asyncUpdateCookie()
    let res = await http
      .get(url, {
        params: params,
      })
      .catch((e) => {
        return {}
      })
    return res
  })
  ipcMain.handle('get-log-content', async (event) => {
    // 确保日志文件存在
    if (!fs.existsSync(PathConfig.runtimeLogUri)) {
      fs.writeFileSync(PathConfig.runtimeLogUri, '')
    }
    // 获取日志内容
    let content = fs.readFileSync(PathConfig.runtimeLogUri, 'utf-8')
    if (!!content === false) {
      // 避免为undefined
      content = ""
    }
    const logList = content?.split("\n") ?? []
    if (logList.length > 5000) {
      // 自动清理日志, 控制在2000条以下
      content = logList.slice(logList.length - 2000).join("\n")
      fs.writeFileSync(PathConfig.runtimeLogUri, content)
    }
    return content
  })
  ipcMain.handle('clear-log-content', async (event) => {
    // 清理日志内容
    fs.writeFileSync(PathConfig.runtimeLogUri, '')
    return ""
  })
  ipcMain.handle('open-devtools', async (event) => {
    // 打开调试面板
    mainWindow.webContents.openDevTools()
    return true
  })
  ipcMain.handle('open-js-rpc-window-devtools', async (event) => {
    // 打开jsRpcWindow调试面板（按需创建）
    const w = ensureJsRpcWindow()
    w.show()
    w.webContents.openDevTools()
    return true
  })
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
