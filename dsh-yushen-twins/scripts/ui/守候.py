# -*- coding: utf-8 -*-
"""守候：常驻一个进程，专门盯着"有没有事要找老板"。

为什么要常驻：
  · 每次临时起一个 Python + Tk 要一两秒，慢，而且容易叠成好几个窗
  · DPI/位置每次重算，容易错
  常驻一个，只在有活时起一个弹窗，一个接一个，不叠。

它做什么：
  1) 每 3 秒看一次 待确认.jsonl
  2) 有就起 弹窗.py（阻塞，等老板点完）
  3) 点完写回执，继续盯

单实例：用 pid 锁，重复启动会自己退出。

用法：
  python 守候.py            # 前台跑（调试）
  python 守候.py --install  # 放进开机启动（用户 Startup 目录，不需要管理员）
  python 守候.py --stop     # 停掉常驻
"""
import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

PY = sys.executable
BASE = Path(r"<插件目录>\工作区")
POPUP = Path(__file__).resolve().parent / "弹窗.py"
FLOAT = Path(__file__).resolve().parent / "悬浮.py"
DHOME = Path.home() / ".dsh" / "dayu"
FLOAT_PID = DHOME / "悬浮.pid"
QUEUE = DHOME / "待确认.jsonl"
LOCK = DHOME / "守候.pid"
LOG = DHOME / "守候.log"
STARTUP = Path(os.environ.get("APPDATA", "")) / "Microsoft" / "Windows" / "Start Menu" / "Programs" / "Startup"


def log(msg):
    line = f"{datetime.now():%m-%d %H:%M:%S} {msg}"
    print(line, flush=True)
    try:
        with LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def alive(pid):
    try:
        out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}"], capture_output=True, text=True)
        return str(pid) in (out.stdout or "")
    except Exception:
        return False


def already_running():
    try:
        pid = int(LOCK.read_text(encoding="utf-8").strip())
        return pid if alive(pid) else 0
    except Exception:
        return 0


def pending_count():
    try:
        return len([l for l in QUEUE.read_text(encoding="utf-8").splitlines() if l.strip()])
    except Exception:
        return 0


def loop():
    mine = os.getpid()
    other = already_running()
    if other and other != mine:
        log(f"已经有一个在守（pid {other}），这个退出")
        return
    LOCK.parent.mkdir(parents=True, exist_ok=True)
    LOCK.write_text(str(mine), encoding="utf-8")
    log(f"守候启动 pid={mine}")

    # 顺手把悬浮条拉起来（单实例）
    def ensure_float():
        try:
            if FLOAT_PID.exists():
                pid = int(FLOAT_PID.read_text(encoding="utf-8").strip())
                if alive(pid):
                    return
            if not FLOAT.exists():
                return
            ch = subprocess.Popen([PY, str(FLOAT)], creationflags=0x00000008,
                                  stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            FLOAT_PID.write_text(str(ch.pid), encoding="utf-8")
            log(f"悬浮条已起 pid={ch.pid}")
        except Exception as e:
            log(f"悬浮条没起来：{e}")

    ensure_float()

    idle = 0
    while True:
        n = pending_count()
        if n:
            log(f"有待确认 {n} 条，叫弹窗")
            try:
                subprocess.run([PY, str(POPUP)], timeout=600)
            except Exception as e:
                log(f"弹窗出错：{e}")
            idle = 0
        else:
            if idle % 20 == 0:
                ensure_float()
            idle += 1
            if idle % 200 == 1:      # 每十分钟报一次还在
                log("还在守，没有事")
        time.sleep(3)


def install():
    STARTUP.mkdir(parents=True, exist_ok=True)
    cmd = STARTUP / "鱼神守候.cmd"
    cmd.write_text(f'@echo off\r\nstart "" "{PY}" "{BASE / "守候.py"}"\r\n', encoding="gbk", errors="replace")
    log(f"已放进开机启动：{cmd}")
    print(f"开机启动已装：{cmd}")


def stop():
    pid = already_running()
    if not pid:
        print("没在跑")
        return
    subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True)
    try:
        LOCK.unlink()
    except Exception:
        pass
    print(f"已停 pid {pid}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--install", action="store_true")
    ap.add_argument("--stop", action="store_true")
    a = ap.parse_args()
    if a.install:
        install()
        return
    if a.stop:
        stop()
        return
    loop()


if __name__ == "__main__":
    main()
