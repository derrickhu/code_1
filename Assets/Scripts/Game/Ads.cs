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
    /// <summary>
    /// 微信与抖音双端广告位清单：
    /// 18 个激励视频细分场景统一走 CloudConfig（微信 AppId: wx4afec790790030e8 / 抖音 AppId: tt5b402dfdc53db6ff07）。
    /// </summary>
    public static class AdUnits
    {
        public static readonly string[] AllRewardedScenes =
        {
            "revive",
            "double", "lose_double",
            "reroll", "take_all",
            "reel_jackpot",
            "start_2star", "swap_unit", "speed2",
            "recruit", "totem_pull",
            "gear_box",
            "stamina", "shop_stamina", "shop_ingot", "welfare_double",
            "idle", "daily_extra", "escort_extra",
        };

        /// <summary>按细分场景解析微信激励视频 adUnitId。</summary>
        public static string RewardedOf(string scene) => CloudConfig.GetWeChatAdUnitId(scene) ?? "";

        /// <summary>场景所属的业务组键名（经分归类用）。</summary>
        public static string GroupKeyOf(string scene)
        {
            switch (scene)
            {
                case "revive": return "reward_revive";
                case "double":
                case "lose_double": return "reward_settle_double";
                case "reroll":
                case "take_all": return "reward_battle_perk";
                case "reel_jackpot": return "reward_reel_jackpot";
                case "start_2star":
                case "swap_unit":
                case "speed2": return "reward_battle_assist";
                case "recruit":
                case "totem_pull": return "reward_gacha_pull";
                case "gear_box": return "reward_gear_box";
                case "stamina":
                case "shop_stamina":
                case "shop_ingot":
                case "welfare_double": return "reward_supply";
                case "idle":
                case "daily_extra":
                case "escort_extra": return "reward_patrol_dungeon";
                default: return "reward_default";
            }
        }
    }

    /// <summary>
    /// 统一双端广告服务（微信 + 抖音）：
    /// 1. 激励视频：微信单实例现建现拆 + multiton，抖音走 DouyinBridge；播放期自动静音恢复。
    /// 2. 插屏广告：新手前 3 关免弹、启动 180s 免弹、间隔 180s、看完激励视频 90s 免弹、每日上限 6 次。
    /// 3. 原生模板：预留主界面悬浮单格，仅在配置 WeChatCustomFloatAdUnitId 时展示。
    /// </summary>
    public static class Ads
    {
        /// <summary>自检截图模式缩短演示时长并关闭插屏。</summary>
        public static bool Fast;

        public const int InterstitialMinCleared = 3;
        public const float InterstitialBootGraceSec = 180f;
        public const float InterstitialIntervalSec = 180f;
        public const float InterstitialAfterRewardSec = 90f;

        static float _bootAt = -1f;
        static float _lastRewardedAt = -999f;
        static float _lastInterstitialAt = -999f;

        static float BootAt
        {
            get
            {
                if (_bootAt < 0f) _bootAt = Time.realtimeSinceStartup;
                return _bootAt;
            }
        }

#if LIANGSHAN_WX_AD
        static WXRewardedVideoAd _wxAd;
        static Action<bool> _wxClosed;
        static bool _wxBusy;
        static bool _wxDidShow;
        static int _wxGen;
        static bool _onShowHooked;

        static WXInterstitialAd _interstitial;
        static bool _interstitialBusy;

        static WXCustomAd _customAd;
        static bool _customWantShow;
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

        /// <summary>播放激励视频：完整看完才触发 done 并发放奖励、累计每日看广告任务。</summary>
        public static void Show(string scene, Action done, Action onFail = null)
        {
            _ = BootAt;
            if (DouyinBridge.IsDouyin && !Application.isEditor)
            {
                string dyUnit = CloudConfig.GetDouyinAdUnitId(scene);
                string dyTrack = !string.IsNullOrEmpty(dyUnit) ? dyUnit : AdUnits.GroupKeyOf(scene);
                Analytics.AdRequest(scene, dyTrack, "reward");
                if (!string.IsNullOrEmpty(dyUnit))
                {
                    DouyinBridge.ShowRewardedAd(
                        dyUnit,
                        () =>
                        {
                            _lastRewardedAt = Time.realtimeSinceStartup;
                            Sfx.SetAdMute(true);
                            Analytics.AdShow(scene, dyTrack, "reward");
                        },
                        ended =>
                        {
                            Sfx.SetAdMute(false);
                            Analytics.AdClose(scene, ended, dyTrack, "reward");
                            if (!ended)
                            {
                                Ui.Toast("完整观看视频才可获得奖励", 200);
                                onFail?.Invoke();
                                return;
                            }
                            _lastRewardedAt = Time.realtimeSinceStartup;
                            GrantAdTask();
                            done?.Invoke();
                        },
                        err =>
                        {
                            Sfx.SetAdMute(false);
                            if (DouyinBridge.IsDevtools)
                            {
                                Debug.Log("[Ads] 抖音开发工具模拟激励视频（" + err + "）");
                                ShowFallback(scene, dyTrack, done);
                                return;
                            }
                            SplitAdErr(err, out string ec, out string em);
                            Analytics.AdError(scene, ec, em, dyTrack, "reward");
                            Analytics.AdClose(scene, false, dyTrack, "reward");
                            Ui.Toast("暂无可播放的广告，请稍后再试", 200);
                            onFail?.Invoke();
                        });
                    return;
                }
                ShowFallback(scene, dyTrack, done);
                return;
            }

            string unit = AdUnits.RewardedOf(scene);
            string trackUnit = !string.IsNullOrEmpty(unit) ? unit : AdUnits.GroupKeyOf(scene);
            Analytics.AdRequest(scene, trackUnit, "reward");

#if LIANGSHAN_WX_AD
            // 微信开发者工具播不出激励视频，走演示倒计时避免按钮停在加载中。
            if (Gm.Allowed)
            {
                if (_wxBusy) { SettleRewarded(_wxGen); DropRewarded(); }
                ShowFallback(scene, trackUnit, done);
                return;
            }
            if (!string.IsNullOrEmpty(unit))
            {
                if (_wxBusy)
                {
                    Ui.Toast("广告加载中，请稍候", 180);
                    return;
                }
                HookWxOnShow();
                try
                {
                    DropRewarded();
                    _wxBusy = true;
                    _wxDidShow = false;
                    int gen = ++_wxGen;

                    _wxAd = WX.CreateRewardedVideoAd(new WXCreateRewardedVideoAdParam
                    {
                        adUnitId = unit,
                        multiton = true,
                    });
                    _wxAd.OnClose(r =>
                    {
                        if (!_wxBusy || gen != _wxGen)
                        {
                            DropRewarded();
                            return;
                        }
                        bool ended = r == null || r.isEnded;
                        var cb = _wxClosed;
                        SettleRewarded(gen);
                        DropRewarded();
                        cb?.Invoke(ended);
                    });
                    _wxAd.OnError(e =>
                    {
                        string msg = e != null ? e.errCode + " " + e.errMsg : "unknown";
                        Debug.LogWarning("[Ads] wx reward error (" + scene + "): " + msg);
                        if (_wxBusy && !_wxDidShow && gen == _wxGen)
                            FailWx(scene, trackUnit, gen, msg, onFail);
                    });

                    _wxClosed = ended =>
                    {
                        Analytics.AdClose(scene, ended, trackUnit, "reward");
                        if (!ended)
                        {
                            Ui.Toast("完整观看视频才可获得奖励", 200);
                            onFail?.Invoke();
                            return;
                        }
                        _lastRewardedAt = Time.realtimeSinceStartup;
                        GrantAdTask();
                        done?.Invoke();
                    };

                    _wxAd.Show(_ => OnRewardedShown(scene, trackUnit, gen), _ =>
                    {
                        if (!_wxBusy || gen != _wxGen || _wxAd == null) return;
                        _wxAd.Load(
                            __ =>
                            {
                                if (!_wxBusy || gen != _wxGen || _wxAd == null) return;
                                _wxAd.Show(
                                    ___ => OnRewardedShown(scene, trackUnit, gen),
                                    ___ => FailWx(scene, trackUnit, gen, "show_after_load_failed", onFail));
                            },
                            err => FailWx(scene, trackUnit, gen, err != null ? err.errCode + " " + err.errMsg : "load_failed", onFail));
                    });
                    if (Game.I != null)
                        Tween.Run(Game.I, 8f, _ => { }, () =>
                        {
                            if (_wxBusy && !_wxDidShow && gen == _wxGen)
                                FailWx(scene, trackUnit, gen, "timeout", onFail);
                        });
                    return;
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Ads] wx create failed: " + e.Message);
                    SettleRewarded(_wxGen);
                    DropRewarded();
                }
            }
#endif
            ShowFallback(scene, trackUnit, done);
        }

        /// <summary>在自然转场点尝试展示插屏广告。不满足频控时静默跳过。</summary>
        public static bool TryInterstitial(string scene = "return_home")
        {
            if (Application.isEditor || Profile.Volatile || Fast) return false;
            var s = Profile.S;
            if (s == null || s.Cleared < InterstitialMinCleared) return false;
            if (s.AdInterstitial >= Meta.InterstitialDailyMax) return false;

            float now = Time.realtimeSinceStartup;
            if (now - BootAt < InterstitialBootGraceSec) return false;
            if (_lastInterstitialAt > 0f && now - _lastInterstitialAt < InterstitialIntervalSec) return false;
            if (_lastRewardedAt > 0f && now - _lastRewardedAt < InterstitialAfterRewardSec) return false;

            if (DouyinBridge.IsDouyin)
            {
                string dyUnit = CloudConfig.DouyinInterstitialAdUnitId;
                if (string.IsNullOrEmpty(dyUnit)) return false;
                Analytics.AdRequest(scene, dyUnit, "interstitial");
                _lastInterstitialAt = Time.realtimeSinceStartup;
                if (Profile.S != null) { Profile.S.AdInterstitial++; Profile.Save(); }
                DouyinBridge.ShowInterstitialAd(dyUnit);
                Analytics.AdShow(scene, dyUnit, "interstitial");
                return true;
            }

#if LIANGSHAN_WX_AD
            string unit = CloudConfig.WeChatInterstitialAdUnitId;
            if (string.IsNullOrEmpty(unit) || _wxBusy || _interstitialBusy) return false;
            try
            {
                DropInterstitial();
                _interstitialBusy = true;
                Analytics.AdRequest(scene, unit, "interstitial");
                _interstitial = WX.CreateInterstitialAd(new WXCreateInterstitialAdParam { adUnitId = unit });
                _interstitial.OnClose(() =>
                {
                    _interstitialBusy = false;
                    Sfx.SetAdMute(false);
                    Analytics.AdClose(scene, true, unit, "interstitial");
                    DropInterstitial();
                });
                _interstitial.OnError(e =>
                {
                    string msg = e != null ? e.errCode + " " + e.errMsg : "unknown";
                    Debug.LogWarning("[Ads] wx interstitial error: " + msg);
                    _interstitialBusy = false;
                    Sfx.SetAdMute(false);
                    SplitAdErr(msg, out string ec, out string em);
                    Analytics.AdError(scene, ec, em, unit, "interstitial");
                    DropInterstitial();
                });
                _interstitial.Load(_ =>
                {
                    if (_interstitial == null || _wxBusy) { _interstitialBusy = false; DropInterstitial(); return; }
                    _interstitial.Show(__ =>
                    {
                        Sfx.SetAdMute(true);
                        _lastInterstitialAt = Time.realtimeSinceStartup;
                        if (Profile.S != null)
                        {
                            Profile.S.AdInterstitial++;
                            Profile.Save();
                        }
                        Analytics.AdShow(scene, unit, "interstitial");
                    }, __ =>
                    {
                        _interstitialBusy = false;
                        Sfx.SetAdMute(false);
                        DropInterstitial();
                    });
                }, _ =>
                {
                    _interstitialBusy = false;
                    DropInterstitial();
                });
                return true;
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Ads] interstitial failed: " + e.Message);
                _interstitialBusy = false;
                Sfx.SetAdMute(false);
                DropInterstitial();
            }
#endif
            return false;
        }

        /// <summary>同步主界面可选单格原生模板广告显隐（未填 WeChatCustomFloatAdUnitId 时完全不创建）。</summary>
        public static void SyncCustomFloat(bool visible)
        {
            if (DouyinBridge.IsDouyin) return;
#if LIANGSHAN_WX_AD
            string unit = CloudConfig.WeChatCustomFloatAdUnitId;
            if (string.IsNullOrEmpty(unit)) return;
            _customWantShow = visible;
            try
            {
                if (!visible)
                {
                    if (_customAd != null) _customAd.Hide(_ => { }, _ => { });
                    return;
                }
                if (_customAd == null)
                {
                    var win = WX.GetWindowInfo();
                    int left = win != null ? Mathf.Max(8, (int)win.windowWidth - 76) : 12;
                    int top = win != null ? Mathf.Max(96, (int)(win.windowHeight * 0.42f)) : 260;
                    _customAd = WX.CreateCustomAd(new WXCreateCustomAdParam
                    {
                        adUnitId = unit,
                        adIntervals = 60,
                        style = new CustomStyle { left = left, top = top, width = 68 },
                    });
                    _customAd.OnLoad(_ =>
                    {
                        if (_customWantShow && _customAd != null)
                            _customAd.Show(__ => Analytics.AdShow("home_custom", unit, "custom"), __ => { });
                    });
                    _customAd.OnError(e =>
                    {
                        Debug.LogWarning("[Ads] custom ad error: " + (e != null ? e.errCode + " " + e.errMsg : "?"));
                    });
                    return;
                }
                _customAd.Show(_ => { }, _ => { });
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Ads] custom ad exception: " + e.Message);
            }
#endif
        }

        static void GrantAdTask()
        {
            if (Profile.S == null) return;
            Meta.Progress(Profile.S, Act.Ad);
            Profile.Save();
        }

#if LIANGSHAN_WX_AD
        static void OnRewardedShown(string scene, string trackUnit, int gen)
        {
            if (!_wxBusy || gen != _wxGen || _wxDidShow) return;
            _wxDidShow = true;
            _lastRewardedAt = Time.realtimeSinceStartup;
            Sfx.SetAdMute(true);
            Analytics.AdShow(scene, trackUnit, "reward");
        }

        static void FailWx(string scene, string trackUnit, int gen, string errMsg, Action onFail)
        {
            if (!_wxBusy || gen != _wxGen) return;
            SettleRewarded(gen);
            DropRewarded();
            SplitAdErr(errMsg, out string ec, out string em);
            Analytics.AdError(scene, ec, em, trackUnit, "reward");
            Analytics.AdClose(scene, false, trackUnit, "reward");
            Ui.Toast("暂无可播放的广告，请稍后再试", 200);
            onFail?.Invoke();
        }

        static void SettleRewarded(int gen)
        {
            if (!_wxBusy || gen != _wxGen) return;
            _wxBusy = false;
            _wxDidShow = false;
            _wxGen++;
            _wxClosed = null;
            Sfx.SetAdMute(false);
        }

        static void DropRewarded()
        {
            var ad = _wxAd;
            _wxAd = null;
            if (ad == null) return;
            try { ad.Destroy(); }
            catch (Exception) { }
        }

        static void DropInterstitial()
        {
            var ad = _interstitial;
            _interstitial = null;
            if (ad == null) return;
            try { ad.Destroy(); }
            catch (Exception) { }
        }

        static void HookWxOnShow()
        {
            if (_onShowHooked) return;
            _onShowHooked = true;
            try
            {
                WX.OnShow(_ =>
                {
                    if (!_wxBusy || !_wxDidShow || Game.I == null) return;
                    int snapGen = _wxGen;
                    Tween.Run(Game.I, 2.2f, __ => { }, () =>
                    {
                        if (_wxBusy && _wxDidShow && snapGen == _wxGen)
                        {
                            var cb = _wxClosed;
                            SettleRewarded(snapGen);
                            DropRewarded();
                            cb?.Invoke(true);
                        }
                    });
                });
            }
            catch (Exception e)
            {
                Debug.LogWarning("[Ads] WX.OnShow hook failed: " + e.Message);
            }
        }
#endif

        static void ShowFallback(string scene, string trackUnit, Action done)
        {
            Analytics.AdShow(scene, trackUnit, "reward");
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
                _lastRewardedAt = Time.realtimeSinceStartup;
                Analytics.AdClose(scene, true, trackUnit, "reward");
                UnityEngine.Object.Destroy(layer.gameObject);
                GrantAdTask();
                done?.Invoke();
            });
        }
    }
}
