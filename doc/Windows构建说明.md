# Windows 构建说明

本文档说明如何在 Windows 上编译原生依赖并打包生成 `.exe` 安装包。

## 前置环境

| 依赖 | 用途 | 说明 |
|------|------|------|
| Node.js | 运行构建工具 | 建议使用 Node 18+ 或 24（与 Linux 开发环境保持一致即可） |
| Visual Studio 2022 | 编译 `sqlite3` / `sharp` | 需安装工作负载 **「使用 C++ 的桌面开发」**，并包含 **MSVC v143** 与 **Windows SDK** |
| Python 3 | 仅供 `node-gyp` 编译原生模块 | **不是**应用内置运行时，安装包用户无需 Python |

## 关于 Python

Python **不是项目内置的**，也**不参与**安装包运行，只在本地执行 `scripts\win-build-native.bat` 或 `npm run dist` 前的原生模块编译阶段使用。

`scripts\win-build-native.bat` 按以下顺序查找 Python：

1. 环境变量 `%PYTHON%`（优先，推荐手动指定）
2. 系统 `PATH` 中的 `python`
3. `%USERPROFILE%\.venv\Scripts\python.exe`
4. `%USERPROFILE%\venv\Scripts\python.exe`

### 推荐配置方式

**方式一（推荐）**：安装 [Python 3.11/3.12](https://www.python.org/downloads/)，安装时勾选 **Add python.exe to PATH**，新开终端后可直接构建。

**方式二**：不改 PATH，仅在构建前设置环境变量：

```cmd
set PYTHON=%USERPROFILE%\.venv\Scripts\python.exe
```

**方式三**：在系统「用户环境变量」中新增 `PYTHON`，值为本机 `python.exe` 的完整路径，适合需要频繁打包的场景。

> 不建议将个人目录写死在脚本或文档中；换机或协作时通过 `%USERPROFILE%`、`%PYTHON%` 等环境变量配置即可。

## 安装依赖

```cmd
npm install --ignore-scripts
```

若完整 `npm install` 在 `sqlite3` 处失败，可先跳过原生编译脚本安装依赖，再执行下文「重编原生模块」步骤。

## 重编原生模块

项目提供脚本自动完成：

- 探测 Visual Studio 与可用的 MSVC 工具链
- 修补 `sqlite3` 的 MSVC 版本冲突（避免 14.40 编译器搭配 14.44 头文件）
- 使用 `@electron/rebuild` 为 Electron 23.2.0 重编 `sqlite3`、`sharp`

```cmd
scripts\win-build-native.bat
```

成功时终端输出 `Rebuild Complete`，并生成 `node_modules\sqlite3\build\Release\node_sqlite3.node`。

## 打包安装包

```cmd
scripts\win-build-dist.bat
```

或分步执行：

```cmd
scripts\win-build-native.bat
npm run dist
```

产物位于 `release\` 目录：

- `知乎助手 Setup 2.5.1.exe` — NSIS 安装包
- `win-unpacked\` — 免安装目录

## 常见问题

### `npm install` 时 sqlite3 编译失败

Windows 上 `sqlite3` 预编译包常无法直接匹配当前 Node/Electron ABI，会回退到源码编译。请确认已安装 VS 2022 C++ 工具链，并优先使用 `scripts\win-build-native.bat`，不要单独依赖 `npm run postinstall-4-win`（其子进程可能丢失编译环境变量）。

### `error STL1001: Unexpected compiler version`

表示 MSVC **编译器版本**与**头文件版本**不一致。脚本已通过 `scripts\patch-sqlite3-vctools.js` 锁定与本地 `cl.exe` 匹配的工具链版本。若仍失败，请在 Visual Studio Installer 中修复 **MSVC v143（最新）** 组件，确保 `cl.exe` 与头文件同属一个工具集版本。

### Linux 能装、Windows 不能

与 Node 版本无关，差异在于：Linux 可用 gcc 从源码编译 `sqlite3`；Windows 需要完整的 MSVC 环境，且 Electron 打包还需针对 Electron ABI 重编原生模块。

## 相关脚本

| 脚本 | 作用 |
|------|------|
| `scripts\win-build-native.bat` | 重编 `sqlite3`、`sharp` |
| `scripts\win-build-dist.bat` | 重编原生模块 + 执行 `npm run dist` |
| `scripts\patch-sqlite3-vctools.js` | 为 `sqlite3` 写入匹配的 `VCToolsVersion` |