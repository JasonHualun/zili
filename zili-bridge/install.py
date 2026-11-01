#!/usr/bin/python3
"""安装字里桥：扫描这台电脑上的命令行 Agent，问你允许字里调用哪几个、收纳到哪个文件夹，
再登记给装了字里的浏览器（Chrome、豆包等，每个只写一个 JSON 文件，不装任何软件）。

用法：python3 install.py                      一步步问你（推荐）
      python3 install.py --allow claude,codex --folder ~/Documents/字里收纳 [--skill 名字]   不问，直接按参数装
      python3 install.py --id <插件ID>          手动指定插件 ID（自动找不到时）
      python3 install.py --uninstall           删除登记和后台服务（收纳文件夹里的内容不动）
"""
import importlib.util
import json
import os
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

HOST_NAME = "com.zili.bridge"
BRIDGE = Path(__file__).resolve().parent / "zili_bridge.py"
EXTENSION_DIR = (Path(__file__).resolve().parent.parent / "huashao-tone").resolve()
APP_SUPPORT = Path.home() / "Library" / "Application Support"
# 基于 Chromium 的浏览器各有自己的登记目录；只登记已经加载了字里的那几个。
BROWSER_DIRS = [APP_SUPPORT / d for d in ("Google/Chrome", "Doubao", "Chromium", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Arc/User Data")]
# macOS 不让浏览器启动的程序读「文稿」，所以运行副本放在 Application Support。
RUNTIME = Path.home() / "Library" / "Application Support" / "zili-bridge"
LAUNCHER = RUNTIME / "zili-bridge"
RUNTIME_BRIDGE = RUNTIME / "zili_bridge.py"
CONFIG = RUNTIME / "config.json"
DEFAULT_FOLDER = Path.home() / "Documents" / "字里收纳"
WORKER_LABEL = "com.zili.bridge.worker"
WORKER_PLIST = Path.home() / "Library" / "LaunchAgents" / (WORKER_LABEL + ".plist")


def find_extension_ids(browser_dir):
    ids = set()
    for prefs in list(browser_dir.glob("*/Secure Preferences")) + list(browser_dir.glob("*/Preferences")):
        try:
            settings = json.loads(prefs.read_text(encoding="utf-8")).get("extensions", {}).get("settings", {})
        except (OSError, ValueError):
            continue
        for ext_id, info in settings.items():
            path = info.get("path") if isinstance(info, dict) else None
            if path and Path(path).resolve() == EXTENSION_DIR:
                ids.add(ext_id)
    return sorted(ids)


def install_worker():
    # 经 osascript 启动，后台服务才能读写「文稿」里的收纳文件夹。
    command = 'exec /usr/bin/python3 "%s" --drain >> "%s" 2>&1' % (RUNTIME_BRIDGE, RUNTIME / "worker.log")
    WORKER_PLIST.parent.mkdir(parents=True, exist_ok=True)
    WORKER_PLIST.write_bytes(plistlib.dumps({
        "Label": WORKER_LABEL,
        "ProgramArguments": ["/usr/bin/osascript", "-l", "JavaScript", "-e",
                             "ObjC.import('stdlib'); $.exit($.system(%s) >> 8)" % json.dumps(command)],
        "WatchPaths": [str(RUNTIME / "queue")],
        "WorkingDirectory": str(RUNTIME),
    }))
    uid = os.getuid()
    subprocess.run(["launchctl", "bootout", "gui/%d/%s" % (uid, WORKER_LABEL)], capture_output=True)
    subprocess.run(["launchctl", "bootstrap", "gui/%d" % uid, str(WORKER_PLIST)], check=True)


def arg(name):
    return sys.argv[sys.argv.index(name) + 1] if name in sys.argv and sys.argv.index(name) + 1 < len(sys.argv) else None


def ask(question, default=""):
    try:
        answer = input(question).strip()
    except EOFError:
        answer = ""
    return answer or default


def load_bridge():
    # 扫描规则和 Agent 名单只在 zili_bridge.py 里维护一份。
    spec = importlib.util.spec_from_file_location("zili_bridge", str(BRIDGE))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def choose_config():
    bridge = load_bridge()
    found = bridge.scan_agents()
    old = {}
    if CONFIG.exists():
        try:
            old = json.loads(CONFIG.read_text(encoding="utf-8"))
        except ValueError:
            pass
    names = ", ".join(a["label"] for a in bridge.AGENTS.values())
    if not found:
        print("这台电脑上没找到字里认识的命令行 Agent（%s）。装好其中一个再运行本脚本。" % names)
        sys.exit(1)
    if arg("--allow") is not None:
        allowed = [k for k in arg("--allow").split(",") if k in found]
    else:
        print("找到了这些 Agent。字里只会调用你允许的，而且只让它在收纳文件夹里读写文件：")
        allowed = []
        for key, path in found.items():
            note = "" if bridge.AGENTS[key]["tested"] else "（未实测）"
            default = "y" if key in old.get("allowed", []) else "n"
            if ask("  允许字里调用 %s%s？%s [y/n，默认 %s] " % (bridge.AGENTS[key]["label"], note, path, default), default).lower().startswith("y"):
                allowed.append(key)
    if not allowed:
        print("一个 Agent 都没允许，没有安装。")
        sys.exit(1)
    folder = arg("--folder") or ask("收纳文件夹放在哪？[回车用 %s] " % (old.get("folder") or DEFAULT_FOLDER), str(old.get("folder") or DEFAULT_FOLDER))
    folder = Path(folder).expanduser().resolve()
    folder.mkdir(parents=True, exist_ok=True)
    skill = arg("--skill")
    if skill is None:
        skill = ask("有自己的收纳 Skill 吗？有就输入名字，没有直接回车（用字里自带的整理规则）：[%s] " % (old.get("skill") or "无"), old.get("skill") or "")
    return {"allowed": allowed, "folder": str(folder), "skill": skill.strip()}


def host_file(browser_dir):
    return browser_dir / "NativeMessagingHosts" / (HOST_NAME + ".json")


def main():
    if "--uninstall" in sys.argv:
        subprocess.run(["launchctl", "bootout", "gui/%d/%s" % (os.getuid(), WORKER_LABEL)], capture_output=True)
        for path in [host_file(d) for d in BROWSER_DIRS] + [LAUNCHER, RUNTIME_BRIDGE, WORKER_PLIST, CONFIG]:
            if path.exists():
                path.unlink()
                print("已删除：%s" % path)
        return
    manual = [arg("--id")] if arg("--id") else []
    targets = {d: manual or find_extension_ids(d) for d in BROWSER_DIRS if d.is_dir()}
    targets = {d: ids for d, ids in targets.items() if ids}
    if not targets:
        print("没在任何浏览器里找到已加载的字里插件。请先在扩展管理页加载 %s，或用 --id 指定插件ID。" % EXTENSION_DIR)
        sys.exit(1)
    config = choose_config()
    RUNTIME.mkdir(parents=True, exist_ok=True)
    (RUNTIME / "queue").mkdir(exist_ok=True)
    CONFIG.write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding="utf-8")
    shutil.copy2(str(BRIDGE), str(RUNTIME_BRIDGE))
    LAUNCHER.write_text('#!/bin/sh\nLOG="$HOME/Library/Application Support/zili-bridge/launch.log"\necho "$(date \'+%%F %%T\') launch $*" >> "$LOG"\nexec /usr/bin/python3 "%s" "$@" 2>> "$LOG"\n' % RUNTIME_BRIDGE, encoding="utf-8")
    os.chmod(str(LAUNCHER), 0o755)
    install_worker()
    for browser_dir, ids in targets.items():
        target = host_file(browser_dir)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps({
            "name": HOST_NAME,
            "description": "字里桥：把网页材料交给本地 Agent 收纳",
            "path": str(LAUNCHER),
            "type": "stdio",
            "allowed_origins": ["chrome-extension://%s/" % i for i in ids],
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        print("已登记：%s（插件 %s）" % (target, ", ".join(ids)))
    print("已允许：%s\n收纳文件夹：%s\n收纳 Skill：%s" % (", ".join(config["allowed"]), config["folder"], config["skill"] or "无（用字里自带规则）"))
    print("运行副本：%s\n后台收纳服务：%s\n要换 Agent 或文件夹、或改了 zili_bridge.py，重跑本脚本即可。重新加载字里插件后生效。" % (RUNTIME_BRIDGE, WORKER_PLIST))


if __name__ == "__main__":
    main()
