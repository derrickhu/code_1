using System;
using System.Collections;
using UnityEngine;

namespace Liangshan
{
    /// <summary>
    /// 云存档，逻辑照营救宋江（code_3）。
    /// 启动先登录再拉云：云端更新就覆盖本地，本地更新才上行；
    /// 登录或拉云失败进入 cacheOnly，禁止上行，避免空档盖掉云端。
    /// 服务端 409 说明云端又更新了，改为下行覆盖。
    /// </summary>
    public sealed class CloudSync : MonoBehaviour
    {
        enum Authority { Unknown, Confirmed, CacheOnly }

        [Serializable]
        sealed class SyncMeta
        {
            public long updatedAt;
            public long baseRemote;
            public bool dirty;
        }

        public static event Action Imported;

        static CloudSync _it;
        static bool _armed;

        Authority _auth = Authority.Unknown;
        SyncMeta _m;
        bool _booted;
        bool _initDone;
        bool _ready;
        bool _syncing;
        bool _pending;
        bool _disabled;
        bool _hideHooked;
        bool _early;
        bool _imported;
        int _fail;
        float _pushAt = -1f;
        float _retryAt = -1f;

        static CloudSync It
        {
            get
            {
                if (_it != null) return _it;
                var go = new GameObject("CloudSync");
                DontDestroyOnLoad(go);
                _it = go.AddComponent<CloudSync>();
                _it.LoadMeta();
                return _it;
            }
        }

        public static void Startup(Action ready)
        {
            _armed = true;
            It.StartCoroutine(It.RunStartup(ready));
        }

        public static void Touch()
        {
            if (!_armed || Profile.Volatile) return;
            var s = It;
            // 拉云超时后玩家已进首页；这时的改动先不刷时间戳，否则新手机会显得比云端新，把云上进度盖掉。
            if (!s._initDone)
            {
                s._early = true;
                return;
            }
            s._m.updatedAt = Math.Max(Backend.NowMs(), s._m.updatedAt + 1);
            s._m.dirty = true;
            s.WriteMeta();
            s.Schedule("dirty");
        }

        public static void FlushNow(string reason)
        {
            if (!_armed) return;
            var s = It;
            if (!s._ready || s._auth == Authority.CacheOnly) return;
            s._pushAt = -1f;
            s.StartCoroutine(s.Push(reason, true));
        }

        IEnumerator RunStartup(Action ready)
        {
            Analytics.Begin();
            HookHide();
            bool done = false;
            StartCoroutine(Initialize(() => done = true));
            float until = Time.realtimeSinceStartup + CloudConfig.StartupTimeout;
            while (!done && Time.realtimeSinceStartup < until) yield return null;
            if (!done) EnterCacheOnly("startup-timeout");
            _booted = true;
            ready?.Invoke();
        }

        IEnumerator Initialize(Action done)
        {
            string err = null;
            yield return Backend.EnsureToken(e => err = e);
            _ready = err == null && !string.IsNullOrEmpty(Backend.UserId);
            if (!_ready)
            {
                Debug.LogWarning("[CloudSync] login failed, keep local save: " + err);
                EnterCacheOnly("login-failed");
            }
            else yield return PullOnStartup();

            _initDone = true;
            if (_early && !_imported) Touch();
            _early = false;
            Analytics.BindUser(_ready ? Backend.UserId : "");
            done();
            if (_pending && _ready)
            {
                _pending = false;
                Schedule("pending-after-init");
            }
        }

        IEnumerator PullOnStartup()
        {
            CloudReply reply = null;
            string err = null;
            yield return Backend.Call(CloudConfig.PullPath, "{}", (s, r, e) => { reply = r; err = e; });
            if (err != null)
            {
                Debug.LogWarning("[CloudSync] startup pull failed, keep local save: " + err);
                EnterCacheOnly("startup-pull-failed");
                yield break;
            }

            CloudData d = reply.data;
            bool hasLocal = Profile.HasLocal;
            string raw = d != null && d.payload != null ? d.payload.save : null;
            long remoteAt = d != null ? d.updatedAt : 0L;
            if (d == null || !d.exists || string.IsNullOrEmpty(raw))
            {
                Confirm();
                if (!hasLocal) yield break;
                if (!_m.dirty) Touch();
                else Schedule("startup-no-remote");
                yield break;
            }

            if (!hasLocal || remoteAt > _m.updatedAt)
            {
                Import(remoteAt, raw, "startup");
                yield break;
            }

            Confirm();
            if (_m.updatedAt > remoteAt && !_m.dirty) Touch();
            else if (_m.dirty) Schedule("startup-local-newer");
        }

        void Schedule(string reason)
        {
            if (_auth == Authority.CacheOnly || !_initDone)
            {
                _pending = true;
                return;
            }
            if (!_ready || _disabled) return;
            float delay = _fail > 0
                ? Mathf.Min(CloudConfig.BaseDelay * Mathf.Pow(2f, _fail - 1), CloudConfig.MaxBackoff)
                : CloudConfig.Debounce;
            _pushAt = Time.realtimeSinceStartup + delay;
        }

        void Update()
        {
            float now = Time.realtimeSinceStartup;
            if (_pushAt > 0f && now >= _pushAt)
            {
                _pushAt = -1f;
                StartCoroutine(Push("debounce", false));
            }
            if (_disabled && _retryAt > 0f && now >= _retryAt)
            {
                _retryAt = now + CloudConfig.RetryInterval;
                if (!_syncing && _m.dirty) StartCoroutine(Push("retry-interval", true));
            }
        }

        IEnumerator Push(string reason, bool force)
        {
            if (!_ready || (!force && _disabled)) yield break;
            if (_auth == Authority.CacheOnly || _syncing)
            {
                _pending = true;
                yield break;
            }
            if (!_m.dirty) yield break;
            string raw = Profile.Raw;
            if (string.IsNullOrEmpty(raw)) yield break;

            _syncing = true;
            long sent = _m.updatedAt;
            var body = new PushBody
            {
                schemaVersion = CloudConfig.SchemaVersion,
                updatedAt = sent,
                baseRemoteUpdatedAt = _m.baseRemote,
                clientFingerprint = Fingerprint(),
                payload = new CloudPayload { save = raw }
            };
            CloudReply reply = null;
            string err = null;
            yield return Backend.Call(CloudConfig.PushPath, JsonUtility.ToJson(body), (s, r, e) => { reply = r; err = e; });

            if (err == null)
            {
                _m.baseRemote = reply.data != null && reply.data.updatedAt > 0L ? reply.data.updatedAt : sent;
                if (_m.updatedAt == sent) _m.dirty = false;
                WriteMeta();
                PlayerPrefs.Save();
                Confirm();
                _fail = 0;
                _disabled = false;
                _retryAt = -1f;
            }
            else if (reply != null && reply.code == "STALE_UPDATE" && reply.data != null && reply.data.remote != null)
            {
                CloudRemote remote = reply.data.remote;
                string meta = remote.payload != null ? remote.payload.save : null;
                _fail = 0;
                _disabled = false;
                if (string.IsNullOrEmpty(meta))
                    Debug.LogWarning("[CloudSync] STALE_UPDATE with empty remote, keep local");
                else
                {
                    Debug.LogWarning("[CloudSync] remote is newer, overwrite local");
                    Import(remote.updatedAt > 0L ? remote.updatedAt : Backend.NowMs(), meta, "stale-update");
                }
            }
            else
            {
                _fail++;
                if (_fail <= 3) Debug.LogWarning($"[CloudSync] push failed ({_fail}/{CloudConfig.MaxFail}) {reason}: {err}");
                if (_fail >= CloudConfig.MaxFail)
                {
                    _disabled = true;
                    _retryAt = Time.realtimeSinceStartup + CloudConfig.RetryInterval;
                }
                else if (_m.dirty) Schedule("retry-after-fail");
            }

            _syncing = false;
            if (_pending && !_disabled)
            {
                _pending = false;
                Schedule("pending-resume");
            }
        }

        void Import(long remoteAt, string raw, string reason)
        {
            if (!Profile.ApplyCloud(raw))
            {
                Debug.LogWarning("[CloudSync] remote save rejected, keep local");
                Confirm();
                return;
            }
            _imported = true;
            _m.updatedAt = remoteAt;
            _m.baseRemote = remoteAt;
            _m.dirty = false;
            WriteMeta();
            PlayerPrefs.Save();
            Confirm();
            Debug.Log("[CloudSync] save restored from cloud reason=" + reason);
            if (_booted && Imported != null) Imported();
        }

        void Confirm() => _auth = Authority.Confirmed;

        void EnterCacheOnly(string reason)
        {
            if (_auth == Authority.CacheOnly) return;
            _auth = Authority.CacheOnly;
            Debug.LogWarning("[CloudSync] cacheOnly, push disabled reason=" + reason);
        }

        void HookHide()
        {
            if (_hideHooked) return;
            _hideHooked = Backend.HookHide(() =>
            {
                Analytics.OnHide("hide");
                FlushNow("hide");
            });
        }

        void OnApplicationPause(bool paused)
        {
            if (paused && !_hideHooked)
            {
                Analytics.OnHide("pause");
                FlushNow("pause");
            }
        }

        void LoadMeta()
        {
            string raw = PlayerPrefs.GetString(CloudConfig.SyncMetaKey, "");
            _m = null;
            if (!string.IsNullOrEmpty(raw))
            {
                try { _m = JsonUtility.FromJson<SyncMeta>(raw); }
                catch (Exception) { _m = null; }
            }
            if (_m == null) _m = new SyncMeta();
        }

        void WriteMeta() => PlayerPrefs.SetString(CloudConfig.SyncMetaKey, JsonUtility.ToJson(_m));

        static string Fingerprint()
        {
            string s = SystemInfo.deviceModel + "|" + SystemInfo.operatingSystem;
            return s.Length > 160 ? s.Substring(0, 160) : s;
        }
    }
}
