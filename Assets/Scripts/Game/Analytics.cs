using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Liangshan
{
    /// <summary>
    /// 经分上报。信封对齐 @gp/analytics-sdk，POST 到共用云函数 analytics-ingest。
    /// gameKey 是 cunkou。编辑器和自检截图不打点。登录后 user_id 用云存档身份。
    /// 主线走 level_*，比武和补给走 mode_*，避免和主线关号混进同一条漏斗。
    /// </summary>
    public static class Analytics
    {
        const string GameKey = CloudConfig.GameKey;
        const string Endpoint = "https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com/analytics-ingest/track";
        const string AnonKey = CloudConfig.GameKey + "_ga_anon";
        const string QueueKey = CloudConfig.GameKey + "_ga_queue";
        const string SdkVersion = "0.1.0-cs";
        const int Bulk = 20;
        const int MaxQueue = 200;

        static bool _ready;
        static bool _sessionStarted;
        static string _userId = "";
        static bool _sending;
        static string _anonId;
        static string _sessionId;
        static int _seq;
        static int _levelId;
        static string _levelName = "";
        static string _mode = "main";
        static bool _mainLevel;
        static float _levelAt;
        static bool _levelOpen;
        static float _lastEndAt = -10f;
        static readonly List<string> Queue = new List<string>();
        static Pump _pump;

        public static void Begin() => BindUser("");

        /// <summary>云登录结束后调用。有 userId 先打 login，再打 session_start。</summary>
        public static void BindUser(string userId)
        {
            Ensure();
            if (!string.IsNullOrEmpty(userId) && string.IsNullOrEmpty(_userId))
            {
                _userId = userId;
                Track("login", Param.Of("from_anonymous", true));
                Flush();
            }
            if (_sessionStarted) return;
            _sessionStarted = true;
            Track("session_start", Param.Of("entry", "main").Bool("with_user_id", !string.IsNullOrEmpty(_userId)));
            Flush();
        }

        public static void LevelStart(int levelId, string name, string mode)
        {
            if (!_sessionStarted) return;
            if (_levelOpen) LevelFail("quit", 0, 0);
            _mainLevel = mode == "main";
            _mode = string.IsNullOrEmpty(mode) ? "main" : mode;
            _levelOpen = true;
            _levelId = levelId;
            _levelName = name ?? "";
            _levelAt = Time.realtimeSinceStartup;
            Track(_mainLevel ? "level_start" : "mode_start", LevelParams(null, 0, 0));
        }

        public static void LevelClear(int wave, int kills)
        {
            if (!_sessionStarted || !_levelOpen) return;
            _levelOpen = false;
            Track(_mainLevel ? "level_clear" : "mode_clear", LevelParams(null, wave, kills));
        }

        public static void LevelFail(string reason, int wave, int kills)
        {
            if (!_sessionStarted || !_levelOpen) return;
            _levelOpen = false;
            Track(_mainLevel ? "level_fail" : "mode_fail", LevelParams(string.IsNullOrEmpty(reason) ? "lose" : reason, wave, kills));
        }

        public static void AdRequest(string scene) => Ad("ad_request", scene, null);
        public static void AdShow(string scene) => Ad("ad_show", scene, null);
        public static void AdClose(string scene, bool ended) => Ad("ad_close", scene, ended);

        static void Ad(string name, string scene, bool? ended)
        {
            if (!_sessionStarted) return;
            Param p = Param.Of("ad_unit_id", "reward")
                .Str("ad_type", "reward")
                .Str("scene", string.IsNullOrEmpty(scene) ? "unknown" : scene);
            if (_levelOpen) p.Num("level_id", _levelId).Str("mode", _mode);
            if (ended.HasValue) p.Bool("is_ended", ended.Value);
            Track(name, p);
        }

        static Param LevelParams(string reason, int wave, int kills)
        {
            int duration = Mathf.Max(0, Mathf.RoundToInt((Time.realtimeSinceStartup - _levelAt) * 1000f));
            Param p = Param.Of("level_id", _levelId).Str("level_name", _levelName).Str("mode", _mode);
            if (reason != null) p.Num("duration_ms", duration).Str("reason", reason).Num("wave", wave).Num("kills", kills);
            else if (!_levelOpen) p.Num("duration_ms", duration).Num("wave", wave).Num("kills", kills);
            return p;
        }

        static void Ensure()
        {
            if (_ready) return;
            _anonId = PlayerPrefs.GetString(AnonKey, "");
            if (string.IsNullOrEmpty(_anonId))
            {
                _anonId = NewId();
                PlayerPrefs.SetString(AnonKey, _anonId);
                PlayerPrefs.Save();
            }
            _sessionId = NewId();
            Restore();
            var go = new GameObject("Analytics");
            UnityEngine.Object.DontDestroyOnLoad(go);
            _pump = go.AddComponent<Pump>();
            _ready = true;
        }

        public static void OnHide(string reason)
        {
            if (!_ready || !_sessionStarted) return;
            if (Time.realtimeSinceStartup - _lastEndAt < 1f)
            {
                Flush();
                return;
            }
            _lastEndAt = Time.realtimeSinceStartup;
            Track("session_end", Param.Of("reason", reason));
            Flush();
        }

        static void Track(string name, Param param)
        {
            if (Application.isEditor || Profile.Volatile || !_ready || string.IsNullOrEmpty(name)) return;
            _seq++;
            Queue.Add(Envelope(name, param));
            while (Queue.Count > MaxQueue) Queue.RemoveAt(0);
            if (Queue.Count >= Bulk) Flush();
        }

        public static void Flush()
        {
            if (!_ready || _pump == null || _sending || Queue.Count == 0) return;
            Persist();
            _pump.StartCoroutine(Send());
        }

        static IEnumerator Send()
        {
            _sending = true;
            int n = Mathf.Min(Bulk, Queue.Count);
            var batch = new string[n];
            for (int i = 0; i < n; i++) batch[i] = Queue[i];
            var body = new StringBuilder(256 * n);
            body.Append("{\"batch\":[");
            for (int i = 0; i < n; i++)
            {
                if (i > 0) body.Append(',');
                body.Append(batch[i]);
            }
            body.Append("]}");

            long status = 0;
            using (var req = new UnityWebRequest(Endpoint, "POST"))
            {
                req.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(body.ToString()));
                req.downloadHandler = new DownloadHandlerBuffer();
                req.SetRequestHeader("Content-Type", "application/json");
                req.timeout = 8;
                yield return req.SendWebRequest();
                status = req.responseCode;
            }

            bool clientErr = status >= 400 && status < 500;
            bool ok = status >= 200 && status < 300;
            if (ok || clientErr)
            {
                int drop = Mathf.Min(n, Queue.Count);
                if (drop > 0) Queue.RemoveRange(0, drop);
                if (clientErr) Debug.LogWarning("[Analytics] drop batch status=" + status);
            }
            Persist();
            _sending = false;
            if (ok && Queue.Count >= Bulk) Flush();
        }

        static string Envelope(string name, Param param)
        {
            string ver = Application.version;
            if (string.IsNullOrEmpty(ver)) ver = "1.0.0";
            var sb = new StringBuilder(512);
            sb.Append("{\"event_id\":").Append(Json(NewId()));
            sb.Append(",\"event_name\":").Append(Json(name));
            sb.Append(",\"event_ts\":").Append(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString(CultureInfo.InvariantCulture));
            sb.Append(",\"game_key\":").Append(Json(GameKey));
            sb.Append(",\"app_version\":").Append(Json(ver));
            sb.Append(",\"sdk_version\":").Append(Json(SdkVersion));
            sb.Append(",\"platform\":").Append(Json(PlatformName()));
            sb.Append(",\"user_id\":").Append(Json(_userId ?? ""));
            sb.Append(",\"anonymous_id\":").Append(Json(_anonId));
            sb.Append(",\"session_id\":").Append(Json(_sessionId));
            sb.Append(",\"session_seq\":").Append(_seq.ToString(CultureInfo.InvariantCulture));
            sb.Append(",\"device\":{");
            sb.Append("\"brand\":\"\",\"model\":").Append(Json(SystemInfo.deviceModel));
            sb.Append(",\"system\":").Append(Json(SystemInfo.operatingSystem));
            sb.Append(",\"sdk_version\":\"\"");
            sb.Append(",\"screen_w\":").Append(Screen.width.ToString(CultureInfo.InvariantCulture));
            sb.Append(",\"screen_h\":").Append(Screen.height.ToString(CultureInfo.InvariantCulture));
            sb.Append(",\"network\":\"unknown\"}");
            sb.Append(",\"params\":").Append(param.Json());
            sb.Append('}');
            return sb.ToString();
        }

        static string PlatformName()
        {
#if UNITY_MINIGAME || WEIXINMINIGAME || UNITY_WEIXINMINIGAME || MINIGAME_SUBPLATFORM_WEIXIN
            return "wechat";
#elif MINIGAME_SUBPLATFORM_DOUYIN
            return "douyin";
#else
            return "h5";
#endif
        }

        static void Restore()
        {
            string raw = PlayerPrefs.GetString(QueueKey, "");
            if (string.IsNullOrEmpty(raw) || raw.Length < 2 || raw[0] != '[') return;
            int i = 1;
            while (i < raw.Length)
            {
                while (i < raw.Length && (raw[i] == ',' || raw[i] == ' ' || raw[i] == '\n')) i++;
                if (i >= raw.Length || raw[i] == ']') break;
                if (raw[i] != '{') break;
                int depth = 0;
                int start = i;
                bool str = false;
                bool esc = false;
                for (; i < raw.Length; i++)
                {
                    char c = raw[i];
                    if (str)
                    {
                        if (esc) esc = false;
                        else if (c == '\\') esc = true;
                        else if (c == '"') str = false;
                        continue;
                    }
                    if (c == '"') str = true;
                    else if (c == '{') depth++;
                    else if (c == '}')
                    {
                        depth--;
                        if (depth == 0)
                        {
                            i++;
                            Queue.Add(raw.Substring(start, i - start));
                            break;
                        }
                    }
                }
            }
        }

        static void Persist()
        {
            int from = Mathf.Max(0, Queue.Count - 40);
            var sb = new StringBuilder();
            sb.Append('[');
            for (int i = from; i < Queue.Count; i++)
            {
                if (i > from) sb.Append(',');
                sb.Append(Queue[i]);
            }
            sb.Append(']');
            string raw = sb.ToString();
            if (raw.Length > 48000) raw = "[]";
            PlayerPrefs.SetString(QueueKey, raw);
            PlayerPrefs.Save();
        }

        static string NewId()
        {
            const string chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
            var bytes = Guid.NewGuid().ToByteArray();
            var sb = new StringBuilder(22);
            for (int i = 0; i < 22; i++) sb.Append(chars[bytes[i % bytes.Length] % chars.Length]);
            return sb.ToString();
        }

        static string Json(string v)
        {
            if (string.IsNullOrEmpty(v)) return "\"\"";
            var sb = new StringBuilder(v.Length + 2);
            sb.Append('"');
            for (int i = 0; i < v.Length && sb.Length < 500; i++)
            {
                char c = v[i];
                if (c == '\\' || c == '"') sb.Append('\\').Append(c);
                else if (c == '\n') sb.Append("\\n");
                else if (c == '\r') sb.Append("\\r");
                else if (c < 32) continue;
                else sb.Append(c);
            }
            sb.Append('"');
            return sb.ToString();
        }

        sealed class Param
        {
            readonly StringBuilder _sb = new StringBuilder("{");
            bool _first = true;

            public static Param Of(string k, string v) => new Param().Str(k, v);
            public static Param Of(string k, bool v) => new Param().Bool(k, v);
            public static Param Of(string k, int v) => new Param().Num(k, v);

            public Param Str(string key, string v) { Add(key); _sb.Append(Analytics.Json(v)); return this; }
            public Param Num(string key, int v) { Add(key); _sb.Append(v.ToString(CultureInfo.InvariantCulture)); return this; }
            public Param Bool(string key, bool v) { Add(key); _sb.Append(v ? "true" : "false"); return this; }

            void Add(string key)
            {
                if (!_first) _sb.Append(',');
                _first = false;
                _sb.Append(Analytics.Json(key)).Append(':');
            }

            public string Json()
            {
                _sb.Append('}');
                return _sb.ToString();
            }
        }

        sealed class Pump : MonoBehaviour
        {
            float _next;

            void Update()
            {
                if (Time.realtimeSinceStartup < _next) return;
                _next = Time.realtimeSinceStartup + 15f;
                Flush();
            }

            void OnApplicationPause(bool paused)
            {
                if (paused) OnHide("app-hide");
            }

            void OnApplicationQuit()
            {
                OnHide("quit");
            }
        }
    }
}
