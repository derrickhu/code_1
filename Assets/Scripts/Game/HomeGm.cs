using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>开发工具里的 GM 开关。真机不出现，跟 code_3 一样只认编辑器和微信开发者工具。</summary>
    public static class Gm
    {
        /// <summary>截图验收强制打开。正式包不要设。</summary>
        public static bool Force;

        public static bool Allowed
        {
            get
            {
                if (Force || Application.isEditor || DouyinBridge.IsDevtools) return true;
                try
                {
                    var wx = Type.GetType("WeChatWASM.WX, Wx") ?? Type.GetType("WeChatWASM.WX");
                    var info = wx?.GetMethod("GetSystemInfoSync", Type.EmptyTypes)?.Invoke(null, null);
                    if (info == null) return false;
                    var t = info.GetType();
                    object raw = t.GetField("platform")?.GetValue(info) ?? t.GetProperty("platform")?.GetValue(info);
                    return raw is string name && name.Equals("devtools", StringComparison.OrdinalIgnoreCase);
                }
                catch (Exception)
                {
                    return false;
                }
            }
        }
    }

    /// <summary>主界面 GM：跳过还没打的关，发元宝等物资，或把本地和云端一起换成新档。</summary>
    public sealed partial class HomeScreen
    {
        Text _gmStatus;

        void BuildGm()
        {
            if (!Gm.Allowed) return;
            // 收在右上体力栏正下方小胶囊，绝不遮挡寨主背包格子、好汉列表或底栏
            var slot = Ui.Top(_page, 476, Ui.SafeTop + 122, new Vector2(92, 42), "gm");
            Ui.Btn(slot, "GM", new Vector2(92, 42), Vector2.zero, Pal.Slate, ShowGm, 22);
            slot.SetAsLastSibling();
        }

        public void ShowGm()
        {
            const float H = 1620f;
            MetaUi.Modal(Layer, "gm", "GM", new Vector2(860, H), out var card, Pal.Slate);
            float y = H * 0.5f - 118f;
            _gmStatus = Ui.Label(card, GmFrontier(), 36, Pal.Ink, new Vector2(0, y), new Vector2(740, 56), TextAnchor.MiddleCenter, Fonts.Heavy);
            y -= 60f;
            Ui.Label(card, "只在编辑器和微信/抖音开发者工具里出现。跳过按三星通关结算。", 24, Pal.SubInk, new Vector2(0, y), new Vector2(760, 44));
            y -= 86f;
            void Big(string name, Color c, Action act)
            {
                Ui.Btn(card, name, new Vector2(560, 92), new Vector2(0, y), c, act, 38);
                y -= 104f;
            }
            Big("跳过本关", Pal.Azure, () => GmSkip(1));
            Big("连跳五关", Pal.Teal, () => GmSkip(5));
            Big("关卡全开", Pal.Green, () => GmSkip(Defs.LevelCount));
            if (Application.isEditor)
            {
                string dyLabel = DouyinBridge.ForceSimulateDouyin ? "抖音入口模拟：已开启" : "抖音入口模拟：点击开启";
                Big(dyLabel, DouyinBridge.ForceSimulateDouyin ? Pal.Gold : Pal.Purple, () =>
                {
                    DouyinBridge.SetSimulate(!DouyinBridge.ForceSimulateDouyin);
                    ShowGm();
                });
            }
            Big("清档", Pal.Red, () => MetaUi.Confirm(Layer, "本地和云端都换成新档\n金币、进度、乡亲都没了，不能恢复", WipeAll));
            y -= 6f;
            Ui.Label(card, "发物资，直接写进存档", 26, Pal.SubInk, new Vector2(0, y), new Vector2(740, 40));
            y -= 72f;
            Ui.Btn(card, "发一套常用", new Vector2(560, 88), new Vector2(0, y), Pal.Gold, GmPack, 36);
            y -= 96f;
            var grants = new (string name, Cur cur, int n)[]
            {
                ("星钻", Cur.Ingot, 1000),
                ("金币", Cur.Copper, 10000),
                ("合金钢", Cur.Iron, 500),
                ("大喇叭券", Cur.Token, 20),
                ("改装芯片", Cur.Refine, 20),
                ("破译扳手", Cur.Hammer, 20),
                ("体力", Cur.Stamina, 60),
                ("防弹布", Cur.Silk, 100),
                ("飞碟核心", Cur.Meteor, 20),
                ("广播手稿", Cur.Page, 50),
                ("守村秘籍", Cur.Tome, 10),
                ("工具箱", Cur.GearBox, 5),
            };
            for (int i = 0; i < grants.Length; i++)
            {
                var g = grants[i];
                Cur cur = g.cur;
                int n = g.n;
                string name = g.name;
                Ui.Btn(card, $"{name} +{n}", new Vector2(360, 76), new Vector2(i % 2 == 0 ? -190f : 190f, y - (i / 2) * 86f), Pal.Slate,
                    () => GmGive(cur, n, name), 30);
            }
        }

        void GmGive(Cur c, int n, string name)
        {
            Meta.Give(S, new Item(c, n));
            Profile.Save();
            if (_gmStatus) _gmStatus.text = $"{name} +{n}　现有 {Meta.Have(S, c)}";
            Ui.Toast($"{name} +{n}", 880);
        }

        void GmPack()
        {
            (Cur c, int n)[] pack =
            {
                (Cur.Ingot, 5000), (Cur.Copper, 50000), (Cur.Iron, 2000), (Cur.Token, 50),
                (Cur.Refine, 30), (Cur.Hammer, 30), (Cur.Stamina, 120), (Cur.Silk, 200),
                (Cur.Meteor, 30), (Cur.Page, 50), (Cur.Tome, 10), (Cur.GearBox, 10),
            };
            foreach (var p in pack) Meta.Give(S, new Item(p.c, p.n));
            Profile.Save();
            if (_gmStatus) _gmStatus.text = "已发一套：星钻 金币 合金钢 大喇叭券等";
            Ui.Toast("已发一套常用物资", 880);
        }

        void WipeAll()
        {
            Profile.Reset();
            CloudSync.FlushNow("wipe");
            Game.I.ShowHome();
            Ui.Toast("已换成新档，云端一起盖掉", 880);
        }

        public void GmSkip(int count)
        {
            int from = S.Cleared + 1;
            if (from > Defs.LevelCount)
            {
                Ui.Toast("已经全部通关", 880);
                return;
            }
            int n = Mathf.Min(count, Defs.LevelCount - S.Cleared);
            var names = new List<string>();
            for (int i = 0; i < n; i++)
            {
                var st = Defs.Level(from + i);
                var r = Meta.BattleRewards(S, st, true, st.Waves, 1f, 0, new Rng(st.No * 97 + 11));
                if (r.Unlock.HasValue) names.Add(Defs.Hero(r.Unlock.Value).Name);
                Meta.Give(S, r);
                Meta.FinishMain(S, st, true, r);
            }
            Profile.Save();
            if (_gmStatus) _gmStatus.text = GmFrontier();
            string who = names.Count > 0 ? "，" + string.Join("、", names) + "入伙" : "";
            string where = S.Cleared >= Defs.LevelCount ? "已全部通关" : "现在第 " + (S.Cleared + 1) + " 关";
            Ui.Toast($"跳过 {n} 关，{where}{who}", 880);
        }

        static string GmFrontier()
        {
            if (S.Cleared >= Defs.LevelCount) return "已全部通关";
            var st = Defs.Level(S.Cleared + 1);
            return "下一关　第 " + st.No + " 关 · " + st.Name;
        }
    }
}
