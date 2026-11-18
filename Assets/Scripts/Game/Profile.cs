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
        static WXRewardedVideoAd _wxAd;
        static string _wxUnit;
        static Action<bool> _wxClosed;
        static bool _wxBusy;
#endif

        public static void Show(string scene, Action done)
        {
            Analytics.AdRequest(scene);
#if LIANGSHAN_WX_AD
            string unit = CloudConfig.RewardedAdUnitId;
            if (!string.IsNullOrEmpty(unit))
            {
                if (_wxBusy) return;
                try
                {
                    if (_wxAd == null || _wxUnit != unit)
                    {
                        if (_wxAd != null) { try { _wxAd.Destroy(); } catch (Exception) { } }
                        _wxUnit = unit;
                        _wxAd = WX.CreateRewardedVideoAd(new WXCreateRewardedVideoAdParam { adUnitId = unit, multiton = true });
                        _wxAd.OnClose(r =>
                        {
                            if (!_wxBusy) return;
                            _wxBusy = false;
                            bool ended = r == null || r.isEnded;
                            var cb = _wxClosed;
                            _wxClosed = null;
                            cb?.Invoke(ended);
                            try { _wxAd?.Load(_ => { }, _ => { }); } catch (Exception) { }
                        });
                        _wxAd.OnError(e => Debug.LogWarning("[Ads] wx error " + (e != null ? e.errCode + " " + e.errMsg : "?")));
                    }
                    _wxBusy = true;
                    _wxClosed = ended =>
                    {
                        Analytics.AdClose(scene, ended);
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
                    _wxAd.Show(_ => Analytics.AdShow(scene), _ =>
                    {
                        _wxAd.Load(
                            __ => _wxAd.Show(___ => Analytics.AdShow(scene), ___ => FailWx(scene)),
                            __ => FailWx(scene));
                    });
                    return;
                }
                catch (Exception e)
                {
                    Debug.LogWarning("[Ads] wx create failed " + e.Message);
                    _wxBusy = false;
                }
            }
#endif
            ShowFallback(scene, done);
        }

#if LIANGSHAN_WX_AD
        static void FailWx(string scene)
        {
            _wxBusy = false;
            _wxClosed = null;
            Analytics.AdClose(scene, false);
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
