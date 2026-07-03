# gitingest 推荐用法（针对本项目）

本项目使用 gitingest 生成 LLM 友好的代码摘要时，**强烈建议使用以下配置**，而不是直接 `gitingest .`。

默认命令会把锁文件、样式、构建脚本、文档、日志等大量无用内容也塞进去，浪费 token。

## 1. 最推荐的方式（Python 脚本，一键运行）

直接执行项目根目录下的脚本：

```powershell
# Windows PowerShell / CMD
python gitingest-focused.py

# 指定输出文件名和文件大小限制
python gitingest-focused.py --output my-digest.txt --max-size 1048576

# 输出到 stdout（方便管道）
python gitingest-focused.py --stdout
```

脚本位置：`gitingest-focused.py`

脚本内部已经硬编码了最优的 include / exclude 策略：
- 仅保留核心源码：`src/**` + `client/src/**`
- 保留关键配置和少量文档
- 排除锁文件、样式、构建脚本、doc、日志、产物等

## 2. 使用 .gitingestignore（强烈推荐）

项目根目录已提供 `.gitingestignore` 文件。

有了它之后，即使使用较短的命令也能得到干净结果：

```bash
# 基础推荐命令（配合 .gitingestignore）
gitingest . \
  -i "src/**" \
  -i "client/src/**" \
  -i "README.md" \
  -i "package.json" \
  -i "tsconfig.json" \
  -i "client/package.json" \
  -i "client/tsconfig.json" \
  -i "client/vite.config.ts" \
  -s 2097152 \
  -o zhihuhelp-focused-digest.txt
```

`.gitingestignore` 会自动过滤掉大量垃圾文件。

## 3. 直接使用 Python API（适合集成到其他脚本）

```python
from gitingest import ingest

summary, tree, content = ingest(
    ".",
    include_patterns={
        "src/**",
        "client/src/**",
        "README.md",
        "package.json",
        "tsconfig.json",
        "client/package.json",
        "client/tsconfig.json",
        "client/vite.config.ts",
    },
    exclude_patterns={
        "pnpm-lock.yaml",
        "package-lock.json",
        "**/*.less",
        "**/*.css",
        "client/script/**",
        "doc/**",
        "scripts/**",
        "terminals/**",
        "mcps/**",
    },
    max_file_size=2 * 1024 * 1024,   # 2MB
    output="zhihuhelp-focused-digest.txt",
)
```

## 4. 为什么不直接用 `gitingest .`？

默认行为会包含：
- pnpm-lock.yaml / package-lock.json（体积巨大）
- 大量 *.less / *.css
- client/script/ 下的构建脚本
- doc/ 下的各种排查记录
- terminals/、mcps/ 等开发临时文件
- 各种运行时生成的 json 和日志

这些内容对理解项目核心逻辑帮助很小，却会显著增加 token 消耗。

## 5. 常用参数说明

| 参数                    | 作用                              | 推荐值              |
|-------------------------|-----------------------------------|---------------------|
| `-i / --include-pattern` | 只保留匹配的文件/目录            | src/**, client/src/** |
| `-e / --exclude-pattern` | 额外排除                          | 见上面的 exclude 集合 |
| `-s / --max-size`        | 单文件最大字节数                  | 1048576 ~ 2097152 (1~2MB) |
| `-o / --output`          | 输出文件（- 表示 stdout）         | zhihuhelp-xxx.txt   |
| `--include-gitignored`   | 包含被 .gitignore 忽略的文件      | 一般不需要           |

## 6. 生成的文件建议

- `zhihuhelp-focused-digest.txt` （推荐）
- 每次生成前可以先删掉旧文件，或用不同名字区分版本

## 提示

- gitingest 默认会尊重 `.gitignore` + `.gitingestignore`
- 想永久定制忽略规则 → 编辑 `.gitingestignore`
- 想调整本次包含哪些源码 → 编辑 `gitingest-focused.py` 中的 `get_best_patterns()`
- 大模型上下文紧张时，可以把 `--max-size` 降到 512000（500KB）

使用上面的配置后，生成的 digest 会更干净、更有价值。