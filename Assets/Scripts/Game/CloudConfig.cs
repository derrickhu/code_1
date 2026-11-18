using System;
using System.Collections.Generic;

namespace Liangshan
{
    /// <summary>
    /// 云上的游戏标识。gameKey 用 cunkou，沿用原《村口大战外星人》工程配置，CDN 目录、云函数和存档集合都按这个键隔离。
    /// 云函数目录、网关路径、GAME_KEY 环境变量三处都是 cunkou。
    /// </summary>
    public static class CloudConfig
    {
        public const string GameKey = "cunkou";
        public const string GameName = "村口大战外星人";
        public const string AppId = "wx4afec790790030e8";
        /// <summary>微信流量主激励视频广告位 ID（开通流量主后填入 adunit-xxx 即可自动切换真机激励视频；留空时走演示回退）。</summary>
        public const string RewardedAdUnitId = "";

        /// <summary>抖音小游戏 AppID。</summary>
        public const string DouyinAppId = "tt5b402dfdc53db6ff07";
        /// <summary>抖音默认激励视频广告位 ID（未单独配置分场景广告位时统一回退此 ID）。</summary>
        public const string DouyinDefaultAdUnitId = "mcs8desnlr2a80go8v";
        /// <summary>抖音插屏广告位 ID（后续开通插屏广告位后填入即可启用）。</summary>
        public const string DouyinInterstitialAdUnitId = "";

        /// <summary>
        /// 抖音一次性订阅消息模板 ID（在抖音开放平台 -> 运营/互动能力 -> 订阅消息 选用模板后填入 MSG...）。
        /// 注意：一次性模板单次最多传 3 个；版本更新提醒模板须单独请求，不可与普通一次性模板混传。
        /// 也可在不重编 Unity 的情况下直接填入导出目录 douyin-minigame/game.js 的 SUBSCRIBE_TMPL_IDS。
        /// </summary>
        public const string DouyinSubscribePatrolTmplId = ""; // 巡村收益满仓 / 体力恢复提醒
        public const string DouyinSubscribeSignTmplId = "";   // 每日签到 / 活动开启提醒
        public const string DouyinSubscribeUpdateTmplId = ""; // 版本更新提醒（单独请求）

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
        /// 抖音分场景激励视频广告位映射表。
        /// 后续在抖音后台新增各场景独立广告位后，直接将对应场景键的值填上即可自动区分统计；留空时回退 DouyinDefaultAdUnitId。
        /// </summary>
        static readonly Dictionary<string, string> DouyinSceneAdUnits = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            { "start_2star", "" },  // 开局村委增援（2星乡亲 + 能量币）
            { "shop_ingot", "" },   // 供销社免费领星钻
            { "shop_stamina", "" }, // 供销社免费领体力
            { "recruit", "" },      // 摇人广播站免费摇人
            { "stamina", "" },      // 体力弹窗看视频补体力
            { "idle", "" },         // 联防巡逻双倍收益
            { "speed2", "" },       // 局内解锁全天 2 倍速
            { "swap_unit", "" },    // 局内换防上阵乡亲
            { "reroll", "" },       // 局内强化卡免费刷新
            { "take_all", "" },     // 局内强化三张全收
            { "reel_jackpot", "" }, // 局内转盘鸿运全收
            { "double", "" },       // 结算双倍战利品
            { "revive", "" },       // 战败满血复活再战
        };

        public static string GetDouyinAdUnitId(string scene)
        {
            if (!string.IsNullOrEmpty(scene) && DouyinSceneAdUnits.TryGetValue(scene, out string id) && !string.IsNullOrEmpty(id))
                return id;
            return DouyinDefaultAdUnitId;
        }
        /// <summary>云存储上的按需资源，和别的游戏同一个桶。曲子在 cunkou/StreamingAssets/Music，用到哪首下哪首。</summary>
        public const string AssetCdn = "https://726f-rosa-env-d7grf78r5dbd37323-1414200063.tcb.qcloud.la/" + GameKey;

        public const string BaseUrl = "https://rosa-env-d7grf78r5dbd37323.service.tcloudbase.com";
        const string Prefix = "/" + GameKey + "-api";

        public const string LoginPath = Prefix + "/login";
        public const string PullPath = Prefix + "/save/pull";
        public const string PushPath = Prefix + "/save/push";
        public const string RankSubmitPath = Prefix + "/rank/submit";
        public const string RankListPath = Prefix + "/rank/list";
        public const string RankLikePath = Prefix + "/rank/like";

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
