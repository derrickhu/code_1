using System;
using System.Collections.Generic;

namespace Liangshan
{
    /// <summary>
    /// 云上的游戏标识。gameKey 用 cunkou，沿用《村口大战外星人》工程配置，CDN 目录、云函数和存档集合都按这个键隔离。
    /// </summary>
    public static class CloudConfig
    {
        public const string GameKey = "cunkou";
        public const string GameName = "村口大战外星人";
        public const string AppId = "wx4afec790790030e8";
        /// <summary>微信默认激励视频广告位 ID（体力+挂机巡村，未单独命中的场景回退此 ID）。</summary>
        public const string RewardedAdUnitId = "adunit-3e808f8ac0bd9209";
        /// <summary>微信插屏广告位 ID（开通后填入即可启用战后低频插屏）。</summary>
        public const string WeChatInterstitialAdUnitId = "";
        /// <summary>微信主界面悬浮原生模板广告位 ID（可选，留空不展示）。</summary>
        public const string WeChatCustomFloatAdUnitId = "";

        /// <summary>抖音小游戏 AppID。</summary>
        public const string DouyinAppId = "tt5b402dfdc53db6ff07";
        /// <summary>抖音默认激励视频广告位 ID（体力，未单独命中的场景回退此 ID）。</summary>
        public const string DouyinDefaultAdUnitId = "mcs8desnlr2a80go8v";
        /// <summary>抖音插屏广告位 ID（后续开通插屏广告位后填入即可启用）。</summary>
        public const string DouyinInterstitialAdUnitId = "";

        public const string DouyinSubscribePatrolTmplId = "";
        public const string DouyinSubscribeSignTmplId = "";
        public const string DouyinSubscribeUpdateTmplId = "";

        public static string GetDouyinSubscribeTmplCsv(string scene)
        {
            if (scene == "update") return DouyinSubscribeUpdateTmplId ?? "";
            if (scene == "patrol") return DouyinSubscribePatrolTmplId ?? "";
            if (scene == "sign") return DouyinSubscribeSignTmplId ?? "";
            var list = new List<string>(2);
            if (!string.IsNullOrEmpty(DouyinSubscribePatrolTmplId)) list.Add(DouyinSubscribePatrolTmplId);
            if (!string.IsNullOrEmpty(DouyinSubscribeSignTmplId) && !list.Contains(DouyinSubscribeSignTmplId))
                list.Add(DouyinSubscribeSignTmplId);
            return list.Count > 0 ? string.Join(",", list) : "";
        }

        /// <summary>
        /// 微信分场景激励视频广告位映射表（5 个已开通分组广告位覆盖全部 19 个激励视频细分入口）：
        /// - 体力+挂机巡村：adunit-3e808f8ac0bd9209
        /// - 局内强化+倍速：adunit-c5587bc19363af50
        /// - 胜利双倍+开局增援：adunit-6233ca9f96b05e36
        /// - 战败复活：adunit-fe7a8a11e1ea7ee9
        /// - 抽卡+供销社星钻：adunit-39a3bb98a95fc55c
        /// </summary>
        static readonly Dictionary<string, string> WeChatSceneAdUnits = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "start_2star",    "adunit-6233ca9f96b05e36" }, // 胜利双倍+开局增援
            { "double",         "adunit-6233ca9f96b05e36" }, // 胜利双倍+开局增援
            { "lose_double",    "adunit-6233ca9f96b05e36" }, // 二败抚恤双倍
            { "shop_ingot",     "adunit-39a3bb98a95fc55c" }, // 抽卡+供销社星钻
            { "recruit",        "adunit-39a3bb98a95fc55c" }, // 抽卡+供销社星钻
            { "totem_pull",     "adunit-39a3bb98a95fc55c" }, // 徽章寻宝免费抽
            { "gear_box",       "adunit-39a3bb98a95fc55c" }, // 装备箱免费开
            { "shop_stamina",   "adunit-3e808f8ac0bd9209" }, // 体力+挂机巡村
            { "stamina",        "adunit-3e808f8ac0bd9209" }, // 体力+挂机巡村
            { "welfare_double", "adunit-3e808f8ac0bd9209" }, // 每日福利加领一份
            { "idle",           "adunit-3e808f8ac0bd9209" }, // 体力+挂机巡村
            { "daily_extra",    "adunit-3e808f8ac0bd9209" }, // 比武加次数
            { "escort_extra",   "adunit-3e808f8ac0bd9209" }, // 拦截补给加次数
            { "speed2",         "adunit-c5587bc19363af50" }, // 局内强化+倍速
            { "swap_unit",      "adunit-c5587bc19363af50" }, // 局内强化+倍速
            { "reroll",         "adunit-c5587bc19363af50" }, // 局内强化+倍速
            { "take_all",       "adunit-c5587bc19363af50" }, // 局内强化+倍速
            { "reel_jackpot",   "adunit-c5587bc19363af50" }, // 局内强化+倍速
            { "revive",         "adunit-fe7a8a11e1ea7ee9" }, // 战败复活
        };

        public static string GetWeChatAdUnitId(string scene)
        {
            if (!string.IsNullOrEmpty(scene) && WeChatSceneAdUnits.TryGetValue(scene, out string id) && !string.IsNullOrEmpty(id))
                return id;
            return RewardedAdUnitId;
        }

        /// <summary>
        /// 抖音分场景激励视频广告位映射表（5 个分组广告位覆盖全部 19 个激励视频细分入口）。
        /// </summary>
        static readonly Dictionary<string, string> DouyinSceneAdUnits = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "start_2star",    "1nbibg488beg3t4ahs" }, // 胜利双倍 & 开局增援
            { "double",         "1nbibg488beg3t4ahs" }, // 胜利双倍 & 开局增援
            { "lose_double",    "1nbibg488beg3t4ahs" }, // 二败抚恤双倍
            { "shop_ingot",     "al008pk72n23x56kq9" }, // 抽卡 & 供销社星钻
            { "recruit",        "al008pk72n23x56kq9" }, // 抽卡 & 供销社星钻
            { "totem_pull",     "al008pk72n23x56kq9" }, // 徽章寻宝免费抽
            { "gear_box",       "al008pk72n23x56kq9" }, // 装备箱免费开
            { "shop_stamina",   "mcs8desnlr2a80go8v" }, // 体力
            { "stamina",        "mcs8desnlr2a80go8v" }, // 体力
            { "welfare_double", "mcs8desnlr2a80go8v" }, // 每日福利加领一份
            { "idle",           "mcs8desnlr2a80go8v" }, // 体力（挂机巡村）
            { "daily_extra",    "mcs8desnlr2a80go8v" }, // 比武加次数
            { "escort_extra",   "mcs8desnlr2a80go8v" }, // 拦截补给加次数
            { "speed2",         "1alnffp680mg2gdah1" }, // 局内强化 & 倍速
            { "swap_unit",      "1alnffp680mg2gdah1" }, // 局内强化 & 倍速
            { "reroll",         "1alnffp680mg2gdah1" }, // 局内强化 & 倍速
            { "take_all",       "1alnffp680mg2gdah1" }, // 局内强化 & 倍速
            { "reel_jackpot",   "1alnffp680mg2gdah1" }, // 局内强化 & 倍速
            { "revive",         "3oengr4154u8nn45gn" }, // 战败复活
        };

        public static string GetDouyinAdUnitId(string scene)
        {
            if (!string.IsNullOrEmpty(scene) && DouyinSceneAdUnits.TryGetValue(scene, out string id) && !string.IsNullOrEmpty(id))
                return id;
            return DouyinDefaultAdUnitId;
        }

        public const string AssetCdn = "https://726f-rosa-env-d7grf78r5dbd37323-1414200063.tcb.qcloud.la/" + GameKey;

        public const string BaseUrl = "https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com";
        const string Prefix = "/" + GameKey + "-api";

        public const string LoginPath = Prefix + "/login";
        public const string PullPath = Prefix + "/save/pull";
        public const string PushPath = Prefix + "/save/push";
        public const string RankSubmitPath = Prefix + "/rank/submit";
        public const string RankListPath = Prefix + "/rank/list";
        public const string RankLikePath = Prefix + "/rank/like";
        public const string GameClubSyncPath = Prefix + "/gameclub/sync";

        public const int RequestTimeoutSec = 10;
        public const int SchemaVersion = 1;

        public const string TokenKey = GameKey + "_token";
        public const string AnonKey = GameKey + "_anon_id";
        public const string SyncMetaKey = GameKey + "_cloud_meta";

        public const float StartupTimeout = 6f;
        public const float Debounce = 1.5f;
        public const float BaseDelay = 1.5f;
        public const float MaxBackoff = 30f;
        public const int MaxFail = 5;
        public const float RetryInterval = 60f;
    }
}
