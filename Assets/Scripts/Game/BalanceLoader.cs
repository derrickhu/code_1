using System;
using Liangshan.Sim;
using UnityEngine;

namespace Liangshan
{
    /// <summary>
    /// 启动时自动从 Resources/BalanceConfig.json 读取并热应用全局数值表。
    /// 策划无论是通过编辑器菜单「村口大战外星人 / 数值管理中心」改表保存，还是直接编辑 JSON 文件，
    /// 运行游戏（编辑器、Mac 端、微信小游戏端）都会自动加载最新数值。
    /// </summary>
    public static class BalanceLoader
    {
        public const string ResourcePath = "BalanceConfig";
        public const string AssetFilePath = "Assets/Resources/BalanceConfig.json";

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        public static void LoadAtBoot()
        {
            var asset = Resources.Load<TextAsset>(ResourcePath);
            if (asset == null || string.IsNullOrWhiteSpace(asset.text)) return;
            TryApplyJson(asset.text, out _);
        }

        public static bool TryApplyJson(string json, out string error)
        {
            error = null;
            if (string.IsNullOrWhiteSpace(json))
            {
                error = "JSON 内容为空";
                return false;
            }
            try
            {
                var cfg = JsonUtility.FromJson<BalanceConfig>(json);
                if (cfg == null)
                {
                    error = "JSON 解析结果为空";
                    return false;
                }
                Balance.Apply(cfg);
                return true;
            }
            catch (Exception e)
            {
                error = e.Message;
                Debug.LogWarning("[数值中心] BalanceConfig.json 加载失败，已回退内置默认数值：" + e.Message);
                return false;
            }
        }

        public static string ToJson(BalanceConfig cfg) => JsonUtility.ToJson(cfg, true);
    }
}
