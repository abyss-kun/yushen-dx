// 鱼神离线修复助手（本地未签名版）
//
// 只读诊断 + 三个白名单修复动作；每个动作都必须由用户显式确认。
// 不联网、不自启、不提权、不静默下载、不读聊天/账本/凭据。
//
// 诊断分类：
//   alive              进程在，可执行路径与启动时间都对得上
//   running-unverified 进程在，但身份核不上（PID 复用/权限/记录缺字段）
//   manual             有明确的手动退出标记
//   automatic          有明确的计划/自动退出标记
//   crash-suspected    有启动记录、无退出标记、进程已消失、最后观测 ≥60 秒
//   unknown            其余（证据不完整或冲突时不推断）
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using System.Runtime.InteropServices;
using Microsoft.Win32;

namespace YushenRepair
{
    internal sealed class Evidence
    {
        public bool Valid;
        public bool Coherent;
        public string Status;
        public DateTimeOffset At;
        public DateTimeOffset LastAt;
        public DateTimeOffset? ClosedAt;
    }

    internal static class Diagnosis
    {
        public static string Classify(Evidence e, string process, DateTimeOffset now)
        {
            // 进程状态优先：活着就是活着，不必等证据链完整。
            if (process == "alive-verified") return "alive";
            if (process == "alive-unverified") return "running-unverified";
            if (e == null || !e.Valid || !e.Coherent) return "unknown";
            if (process != "absent") return "unknown";
            if (e.At > now || e.LastAt > now || e.LastAt < e.At) return "unknown";
            if (e.Status == "manual-exit" || e.Status == "automatic-exit")
            {
                if (!e.ClosedAt.HasValue || e.ClosedAt.Value < e.LastAt || e.ClosedAt.Value > now) return "unknown";
                return e.Status == "manual-exit" ? "manual" : "automatic";
            }
            if (e.Status != "running" || e.ClosedAt.HasValue) return "unknown";
            if ((now - e.LastAt).TotalSeconds < 60) return "unknown";
            return "crash-suspected";
        }

        public static void SelfTest()
        {
            DateTimeOffset n = DateTimeOffset.UtcNow;
            Evidence e = new Evidence();
            e.Valid = true;
            e.Coherent = true;
            e.Status = "running";
            e.At = n.AddMinutes(-4);
            e.LastAt = n.AddMinutes(-2);
            Assert(Classify(e, "absent", n) == "crash-suspected");
            Assert(Classify(e, "alive-verified", n) == "alive");
            Assert(Classify(e, "alive-unverified", n) == "running-unverified");
            Assert(Classify(null, "alive-verified", n) == "alive");
            Assert(Classify(null, "running", n) == "unknown");

            e.Status = "manual-exit";
            e.ClosedAt = n.AddMinutes(-1);
            Assert(Classify(e, "absent", n) == "manual");
            e.Status = "automatic-exit";
            Assert(Classify(e, "absent", n) == "automatic");
            e.ClosedAt = n.AddMinutes(-3);
            Assert(Classify(e, "absent", n) == "unknown");

            e.Status = "running";
            e.ClosedAt = null;
            e.LastAt = n.AddSeconds(-10);
            Assert(Classify(e, "absent", n) == "unknown");

            e.LastAt = n.AddMinutes(-2);
            e.Coherent = false;
            Assert(Classify(e, "absent", n) == "unknown");
            Assert(Classify(e, "alive-verified", n) == "alive", "进程核得上时，证据链不完整也不该报 unknown");
        }

        static void Assert(bool ok)
        {
            if (!ok) throw new InvalidOperationException("self-test failed");
        }

        static void Assert(bool ok, string why)
        {
            if (!ok) throw new InvalidOperationException("self-test failed: " + why);
        }
    }

    internal sealed class CheckState
    {
        public string ProfileJson = "unknown";
        public int Bundles = -1;
        public string DepsDir = "unknown";
        public string StopFlag = "unknown";
        public string StaleLock = "unknown";
        // 2026-10-25 故障档案里的三类崩溃，各给一个只读检查位。
        public string AuthCrash = "unknown";
        public int CrashLogs = 0;
        public int AuthMatches = 0;
        public string AuthLatestAt = "";
        public string ShellCache = "unknown";
        public string Lockfile = "unknown";
        public string VirtualDisplay = "unknown";
    }

    internal sealed class Inspector
    {
        internal readonly string Home;
        internal readonly string BridgeRoot;

        internal Inspector()
        {
            string h = Environment.GetEnvironmentVariable("DSH_HOME");
            Home = Path.GetFullPath(String.IsNullOrWhiteSpace(h)
                ? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dsh")
                : h);
            if (Home.StartsWith(@"\\", StringComparison.Ordinal)) throw new InvalidOperationException("local home required");

            string b = Environment.GetEnvironmentVariable("QQ_BRIDGE_ROOT");
            if (String.IsNullOrWhiteSpace(b)) b = @"D:\deepseekTools\qq-bridge";
            else if (b.StartsWith(@"\\", StringComparison.Ordinal)) throw new InvalidOperationException("local bridge root required");
            BridgeRoot = Path.GetFullPath(b);
        }

        internal string ProfileJsonPath()
        {
            return Path.Combine(Home, "profiles", "desktop", "package.json");
        }

        internal string AuditFile()
        {
            return Path.Combine(Home, "dayu", "repair", "actions.jsonl");
        }

        // DSH 壳（Electron）的用户数据目录：Network / Session Storage / lockfile / logs 都在这。
        internal string ShellRoot()
        {
            string appData = Environment.GetEnvironmentVariable("APPDATA");
            if (String.IsNullOrWhiteSpace(appData)) return null;
            return Path.Combine(appData, "@deepseek-ai", "dsh-desktop");
        }

        internal string CredentialsPath()
        {
            return Path.Combine(Home, ".credentials.yaml");
        }

        internal static bool HostIsDown()
        {
            Process[] ps;
            try { ps = Process.GetProcessesByName("DeepSeek Harness"); }
            catch { return false; }
            bool any = false;
            foreach (Process p in ps)
            {
                try { if (!p.HasExited) any = true; }
                catch { any = true; }
                finally { p.Dispose(); }
            }
            return !any;
        }

        // 宿主主进程的启动时刻：Electron 会派生多个同名进程，取最早的那个当"主"。
        internal static DateTime HostStartedAtUtc()
        {
            DateTime best = DateTime.MinValue;
            try
            {
                foreach (Process p in Process.GetProcessesByName("DeepSeek Harness"))
                {
                    try
                    {
                        DateTime s = p.StartTime.ToUniversalTime();
                        if (best == DateTime.MinValue || s < best) best = s;
                    }
                    catch { /* 读不到就跳过这个进程 */ }
                    finally { p.Dispose(); }
                }
            }
            catch { }
            return best;
        }

        internal static void CopyDir(string source, string target)
        {
            Directory.CreateDirectory(target);
            foreach (string file in Directory.GetFiles(source))
            {
                File.Copy(file, Path.Combine(target, Path.GetFileName(file)), true);
            }
            foreach (string dir in Directory.GetDirectories(source))
            {
                CopyDir(dir, Path.Combine(target, Path.GetFileName(dir)));
            }
        }

        internal void AppendAudit(string action, string result, string detail)
        {
            try
            {
                string dir = Path.Combine(Home, "dayu", "repair");
                if (!NoLinks(dir)) return;
                Directory.CreateDirectory(dir);
                Dictionary<string, object> row = new Dictionary<string, object>();
                row["at"] = DateTimeOffset.UtcNow.ToString("o");
                row["action"] = action;
                row["result"] = result;
                row["detail"] = detail;
                File.AppendAllText(AuditFile(), new JavaScriptSerializer().Serialize(row) + "\n", new UTF8Encoding(false));
            }
            catch { /* 审计写不了不影响动作本身 */ }
        }

        internal static bool NoLinks(string path)
        {
            for (string p = Path.GetFullPath(path); !String.IsNullOrEmpty(p); p = Path.GetDirectoryName(p))
            {
                if ((File.Exists(p) || Directory.Exists(p)) && (File.GetAttributes(p) & FileAttributes.ReparsePoint) != 0) return false;
            }
            return true;
        }

        static Dictionary<string, object> Map(object o) { return o as Dictionary<string, object>; }

        static readonly string[] SENSITIVE_KEYS = { "token", "secret", "password", "passwd", "credential", "apikey", "api_key", "authorization", "cookie", "privatekey", "launchid", "execpath" };

        // 报告里放整份状态，但 token/secret 类键一律打码：放宽字段不等于把凭据贴出去。
        internal static object Redact(object value, int depth)
        {
            if (depth > 32) return "…";
            Dictionary<string, object> d = value as Dictionary<string, object>;
            if (d != null)
            {
                Dictionary<string, object> mapped = new Dictionary<string, object>();
                foreach (KeyValuePair<string, object> kv in d)
                {
                    string key = kv.Key ?? "";
                    mapped[key] = IsSensitiveKey(key) ? (object)"***" : Redact(kv.Value, depth + 1);
                }
                return mapped;
            }
            object[] arr = value as object[];
            if (arr != null)
            {
                object[] copy = new object[arr.Length];
                for (int i = 0; i < arr.Length; i++) copy[i] = Redact(arr[i], depth + 1);
                return copy;
            }
            string s = value as string;
            if (s != null && s.Length > 300) return s.Substring(0, 300) + "…(截断)";
            return value;
        }

        static bool IsSensitiveKey(string key)
        {
            string k = key.ToLowerInvariant();
            // pid / node 也算标识信息：整份读进来，但报告里不带出去。
            if (k == "pid" || k == "node") return true;
            foreach (string t in SENSITIVE_KEYS)
            {
                if (k.IndexOf(t, StringComparison.Ordinal) >= 0) return true;
            }
            return false;
        }

        static string Text(Dictionary<string, object> d, string k)
        {
            object o;
            return d != null && d.TryGetValue(k, out o) ? o as string : null;
        }

        static bool Time(Dictionary<string, object> d, string k, out DateTimeOffset t)
        {
            string s = Text(d, k);
            t = default(DateTimeOffset);
            if (String.IsNullOrEmpty(s)) return false;
            return DateTimeOffset.TryParseExact(s, "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
                CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out t);
        }

        static int Pid(Dictionary<string, object> d)
        {
            object o;
            if (d != null && d.TryGetValue("pid", out o) && o is int && (int)o > 0) return (int)o;
            return 0;
        }

        Dictionary<string, object> Load(string rel, out string state)
        {
            state = "unknown";
            try
            {
                string p = Path.Combine(Home, rel);
                if (!NoLinks(p)) { state = "blocked-link"; return null; }
                if (!File.Exists(p)) { state = "missing"; return null; }
                byte[] b = File.ReadAllBytes(p);
                if (b.Length > 1048576) { state = "too-large"; return null; }
                JavaScriptSerializer j = new JavaScriptSerializer();
                j.MaxJsonLength = 1048576;
                j.RecursionLimit = 32;
                Dictionary<string, object> d = Map(j.DeserializeObject(new UTF8Encoding(false, true).GetString(b).TrimStart('\uFEFF')));
                state = d == null ? "invalid-json" : "ok";
                return d;
            }
            catch
            {
                state = "invalid-json";
                return null;
            }
        }

        // ── 崩溃经验的读取面：只看存在性/语法，不读正文、不回显路径 ──────────────
        internal CheckState Checks()
        {
            CheckState c = new CheckState();

            try
            {
                string p = ProfileJsonPath();
                if (!NoLinks(p)) c.ProfileJson = "blocked-link";
                else if (!File.Exists(p)) c.ProfileJson = "missing";
                else
                {
                    byte[] b = File.ReadAllBytes(p);
                    if (b.Length > 1048576) c.ProfileJson = "too-large";
                    else
                    {
                        JavaScriptSerializer j = new JavaScriptSerializer();
                        j.MaxJsonLength = 1048576;
                        Dictionary<string, object> d = Map(j.DeserializeObject(new UTF8Encoding(false, true).GetString(b).TrimStart('\uFEFF')));
                        if (d == null) c.ProfileJson = "broken";
                        else
                        {
                            c.ProfileJson = "ok";
                            c.Bundles = CountBundles(d);
                        }
                    }
                }
            }
            catch { c.ProfileJson = "broken"; }

            try
            {
                if (!Directory.Exists(BridgeRoot)) c.DepsDir = "absent";
                else c.DepsDir = Directory.Exists(Path.Combine(BridgeRoot, "node_modules")) ? "present" : "missing";
            }
            catch { c.DepsDir = "unknown"; }

            try
            {
                string f = Path.Combine(BridgeRoot, "state", "STOP.flag");
                if (!Directory.Exists(Path.Combine(BridgeRoot, "state"))) c.StopFlag = "absent";
                else c.StopFlag = File.Exists(f) ? "present" : "absent";
            }
            catch { c.StopFlag = "unknown"; }

            try
            {
                string f = Path.Combine(BridgeRoot, "state", "bridge.lock");
                if (!File.Exists(f)) c.StaleLock = "absent";
                else
                {
                    int pid = ReadLockPid(f);
                    if (pid == 0) c.StaleLock = "unknown";
                    else c.StaleLock = ProcessAlive(pid) ? "no" : "yes";
                }
            }
            catch { c.StaleLock = "unknown"; }

            // ① 认证死循环：崩溃日志看最近 10 条，统计历史次数，而不是只盯最新一条。
            try
            {
                string shell = ShellRoot();
                string logs = shell == null ? null : Path.Combine(shell, "logs");
                c.AuthCrash = "no-logs";
                c.CrashLogs = 0;
                c.AuthMatches = 0;
                if (logs != null && Directory.Exists(logs))
                {
                    string[] files = Directory.GetFiles(logs, "crash-*-host.log");
                    c.CrashLogs = files.Length;
                    Array.Sort(files, delegate(string x, string y)
                    {
                        return File.GetLastWriteTimeUtc(y).CompareTo(File.GetLastWriteTimeUtc(x));
                    });
                    int scanned = 0;
                    DateTime latestMatch = DateTime.MinValue;
                    foreach (string f in files)
                    {
                        if (scanned >= 10) break;
                        scanned++;
                        try
                        {
                            if (new FileInfo(f).Length > 2097152) continue;
                            string text = File.ReadAllText(f, new UTF8Encoding(false, true));
                            if (text.IndexOf("Web authentication failed", StringComparison.OrdinalIgnoreCase) < 0) continue;
                            c.AuthMatches++;
                            DateTime at = File.GetLastWriteTimeUtc(f);
                            if (at > latestMatch) latestMatch = at;
                        }
                        catch { /* 单条读不了就跳过 */ }
                    }
                    if (c.AuthMatches == 0) c.AuthCrash = "no-signature";
                    else
                    {
                        c.AuthLatestAt = latestMatch.ToString("o", CultureInfo.InvariantCulture);
                        DateTime hostStart = HostStartedAtUtc();
                        c.AuthCrash = hostStart != DateTime.MinValue && latestMatch < hostStart ? "stale" : "suspected";
                    }
                }
            }
            catch { c.AuthCrash = "unknown"; }

            // ② 壳的会话缓存与残留锁：认证死循环的复发面
            try
            {
                string shell = ShellRoot();
                if (shell == null || !Directory.Exists(shell)) { c.ShellCache = "absent"; c.Lockfile = "absent"; }
                else
                {
                    bool network = Directory.Exists(Path.Combine(shell, "Network"));
                    bool storage = Directory.Exists(Path.Combine(shell, "Session Storage"));
                    c.ShellCache = network || storage ? "present" : "missing";
                    c.Lockfile = File.Exists(Path.Combine(shell, "lockfile")) ? "present" : "absent";
                }
            }
            catch { c.ShellCache = "unknown"; c.Lockfile = "unknown"; }

            // ③ 渲染类崩溃：显示适配器里有没有虚拟显示器（Oray/IDD/Parsec 等）
            try
            {
                using (RegistryKey cls = Registry.LocalMachine.OpenSubKey(@"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"))
                {
                    if (cls == null) c.VirtualDisplay = "unknown";
                    else
                    {
                        int virtualCount = 0;
                        bool oray = false;
                        foreach (string sub in cls.GetSubKeyNames())
                        {
                            // 有的子键（如 Configuration）不给读权限，单个键失败不能拖垮整轮。
                            try
                            {
                                using (RegistryKey dev = cls.OpenSubKey(sub))
                                {
                                    object o = dev == null ? null : dev.GetValue("DriverDesc");
                                    string desc = o as string;
                                    if (String.IsNullOrEmpty(desc)) continue;
                                    if (!LooksVirtualDisplay(desc)) continue;
                                    virtualCount++;
                                    if (desc.IndexOf("Oray", StringComparison.OrdinalIgnoreCase) >= 0) oray = true;
                                }
                            }
                            catch { /* 这个子键读不了就跳过 */ }
                        }
                        c.VirtualDisplay = virtualCount == 0 ? "none" : (oray ? "oray" : "virtual");
                    }
                }
            }
            catch { c.VirtualDisplay = "unknown"; }

        // ④ 华硕灯效服务：**故意不查**。
        //    它是某台机器上的外设服务，不是修复项；写进通用工具里，别人的机器上只会多一条无关噪音。
        //    崩溃时用下面这条通用建议排除即可。

            return c;
        }

        // 虚拟显示器/远程串流驱动：Electron 渲染进程遇到它们容易随机崩。
        internal static bool LooksVirtualDisplay(string desc)
        {
            string[] tokens = { "Oray", "IDD", "Indirect Display", "Virtual Display", "Parsec", "spacedesk",
                "usbmmidd", "Ammyy", "Sunshine", "Apollo", "ToDesk", "Duet", "Twomon", "iDisplay", "Citrix", "RDP" };
            foreach (string t in tokens)
            {
                if (desc.IndexOf(t, StringComparison.OrdinalIgnoreCase) >= 0) return true;
            }
            return false;
        }

        internal static int CountBundles(Dictionary<string, object> d)
        {
            try
            {
                object dsh;
                if (!d.TryGetValue("dsh", out dsh)) return -1;
                Dictionary<string, object> dshMap = Map(dsh);
                if (dshMap == null) return -1;
                object profile;
                if (!dshMap.TryGetValue("profile", out profile)) return -1;
                Dictionary<string, object> profileMap = Map(profile);
                if (profileMap == null) return -1;
                object bundles;
                if (!profileMap.TryGetValue("bundles", out bundles)) return -1;
                object[] arr = bundles as object[];
                return arr == null ? -1 : arr.Length;
            }
            catch { return -1; }
        }

        internal static bool ProcessAlive(int pid)
        {
            try
            {
                using (Process p = Process.GetProcessById(pid))
                {
                    return !p.HasExited;
                }
            }
            catch (ArgumentException) { return false; }
            catch { return true; } // 读不到就当它活着，宁可不动
        }

        // 桥接的 bridge.lock 实际是一个纯数字（pid），不是 JSON。两种都认。
        internal static int ReadLockPid(string path)
        {
            try
            {
                FileInfo fi = new FileInfo(path);
                if (fi.Length > 65536) return 0;
                string text = File.ReadAllText(path, new UTF8Encoding(false, true)).TrimStart('\uFEFF').Trim();
                if (text.StartsWith("{", StringComparison.Ordinal))
                {
                    JavaScriptSerializer j = new JavaScriptSerializer();
                    Dictionary<string, object> d = Map(j.DeserializeObject(text));
                    object o;
                    if (d != null && d.TryGetValue("pid", out o))
                    {
                        if (o is int && (int)o > 0) return (int)o;
                        string s = o as string;
                        int sp;
                        if (s != null && Int32.TryParse(s.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out sp) && sp > 0) return sp;
                    }
                    return 0;
                }
                int n;
                if (Int32.TryParse(text, NumberStyles.Integer, CultureInfo.InvariantCulture, out n) && n > 0) return n;
                return 0;
            }
            catch { return 0; }
        }

        // 崩溃经验 → 固定建议。只引用本地证据，不推断根因，不编。
        internal static string[] Advise(string classification, CheckState c)
        {
            List<string> a = new List<string>();
            if (classification == "crash-suspected")
                a.Add("疑似崩溃：先按下面的检查项逐条看，别急着重装；坏掉的 JSON 用备份回滚，不要直接删。");
            else if (classification == "alive")
                a.Add("宿主正在运行，且进程身份核对通过；要修 profile 必须先正常退出 DSH。");
            else if (classification == "running-unverified")
                a.Add("有进程占着这个 PID，但路径或启动时间对不上（可能 PID 被复用、或权限读不到）；不确定时不要动文件。");
            else if (classification == "manual")
                a.Add("这是手动退出，不是崩溃；除非你怀疑关闭过程被打断，否则不需要修。");
            else if (classification == "automatic")
                a.Add("这是计划/自动退出，不是崩溃；看一下退出原因再决定要不要动。");
            else
                a.Add("证据不足，无法判断是活着还是崩了；先点「检查」重读，别在情况不明时修文件。");

            if (c.ProfileJson == "broken") a.Add("profile 的 package.json 语法坏了：只能用健康备份恢复；恢复前必须完全退出 DSH。");
            if (c.DepsDir == "missing") a.Add("桥接 node_modules 不见了（上一次是整目录被清空）：要重装依赖，本工具不会自动装。");
            if (c.StopFlag == "present") a.Add("残留 STOP.flag：桥接下次启动会立刻退出；确认桥接没在跑之后可以清掉。");
            if (c.StaleLock == "yes") a.Add("僵尸 bridge.lock：里面的 PID 已经不存在，会挡住下次启动；可以清掉。");
            if (c.StaleLock == "no") a.Add("bridge.lock 对应的进程还活着：这是正常占用，不要删。");

            // 2026-10-25 故障档案里的三类崩溃，各给一条针对性的处置。
            if (c.AuthCrash == "suspected")
                a.Add("最近一次崩溃日志带 Web authentication failed：先备份、清壳的 Network/Session Storage、把凭据改名，再重新登录（工具里「重置登录状态」就是这一套）。");
            else if (c.AuthCrash == "stale")
                a.Add("最新的认证崩溃日志早于当前进程启动：那次之后没再崩过，别重复重置登录状态。");
            if (c.ShellCache == "present") a.Add("壳的 Network/Session Storage 还在：它们是登录状态的一部分，重置登录时会先备份再清掉。");
            // 宿主活着时 lockfile 是正常占用，只有「没在跑却还留着」才是问题。
            if (c.Lockfile == "present" && classification != "alive" && classification != "running-unverified")
                a.Add("壳的 lockfile 还在：宿主没在跑却留着，会挡住下次启动。");
            if (c.VirtualDisplay == "oray")
                a.Add("显示适配器里有 OrayIddDriver（向日葵虚拟显示器）：Electron 渲染进程遇到它容易随机崩；渲染类崩溃先禁用该设备，不需要重装 DSH。");
            else if (c.VirtualDisplay == "virtual")
                a.Add("检测到虚拟显示器驱动：渲染类崩溃先禁用它再复现；这不是鱼神的问题。");
            if (classification == "crash-suspected")
                a.Add("疑似崩溃时先排除与 DSH 无关的东西：显卡/显示驱动、远程控制、外设服务、杀软——它们自己崩，不等于 DSH 崩。");

            a.Add("【常备】她说话整串变问号时：那是发送端按单字节编码的锅，不是她坏了——先查调用方有没有按 UTF-8 发送。");
            a.Add("【常备】投递成功但她不回：先看宿主是否还在跑、会话是不是卡在 busy；空回合不会自己恢复，要收尾或重建会话。");
            a.Add("【常备】崩溃重置之后，旧会话只读、不续跑：它们的附件引用可能已经悬空，先跑 scripts/session-doctor.mjs 查一遍再决定。");
            a.Add("【常备】关了 DSH 却仍提示「还在运行」：那是启动脚本/看门狗把自身算进去了，跟本工具无关，改脚本而不是改文件。");
            return a.ToArray();
        }

        // ── 诊断主体 ────────────────────────────────────────────────────────
        internal Dictionary<string, object> Run()
        {
            string ss, bs;
            Dictionary<string, object> state = Load(Path.Combine("dayu", "repair", "state.json"), out ss);
            Dictionary<string, object> boot = Load(Path.Combine("dayu", "boot.json"), out bs);

            Evidence e = null;
            int pid = 0, count = 0;
            bool invalid = false, tie = false;
            object sessions, version;

            if (state != null && state.TryGetValue("version", out version) && version is int && (int)version == 1
                && state.TryGetValue("sessions", out sessions))
            {
                Dictionary<string, object> all = Map(sessions);
                if (all != null && all.Count <= 4096)
                {
                    foreach (KeyValuePair<string, object> q in all)
                    {
                        count++;
                        Dictionary<string, object> s = Map(q.Value);
                        DateTimeOffset at, last, closed;
                        if (s == null || Pid(s) == 0 || !Time(s, "at", out at)) { invalid = true; continue; }
                        last = at;
                        if (s.ContainsKey("lastObservedAt") && !Time(s, "lastObservedAt", out last)) { invalid = true; continue; }
                        DateTimeOffset? ca = null;
                        if (s.ContainsKey("closedAt"))
                        {
                            if (!Time(s, "closedAt", out closed)) { invalid = true; continue; }
                            ca = closed;
                        }
                        if (e != null && at == e.At) tie = true;
                        if (e == null || at > e.At)
                        {
                            e = new Evidence();
                            e.Valid = true;
                            e.At = at;
                            e.LastAt = last;
                            e.ClosedAt = ca;
                            e.Status = Text(s, "status");
                            pid = Pid(s);
                            tie = false;
                        }
                    }
                }
            }

            DateTimeOffset bt;
            bool bootTime = Time(boot, "at", out bt);
            string exe = Text(boot, "executable");
            if (exe == null) exe = Text(boot, "node");
            bool coherent = e != null && !invalid && !tie && bs == "ok" && bootTime && Pid(boot) == pid
                && bt >= e.At && (bt - e.At).TotalMinutes <= 5 && bt <= DateTimeOffset.UtcNow;

            string ar;
            Dictionary<string, object> a = Load(Path.Combine("dayu", "repair", "active.json"), out ar);
            double tolerance = 5000;
            if (ar != "missing" && a != null)
            {
                DateTimeOffset aa = DateTimeOffset.MinValue, hb = DateTimeOffset.MinValue, sa = DateTimeOffset.MinValue;
                object av, prec;
                bool va = a.TryGetValue("version", out av) && av is int && (int)av == 1 && Pid(a) > 0
                    && Time(a, "at", out aa) && Time(a, "heartbeat", out hb) && Time(a, "processStartedAt", out sa);
                if (a.TryGetValue("processStartedAtPrecisionMs", out prec) && prec is int && (int)prec > 0)
                {
                    tolerance = Math.Max(5000, (int)prec * 2.0 + 1000);
                }
                if (va)
                {
                    string st = Text(a, "status");
                    DateTimeOffset end;
                    DateTimeOffset? ca = null;
                    if (st == "manual-exit" || st == "automatic-exit")
                    {
                        bool hasEnd = Time(a, "endedAt", out end) || Time(a, "closedAt", out end);
                        ca = hasEnd ? (DateTimeOffset?)end : hb;
                    }
                    if (e == null || aa >= e.At)
                    {
                        e = new Evidence();
                        e.Valid = true;
                        e.At = aa;
                        e.LastAt = hb;
                        e.ClosedAt = ca;
                        e.Status = st;
                        pid = Pid(a);
                        exe = Text(a, "execPath");
                        coherent = !invalid && !tie && hb >= aa && sa <= aa && aa <= DateTimeOffset.UtcNow;
                    }
                    else coherent = false;
                }
                else coherent = false;
            }
            if (ar != "missing" && a == null) coherent = false;
            if (e != null) e.Coherent = coherent;

            string process = "unknown";
            DateTimeOffset? started = null;
            if (a != null)
            {
                DateTimeOffset st;
                if (Time(a, "processStartedAt", out st)) started = st;
            }
            if (coherent) process = Probe(pid, exe, started, tolerance);

            DateTimeOffset now = DateTimeOffset.UtcNow;
            string c = Diagnosis.Classify(e, process, now);
            // 灯效只在疑似崩溃时查（排除噪音用），健康时不扫。
            CheckState chk = Checks();

            Dictionary<string, object> checks = new Dictionary<string, object>();
            checks["profileJson"] = chk.ProfileJson;
            checks["bundles"] = chk.Bundles;
            checks["bridgeDeps"] = chk.DepsDir;
            checks["stopFlag"] = chk.StopFlag;
            checks["bridgeLock"] = chk.StaleLock;
            checks["authCrash"] = chk.AuthCrash;
            checks["crashLogs"] = chk.CrashLogs;
            checks["authMatches"] = chk.AuthMatches;
            if (!String.IsNullOrEmpty(chk.AuthLatestAt)) checks["authLatestAt"] = chk.AuthLatestAt;
            checks["shellCache"] = chk.ShellCache;
            checks["shellLockfile"] = chk.Lockfile;
            checks["virtualDisplay"] = chk.VirtualDisplay;

            // 疑似崩溃才做取证：读日志原文、事件日志、磁盘/显卡状态，回答「为什么崩」。
            Forensics fore = null;
            List<Dictionary<string, object>> causes = new List<Dictionary<string, object>>();
            if (c == "crash-suspected")
            {
                fore = Forensics.Collect(this);
                causes = Forensics.Explain(chk, c, fore);
            }

            Dictionary<string, object> r = new Dictionary<string, object>();
            r["schemaVersion"] = 2;
            r["buildTrust"] = "unsigned-local-build";
            r["generatedAt"] = now.ToString("o");
            r["classification"] = c;
            r["processIdentity"] = process;
            r["stateRead"] = ss;
            r["bootRead"] = bs;
            r["activeRead"] = ar;
            r["sessionCount"] = count;
            r["evidenceCoherent"] = coherent;
            // 整份状态进报告，但 token/secret 类键自动打码——放宽字段，不等于把凭据贴出去。
            r["state"] = Redact(state, 0);
            r["boot"] = Redact(boot, 0);
            r["active"] = Redact(a, 0);
            r["checks"] = checks;
            r["forensics"] = fore == null ? null : fore.ToDict();
            r["causes"] = causes;
            r["plan"] = PlanActions(chk, c);
            r["findings"] = KnownIssues(chk, c, HostIsDown() || Actions.TestHostDownBypass());
            r["advice"] = Advise(c, chk);
            r["diagnosticSummary"] = Summary(c);
            r["privacy"] = "读取面：生命周期三个状态 JSON（整份进报告，token/secret 类键自动打码）、profile 的 package.json、桥接两个文件的存在性、壳崩溃日志最近 10 条、显示适配器注册表项。不导出文件路径、PID、驱动路径、日志正文、聊天或凭据。";
            return r;
        }

        static string Summary(string c)
        {
            if (c == "alive") return "宿主在运行，进程身份核对通过。";
            if (c == "running-unverified") return "有进程，但身份核不上（PID 复用/权限/记录缺字段），不做推断。";
            if (c == "crash-suspected") return "启动记录存在、进程已消失、无退出标记；仅疑似崩溃，根因未知。";
            if (c == "manual") return "有明确的手动退出标记。";
            if (c == "automatic") return "有明确的计划/自动退出标记。";
            return "证据不足或时间线冲突，不做推断。";
        }

        // 1000ms 太紧：宿主实际启动比记录早约 2 秒，会把「活着」判成 unknown。
        static string Probe(int pid, string expected, DateTimeOffset? started, double toleranceMs)
        {
            try
            {
                using (Process p = Process.GetProcessById(pid))
                {
                    if (p.HasExited) return "absent";
                    string actual;
                    try { actual = p.MainModule.FileName; }
                    catch { return "alive-unverified"; }
                    if (String.IsNullOrEmpty(expected) || !Path.IsPathRooted(expected)
                        || expected.StartsWith(@"\\", StringComparison.Ordinal) || !started.HasValue)
                        return "alive-unverified";
                    DateTimeOffset actualStart = new DateTimeOffset(p.StartTime.ToUniversalTime());
                    bool samePath = String.Equals(Path.GetFullPath(actual), Path.GetFullPath(expected), StringComparison.OrdinalIgnoreCase);
                    bool sameStart = Math.Abs((actualStart - started.Value).TotalMilliseconds) <= toleranceMs;
                    if (samePath && sameStart) return "alive-verified";
                    return "alive-unverified";
                }
            }
            catch (ArgumentException) { return "absent"; }
            catch { return "unknown"; }
        }

        // 把检查结果翻译成「建议动作」：只有条件真成立的才 available。
        // 这一步只算，不动任何文件；用户同意后再调用对应动作。
        internal List<Dictionary<string, object>> PlanActions(CheckState c, string classification)
        {
            List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
            bool hostDown = HostIsDown() || Actions.TestHostDownBypass();

            bool bridgeAlive = false;
            try
            {
                string lockPath = Path.Combine(BridgeRoot, "state", "bridge.lock");
                int bp = File.Exists(lockPath) ? ReadLockPid(lockPath) : 0;
                bridgeAlive = bp > 0 && ProcessAlive(bp);
            }
            catch { }

            list.Add(Plan("remove-stop-flag", "清残留 STOP.flag",
                c.StopFlag == "present" && !bridgeAlive,
                c.StopFlag != "present" ? "没有 STOP.flag"
                    : (bridgeAlive ? "桥接还在跑" : "可执行")));

            list.Add(Plan("remove-stale-lock", "清僵尸 bridge.lock",
                c.StaleLock == "yes",
                c.StaleLock == "yes" ? "可执行" : "lock=" + c.StaleLock));

            bool credExists = File.Exists(CredentialsPath());
            bool authAvail = c.AuthCrash == "suspected" && hostDown
                && (c.ShellCache == "present" || c.Lockfile == "present" || credExists);
            list.Add(Plan("reset-auth", "重置登录状态", authAvail,
                c.AuthCrash != "suspected" ? "authCrash=" + c.AuthCrash
                    : (!hostDown ? "先完全退出 DSH" : "可执行")));

            bool restoreAvail = c.ProfileJson == "broken" && hostDown;
            list.Add(Plan("restore-profile-json", "从备份恢复 package.json", restoreAvail,
                c.ProfileJson != "broken" ? "profileJson=" + c.ProfileJson
                    : (!hostDown ? "先完全退出 DSH" : "会先问你选备份")));

            return list;
        }

        static Dictionary<string, object> Plan(string id, string title, bool available, string reason)
        {
            Dictionary<string, object> row = new Dictionary<string, object>();
            row["id"] = id;
            row["title"] = title;
            row["available"] = available;
            row["reason"] = reason;
            row["label"] = available ? title : title + "（" + reason + "）";
            return row;
        }

        // 一次修所有「该修的」：按固定顺序走各自的固定代码路径，跳过不该动的。
        // 恢复 profile 必须由用户选备份文件，所以这里只跳过并说明，不在自动序列里。
        internal static List<Dictionary<string, object>> FixAll(Inspector ins, CheckState c, string classification, out Dictionary<string, object> gaps)
        {
            List<Dictionary<string, object>> rows = new List<Dictionary<string, object>>();
            List<Dictionary<string, object>> plan = ins.PlanActions(c, classification);
            foreach (Dictionary<string, object> item in plan)
            {
                string id = item["id"] as string;
                bool available = item["available"] is bool && (bool)item["available"];
                Dictionary<string, object> row = new Dictionary<string, object>();
                row["id"] = id;
                row["title"] = item["title"];
                if (!available)
                {
                    row["result"] = "skipped";
                    row["reason"] = item["reason"];
                    rows.Add(row);
                    continue;
                }
                try
                {
                    string r;
                    if (id == "remove-stop-flag") r = Actions.RemoveStopFlag(ins);
                    else if (id == "remove-stale-lock") r = Actions.RemoveStaleLock(ins);
                    else if (id == "reset-auth") r = Actions.ResetAuth(ins);
                    else
                    {
                        // restore-profile-json：必须选备份，不能替用户决定。
                        row["result"] = "skipped";
                        row["reason"] = "needs backup selection";
                        rows.Add(row);
                        continue;
                    }
                    row["result"] = r;
                }
                catch (Exception ex)
                {
                    row["result"] = "failed";
                    row["reason"] = ex.Message;
                }
                rows.Add(row);
            }
            // 修不了的项记成缺口，等别的手段修好之后再对账。
            gaps = ins.SyncGaps(ins.KnownIssues(c, classification, Inspector.HostIsDown() || Actions.TestHostDownBypass()));
            return rows;
        }

        // 把检查结果匹配到「已知故障」：给原因、证据、能不能修。
        // 这是诊断和修复之间的一层，用户先看这个再决定按不按修复。
        internal List<Dictionary<string, object>> KnownIssues(CheckState c, string classification, bool hostDown)
        {
            List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
            if (c.AuthCrash == "suspected")
                Issue(list, "auth-loop", "启动会卡在 Web authentication failed 的死循环",
                    "最新崩溃日志带认证失败签名，且晚于当前进程启动",
                    true, "reset-auth", hostDown ? "会先备份再清壳缓存、改名凭据" : "要先完全退出 DSH");
            if (c.ProfileJson == "broken")
                Issue(list, "profile-json", "profile 的 package.json 语法坏了，DSH 起不来",
                    "package.json 解析失败",
                    true, "restore-profile-json", hostDown ? "要用你选的健康备份恢复" : "要先完全退出 DSH");
            if (c.StopFlag == "present")
                Issue(list, "stop-flag", "桥接下次启动会立刻退出",
                    "state/STOP.flag 还在", true, "remove-stop-flag", "桥接没在跑才执行");
            if (c.StaleLock == "yes")
                Issue(list, "stale-lock", "僵尸 lock 会挡住下次启动",
                    "lock 里的 PID 已不存在", true, "remove-stale-lock", "直接清掉");
            if (c.DepsDir == "missing")
                Issue(list, "deps-missing", "桥接依赖被整目录删了，桥接起不来",
                    "node_modules 不存在", false, "", "要重装依赖，工具不联网");
            if (c.VirtualDisplay == "oray")
                Issue(list, "oray-idd", "渲染进程随机崩，元凶是向日葵的虚拟显示器",
                    "显示适配器里有 OrayIddDriver", false, "", "要管理员禁用该设备（pnputil）");
            else if (c.VirtualDisplay == "virtual")
                Issue(list, "virtual-display", "渲染进程随机崩，可能和虚拟显示器有关",
                    "显示适配器里有虚拟显示器驱动", false, "", "要管理员禁用后再复现");
            if (classification == "crash-suspected" && list.Count == 0)
                Issue(list, "crash-unknown", "疑似崩溃，但白名单检查没找到可修项",
                    "有启动记录、无退出标记、进程已消失", false, "", "只报告，别乱修");
            return list;
        }

        static void Issue(List<Dictionary<string, object>> list, string id, string cause, string evidence,
            bool fixable, string action, string note)
        {
            Dictionary<string, object> row = new Dictionary<string, object>();
            row["id"] = id;
            row["cause"] = cause;
            row["evidence"] = evidence;
            row["fixable"] = fixable;
            row["action"] = action;
            row["note"] = note;
            list.Add(row);
        }

        // 修不了的项记成「缺口」：为什么修不了、证据是什么。只追加，不删。
        // 等别的手段把机器修好之后，下次修复会看到证据消失而写成 resolved。
        internal string GapsFile()
        {
            return Path.Combine(Home, "dayu", "repair", "gaps.jsonl");
        }

        internal Dictionary<string, object> SyncGaps(List<Dictionary<string, object>> findings)
        {
            Dictionary<string, object> summary = new Dictionary<string, object>();
            int open = 0, newlyOpened = 0, newlyResolved = 0;
            try
            {
                string file = GapsFile();
                string dir = Path.GetDirectoryName(file);
                if (!NoLinks(dir)) { summary["error"] = "blocked-link"; return summary; }

                Dictionary<string, string> last = new Dictionary<string, string>();
                if (File.Exists(file))
                {
                    foreach (string line in File.ReadAllLines(file, new UTF8Encoding(false, true)))
                    {
                        if (String.IsNullOrWhiteSpace(line)) continue;
                        try
                        {
                            Dictionary<string, object> row = new JavaScriptSerializer().DeserializeObject(line) as Dictionary<string, object>;
                            if (row == null) continue;
                            string id = row["id"] as string;
                            string st = row["status"] as string;
                            if (!String.IsNullOrEmpty(id) && !String.IsNullOrEmpty(st)) last[id] = st;
                        }
                        catch { /* 坏行跳过，不影响其余 */ }
                    }
                }

                Directory.CreateDirectory(dir);
                List<string> append = new List<string>();
                HashSet<string> current = new HashSet<string>();

                foreach (Dictionary<string, object> f in findings)
                {
                    bool fixable = f["fixable"] is bool && (bool)f["fixable"];
                    if (fixable) continue;
                    string id = f["id"] as string;
                    if (String.IsNullOrEmpty(id)) continue;
                    current.Add(id);
                    open++;
                    string st;
                    if (!last.TryGetValue(id, out st) || st != "open")
                    {
                        append.Add(GapRow("open", f));
                        newlyOpened++;
                    }
                }

                foreach (KeyValuePair<string, string> kv in last)
                {
                    if (kv.Value == "open" && !current.Contains(kv.Key))
                    {
                        Dictionary<string, object> row = new Dictionary<string, object>();
                        row["at"] = DateTimeOffset.UtcNow.ToString("o");
                        row["id"] = kv.Key;
                        row["status"] = "resolved";
                        row["how"] = "evidence no longer present on this machine";
                        append.Add(new JavaScriptSerializer().Serialize(row));
                        newlyResolved++;
                    }
                }

                if (append.Count > 0) File.AppendAllLines(file, append, new UTF8Encoding(false));
            }
            catch { summary["error"] = "write-failed"; }
            summary["open"] = open;
            summary["newlyOpened"] = newlyOpened;
            summary["newlyResolved"] = newlyResolved;
            return summary;
        }

        static string GapRow(string status, Dictionary<string, object> f)
        {
            Dictionary<string, object> row = new Dictionary<string, object>();
            row["at"] = DateTimeOffset.UtcNow.ToString("o");
            row["id"] = f["id"];
            row["status"] = status;
            row["cause"] = f["cause"];
            row["evidence"] = f["evidence"];
            row["whyNotFixed"] = f["note"];
            return new JavaScriptSerializer().Serialize(row);
        }

        internal void OpenBackups()
        {
            string p = Path.Combine(Home, "dayu", "protection", "store");
            if (!NoLinks(p) || !Directory.Exists(p)) throw new InvalidOperationException();
            Process.Start(new ProcessStartInfo("explorer.exe", "\"" + p + "\"") { UseShellExecute = false });
        }
    }

    // ── 白名单修复动作：每个动作先验证条件，验证不过就拒绝，绝不做「猜着修」 ────────
    internal static class Actions
    {
        internal static string RemoveStopFlag(Inspector ins)
        {
            string f = Path.Combine(ins.BridgeRoot, "state", "STOP.flag");
            if (!Inspector.NoLinks(f)) throw new InvalidOperationException("refused-link");
            if (!File.Exists(f)) throw new InvalidOperationException("nothing-to-do");
            string lockPath = Path.Combine(ins.BridgeRoot, "state", "bridge.lock");
            int bridgePid = File.Exists(lockPath) ? Inspector.ReadLockPid(lockPath) : 0;
            if (bridgePid > 0 && Inspector.ProcessAlive(bridgePid))
                throw new InvalidOperationException("refused-bridge-running");
            File.Delete(f);
            ins.AppendAudit("remove-stop-flag", "ok", "bridge not running");
            return "ok";
        }

        internal static string RemoveStaleLock(Inspector ins)
        {
            string f = Path.Combine(ins.BridgeRoot, "state", "bridge.lock");
            if (!Inspector.NoLinks(f)) throw new InvalidOperationException("refused-link");
            if (!File.Exists(f)) throw new InvalidOperationException("nothing-to-do");
            int pid = Inspector.ReadLockPid(f);
            if (pid <= 0) throw new InvalidOperationException("refused-unknown-lock");
            if (Inspector.ProcessAlive(pid)) throw new InvalidOperationException("refused-bridge-running");
            File.Delete(f);
            ins.AppendAudit("remove-stale-lock", "ok", "pid not alive");
            return "ok";
        }

        // 恢复 profile 的 package.json：只在「宿主完全退出 + 目标语法坏 + 备份健康」时做，
        // 先把原件复制到 repair/backups/<时间戳>/，再覆盖，覆盖后重新解析验证，不过就回滚。
        internal static string RestoreProfile(Inspector ins, string backupPath)
        {
            string target = ins.ProfileJsonPath();
            if (!Inspector.NoLinks(target)) throw new InvalidOperationException("refused-link");
            if (!File.Exists(target)) throw new InvalidOperationException("target-missing");
            if (IsHealthyJson(target)) throw new InvalidOperationException("refused-target-not-broken");

            if (!HostIsDown() && !TestHostDownBypass()) throw new InvalidOperationException("refused-host-running");

            if (String.IsNullOrWhiteSpace(backupPath) || !File.Exists(backupPath)) throw new InvalidOperationException("backup-missing");
            if (!Inspector.NoLinks(backupPath)) throw new InvalidOperationException("refused-link");
            FileInfo bi = new FileInfo(backupPath);
            if (bi.Length > 1048576) throw new InvalidOperationException("backup-too-large");
            Dictionary<string, object> bk = ParseJsonFile(backupPath);
            if (bk == null) throw new InvalidOperationException("backup-invalid-json");
            if (Inspector.CountBundles(bk) < 0) throw new InvalidOperationException("backup-not-a-profile");

            string stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmssfffZ");
            string dir = Path.Combine(ins.Home, "dayu", "repair", "backups", stamp);
            if (!Inspector.NoLinks(dir)) throw new InvalidOperationException("refused-link");
            Directory.CreateDirectory(dir);
            string saved = Path.Combine(dir, "package.json");
            File.Copy(target, saved, true);
            File.WriteAllText(saved + ".sha256", Sha256(saved) + "  package.json\n", new UTF8Encoding(false));

            File.Copy(backupPath, target, true);
            if (!IsHealthyJson(target))
            {
                File.Copy(saved, target, true); // 回滚，宁可变回坏的也不留半截
                ins.AppendAudit("restore-profile-json", "rolled-back", "verify failed after write");
                throw new InvalidOperationException("verify-failed-rolled-back");
            }
            ins.AppendAudit("restore-profile-json", "ok", "restored from user-selected backup; original kept in backups/" + stamp);
            return "ok";
        }

        internal static bool HostIsDown()
        {
            Process[] ps;
            try { ps = Process.GetProcessesByName("DeepSeek Harness"); }
            catch { return false; }
            bool any = false;
            foreach (Process p in ps)
            {
                try { if (!p.HasExited) any = true; }
                catch { any = true; }
                finally { p.Dispose(); }
            }
            return !any;
        }

        // 仅测试用：必须已经用 DSH_HOME 指到临时目录（且不是真实家目录）才允许绕过宿主检查。
        internal static bool TestHostDownBypass()
        {
            if (Environment.GetEnvironmentVariable("YUSHEN_REPAIR_TEST_HOST_DOWN") != "1") return false;
            string ov = Environment.GetEnvironmentVariable("DSH_HOME");
            string real = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".dsh");
            if (String.IsNullOrWhiteSpace(ov)) return false;
            return String.Compare(Path.GetFullPath(ov), Path.GetFullPath(real), true, CultureInfo.InvariantCulture) != 0;
        }

        static bool IsHealthyJson(string path)
        {
            return ParseJsonFile(path) != null;
        }

        static Dictionary<string, object> ParseJsonFile(string path)
        {
            try
            {
                byte[] b = File.ReadAllBytes(path);
                if (b.Length > 1048576) return null;
                JavaScriptSerializer j = new JavaScriptSerializer();
                j.MaxJsonLength = 1048576;
                j.RecursionLimit = 32;
                return j.DeserializeObject(new UTF8Encoding(false, true).GetString(b).TrimStart('\uFEFF')) as Dictionary<string, object>;
            }
            catch { return null; }
        }

        // 认证死循环的重置：对应 2026-10-25 故障档案第 ① 条。
        // 顺序固定为「先全部备份成功，再动手」；宿主必须在跑之外才允许。
        internal static string ResetAuth(Inspector ins)
        {
            if (!Inspector.HostIsDown() && !TestHostDownBypass()) throw new InvalidOperationException("refused-host-running");

            string shell = ins.ShellRoot();
            string cred = ins.CredentialsPath();
            string stamp = DateTimeOffset.UtcNow.ToString("yyyyMMddTHHmmssfffZ");
            string dir = Path.Combine(ins.Home, "dayu", "repair", "backups", stamp + "-auth");
            if (!Inspector.NoLinks(dir)) throw new InvalidOperationException("refused-link");

            List<string> sessionDirs = new List<string>();
            if (shell != null && Directory.Exists(shell))
            {
                foreach (string name in new string[] { "Network", "Session Storage" })
                {
                    string src = Path.Combine(shell, name);
                    if (Directory.Exists(src)) sessionDirs.Add(src);
                }
            }
            bool hasCred = File.Exists(cred);
            bool hasLock = shell != null && File.Exists(Path.Combine(shell, "lockfile"));
            if (sessionDirs.Count == 0 && !hasCred && !hasLock) throw new InvalidOperationException("nothing-to-do");

            // 第一遍：全部备份，任何一步失败就整体放弃，一个文件都不动。
            Directory.CreateDirectory(dir);
            foreach (string src in sessionDirs)
            {
                if (!Inspector.NoLinks(src)) throw new InvalidOperationException("refused-link");
                Inspector.CopyDir(src, Path.Combine(dir, Path.GetFileName(src)));
            }
            if (hasCred)
            {
                if (!Inspector.NoLinks(cred)) throw new InvalidOperationException("refused-link");
                File.Copy(cred, Path.Combine(dir, ".credentials.yaml"), true);
            }

            // 第二遍：动手。
            foreach (string src in sessionDirs) Directory.Delete(src, true);
            if (hasLock) File.Delete(Path.Combine(shell, "lockfile"));
            if (hasCred) File.Move(cred, cred + ".bak-" + stamp);

            ins.AppendAudit("reset-auth", "ok",
                "session cache cleared: " + sessionDirs.Count + ", credentials renamed: " + (hasCred ? "yes" : "no")
                + ", lockfile removed: " + (hasLock ? "yes" : "no") + "; backup in backups/" + stamp + "-auth");
            return "ok";
        }

        static string Sha256(string path)
        {
            using (SHA256 sha = SHA256.Create())
            using (FileStream fs = File.OpenRead(path))
            {
                byte[] hash = sha.ComputeHash(fs);
                StringBuilder sb = new StringBuilder();
                foreach (byte x in hash) sb.Append(x.ToString("x2", CultureInfo.InvariantCulture));
                return sb.ToString();
            }
        }
    }

    // 崩溃取证：真崩了就该回答「为什么」，而不是只报一句 suspected。
    // 读的东西：壳崩溃日志原文（最近 10 条）、Windows 应用日志里 DeepSeek Harness 的报错、磁盘余量、GPU 缓存。
    internal sealed class Forensics
    {
        public int LogsScanned, LogsMatched;
        public string LatestLogAt = "";
        public List<string> Signatures = new List<string>();
        public int EventHits;
        public string FaultingModule = "";
        public string ExceptionCode = "";
        public string EventLatestAt = "";
        public double DiskFreeGb = -1;
        public string GpuCache = "unknown";

        static string Clean(string s)
        {
            // 去掉可能出现的用户路径（只保留错误本身的语义）。
            int i = s.IndexOf(@":\", StringComparison.Ordinal);
            if (i < 0) i = s.IndexOf(":/", StringComparison.Ordinal);
            if (i >= 0)
            {
                int start = i;
                while (start > 0 && s[start - 1] != ' ' && s[start - 1] != '\t') start--;
                int end = i + 2;
                while (end < s.Length && " \t，,;；)".IndexOf(s[end]) < 0) end++;
                s = s.Substring(0, start) + "<path>" + s.Substring(end);
            }
            return s.Length > 220 ? s.Substring(0, 220) + "…" : s;
        }

        internal static Forensics Collect(Inspector ins)
        {
            Forensics f = new Forensics();

            // ① 壳的崩溃日志：最近 10 条，抽错误行
            try
            {
                string shell = ins.ShellRoot();
                string logs = shell == null ? null : Path.Combine(shell, "logs");
                if (logs != null && Directory.Exists(logs))
                {
                    string[] files = Directory.GetFiles(logs, "crash-*-host.log");
                    Array.Sort(files, delegate(string x, string y)
                    {
                        return File.GetLastWriteTimeUtc(y).CompareTo(File.GetLastWriteTimeUtc(x));
                    });
                    foreach (string file in files)
                    {
                        if (f.LogsScanned >= 10) break;
                        f.LogsScanned++;
                        try
                        {
                            if (new FileInfo(file).Length > 2097152) continue;
                            string text = File.ReadAllText(file, new UTF8Encoding(false, true));
                            if (text.IndexOf("Web authentication failed", StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                f.LogsMatched++;
                                if (f.LatestLogAt.Length == 0) f.LatestLogAt = File.GetLastWriteTimeUtc(file).ToString("o");
                            }
                            foreach (string line in text.Split('\n'))
                            {
                                string s = line.Trim();
                                if (s.Length < 8) continue;
                                if (s.IndexOf("Error", StringComparison.OrdinalIgnoreCase) < 0
                                    && s.IndexOf("Exception", StringComparison.OrdinalIgnoreCase) < 0
                                    && s.IndexOf(" at ", StringComparison.OrdinalIgnoreCase) < 0) continue;
                                string c = Clean(s);
                                if (!f.Signatures.Contains(c)) f.Signatures.Add(c);
                                if (f.Signatures.Count >= 6) break;
                            }
                        }
                        catch { /* 单条读不了跳过 */ }
                    }
                }
            }
            catch { }

            // ② Windows 应用日志：最近 7 天里 DeepSeek Harness 的崩溃条目（含错误模块/异常代码）
            try
            {
                using (EventLog log = new EventLog("Application"))
                {
                    DateTime since = DateTime.Now.AddDays(-7);
                    int total = log.Entries.Count;
                    int scanned = 0;
                    for (int i = total - 1; i >= 0 && scanned < 2000; i--)
                    {
                        scanned++;
                        EventLogEntry en = log.Entries[i];
                        if (en.TimeGenerated < since) break;
                        if (en.EntryType != EventLogEntryType.Error && en.EntryType != EventLogEntryType.Warning) continue;
                        string msg = en.Message ?? "";
                        if (msg.IndexOf("DeepSeek Harness", StringComparison.OrdinalIgnoreCase) < 0) continue;
                        f.EventHits++;
                        if (f.EventLatestAt.Length == 0) f.EventLatestAt = en.TimeGenerated.ToUniversalTime().ToString("o");
                        if (f.FaultingModule.Length == 0) f.FaultingModule = After(msg, "错误模块名称", 90) ?? After(msg, "Faulting module name", 90) ?? "";
                        if (f.ExceptionCode.Length == 0) f.ExceptionCode = After(msg, "异常代码", 30) ?? After(msg, "Exception code", 30) ?? "";
                    }
                }
            }
            catch { /* 读不了事件日志就跳过，不影响诊断 */ }

            // ③ 环境：磁盘余量、GPU 缓存
            try
            {
                string root = Path.GetPathRoot(ins.Home);
                DriveInfo d = new DriveInfo(root);
                f.DiskFreeGb = Math.Round(d.AvailableFreeSpace / 1073741824.0, 1);
            }
            catch { }
            try
            {
                string shell = ins.ShellRoot();
                if (shell != null)
                {
                    string gpu = Path.Combine(shell, "GPUCache");
                    if (!Directory.Exists(gpu)) f.GpuCache = "absent";
                    else
                    {
                        int n = 0;
                        foreach (string x in Directory.GetFiles(gpu)) { n++; if (n > 5000) break; }
                        f.GpuCache = n == 0 ? "empty" : "present(" + n + ")";
                    }
                }
            }
            catch { }

            return f;
        }

        static string After(string text, string marker, int max)
        {
            int i = text.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
            if (i < 0) return null;
            i = text.IndexOf(':', i);
            if (i < 0) i = text.IndexOf('：', i);
            if (i < 0) return null;
            int end = text.IndexOf('\n', i + 1);
            string s = (end < 0 ? text.Substring(i + 1) : text.Substring(i + 1, end - i - 1)).Trim();
            if (s.Length > max) s = s.Substring(0, max) + "…";
            return s;
        }

        internal Dictionary<string, object> ToDict()
        {
            Dictionary<string, object> d = new Dictionary<string, object>();
            d["logsScanned"] = LogsScanned;
            d["logsMatched"] = LogsMatched;
            if (LatestLogAt.Length > 0) d["latestMatchedAt"] = LatestLogAt;
            d["signatures"] = Signatures.ToArray();
            d["eventHits"] = EventHits;
            if (FaultingModule.Length > 0) d["faultingModule"] = FaultingModule;
            if (ExceptionCode.Length > 0) d["exceptionCode"] = ExceptionCode;
            if (EventLatestAt.Length > 0) d["eventLatestAt"] = EventLatestAt;
            d["diskFreeGb"] = DiskFreeGb;
            d["gpuCache"] = GpuCache;
            return d;
        }

        // 把证据翻成「为什么崩」：每条都带证据和可信度，不猜就是 unknown。
        internal static List<Dictionary<string, object>> Explain(CheckState c, string classification, Forensics f)
        {
            List<Dictionary<string, object>> list = new List<Dictionary<string, object>>();
            if (classification != "crash-suspected") return list;

            if (c.AuthCrash == "suspected")
                Cause(list, "认证死循环导致启动即崩", "崩溃日志含 Web authentication failed，且晚于本轮启动", "high", "reset-auth");
            if (c.ProfileJson == "broken")
                Cause(list, "profile 的 package.json 坏了，DSH 加载失败", "package.json 解析失败", "high", "restore-profile-json");
            if (c.DepsDir == "missing")
                Cause(list, "桥接依赖被删，桥接起不来", "node_modules 不存在", "high", "");
            if (c.StopFlag == "present" || c.StaleLock == "yes")
                Cause(list, "桥接被残留标志/僵尸锁挡住", "STOP.flag 或 bridge.lock 残留", "high", "remove-stale-lock");
            if (c.VirtualDisplay == "oray" || c.VirtualDisplay == "virtual")
            {
                string mod = (f != null ? f.FaultingModule : null) ?? "";
                bool gfx = mod.IndexOf("nv", StringComparison.OrdinalIgnoreCase) >= 0
                    || mod.IndexOf("igd", StringComparison.OrdinalIgnoreCase) >= 0
                    || mod.IndexOf("amd", StringComparison.OrdinalIgnoreCase) >= 0
                    || mod.IndexOf("d3d", StringComparison.OrdinalIgnoreCase) >= 0
                    || mod.IndexOf("dxgi", StringComparison.OrdinalIgnoreCase) >= 0;
                Cause(list, "渲染进程崩在显卡/虚拟显示器上",
                    "显示适配器含虚拟显示器" + (mod.Length > 0 ? "；崩溃模块=" + mod : "；事件日志里没有模块名"),
                    gfx ? "high" : "medium", "");
            }
            if (f != null && f.ExceptionCode.Length > 0)
                Cause(list, "存在进程级异常（" + f.ExceptionCode + "）",
                    "Windows 应用日志记录到 DeepSeek Harness 的错误事件" + (f.FaultingModule.Length > 0 ? "，模块=" + f.FaultingModule : ""),
                    "high", "");
            if (f != null && f.DiskFreeGb >= 0 && f.DiskFreeGb < 2)
                Cause(list, "磁盘空间不足", "可用空间 " + f.DiskFreeGb + " GB", "medium", "");
            if (list.Count == 0)
                Cause(list, "没匹配到已知原因", f != null && f.Signatures.Count > 0 ? "日志里有错误行，但不在已知签名表里" : "没有可读的崩溃证据",
                    "low", "");
            return list;
        }

        static void Cause(List<Dictionary<string, object>> list, string cause, string evidence, string confidence, string action)
        {
            Dictionary<string, object> row = new Dictionary<string, object>();
            row["cause"] = cause;
            row["evidence"] = evidence;
            row["confidence"] = confidence;
            row["action"] = action;
            list.Add(row);
        }
    }

    internal sealed class MainForm : Form
    {
        readonly Inspector ins;
        readonly TextBox output;
        readonly FlowLayoutPanel bar;
        Dictionary<string, object> report;

        public MainForm(Inspector x)
        {
            ins = x;
            Text = "鱼神离线修复助手 · 作者 从零开始（QQ 3752445956） · 本地未签名";
            AutoScaleMode = AutoScaleMode.None;
            Font = new Font("Microsoft YaHei UI", 13F, FontStyle.Regular);
            StartPosition = FormStartPosition.Manual;
            // 直接最大化：DPI 缩放各机器不一样，最大化能保证“字看得清、内容装得下”。
            WindowState = FormWindowState.Maximized;
            Width = 1150;
            Height = 800;
            Location = new Point(40, 30);
            bar = new FlowLayoutPanel();
            bar.Dock = DockStyle.Top;
            bar.Height = 170;
            bar.AutoScroll = false;
            output = new TextBox();
            output.Dock = DockStyle.Fill;
            output.Multiline = true;
            output.ReadOnly = true;
            output.ScrollBars = ScrollBars.Both;
            output.Font = new Font("Microsoft YaHei UI", 15F, FontStyle.Regular);
            output.WordWrap = true;
            Controls.Add(output);
            Controls.Add(bar);
            ShowIntro();
            RebuildBar();
        }

        void ShowIntro()
        {
            output.Text = "鱼神离线修复助手（本地未签名）\r\n"
                + "作者：从零开始　QQ：3752445956\r\n\r\n"
                + "这个窗口不会自己动任何文件。\r\n"
                + "点「开始诊断」后：先查原因 → 对上了哪些已知故障 → 哪些能修 → 再决定按不按修复。\r\n\r\n"
                + "扫描范围：DSH 生命周期证据、profile 与桥接的几个固定文件、壳的崩溃日志、显示适配器。\r\n"
                + "不读聊天、账本、凭据内容。\r\n";
            ClearSelection();
        }

        void ClearSelection()
        {
            output.SelectionStart = 0;
            output.SelectionLength = 0;
        }

        // 两步：没诊断时只有「开始诊断」；诊断后才出「修复」。
        void RebuildBar()
        {
            bar.Controls.Clear();
            if (report == null)
            {
                Add(bar, "开始诊断", delegate { RefreshReport(); });
                Add(bar, "打开 backup 目录", delegate { try { ins.OpenBackups(); } catch { MessageBox.Show("备份目录不可访问。", "修复助手"); } });
                return;
            }

            Add(bar, "重新诊断", delegate { RefreshReport(); });
            List<Dictionary<string, object>> plan = report["plan"] as List<Dictionary<string, object>>;
            int pending = 0;
            if (plan != null)
            {
                foreach (Dictionary<string, object> item in plan)
                {
                    if (item["available"] is bool && (bool)item["available"]) pending += 1;
                }
            }
            Button fix = new Button();
            fix.Text = pending > 0 ? "修复（" + pending + " 项）" : "没有需要修的项目";
            fix.AutoSize = true;
            fix.Font = new Font("Microsoft YaHei UI", 14F, FontStyle.Bold);
            fix.Padding = new Padding(14, 8, 14, 8);
            fix.Margin = new Padding(0, 0, 8, 8);
            fix.Enabled = pending > 0;
            fix.Click += delegate { FixAllFlow(); };
            bar.Controls.Add(fix);
            Add(bar, "导出脱敏报告", delegate { Export(); });
            Add(bar, "打开 backup 目录", delegate { try { ins.OpenBackups(); } catch { MessageBox.Show("备份目录不可访问。", "修复助手"); } });
        }

        // 一个按钮、一次确认：工具自己决定修哪个，按固定顺序跑对应的固定代码。
        void FixAllFlow()
        {
            if (report == null) RefreshReport();
            List<Dictionary<string, object>> plan = report["plan"] as List<Dictionary<string, object>>;
            if (plan == null) return;

            StringBuilder will = new StringBuilder();
            StringBuilder skip = new StringBuilder();
            int count = 0;
            foreach (Dictionary<string, object> item in plan)
            {
                bool ok = item["available"] is bool && (bool)item["available"];
                if (ok)
                {
                    count++;
                    will.AppendLine("  · " + item["title"]);
                }
                else skip.AppendLine("  · " + item["title"] + "（" + item["reason"] + "）");
            }
            if (count == 0)
            {
                MessageBox.Show("诊断结果里没有需要修的项目。\r\n\r\n" + (skip.Length > 0 ? "不修的理由：\r\n" + skip : ""), "修复助手");
                return;
            }

            // 按下「修复」就是同意：按固定顺序跑对应代码，不再弹二次确认。
            // 会做什么在上面的诊断结果里已经写明（每项都带处置说明）。
            try
            {
                string cls = report["classification"] as string;
                CheckState chk = ins.Checks();
                Dictionary<string, object> gapSummary;
                List<Dictionary<string, object>> results = Inspector.FixAll(ins, chk, cls, out gapSummary);
                StringBuilder done = new StringBuilder();
                bool restorePending = false;
                foreach (Dictionary<string, object> row in results)
                {
                    string title = row["title"] as string;
                    string result = row["result"] as string;
                    if (result == "skipped")
                    {
                        // 只有「真的该恢复、只是缺备份文件」才追问；missing / 宿主在跑 都不该弹。
                        if (String.Equals(row["id"] as string, "restore-profile-json", StringComparison.Ordinal)
                            && String.Equals(row["reason"] as string, "needs backup selection", StringComparison.Ordinal))
                            restorePending = true;
                        done.AppendLine("  跳过 " + title + "（" + row["reason"] + "）");
                    }
                    else if (result == "failed") done.AppendLine("  失败 " + title + "（" + row["reason"] + "）");
                    else done.AppendLine("  完成 " + title);
                }
                int gapOpen = gapSummary["open"] is int ? (int)gapSummary["open"] : 0;
                if (gapOpen > 0)
                {
                    done.AppendLine();
                    done.AppendLine("另有 " + gapOpen + " 项修不了，已记进缺口台账（dayu\\repair\\gaps.jsonl）：");
                    done.AppendLine("等别的手段把机器修好、DSH 再跑起来之后，助手会复核并标记 resolved。");
                }
                MessageBox.Show(done.ToString(), "修复结果", MessageBoxButtons.OK, MessageBoxIcon.Information);

                // profile 坏了只能由用户选备份，这是唯一保留的追问。
                if (restorePending && MessageBox.Show(
                        "profile 的 package.json 坏了，需要你选一份健康备份来恢复。现在选？",
                        "恢复 package.json", MessageBoxButtons.YesNo, MessageBoxIcon.Question) == DialogResult.Yes)
                {
                    RestoreFlow();
                    return;
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("执行中断：" + ex.Message + "\r\n\r\n已做的动作都留了审计和备份。", "修复助手", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            RefreshReport();
        }

        void Add(FlowLayoutPanel p, string t, EventHandler h)
        {
            Button b = new Button();
            b.Text = t;
            b.AutoSize = true;
            b.Font = new Font("Microsoft YaHei UI", 13F, FontStyle.Bold);
            b.Padding = new Padding(10, 6, 10, 6);
            b.Margin = new Padding(0, 0, 8, 8);
            b.Click += h;
            p.Controls.Add(b);
        }

        void ConfirmFix(string question, Func<string> action)
        {
            if (MessageBox.Show(question, "修复助手", MessageBoxButtons.YesNo, MessageBoxIcon.Question) != DialogResult.Yes) return;
            try
            {
                string r = action();
                MessageBox.Show("完成：" + r, "修复助手", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("拒绝或失败：" + ex.Message + "\n\n没有做任何修改，或已回滚。", "修复助手", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            RefreshReport();
        }

        void RestoreFlow()
        {
            string backup;
            using (OpenFileDialog d = new OpenFileDialog())
            {
                d.Filter = "package.json 备份 (*.json)|*.json|所有文件 (*.*)|*.*";
                d.Title = "选择一份健康的 package.json 备份";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                backup = d.FileName;
            }
            string msg = "用这份备份覆盖 profile 的 package.json？\n\n"
                + "· 必须已经正常退出 DSH（宿主在跑会直接拒绝）\n"
                + "· 原文件会先复制到 dayu\\repair\\backups\\<时间戳>\\\n"
                + "· 覆盖后会重新解析，解析不过会自动回滚\n\n"
                + "备份文件：" + Path.GetFileName(backup);
            if (MessageBox.Show(msg, "恢复 package.json", MessageBoxButtons.YesNo, MessageBoxIcon.Warning) != DialogResult.Yes) return;
            try
            {
                Actions.RestoreProfile(ins, backup);
                MessageBox.Show("已恢复，并验证可解析。原文件留在 backups 目录里。", "修复助手", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show("未恢复：" + ex.Message + "\n\n原文件没有被改动。", "修复助手", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
            RefreshReport();
        }

        void RefreshReport()
        {
            report = ins.Run();
            string[] advice = report["advice"] as string[];
            StringBuilder sb = new StringBuilder();
            sb.AppendLine("鱼神离线修复助手 · 作者 从零开始（QQ 3752445956） · 本地未签名");
            sb.AppendLine("以下结论只基于本机白名单证据。");
            sb.AppendLine("分类：" + report["classification"]);
            sb.AppendLine(report["diagnosticSummary"] as string);
            sb.AppendLine();

            // 先给原因：命中了哪些已知故障，能不能修。
            List<Dictionary<string, object>> findings = report["findings"] as List<Dictionary<string, object>>;
            sb.AppendLine("查到的原因：" + (findings == null || findings.Count == 0 ? "没有命中已知故障" : findings.Count + " 条"));
            if (findings != null)
            {
                foreach (Dictionary<string, object> f in findings)
                {
                    bool fixable = f["fixable"] is bool && (bool)f["fixable"];
                    sb.AppendLine("  " + (fixable ? "[能修]" : "[只报告]") + " " + f["cause"]);
                    sb.AppendLine("          证据：" + f["evidence"]);
                    string note = f["note"] as string;
                    if (!String.IsNullOrEmpty(note)) sb.AppendLine("          处置：" + note);
                }
            }
            sb.AppendLine();
            sb.AppendLine("检查：profile / 桥接依赖 / STOP.flag / bridge.lock = " + ChecksLine(report));
            sb.AppendLine("　　　认证崩溃 / 壳缓存 / 壳锁 / 虚拟显示器 = " + ChecksLine2(report));
            sb.AppendLine();
            sb.AppendLine("建议（固定文本，不是自动修复）：");
            if (advice != null) foreach (string s in advice) sb.AppendLine("  · " + s);
            sb.AppendLine();
            // 崩溃取证：先回答「为什么崩」，再说修什么。
            List<Dictionary<string, object>> causes = report["causes"] as List<Dictionary<string, object>>;
            if (causes != null && causes.Count > 0)
            {
                sb.AppendLine("为什么崩（取证）：");
                foreach (Dictionary<string, object> cs in causes)
                    sb.AppendLine("  [" + cs["confidence"] + "] " + cs["cause"] + " —— " + cs["evidence"]);
                Dictionary<string, object> fore = report["forensics"] as Dictionary<string, object>;
                if (fore != null)
                {
                    sb.AppendLine("  取证：崩溃日志 " + fore["logsScanned"] + " 条（命中 " + fore["logsMatched"] + "）· "
                        + "事件日志 " + fore["eventHits"] + " 条 · 磁盘 " + fore["diskFreeGb"] + " GB · GPU缓存 " + fore["gpuCache"]);
                    string[] sigs = fore["signatures"] as string[];
                    if (sigs != null)
                    {
                        foreach (string s in sigs) sb.AppendLine("  日志行：" + s);
                    }
                }
                sb.AppendLine();
            }

            sb.AppendLine("修复计划（按上面的「修复」按钮才动手）：");            List<Dictionary<string, object>> plan = report["plan"] as List<Dictionary<string, object>>;
            int willFix = 0;
            if (plan == null || plan.Count == 0) sb.AppendLine("  · 没有可执行的动作");
            else foreach (Dictionary<string, object> item in plan)
            {
                bool ok = item["available"] is bool && (bool)item["available"];
                if (ok) willFix++;
                sb.AppendLine("  " + (ok ? "[会修]" : "[跳过]") + " " + item["title"] + " —— " + item["reason"]);
            }
            sb.AppendLine(willFix > 0 ? "  共 " + willFix + " 项会修；其余只报告。" : "  没有需要修的项目，只看报告即可。");
            sb.AppendLine();
            sb.Append(Program.Json(report));
            output.Text = sb.ToString();
            ClearSelection();
            RebuildBar();
        }

        static string ChecksLine(Dictionary<string, object> report)
        {
            Dictionary<string, object> c = report["checks"] as Dictionary<string, object>;
            if (c == null) return "unknown";
            return String.Format("{0} / {1} / {2} / {3}",
                c["profileJson"], c["bridgeDeps"], c["stopFlag"], c["bridgeLock"]);
        }

        static string ChecksLine2(Dictionary<string, object> report)
        {
            Dictionary<string, object> c = report["checks"] as Dictionary<string, object>;
            if (c == null) return "unknown";
            return String.Format("{0} / {1} / {2} / {3}",
                c["authCrash"], c["shellCache"], c["shellLockfile"], c["virtualDisplay"]);
        }

        void Export()
        {
            using (SaveFileDialog d = new SaveFileDialog())
            {
                d.Filter = "JSON (*.json)|*.json";
                d.FileName = "yushen-diagnostic.json";
                if (d.ShowDialog(this) != DialogResult.OK) return;
                try { File.WriteAllText(d.FileName, Program.Json(report), new UTF8Encoding(false)); }
                catch { MessageBox.Show("导出失败", "修复助手"); }
            }
        }
    }

    internal static class Program
    {
        [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
        [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
        [DllImport("user32.dll")] static extern bool SetProcessDPIAware();

        internal static string Json(object o)
        {
            return new JavaScriptSerializer().Serialize(o);
        }

        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                if (args.Length == 1 && args[0] == "--self-test")
                {
                    Diagnosis.SelfTest();
                    Console.WriteLine("self-test: passed");
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--diagnose")
                {
                    Console.WriteLine(Json(new Inspector().Run()));
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--plan")
                {
                    // 只给结论和建议动作，一个文件都不动。
                    Dictionary<string, object> full = new Inspector().Run();
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["schemaVersion"] = 2;
                    r["buildTrust"] = "unsigned-local-build";
                    r["classification"] = full["classification"];
                    r["diagnosticSummary"] = full["diagnosticSummary"];
                    r["checks"] = full["checks"];
                    r["plan"] = full["plan"];
                    r["privacy"] = full["privacy"];
                    Console.WriteLine(Json(r));
                    return 0;
                }
                if (args.Length == 2 && args[0] == "--fix" && args[1] == "--confirm")
                {
                    // 诊断一次 → 按固定顺序只修该修的 → 逐项报结果。
                    Inspector ins = new Inspector();
                    Dictionary<string, object> diag = ins.Run();
                    string cls = diag["classification"] as string;
                    CheckState c = ins.Checks();
                    Dictionary<string, object> gapSummary;
                    List<Dictionary<string, object>> results = Inspector.FixAll(ins, c, cls, out gapSummary);
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["action"] = "fix";
                    r["classification"] = cls;
                    r["results"] = results;
                    r["gaps"] = gapSummary;
                    Console.WriteLine(Json(r));
                    return 0;
                }
                if (args.Length == 1 && args[0] == "--fix-safe")
                {
                    Inspector ins = new Inspector();
                    List<string> done = new List<string>();
                    try { done.Add(Actions.RemoveStopFlag(ins)); }
                    catch (Exception ex) { done.Add("stop-flag:" + ex.Message); }
                    try { done.Add(Actions.RemoveStaleLock(ins)); }
                    catch (Exception ex) { done.Add("stale-lock:" + ex.Message); }
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["action"] = "fix-safe";
                    r["details"] = done.ToArray();
                    Console.WriteLine(Json(r));
                    return 0;
                }
                if (args.Length == 3 && args[0] == "--restore-profile" && args[2] == "--confirm")
                {
                    Inspector ins = new Inspector();
                    Actions.RestoreProfile(ins, args[1]);
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["action"] = "restore-profile-json";
                    r["result"] = "ok";
                    Console.WriteLine(Json(r));
                    return 0;
                }
                if (args.Length == 2 && args[0] == "--reset-auth" && args[1] == "--confirm")
                {
                    Inspector ins = new Inspector();
                    Actions.ResetAuth(ins);
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["action"] = "reset-auth";
                    r["result"] = "ok";
                    Console.WriteLine(Json(r));
                    return 0;
                }
                if (args.Length != 0)
                {
                    Console.Error.WriteLine("Usage: YushenRepair.exe [--self-test|--diagnose|--fix-safe|--reset-auth --confirm|--restore-profile <backup.json> --confirm]");
                    return 2;
                }
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                // DPI 感知：不做的话 Windows 会按 150% 放大整个窗口，位置和尺寸都被带偏、右侧出屏。
                try { SetProcessDPIAware(); } catch { }
                // GUI 模式不显示那个控制台黑窗（CLI 模式仍然保留 stdout）。
                try { IntPtr cw = GetConsoleWindow(); if (cw != IntPtr.Zero) ShowWindow(cw, 0); } catch { }
                Application.Run(new MainForm(new Inspector()));
                return 0;
            }
            catch (Exception ex)
            {
                if (args.Length != 0)
                {
                    Dictionary<string, object> r = new Dictionary<string, object>();
                    r["result"] = "refused-or-failed";
                    r["detail"] = ex.Message;
                    Console.WriteLine(Json(r));
                    return 1;
                }
                MessageBox.Show("未执行恢复；请检查宿主状态、目标和备份。", "鱼神修复助手");
                return 1;
            }
        }
    }
}
