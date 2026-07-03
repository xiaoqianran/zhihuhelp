import path from 'path'

// Directory containing package.json (inside asar or app/ folder). Used to read bundled files like package.json.
function getAppDir(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron')
    if (electron.app && electron.app.isPackaged) {
      return electron.app.getAppPath()
    }
  } catch (_) {}
  return path.resolve(__dirname, '../../')
}

// Writable root for user-facing files (电子书 outputs, caches, config, logs, sqlite).
// On installed Windows app this is the folder next to 知乎助手.exe (not inside resources).
function getDataRoot(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron')
    if (electron.app && electron.app.isPackaged) {
      return path.dirname(process.execPath)
    }
  } catch (_) {}
  return path.resolve(__dirname, '../../')
}

const appDir = getAppDir()
const dataRoot = getDataRoot()

export default class PathConfig {
  // Writable root (next to exe in packaged builds)
  static readonly rootPath = dataRoot

  // 项目打包时只打包dist目录, 因此路径中不能带src
  // resourcePath points to dist/public inside the packaged app dir (uses __dirname which resolves inside asar correctly)
  static readonly resourcePath = path.resolve(path.resolve(__dirname, '../'), 'public')

  static readonly cachePath = path.resolve(PathConfig.rootPath, '缓存文件')
  static readonly imgCachePath = path.resolve(PathConfig.cachePath, 'imgPool')
  static readonly htmlCachePath = path.resolve(PathConfig.cachePath, 'html')
  static readonly epubCachePath = path.resolve(PathConfig.cachePath, 'epub')
  static readonly outputPath = path.resolve(PathConfig.rootPath, '知乎助手输出的电子书')
  static readonly epubOutputPath = path.resolve(PathConfig.outputPath, 'epub')
  static readonly htmlOutputPath = path.resolve(PathConfig.outputPath, 'html')

  // package.json (read from internal app dir, works with asar)
  static readonly packageJsonUri = path.resolve(appDir, 'package.json')

  // 本地配置文件, 随时更新
  static readonly configUri = path.resolve(PathConfig.rootPath, 'config.json')
  static readonly runtimeLogUri = path.resolve(PathConfig.rootPath, 'runtime.log')

  static readonly allPathList = [
    PathConfig.rootPath,
    PathConfig.cachePath,
    PathConfig.imgCachePath,
    PathConfig.htmlCachePath,
    PathConfig.outputPath,
    PathConfig.epubOutputPath,
    PathConfig.htmlOutputPath,
  ]
}
