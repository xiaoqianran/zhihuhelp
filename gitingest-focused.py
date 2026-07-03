#!/usr/bin/env python3
"""
gitingest 最适合本项目（zhihuhelp）的推荐用法

直接运行：
    python gitingest-focused.py

或者：
    python gitingest-focused.py --output my-digest.txt --max-size 1048576

这个脚本封装了最优的 include / exclude 策略：
- 只保留核心源码：src/** + client/src/**
- 保留关键配置文件和文档
- 排除锁文件、样式文件、构建脚本、文档、日志、产物等无用内容

配合项目根目录的 .gitingestignore 使用效果更好。
"""

from __future__ import annotations

import argparse
from pathlib import Path

from gitingest import ingest


def get_best_patterns() -> tuple[set[str], set[str]]:
    """返回本项目最推荐的 include / exclude patterns。"""

    # 核心有用内容（白名单）
    include_patterns: set[str] = {
        "src/**",
        "client/src/**",
        # 关键根文件
        "README.md",
        "changelog.md",
        "package.json",
        "client/package.json",
        "tsconfig.json",
        "client/tsconfig.json",
        "client/vite.config.ts",
    }

    # 需要排除的无用内容（黑名单）
    exclude_patterns: set[str] = {
        # 依赖锁文件
        "pnpm-lock.yaml",
        "package-lock.json",
        "yarn.lock",

        # 样式文件（如果需要完整前端样式可以注释掉）
        "**/*.less",
        "**/*.css",

        # 构建/开发脚本与产物
        "client/script/**",
        "scripts/**",
        "dist/**",
        "release/**",
        "build/**",

        # 文档与开发记录
        "doc/**",

        # 临时/调试文件
        "terminals/**",
        "mcps/**",
        "**/*.map",
        "*.log",
        "electron_*.log",
        "smoke_*.log",

        # 其他常见无用文件
        "demo.*.json",
        "config.json",
        "task_config_list.json",
    }

    return include_patterns, exclude_patterns


def main() -> None:
    parser = argparse.ArgumentParser(
        description="使用最适合 zhihuhelp 项目的配置运行 gitingest",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "-o", "--output",
        default="zhihuhelp-focused-digest.txt",
        help="输出文件名（默认：zhihuhelp-focused-digest.txt）",
    )
    parser.add_argument(
        "-s", "--max-size",
        type=int,
        default=2 * 1024 * 1024,  # 2MB
        help="单个文件最大字节数（默认 2MB）",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="输出到标准输出而不是文件（用于管道）",
    )

    args = parser.parse_args()

    include_patterns, exclude_patterns = get_best_patterns()

    output_arg = "-" if args.stdout else args.output

    print("🚀 正在使用最优配置运行 gitingest ...")
    print(f"   include: {sorted(include_patterns)}")
    print(f"   exclude: {sorted(exclude_patterns)}")
    print(f"   max_size: {args.max_size} bytes")
    print(f"   output: {output_arg}")
    print()

    summary, tree, content = ingest(
        ".",
        include_patterns=include_patterns,
        exclude_patterns=exclude_patterns,
        max_file_size=args.max_size,
        output=output_arg,
    )

    if args.stdout:
        # 已经输出到 stdout 了
        print("\n" + "=" * 60)
        print("✅ gitingest 完成（输出已通过 stdout）")
    else:
        output_path = Path(output_arg).resolve()
        size = output_path.stat().st_size if output_path.exists() else 0
        print(f"✅ 完成！已生成：{output_path}")
        print(f"   文件大小：{size:,} bytes")
        print()
        print("📄 摘要预览：")
        print(summary[:800])
        print("...")
        print()
        print("提示：")
        print("  - 可直接把生成的 digest 喂给 LLM")
        print("  - 想调整内容请编辑本脚本中的 get_best_patterns()")
        print("  - 推荐同时使用项目根的 .gitingestignore 文件")


if __name__ == "__main__":
    main()
