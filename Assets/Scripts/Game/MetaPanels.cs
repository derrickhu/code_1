using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace Liangshan
{
    /// <summary>关卡宝箱卡片、道具说明、关卡列表、章节宝箱、聚义宴、天书、杏黄旗、装备箱。</summary>
    public static partial class MetaUi
    {
        static readonly Color CardFace = Pal.Hex("FCF8F0"), CardEdge = Pal.Hex("587E99"), CardInk = Pal.Hex("3B2F24");

        /// <summary>轻量浮层：全屏透明挡板点一下就收起，卡片挂在 card 下。</summary>
        static RectTransform Popover(Transform layer, string key, out RectTransform card, Vector2 size, Vector2 pos)
        {
            var old = layer.Find("pop_" + key);
            if (old) Object.DestroyImmediate(old.gameObject);
            var root = Ui.Rect(layer, "pop_" + key);
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var hit = Ui.Fill(root, new Color(0, 0, 0, 0.001f), true, "hit");
            var r = root;
            Ui.Tap(hit.GetComponent<Image>(), () => { if (r) Object.Destroy(r.gameObject); }, null, false);
            card = Ui.Rect(root, "card");
            card.sizeDelta = size;
            card.anchoredPosition = pos;
            var face = Ui.Skin(card, "panel", size + new Vector2(28, 30), new Vector2(0, -1), 0.78f, null, "face");
            face.raycastTarget = true;
            root.SetAsLastSibling();
            card.localScale = Vector3.one * 0.85f;
            var c = card;
            Tween.Run(c, 0.18f, k => c.localScale = Vector3.one * Mathf.Lerp(0.85f, 1f, Tween.OutBack(k)));
            return root;
        }

        static Vector2 LocalOf(Transform layer, Transform t) => ((RectTransform)layer).InverseTransformPoint(t.position);

        static Vector2 ClampX(Transform layer, Vector2 pos, float halfW)
        {
            float w = ((RectTransform)layer).rect.width * 0.5f - 16;
            pos.x = Mathf.Clamp(pos.x, -w + halfW, w - halfW);
            return pos;
        }

        // ---------------- 关卡三宝箱 ----------------

        /// <summary>参考视频：点关卡宝箱，在箱子上方弹一张「宝箱奖励」小卡，写条件和箱里的道具，道具能点开看说明。</summary>
        public static void LevelChestCard(Transform layer, int level, int k, Transform chest)
        {
            var items = Meta.LevelChestReward(level, k).Items;
            int cols = items.Count <= 4 ? 2 : 3, rows = (items.Count + cols - 1) / cols;
            const float cell = 112, gap = 10;
            var size = new Vector2(cols * cell + (cols - 1) * gap + 44, rows * cell + (rows - 1) * gap + 128);
            var at = LocalOf(layer, chest);
            var pos = ClampX(layer, at + new Vector2(0, size.y * 0.5f + 80), size.x * 0.5f);
            Popover(layer, "chest", out var card, size, pos);
            var tip = Ui.Box(card, new Vector2(30, 30), new Vector2(Mathf.Clamp(at.x - pos.x, -size.x * 0.5f + 30, size.x * 0.5f - 30), -size.y * 0.5f - 2), CardEdge, Art.RoundedSmall, "tip");
            tip.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            tip.transform.SetSiblingIndex(1);
            var tip2 = Ui.Box(card, new Vector2(24, 24), new Vector2(tip.rectTransform.anchoredPosition.x, -size.y * 0.5f + 2), CardFace, Art.RoundedSmall, "tip2");
            tip2.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            float top = size.y * 0.5f;
            Ui.Label(card, "宝箱奖励", 32, CardInk, new Vector2(0, top - 34), new Vector2(size.x, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            bool got = Meta.LevelChestGot(S, level, k);
            Ui.Label(card, $"条件：{Meta.LevelChestCond[k]}" + (got ? "  <color=#1E8A48>已获得</color>" : ""), 24, Pal.SubInk,
                new Vector2(0, top - 74), new Vector2(size.x, 36), TextAnchor.MiddleCenter, Fonts.Heavy);
            float gx = -(cols - 1) * (cell + gap) * 0.5f, gy = top - 104 - cell * 0.5f;
            var layerT = layer;
            for (int i = 0; i < items.Count; i++)
            {
                var t = ItemTile(card, items[i], new Vector2(gx + (i % cols) * (cell + gap), gy - (i / cols) * (cell + gap)), cell - 8, false, layerT);
                if (got) foreach (var g in t.GetComponentsInChildren<Image>()) g.color = g.color.Mul(0.8f);
            }
        }

        /// <summary>对标参考图3「洗炼石」暖金顶栏圆角道具详情卡：上层品质色横幅（框住图标+名称+道具副标），下层白瓷底说明与来源。</summary>
        public static void ItemTip(Transform layer, Item it, Transform anchor)
        {
            var info = CurInfo(it);
            var size = new Vector2(740, 340);
            var at = anchor != null ? LocalOf(layer, anchor) : Vector2.zero;
            var pos = ClampX(layer, new Vector2(at.x * 0.35f, Mathf.Clamp(at.y + 230f, -220f, 340f)), size.x * 0.5f);
            var root = Popover(layer, "tip", out var card, size, pos);
            root.Find("hit").GetComponent<Image>().color = new Color(0.02f, 0.05f, 0.1f, 0.42f);

            string sk = SlotSkin(it);
            int tier = sk == "slot_red" ? 4 : sk == "slot_orange" ? 3 : sk == "slot_purple" ? 2 : sk == "slot_blue" ? 1 : 0;
            Color headCol = sk == "slot_wood" ? Pal.Hex("B8874D") : QualBanner(tier);
            Color strokeCol = sk == "slot_wood" ? Pal.Hex("3B240E") : QualStroke(tier);
            Ui.Box(card, size + new Vector2(8, 8), Vector2.zero, Pal.Hex("FAF8F2"), Art.Rounded);
            Ui.Box(card, new Vector2(size.x, 168), new Vector2(0, size.y * 0.5f - 84), headCol, Art.Rounded);
            Ui.Box(card, new Vector2(size.x, 36), new Vector2(0, size.y * 0.5f - 150), headCol, Art.White);
            Ui.Box(card, new Vector2(size.x, size.y - 168), new Vector2(0, -84), Pal.Hex("F6F3EC"), Art.Rounded);
            Ui.Box(card, new Vector2(size.x, 24), new Vector2(0, size.y * 0.5f - 180), Pal.Hex("F6F3EC"), Art.White);
            Ui.Box(card, new Vector2(size.x, 3), new Vector2(0, size.y * 0.5f - 168), headCol.Mul(0.82f), Art.White);

            // 左侧统一雕花品质方框图标
            var iconPos = new Vector2(-size.x * 0.5f + 104, size.y * 0.5f - 84);
            Slot(card, sk, 136, iconPos);
            if (it.Cur == Cur.Shard)
            {
                var mask = Ui.Rect(card, "bustMask");
                mask.sizeDelta = Vector2.one * 104f;
                mask.anchoredPosition = iconPos + new Vector2(0, 1);
                mask.gameObject.AddComponent<RectMask2D>();
                Ui.Icon(mask, CurIcon(it), 100, new Vector2(0, -1));
                Ui.Icon(card, "ic_shard", 42, iconPos + new Vector2(-38, 38));
            }
            else
            {
                Ui.Icon(card, CurIcon(it), 96, iconPos + new Vector2(0, 2));
            }

            Ui.SingleLine(Ui.Outlined(card, CurName(it), 40, Color.white, new Vector2(56, size.y * 0.5f - 62), new Vector2(450, 52), strokeCol, 2.4f, TextAnchor.MiddleLeft), 24);
            Ui.Outlined(card, it.Cur == Cur.Shard ? "乡亲碎片" : "物资", 26, Color.white, new Vector2(56, size.y * 0.5f - 110), new Vector2(450, 38), strokeCol, 1.8f, TextAnchor.MiddleLeft);

            Ui.Label(card, info.Desc, 27, Pal.Hex("3C3A36"), new Vector2(0, -56), new Vector2(size.x - 68, 96), TextAnchor.UpperLeft, Fonts.Bold);
            Ui.SingleLine(Ui.Label(card, $"获取途径：{info.From}", 23, Pal.Hex("2B6E9E"), new Vector2(0, -134), new Vector2(size.x - 68, 36), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
        }

        // ---------------- 关卡列表 ----------------

        public static void LevelList(Transform layer, int chapter = 0)
        {
            int maxCh = Mathf.Min(Defs.Chapters.Length, Defs.Level(Mathf.Min(Defs.LevelCount, S.Cleared + 1)).Chapter);
            if (chapter <= 0) chapter = Defs.Level(S.Selected).Chapter;
            chapter = Mathf.Clamp(chapter, 1, maxCh);
            var ch = Defs.Chapters[chapter - 1];
            float ph = Mathf.Min(1500, Ui.Height - Ui.SafeTop - 240);
            var m = Modal(layer, "levels", $"第{chapter}章 · {ch.Name}", new Vector2(960, ph), out var p);
            float top = ph * 0.5f;
            if (chapter > 1) ArrowIn(p, new Vector2(-396, top - 66), -1, () => LevelList(layer, chapter - 1));
            if (chapter < maxCh) ArrowIn(p, new Vector2(396, top - 66), 1, () => LevelList(layer, chapter + 1));
            int stars = Meta.ChapterStars(S, chapter);
            Ui.Icon(p, "ic_star", 44, new Vector2(-284, top - 66));
            Bar(p, new Vector2(-28, top - 66), new Vector2(436, 26), stars / 30f, Pal.Gold, $"本章星数 {stars}/30");
            var chBoxBtn = Ui.Rect(p, "chapStarChest");
            chBoxBtn.anchoredPosition = new Vector2(252, top - 66);
            chBoxBtn.sizeDelta = new Vector2(78, 78);
            var chBoxIc = Ui.Icon(chBoxBtn, "ic_chest_gold", 66, Vector2.zero);
            bool chCan = false;
            for (int k = 0; k < 3; k++) if (Meta.CanOpenChest(S, chapter, k)) chCan = true;
            if (chCan) Dot(chBoxBtn, new Vector2(26, 26));
            int chNo = chapter;
            var chBoxHit = Ui.Box(chBoxBtn, new Vector2(88, 84), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            Ui.Tap(chBoxHit, () => ChapterChests(layer, chNo), chBoxIc.transform);

            float wellTop = top - 116f;
            float wellBot = -top + 48f;
            Ui.Skin(p, "modal_well", new Vector2(900, wellTop - wellBot + 14f), new Vector2(0, (wellTop + wellBot) * 0.5f), 1f);
            float rowH = Mathf.Min(116, (wellTop - wellBot - 12f) / Defs.LevelsPerChapter);
            for (int i = 0; i < Defs.LevelsPerChapter; i++)
            {
                int n = (chapter - 1) * Defs.LevelsPerChapter + i + 1;
                var st = Defs.Level(n);
                bool open = n <= S.Cleared + 1, sel = n == S.Selected;
                var r = Ui.Rect(p, "lv" + n);
                r.anchoredPosition = new Vector2(0, wellTop - 6f - rowH * 0.5f - i * rowH);
                r.sizeDelta = new Vector2(876, rowH - 8);
                string rSkin = sel ? "row_claim" : open ? "row" : "row_done";
                var face = Ui.Skin(r, rSkin, new Vector2(876, rowH - 8), Vector2.zero, 0.85f);
                var bd = Defs.Enemy(st.LeaderKind);
                var ic = Ui.Icon(r, bd.Art, rowH - 22, new Vector2(-376, 0));
                if (!open) ic.color = new Color(0.28f, 0.30f, 0.34f, 0.75f);
                Ui.SingleLine(Ui.Label(r, $"{n}. {st.Name}", 31, open ? WarmTitle : WarmSub, new Vector2(-108, 15), new Vector2(400, 42), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
                Ui.SingleLine(Ui.Label(r, st.IsChapterBoss ? $"章节首领 · {bd.Name}" : $"{st.Waves} 波 · 统领 {bd.Name}", 23, WarmSub, new Vector2(-108, -22), new Vector2(400, 34), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
                if (open)
                    for (int k = 0; k < 3; k++)
                    {
                        bool got = Meta.LevelChestGot(S, n, k);
                        bool ready = Meta.CanOpenLevelChest(S, n, k);
                        float x = 204 + k * 76;
                        var c = Ui.Icon(r, got ? ChestOpenArt(k) : ChestArt(k), 66, new Vector2(x, 4));
                        if (got) Check(r, new Vector2(x + 18, -18), 28);
                        else if (ready) Dot(c.transform, new Vector2(22, 22));
                        else c.color = new Color(1, 1, 1, 0.45f);
                    }
                else Ui.Icon(r, "ic_lock", 48, new Vector2(346, 0));
                int pick = n;
                Ui.Tap(face, () =>
                {
                    if (pick > S.Cleared + 1) { Ui.Toast("先通关前一关", 200); return; }
                    S.Selected = pick;
                    Save();
                    Close(m);
                }, r);
            }
        }

        static void ArrowIn(Transform p, Vector2 pos, int dir, Action act)
        {
            var b = Ui.Icon(p, "ui/arrow", 80, pos, "arrow");
            if (dir > 0) b.rectTransform.localScale = new Vector3(-1, 1, 1);
            Ui.Tap(b, act);
        }

        public static string ChestArt(int k) => k == 0 ? "ic_chest_wood" : k == 1 ? "ic_chest_silver" : "ic_chest_gold";

        public static string ChestOpenArt(int k) => k == 0 ? "ic_chest_wood_open" : k == 1 ? "ic_chest_silver_open" : "ic_chest_open";

        public static string ChestOpenArt(string closedArt) =>
            closedArt == "ic_chest_wood" ? "ic_chest_wood_open"
            : closedArt == "ic_chest_silver" ? "ic_chest_silver_open"
            : "ic_chest_open";

        /// <summary>已领取：绿底白勾，压在宝箱右下角。</summary>
        public static void Check(Transform p, Vector2 pos, float size)
        {
            Ui.Icon(p, "ic_check", size + 6f, pos, "check");
        }

        // ---------------- 章节星级宝箱 ----------------

        public static void ChapterChests(Transform layer, int chapter)
        {
            var ch = Defs.Chapters[chapter - 1];
            Modal(layer, "chapterChest", "章节星级宝箱", new Vector2(920, 740), out var p, Pal.Gold);
            int stars = Meta.ChapterStars(S, chapter);
            Ui.Label(p, $"第{chapter}章 · {ch.Name}", 32, WarmTitle, new Vector2(0, 250), new Vector2(800, 44), TextAnchor.MiddleCenter, Fonts.Heavy);

            Ui.Skin(p, "quest_tray", new Vector2(836, 410), new Vector2(0, 6), 1f);
            Ui.Icon(p, "ic_star", 60, new Vector2(-346, 134));
            Bar(p, new Vector2(36, 134), new Vector2(648, 28), stars / 30f, Pal.Gold, $"{stars}/30");

            for (int k = 0; k < 3; k++)
            {
                float x = (k - 1) * 260;
                bool got = (S.ChestClaimed[chapter - 1] & (1 << k)) != 0;
                bool can = Meta.CanOpenChest(S, chapter, k);
                var c = Ui.Rect(p, "chBox" + k);
                c.anchoredPosition = new Vector2(x, -36);
                c.sizeDelta = new Vector2(180, 210);
                string boxSlot = k == 2 ? "slot_orange" : k == 1 ? "slot_blue" : "slot_wood";
                var sl = Slot(c, boxSlot, 148, new Vector2(0, 18));
                if (got) sl.color = new Color(0.84f, 0.84f, 0.84f, 0.85f);
                var ic = Ui.Icon(c, got ? ChestOpenArt(k) : ChestArt(k), 106, new Vector2(0, 20));
                Ui.Label(c, $"{Meta.ChestStars[k]} 星", 28, can ? Pal.Hex("B85C08") : WarmTitle, new Vector2(0, -82), new Vector2(160, 36), TextAnchor.MiddleCenter, Fonts.Heavy);
                if (got) Check(c, new Vector2(46, -28), 38);
                if (can)
                {
                    Dot(c, new Vector2(62, 78));
                    Tween.Run(ic, 999f, kk => ic.transform.localRotation = Quaternion.Euler(0, 0, 7f * Mathf.Sin(kk * 999f * 8f)));
                }
                int ck = k;
                Ui.Tap(sl, () =>
                {
                    if (!Meta.CanOpenChest(S, chapter, ck)) { Chest(layer, chapter, ck); return; }
                    var got2 = Meta.OpenChest(S, chapter, ck);
                    Save();
                    ChapterChests(layer, chapter);
                    ShowRewards(layer, $"{Meta.ChestStars[ck]} 星宝箱", got2);
                }, c);
            }
            Ui.Label(p, "满血通关得 3 星 · 半血 2 星 · 通关 1 星", 24, WarmSub, new Vector2(0, -258), new Vector2(800, 38), TextAnchor.MiddleCenter, Fonts.Heavy);
        }

        // ---------------- 聚义宴 ----------------

        static readonly string[] MealNames = { "早席包子", "午席铁锅炖", "晚席烧大鹅", "夜宵撸烤串" };

        public static void Meals(Transform layer)
        {
            int hour = DateTime.Now.Hour;
            Modal(layer, "meals", "村委流水席", new Vector2(900, 1000), out var p, Pal.Gold);
            Ui.Skin(p, "quest_tray", new Vector2(816, 188), new Vector2(0, 318), 1f);
            Ui.Icon(p, "ic_feast", 120, new Vector2(-300, 318));
            Ui.Label(p, "幸福村每日四顿大锅饭", 26, WarmTitle, new Vector2(78, 362), new Vector2(560, 36), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(p, "错过的饭点当天均可免费补领", 26, WarmTitle, new Vector2(78, 322), new Vector2(560, 36), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(p, $"每顿补充体力 +{Meta.MealStamina}", 24, Pal.GreenDeep, new Vector2(78, 280), new Vector2(560, 34), TextAnchor.MiddleLeft, Fonts.Heavy);

            Ui.Skin(p, "modal_well", new Vector2(820, 514), new Vector2(0, -40), 1f);
            for (int i = 0; i < Meta.MealHours.Length; i++)
            {
                bool taken = (S.Meals & (1 << i)) != 0, ready = hour >= Meta.MealHours[i] && !taken;
                var r = Ui.Rect(p, "meal" + i);
                r.anchoredPosition = new Vector2(0, 142 - i * 122);
                r.sizeDelta = new Vector2(796, 112);
                Ui.Skin(r, ready ? "row_claim" : taken ? "row_done" : "row", new Vector2(796, 112), Vector2.zero);
                Slot(r, "slot_wood", 86, new Vector2(-334, 0));
                Ui.Icon(r, "ic_feast", 68, new Vector2(-334, 2));
                Ui.Label(r, $"{MealNames[i]}  {Meta.MealHours[i]:00}:00", 31, taken ? WarmSub : WarmTitle, new Vector2(-106, 0), new Vector2(320, 48), TextAnchor.MiddleLeft, Fonts.Heavy);
                Ui.Label(r, $"体力 +{Meta.MealStamina}", 28, Pal.GreenDeep, new Vector2(126, 0), new Vector2(190, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
                if (taken)
                {
                    Check(r, new Vector2(248, 0), 34);
                    Ui.Label(r, "已享用", 26, WarmSub, new Vector2(352, 0), new Vector2(108, 40), TextAnchor.MiddleLeft, Fonts.Heavy);
                }
                else if (ready)
                    Badge(r, "可开席", Pal.Gold, new Vector2(138, 54), new Vector2(308, 0), 25);
                else
                    Ui.Label(r, "未到饭点", 25, WarmSub, new Vector2(308, 0), new Vector2(150, 40), TextAnchor.MiddleCenter, Fonts.Heavy);
            }
            int n = Meta.MealsReady(S, hour);
            var btn = Ui.Btn(p, n > 0 ? "立即开席" : "还没到饭点", new Vector2(356, 108), new Vector2(0, -384), n > 0 ? Pal.Gold : Pal.Slate, () =>
            {
                int got = Meta.EatMeals(S, DateTime.Now.Hour);
                if (got <= 0) { Ui.Toast("还没到饭点", 200); return; }
                Save();
                Meals(layer);
                ShowRewards(layer, "村委流水席", new List<Item> { new Item(Cur.Stamina, got) });
            }, 40);
            if (n > 0) Dot(btn, new Vector2(162, 42));
        }

        // ---------------- 广播秘籍 ----------------

        public static void Tome(Transform layer, Action changed = null)
        {
            float ph = Mathf.Min(1560, Ui.Height - Ui.SafeTop - 240);
            Modal(layer, "tome", "村委广播秘籍", new Vector2(980, ph), out var p, Pal.Hex("5A3A8A"));
            float top = ph * 0.5f;
            var lo = Meta.BuildLoadout(S);
            Ui.Skin(p, "dark", new Vector2(900, 120), new Vector2(0, top - 116), 1f);
            Ui.SingleLine(Ui.Outlined(p, $"{Defs.LordSkillName}：每 {lo.LordCd:0.#} 秒 · {lo.LordPct * 100:0}% 攻击力 · 连轰 {lo.LordHits} 道", 30, Pal.Champagne,
                new Vector2(0, top - 96), new Vector2(860, 44), Pal.Ink, 2f), 20);
            Ui.SingleLine(Ui.Label(p, $"全村伤害 {HeroText.O($"+{(lo.DmgMul - 1f) * 100:0.#}%")}（含流动红旗）", 24, Pal.Cream, new Vector2(0, top - 140), new Vector2(860, 36), TextAnchor.MiddleCenter, Fonts.Heavy), 18);

            // 上卷：手稿研读
            float y = top - 250;
            Ui.Label(p, "上卷 · 研读", 32, Pal.Ink, new Vector2(-300, y), new Vector2(300, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(p, $"Lv.{S.PageLv}/{Meta.PageMax}", 30, Pal.Azure, new Vector2(340, y), new Vector2(200, 44), TextAnchor.MiddleRight, Fonts.Heavy);
            var up = Ui.Rect(p, "upper");
            up.anchoredPosition = new Vector2(0, y - 120);
            up.sizeDelta = new Vector2(880, 180);
            Ui.Skin(up, "row", new Vector2(880, 180), Vector2.zero);
            Slot(up, "slot_wood", 130, new Vector2(-360, 10));
            Ui.Icon(up, "ic_page", 94, new Vector2(-360, 12));
            Ui.SingleLine(Ui.Label(up, $"每级：{Defs.LordSkillName}伤害 +{Meta.PageLord * 100:0}%，全村伤害 +{Meta.PageDmg * 100:0.#}%", 26, Pal.Ink, new Vector2(64, 46), new Vector2(688, 40), TextAnchor.MiddleLeft, Fonts.Heavy), 19);
            Ui.SingleLine(Ui.Label(up, $"当前：声波 +{S.PageLv * Meta.PageLord * 100:0}%，全村 +{S.PageLv * Meta.PageDmg * 100:0.#}%", 24, Pal.SubInk, new Vector2(-20, 6), new Vector2(520, 36), TextAnchor.MiddleLeft), 18);
            if (S.PageLv < Meta.PageMax)
            {
                int pc = Meta.PageCost(S.PageLv), cc = Meta.PageCopper(S.PageLv);
                Ui.SingleLine(Ui.Label(up, $"广播手稿 {Ui.Num(S.Pages)}/{pc}    金币 {Ui.Num(S.Copper)}/{Ui.Num(cc)}", 24,
                    S.Pages >= pc && S.Copper >= cc ? Pal.GreenDeep : Pal.Hex("D04848"), new Vector2(-20, -40), new Vector2(520, 36), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
                bool can = Meta.CanPage(S);
                var b = Ui.Btn(up, "研读", new Vector2(170, 84), new Vector2(340, -30), can ? Pal.Azure : Pal.Slate, () =>
                {
                    float before = Meta.TeamPower(S);
                    if (!Meta.LearnPage(S)) { Sfx.Play(Snd.Deny); Ui.Toast(S.Pages < Meta.PageCost(S.PageLv) ? "广播手稿不足：主线关卡宝箱获得" : "金币不足", 200); return; }
                    Save();
                    Sfx.Play(Snd.Unlock, 0.8f);
                    Tome(layer, changed);
                    MetaFx.StatUp(layer, "战力", before, Meta.TeamPower(S));
                    changed?.Invoke();
                }, 34);
                if (can) Dot(b, new Vector2(80, 36));
            }
            else Ui.Outlined(up, "已研读圆满", 30, Pal.Champagne, new Vector2(330, -30), new Vector2(220, 44), Pal.Ink, 2f);

            // 下卷：守村秘籍参悟
            y -= 300;
            Ui.Label(p, "下卷 · 参悟", 32, Pal.Ink, new Vector2(-300, y), new Vector2(300, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(p, $"守村秘籍 {S.Tomes}", 28, Pal.Azure, new Vector2(320, y), new Vector2(260, 44), TextAnchor.MiddleRight, Fonts.Heavy);
            float rowH = Mathf.Min(150, (y + top - 60) / Meta.TomeNodes.Length);
            for (int i = 0; i < Meta.TomeNodes.Length; i++)
            {
                var nd = Meta.TomeNodes[i];
                bool on = i < S.TomeNodes, next = i == S.TomeNodes;
                var r = Ui.Rect(p, "node" + i);
                r.anchoredPosition = new Vector2(0, y - 50 - rowH * 0.5f - i * rowH);
                r.sizeDelta = new Vector2(880, rowH - 12);
                Ui.Skin(r, on ? "row_claim" : next ? "row" : "row_done", new Vector2(880, rowH - 12), Vector2.zero, 1f);
                var hx = MetaFx.Hex(r, "ic_tome", rowH - 30, new Vector2(-370, 0), !on && !next, on ? 4 : 2);
                Ui.SingleLine(Ui.Label(r, nd.Name, 30, on ? Pal.Hex("9E580C") : WarmTitle, new Vector2(-60, 18), new Vector2(460, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
                Ui.SingleLine(Ui.Label(r, nd.Desc, 23, WarmSub, new Vector2(-60, -20), new Vector2(460, 36), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
                if (on)
                {
                    Check(r, new Vector2(292, 0), 34);
                    Ui.Label(r, "已参悟", 26, Pal.Hex("9E580C"), new Vector2(354, 0), new Vector2(120, 40), TextAnchor.MiddleLeft, Fonts.Heavy);
                }
                else if (next)
                {
                    bool can = Meta.CanTome(S);
                    var b = Ui.Btn(r, $"参悟 {nd.Cost}", new Vector2(190, 80), new Vector2(330, 0), can ? Pal.Gold : Pal.Slate, () =>
                    {
                        float before = Meta.TeamPower(S);
                        if (!Meta.LearnTome(S)) { Sfx.Play(Snd.Deny); Ui.Toast("守村秘籍不足：第 5、10、15…关满血宝箱获得", 200); return; }
                        Save();
                        Sfx.Play(Snd.Unlock);
                        Tome(layer, changed);
                        MetaFx.TalentUp(layer, "ic_tome", nd.Name);
                        MetaFx.StatUp(layer, "战力", before, Meta.TeamPower(S));
                        changed?.Invoke();
                    }, 30, "ic_tome");
                    if (can) Dot(b, new Vector2(86, 34));
                }
                else Ui.Label(r, $"需 {nd.Cost} 本", 26, Pal.Hex("8A8A90"), new Vector2(340, 0), new Vector2(180, 40), TextAnchor.MiddleCenter, Fonts.Heavy);
            }
        }

        // ---------------- 护村流动红旗 ----------------

        public static void Flag(Transform layer, Action changed = null)
        {
            float ph = Mathf.Min(1560, Ui.Height - Ui.SafeTop - 240);
            Modal(layer, "flag", "全村荣耀 · 流动红旗", new Vector2(980, ph), out var p, Pal.Hex("B9862C"));
            float top = ph * 0.5f;
            int lv = S.FlagLv;
            Ui.Skin(p, "dark", new Vector2(900, 300), new Vector2(0, top - 190), 1f);
            Ui.Box(p, new Vector2(300, 300), new Vector2(-300, top - 190), Pal.Gold.A(0.45f), Art.SoftDot);
            var fi = Ui.Icon(p, "ic_flag", 250, new Vector2(-300, top - 186));
            if (lv <= 0) fi.color = new Color(0.45f, 0.45f, 0.5f);
            Tween.Run(fi, 999f, k => fi.transform.localRotation = Quaternion.Euler(0, 0, 3f * Mathf.Sin(k * 999f * 2f)));
            Ui.Outlined(p, lv > 0 ? $"Lv.{lv}/{Meta.FlagMax}" : "未打造", 40, Color.white, new Vector2(120, top - 80), new Vector2(500, 56), Pal.Ink, 2.5f);
            Ui.Label(p, $"防线生命 {HeroText.O($"+{Meta.FlagWall(lv) * 100:0}%")}\n旗技·守村：防线首次跌破半血，震慑全场外星军 {HeroText.O($"{Meta.FlagStunSec(Mathf.Max(1, lv)):0.#}")} 秒（首领减半）",
                24, Pal.Cream, new Vector2(120, top - 186), new Vector2(520, 120), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(p, $"词条位 {Meta.FlagSlots(lv)}/{Meta.FlagSlotsMax}（升阶解锁）", 24, Pal.Hex("FFE7B0"), new Vector2(120, top - 284), new Vector2(520, 36), TextAnchor.MiddleLeft, Fonts.Heavy);

            float y = top - 390;
            Ui.Label(p, "锦旗词条", 32, Pal.Ink, new Vector2(-300, y), new Vector2(300, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(p, "点锁头锁定，洗练时保留", 22, Pal.SubInk, new Vector2(240, y), new Vector2(400, 36), TextAnchor.MiddleRight);
            float rowH = Mathf.Min(110, (y + top - 330) / Meta.FlagSlotsMax);
            int slots = Meta.FlagSlots(lv);
            for (int i = 0; i < Meta.FlagSlotsMax; i++)
            {
                var r = Ui.Rect(p, "affix" + i);
                r.anchoredPosition = new Vector2(0, y - 40 - rowH * 0.5f - i * rowH);
                r.sizeDelta = new Vector2(880, rowH - 10);
                bool open = i < slots, has = Meta.AffixOf(S, i, out int kind, out int q);
                Ui.Skin(r, open ? "row" : "row_done", new Vector2(880, rowH - 10), Vector2.zero, 0.8f);
                if (open && has)
                {
                    var qc = QualityColor(q);
                    Badge(r, Meta.QualityName[q], qc, new Vector2(120, 48), new Vector2(-350, 0), 24);
                    Ui.Label(r, Meta.AffixText(kind, q), 30, QualInk(q), new Vector2(-30, 0), new Vector2(480, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
                    bool locked = (S.FlagLock & (1 << i)) != 0;
                    var lk = Ui.Icon(r, "ic_lock", 64, new Vector2(370, 0));
                    lk.color = locked ? Color.white : new Color(1, 1, 1, 0.3f);
                    int si = i;
                    Ui.Tap(lk, () => { Meta.ToggleLock(S, si); Save(); Flag(layer, changed); });
                }
                else Ui.Label(r, $"流动红旗 Lv.{(i == 0 ? 1 : 2 * i)} 解锁", 26, Pal.Muted, Vector2.zero, new Vector2(600, 40), TextAnchor.MiddleCenter, Fonts.Heavy);
            }

            float by = -top + 110;
            if (lv < Meta.FlagMax)
            {
                int mc = Meta.FlagMeteor(lv), cc = Meta.FlagCopper(lv);
                Ui.Label(p, $"飞碟核心 {S.Meteor}/{mc}  金币 {Ui.Num(S.Copper)}/{Ui.Num(cc)}", 22, S.Meteor >= mc && S.Copper >= cc ? Pal.GreenDeep : Pal.Hex("D04848"),
                    new Vector2(-230, by + 82), new Vector2(420, 32), TextAnchor.MiddleCenter, Fonts.Heavy);
                bool can = Meta.CanFlagUp(S);
                var b = Ui.Btn(p, lv <= 0 ? "打造" : "升阶", new Vector2(300, 112), new Vector2(-230, by), can ? Pal.Green : Pal.Slate, () =>
                {
                    float before = Meta.TeamPower(S);
                    if (!Meta.FlagUp(S, new Rng(Environment.TickCount))) { Sfx.Play(Snd.Deny); Ui.Toast(S.Meteor < Meta.FlagMeteor(S.FlagLv) ? "飞碟核心不足：第 5、10、15…关满血宝箱获得" : "金币不足", 200); return; }
                    Save();
                    Sfx.Play(Snd.Forge);
                    Flag(layer, changed);
                    MetaFx.StatUp(layer, "战力", before, Meta.TeamPower(S));
                    changed?.Invoke();
                }, 42, "ic_meteor");
                if (can) Dot(b, new Vector2(140, 46));
            }
            else Ui.Outlined(p, "已升到顶阶", 36, Pal.Champagne, new Vector2(-230, by), new Vector2(300, 60), Pal.Ink, 2f);
            int rc = Meta.RerollCost(S);
            Ui.Label(p, $"防弹布 {Ui.Num(S.Silk)}/{rc}", 22, S.Silk >= rc ? Pal.GreenDeep : Pal.Hex("D04848"), new Vector2(230, by + 82), new Vector2(360, 32), TextAnchor.MiddleCenter, Fonts.Heavy);
            bool cr = Meta.CanReroll(S);
            Ui.Btn(p, "洗练", new Vector2(300, 112), new Vector2(230, by), cr ? Pal.Azure : Pal.Slate, () =>
            {
                float before = Meta.TeamPower(S);
                if (S.FlagLv <= 0) { Ui.Toast("先打造流动红旗", 200); return; }
                if (!Meta.Reroll(S, new Rng(Environment.TickCount))) { Sfx.Play(Snd.Deny); Ui.Toast(S.Silk < Meta.RerollCost(S) ? "防弹布不足：关卡宝箱、巡村、供销社获得" : "词条全锁了", 200); return; }
                Save();
                Sfx.Play(Snd.Merge, 0.8f);
                Flag(layer, changed);
                var fp = layer.Find("modal_flag/panel");
                if (fp) MetaFx.Burst(fp, new Vector2(0, -100), 10, 300);
                MetaFx.StatUp(layer, "战力", before, Meta.TeamPower(S));
                changed?.Invoke();
            }, 42, "ic_silk");
        }

        // ---------------- 装备箱 ----------------

        public static void GearBox(Transform layer, Action changed = null)
        {
            float before = Meta.TeamPower(S);
            var d = Meta.OpenGearBox(S, new Rng(Environment.TickCount));
            if (d == null) { Ui.Toast("没有工具箱：主线关卡满血宝箱获得", 200); return; }
            Save();
            var g = d.Value;
            var e = Meta.Equips[g.Slot];
            Modal(layer, "gearbox", "开启五金工具箱", new Vector2(860, 820), out var p, Pal.Hex("3A6A9A"));
            Ui.Box(p, new Vector2(360, 360), new Vector2(0, 170), QualityColor(g.Quality).A(0.5f), Art.SoftDot);
            Slot(p, QualitySlot(g.Quality), 230, new Vector2(0, 170));
            var ic = Ui.Icon(p, e.Icon, 162, new Vector2(0, 172));
            Tween.Pop(ic.transform, 0.4f, 0.1f);
            var qc = QualityColor(g.Quality);
            Ui.SingleLine(Ui.Outlined(p, $"{Meta.QualityName[g.Quality]} · {e.Name}", 46, qc, new Vector2(0, 0), new Vector2(700, 60), Pal.Ink, 3f), 28);
            Ui.SingleLine(Ui.Label(p, g.Upgraded ? $"已换上！{e.Name}属性 +{Meta.QualityBonus[g.Quality] * 100:0}%" : $"不如身上的{Meta.QualityName[S.EquipQ[g.Slot]]}{e.Name}，回收成合金钢 ×{g.Iron}",
                30, Pal.Ink, new Vector2(0, -70), new Vector2(780, 50), TextAnchor.MiddleCenter, Fonts.Heavy), 20);
            Ui.SingleLine(Ui.Label(p, "品质：精良 +15% · 史诗 +30% · 传说 +50%（乘在强化属性上）", 22, Pal.SubInk, new Vector2(0, -130), new Vector2(780, 36)), 17);
            if (S.GearBoxes > 0)
                Ui.Btn(p, $"再开一个（{S.GearBoxes}）", new Vector2(400, 110), new Vector2(0, -260), Pal.Gold, () => GearBox(layer, changed), 38, "ic_gearbox");
            else Ui.Btn(p, "好的", new Vector2(300, 110), new Vector2(0, -260), Pal.Azure, () => Close((RectTransform)layer.Find("modal_gearbox")), 40);
            Sfx.Play(g.Upgraded ? Snd.Unlock : Snd.Coin);
            if (g.Upgraded)
            {
                MetaFx.Burst(p, new Vector2(0, 170), 14, 320, qc);
                float after = Meta.TeamPower(S);
                if (after > before) MetaFx.StatUp(layer, "战力", before, after);
            }
            changed?.Invoke();
        }

        // ---------------- 村口小卖部（互助工分每周半价定向换已拥有乡亲碎片） ----------------

        public static void Tavern(Transform layer, Action changed = null)
        {
            float ph = Mathf.Min(1480, Ui.Height - Ui.SafeTop - 260);
            Modal(layer, "tavern", "村口小卖部 · 工分兑换", new Vector2(960, ph), out var p, Pal.Hex("2B769E"));
            float top = ph * 0.5f;
            int cred = Meta.RecruitCredits(S);
            Ui.Skin(p, "dark", new Vector2(890, 108), new Vector2(0, top - 110), 1f);
            Ui.Icon(p, "ic_credit", 74, new Vector2(-396, top - 108));
            Ui.SingleLine(Ui.Outlined(p, $"互助工分：<color=#FFE066>{cred}</color>", 31, Color.white, new Vector2(-184, top - 108), new Vector2(328, 44), Pal.Ink, 2f, TextAnchor.MiddleLeft), 20);
            Ui.SingleLine(Ui.Label(p, "每摇人1次赠10工分 · 每周每位前10片享5折", 21, Pal.Hex("B8D8EE"), new Vector2(174, top - 108), new Vector2(496, 40), TextAnchor.MiddleRight, Fonts.Heavy), 17);

            var owned = new System.Collections.Generic.List<HeroId>();
            for (int h = 0; h < Defs.HeroCount; h++)
                if (Meta.Owned(S, (HeroId)h)) owned.Add((HeroId)h);
            owned.Sort((a, b) =>
            {
                bool la = Array.IndexOf(S.Lineup, (int)a) >= 0, lb = Array.IndexOf(S.Lineup, (int)b) >= 0;
                if (la != lb) return la ? -1 : 1;
                int r = Defs.Hero(b).Rarity.CompareTo(Defs.Hero(a).Rarity);
                return r != 0 ? r : S.HeroLv[(int)b].CompareTo(S.HeroLv[(int)a]);
            });

            float viewH = ph - 228f;
            Ui.Skin(p, "modal_well", new Vector2(906, viewH + 16f), new Vector2(0, top - 178f - viewH * 0.5f), 1f);
            var view = Ui.Rect(p, "view");
            view.anchorMin = view.anchorMax = new Vector2(0.5f, 1f);
            view.pivot = new Vector2(0.5f, 1f);
            view.sizeDelta = new Vector2(890, viewH);
            view.anchoredPosition = new Vector2(0, -178);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");
            const float rowH = 136f;
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(890, Mathf.Max(viewH, owned.Count * rowH + 20f));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Elastic;

            for (int i = 0; i < owned.Count; i++)
            {
                var h = owned[i];
                var d = Defs.Hero(h);
                int lv = S.HeroLv[(int)h];
                int need = Meta.ShardCost(lv);
                int price = Meta.NextShardCreditPrice(S, h);
                int halfLeft = Meta.HalfLeft(S, h);
                var r = Ui.Rect(content, "row_" + h);
                r.anchorMin = r.anchorMax = new Vector2(0.5f, 1f);
                r.sizeDelta = new Vector2(876, 126);
                r.anchoredPosition = new Vector2(0, -70 - i * rowH);
                Ui.Skin(r, lv >= Meta.MaxHeroLv ? "row_done" : "row", new Vector2(876, 126), Vector2.zero);
                Slot(r, RaritySlot(d.Rarity), 96, new Vector2(-372, 1));
                var mask = Ui.Rect(r, "bustMask");
                mask.sizeDelta = Vector2.one * 74f;
                mask.anchoredPosition = new Vector2(-372, 2);
                mask.gameObject.AddComponent<RectMask2D>();
                Ui.Icon(mask, d.Art, 72, new Vector2(0, -1));
                Ui.Label(r, $"{d.Name}  Lv.{lv}", 29, WarmTitle, new Vector2(-132, 26), new Vector2(310, 38), TextAnchor.MiddleLeft, Fonts.Heavy);
                Bar(r, new Vector2(-178, -22), new Vector2(216, 22), Mathf.Clamp01(S.Shards[(int)h] / (float)Mathf.Max(1, need)), Pal.Azure, $"{S.Shards[(int)h]}/{need}");
                Ui.Label(r, halfLeft > 0 ? $"本周半价剩 {halfLeft} 片" : "原价兑换", 21, halfLeft > 0 ? Pal.GreenDeep : WarmSub,
                    new Vector2(68, -22), new Vector2(210, 30), TextAnchor.MiddleLeft, Fonts.Heavy);
                bool can1 = cred >= price && lv < Meta.MaxHeroLv;
                var hCopy = h;
                Ui.Btn(r, lv >= Meta.MaxHeroLv ? "已满级" : $"兑1片({price})", new Vector2(212, 78), new Vector2(312, 0),
                    can1 ? (halfLeft > 0 ? Pal.Gold : Pal.Teal) : Pal.Slate, () =>
                    {
                        if (!Meta.BuyHeroShardWithCredits(S, hCopy, 1))
                        {
                            Sfx.Play(Snd.Deny);
                            Ui.Toast("互助工分不足：敲锣摇人每抽赠 10 工分", 200);
                            return;
                        }
                        Save();
                        Sfx.Play(Snd.Coin, 0.85f);
                        Tavern(layer, changed);
                        changed?.Invoke();
                    }, 28);
            }
        }

        // ---------------- 战前敌情与抗性预览 ----------------

        public static void StageEnemies(Transform layer, LevelDef st)
        {
            var b = new Battle(1, Meta.Lineup(S), st);
            var list = b.StageRoster();
            float rowH = 140f;
            float ph = Mathf.Clamp(list.Count * rowH + 220f, 640f, Mathf.Min(1440f, Ui.Height - Ui.SafeTop - 260f));
            Modal(layer, "stageEnemies", st.Title, new Vector2(920, ph), out var p, Pal.Hex("2C6E98"));
            float top = ph * 0.5f;

            // 阵容克制自检提醒
            var lu = Meta.Lineup(S);
            bool hasFly = false, hasArmor = false, hasRange = false, hasMagic = false;
            foreach (var k in list)
            {
                var ed = Defs.Enemy(k);
                if (ed.Flying) hasFly = true;
                if (ed.PhysResist >= 0.25f) hasArmor = true;
            }
            foreach (var h in lu)
            {
                var hd = Defs.Hero(h);
                if (!hd.Melee && hd.Carry) hasRange = true;
                if (!hd.Physical && hd.Carry) hasMagic = true;
            }
            string advice = hasFly && !hasRange ? "<color=#D94436>提示：本关有空中飞碟，建议至少上阵 1 位射手/奇人！</color>"
                : hasArmor && !hasMagic ? "<color=#D67E18>提示：本关重甲减免物理伤害，上阵电/火/风系奇人更轻松！</color>"
                : st.BuffRole.HasValue ? $"<color=#1E9438>本关推荐：{st.BuffText}</color>" : "阵容完备，可随时守村迎战！";
            Ui.Label(p, advice, 25, Pal.Ink, new Vector2(0, top - 82), new Vector2(850, 42), TextAnchor.MiddleCenter, Fonts.Heavy);

            for (int i = 0; i < list.Count; i++)
            {
                var d = Defs.Enemy(list[i]);
                float y = top - 168f - i * rowH;
                if (y < -top + 70f) break;
                var r = Ui.Rect(p, "en_" + i);
                r.anchoredPosition = new Vector2(0, y);
                r.sizeDelta = new Vector2(860, 128);
                Ui.Skin(r, "row", new Vector2(860, 128), Vector2.zero);
                Ui.Icon(r, d.Art, 100, new Vector2(-364, 4));
                const int nameSize = 30;
                float textLeft = -300f;
                float nameW = nameSize * d.Name.Length + 4f;
                var name = Ui.Label(r, d.Name, nameSize, Pal.Ink, new Vector2(textLeft + nameW * 0.5f, 28), new Vector2(nameW, 40), TextAnchor.MiddleLeft, Fonts.Heavy);
                name.horizontalOverflow = HorizontalWrapMode.Overflow;
                var tags = EnemyText.Tags(d);
                if (d.Big) tags.Insert(0, (EnemyText.RankName(d), EnemyText.RankColor(d)));
                float tagLeft = textLeft + nameW + 10f;
                foreach (var (text, color) in tags)
                {
                    float tw = 24f * text.Length + 24f;
                    if (tagLeft + tw > 400f) break;
                    var tg = Ui.Box(r, new Vector2(tw, 32), new Vector2(tagLeft + tw * 0.5f, 28), color, Art.RoundedSmall);
                    Ui.Outlined(tg.transform, text, 18, Color.white, new Vector2(0, 1), new Vector2(tw, 32), color.Mul(0.45f), 1.2f);
                    tagLeft += tw + 6f;
                }
                var body = Ui.Label(r, EnemyText.SheetBody(d), 22, Pal.SubInk, new Vector2(textLeft + 340f, -36), new Vector2(680, 76), TextAnchor.UpperLeft, Fonts.Heavy);
                body.lineSpacing = 0.92f;
            }
        }

        // ---------------- 阵容羁绊一览 ----------------

        public static void BondTip(Transform layer, HeroId[] lineup)
        {
            Modal(layer, "bonds", "邻里羁绊", new Vector2(880, 920), out var p, Pal.Hex("2A749E"));
            int roleN = Defs.DistinctRoles(lineup, out _);
            float roleB = Defs.RoleSynergyBonus(lineup);
            Ui.Skin(p, "dark", new Vector2(810, 130), new Vector2(0, 300), 1f);
            Ui.Outlined(p, $"异职同心（当前上阵 {roleN} 种职业）", 30, Pal.Champagne, new Vector2(0, 324), new Vector2(760, 42), Pal.Ink, 1.8f);
            Ui.Label(p, $"2职 +3% · 3职 +7% · 4职 +12%   当前生效：<color=#7CF29A>+{(int)(roleB * 100)}%</color>",
                24, Pal.Cream, new Vector2(0, 276), new Vector2(760, 38), TextAnchor.MiddleCenter, Fonts.Heavy);

            Ui.Skin(p, "modal_well", new Vector2(828, 680), new Vector2(0, -124), 1f);
            for (int i = 0; i < Defs.Bonds.Length; i++)
            {
                var bd = Defs.Bonds[i];
                bool on = Array.IndexOf(lineup, bd.A) >= 0 && Array.IndexOf(lineup, bd.B) >= 0;
                float y = 166 - i * 94;
                var r = Ui.Rect(p, "bond" + i);
                r.anchoredPosition = new Vector2(0, y);
                r.sizeDelta = new Vector2(804, 84);
                Ui.Skin(r, on ? "row_claim" : "row", new Vector2(804, 84), Vector2.zero, 0.6f);
                Ui.SingleLine(Ui.Label(r, $"「{bd.Name}」{Defs.Hero(bd.A).Name} + {Defs.Hero(bd.B).Name}", 25, on ? Pal.Hex("9E580C") : WarmTitle,
                    new Vector2(-190, 0), new Vector2(384, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 19);
                Ui.SingleLine(Ui.Label(r, bd.Desc + (on ? "  ★生效中" : ""), 22, on ? Pal.GreenDeep : WarmSub,
                    new Vector2(194, 0), new Vector2(372, 44), TextAnchor.MiddleRight, Fonts.Heavy), 17);
            }
        }
    }
}
