process.env.NODE_ENV = 'production'

let shell = require('shelljs')
let path = require('path')

let clientBasePath = path.resolve(__dirname, '..')
// 静态资源整体打包输出到 dist/client 下
let generatePath = path.resolve(clientBasePath, 'dist')
let targetPath = path.resolve(clientBasePath, '..', 'dist', 'client')

// Ensure client has its dependencies (vite etc). Only install if missing to keep normal builds fast.
const viteBin = path.join(clientBasePath, 'node_modules', '.bin', process.platform === 'win32' ? 'vite.cmd' : 'vite')
if (!shell.test('-f', viteBin)) {
  console.log('client/node_modules 缺失或不完整，正在执行 npm install（首次或环境变更时需要）...')
  const installRes = shell.exec(`npm --prefix "${clientBasePath}" install --no-audit --no-fund --prefer-offline`, { silent: false })
  if (installRes.code !== 0) {
    console.error('client 依赖安装失败，后续构建可能失败。请手动进入 client 目录执行 npm install')
  }
}

shell.cd(clientBasePath)

// 清理旧资源
let distPath = path.resolve(clientBasePath, 'dist')
console.log(`清空旧构建结果 => ${distPath}`)
if (typeof distPath !== 'string' || distPath.length < 3) {
  console.warn('distPath/mapPath长度过短，自动退出')
  shell.exit(10004)
}
shell.rm('-rf', distPath)
console.log('旧构建结果清理完毕')

// 构建新项目
console.log('开始构建新项目')
const buildRes = shell.exec('npm run build')
if (buildRes.code !== 0) {
  console.error('前端构建失败！请检查上面日志。白屏问题常见于前端构建未成功或产物未复制。')
  shell.exit(buildRes.code)
}
console.log('静态资源构建完毕')

// 复制静态资源到electron项目中
console.log(`删除旧静态资源目录 => ${targetPath}`)
shell.rm('-rf', targetPath)
console.log(`创建新资源目录 => ${targetPath}`)
shell.mkdir('-p', targetPath)
console.log(`复制文件 ${generatePath} => ${targetPath}`)
// 不复制dist本身这一层目录, 使最终结果更容易理解
const cpRes = shell.cp('-rf', generatePath + '/*', targetPath)
if (cpRes.code !== 0) {
  console.error('复制前端构建产物失败')
  shell.exit(1)
}
console.log(`构建完成，client 产物已复制到 ${targetPath}`)
