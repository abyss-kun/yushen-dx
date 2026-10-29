# -*- coding: utf-8 -*-
"""悬浮条：平时静静待在屏幕边上；点谁，就跟谁说话。

四个按钮：管家 · 助手 · 顾问 · 群聊
  · 点名字 → 开一个跟她的对话小窗（发出去；她回了在这里看）
  · 点群聊 → 三条一起发，回复都汇总到这个窗

拖动：按住左侧那条竖线拖。
收起：点 ✕（守候会在需要时把弹窗叫出来，这个条不影响）。

用法：
  python 悬浮.py            # 起悬浮条
  python 悬浮.py --panel 助手 # 直接开某个人的对话
"""
import argparse
import json
import sys
import threading
import time
import urllib.request
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DHOME = Path.home() / ".dsh" / "dayu"
QUEUE = DHOME / "留言.jsonl"
BASE = Path(__file__).resolve().parent   # 这个脚本就在产出目录里
NAMES = {"管家": "dayu", "助手": "xiaoyu", "顾问": "dragon"}
ORDER = ["管家", "助手", "顾问"]

BG = "#0e1622"
BAR = "#131d2b"
CARD = "#16212f"
FG = "#e8f1fa"
SUB = "#8ea3ba"
GOLD = "#f2bd62"
BLUE = "#3b82f6"
COLOR = {"管家": "#5b9bf3", "助手": "#3ddc97", "顾问": "#b48bf7", "群聊": GOLD}
LOGO = Path(r"<插件目录>\资产\视频\白饭\标志\副-饭山\标志-副-躺饭山-v3-不行了.png")
SMALL = 120         # 收起时的大小（就那个 logo）
BAR_W, BAR_H = 572, 66
CHROMA = "#010203"   # 色键：这个颜色的像素会变透明
CONF = DHOME / "悬浮.json"
MIN_S, MAX_S = 64, 220        # 球可以缩放到这么大


def _read(name, default=""):
    try:
        return (DHOME / name).read_text(encoding="utf-8").strip()
    except Exception:
        return default


def load_conf():
    try:
        return json.loads(CONF.read_text(encoding="utf-8"))
    except Exception:
        return {}


def save_conf(d):
    try:
        cur = load_conf()
        cur.update(d)
        CONF.write_text(json.dumps(cur, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def deliver(who, text):
    role = NAMES.get(who, who)
    host, tk = _read("base-url"), _read("api-token")
    detail = ""
    if host and tk:
        try:
            body = json.dumps({"role": role, "text": text}).encode("utf-8")
            req = urllib.request.Request(
                f"http://{host}/api/dayu/residence/say", data=body,
                headers={"Content-Type": "application/json; charset=utf-8", "x-yushen-token": tk},
                method="POST")
            with urllib.request.urlopen(req, timeout=6) as r:
                out = json.loads(r.read().decode("utf-8"))
                if out.get("ok"):
                    return True, out.get("sessionId", "")[:10]
        except Exception as e:
            detail = str(e)[:60]
    try:
        with QUEUE.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"at": datetime.now().isoformat(timespec="seconds"),
                                "who": who, "role": role, "text": text}, ensure_ascii=False) + "\n")
        return False, detail or "已排进留言，她醒来会看到"
    except Exception as e:
        return False, f"失败：{e}"


def send_to(who, text):
    if who == "群聊":
        rs = [deliver(n, text)[0] for n in ORDER]
        return True, ("三条都送到了" if all(rs) else f"送到 {sum(rs)}/3，其余排进留言")
    ok, d = deliver(who, text)
    return ok, ("送到" if ok else d)


def chat_window(root, who):
    import tkinter as tk
    from tkinter import font as tkfont

    win = tk.Toplevel(root)
    win.title(f"跟{who}说话")
    win.configure(bg=BG)
    W, H = 560, 460
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    win.geometry(f"{W}x{H}+{sw - W - 120}+{sh - H - 120}")
    win.attributes("-topmost", True)

    f_name = tkfont.Font(family="Microsoft YaHei", size=14, weight="bold")
    f_msg = tkfont.Font(family="Microsoft YaHei", size=12)
    f_tip = tkfont.Font(family="Microsoft YaHei", size=9)

    head = tk.Frame(win, bg=BG)
    head.pack(fill="x", padx=14, pady=(12, 4))
    tk.Label(head, text=who, bg=BG, fg=COLOR.get(who, FG), font=f_name).pack(side="left")
    state = tk.StringVar(value="")
    tk.Label(head, textvariable=state, bg=BG, fg=SUB, font=f_tip).pack(side="right")

    log = tk.Text(win, bg=CARD, fg=FG, bd=0, font=f_msg, padx=12, pady=10, wrap="word", state="disabled")
    log.pack(fill="both", expand=True, padx=14, pady=6)

    def append(who_said, text):
        log.configure(state="normal")
        log.insert("end", f"{who_said}：{text}\n\n")
        log.see("end")
        log.configure(state="disabled")

    body = tk.Frame(win, bg=BG)
    body.pack(fill="x", padx=14, pady=(0, 12))
    entry = tk.Text(body, height=3, bg=CARD, fg=FG, insertbackground=FG, bd=0,
                    font=f_msg, padx=10, pady=8, wrap="word")
    entry.pack(side="left", fill="both", expand=True)

    def send(_=None):
        text = entry.get("1.0", "end").strip()
        if not text:
            return "break"
        ok, d = send_to(who, text)
        append("我", text)
        state.set(d if not ok else "已送出")
        entry.delete("1.0", "end")
        return "break"

    tk.Button(body, text="发", command=send, bg=BLUE, fg="#fff", relief="flat", bd=0,
              font=f_name, width=4, cursor="hand2").pack(side="right", padx=(8, 0), fill="y")
    entry.bind("<Control-Return>", send)
    entry.focus_set()
    return win






def frameless(win, title, W, H, accent=GOLD):
    """统一的窗口样子：无系统标题栏、深色、左上角标题、右上角✕、可拖。"""
    import tkinter as tk
    from tkinter import font as tkfont

    win.overrideredirect(True)
    win.configure(bg=BG)
    cv = tk.Canvas(win, width=W, height=H, bg=BG, highlightthickness=0, bd=0)
    cv.pack(fill="both", expand=True)
    cv.create_rectangle(0, 0, W - 1, H - 1, fill=CARD, outline="#22303f", width=1)
    cv.create_rectangle(0, 0, W - 1, 3, fill=accent, outline="")
    f_t = tkfont.Font(family="Microsoft YaHei", size=11, weight="bold")
    cv.create_text(18, 26, text=title, anchor="w", fill=accent, font=f_t)
    cv.create_text(W - 20, 26, text="✕", fill=SUB,
                   font=tkfont.Font(family="Microsoft YaHei", size=12, weight="bold"), tags="x")
    cv.tag_bind("x", "<Button-1>", lambda e: win.destroy())
    cv.tag_bind("x", "<Enter>", lambda e: cv.itemconfig("x", fill=FG))
    cv.tag_bind("x", "<Leave>", lambda e: cv.itemconfig("x", fill=SUB))
    drag = {"x": 0, "y": 0}
    cv.bind("<Button-1>", lambda e: drag.update(x=e.x, y=e.y))
    cv.bind("<B1-Motion>", lambda e: win.geometry(
        f"+{win.winfo_x() + e.x - drag['x']}+{win.winfo_y() + e.y - drag['y']}"))
    body = tk.Frame(win, bg=CARD)
    body.place(x=0, y=44, width=W, height=H - 44)
    return cv, body



def status_window(root):
    """看状态：无标题栏、三张卡、一行一条。"""
    import tkinter as tk
    from tkinter import font as tkfont

    W, H = 660, 600
    win = tk.Toplevel(root)
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    win.geometry(f"{W}x{H}+80+{sh - H - 230}")
    win.attributes("-topmost", True)
    cv, body = frameless(win, "现在", W, H)

    f_name = tkfont.Font(family="Microsoft YaHei", size=13, weight="bold")
    f_t = tkfont.Font(family="Microsoft YaHei", size=11)
    f_s = tkfont.Font(family="Microsoft YaHei", size=10)
    f_tiny = tkfont.Font(family="Microsoft YaHei", size=9)

    stamp = tk.StringVar(value="")
    tk.Label(body, textvariable=stamp, bg=CARD, fg=SUB, font=f_tiny).place(x=W - 130, y=2)

    cards = tk.Frame(body, bg=CARD)
    cards.pack(fill="x", padx=14, pady=(10, 0))
    roles_box = {}
    for name in ORDER:
        card = tk.Frame(cards, bg="#101a27")
        card.pack(fill="x", pady=5)
        top = tk.Frame(card, bg="#101a27")
        top.pack(fill="x", padx=12, pady=(8, 0))
        tk.Label(top, text="●", bg="#101a27", fg=COLOR[name], font=f_name).pack(side="left")
        tk.Label(top, text=name, bg="#101a27", fg=COLOR[name], font=f_name).pack(side="left", padx=(4, 10))
        hb = tk.Label(top, text="", bg="#101a27", fg=SUB, font=f_s)
        hb.pack(side="right")
        doing = tk.Label(card, text="", bg="#101a27", fg=FG, font=f_t, anchor="w")
        doing.pack(fill="x", padx=12, pady=(2, 0))
        done = tk.Label(card, text="", bg="#101a27", fg=SUB, font=f_tiny, anchor="w")
        done.pack(fill="x", padx=12, pady=(0, 8))
        roles_box[name] = (hb, doing, done)

    tk.Label(body, text="在网的片子", bg=CARD, fg=GOLD, font=f_s).pack(anchor="w", padx=16, pady=(12, 2))
    videos = tk.Frame(body, bg="#101a27")
    videos.pack(fill="x", padx=14)
    vid_labels = []
    for _ in range(2):
        row = tk.Frame(videos, bg="#101a27")
        row.pack(fill="x", padx=12, pady=4)
        t1 = tk.Label(row, text="", bg="#101a27", fg=FG, font=f_t, anchor="w")
        t1.pack(side="left")
        t2 = tk.Label(row, text="", bg="#101a27", fg=SUB, font=f_s, anchor="e")
        t2.pack(side="right")
        vid_labels.append((t1, t2))

    money = tk.Label(body, text="", bg=CARD, fg=SUB, font=f_s, anchor="w")
    money.pack(fill="x", padx=18, pady=(10, 4))

    def cut(t, n):
        t = str(t or "")
        return t if len(t) <= n else t[:n - 1] + "…"

    def refresh():
        for name in ORDER:
            role = NAMES[name]
            hb, doing, done = roles_box[name]
            try:
                v = json.loads((DHOME / "runtime" / role / "vital.json").read_text(encoding="utf-8"))
                dt = datetime.fromisoformat(str(v.get("lastTickAt", "")).replace("Z", "+00:00")).astimezone().replace(tzinfo=None)
                mins = (datetime.now() - dt).total_seconds() / 60
                hb.configure(text=f"{'活着' if mins < 40 else '停了'} · {mins:.0f} 分钟前",
                             fg=SUB if mins < 40 else "#ef5b5b")
            except Exception:
                hb.configure(text="读不到心跳", fg="#ef5b5b")
            acts = []
            try:
                ag = json.loads((DHOME / "runtime" / role / "agenda.json").read_text(encoding="utf-8"))
                acts = [i.get("what", "") for i in (ag.get("items") or [])
                        if i.get("state") in ("doing", "want", "blocked")]
            except Exception:
                pass
            doing.configure(text=("手上：" + cut(acts[0], 22) + (f"（+{len(acts)-1}）" if len(acts) > 1 else ""))
                            if acts else "手上：没有活")
            last = ""
            try:
                rows = (DHOME / "soul" / "deliveries" / f"{role}.jsonl").read_text(encoding="utf-8").splitlines()
                if rows:
                    last = json.loads(rows[-1]).get("what", "")
            except Exception:
                pass
            done.configure(text=("最近交了：" + cut(last, 24)) if last else "最近没交过验过的活")

        try:
            logs = sorted((BASE / "运营").glob("数据-*.jsonl"))
            latest = {}
            if logs:
                for line in logs[-1].read_text(encoding="utf-8").splitlines():
                    r = json.loads(line)
                    latest[r.get("bvid")] = r
            items = list(latest.values())[:2]
            for i, (t1, t2) in enumerate(vid_labels):
                if i < len(items):
                    r = items[i]
                    st = r.get("stat") or {}
                    t1.configure(text=cut(r.get("title", ""), 18))
                    t2.configure(text=f"播放 {st.get('view',0)} · 赞 {st.get('like',0)} · 藏 {st.get('favorite',0)}")
                else:
                    t1.configure(text="—")
                    t2.configure(text="")
        except Exception:
            for t1, t2 in vid_labels:
                t1.configure(text="读不到数据")
                t2.configure(text="")

        try:
            u = json.loads((Path.home() / ".dsh" / ".dshw-usage.json").read_text(encoding="utf-8"))
            today = datetime.now().strftime("%Y-%m-%d")
            ev = [e for e in u.get("events", []) if e.get("day") == today]
            cost = sum(float(e.get("cost", 0)) for e in ev)
            money.configure(text=f"今天 {cost:.2f} 元（{len(ev)} 次）· 余额 {float(u.get('lastBalance', 0)):.2f}")
        except Exception:
            money.configure(text="今天的花费读不到")
        stamp.set(datetime.now().strftime("%H:%M:%S") + " 刷新")
        win.after(30000, refresh)

    refresh()
    return win


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--panel", default="")
    ap.add_argument("--expand", action="store_true")
    a = ap.parse_args()

    import tkinter as tk
    from PIL import Image, ImageTk, ImageDraw, ImageFilter
    try:
        import ctypes
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:
        pass

    root = tk.Tk()
    root.overrideredirect(True)
    root.configure(bg=CHROMA)
    try:
        root.attributes("-transparentcolor", CHROMA)
    except Exception:
        pass
    sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    conf = load_conf()
    size = int(conf.get("size", SMALL))
    size = max(MIN_S, min(MAX_S, size))
    px_, py_ = int(conf.get("x", 40)), int(conf.get("y", sh - size - 120))
    root.geometry(f"{size}x{size}+{px_}+{py_}")
    root.attributes("-topmost", True)

    canvas = tk.Canvas(root, width=SMALL, height=SMALL, bg=CHROMA, highlightthickness=0, bd=0)
    canvas.pack(fill="both", expand=True)

    state = {"open": False, "size": size, "ball": None}
    made = {}

    # ── logo 图：4 倍超采样再缩小，边缘干净（没有黑点）──
    logo_img = None
    card_pil = None
    if LOGO.exists():
        K = 4
        S = SMALL * K
        art = Image.open(LOGO).convert("RGBA")
        sc = (S * 1.06) / max(art.size)          # 稍微出血，避免边上留缝
        art = art.resize((max(1, int(art.width * sc)), max(1, int(art.height * sc))), Image.LANCZOS)
        card = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        # 底座：圆角方块（比整窗略小，留 2px 给描边）
        pad = 2 * K
        base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        ImageDraw.Draw(base).rounded_rectangle(
            [pad, pad, S - 1 - pad, S - 1 - pad], radius=26 * K, fill=(15, 21, 31, 246))
        card = Image.alpha_composite(card, base)
        # 把她放进去（裁到圆角方块内）
        tmp = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        tmp.paste(art, ((S - art.width) // 2, (S - art.height) // 2), art)
        mask = Image.new("L", (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([pad, pad, S - 1 - pad, S - 1 - pad], radius=26 * K, fill=255)
        card = Image.composite(Image.alpha_composite(card, tmp), card, mask)
        # 一道很细的亮边
        ImageDraw.Draw(card).rounded_rectangle(
            [pad, pad, S - 1 - pad, S - 1 - pad], radius=26 * K,
            outline=(110, 160, 225, 90), width=1 * K)
        # 缩小到实际尺寸
        card = card.resize((SMALL, SMALL), Image.LANCZOS)
        # 圆角外的像素涂成色键，保证完全透明
        final = Image.new("RGBA", (SMALL, SMALL), (1, 2, 3, 255))
        fm = Image.new("L", (SMALL, SMALL), 0)
        ImageDraw.Draw(fm).rounded_rectangle([0, 0, SMALL - 1, SMALL - 1], radius=26, fill=255)
        final.paste(card, (0, 0), fm)
        logo_img = ImageTk.PhotoImage(final.convert("RGB"))
        card_pil = final.convert("RGB")

    def make_ball(sz):
        """球：就是那张圆角卡片，按当前大小缩放。"""
        if card_pil is None:
            return Image.new("RGB", (sz, sz), (1, 2, 3))
        if int(sz) == SMALL:
            return card_pil.copy()
        return card_pil.resize((int(sz), int(sz)), Image.LANCZOS)

    def draw_small():
        st = state
        sz = st.get("size", size)
        canvas.configure(width=sz, height=sz)
        root.geometry(f"{sz}x{sz}")
        canvas.delete("all")
        img = make_ball(sz)
        ph = ImageTk.PhotoImage(img)
        st["ball"] = ph                      # 保住引用
        canvas.create_image(0, 0, image=ph, anchor="nw")

    def rescale(step):
        st = state
        sz = max(MIN_S, min(MAX_S, st["size"] + step))
        st["size"] = sz
        save_conf({"size": sz, "x": root.winfo_x(), "y": root.winfo_y()})
        if state["open"]:
            draw_bar()
        else:
            draw_small()

    def open_chat(who):
        if who in made and made[who].winfo_exists():
            made[who].deiconify(); made[who].lift(); return
        if who == "看状态":
            made[who] = status_window(root)
        else:
            made[who] = chat_window(root, who)

    def draw_bar():
        W, H = BAR_W, BAR_H
        canvas.configure(width=W, height=H)
        root.geometry(f"{W}x{H}")
        canvas.delete("all")
        canvas.create_rectangle(0, 0, W - 1, H - 1, fill=BAR, outline="#243449", width=1)
        canvas.create_rectangle(8, 16, 12, H - 16, fill=GOLD, outline="", tags="grip")
        x = 26
        for name in ORDER + ["群聊", "看状态"]:
            bw_ = 78 if name != "看状态" else 88
            r = canvas.create_rectangle(x, 13, x + bw_, H - 13, fill="#1b2838", outline="")
            t = canvas.create_text(x + bw_ / 2, H / 2, text=name,
                                   fill=COLOR.get(name, FG), font=("Microsoft YaHei", 11, "bold"))
            for item in (r, t):
                canvas.tag_bind(item, "<Button-1>", lambda e, n=name: open_chat(n))
                canvas.tag_bind(item, "<Enter>", lambda e, rr=r: canvas.itemconfig(rr, fill="#26374b"))
                canvas.tag_bind(item, "<Leave>", lambda e, rr=r: canvas.itemconfig(rr, fill="#1b2838"))
            x += bw_ + 8
        # ✕ 单独放在最右，留出 34px，不压在按钮上
        canvas.create_text(W - 20, H / 2, text="✕", fill=SUB,
                           font=("Microsoft YaHei", 13, "bold"), tags="x")
        canvas.tag_bind("x", "<Button-1>", lambda e: collapse())
        canvas.tag_bind("grip", "<Button-1>", lambda e: collapse())
        canvas.tag_bind("grip", "<Button-3>", lambda e: collapse())

    def expand():
        state["open"] = True
        draw_bar()

    def collapse():
        state["open"] = False
        state["just_collapsed"] = True
        draw_small()
        # 收起之后的这一下点击不要再被 release() 当成"点开了"
        root.after(400, lambda: state.update(just_collapsed=False))

    # 拖动 + 点击（不动才算点）
    drag = {"x": 0, "y": 0, "moved": False}

    def press(e):
        drag.update(x=e.x, y=e.y, moved=False)

    def motion(e):
        if abs(e.x - drag["x"]) + abs(e.y - drag["y"]) > 4:
            drag["moved"] = True
        root.geometry(f"+{root.winfo_x() + e.x - drag['x']}+{root.winfo_y() + e.y - drag['y']}")

    def release(e):
        if not drag["moved"] and not state["open"] and not state.get("just_collapsed"):
            expand()

    def wheel(e):
        if e.delta > 0:
            rescale(8)
        elif e.delta < 0:
            rescale(-8)
        return "break"

    canvas.bind("<MouseWheel>", wheel)
    canvas.bind("<Control-MouseWheel>", wheel)
    canvas.bind("<Button-1>", press)
    canvas.bind("<B1-Motion>", motion)
    canvas.bind("<ButtonRelease-1>", release)

    draw_small()
    if getattr(a, "expand", False):
        expand()
    if a.panel:
        open_chat(a.panel)
    root.mainloop()


if __name__ == "__main__":
    main()
