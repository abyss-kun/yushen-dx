# -*- coding: utf-8 -*-
"""弹窗：整张背景就是界面——没有卡片、没有白框、没有内嵌面板。

老板的要求：整个是一个背景、像 DSH 一样融为一体、字大、排版讲究、能看出是谁在问。

做法：一张 Canvas 铺满她的立绘，左边压暗放字；按钮直接画在背景上（不是控件方块）。

用法：
  python 弹窗.py                     # 处理所有待确认
  python 弹窗.py --list
  python 弹窗.py --ask "话" --title 标题 --options 同意,不同意 --who xiaoyu
  python 弹窗.py --demo [--who xiaoyu]
"""
import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

DHOME = Path.home() / ".dsh" / "dayu"
QUEUE = DHOME / "待确认.jsonl"
RECEIPT = DHOME / "待确认回执.jsonl"

AVATAR = {
    "dayu": Path(r"<插件目录>\工作区\dsh-yushen-twins\assets\avatars\dayu\idle.png"),
    "xiaoyu": Path(r"<插件目录>\工作区\dsh-yushen-twins\assets\avatars\xiaoyu\idle.png"),
    "dragon": Path(r"<插件目录>\工作区\dsh-yushen-twins\assets\avatars\dragon\idle.png"),
}
NAMES = {"dayu": "管家", "xiaoyu": "助手", "dragon": "顾问"}
WALL = {
    "dayu": Path(r"<工作区>\\资产\\角色\\助手\\场景\\助手-场景-b1.png"),
    "xiaoyu": Path(r"<工作区>\\资产\\角色\\助手\\场景\\助手-场景-b4.png"),
    "dragon": Path(r"<工作区>\\资产\\角色\\助手\\场景\\助手-场景-b3.png"),
}

# 高分屏：让坐标就是物理像素，否则窗口会被系统再放大 1.5 倍
try:
    import ctypes as _ct0
    _ct0.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    try:
        _ct0.windll.user32.SetProcessDPIAware()
    except Exception:
        pass

W, H = 1240, 740
INK = "#eaf2fb"
SUB = "#a8bdd4"
GOLD = "#f4c269"
BLUE = "#3f86f0"
BLUE_HI = "#5598ff"
GHOST = "#1d2836"
GHOST_HI = "#2a394b"
CHROMA = "#010203"      # 色键：这个颜色会被抠成透明，圆角外面就露桌面
RADIUS = 24             # 圆角半径


def read_jsonl(p):
    if not p.exists():
        return []
    out = []
    for ln in p.read_text(encoding="utf-8").splitlines():
        ln = ln.strip()
        if ln:
            try:
                out.append(json.loads(ln))
            except Exception:
                pass
    return out


def rewrite(p, rows):
    p.write_text("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + ("\n" if rows else ""),
                 encoding="utf-8")


def ask(title, text, options, who="dayu"):
    rows = read_jsonl(QUEUE)
    item = {"id": f"q-{int(time.time() * 1000)}", "at": datetime.now().isoformat(timespec="seconds"),
            "who": who, "title": title, "text": text, "options": options}
    rows.append(item)
    rewrite(QUEUE, rows)
    return item


def wrap_lines(text, measure, max_w):
    out = []
    for para in text.split("\n"):
        if not para.strip():
            out.append("")
            continue
        cur = ""
        for ch in para:
            if measure(cur + ch) > max_w and cur:
                out.append(cur)
                cur = ch
            else:
                cur += ch
        if cur:
            out.append(cur)
    return out


def gui_dialog(title, text, options, who="dayu"):
    import tkinter as tk
    from tkinter import font as tkfont
    from PIL import Image, ImageTk, ImageFilter, ImageEnhance, ImageDraw

    result = {"ans": (options or ["知道了"])[-1]}

    root = tk.Tk()
    root.overrideredirect(True)
    root.configure(bg=CHROMA)
    # 物理分辨率（DPI 感知后 GetSystemMetrics 返回物理值）
    try:
        import ctypes as _c
        sw, sh = _c.windll.user32.GetSystemMetrics(0), _c.windll.user32.GetSystemMetrics(1)
    except Exception:
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
    root.geometry(f"{W}x{H}+{(sw - W) // 2}+{(sh - H) // 2 - 30}")
    import os as _os
    if _os.environ.get("POPUP_DEBUG"):
        root.update_idletasks()
        print(f"DEBUG sw={sw} sh={sh} W={W} H={H} x={root.winfo_x()} y={root.winfo_y()} geom={root.geometry()}", flush=True)
    root.attributes("-topmost", True)
    try:
        root.attributes("-transparentcolor", CHROMA)
    except Exception as e:
        print("透明色不支持:", e)

    cv = tk.Canvas(root, width=W, height=H, bg=CHROMA, highlightthickness=0, bd=0)
    cv.pack(fill="both", expand=True)

    # ── 背景：整张图居中，四周糊底 ──
    art_p = WALL.get(who) or WALL["xiaoyu"]
    if art_p and Path(art_p).exists():
        src = Image.open(art_p).convert("RGB")
        sc_bg = max(W / src.width, H / src.height) * 1.12
        bg = src.resize((int(src.width * sc_bg), int(src.height * sc_bg)), Image.LANCZOS)
        bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2,
                      (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
        bg = bg.filter(ImageFilter.GaussianBlur(30))
        bg = ImageEnhance.Brightness(bg).enhance(0.46)
        sc = min(W / src.width, H / src.height) * 1.0
        full = src.resize((int(src.width * sc), int(src.height * sc)), Image.LANCZOS)
        bg.paste(full, ((W - full.width) // 2, (H - full.height) // 2))
        art = bg
    else:
        art = Image.new("RGB", (W, H), (12, 18, 26))

    art = art.convert("RGBA")

    # ── 面板：真毛玻璃（把那块图糊掉、提亮一点、再贴回来）──
    PX0, PY0, PX1, PY1 = 76, 62, W - 76, H - 74
    PR = 20
    region = art.crop((PX0, PY0, PX1, PY1)).filter(ImageFilter.GaussianBlur(9))
    region = ImageEnhance.Brightness(region).enhance(1.18)
    glass = Image.new("RGBA", region.size, (12, 18, 27, 66))
    glass = Image.alpha_composite(region, glass)
    pmask = Image.new("L", region.size, 0)
    ImageDraw.Draw(pmask).rounded_rectangle([0, 0, region.width - 1, region.height - 1],
                                            radius=PR, fill=255)
    art.paste(glass, (PX0, PY0), pmask)

    # 面板描边
    pd = ImageDraw.Draw(art)
    pd.rounded_rectangle([PX0, PY0, PX1 - 1, PY1 - 1], radius=PR,
                         outline=(150, 190, 255, 18), width=1)
    pd.rounded_rectangle([PX0 + 1, PY0 + 1, PX1 - 2, PY1 - 2], radius=PR - 1,
                         outline=(255, 255, 255, 10), width=1)

    # 四周向内变暗：让边缘"消失"，而不是"发光"
    vig = Image.new("L", (W, H), 0)
    vd2 = ImageDraw.Draw(vig)
    steps = 40
    for i in range(steps):
        k = i / steps
        inset = int(min(W, H) * 0.09 * (1 - k))
        vd2.rounded_rectangle([inset, inset, W - 1 - inset, H - 1 - inset],
                              radius=max(4, RADIUS - inset // 2), outline=255, width=2)
    vig = vig.filter(ImageFilter.GaussianBlur(26))
    dark = Image.new("RGBA", (W, H), (4, 7, 11, 255))
    art = Image.composite(dark, art, vig.point(lambda v: int(v * 0.55)))

    # 整窗圆角 + 外发光
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, H - 1], radius=RADIUS, fill=255)
    canvas_img = Image.new("RGBA", (W, H), (1, 2, 3, 255))
    canvas_img.paste(art, (0, 0), mask)
    photo = ImageTk.PhotoImage(canvas_img.convert("RGB"))
    cv.create_image(0, 0, image=photo, anchor="nw")
    cv._bg = photo

    f_who = tkfont.Font(family="Microsoft YaHei", size=22, weight="bold")
    f_sub = tkfont.Font(family="Microsoft YaHei", size=12)
    f_title = tkfont.Font(family="Microsoft YaHei", size=27, weight="bold")
    f_body = tkfont.Font(family="Microsoft YaHei", size=17)
    f_btn = tkfont.Font(family="Microsoft YaHei", size=16, weight="bold")
    f_tip = tkfont.Font(family="Microsoft YaHei", size=10)

    def text_with_shadow(x, y, text, font, fill, anchor="center", width=None, justify=None):
        shadow = "#050810"
        kw = {}
        if width is not None:
            kw["width"] = width
        if justify is not None:
            kw["justify"] = justify
        cv.create_text(x + 2, y + 2, text=text, font=font, fill=shadow, anchor=anchor, **kw)
        return cv.create_text(x, y, text=text, font=font, fill=fill, anchor=anchor, **kw)

    # 左上角：谁找我（大字）
    name = NAMES.get(who, who)
    lx, ly = PX0 + 40, PY0 + 52
    text_with_shadow(lx, ly, f"{name} 找你", f_who, GOLD, anchor="w")
    text_with_shadow(lx, ly + 34, "有话要问你一句", f_sub, SUB, anchor="w")

    # 标题 + 正文居中（面板内）

    C = W // 2
    text_with_shadow(C, PY0 + 132, title, f_title, INK, width=(PX1 - PX0) - 200, justify="center")
    lines = wrap_lines(text, lambda x: f_body.measure(x), 700)
    y = PY0 + 190
    for ln in lines:
        if ln:
            text_with_shadow(C, y, ln, f_body, "#dbe7f6", justify="center")
        y += 36

    # 按钮（面板内居中）
    opts = options or ["知道了"]
    n = max(1, len(opts))
    bw, gap, bh = 280, 26, 64
    total = n * bw + (n - 1) * gap
    bx = (W - total) // 2
    by = PY1 - 108

    def pick(a):
        result["ans"] = a
        root.destroy()

    for i, opt in enumerate(opts):
        primary = i == 0
        x0 = bx + i * (bw + gap)
        rect = cv.create_rectangle(x0, by, x0 + bw, by + bh,
                                   fill=BLUE if primary else GHOST, outline="")
        label = cv.create_text(x0 + bw / 2, by + bh / 2, text=opt,
                               fill="#ffffff" if primary else INK, font=f_btn)
        for item in (rect, label):
            cv.tag_bind(item, "<Button-1>", lambda e, o=opt: pick(o))
            cv.tag_bind(item, "<Enter>", lambda e, r=rect, p_=primary: cv.itemconfig(
                r, fill=BLUE_HI if p_ else GHOST_HI))
            cv.tag_bind(item, "<Leave>", lambda e, r=rect, p_=primary: cv.itemconfig(
                r, fill=BLUE if p_ else GHOST))

    cv.create_text(C, PY1 - 34, text="Esc 或右上角 ✕ = 稍后再说", anchor="center", fill=SUB, font=f_tip)

    def close():
        result["ans"] = "稍后"
        root.destroy()

    cv.create_text(W - 46, 40, text="✕", fill=SUB,
                   font=tkfont.Font(family="Microsoft YaHei", size=16, weight="bold"), tags="x")
    cv.tag_bind("x", "<Button-1>", lambda e: close())
    cv.tag_bind("x", "<Enter>", lambda e: cv.itemconfig("x", fill=INK))
    cv.tag_bind("x", "<Leave>", lambda e: cv.itemconfig("x", fill=SUB))

    drag = {"x": 0, "y": 0}
    cv.bind("<Button-1>", lambda e: drag.update(x=e.x, y=e.y))
    cv.bind("<B1-Motion>", lambda e: root.geometry(
        f"+{root.winfo_x() + e.x - drag['x']}+{root.winfo_y() + e.y - drag['y']}"))

    root.bind("<Escape>", lambda e: close())
    root.focus_force()
    root.mainloop()
    return result["ans"]


def fallback_dialog(title, text, options):
    import ctypes
    if len(options) == 2:
        r = ctypes.windll.user32.MessageBoxW(0, text, title, 0x4 | 0x20 | 0x40000)
        return options[0] if r == 6 else options[1]
    ctypes.windll.user32.MessageBoxW(0, text, title, 0x0 | 0x40000)
    return options[0] if options else "知道了"


def dialog(title, text, options, who="dayu"):
    try:
        return gui_dialog(title, text, options, who)
    except Exception as e:
        print(f"图形界面失败（{e}），退回系统弹窗")
        return fallback_dialog(title, text, options)


def process():
    rows = read_jsonl(QUEUE)
    if not rows:
        print("没有待确认的。")
        return
    for item in rows:
        opts = item.get("options") or ["同意", "不同意"]
        ans = dialog(item.get("title") or "有事问你", item.get("text", ""), opts, item.get("who") or "dayu")
        with RECEIPT.open("a", encoding="utf-8") as f:
            f.write(json.dumps({"id": item["id"], "at": datetime.now().isoformat(timespec="seconds"),
                                "answer": ans, "title": item.get("title"), "text": item.get("text"),
                                "who": item.get("who") or ""}, ensure_ascii=False) + "\n")
        print(f"{item['id']} → {ans}")
    rewrite(QUEUE, [])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--ask", type=str, default="")
    ap.add_argument("--title", type=str, default="")
    ap.add_argument("--options", type=str, default="同意,不同意")
    ap.add_argument("--who", type=str, default="dayu")
    ap.add_argument("--demo", action="store_true")
    a = ap.parse_args()
    if a.demo:
        dialog("换一版试试？",
               "Day 0 现在 19 个播放、0 个赞。\n换封面会重置审核，一天后能看出差别。\n\n不换也没事——这条只是问一句。",
               ["换一版试试", "先不动"], a.who)
        return
    if a.ask:
        print("已塞进待确认:", ask(a.title or "有事问你", a.ask,
                                   [x.strip() for x in a.options.split(",") if x.strip()], a.who)["id"])
        return
    if a.list:
        for it in read_jsonl(QUEUE):
            print(f"{it['id']}  {it['at']}  [{it.get('title')}] {it.get('text')}")
        return
    process()


main()
