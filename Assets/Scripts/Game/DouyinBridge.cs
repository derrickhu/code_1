#if !UNITY_EDITOR && (UNITY_WEBGL || UNITY_MINIGAME || WEIXINMINIGAME || UNITY_WEIXINMINIGAME || TUANJIE_WEIXINMINIGAME)
#define LIANGSHAN_JSLIB
#endif
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

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
        [DllImport("__Internal")] static extern void MiniGame_ArmSubscribe(string scene, string tmplCsv);
        [DllImport("__Internal")] static extern void MiniGame_DisarmSubscribe();
        [DllImport("__Internal")] static extern void MiniGame_RequestSubscribe(string scene, string tmplCsv);
        [DllImport("__Internal")] static extern void MiniGame_WxTrySilentUserInfo();
        [DllImport("__Internal")] static extern void MiniGame_WxMountUserInfoBtn(float xNorm, float yNorm, float wNorm, float hNorm);
        [DllImport("__Internal")] static extern void MiniGame_WxDestroyUserInfoBtn();
        [DllImport("__Internal")] static extern void MiniGame_WxRequestUserInfoDirect();
        [DllImport("__Internal")] static extern void MiniGame_DyTrySilentUserInfo();
        [DllImport("__Internal")] static extern void MiniGame_ArmDyUserProfile();
        [DllImport("__Internal")] static extern void MiniGame_DisarmDyUserProfile();
        [DllImport("__Internal")] static extern void MiniGame_RequestDyUserProfile();
        [DllImport("__Internal")] static extern int MiniGame_GetDeviceInfo(byte[] outBuf, int bufLen);
        [DllImport("__Internal")] static extern void MiniGame_WxLoadAvatar(string reqId, string url);
#endif

        [Serializable]
        public sealed class WxUserPayload
        {
            public string nickName;
            public string avatarUrl;
            public int gender;
        }

        static DouyinBridge _inst;
        static int _host = -1;
        static bool _simSidebarFromCard;
        static bool _simShortcutAdded;

        static Action<bool, string> _navCb;
        static Action<bool, string> _shortcutCb;
        static Action<bool, string> _subCb;
        static Action<string> _loginOk, _loginFail;
        static Action _adShown;
        static Action<bool> _adClosed;
        static Action<string> _adError;
        static bool _adBusy;

        static WxUserBtnAnchor _activeWxAnchor;
        static Action<WxUserPayload> _wxUserOk;
        static Action<string> _wxUserFail;
        static int _avatarSeq;
        static readonly System.Collections.Generic.Dictionary<string, Action<byte[]>> _avatarWaiters =
            new System.Collections.Generic.Dictionary<string, Action<byte[]>>();

        public static event Action<WxUserPayload> WxUserSynced;

        /// <summary>编辑器 GM 模拟开关：开启后主界面显示抖音专属入口并可模拟侧边栏/桌面回调。</summary>
        public static bool ForceSimulateDouyin { get; private set; }

        public static bool SidebarSupported { get; private set; } = true;
        public static bool LaunchedFromSidebar { get; private set; }
        public static bool ShortcutAdded { get; private set; }

        public static event Action StateChanged;
        public static event Action AppHidden;
        public static event Action AppShown;

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

        public static bool IsWeChat
        {
            get
            {
                if (ForceSimulateDouyin) return false;
                if (_host < 0)
                {
#if LIANGSHAN_JSLIB
                    try { _host = MiniGame_GetHost(); }
                    catch (Exception) { _host = 0; }
#else
                    _host = 0;
#endif
                }
                return _host == 2;
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

        /// <summary>
        /// 为订阅按钮挂载按下预装填手势监听：手指在按钮上抬起（tt.onTouchEnd）时同步唤起 tt.requestSubscribeMessage，
        /// 满足抖音「订阅接口必须在真实点击事件回调中同步触发」的强校验，同时兼容开发工具鼠标点击与编辑器模拟。
        /// </summary>
        public static void BindSubscribeGesture(RectTransform btn, string scene, Action<bool, string> done)
        {
            if (btn == null) return;
            GameObject target = btn.gameObject;
            var hit = btn.GetComponentInChildren<Graphic>();
            if (hit != null && hit.raycastTarget) target = hit.gameObject;
            var arm = target.GetComponent<SubscribeTouchArm>() ?? target.AddComponent<SubscribeTouchArm>();
            arm.Scene = scene ?? "all";
            arm.Callback = done;
        }

        public static void RequestSubscribe(string scene, Action<bool, string> done = null)
        {
            Init();
            string sc = string.IsNullOrEmpty(scene) ? "all" : scene;
            if (ForceSimulateDouyin && Application.isEditor)
            {
                Analytics.SubscribeMessage(sc, true, "editor_sim");
                StateChanged?.Invoke();
                done?.Invoke(true, sc + "|editor_sim");
                return;
            }
#if LIANGSHAN_JSLIB
            _subCb = done;
            try
            {
                MiniGame_RequestSubscribe(sc, CloudConfig.GetDouyinSubscribeTmplCsv(sc));
            }
            catch (Exception e)
            {
                _subCb = null;
                done?.Invoke(false, e.Message);
            }
#else
            done?.Invoke(false, "not_douyin");
#endif
        }

        static void ArmSubscribe(string scene, Action<bool, string> done)
        {
            if (!IsDouyin || Application.isEditor) return;
            Init();
            string sc = string.IsNullOrEmpty(scene) ? "all" : scene;
            _subCb = done;
#if LIANGSHAN_JSLIB
            try { MiniGame_ArmSubscribe(sc, CloudConfig.GetDouyinSubscribeTmplCsv(sc)); }
            catch (Exception) { }
#endif
        }

        static void DisarmSubscribe()
        {
#if LIANGSHAN_JSLIB
            if (!Application.isEditor)
            {
                try { MiniGame_DisarmSubscribe(); }
                catch (Exception) { }
            }
#endif
        }

        sealed class SubscribeTouchArm : MonoBehaviour, IPointerDownHandler, IPointerExitHandler, IBeginDragHandler
        {
            public string Scene = "all";
            public Action<bool, string> Callback;

            public void OnPointerDown(PointerEventData eventData) => ArmSubscribe(Scene, Callback);
            public void OnPointerExit(PointerEventData eventData) => DisarmSubscribe();
            public void OnBeginDrag(PointerEventData eventData) => DisarmSubscribe();
        }

        // ---------------- 微信 / 抖音小游戏真实昵称、头像与设备信息桥接 ----------------

        public static bool TryGetDeviceInfo(out string brand, out string model, out string sys, out string sdkVer)
        {
            brand = model = sys = sdkVer = "";
            if (Application.isEditor) return false;
#if LIANGSHAN_JSLIB
            try
            {
                var buf = new byte[256];
                if (MiniGame_GetDeviceInfo(buf, buf.Length) != 1) return false;
                int len = Array.IndexOf(buf, (byte)0);
                if (len <= 0) return false;
                string raw = System.Text.Encoding.UTF8.GetString(buf, 0, len);
                var p = raw.Split('|');
                if (p.Length >= 1) brand = p[0];
                if (p.Length >= 2) model = p[1];
                if (p.Length >= 3) sys = p[2];
                if (p.Length >= 4) sdkVer = p[3];
                return true;
            }
            catch (Exception) { return false; }
#else
            return false;
#endif
        }

        public static void WxTrySilentUserInfo()
        {
            if (!IsWeChat || Application.isEditor) return;
            Init();
#if LIANGSHAN_JSLIB
            try { MiniGame_WxTrySilentUserInfo(); }
            catch (Exception) { }
#endif
        }

        public static void DyTrySilentUserInfo()
        {
            if (!IsDouyin || Application.isEditor) return;
            Init();
#if LIANGSHAN_JSLIB
            try { MiniGame_DyTrySilentUserInfo(); }
            catch (Exception) { }
#endif
        }

        public static void BindDouyinUserProfileGesture(RectTransform btn, Action<WxUserPayload> onOk, Action<string> onFail = null)
        {
            if (btn == null || !IsDouyin) return;
            GameObject target = btn.gameObject;
            var hit = btn.GetComponentInChildren<Graphic>();
            if (hit != null && hit.raycastTarget) target = hit.gameObject;
            var arm = target.GetComponent<DyProfileTouchArm>() ?? target.AddComponent<DyProfileTouchArm>();
            arm.OnOk = onOk;
            arm.OnFail = onFail;
        }

        public static void RequestDouyinUserProfile(Action<WxUserPayload> onOk, Action<string> onFail = null)
        {
            Init();
            if (Application.isEditor)
            {
                var sim = new WxUserPayload { nickName = "抖音老铁" + UnityEngine.Random.Range(10, 99), avatarUrl = "", gender = 1 };
                onOk?.Invoke(sim);
                WxUserSynced?.Invoke(sim);
                return;
            }
            if (!IsDouyin)
            {
                onFail?.Invoke("not_dy");
                return;
            }
            _wxUserOk = onOk;
            _wxUserFail = onFail;
#if LIANGSHAN_JSLIB
            try { MiniGame_RequestDyUserProfile(); }
            catch (Exception e)
            {
                _wxUserOk = null;
                _wxUserFail = null;
                onFail?.Invoke(e.Message);
            }
#endif
        }

        static void ArmDyProfile(Action<WxUserPayload> onOk, Action<string> onFail)
        {
            if (!IsDouyin || Application.isEditor) return;
            Init();
            _wxUserOk = onOk;
            _wxUserFail = onFail;
#if LIANGSHAN_JSLIB
            try { MiniGame_ArmDyUserProfile(); }
            catch (Exception) { }
#endif
        }

        static void DisarmDyProfile()
        {
#if LIANGSHAN_JSLIB
            if (!Application.isEditor)
            {
                try { MiniGame_DisarmDyUserProfile(); }
                catch (Exception) { }
            }
#endif
        }

        sealed class DyProfileTouchArm : MonoBehaviour, IPointerDownHandler, IPointerExitHandler, IBeginDragHandler
        {
            public Action<WxUserPayload> OnOk;
            public Action<string> OnFail;

            public void OnPointerDown(PointerEventData eventData) => ArmDyProfile(OnOk, OnFail);
            public void OnPointerExit(PointerEventData eventData) => DisarmDyProfile();
            public void OnBeginDrag(PointerEventData eventData) => DisarmDyProfile();
        }

        public static void WxRequestUserInfoDirect(Action<WxUserPayload> onOk, Action<string> onFail = null)
        {
            Init();
            if (Application.isEditor)
            {
                var sim = new WxUserPayload { nickName = "微信村民" + UnityEngine.Random.Range(10, 99), avatarUrl = "", gender = 1 };
                onOk?.Invoke(sim);
                WxUserSynced?.Invoke(sim);
                return;
            }
            if (!IsWeChat)
            {
                onFail?.Invoke("not_wx");
                return;
            }
            _wxUserOk = onOk;
            _wxUserFail = onFail;
#if LIANGSHAN_JSLIB
            try { MiniGame_WxRequestUserInfoDirect(); }
            catch (Exception e)
            {
                _wxUserOk = null;
                _wxUserFail = null;
                onFail?.Invoke(e.Message);
            }
#endif
        }

        public static void WxLoadAvatarBytes(string url, Action<byte[]> done)
        {
            if (string.IsNullOrEmpty(url) || (!IsWeChat && !IsDouyin) || Application.isEditor)
            {
                done?.Invoke(null);
                return;
            }
            Init();
            string reqId = "av_" + (++_avatarSeq);
            _avatarWaiters[reqId] = done;
#if LIANGSHAN_JSLIB
            try { MiniGame_WxLoadAvatar(reqId, url); }
            catch (Exception)
            {
                _avatarWaiters.Remove(reqId);
                done?.Invoke(null);
            }
#else
            _avatarWaiters.Remove(reqId);
            done?.Invoke(null);
#endif
        }

        public static void BindWeChatUserInfoButton(RectTransform btn, Transform modalRoot, Transform layer,
            Action<WxUserPayload> onOk, Action<string> onFail = null)
        {
            if (btn == null || !IsWeChat || Application.isEditor) return;
            Init();
            var anchor = btn.GetComponent<WxUserBtnAnchor>() ?? btn.gameObject.AddComponent<WxUserBtnAnchor>();
            anchor.Target = btn;
            anchor.ModalRoot = modalRoot;
            anchor.Layer = layer;
            anchor.OnOk = onOk;
            anchor.OnFail = onFail;
        }

        public static void DestroyWeChatUserInfoButton()
        {
            _activeWxAnchor = null;
#if LIANGSHAN_JSLIB
            if (!Application.isEditor)
            {
                try { MiniGame_WxDestroyUserInfoBtn(); }
                catch (Exception) { }
            }
#endif
        }

        sealed class WxUserBtnAnchor : MonoBehaviour
        {
            public RectTransform Target;
            public Transform ModalRoot;
            public Transform Layer;
            public Action<WxUserPayload> OnOk;
            public Action<string> OnFail;

            readonly Vector3[] _corners = new Vector3[4];
            Vector4 _lastRect = new Vector4(-1, -1, -1, -1);
            bool _mounted;
            int _warmupFrames = 2;

            bool IsTopModal()
            {
                if (ModalRoot == null || Layer == null) return true;
                for (int i = Layer.childCount - 1; i >= 0; i--)
                {
                    var c = Layer.GetChild(i);
                    if (!c.gameObject.activeInHierarchy) continue;
                    if (c == ModalRoot) return true;
                    if (c.name.StartsWith("modal_", StringComparison.Ordinal)) return false;
                }
                return true;
            }

            void LateUpdate()
            {
                if (!IsWeChat || Application.isEditor || Target == null) return;
                if (_warmupFrames > 0) { _warmupFrames--; return; }

                if (!IsTopModal())
                {
                    UnmountIfOwner();
                    return;
                }

                if (Screen.width < 10 || Screen.height < 10) return;
                Target.GetWorldCorners(_corners);
                float xMin = Mathf.Clamp01(_corners[0].x / Screen.width);
                float xMax = Mathf.Clamp01(_corners[2].x / Screen.width);
                float yTop = Mathf.Clamp01(1f - _corners[2].y / Screen.height);
                float yBot = Mathf.Clamp01(1f - _corners[0].y / Screen.height);
                float w = Mathf.Max(0f, xMax - xMin);
                float h = Mathf.Max(0f, yBot - yTop);
                if (w < 0.01f || h < 0.01f) return;

                var cur = new Vector4(xMin, yTop, w, h);
                if (_mounted && _activeWxAnchor == this && Vector4.Distance(cur, _lastRect) < 0.004f) return;

                _lastRect = cur;
                _mounted = true;
                _activeWxAnchor = this;
                _wxUserOk = OnOk;
                _wxUserFail = OnFail;
#if LIANGSHAN_JSLIB
                try { MiniGame_WxMountUserInfoBtn(xMin, yTop, w, h); }
                catch (Exception) { }
#endif
            }

            void UnmountIfOwner()
            {
                if (!_mounted) return;
                _mounted = false;
                _lastRect = new Vector4(-1, -1, -1, -1);
                if (_activeWxAnchor == this)
                {
                    _activeWxAnchor = null;
#if LIANGSHAN_JSLIB
                    if (!Application.isEditor)
                    {
                        try { MiniGame_WxDestroyUserInfoBtn(); }
                        catch (Exception) { }
                    }
#endif
                }
            }

            void OnDisable() => UnmountIfOwner();
            void OnDestroy() => UnmountIfOwner();
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
                    AppShown?.Invoke();
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
                    AppShown?.Invoke();
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
                case "subscribe_res":
                {
                    bool ok = m.ok == 1;
                    string payload = m.data ?? "";
                    string sc = "all";
                    int sep = payload.IndexOf('|');
                    if (sep > 0) sc = payload.Substring(0, sep);
                    Analytics.SubscribeMessage(sc, ok, payload);
                    StateChanged?.Invoke();
                    var cb = _subCb;
                    _subCb = null;
                    cb?.Invoke(ok, payload);
                    break;
                }
                case "wx_userinfo":
                {
                    var okCb = _wxUserOk;
                    var failCb = _wxUserFail;
                    if (m.ok == 1 && !string.IsNullOrEmpty(m.data))
                    {
                        WxUserPayload u = null;
                        try { u = JsonUtility.FromJson<WxUserPayload>(m.data); }
                        catch (Exception) { u = null; }
                        if (u != null && (!string.IsNullOrEmpty(u.nickName) || !string.IsNullOrEmpty(u.avatarUrl)))
                        {
                            _wxUserOk = null;
                            _wxUserFail = null;
                            okCb?.Invoke(u);
                            WxUserSynced?.Invoke(u);
                            break;
                        }
                    }
                    _wxUserOk = null;
                    _wxUserFail = null;
                    failCb?.Invoke(m.data ?? "cancel");
                    break;
                }
                case "wx_avatar":
                {
                    string raw = m.data ?? "";
                    int sep = raw.IndexOf('|');
                    if (sep <= 0) break;
                    string reqId = raw.Substring(0, sep);
                    string body = raw.Substring(sep + 1);
                    if (!_avatarWaiters.TryGetValue(reqId, out var cb)) break;
                    _avatarWaiters.Remove(reqId);
                    if (m.ok == 1 && !string.IsNullOrEmpty(body))
                    {
                        try
                        {
                            byte[] bytes = Convert.FromBase64String(body);
                            cb?.Invoke(bytes);
                            break;
                        }
                        catch (Exception) { }
                    }
                    cb?.Invoke(null);
                    break;
                }
            }
        }
    }
}
