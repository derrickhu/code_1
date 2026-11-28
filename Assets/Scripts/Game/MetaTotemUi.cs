using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace Liangshan
{
    public static partial class MetaUi
    {
        // 全游统一五阶品质映射：0=普通(玄铁银灰) 1=稀有(霁海晶蓝) 2=史诗(紫微星辉) 3=传说(替天鎏金) 4=绝世(赤焰神品)
        public static Color TotemRarityColor(int r) => QualColor(r);

        public static Color TotemTileBg(int r) => Color.Lerp(QualColor(r), Pal.Hex("0D1528"), 0.55f);

        public static Color TotemTileRim(int r) => QualInk(r);

        public static string TotemSlot(int r) => QualSlot(r);

        /// <summary>对标参考图4「熊王图腾·皇冠」双栏对照浮层：左卡洗炼/镶嵌，右列展示该部位 4 个镶嵌槽实时状态。</summary>
        public static void TotemDetail(Transform layer, int totemId, Action changed = null)
        {
            var t = Meta.FindTotem(S, totemId);
            if (t == null) return;
            var old = layer.Find("pop_totem");
            if (old) Object.DestroyImmediate(old.gameObject);

            var root = Ui.Rect(layer, "pop_totem");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var dim = Ui.Fill(root, new Color(0.02f, 0.05f, 0.1f, 0.56f), true, "dim");
            Ui.Tap(dim.GetComponent<Image>(), () => { if (root) Object.Destroy(root.gameObject); }, null, false);

            var wrap = Ui.Rect(root, "wrap");
            wrap.sizeDelta = new Vector2(1000, 560);
            wrap.anchoredPosition = new Vector2(0, 140);

            // ---------- 左侧：图腾主卡 ----------
            const float lw = 486f, lh = 532f;
            var left = Ui.Rect(wrap, "left");
            left.sizeDelta = new Vector2(lw, lh);
            left.anchoredPosition = new Vector2(-248, 0);
            var rc = QualBanner(t.Rarity);
            var rStroke = QualStroke(t.Rarity);
            Ui.Box(left, new Vector2(lw + 10, lh + 10), new Vector2(0, -8), new Color(0, 0, 0, 0.55f), Art.Rounded);
            var lRim = Ui.Box(left, new Vector2(lw + 4, lh + 4), Vector2.zero, QualColor(t.Rarity).A(0.85f), Art.Rounded);
            lRim.raycastTarget = false;
            var lface = Ui.Box(left, new Vector2(lw, lh), Vector2.zero, Pal.Hex("0D1528"), Art.Rounded);
            lface.raycastTarget = true;
            Ui.Box(left, new Vector2(lw, 156), new Vector2(0, lh * 0.5f - 78), rc, Art.Rounded);
            Ui.Box(left, new Vector2(lw, 32), new Vector2(0, lh * 0.5f - 140), rc, Art.White);
            Ui.Box(left, new Vector2(lw - 6, lh - 158), new Vector2(0, -78), Pal.Hex("0D1528"), Art.Rounded);
            Ui.Box(left, new Vector2(lw - 6, 24), new Vector2(0, lh * 0.5f - 166), Pal.Hex("0D1528"), Art.White);
            Ui.Box(left, new Vector2(lw - 6, 3), new Vector2(0, lh * 0.5f - 156), QualGlow(t.Rarity).A(0.88f), Art.White);

            // 兽首大图标（嵌于对应品质雕花方框内）+ 品质切角铆钉角标
            Slot(left, TotemSlot(t.Rarity), 112, new Vector2(-164, lh * 0.5f - 74));
            Ui.Icon(left, Meta.TotemIcon(t), 82, new Vector2(-164, lh * 0.5f - 72));
            Ui.TagChip(left, Meta.TotemRarityNames[t.Rarity], new Vector2(100, 36), new Vector2(-164, lh * 0.5f - 132), QualColor(t.Rarity), 20);

            Ui.SingleLine(Ui.Outlined(left, Meta.TotemFullName(t), 23, Color.white,
                new Vector2(42, lh * 0.5f - 44), new Vector2(276, 42), rStroke, 2.0f, TextAnchor.MiddleLeft), 17);

            // 锁头按钮
            var lockBg = Ui.Icon(left, "ui/lv", 48, new Vector2(lw * 0.5f - 32, lh * 0.5f - 44), "lock");
            var lockIc = Ui.Icon(lockBg.transform, "ic_lock", 30, Vector2.zero);
            lockIc.color = t.Locked ? Pal.Gold : new Color(1, 1, 1, 0.45f);
            Ui.Tap(lockBg, () =>
            {
                t.Locked = !t.Locked;
                Save();
                TotemDetail(layer, totemId, changed);
                changed?.Invoke();
            });

            // 部位 + 基础攻击条
            var subBar = new Vector2(60, lh * 0.5f - 104);
            Ui.Skin(left, "pill", new Vector2(308, 40), subBar, -1f);
            Ui.Icon(left, Meta.Equips[t.Slot].Icon, 30, subBar + new Vector2(-130, 0));
            Ui.SingleLine(Ui.Outlined(left, $"{Meta.Equips[t.Slot].Name}  攻击 +{Meta.TotemAtk(t)}", 20, Color.white,
                subBar + new Vector2(18, 1), new Vector2(258, 38), Pal.Ink, 1.5f, TextAnchor.MiddleLeft), 16);

            // 图腾效果内框
            Ui.Box(left, new Vector2(lw - 42, 214), new Vector2(0, -20), Pal.Hex("243B64"), Art.RoundedSmall);
            Ui.Box(left, new Vector2(lw - 46, 210), new Vector2(0, -20), Pal.Hex("131E38"), Art.RoundedSmall);
            Ui.Label(left, "徽章效果", 25, Pal.Hex("8CA6C6"), new Vector2(0, 56), new Vector2(200, 34), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Label(left, $"◆  <b>{Meta.TotemEffectText(t, true)}</b>", 30, Pal.Hex("EAF2FF"), new Vector2(0, -14), new Vector2(lw - 84, 100), TextAnchor.MiddleLeft, Fonts.Heavy);
            if (t.Rarity >= 2)
            {
                int rCost = Meta.RefineStoneCost(t.Rarity);
                Ui.Icon(left, "ic_refine", 32, new Vector2(-90, -96));
                Ui.Label(left, $"洗炼消耗：{S.RefineStones}/{rCost}", 22, S.RefineStones >= rCost ? Pal.Hex("00F57A") : Pal.Hex("FF5E54"),
                    new Vector2(26, -96), new Vector2(220, 32), TextAnchor.MiddleLeft, Fonts.Heavy);
            }
            else
            {
                Ui.Label(left, "史诗及以上品质可洗炼词条", 22, Pal.Hex("8CA6C6"), new Vector2(0, -96), new Vector2(360, 32), TextAnchor.MiddleCenter, Fonts.Heavy);
            }

            // 底部双按钮：洗炼（暖金） + 镶嵌/卸下（青翠）
            bool canRef = Meta.CanRefineTotem(S, t);
            Ui.Btn(left, "洗炼", new Vector2(196, 88), new Vector2(-112, -lh * 0.5f + 66), canRef ? Pal.Gold : Pal.Slate, () =>
            {
                if (t.Rarity < 2) { Ui.Toast("史诗及以上品质徽章才可洗炼", 200); return; }
                if (t.Locked) { Ui.Toast("请先解锁右上角锁头再洗炼", 200); return; }
                float before = Meta.TeamPower(S);
                if (!Meta.RefineTotem(S, t.Id, new Rng(Environment.TickCount)))
                {
                    Sfx.Play(Snd.Deny);
                    Ui.Toast("改装芯片不足：可在供销社、活跃宝箱获取", 200);
                    return;
                }
                Save();
                Sfx.Play(Snd.Merge, 0.85f);
                TotemDetail(layer, t.Id, changed);
                changed?.Invoke();
                float after = Meta.TeamPower(S);
                if (Mathf.Abs(after - before) >= 1f) MetaFx.StatUp(layer, "战力", before, after);
            }, 36);

            bool equipped = Meta.IsTotemEquipped(S, t.Id);
            Ui.Btn(left, equipped ? "卸下" : "镶嵌", new Vector2(196, 88), new Vector2(112, -lh * 0.5f + 66), equipped ? Pal.Orange : Pal.Teal, () =>
            {
                float before = Meta.TeamPower(S);
                Meta.ToggleInlayTotem(S, t.Id);
                Save();
                Sfx.Play(Snd.Unlock, 0.75f);
                TotemDetail(layer, t.Id, changed);
                changed?.Invoke();
                float after = Meta.TeamPower(S);
                if (after > before) MetaFx.StatUp(layer, "战力", before, after);
            }, 36);

            // ---------- 右侧：该部位 4 个镶嵌槽 ----------
            int baseIdx = t.Slot * Meta.TotemSocketsPerSlot;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                var row = Ui.Rect(wrap, "sock" + k);
                const float rw = 476f, rh = 120f;
                row.sizeDelta = new Vector2(rw, rh);
                row.anchoredPosition = new Vector2(254, 198 - k * 132);
                bool open = Meta.TotemSocketOpen(S, k);
                int eqId = open ? S.TotemEquipped[baseIdx + k] : 0;
                var eqT = eqId > 0 ? Meta.FindTotem(S, eqId) : null;
                bool isSelf = eqT != null && eqT.Id == t.Id;

                Ui.Box(row, new Vector2(rw + 6, rh + 6), new Vector2(0, -4), new Color(0, 0, 0, 0.45f), Art.RoundedSmall);
                Ui.Box(row, new Vector2(rw + 2, rh + 2), Vector2.zero,
                    !open ? Pal.Hex("1C2B44") : isSelf ? Pal.Hex("FFB800") : Pal.Hex("2E4E7E"), Art.RoundedSmall);
                var rbg = Ui.Box(row, new Vector2(rw - 2, rh - 2), Vector2.zero,
                    !open ? Pal.Hex("0A1020") : isSelf ? Pal.Hex("1D2B44") : Pal.Hex("131E38"), Art.RoundedSmall);
                rbg.raycastTarget = true;

                if (!open)
                {
                    Ui.Box(row, new Vector2(64, 64), new Vector2(-176, 0), Pal.Hex("1E2D46"), Art.Hex6);
                    Ui.SingleLine(Ui.Label(row, $"通关主线第 <color=#FFC83D>{Meta.TotemSocketUnlockCleared[k]}</color> 关解锁", 26, Pal.Hex("8CA6C6"),
                        new Vector2(44, 0), new Vector2(348, 50), TextAnchor.MiddleLeft, Fonts.Heavy), 19);
                }
                else if (eqT != null)
                {
                    Slot(row, TotemSlot(eqT.Rarity), 88, new Vector2(-176, 0));
                    Ui.Icon(row, Meta.TotemIcon(eqT), 70, new Vector2(-176, 2));
                    Ui.SingleLine(Ui.Label(row, Meta.TotemEffectText(eqT, true), 23, Pal.Hex("EAF2FF"),
                        new Vector2(48, 18), new Vector2(348, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 17);
                    Ui.SingleLine(Ui.Label(row, $"{Meta.TotemRarityNames[eqT.Rarity]} · 攻击 +{Meta.TotemAtk(eqT)}", 20, QualInk(eqT.Rarity),
                        new Vector2(48, -24), new Vector2(348, 30), TextAnchor.MiddleLeft, Fonts.Heavy), 16);
                }
                else
                {
                    Ui.Box(row, new Vector2(74, 74), new Vector2(-176, 0), Pal.Hex("0C1428"), Art.RoundedSmall);
                    Ui.Label(row, "+", 44, Pal.Hex("00E5FF"), new Vector2(-176, 2), new Vector2(74, 74), TextAnchor.MiddleCenter, Fonts.Heavy);
                    Ui.SingleLine(Ui.Label(row, $"{Meta.Equips[t.Slot].Name} 空镶嵌槽 · 可镶嵌", 22, Pal.Hex("8CA6C6"),
                        new Vector2(48, 0), new Vector2(348, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
                }
            }

            root.SetAsLastSibling();
            Tween.Pop(wrap, 0.2f);
        }

        // ---------------- 天罡战氅（寨主披风） ----------------

        public static void Cloak(Transform layer, Action changed = null)
        {
            Modal(layer, "cloak", "镇村军大衣", new Vector2(880, 960), out var p, Pal.Hex("2C6E9E"));
            int lv = S.CloakLv;
            Ui.Skin(p, "dark", new Vector2(800, 340), new Vector2(0, 210), 1f);
            Ui.Box(p, new Vector2(300, 300), new Vector2(-210, 210), Pal.Azure.A(0.42f), Art.SoftDot);
            var ic = Ui.Icon(p, "eq_cloak", 240, new Vector2(-210, 214));
            Tween.Run(ic, 999f, k => ic.rectTransform.anchoredPosition = new Vector2(-210, 214 + 5f * Mathf.Sin(k * 999f * 2.2f)));

            Ui.SingleLine(Ui.Outlined(p, lv > 0 ? $"镇村军大衣 · Lv.{lv}/{Meta.CloakMax}" : "镇村军大衣 · 未缝制", 36, Pal.Champagne,
                new Vector2(140, 290), new Vector2(440, 50), Pal.Ink, 2.2f, TextAnchor.MiddleLeft), 24);
            Ui.Label(p, $"当前加成：\n防线生命 <color=#7CE898>+{Meta.CloakWallBonus(lv) * 100:0}%</color>\n全村最终伤害 <color=#7CE898>+{Meta.CloakDmgBonus(lv) * 100:0}%</color>",
                28, Pal.Cream, new Vector2(140, 175), new Vector2(430, 140), TextAnchor.MiddleLeft, Fonts.Heavy);

            if (lv < Meta.CloakMax)
            {
                Ui.SingleLine(Ui.Label(p, $"下一阶：防线生命 <color=#00F57A>+{Meta.CloakWallBonus(lv + 1) * 100:0}%</color> · 全村伤害 <color=#00F57A>+{Meta.CloakDmgBonus(lv + 1) * 100:0}%</color>",
                    28, Pal.Hex("EAF2FF"), new Vector2(0, -20), new Vector2(780, 50), TextAnchor.MiddleCenter, Fonts.Heavy), 20);
                int sc = Meta.CloakSilkCost(lv), cc = Meta.CloakCopperCost(lv);
                Ui.Icon(p, "ic_silk", 64, new Vector2(-250, -130));
                Ui.Label(p, $"{Ui.Num(S.Silk)}/{sc}", 30, S.Silk >= sc ? Pal.Hex("00F57A") : Pal.Hex("FF5E54"), new Vector2(-120, -130), new Vector2(200, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
                Ui.Icon(p, "ic_coins", 64, new Vector2(90, -130));
                Ui.Label(p, $"{Ui.Num(S.Copper)}/{Ui.Num(cc)}", 30, S.Copper >= cc ? Pal.Hex("00F57A") : Pal.Hex("FF5E54"), new Vector2(230, -130), new Vector2(220, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
                bool can = Meta.CanCloakUp(S);
                Ui.Btn(p, lv == 0 ? "缝制大衣" : "升阶大衣", new Vector2(360, 118), new Vector2(0, -290), can ? Pal.Gold : Pal.Slate, () =>
                {
                    float before = Meta.TeamPower(S);
                    if (!Meta.UpgradeCloak(S))
                    {
                        Sfx.Play(Snd.Deny);
                        Ui.Toast(S.Silk < sc ? "防弹布不足：关卡宝箱、巡村、供销社获取" : "金币不足", 200);
                        return;
                    }
                    Save();
                    Sfx.Play(Snd.Unlock);
                    Cloak(layer, changed);
                    MetaFx.StatUp(layer, "战力", before, Meta.TeamPower(S));
                    changed?.Invoke();
                }, 42);
            }
            else Ui.Outlined(p, "大衣已臻满阶", 42, Pal.Champagne, new Vector2(0, -220), new Vector2(500, 64), Pal.Ink, 2.5f);
        }

        // ---------------- 村长属性总览 ----------------

        public static void LordStats(Transform layer)
        {
            var lo = Meta.BuildLoadout(S);
            Modal(layer, "lordStats", "村长属性总览", new Vector2(860, 940), out var p);
            (string k, string v)[] lines =
            {
                ("村长基础攻击力", $"<color=#00E5FF>{lo.Atk:0}</color>"),
                ("全村最终增伤", $"<color=#00F57A>+{(lo.DmgMul - 1f) * 100:0.#}%</color>"),
                ("全村攻击速度", $"<color=#00F57A>+{(lo.AllSpeed - 1f) * 100:0.#}%</color>"),
                ("全村暴击率 / 暴伤", $"<color=#00E5FF>{lo.Crit * 100:0.#}%</color> / <color=#00E5FF>{lo.CritDmg * 100:0}%</color>"),
                ("防线生命 / 减伤", $"<color=#00F57A>+{(lo.WallMul - 1f) * 100:0.#}%</color> / <color=#00F57A>{lo.WallResist * 100:0.#}%</color>"),
                ("全村集合声波", $"<color=#FFB800>{lo.LordPct * 100:0}% × {lo.LordHits}道（冷却 {lo.LordCd:0.#}s）</color>"),
                ("对精英 / 首领加成", $"<color=#00F57A>+{(lo.EliteDmg - 1f) * 100:0.#}%</color> / <color=#00F57A>+{(lo.BossDmg - 1f) * 100:0.#}%</color>"),
                ("前3波 / 受控敌军加成", $"<color=#00F57A>+{lo.EarlyWaveDmg * 100:0.#}%</color> / <color=#00F57A>+{lo.ControlDmg * 100:0.#}%</color>"),
                ("开局额外能量币", $"<color=#FFB800>+{lo.StartCoins}</color>"),
            };
            Ui.Skin(p, "modal_well", new Vector2(784, 680), new Vector2(0, 32), 1f);
            for (int i = 0; i < lines.Length; i++)
            {
                float y = 328 - i * 74;
                Ui.Skin(p, "row", new Vector2(756, 64), new Vector2(0, y), 0.50f);
                Ui.Label(p, lines[i].k, 26, WarmTitle, new Vector2(-148, y), new Vector2(400, 52), TextAnchor.MiddleLeft, Fonts.Heavy);
                Ui.Label(p, lines[i].v, 27, WarmTitle, new Vector2(148, y), new Vector2(400, 52), TextAnchor.MiddleRight, Fonts.Heavy);
            }
            Ui.Btn(p, "确定", new Vector2(280, 96), new Vector2(0, -376), Pal.Teal, () => Close((RectTransform)layer.Find("modal_lordStats")), 36);
        }

        // ---------------- 心愿好汉选择（50% 定向 UP） ----------------

        public static void WishPicker(Transform layer, Action changed = null)
        {
            var m = Modal(layer, "wish", "心愿乡亲 · 定向摇人", new Vector2(980, 1340), out var p, Pal.Hex("C88A22"));
            Ui.Label(p, "选定 1 位史诗或传说乡亲作为心愿目标：摇人出对应品质时，<color=#FFB800>50% 概率必中心愿乡亲！</color>",
                26, Pal.Hex("8CA6C6"), new Vector2(0, 568), new Vector2(880, 52), TextAnchor.MiddleCenter, Fonts.Heavy);

            var cands = new List<HeroId>();
            foreach (var d in Defs.Heroes)
            {
                if (d.Rarity == 4 && Meta.OrangeOpened(S)) cands.Add(d.Id);
                else if (d.Rarity == 3) cands.Add(d.Id);
            }
            cands.Sort((a, b) => Defs.Hero(b).Rarity != Defs.Hero(a).Rarity ? Defs.Hero(b).Rarity.CompareTo(Defs.Hero(a).Rarity) : a.CompareTo(b));

            const float cw = 206f, ch = 264f, rowH = 282f;
            var content = ScrollList(p, 900, 510, -520, ((cands.Count + 3) / 4) * rowH + 24);
            var curWish = Meta.GetWish(S);
            for (int i = 0; i < cands.Count; i++)
            {
                var h = cands[i];
                var d = Defs.Hero(h);
                bool sel = curWish.HasValue && curWish.Value == h;
                var cell = TopChild(content, "w" + i, -148 - (i / 4) * rowH, new Vector2(cw, ch));
                cell.anchoredPosition = new Vector2(((i % 4) - 1.5f) * 220, -148 - (i / 4) * rowH);
                if (sel) Ui.Box(cell, new Vector2(cw + 16, ch + 16), Vector2.zero, Pal.Gold, Art.Rounded);
                var face = Card(cell, RarityCard(d.Rarity), new Vector2(cw, ch), Vector2.zero);
                Ui.Icon(cell, d.Art, 180, new Vector2(0, 22));
                Ui.Outlined(cell, d.Name, 28, Color.white, new Vector2(0, -96), new Vector2(cw, 40), Pal.Ink, 2f);
                if (sel) Badge(cell, "心愿UP", Pal.Gold, new Vector2(104, 38), new Vector2(0, 108), 22);
                var pick = h;
                Ui.Tap(face, () =>
                {
                    Meta.SetWish(S, sel ? (HeroId?)null : pick);
                    Save();
                    Close(m);
                    changed?.Invoke();
                    Ui.Toast(sel ? "已取消心愿乡亲" : $"已设定心愿：{d.Name}（同品质 50% UP）", 200);
                }, cell);
            }
            if (!Meta.OrangeOpened(S))
                Ui.Label(p, $"提示：通关主线第 {Meta.OrangeOpen} 关后，可选定传说乡亲进入心愿池", 24, Pal.Muted, new Vector2(0, -585), new Vector2(860, 38), TextAnchor.MiddleCenter, Fonts.Heavy);
        }

        // ---------------- 神宠寻宝结果揭晓 ----------------

        public static void TotemPullResult(Transform layer, List<TotemData> pulls, Action again)
        {
            int n = pulls.Count;
            RectTransform root = null;
            root = MetaFx.Overlay(layer, "totemPulls", 0.95f, () => MetaFx.Dismiss(root), 0.42f);
            var nightTint = Ui.Fill(root, new Color(0.05f, 0.04f, 0.14f, 0.92f), false, "nightTint");
            nightTint.SetSiblingIndex(1);
            Ui.Box(root, new Vector2(1280, 1120), new Vector2(0, 120), Pal.Hex("9B5CE8").A(0.24f), Art.SoftDot, "halo");
            MetaFx.Confetti(root, n > 1 ? 38 : 20);
            MetaFx.GoldBanner(root, n > 1 ? "累计寻宝" : "神宠寻宝", new Vector2(0, n > 1 ? 580 : 450), 700);
            Ui.Outlined(root, n >= 10 ? $"本轮破译 <color=#58F27E>{n}</color> 枚盲盒 · 额外获赠 <color=#FFE066>改装芯片 ×1</color>" : "外星盲盒破译 · 获得护村神宠徽章",
                26, Pal.Hex("EEF5FC"), new Vector2(0, (n > 1 ? 580 : 450) - 92), new Vector2(860, 40), Pal.Ink, 1.8f);
            Sfx.Play(Snd.Jackpot, 0.78f);

            int maxPerRow = n <= 4 ? Mathf.Max(1, n) : 5;
            int rows = (n + maxPerRow - 1) / maxPerRow;
            float sz = n == 1 ? 236f : 164f;
            float stepX = n == 1 ? 0f : 196f;
            float stepY = 256f;
            float cy = n == 1 ? 70f : 130f;

            for (int i = 0; i < n; i++)
            {
                var t = pulls[i];
                int r = i / maxPerRow, col = i % maxPerRow;
                int inRow = Mathf.Min(maxPerRow, n - r * maxPerRow);
                var pos = n == 1 ? new Vector2(0, cy) : new Vector2((col - (inRow - 1) * 0.5f) * stepX, cy + ((rows - 1) * 0.5f - r) * stepY);
                var cell = Ui.Rect(root, "tp" + i);
                cell.anchoredPosition = pos;
                cell.sizeDelta = new Vector2(sz, sz + 66);
                if (t.Rarity >= 2)
                    Ui.Box(cell, new Vector2(sz * 1.45f, sz * 1.45f), new Vector2(0, 20), TotemRarityColor(t.Rarity).A(0.48f), Art.SoftDot);
                string slotSkin = TotemSlot(t.Rarity);
                var sFace = Slot(cell, slotSkin, sz, new Vector2(0, 20));
                Ui.Icon(cell, Meta.TotemIcon(t), sz * 0.78f, new Vector2(0, 22));
                if (n > 1)
                {
                    var partBox = Ui.Box(cell, new Vector2(38, 38), new Vector2(-sz * 0.5f + 27, 20 - sz * 0.5f + 27), new Color(0.1f, 0.16f, 0.24f, 0.84f), Art.RoundedSmall);
                    Ui.Icon(partBox.transform, Meta.Equips[t.Slot].Icon, 30, Vector2.zero);
                }
                Badge(cell, Meta.TotemRarityNames[t.Rarity], TotemRarityColor(t.Rarity), new Vector2(88, 34), new Vector2(0, 20 + sz * 0.5f - 10), 20);
                string pullLabel = n == 1 ? Meta.TotemFullName(t) : Meta.BeastNames[t.Beast];
                Ui.SingleLine(Ui.Outlined(cell, pullLabel, n == 1 ? 30 : 20, Color.white, new Vector2(0, -sz * 0.5f - 6), new Vector2(n == 1 ? 580f : 188f, 36), Pal.Ink, 1.8f), 16);
                if (n == 1)
                    Ui.SingleLine(Ui.Outlined(cell, Meta.TotemEffectText(t), 26, Pal.Hex("FFE488"), new Vector2(0, -sz * 0.5f - 48), new Vector2(760, 40), Pal.Ink, 1.8f), 20);
                var tCopy = t;
                Ui.Tap(sFace, () => Ui.Hint(cell, Meta.TotemFullName(tCopy), Meta.TotemEffectText(tCopy)), cell);
                Tween.Pop(cell, 0.28f, 0.06f + i * 0.045f);
            }

            float btnY = n > 1 ? -460f : -330f;
            var btns = Ui.Rect(root, "btns");
            btns.anchoredPosition = new Vector2(0, btnY);
            if (again != null)
            {
                Ui.Btn(btns, "收入囊中", new Vector2(296, 114), new Vector2(-176, 0), Pal.Azure, () => MetaFx.Dismiss(root), 38);
                bool hasHam = S.Hammers >= n;
                string costIcon = hasHam ? "ic_hammer" : "ic_ingot";
                string costStr = hasHam ? $"{S.Hammers}/{n}" : (n >= 10 ? $"{Meta.TotemPullIngot10}（九折）" : Meta.TotemPullIngot1.ToString());
                Ui.SubBtn(btns, n > 1 ? "再寻十次" : "再寻一次", costIcon, costStr,
                    new Vector2(320, 114), new Vector2(174, 0), Pal.Gold, () =>
                    {
                        MetaFx.Dismiss(root);
                        again.Invoke();
                    }, 36, 22);
            }
            else
            {
                Ui.Btn(btns, "收入囊中", new Vector2(320, 114), Vector2.zero, Pal.Gold, () => MetaFx.Dismiss(root), 40);
            }

            var hintTxt = Ui.Outlined(root, "点击空白处关闭", 25, Pal.Hex("C8DCF0").A(0.8f),
                new Vector2(0, btnY - 88f), new Vector2(500, 36), Pal.Ink, 1.5f);
            Tween.Run(hintTxt, 999f, k => hintTxt.color = Pal.Hex("C8DCF0").A(0.45f + 0.35f * Mathf.Sin(k * 999f * 3f)));
        }
    }
}
