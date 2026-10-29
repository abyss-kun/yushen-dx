# -*- coding: utf-8 -*-
"""文字版《示例线》：黑屏 + 老电视雪花 + 逐字浮现 + 打字音效 + Q 版冒出来。

读稿：稿-可编辑.md（原话，不改字）
出片：out/白饭-文字版.mp4
"""
import math
import random
import re
import struct
import subprocess
import sys
import wave
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(r"<插件目录>\资产\视频\白饭")
MD = ROOT / "稿-可编辑.md"
QVER = Path(r"<插件目录>\资产\视频\白饭\标志\副-饭山\标志-副-躺饭山-v3-不行了.png")
MUSIC = Path(r"<插件目录>\资产\音频\Meditation_Impromptu_01.mp3")
OUTDIR = Path(r"<插件目录>\工作区\video\smallfish\xiaoyu-own\scene\out")
TMP = ROOT / "文字版素材"
TMP.mkdir(parents=True, exist_ok=True)

FF = r"D:\Tools\ffmpeg\bin\ffmpeg.exe"
FB = r"<用户目录>\AppData\Local\Microsoft\Windows\Fonts\NotoSansHans-Bold.otf"
W, H, FPS = 1920, 1080, 30
RATE = 48000

CHAR_T = 0.085          # 每字
P_COMMA = 0.26
P_STOP = 0.62
P_LONG = 1.20           # “我醒来的时候，”之后
POP_HOLD = 2.40


def font(s):
    return ImageFont.truetype(FB, s)


# ---------------- 配音效 ----------------
def click(seed, loud=0.20):
    rnd = random.Random(seed)
    n = int(RATE * 0.025)
    out = []
    for i in range(n):
        t = i / RATE
        env = math.exp(-t * 190)
        s = (rnd.uniform(-1, 1) * 0.55 + math.sin(2 * math.pi * 2400 * t) * 0.2) * env
        out.append(s * loud)
    return out


def thump(loud=0.40, freq=78.0):
    n = int(RATE * 0.55)
    out = []
    for i in range(n):
        t = i / RATE
        env = math.exp(-t * 7)
        out.append((math.sin(2 * math.pi * freq * t) * 0.85 +
                    math.sin(2 * math.pi * freq * 1.5 * t) * 0.15) * env * loud)
    return out


def build_audio(clicks, thumps, total, path):
    buf = [0.0] * int(RATE * (total + 0.6))
    for k, t in enumerate(clicks):
        s = click(k)
        i0 = int(t * RATE)
        for j, v in enumerate(s):
            if i0 + j < len(buf):
                buf[i0 + j] += v
    for item in thumps:
        t, freq, loud = item if isinstance(item, tuple) else (item, 78.0, 0.40)
        s = thump(loud=loud, freq=freq)
        i0 = int(t * RATE)
        for j, v in enumerate(s):
            if i0 + j < len(buf):
                buf[i0 + j] += v
    rnd = random.Random(11)
    for i in range(len(buf)):
        buf[i] += rnd.uniform(-1, 1) * 0.0014
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(b"".join(struct.pack("<h", max(-32767, min(32767, int(v * 32767)))) for v in buf))


# ---------------- 画面 ----------------
_tv_cache = {}


def tv(seed):
    key = seed % 36
    if key in _tv_cache:
        return _tv_cache[key]
    rnd = random.Random(key)
    base = Image.new("RGB", (W, H), (8, 10, 14))
    noise = Image.effect_noise((W // 3, H // 3), rnd.randint(22, 36)).convert("L")
    noise = noise.resize((W, H), Image.BILINEAR).filter(ImageFilter.GaussianBlur(0.8))
    base = Image.blend(base, Image.merge("RGB", (noise, noise, noise)), 0.14)
    d = ImageDraw.Draw(base, "RGBA")
    for y in range(0, H, 4):
        d.line([(0, y), (W, y)], fill=(0, 0, 0, 44))
    v = Image.new("L", (W, H), 0)
    ImageDraw.Draw(v).ellipse([-W * 0.3, -H * 0.3, W * 1.3, H * 1.3], fill=255)
    v = v.filter(ImageFilter.GaussianBlur(130))
    base = Image.composite(base, Image.new("RGB", (W, H), (0, 0, 0)), v)
    _tv_cache[key] = base
    return base


# ---------------- 读稿 ----------------
SKIP = ("不出声", "转场", "停顿", "无声")


def blocks():
    out, cur = [], None
    for raw in MD.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s:
            continue
        m = re.match(r"^\*\*(\d+)–(\d+)｜(.+)\*\*$", s)
        if m:
            if m.group(1) == "85":
                continue
            cur = {"name": m.group(3), "lines": []}
            out.append(cur)
            continue
        if cur is None:
            continue
        if any(x in s for x in SKIP):
            continue
        t = s.replace("**", "")
        t = re.sub(r"[（(][^）)]*[)）]", "", t).strip()
        if t:
            cur["lines"].append(t)
    return out


def main():
    bs = blocks()
    timeline = []      # (kind, start, end, payload)
    clicks = []
    thumps = []
    t = 0.7

    for b in bs:
        # 低频分段：三个段落进来时各换一个频率，不是每句都敲
        if "鱼与水" in b["name"]:
            thumps.append((t, 52.0, 0.34))   # 鱼与水：中
        elif "最轻" in b["name"]:
            thumps.append((t, 44.0, 0.28))   # 最轻：更沉、更轻
        for line in b["lines"]:
            if b["name"].startswith("黑底白字"):
                # 神秘人：整行弹出
                thumps.append((t, 64.0, 0.46))   # 神秘人：最沉
                timeline.append(("pop", t, t + POP_HOLD, line))
                t += POP_HOLD + 0.5
                continue
            # 逐字
            idx = len(timeline)
            span_start = t
            for ch in line:
                clicks.append(t)
                t += CHAR_T
                if ch in "，、":
                    t += P_COMMA
                elif ch in "。！？":
                    t += P_STOP
                elif ch == "…":
                    t += 0.45
            timeline.append(("type", span_start, t, line))
            if line.endswith("时候，") or "我醒来的时候" in line:
                t += P_LONG
            else:
                t += 0.55

    total = t + 3.4          # 尾巴：最后一句出完还能看一眼
    # 最后一句要停住：不然打完 0.5 秒就黑屏，看着像被切了
    if timeline:
        kind, s0, e0, text = timeline[-1]
        timeline[-1] = (kind, s0, total - 0.7, text)
    print(f"{len(timeline)} 段，{len(clicks)} 字，总长 {total:.1f}s")

    build_audio(clicks, thumps, total, TMP / "音效.wav")

    q = None
    if QVER.exists():
        q = Image.open(QVER).convert("RGBA")
        q = q.resize((int(q.width * 300 / q.height), 300), Image.LANCZOS)

    enc = subprocess.Popen(
        [FF, "-hide_banner", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24",
         "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-an",
         "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
         "-y", str(TMP / "video.mp4")], stdin=subprocess.PIPE)

    f = font(82)
    LINE_H = 118
    MAX_W = 1500
    for i in range(int(total * FPS)):
        tt = i / FPS
        frame = tv(i // 3).copy()
        ev = next((e for e in timeline if e[1] <= tt < e[2] + 0.5), None)
        d = ImageDraw.Draw(frame)
        if ev:
            kind, s0, e0, text = ev
            if kind == "pop":
                shown = text
                if tt - s0 < 0.20:
                    frame = Image.blend(frame, Image.new("RGB", (W, H), (74, 80, 92)), 0.40)
                    d = ImageDraw.Draw(frame)
            else:
                n = sum(1 for c in clicks if s0 <= c <= tt)
                shown = text[:max(0, n)]
            if shown:
                # 自动换行：一个字一个字加，超宽就换行
                lines, cur = [], ""
                for ch in shown:
                    if d.textlength(cur + ch, font=f) > MAX_W and cur:
                        lines.append(cur)
                        cur = ch
                    else:
                        cur += ch
                if cur:
                    lines.append(cur)
                lines = lines[-4:]
                y0 = H // 2 - (len(lines) - 1) * LINE_H // 2 - 40
                for li, ln in enumerate(lines):
                    tw = d.textlength(ln, font=f)
                    x = (W - tw) // 2
                    d.text((x + 3, y0 + li * LINE_H + 3), ln, font=f, fill=(56, 60, 66))
                    d.text((x, y0 + li * LINE_H), ln, font=f, fill=(240, 244, 248))

        # Q 版：在她"说不清"的几处冒出来（右下角，淡入淡出）
        if q is not None:
            for k, (a, b_) in enumerate([(total * 0.42, total * 0.52), (total * 0.86, total * 0.97)]):
                if a <= tt < b_:
                    p = (tt - a) / max(0.01, (b_ - a))
                    alpha = int(238 * math.sin(math.pi * min(1.0, p)) ** 0.7)
                    qq = q.copy()
                    qq.putalpha(alpha)
                    frame = frame.convert("RGBA")
                    frame.alpha_composite(qq, (W - q.width - 56, H - q.height - 132))
                    frame = frame.convert("RGB")
                    break

        enc.stdin.write(frame.tobytes())

    enc.stdin.close()
    enc.wait()
    print("画面完成，混音…")

    cmd = [FF, "-hide_banner", "-loglevel", "error",
           "-i", str(TMP / "video.mp4"), "-i", str(TMP / "音效.wav")]
    if MUSIC.exists():
        cmd += ["-stream_loop", "-1", "-i", str(MUSIC), "-filter_complex",
                f"[2:a]volume=0.05,atrim=0:{total+1},afade=t=in:st=0:d=3,afade=t=out:st={max(0,total-4)}:d=4[m];"
                f"[1:a]volume=0.9[t];[t][m]amix=inputs=2:duration=first:weights=1 1[a]"]
    else:
        cmd += ["-filter_complex", "[1:a]volume=0.9[a]"]
    out = OUTDIR / "白饭-文字版.mp4"
    cmd += ["-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-t", f"{total:.2f}", "-y", str(out)]
    subprocess.run(cmd, check=True)
    print("完成：", out)


main()

