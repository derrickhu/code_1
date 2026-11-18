#if !UNITY_EDITOR && (UNITY_WEBGL || UNITY_MINIGAME || WEIXINMINIGAME || UNITY_WEIXINMINIGAME || TUANJIE_WEIXINMINIGAME)
#define LIANGSHAN_JSLIB
#endif
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using UnityEngine;

namespace Liangshan
{
    /// <summary>
    /// 抖音小游戏宿主桥接（对接 Assets/Plugins/MiniGameHost.jslib）：
    /// 负责 tt 宿主探测、侧边栏复访识别与跳转、桌面快捷方式、tt.login、激励视频与插屏广告、胶囊安全区及震动。
    /// 编辑器下可通过 ForceSimulateDouyin 一键开启模拟，完整演练侧边栏与加桌面领奖闭环。
    /// </summary>
    public sealed class DouyinBridge : MonoBehaviour
    {
        [Serializable]
        sealed class JsMsg
        {
            public string type;
            public int ok;
            public string data;
        }

#if LIANGSHAN_JSLIB
        [DllImport("__Internal")] static extern void MiniGame_Init();
        [DllImport("__Internal")] static extern int MiniGame_GetHost();
        [DllImport("__Internal")] static extern int MiniGame_IsDevtools();
        [DllImport("__Internal")] static extern int MiniGame_IsLaunchedFromSidebar();
        [DllImport("__Internal")] static extern int MiniGame_GetSafeArea(byte[] outBuf, int bufLen);
        [DllImport("__Internal")] static extern void MiniGame_CheckSidebar();
        [DllImport("__Internal")] static extern void MiniGame_NavigateSidebar();
        [DllImport("__Internal")] static extern void MiniGame_CheckShortcut();
        [DllImport("__Internal")] static extern void MiniGame_AddShortcut();
        [DllImport("__Internal")] static extern void MiniGame_Login();
        [DllImport("__Internal")] static extern void MiniGame_ShowRewardedAd(string unitId);
        [DllImport("__Internal")] static extern void MiniGame_ShowInterstitialAd(string unitId);
        [DllImport("__Internal")] static extern void MiniGame_VibrateShort(string type);
#endif

        static DouyinBridge _inst;
        static int _host = -1;
        static bool _simSidebarFromCard;
        static bool _simShortcutAdded;

        static Action<bool, string> _navCb;
        static Action<bool, string> _shortcutCb;
        static Action<string> _loginOk, _loginFail;
        static Action _adShown;
        static Action<bool> _adClosed;
        static Action<string> _adError;
        static bool _adBusy;

        /// <summary>编辑器 GM 模拟开关：开启后主界面显示抖音专属入口并可模拟侧边栏/桌面回调。</summary>
        public static bool ForceSimulateDouyin { get; private set; }

        public static bool SidebarSupported { get; private set; } = true;
        public static bool LaunchedFromSidebar { get; private set; }
        public static bool ShortcutAdded { get; private set; }

        public static event Action StateChanged;
        public static event Action AppHidden;

        public static bool IsDouyin
        {
            get
            {
                if (ForceSimulateDouyin) return true;
                if (_host < 0)
                {
#if LIANGSHAN_JSLIB
                    try { _host = MiniGame_GetHost(); }
                    catch (Exception) { _host = 0; }
#else
                    _host = 0;
#endif
                }
                return _host == 1;
            }
        }

        public static bool IsDevtools
        {
            get
            {
                if (ForceSimulateDouyin && Application.isEditor) return true;
                if (!IsDouyin) return false;
#if LIANGSHAN_JSLIB
                try { return MiniGame_IsDevtools() == 1; }
                catch (Exception) { return false; }
#else
                return false;
#endif
            }
        }

        public static void SetSimulate(bool on)
        {
            ForceSimulateDouyin = on;
            if (on)
            {
                SidebarSupported = true;
                LaunchedFromSidebar = _simSidebarFromCard;
                ShortcutAdded = _simShortcutAdded;
            }
            else
            {
                _simSidebarFromCard = false;
                _simShortcutAdded = false;
                LaunchedFromSidebar = false;
                ShortcutAdded = false;
            }
            StateChanged?.Invoke();
        }

        public static void Init()
        {
            if (_inst != null) return;
            var go = new GameObject("DouyinBridge");
            DontDestroyOnLoad(go);
            _inst = go.AddComponent<DouyinBridge>();
#if LIANGSHAN_JSLIB
            try
            {
                MiniGame_Init();
                _host = MiniGame_GetHost();
                if (_host == 1)
                {
                    LaunchedFromSidebar = MiniGame_IsLaunchedFromSidebar() == 1;
                    SidebarSupported = true;
                    MiniGame_CheckSidebar();
                    MiniGame_CheckShortcut();
                }
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Douyin] Init failed: " + e.Message);
            }
#endif
        }

        public static bool TryGetSafeArea(out float topPx, out float bottomPx)
        {
            topPx = bottomPx = 0f;
            if (!IsDouyin || Application.isEditor) return false;
#if LIANGSHAN_JSLIB
            try
            {
                var buf = new byte[128];
                if (MiniGame_GetSafeArea(buf, buf.Length) != 1) return false;
                int len = Array.IndexOf(buf, (byte)0);
                if (len <= 0) return false;
                string s = System.Text.Encoding.UTF8.GetString(buf, 0, len);
                var p = s.Split(',');
                if (p.Length < 5) return false;
                float sw = ParseF(p[0]), sh = ParseF(p[1]);
                float safeTop = ParseF(p[2]), safeBottom = ParseF(p[3]), menuBottom = ParseF(p[4]);
                if (sw < 1f || sh < 1f) return false;
                float sy = Screen.height / sh;
                topPx = safeTop * sy;
                if (menuBottom > 0f) topPx = Mathf.Max(topPx, (menuBottom + 6f) * sy);
                bottomPx = Mathf.Max(0f, safeBottom * sy);
                return topPx > 0.5f || bottomPx > 0.5f;
            }
            catch (Exception)
            {
                return false;
            }
#else
            return false;
#endif
        }

        static float ParseF(string v) =>
            float.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out float r) ? r : 0f;

        public static void NavigateToSidebar(Action<bool, string> done = null)
        {
            Init();
            if (ForceSimulateDouyin && Application.isEditor)
            {
                _simSidebarFromCard = true;
                LaunchedFromSidebar = true;
                StateChanged?.Invoke();
                done?.Invoke(true, "sim");
                return;
            }
#if LIANGSHAN_JSLIB
            _navCb = done;
            try { MiniGame_NavigateSidebar(); }
            catch (Exception e) { _navCb = null; done?.Invoke(false, e.Message); }
#else
            done?.Invoke(false, "not_douyin");
#endif
        }

        public static void AddShortcut(Action<bool, string> done = null)
        {
            Init();
            if (ForceSimulateDouyin && Application.isEditor)
            {
                _simShortcutAdded = true;
                ShortcutAdded = true;
                StateChanged?.Invoke();
                done?.Invoke(true, "sim");
                return;
            }
#if LIANGSHAN_JSLIB
            _shortcutCb = done;
            try { MiniGame_AddShortcut(); }
            catch (Exception e) { _shortcutCb = null; done?.Invoke(false, e.Message); }
#else
            done?.Invoke(false, "not_douyin");
#endif
        }

        public static void Login(Action<string> ok, Action<string> fail)
        {
            Init();
#if LIANGSHAN_JSLIB
            _loginOk = ok;
            _loginFail = fail;
            try { MiniGame_Login(); }
            catch (Exception e)
            {
                _loginOk = null;
                _loginFail = null;
                fail?.Invoke(e.Message);
            }
#else
            fail?.Invoke("not_douyin");
#endif
        }

        public static void ShowRewardedAd(string unitId, Action onShown, Action<bool> onClosed, Action<string> onError)
        {
            Init();
            if (_adBusy) return;
#if LIANGSHAN_JSLIB
            _adBusy = true;
            _adShown = onShown;
            _adClosed = onClosed;
            _adError = onError;
            try { MiniGame_ShowRewardedAd(unitId ?? ""); }
            catch (Exception e)
            {
                _adBusy = false;
                _adShown = null;
                _adClosed = null;
                _adError = null;
                onError?.Invoke(e.Message);
            }
#else
            onError?.Invoke("not_douyin");
#endif
        }

        public static void ShowInterstitialAd(string unitId)
        {
            if (!IsDouyin || Application.isEditor || string.IsNullOrEmpty(unitId)) return;
            Init();
#if LIANGSHAN_JSLIB
            try { MiniGame_ShowInterstitialAd(unitId); }
            catch (Exception) { }
#endif
        }

        public static void VibrateShort(string type)
        {
            if (!IsDouyin || Application.isEditor) return;
#if LIANGSHAN_JSLIB
            try { MiniGame_VibrateShort(type ?? "medium"); }
            catch (Exception) { }
#endif
        }

        /// <summary>由 MiniGameHost.jslib 通过 SendMessage('DouyinBridge', 'OnJsEvent', json) 回调。</summary>
        public void OnJsEvent(string json)
        {
            if (string.IsNullOrEmpty(json)) return;
            JsMsg m;
            try { m = JsonUtility.FromJson<JsMsg>(json); }
            catch (Exception) { return; }
            if (m == null || string.IsNullOrEmpty(m.type)) return;

            switch (m.type)
            {
                case "sidebar_show":
                    LaunchedFromSidebar = true;
                    StateChanged?.Invoke();
                    break;
                case "app_show":
#if LIANGSHAN_JSLIB
                    try
                    {
                        if (MiniGame_IsLaunchedFromSidebar() == 1) LaunchedFromSidebar = true;
                        MiniGame_CheckShortcut();
                    }
                    catch (Exception) { }
#endif
                    StateChanged?.Invoke();
                    break;
                case "app_hide":
                    AppHidden?.Invoke();
                    break;
                case "sidebar_sup":
                    SidebarSupported = m.ok == 1 || IsDevtools;
                    StateChanged?.Invoke();
                    break;
                case "sidebar_nav":
                {
                    var cb = _navCb;
                    _navCb = null;
                    cb?.Invoke(m.ok == 1, m.data);
                    break;
                }
                case "shortcut_state":
                    if (m.ok == 1) ShortcutAdded = true;
                    StateChanged?.Invoke();
                    break;
                case "shortcut_add":
                {
                    if (m.ok == 1) ShortcutAdded = true;
                    StateChanged?.Invoke();
                    var cb = _shortcutCb;
                    _shortcutCb = null;
                    cb?.Invoke(m.ok == 1, m.data);
                    break;
                }
                case "login":
                {
                    var ok = _loginOk;
                    var fail = _loginFail;
                    _loginOk = null;
                    _loginFail = null;
                    if (m.ok == 1 && !string.IsNullOrEmpty(m.data)) ok?.Invoke(m.data);
                    else fail?.Invoke(string.IsNullOrEmpty(m.data) ? "tt.login fail" : m.data);
                    break;
                }
                case "ad_shown":
                    _adShown?.Invoke();
                    break;
                case "ad_closed":
                {
                    _adBusy = false;
                    var cb = _adClosed;
                    _adShown = null;
                    _adClosed = null;
                    _adError = null;
                    cb?.Invoke(m.ok == 1);
                    break;
                }
                case "ad_error":
                {
                    _adBusy = false;
                    var cb = _adError;
                    _adShown = null;
                    _adClosed = null;
                    _adError = null;
                    cb?.Invoke(m.data ?? "ad_error");
                    break;
                }
            }
        }
    }
}
