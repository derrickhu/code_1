#if (UNITY_MINIGAME || WEIXINMINIGAME || UNITY_WEIXINMINIGAME || TUANJIE_WEIXINMINIGAME || MINIGAME_SUBPLATFORM_WEIXIN) && !UNITY_EDITOR
#define LIANGSHAN_WX_AD
#endif
using System;
using Liangshan.Sim;
using UnityEngine;
#if LIANGSHAN_WX_AD
using WeChatWASM;
#endif

namespace Liangshan
{
    /// <summary>玩家存档：整份 SaveData 以 JSON 存在 PlayerPrefs，读档时补齐数组、跨天重置、回体力。</summary>
    public static class Profile
    {
        const string Key = "save";
        public static SaveData S { get; private set; }
        public static event Action Changed;

        public static long Now => DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        /// <summary>本地日期序号：每天零点换一天。</summary>
        public static int Today => (int)(DateTime.Now.Date - new DateTime(2026, 1, 1)).TotalDays;

        /// <summary>自检截图时置上：只在本机改档，不上云。</summary>
        public static bool Volatile;

        public static bool HasLocal => PlayerPrefs.HasKey(Key);
        public static string Raw => PlayerPrefs.GetString(Key, "");

        public static void Load()
        {
            var json = PlayerPrefs.GetString(Key, "");
            SaveData s = null;
            if (!string.IsNullOrEmpty(json))
            {
                try { s = JsonUtility.FromJson<SaveData>(json); }
                catch (Exception e) { Debug.LogWarning("[存档] 读档失败，重开：" + e.Message); }
            }
            S = s ?? Meta.NewSave(Now);
            Meta.Normalize(S);
            Tick();
            Write();
        }

        /// <summary>用云端原文覆盖本地，不算本地改动、不回推。解析失败时保持当前档。</summary>
        public static bool ApplyCloud(string json)
        {
            if (string.IsNullOrEmpty(json)) return false;
            SaveData s;
            try { s = JsonUtility.FromJson<SaveData>(json); }
            catch (Exception) { return false; }
            if (s == null) return false;
            S = s;
            Meta.Normalize(S);
            Tick();
            Write();
            return true;
        }

        /// <summary>跨天、回体力。界面每秒调一次。</summary>
        public static void Tick()
        {
            if (S == null) return;
            Meta.RollDay(S, Today);
            Meta.RegenStamina(S, Now);
        }

        public static void Save()
        {
            Write();
            CloudSync.Touch();
        }

        static void Write()
        {
            PlayerPrefs.SetString(Key, JsonUtility.ToJson(S));
            PlayerPrefs.Save();
            Changed?.Invoke();
        }

        public static void Use(SaveData s)
        {
            S = s;
            Meta.Normalize(S);
            Save();
        }

        public static void Reset()
        {
            PlayerPrefs.DeleteKey(Key);
            S = Meta.NewSave(Now);
            Meta.Normalize(S);
            Tick();
            Save();
        }
    }

    /// <summary>纯广告变现：真机优先走微信激励视频 WXRewardedVideoAd；未配置广告位或桌面/编辑器环境自动回退演示倒计时。</summary>
    public static class Ads
    {
        /// <summary>自检时缩短播放时间。</summary>
        public static bool Fast;

#if LIANGSHAN_WX_AD
        static readonly System.Collections.Generic.Dictionary<string, WXRewardedVideoAd> _wxAds =
            new System.Collections.Generic.Dictionary<string, WXRewardedVideoAd>(StringComparer.Ordinal);
        static Action<bool> _wxClosed;
        static bool _wxBusy;
        static string _wxLastErrCode = "";
        static string _wxLastErrMsg = "";
#endif

        static void SplitAdErr(string raw, out string code, out string msg)
        {
            code = "";
            msg = string.IsNullOrWhiteSpace(raw) ? "ad_error" : raw.Trim();
            int sp = msg.IndexOf(' ');
            if (sp > 0)
            {
                string head = msg.Substring(0, sp);
                bool digits = true;
                for (int i = 0; i < head.Length; i++)
                {
                    char c = head[i];
                    if (!(c >= '0' && c <= '9') && !(i == 0 && c == '-')) { digits = false; break; }
                }
                if (digits)
                {
                    code = head;
                    msg = msg.Substring(sp + 1).Trim();
                }
            }
        }

        public static void Show(string scene, Action done)
        {
            if (DouyinBridge.IsDouyin && !Application.isEditor)
            {
                string dyUnit = CloudConfig.GetDouyinAdUnitId(scene);
                Analytics.AdRequest(scene, dyUnit);
                if (!string.IsNullOrEmpty(dyUnit))
                {
                    DouyinBridge.ShowRewardedAd(
                        dyUnit,
                        () => Analytics.AdShow(scene, dyUnit),
                        ended =>
                        {
                            Analytics.AdClose(scene, ended, dyUnit);
                            if (!ended)
                            {
                                Ui.Toast("完整观看视频才可获得奖励", 200);
                                return;
                            }
                            if (Profile.S != null)
                            {
                                Meta.Progress(Profile.S, Act.Ad);
                                Profile.Save();
                            }
                            done?.Invoke();
                        },
                        err =>
                        {
                            if (DouyinBridge.IsDevtools)
                            {
                                Debug.Log("[Ads] 抖音开发工具模拟激励视频（" + err + "）");
                                ShowFallback(scene, done);
                                return;
                            }
                            SplitAdErr(err, out string ec, out string em);
                            Analytics.AdError(scene, ec, em, dyUnit);
                            Ui.Toast("暂无可播放的广告，请稍后再试", 200);
                        });
                    return;
                }
                ShowFallback(scene, done);
                return;
            }
#if LIANGSHAN_WX_AD
            string unit = CloudConfig.GetWeChatAdUnitId(scene);
            Analytics.AdRequest(scene, unit);
            if (!string.IsNullOrEmpty(unit))
            {
                if (_wxBusy) return;
                try
                {
                    if (!_wxAds.TryGetValue(unit, out var ad) || ad == null)
                    {
                        ad = WX.CreateRewardedVideoAd(new WXCreateRewardedVideoAdParam { adUnitId = unit, multiton = true });
                        var cachedAd = ad;
                        ad.OnClose(r =>
                        {
                            if (!_wxBusy) return;
                            _wxBusy = false;
                            bool ended = r == null || r.isEnded;
                            var cb = _wxClosed;
                            _wxClosed = null;
                            cb?.Invoke(ended);
                            try { cachedAd?.Load(_ => { }, _ => { }); } catch (Exception) { }
                        });
                        ad.OnError(e =>
                        {
                            _wxLastErrCode = e != null ? e.errCode.ToString() : "";
                            _wxLastErrMsg = e != null ? (e.errMsg ?? "") : "wx_ad_error";
                            Debug.LogWarning("[Ads] wx error (" + unit + ") " + _wxLastErrCode + " " + _wxLastErrMsg);
                        });
                        _wxAds[unit] = ad;
                    }
                    _wxBusy = true;
                    _wxLastErrCode = "";
                    _wxLastErrMsg = "";
                    _wxClosed = ended =>
                    {
                        Analytics.AdClose(scene, ended, unit);
                        if (!ended)
                        {
                            Ui.Toast("完整观看视频才可获得奖励", 200);
                            return;
                        }
                        if (Profile.S != null)
                        {
                            Meta.Progress(Profile.S, Act.Ad);
                            Profile.Save();
                        }
                        done?.Invoke();
                    };
                    ad.Show(_ => Analytics.AdShow(scene, unit), _ =>
                    {
                        ad.Load(
                            __ => ad.Show(___ => Analytics.AdShow(scene, unit), e2 => FailWx(scene, unit, e2 != null ? e2.errCode.ToString() : "", e2 != null ? e2.errMsg : "show_fail")),
                            e1 => FailWx(scene, unit, e1 != null ? e1.errCode.ToString() : "", e1 != null ? e1.errMsg : "load_fail"));
                    });
                    return;
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Ads] wx create failed " + e.Message);
                    _wxBusy = false;
                    Analytics.AdError(scene, "-100", e.Message, unit);
                }
            }
            ShowFallback(scene, done);
            return;
#else
            Analytics.AdRequest(scene);
            ShowFallback(scene, done);
#endif
        }

#if LIANGSHAN_WX_AD
        static void FailWx(string scene, string unit, string code, string msg)
        {
            _wxBusy = false;
            _wxClosed = null;
            string ec = !string.IsNullOrEmpty(code) ? code : _wxLastErrCode;
            string em = !string.IsNullOrEmpty(msg) ? msg : (!string.IsNullOrEmpty(_wxLastErrMsg) ? _wxLastErrMsg : "wx_ad_fail");
            Analytics.AdError(scene, ec, em, unit);
            Ui.Toast("暂无可播放的广告，请稍后再试", 200);
        }
#endif

        static void ShowFallback(string scene, Action done)
        {
            Analytics.AdShow(scene);
            var layer = Ui.Rect(Ui.Root, "ad");
            layer.anchorMin = Vector2.zero;
            layer.anchorMax = Vector2.one;
            layer.offsetMin = layer.offsetMax = Vector2.zero;
            layer.SetAsLastSibling();
            Ui.Fill(layer, new Color(0, 0, 0, 0.92f), true);
            Ui.Icon(layer, "ic_ad", 160, new Vector2(0, 160));
            var t = Ui.Label(layer, "", 44, Color.white, new Vector2(0, -40), new Vector2(900, 200), TextAnchor.MiddleCenter, Fonts.Heavy);
            float dur = Fast ? 0.5f : 2f;
            Tween.Run(layer, dur, k => t.text = $"（演示）激励视频播放中…\n{Mathf.CeilToInt(dur * (1 - k))}", () =>
            {
                Analytics.AdClose(scene, true);
                UnityEngine.Object.Destroy(layer.gameObject);
                if (Profile.S != null)
                {
                    Meta.Progress(Profile.S, Act.Ad);
                    Profile.Save();
                }
                done?.Invoke();
            });
        }
    }
}
