using System;
using Liangshan.Sim;
using UnityEngine;

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
}
