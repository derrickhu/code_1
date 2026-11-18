using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace Liangshan
{
    /// <summary>局外通用部件和弹窗：奖励格、红点、弹窗框，签到/任务/巡山/图鉴/设置/挑战/补给/招募结果/好汉详情/锻造。</summary>
    public static partial class MetaUi
    {
        static SaveData S => Profile.S;

        // ---------------- 全游唯一权威五阶品质色系与皮肤（0=普通银灰, 1=稀有/精良晶蓝, 2=史诗星紫, 3=传说鎏金, 4=绝世赤金） ----------------

        public static Color RoleColor(Role r) => Pal.Hex(Defs.RoleColors[(int)r]).Mul(0.85f);

        public static int HeroTier(int r) => Mathf.Clamp(r - 1, 0, 4);

        public static Color QualColor(int tier) =>
            tier >= 4 ? Pal.Hex("E44836") : tier == 3 ? Pal.Hex("EEA622") : tier == 2 ? Pal.Hex("905CE8") : tier == 1 ? Pal.Hex("3B95EA") : Pal.Hex("8395A7");

        public static Color QualInk(int tier) =>
            tier >= 4 ? Pal.Hex("B5281A") : tier == 3 ? Pal.Hex("B56E06") : tier == 2 ? Pal.Hex("6735B8") : tier == 1 ? Pal.Hex("1A67B5") : Pal.Hex("4D5E70");

        public static string QualInkHex(int tier) =>
            tier >= 4 ? "B5281A" : tier == 3 ? "B56E06" : tier == 2 ? "6735B8" : tier == 1 ? "1A67B5" : "4D5E70";

        public static Color QualGlow(int tier) =>
            tier >= 4 ? Pal.Hex("FF907A") : tier == 3 ? Pal.Hex("FFE27A") : tier == 2 ? Pal.Hex("CFA8FF") : tier == 1 ? Pal.Hex("7CC6FF") : Pal.Hex("CBD8E6");

        public static Color QualBanner(int tier) =>
            tier >= 4 ? Pal.Hex("D84030") : tier == 3 ? Pal.Hex("E29B1E") : tier == 2 ? Pal.Hex("8452DC") : tier == 1 ? Pal.Hex("388CE0") : Pal.Hex("72869A");

        public static Color QualStroke(int tier) =>
            tier >= 4 ? Pal.Hex("48100A") : tier == 3 ? Pal.Hex("4A2804") : tier == 2 ? Pal.Hex("2E155C") : tier == 1 ? Pal.Hex("123A68") : Pal.Hex("243240");

        public static string QualSlot(int tier) =>
            tier >= 4 ? "slot_red" : tier == 3 ? "slot_orange" : tier == 2 ? "slot_purple" : tier == 1 ? "slot_blue" : "slot_grey";

        public static string QualCard(int tier) =>
            tier >= 4 ? "card_red" : tier == 3 ? "card_orange" : tier == 2 ? "card_purple" : tier == 1 ? "card_blue" : "card_grey";

        public static string QualEqCard(int tier) =>
            tier >= 4 ? "eqcard_red" : tier == 3 ? "eqcard_orange" : tier == 2 ? "eqcard_purple" : tier == 1 ? "eqcard_blue" : "eqcard_grey";

        public static Color RarityColor(int r) => QualColor(HeroTier(r));
        public static string RarityName(int r) => r >= 5 ? "绝世" : r == 4 ? "传说" : r == 3 ? "史诗" : "稀有";

        public static string CurIcon(Item it)
        {
            switch (it.Cur)
            {
                case Cur.Ingot: return "ic_ingot";
                case Cur.Copper: return "ic_coins";
                case Cur.Iron: return "ic_iron";
                case Cur.Token: return "ic_token";
                case Cur.Stamina: return "ic_wine";
                case Cur.Page: return "ic_page";
                case Cur.Tome: return "ic_tome";
                case Cur.Silk: return "ic_silk";
                case Cur.Meteor: return "ic_meteor";
                case Cur.GearBox: return "ic_gearbox";
                case Cur.AnyShard: return "ic_anyshard";
                case Cur.Refine: return "ic_refine";
                case Cur.Hammer: return "ic_hammer";
                default: return Defs.Hero(it.Hero).Art;
            }
        }

        public static string CurName(Item it)
        {
            switch (it.Cur)
            {
                case Cur.Ingot: return "星钻";
                case Cur.Copper: return "金币";
                case Cur.Iron: return "合金钢";
                case Cur.Token: return "大喇叭券";
                case Cur.Stamina: return "体力";
                case Cur.Page: return "广播手稿";
                case Cur.Tome: return "守村秘籍";
                case Cur.Silk: return "防弹布";
                case Cur.Meteor: return "飞碟核心";
                case Cur.GearBox: return "五金工具箱";
                case Cur.AnyShard: return "万能碎片";
                case Cur.Refine: return "改装芯片";
                case Cur.Hammer: return "破译扳手";
                default: return Defs.Hero(it.Hero).Name + "碎片";
            }
        }

        /// <summary>道具说明和来源（点道具弹的小卡片）。</summary>
        public static (string Desc, string From) CurInfo(Item it)
        {
            switch (it.Cur)
            {
                case Cur.Ingot: return ("高纯度外星能量晶钻，可在村口供销社兑换大喇叭券、破译扳手、改装芯片等物资", "关卡宝箱、每日任务、签到、外星图鉴");
                case Cur.Copper: return ("乡亲升级、装备强化、激活潜能与秘籍研读的基础经费", "主线通关、巡村收益、截获补给、宝箱");
                case Cur.Iron: return ("改装强化老村长六大部位护村装备，提升全村核心战力", "主线通关、巡村收益、民兵比武、装备回收");
                case Cur.Token: return ("在【敲锣摇人】中召集幸福村乡亲，支持设定心愿乡亲定向 UP", "首通奖励、每日活跃、七日目标、村口供销社");
                case Cur.Stamina: return ("守村迎战、民兵比武与关卡扫荡消耗的解暑大碗茶", "随时间自动恢复、村委流水席、村口供销社");
                case Cur.Page: return ("研读【村委广播秘籍·上卷】，永久提升全村集合声波伤害与全村伤害", "主线关卡 50% 血量 / 满血通关宝箱");
                case Cur.Tome: return ("参悟【村委广播秘籍·下卷】，解锁全村集合多道连轰与眩晕特效", "主线第 5、10、15…关满血通关宝箱");
                case Cur.Silk: return ("高强凯夫拉防护布，用于升阶【镇村军大衣】及洗练【流动红旗】词条", "主线关卡宝箱、巡村收益、村口供销社");
                case Cur.Meteor: return ("缴获的外星反重力核心，用于打造与升阶【流动红旗】解锁更多词条槽", "主线第 5、10、15…关满血通关宝箱");
                case Cur.GearBox: return ("开启随机获得 1 件高品质村长装备（最高传说品质，低阶自动回收为合金钢）", "主线满血宝箱、活跃宝箱、七日目标");
                case Cur.AnyShard: return ("随机转化为当前出战阵容中某位乡亲的升级碎片", "主线关卡宝箱、活跃宝箱、摇人冲刺");
                case Cur.Refine: return ("精密外星集成芯片，可重铸【史诗】及以上品质神宠徽章的加成词条", "活跃宝箱、章节星级宝箱、村口供销社");
                case Cur.Hammer: return ("多功能液压破译扳手，可在【供销社·神宠寻宝】中破译盲盒获取高阶神宠徽章", "章节星级宝箱、活跃宝箱、村口供销社");
                default: return ($"用于提升乡亲【{Defs.Hero(it.Hero).Name}】等级，解锁爆发词条、被动与全村暴伤加成", "主线通关、敲锣摇人、签到、关卡宝箱");
            }
        }

        static string SlotSkin(Item it)
        {
            switch (it.Cur)
            {
                case Cur.Ingot: case Cur.Tome: case Cur.Meteor: case Cur.Refine: return "slot_orange";
                case Cur.Copper: case Cur.Page: return "slot_wood";
                case Cur.Iron: return "slot_grey";
                case Cur.Token: case Cur.AnyShard: case Cur.Silk: case Cur.Hammer: return "slot_purple";
                case Cur.Stamina: case Cur.GearBox: return "slot_blue";
                default: return RaritySlot(Defs.Hero(it.Hero).Rarity);
            }
        }

        public static string QualitySlot(int q) => QualSlot(q);
        public static Color QualityColor(int q) => QualColor(q);
        public static string QualityEqCard(int q) => QualEqCard(q);

        public static string RaritySlot(int r) => QualSlot(HeroTier(r));
        public static string RarityCard(int r) => QualCard(HeroTier(r));

        /// <summary>高清厚涂雕花方格，按 176px 基准等比贴合四角包角与边框。</summary>
        public static Image Slot(Transform p, string skin, float size, Vector2 pos) =>
            Ui.Skin(p, skin, Vector2.one * size, pos, size / 176f, null, "slot");

        /// <summary>高清厚涂雕花卡框，按 240px 基准等比贴合四角包角与边框。</summary>
        public static Image Card(Transform p, string skin, Vector2 size, Vector2 pos) =>
            Ui.Skin(p, skin, size, pos, size.x / 240f, null, "card");

        /// <summary>高清厚涂装备专框（含底部暗晶宝石镶座），按 200px 基准等比贴合。</summary>
        public static Image EqCard(Transform p, int q, Vector2 size, Vector2 pos) =>
            Ui.Skin(p, QualityEqCard(q), size, pos, size.x / 200f, null, "eqcard");

        /// <summary>按颜色挑高清按钮皮做小徽章（职业、稀有度、等级标签）。</summary>
        public static Image Badge(Transform p, string text, Color c, Vector2 size, Vector2 pos, int font)
        {
            var b = Ui.Skin(p, Ui.BtnSkin(c), size, pos, Mathf.Min(1f, size.y / 84f), null, "badge");
            Ui.SingleLine(Ui.Outlined(b.transform, text, font, Color.white, new Vector2(0, 1), new Vector2(Mathf.Max(24f, size.x - 10f), size.y), Pal.Ink, 1.5f), 14);
            return b;
        }

        // ---------------- 部件 ----------------

        public static RectTransform ItemTile(Transform p, Item it, Vector2 pos, float size = 150, bool label = true, Transform tipLayer = null)
        {
            var t = Ui.Rect(p, "item");
            t.anchoredPosition = pos;
            t.sizeDelta = Vector2.one * size;
            var face = Slot(t, SlotSkin(it), size + 6, Vector2.zero);
            if (tipLayer != null) Ui.Tap(face, () => ItemTip(tipLayer, it, t), t);
            if (it.Cur == Cur.Shard)
            {
                // 好汉碎片采用半身胸像裁切入框（不把全身小人缩成蚂蚁），辨识度与清晰度倍增
                var mask = Ui.Rect(t, "bustMask");
                mask.sizeDelta = Vector2.one * (size - 16f);
                mask.anchoredPosition = new Vector2(0, 1f);
                mask.gameObject.AddComponent<RectMask2D>();
                Ui.Icon(mask, CurIcon(it), size * 1.14f, new Vector2(0, -size * 0.16f));
                Ui.Icon(t, "ic_shard", size * 0.32f, new Vector2(-size * 0.29f, size * 0.29f));
            }
            else
            {
                Ui.Icon(t, CurIcon(it), size * 0.70f, new Vector2(0, size * 0.04f));
            }
            Ui.Outlined(t, Ui.Num(it.N), Mathf.Max(22, Mathf.RoundToInt(size * 0.195f)), Color.white,
                new Vector2(-size * 0.10f, -size * 0.29f), new Vector2(size * 0.84f, size * 0.28f),
                Pal.Hex("18222E"), 1.8f, TextAnchor.MiddleRight);
            if (label)
                Ui.SingleLine(Ui.Outlined(t, CurName(it), Mathf.Max(20, Mathf.RoundToInt(size * 0.165f)), Color.white,
                    new Vector2(0, -size * 0.65f), new Vector2(Mathf.Min(size * 1.34f, 184f), size * 0.25f), Pal.Ink, 1.5f), 15);
            return t;
        }

        public static void ItemRow(Transform p, List<Item> items, Vector2 center, float size, bool label = true)
        {
            float gap = size * 1.25f;
            for (int i = 0; i < items.Count; i++)
            {
                var t = ItemTile(p, items[i], center + new Vector2((i - (items.Count - 1) * 0.5f) * gap, 0), size, label);
                Tween.Pop(t, 0.3f, 0.15f + i * 0.08f);
            }
        }

        /// <summary>红点：珊瑚红宝石芯 + 纯白描边外环，尺寸克制不刺眼。</summary>
        public static Image Dot(Transform p, Vector2 pos, int n = 0)
        {
            var d = Ui.Icon(p, "ui/dot", n > 0 ? 40 : 34, pos, "dot");
            if (n > 0) Ui.Outlined(d.transform, n.ToString(), 21, Color.white, new Vector2(0, 1), new Vector2(40, 40), Pal.RedDeep, 1.4f);
            return d;
        }

        /// <summary>小号资源条：图标 + 数字。</summary>
        public static RectTransform Pill(Transform p, string icon, string text, Vector2 pos, float w = 220)
        {
            var c = Ui.Rect(p, "pill");
            c.anchoredPosition = pos;
            c.sizeDelta = new Vector2(w, 60);
            Ui.Skin(c, "pill", new Vector2(w - 20, 52), new Vector2(10, 0), -1f);
            Ui.Icon(c, icon, 70, new Vector2(-w * 0.5f + 28, 2));
            Ui.SingleLine(Ui.Outlined(c, text, 30, Color.white, new Vector2(22, 1), new Vector2(w - 70, 50), Pal.Ink, 2f, TextAnchor.MiddleCenter, "text"), 18);
            return c;
        }

        /// <summary>清爽糖果胶囊进度条：k 0..1。绿、金、冰蓝各用原生高清亮泽胶囊条，其余走白条染色。返回填充条，方便从旧进度涨到终值。</summary>
        public static RectTransform Bar(Transform p, Vector2 pos, Vector2 size, float k, Color fill, string text = null)
        {
            float pad = Mathf.Clamp(size.y * 0.22f, 5f, 8f);
            Ui.Skin(p, "bar_bg", size + new Vector2(pad * 2f, pad * 2f), pos, -1f, null, "barBg");
            k = Mathf.Clamp01(k);
            RectTransform fillRt = null;
            if (k > 0.001f)
            {
                Color.RGBToHSV(fill, out float h, out float s, out _);
                bool green = s > 0.30f && h >= 0.22f && h <= 0.45f;
                bool gold = s > 0.30f && h >= 0.08f && h <= 0.19f;
                bool azure = s > 0.28f && h >= 0.48f && h <= 0.66f;
                string fSkin = green ? "bar_green" : gold ? "bar_gold" : azure ? "bar_azure" : "bar_white";
                Color tint = (green || gold || azure) ? Color.white : fill;
                float fillW = Mathf.Max(size.y, size.x * k);
                var f = Ui.Skin(p, fSkin, new Vector2(fillW, size.y), pos, -1f, tint, "barFill");
                fillRt = f.rectTransform;
                fillRt.pivot = new Vector2(0, 0.5f);
                fillRt.anchoredPosition = pos - new Vector2(size.x * 0.5f, 0);
            }
            if (text != null)
            {
                int fs = Mathf.Clamp(Mathf.RoundToInt(size.y * 0.80f), 19, 28);
                Ui.SingleLine(Ui.Outlined(p, text, fs, Color.white, pos + new Vector2(0, 1f), size + new Vector2(24f, 8f), Pal.Hex("2E261E"), 1.7f), 15);
            }
            return fillRt;
        }

        /// <summary>好汉碎片条配色：攒碎片翠绿，够升级冰蓝（和任务可领同色），满级鎏金。</summary>
        public static Color ShardFill(bool max, bool can) => max ? Pal.Gold : can ? Pal.Hex("58C2EE") : Pal.Green;

        /// <summary>胶囊已按终值画好。立刻收成 f0，再涨到终值。宽度和 Bar 同一套。</summary>
        public static void GrowBar(RectTransform fill, float f0, float f1, float width, float height, float dur, float delay)
        {
            if (fill == null || f1 <= f0 + 0.001f) return;
            void Apply(float f) => fill.sizeDelta = new Vector2(f <= 0.001f ? 0f : Mathf.Max(height, width * f), height);
            Apply(f0);
            Tween.Run(fill, dur, k => Apply(Mathf.Lerp(f0, f1, Tween.OutCubic(k))), null, delay);
        }

        // ---------------- 弹窗框 ----------------

        /// <summary>同名弹窗再开时直接替换（数值刷新不重播弹出动画）。自动避让微信顶部安全区与胶囊。</summary>
        /// <summary>title 为 null 时不挂绶带（好汉详情这类自带抬头的弹窗）。</summary>
        public static RectTransform Modal(Transform layer, string key, string title, Vector2 size, out RectTransform panel, Color? ribbon = null, float y = -20)
        {
            var old = layer.Find("modal_" + key);
            bool again = old != null;
            if (old) Object.DestroyImmediate(old.gameObject);
            var root = Ui.Rect(layer, "modal_" + key);
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var cg = root.gameObject.AddComponent<CanvasGroup>();
            var dim = Ui.Fill(root, new Color(0.03f, 0.08f, 0.15f, 0.76f), true, "dim");
            var b = dim.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() => Close(root));

            // 微信小游戏顶部刘海/胶囊安全保护：若弹窗顶冠探入安全区，自动下移避让
            float topReserve = title != null ? 84f : 156f;
            float maxSafeY = Ui.Height * 0.5f - Ui.SafeTop - topReserve - size.y * 0.5f;
            float minSafeY = -Ui.Height * 0.5f + 28f + size.y * 0.5f;
            float safeY = maxSafeY >= minSafeY ? Mathf.Min(y, maxSafeY) : (maxSafeY + minSafeY) * 0.5f;

            panel = Ui.Panel(root, size, new Vector2(0, safeY));
            if (title != null) Ui.Ribbon(panel, title, new Vector2(0, size.y * 0.5f + 10f), Mathf.Clamp(size.x * 0.56f, 420f, 580f), ribbon);
            var r = root;
            var x = Ui.Icon(panel, "ui/close", 104, new Vector2(size.x * 0.5f - 2f, size.y * 0.5f + 2f), "close");
            Ui.Tap(x, () => Close(r), null, false);
            if (!again)
            {
                Sfx.Play(Snd.Open, 0.7f);
                Tween.Fade(cg, 0, 1, 0.14f);
                var pn = panel;
                pn.localScale = Vector3.one * 0.7f;
                Tween.Run(pn, 0.26f, k => pn.localScale = Vector3.one * Mathf.Lerp(0.7f, 1f, Tween.OutBack(k)));
            }
            root.SetAsLastSibling();
            return root;
        }

        /// <summary>收起：先改名腾出位置（马上再开同名弹窗不受影响），缩小淡出后再销毁。</summary>
        public static void Close(RectTransform modal)
        {
            if (!modal || modal.name.EndsWith("_closing")) return;
            modal.name += "_closing";
            Sfx.Play(Snd.Close, 0.6f);
            foreach (var g in modal.GetComponentsInChildren<Graphic>()) g.raycastTarget = false;
            var cg = modal.GetComponent<CanvasGroup>();
            var panel = modal.Find("panel");
            Tween.Run(modal, 0.14f, k =>
            {
                if (cg) cg.alpha = 1 - k;
                if (panel) panel.localScale = Vector3.one * Mathf.Lerp(1f, 0.85f, k);
            }, () => { if (modal) Object.Destroy(modal.gameObject); });
        }

        public static bool IsOpen(Transform layer, string key) => layer.Find("modal_" + key) != null;

        static void Save() => Profile.Save();

        // ---------------- 奖励弹窗 ----------------

        /// <summary>恭喜获得：有新好汉先全屏揭晓，再弹道具。</summary>
        public static void ShowRewards(Transform layer, string title, List<Item> items, HeroId? unlock = null, Action done = null)
        {
            void Items()
            {
                if (items.Count > 0) MetaFx.Gain(layer, title, items, done);
                else done?.Invoke();
            }
            if (unlock.HasValue) MetaFx.HeroReveal(layer, unlock.Value, Items);
            else Items();
        }

        public static void ShowRewards(Transform layer, string title, Rewards r) => ShowRewards(layer, title, r.Items, r.Unlock);

        // ---------------- 体力补给 ----------------

        public static void StaminaShop(Transform layer)
        {
            Modal(layer, "stamina", "补充体力", new Vector2(880, 790), out var p, Pal.Hex("3A8A5A"));
            Ui.Skin(p, "quest_tray", new Vector2(796, 260), new Vector2(0, 200), 1f);
            Ui.Icon(p, "ic_wine", 136, new Vector2(-280, 202));
            Ui.Label(p, $"当前体力  <color=#C85A14>{S.Stamina}</color>/{Meta.StaminaMax}", 36, WarmTitle,
                new Vector2(66, 232), new Vector2(480, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
            Bar(p, new Vector2(56, 184), new Vector2(450, 26), S.Stamina / (float)Meta.StaminaMax, Pal.Green, $"{S.Stamina}/{Meta.StaminaMax}");
            int wait = Meta.StaminaWait(S, Profile.Now);
            Ui.SingleLine(Ui.Label(p, S.Stamina >= Meta.StaminaMax ? "体力已充沛，随时可守村" : $"每5分钟回1点（下次 {wait / 60}:{wait % 60:00}）· 守村耗 {Meta.BattleStamina}",
                22, WarmSub, new Vector2(84, 134), new Vector2(516, 36), TextAnchor.MiddleLeft, Fonts.Heavy), 18);

            int adLeft = Meta.AdStaminaMax - S.AdStamina;
            Row(p, -46, "ic_ad", "看广告领体力", $"体力 +30 · 今日剩余 {adLeft} 次", adLeft > 0 ? "免费领" : "已用完", adLeft > 0 ? Pal.Green : Pal.Slate, () =>
            {
                if (S.AdStamina >= Meta.AdStaminaMax) return;
                Ads.Show("stamina", () =>
                {
                    S.AdStamina++;
                    Meta.Give(S, new Item(Cur.Stamina, 30));
                    Save();
                    StaminaShop(layer);
                    Ui.Toast("体力 +30", 200);
                });
            }, 796);
            int buyLeft = Meta.ShopStaminaMax - S.ShopStamina;
            Row(p, -196, "ic_ingot", "星钻换体力", $"体力 +60 · 消耗 80 星钻（剩 {buyLeft} 次）", buyLeft > 0 ? "兑换" : "已用完", buyLeft > 0 ? Pal.Gold : Pal.Slate, () =>
            {
                if (S.ShopStamina >= Meta.ShopStaminaMax) return;
                if (!Meta.Spend(S, Cur.Ingot, 80)) { Ui.Toast("星钻不足", 200); Sfx.Play(Snd.Deny); return; }
                S.ShopStamina++;
                Meta.Give(S, new Item(Cur.Stamina, 60));
                Save();
                StaminaShop(layer);
                Ui.Toast("体力 +60", 200);
            }, 796);
        }

        /// <summary>弹窗标准动作横条：品质框图标 + 双行暖棕清晰文案 + 右侧立体圆角钮。</summary>
        static RectTransform Row(Transform p, float y, string icon, string title, string sub, string btn, Color face, Action act, float w = 780)
        {
            var r = Ui.Rect(p, "row");
            r.anchoredPosition = new Vector2(0, y);
            r.sizeDelta = new Vector2(w, 132);
            bool goldHighlight = face == Pal.Gold || face == Pal.Green;
            Ui.Skin(r, goldHighlight ? "row" : "row_done", new Vector2(w, 132), Vector2.zero, 1f);
            string sSkin = icon == "ic_ingot" || icon == "ic_chest_gold" ? "slot_orange" : icon == "prop_drum" ? "slot_purple" : icon == "ic_ad" ? "slot_blue" : "slot_wood";
            Slot(r, sSkin, 98, new Vector2(-w * 0.5f + 68, 1));
            Ui.Icon(r, icon, 78, new Vector2(-w * 0.5f + 68, 3));
            float textLeft = -w * 0.5f + 126f;
            float textW = w - 336f;
            Ui.SingleLine(Ui.Label(r, title, 31, WarmTitle, new Vector2(textLeft + textW * 0.5f, 22), new Vector2(textW, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
            Ui.SingleLine(Ui.Label(r, sub, 23, WarmSub, new Vector2(textLeft + textW * 0.5f, -22), new Vector2(textW, 38), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
            if (btn != null) Ui.Btn(r, btn, new Vector2(182, 82), new Vector2(w * 0.5f - 112, 1), face, act, 32);
            return r;
        }

        // ---------------- 签到 ----------------

        static void BindDouyinSubscribeBtn(RectTransform btn, string scene, Action refresh)
        {
            Action<bool, string> onDone = (ok, info) =>
            {
                if (ok)
                {
                    Meta.MarkDySubscribed(S, scene, Profile.Today);
                    Save();
                    Ui.Toast("已开启订阅提醒", 200);
                    refresh?.Invoke();
                }
                else if (info == "no_tmpl_cfg")
                {
                    Ui.Toast("订阅通知模板准备中，敬请期待", 200);
                }
                else if (info == "reject")
                {
                    Ui.Toast("已取消本次订阅提醒", 180);
                }
                else
                {
                    Ui.Toast("当前环境暂未开启订阅通知", 180);
                }
            };
            DouyinBridge.BindSubscribeGesture(btn, scene, onDone);
        }

        public static void SignIn(Transform layer)
        {
            bool showDySub = DouyinBridge.IsDouyin;
            float dyLift = showDySub ? 38f : 0f;
            Modal(layer, "sign", "七日签到", new Vector2(940, showDySub ? 1110 : 1020), out var p, Pal.Gold);
            int day = Profile.Today;
            bool can = Meta.CanSign(S, day);
            Ui.Skin(p, "modal_well", new Vector2(864, 790), new Vector2(0, 26 + dyLift), 1f);
            for (int i = 0; i < Meta.SignRewards.Length; i++)
            {
                bool last = i == 6;
                var pos = last ? new Vector2(0, -252 + dyLift) : new Vector2(((i % 3) - 1) * 276, 286 - (i / 3) * 246 + dyLift);
                var size = last ? new Vector2(812, 206) : new Vector2(260, 224);
                var c = Ui.Rect(p, "day" + i);
                c.anchoredPosition = pos;
                c.sizeDelta = size;
                bool taken = i < S.SignDays;
                bool today = i == S.SignDays && can;
                string cardSkin = today ? "row_claim" : taken ? "row_done" : last ? "tab_on" : "row";
                var face = Ui.Skin(c, cardSkin, size, Vector2.zero, 1f);
                if (today)
                    Ui.Outlined(c, $"第 {i + 1} 天 · 可领", 26, Color.white, new Vector2(0, size.y * 0.5f - 28), new Vector2(240, 38), Pal.Hex("7C4408"), 1.8f);
                else
                    Ui.Label(c, $"第 {i + 1} 天", 26, taken ? WarmSub : WarmTitle, new Vector2(0, size.y * 0.5f - 28), new Vector2(240, 38), TextAnchor.MiddleCenter, Fonts.Heavy);

                var it = Meta.SignRewards[i];
                if (last)
                {
                    var sd = Defs.Hero(it.Hero);
                    Slot(c, RaritySlot(sd.Rarity), 146, new Vector2(-280, -8));
                    var mask7 = Ui.Rect(c, "bustMask");
                    mask7.sizeDelta = Vector2.one * 112f;
                    mask7.anchoredPosition = new Vector2(-280, -7);
                    mask7.gameObject.AddComponent<RectMask2D>();
                    Ui.Icon(mask7, sd.Art, 134, new Vector2(0, -14));
                    Ui.SingleLine(Ui.GradOutlined(c, $"{sd.RarityName} · {sd.Nick} {sd.Name}", 36, Color.white, Pal.Hex("FFE27A"),
                        new Vector2(68, 18), new Vector2(500, 52), Pal.Hex("4E2C08"), 2.4f, TextAnchor.MiddleLeft), 24);
                    Ui.SingleLine(Ui.Label(c, "第七天大奖：未结识直接上阵，已结识转化 20 碎片", 24, WarmTitle,
                        new Vector2(taken ? 48 : 88, -34), new Vector2(taken ? 484 : 564, 40), TextAnchor.MiddleLeft, Fonts.Heavy), 18);
                }
                else ItemTile(c, it, new Vector2(0, -14), 116, false, layer);

                if (taken)
                {
                    foreach (var img in c.GetComponentsInChildren<Image>())
                        if (img != face) img.color = img.color.Mul(0.80f);
                    Ui.Icon(c, "ic_check", 66, last ? new Vector2(336, -8) : new Vector2(78, -62));
                }
                else if (today)
                {
                    Dot(c, new Vector2(size.x * 0.5f - 16f, size.y * 0.5f - 14f));
                    Ui.Tap(face, () =>
                    {
                        bool had = it.Cur != Cur.Shard || Meta.Owned(S, it.Hero);
                        var got = Meta.Sign(S, day);
                        if (got == null) return;
                        Save();
                        SignIn(layer);
                        var g = got.Value;
                        if (!had) ShowRewards(layer, "签到奖励", new List<Item>(), g.Hero);
                        else ShowRewards(layer, "签到奖励", new List<Item> { g });
                    }, c);
                }
            }
            Ui.Label(p, can ? "点击高亮格子领取今日村委补贴" : S.SignDays >= 7 ? "七日签到已圆满领完" : "今日已签到，明日零点继续领取",
                26, WarmSub, new Vector2(0, -424 + dyLift), new Vector2(800, 40), TextAnchor.MiddleCenter, Fonts.Heavy);
            if (showDySub)
            {
                bool subbed = Meta.HasDySubSignToday(S, day);
                var subBtn = Ui.Btn(p, subbed ? "今日已设签到提醒" : "订阅明日签到提醒", new Vector2(360, 74), new Vector2(0, -464),
                    subbed ? Pal.Slate : Pal.Azure, () => DouyinBridge.RequestSubscribe("sign", (ok, info) =>
                    {
                        if (ok)
                        {
                            Meta.MarkDySubscribed(S, "sign", Profile.Today);
                            Save();
                            Ui.Toast("已开启明日签到提醒", 200);
                            if (layer != null && layer.Find("modal_sign") != null) SignIn(layer);
                        }
                        else if (info == "no_tmpl_cfg") Ui.Toast("订阅通知模板准备中，敬请期待", 200);
                        else if (info == "reject") Ui.Toast("已取消本次订阅提醒", 180);
                    }), 27);
                BindDouyinSubscribeBtn(subBtn, "sign", () =>
                {
                    if (layer != null && layer.Find("modal_sign") != null) SignIn(layer);
                });
            }
        }

        // ---------------- 巡山（挂机收益） ----------------

        public static void Idle(Transform layer)
        {
            bool showDySub = DouyinBridge.IsDouyin;
            float dyLift = showDySub ? 38f : 0f;
            Modal(layer, "idle", "巡村收益", new Vector2(920, showDySub ? 1060 : 960), out var p, Pal.Hex("3A7A9A"));
            double h = Meta.IdleHours(S, Profile.Now);
            int secs = (int)(h * 3600);

            Ui.Skin(p, "quest_tray", new Vector2(836, 300), new Vector2(0, 240 + dyLift), 1f);
            Ui.Icon(p, "tab_idle", 168, new Vector2(-286, 244 + dyLift));
            Ui.Label(p, $"已巡村  <color=#C85A14>{secs / 3600}小时{secs % 3600 / 60:00}分</color>", 36, WarmTitle,
                new Vector2(64, 292 + dyLift), new Vector2(500, 48), TextAnchor.MiddleLeft, Fonts.Heavy);
            Bar(p, new Vector2(58, 236 + dyLift), new Vector2(480, 28), (float)(h / Meta.IdleCapHours), Pal.Azure, $"上限 {Meta.IdleCapHours} 小时");
            Ui.SingleLine(Ui.Label(p, $"每小时产出：金币 {Meta.IdleCopperPerHour(S)} · 合金钢 {Meta.IdleIronPerHour(S):0.#}（随主线提升）",
                23, WarmSub, new Vector2(105, 178 + dyLift), new Vector2(582, 38), TextAnchor.MiddleLeft, Fonts.Heavy), 18);

            Ui.Skin(p, "modal_well", new Vector2(836, 236), new Vector2(0, -56 + dyLift), 1f);
            var r = Meta.IdleRewards(S, h);
            r.Items.RemoveAll(x => x.N <= 0);
            if (r.Items.Count > 0) ItemRow(p, r.Items, new Vector2(0, -44 + dyLift), 132);
            else Ui.Label(p, "联防大爷正骑三轮巡村捡外星物资，稍后再来收取", 28, WarmSub, new Vector2(0, -56 + dyLift), new Vector2(720, 56), TextAnchor.MiddleCenter, Fonts.Heavy);

            Ui.Btn(p, "领取收益", new Vector2(310, 106), new Vector2(-184, -318 + dyLift), r.Items.Count > 0 ? Pal.Gold : Pal.Slate, () =>
            {
                if (r.Items.Count == 0) { Ui.Toast("还没有收益", 200); return; }
                var got = Meta.CollectIdle(S, Profile.Now);
                Save();
                Idle(layer);
                ShowRewards(layer, "巡村收益", got);
            }, 38);
            int adLeft = Meta.AdIdleMax - S.AdIdle;
            Ui.Btn(p, adLeft > 0 ? $"快速巡村 ({adLeft})" : "明日再来", new Vector2(336, 106), new Vector2(184, -318 + dyLift), adLeft > 0 ? Pal.Green : Pal.Slate, () =>
            {
                if (S.AdIdle >= Meta.AdIdleMax) return;
                Ads.Show("idle", () =>
                {
                    S.AdIdle++;
                    var got = Meta.IdleRewards(S, 2);
                    Meta.Give(S, got);
                    Save();
                    Idle(layer);
                    ShowRewards(layer, "快速巡村（2小时）", got);
                });
            }, 34, "ic_ad");

            if (showDySub)
            {
                bool subbed = Meta.HasDySubPatrolToday(S, Profile.Today);
                var subBtn = Ui.Btn(p, subbed ? "今日已设满仓提醒" : "订阅巡村满仓提醒", new Vector2(380, 74), new Vector2(0, -424),
                    subbed ? Pal.Slate : Pal.Azure, () => DouyinBridge.RequestSubscribe("patrol", (ok, info) =>
                    {
                        if (ok)
                        {
                            Meta.MarkDySubscribed(S, "patrol", Profile.Today);
                            Save();
                            Ui.Toast("已开启巡村满仓提醒", 200);
                            if (layer != null && layer.Find("modal_idle") != null) Idle(layer);
                        }
                        else if (info == "no_tmpl_cfg") Ui.Toast("订阅通知模板准备中，敬请期待", 200);
                        else if (info == "reject") Ui.Toast("已取消本次订阅提醒", 180);
                    }), 27);
                BindDouyinSubscribeBtn(subBtn, "patrol", () =>
                {
                    if (layer != null && layer.Find("modal_idle") != null) Idle(layer);
                });
            }
        }

        // ---------------- 图鉴（v2 旗舰重构：奶油雕花格卡 + 怪种角标 + 收集宝箱条 + 底挂书签页签 + 敌军详情二级弹窗） ----------------

        static float _codexScroll;
        static int _codexLastTab = -1;

        public static void Codex(Transform layer, int tab = -1)
        {
            if (tab < 0) tab = FirstCodexTab();
            if (tab != _codexLastTab) { _codexLastTab = tab; _codexScroll = 0f; }

            float ph = Mathf.Min(1350f, Ui.Height - Ui.SafeTop - 250f);
            var m = Modal(layer, "codex", "外星图鉴", new Vector2(960, ph), out var p, null, 28f);
            float top = ph * 0.5f;

            string[] tabs = { "小怪", "精英", "首领" };
            // 未选页签放在最底层被主面板底沿自然承压；选中页签稍凸出与暖米内页浑然一体
            const float btabW = 216f, btabH = 98f, btabGap = 232f;
            RectTransform activeBtab = null;
            for (int i = 0; i < 3; i++)
            {
                int ti = i;
                bool on = i == tab;
                var bt = Ui.Rect(p, "btab" + i);
                bt.anchoredPosition = new Vector2((i - 1) * btabGap + 76f, -top - (on ? 44f : 48f));
                bt.sizeDelta = new Vector2(btabW, btabH);
                if (on) activeBtab = bt;
                else bt.SetAsFirstSibling();
                var bFace = Ui.Skin(bt, on ? "codex_btab_on" : "codex_btab_off", new Vector2(btabW, btabH), Vector2.zero, 1f, null, "face");
                if (on)
                    Ui.Label(bt, tabs[i], 34, WarmTitle, new Vector2(0, 0f), new Vector2(190, 52), TextAnchor.MiddleCenter, Fonts.Heavy);
                else
                    Ui.Outlined(bt, tabs[i], 32, Pal.Hex("D6E6F2"), new Vector2(0, -4f), new Vector2(190, 52), Pal.Hex("1D3346"), 1.8f);

                int badge = Meta.CodexGroupBadge(S, i);
                if (badge > 0) Dot(bt, new Vector2(btabW * 0.5f - 20f, btabH * 0.5f - 32f), badge);
                Ui.Tap(bFace, () => { if (ti != tab) Codex(layer, ti); }, bt);
            }
            if (activeBtab != null) activeBtab.SetAsLastSibling();
            var list = new List<EnemyDef>();
            int claimableInTab = 0;
            foreach (var d in Defs.Enemies)
            {
                if (Meta.CodexGroupOf(d) != tab) continue;
                list.Add(d);
                if (S.Seen[(int)d.Kind] == 1) claimableInTab++;
            }

            // 1. 3×3 奶油米白雕花格卡滚动区（立绘呼吸 + 左上贴框丝带角标 + 石青名字 + 可领奖提醒）
            float viewTop = top - 82f;
            float viewBot = -top + 198f;
            float viewH = viewTop - viewBot;
            const float cardW = 274f, cardH = 308f, colStep = 292f, rowStep = 324f;
            int rows = (list.Count + 2) / 3;
            float contentH = Mathf.Max(viewH, rows * rowStep + 22f);

            var view = Ui.Rect(p, "view");
            view.sizeDelta = new Vector2(900, viewH);
            view.anchoredPosition = new Vector2(0, (viewTop + viewBot) * 0.5f);
            view.gameObject.AddComponent<RectMask2D>();
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(900, contentH);
            content.anchoredPosition = new Vector2(0, Mathf.Clamp(_codexScroll, 0f, Mathf.Max(0f, contentH - viewH)));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.viewport = view;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.elasticity = 0.08f;
            sr.scrollSensitivity = 40f;
            sr.onValueChanged.AddListener(_ => _codexScroll = content.anchoredPosition.y);
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit").transform.SetAsFirstSibling();

            float firstY = -14f - cardH * 0.5f;
            for (int i = 0; i < list.Count; i++)
            {
                var d = list[i];
                int st = S.Seen[(int)d.Kind];
                var c = Ui.Rect(content, "enemy" + i);
                c.anchorMin = c.anchorMax = new Vector2(0.5f, 1f);
                c.anchoredPosition = new Vector2(((i % 3) - 1) * colStep, firstY - (i / 3) * rowStep);
                c.sizeDelta = new Vector2(cardW, cardH);

                string cSkin = st == 0 ? "codex_card_lock" : st == 1 ? "codex_card_claim" : "codex_card";
                var face = Ui.Skin(c, cSkin, new Vector2(cardW, cardH), Vector2.zero, 1f, null, "card");

                // 脚底温润接触阴影 + 固定视觉身高脚底对齐站位（无论高矮胖瘦都整齐划一！）
                Ui.Box(c, new Vector2(142, 26), new Vector2(0, -56f),
                    st == 0 ? new Color(0.20f, 0.18f, 0.16f, 0.22f) : new Color(0.26f, 0.20f, 0.14f, 0.28f),
                    Art.GroundShadow, "footSh");

                float artH = d.IsBoss ? 186f : d.Big ? 176f : 166f;
                var art = StandByHeight(c, d.Art, artH, -56f, "art");

                if (st == 0)
                {
                    art.color = new Color(0.16f, 0.20f, 0.25f, 0.88f);
                    Ui.Label(c, "???", 32, Pal.Hex("8A8276"), new Vector2(0, -104), new Vector2(240, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
                    var lkKind = d;
                    Ui.Tap(face, () =>
                    {
                        Sfx.Play(Snd.Deny, 0.55f);
                        Ui.Toast($"尚未遭遇该{tabs[tab]}，推进关卡解锁并领 {Meta.CodexReward(lkKind)} 星钻", 180);
                    }, c, false);
                    continue;
                }

                float phOff = i * 0.65f;
                Tween.Run(art, 999f, k =>
                {
                    if (art) art.rectTransform.localScale = new Vector3(1f, 1f + 0.015f * Mathf.Sin(k * 999f * 2.4f + phOff), 1f);
                });

                // 左上角贴卡边立体折耳丝带角标（紧贴卡片左上缘伸出，不悬空）
                var pBadge = EnemyText.PrimaryBadge(d);
                if (pBadge.HasValue)
                {
                    var (bTxt, bCol) = pBadge.Value;
                    float bw = Mathf.Max(108f, bTxt.Length * 23f + 28f);
                    var tagBg = Ui.Skin(c, "codex_tag_edge", new Vector2(bw, 44f),
                        new Vector2(-cardW * 0.5f + bw * 0.5f - 5f, cardH * 0.5f - 30f), 0.68f, bCol, "roleTag");
                    Ui.Outlined(tagBg.transform, bTxt, 20, Color.white, new Vector2(2f, 5f), new Vector2(bw - 12f, 34), bCol.Mul(0.40f), 1.35f);
                }

                // 底部清爽石青蓝怪名
                Ui.SingleLine(Ui.Label(c, d.Name, 29, st == 1 ? Pal.Hex("7A4B10") : Pal.Hex("4E6E86"),
                    new Vector2(0, -106), new Vector2(248, 44), TextAnchor.MiddleCenter, Fonts.Heavy), 20);

                // 可领首次收录元宝时：仅在右上角挂一枚精致小元宝 + 红点提醒，绝不遮挡立绘头部
                if (st == 1)
                {
                    var rwIcon = Ui.Icon(c, "ic_ingot", 42, new Vector2(cardW * 0.5f - 32f, cardH * 0.5f - 30f), "rwIngot");
                    Dot(c, new Vector2(cardW * 0.5f - 14f, cardH * 0.5f - 14f));
                    Ui.Breathe(rwIcon, 3.0f);
                }

                var ek = d.Kind;
                int curTab = tab;
                Ui.Tap(face, () => CodexDetail(layer, ek, curTab), c);
            }

            // 2. 底部分割横线（4x超采样三倒三角装饰） + 收集进度条 + 右侧里程碑宝箱 + 一键领奖
            float sepY = viewBot - 18f;
            DrawCodexDivider(p, sepY, 840f);

            var (seenCnt, totalCnt) = Meta.CodexProgress(S, tab);
            int boxNeed = Meta.CodexBoxNeed(tab);
            bool boxTaken = Meta.CodexBoxTaken(S, tab);
            bool boxReady = Meta.CanClaimCodexBox(S, tab);

            // 标题卷轴左上方轻量「全领」胶囊（若有 ≥2 张新卡待领），让底部进度条 + 宝箱 100% 居中舒展如参考图！
            if (claimableInTab >= 2)
            {
                int claimTab = tab;
                var allBtn = Ui.Btn(p, $"全领 ({claimableInTab})", new Vector2(168, 60), new Vector2(-346f, top + 6f), Pal.Gold, () =>
                {
                    int sum = 0;
                    foreach (var ed in Defs.Enemies)
                        if (Meta.CodexGroupOf(ed) == claimTab && Meta.ClaimCodex(S, ed.Kind))
                            sum += Meta.CodexReward(ed);
                    if (sum <= 0) return;
                    Save();
                    Sfx.Play(Snd.Coin);
                    Codex(layer, claimTab);
                    ShowRewards(layer, "图鉴收录奖励", new List<Item> { new Item(Cur.Ingot, sum) });
                }, 24);
                Dot(allBtn, new Vector2(74, 24));
            }

            float barY = -top + 116f;
            const float barW = 620f;
            const float barX = -46f;
            Bar(p, new Vector2(barX, barY), new Vector2(barW, 30f), seenCnt / (float)Mathf.Max(1, totalCnt), Pal.Gold, $"{seenCnt}/{totalCnt}");

            float chestX = barX + barW * 0.5f + 46f;
            var chestSlot = Ui.Rect(p, "codexBox");
            chestSlot.anchoredPosition = new Vector2(chestX, barY + 10f);
            chestSlot.sizeDelta = new Vector2(116, 116);
            if (boxReady)
            {
                var glow = Ui.Box(chestSlot, new Vector2(128, 128), Vector2.zero, Pal.Gold.A(0.45f), Art.SoftDot, "glow");
                Tween.Run(glow, 999f, k => { if (glow) glow.color = Pal.Gold.A(0.30f + 0.20f * Mathf.Sin(k * 999f * 4.5f)); });
            }
            string chestArt = boxTaken ? "ic_chest_open" : tab == 2 ? "ic_chest_gold" : tab == 1 ? "ic_chest_silver" : "ic_chest_wood";
            var chestIc = Ui.Icon(chestSlot, chestArt, 94, Vector2.zero, "chest");
            if (boxReady)
            {
                Dot(chestSlot, new Vector2(36, 36));
                Tween.Run(chestIc, 999f, k =>
                {
                    if (chestIc) chestIc.rectTransform.localRotation = Quaternion.Euler(0, 0, 6.5f * Mathf.Sin(k * 999f * 6.0f));
                });
            }
            var chestHit = Ui.Box(chestSlot, new Vector2(116, 116), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            int boxTab = tab;
            Ui.Tap(chestHit, () =>
            {
                if (Meta.CanClaimCodexBox(S, boxTab))
                {
                    var got = Meta.ClaimCodexBox(S, boxTab);
                    if (got == null) return;
                    Save();
                    Codex(layer, boxTab);
                    ShowRewards(layer, $"{tabs[boxTab]}图鉴宝箱", new List<Item>(got));
                    return;
                }
                string msg = boxTaken
                    ? $"该{tabs[boxTab]}图鉴宝箱已领取"
                    : $"解锁 {boxNeed} 种{tabs[boxTab]}图鉴即可开启（当前 {seenCnt}/{boxNeed}）";
                BoxPreview(layer, Meta.CodexBoxRewards(boxTab), msg);
            }, chestSlot);

            string footNote = boxTaken
                ? $"已集齐阶段宝箱 · 点击任意{tabs[tab]}卡片可查看弱点与克制阵容"
                : $"解锁更多{tabs[tab]}图鉴，获得阶段宝箱奖励";
            Ui.Label(p, footNote, 25, WarmSub, new Vector2(0, -top + 54f), new Vector2(840, 38), TextAnchor.MiddleCenter, Fonts.Heavy);
        }

        static int FirstCodexTab()
        {
            for (int i = 0; i < 3; i++) if (Meta.CodexGroupBadge(S, i) > 0) return i;
            return 0;
        }

        /// <summary>复刻参考图优雅对称细分割线（4x 超采样三枚朝下圆润小三角 + 两端短破折点，零锯齿）。</summary>
        static void DrawCodexDivider(Transform p, float y, float totalW)
        {
            var img = Ui.Box(p, new Vector2(totalW, 28f), new Vector2(0, y), Color.white, Art.Img("ui/codex_divider"), "divider");
            img.type = Image.Type.Simple;
        }

        /// <summary>按固定视觉身高渲染角色立绘并脚底居中对齐，彻底消除因原画宽高比不一导致的参差不齐。</summary>
        static Image StandByHeight(Transform parent, string artName, float targetH, float footY, string objName = "art")
        {
            var sp = Art.Img(artName);
            float w = targetH, h = targetH;
            if (sp != null && sp.rect.height > 1f && sp.rect.width > 1f)
            {
                float ratio = sp.rect.width / sp.rect.height;
                w = targetH * ratio;
                if (w > targetH * 1.25f) { w = targetH * 1.25f; h = w / ratio; }
            }
            var img = Ui.Box(parent, new Vector2(w, h), Vector2.zero, Color.white, sp, objName);
            img.type = Image.Type.Simple;
            img.preserveAspect = true;
            img.raycastTarget = false;
            img.rectTransform.pivot = new Vector2(0.5f, 0f);
            img.rectTransform.anchoredPosition = new Vector2(0f, footY);
            return img;
        }

        /// <summary>复刻参考图 2 的「怪物/精英/首领详情」二级弹窗：贴框丝带角标 + 纹章立绘舞台 + 空心双菱花线 + 像素级对齐机制框与推荐好汉 + 单方块清爽领奖。</summary>
        public static void CodexDetail(Transform layer, EnemyKind kind, int fromTab = 0)
        {
            var d = Defs.Enemy(kind);
            int st = S.Seen[(int)kind];
            if (st <= 0) return;

            // 打开详情时暂时隐藏背后图鉴主窗，关闭详情时恢复，画面干干净净不叠两顶帽子
            var bgCodexRoot = layer.Find("modal_codex");
            CanvasGroup bgCg = null;
            if (bgCodexRoot)
            {
                bgCg = bgCodexRoot.GetComponent<CanvasGroup>();
                if (bgCg) { bgCg.alpha = 0f; bgCg.blocksRaycasts = false; }
            }

            var unlocked = new List<EnemyKind>();
            foreach (var ed in Defs.Enemies)
                if (Meta.CodexGroupOf(ed) == fromTab && S.Seen[(int)ed.Kind] > 0) unlocked.Add(ed.Kind);
            int curIdx = unlocked.IndexOf(kind);

            string title = d.IsBoss ? "首领详情" : d.Big ? "精英详情" : "怪物详情";
            var m = Modal(layer, "codexDetail", title, new Vector2(880, 1180), out var p, null, 0f);
            float top = 590f;

            void RestoreBg()
            {
                if (bgCg) { bgCg.alpha = 1f; bgCg.blocksRaycasts = true; }
            }
            void RestoreAndClose()
            {
                RestoreBg();
                Close(m);
            }
            var dimBtn = m.Find("dim")?.GetComponent<Button>();
            if (dimBtn) { dimBtn.onClick.RemoveAllListeners(); dimBtn.onClick.AddListener(RestoreAndClose); }
            var closeBtn = p.Find("close")?.GetComponent<Button>();
            if (closeBtn) { closeBtn.onClick.RemoveAllListeners(); closeBtn.onClick.AddListener(RestoreAndClose); }

            // 右下角极淡雅水泊星轨暗纹水印（对标参考图右下星球暗印，撑满底部留白高级感）
            var wm = Ui.Box(p, new Vector2(236, 176), new Vector2(296f, -top + 112f), Color.white, Art.Img("ui/codex_watermark"), "watermark");
            wm.type = Image.Type.Simple;

            // 左上角贴着面板内框左缘伸出的立体折耳丝带角标（仅在有明确定位词条时显示，普通步卒不挂突兀灰标）
            var pBadge = EnemyText.PrimaryBadge(d);
            if (pBadge.HasValue)
            {
                var (bTxt, bCol) = pBadge.Value;
                float bw = Mathf.Max(148f, bTxt.Length * 30f + 46f);
                var tag = Ui.Skin(p, "codex_tag_edge", new Vector2(bw, 58f),
                    new Vector2(-440f + bw * 0.5f - 6f, top - 94f), 0.90f, bCol, "typeTag");
                Ui.Outlined(tag.transform, bTxt, 27, Color.white, new Vector2(3f, 6f), new Vector2(bw - 14f, 46), bCol.Mul(0.40f), 1.55f);
            }

            // 中央淡米金双环四尖拱纹章底盘 + 底部对齐站位（无论高矮体型都稳稳踩在底影中心）
            float stageY = top - 236f;
            var crest = Ui.Box(p, new Vector2(320, 320), new Vector2(0, stageY + 14f), Color.white, Art.Img("ui/codex_crest"), "crest");
            crest.type = Image.Type.Simple;
            Ui.Box(p, new Vector2(188, 34), new Vector2(0, stageY - 102f), new Color(0.24f, 0.18f, 0.12f, 0.30f), Art.GroundShadow, "shadow");
            float artH = d.IsBoss ? 256f : d.Big ? 242f : 228f;
            var art = StandByHeight(p, d.Art, artH, stageY - 102f, "art");
            Tween.Run(art, 999f, k =>
            {
                if (art) art.rectTransform.localScale = new Vector3(1f, 1f + 0.014f * Mathf.Sin(k * 999f * 2.2f), 1f);
            });

            if (unlocked.Count > 1 && curIdx >= 0)
            {
                var swipeZone = Ui.Box(p, new Vector2(720, 310), new Vector2(0, stageY + 10f), new Color(0, 0, 0, 0), Art.White, "swipeZone");
                swipeZone.raycastTarget = true;
                var sw = swipeZone.gameObject.AddComponent<HorizontalSwipe>();
                sw.OnStep = dir =>
                {
                    int nxt = (curIdx + dir + unlocked.Count) % unlocked.Count;
                    Sfx.Play(Snd.Tap, 0.6f);
                    CodexDetail(layer, unlocked[nxt], fromTab);
                };
            }

            // 怪名 + 左右对称 4x 超采样空心双菱细花线（完全复刻参考图「·——◇◇ 双头绿皮 ◇◇——·」）
            float nameY = top - 404f;
            var nameLbl = Ui.SingleLine(Ui.Label(p, d.Name, 38, Pal.Hex("466C88"), new Vector2(0, nameY), new Vector2(360, 52), TextAnchor.MiddleCenter, Fonts.Heavy, "enemyName"), 24);
            Canvas.ForceUpdateCanvases();
            float nameHalf = Mathf.Max(78f, nameLbl.preferredWidth * 0.5f + 22f);
            const float wingW = 228f, wingH = 34f;
            var wingL = Ui.Box(p, new Vector2(wingW, wingH), new Vector2(-(nameHalf + wingW * 0.5f), nameY), Color.white, Art.Img("ui/codex_name_wing"), "wingL");
            wingL.type = Image.Type.Simple;
            var wingR = Ui.Box(p, new Vector2(wingW, wingH), new Vector2(nameHalf + wingW * 0.5f, nameY), Color.white, Art.Img("ui/codex_name_wing"), "wingR");
            wingR.type = Image.Type.Simple;
            wingR.rectTransform.localScale = new Vector3(-1f, 1f, 1f);

            // 特性与弱点内凹说明框：4x 超采样圆润菱星与首行文字中线严格 100% 水平对齐！
            float descY = top - 550f;
            const float boxW = 784f, descH = 186f;
            Ui.Skin(p, "modal_well", new Vector2(boxW, descH), new Vector2(0, descY), 1f, null, "descBox");
            string bodyRich = EnemyText.SheetBody(d);
            // 文本顶边固定在 descY + 58，字号 28 首行中心恰在 descY + 40，菱星同步锚在 descY + 40 丝毫不差
            var bullet = Ui.Box(p, new Vector2(24, 24), new Vector2(-346f, descY + 40f), Color.white, Art.Img("ui/codex_bullet"), "bullet");
            bullet.type = Image.Type.Simple;
            var descLbl = Ui.Label(p, bodyRich, 28, WarmTitle, new Vector2(18f, descY - 6f), new Vector2(684f, 128f), TextAnchor.UpperLeft, Fonts.Heavy, "descText");
            descLbl.lineSpacing = 1.28f;

            // 克制推荐好汉横条（与上方说明框等宽左对齐，左缘严格同在 x=-356；4位Q版好汉全部按脚底对齐在同一基准线！）
            float recY = top - 734f;
            const float recH = 144f;
            Ui.Skin(p, "modal_well", new Vector2(boxW, recH), new Vector2(0, recY), 1f, null, "recBox");
            Ui.Label(p, "推荐乡亲：", 28, WarmTitle, new Vector2(-264f, recY), new Vector2(184, 52), TextAnchor.MiddleLeft, Fonts.Heavy);

            var recs = EnemyText.RecommendedHeroes(d);
            for (int i = 0; i < recs.Length; i++)
            {
                var hid = recs[i];
                var hd = Defs.Hero(hid);
                bool owned = Meta.Owned(S, hid);
                float hx = -98f + i * 144f;
                var hSlot = Ui.Rect(p, "recHero" + i);
                hSlot.anchoredPosition = new Vector2(hx, recY);
                hSlot.sizeDelta = new Vector2(128, 130);

                // 统一视觉身高 104px + 脚底踩齐 y=-46，四位Q版好汉头顶与脚底严丝合缝成一条直线！
                Ui.Box(hSlot, new Vector2(84, 18), new Vector2(0, -46f), new Color(0.20f, 0.15f, 0.10f, 0.30f), Art.GroundShadow, "sh");
                var hArt = StandByHeight(hSlot, hd.Art, 104f, -46f, "art");
                if (!owned) hArt.color = new Color(0.62f, 0.62f, 0.66f, 0.92f);

                var hHit = Ui.Box(hSlot, new Vector2(128, 130), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
                var targetHero = hid;
                Ui.Tap(hHit, () =>
                {
                    RestoreBg();
                    Close(m);
                    HeroDetail(layer, targetHero);
                }, hSlot);
            }

            // 底部装饰三倒三角分割线（与上方双框严格同宽 784px 对齐！）
            DrawCodexDivider(p, top - 838f, boxW);

            // 底部首次遭遇元宝奖励区（100% 复刻参考图：中央单枚精致暖金奖励方格 + 下方清爽状态字，砍掉冗余笨重大黄钮！）
            float rwY = top - 968f;
            int reward = Meta.CodexReward(d);
            var rwTile = ItemTile(p, new Item(Cur.Ingot, reward), new Vector2(0, rwY + 12f), 134f, false, st == 2 ? layer : null);

            if (st == 1)
            {
                var glow = Ui.Box(rwTile, new Vector2(180, 180), Vector2.zero, Pal.Gold.A(0.45f), Art.SoftDot, "rwGlow");
                glow.transform.SetAsFirstSibling();
                Tween.Run(glow, 999f, k => { if (glow) glow.color = Pal.Gold.A(0.30f + 0.20f * Mathf.Sin(k * 999f * 4.2f)); });
                Dot(rwTile, new Vector2(58, 58));
                var rwOrigin = rwTile.anchoredPosition;
                Tween.Run(rwTile, 999f, k =>
                {
                    if (rwTile) rwTile.anchoredPosition = rwOrigin + new Vector2(0f, 4.2f * Mathf.Sin(k * 999f * 4.2f));
                });

                var hintLbl = Ui.Label(p, "点击领取", 28, Pal.Hex("C87412"), new Vector2(0, rwY - 86f), new Vector2(260, 42), TextAnchor.MiddleCenter, Fonts.Heavy, "claimTxt");
                var claimHit = Ui.Box(p, new Vector2(220, 210), new Vector2(0, rwY - 12f), new Color(0, 0, 0, 0), Art.White, "claimHit");
                Ui.Tap(claimHit, () =>
                {
                    if (!Meta.ClaimCodex(S, kind)) return;
                    Save();
                    Sfx.Play(Snd.Coin);
                    Codex(layer, fromTab);
                    CodexDetail(layer, kind, fromTab);
                    ShowRewards(layer, "首次遭遇奖励", new List<Item> { new Item(Cur.Ingot, reward) });
                }, rwTile);
                hintLbl.raycastTarget = false;
            }
            else
            {
                Ui.Label(p, "已领取", 28, Pal.Hex("3B8E3E"), new Vector2(0, rwY - 86f), new Vector2(240, 42), TextAnchor.MiddleCenter, Fonts.Heavy);
            }
        }

        sealed class HorizontalSwipe : MonoBehaviour, IBeginDragHandler, IDragHandler, IEndDragHandler
        {
            public Action<int> OnStep;
            Vector2 _start;
            public void OnBeginDrag(PointerEventData e) => _start = e.position;
            public void OnDrag(PointerEventData e) { }
            public void OnEndDrag(PointerEventData e)
            {
                float dx = e.position.x - _start.x;
                if (Mathf.Abs(dx) >= 48f && Mathf.Abs(dx) > Mathf.Abs(e.position.y - _start.y))
                    OnStep?.Invoke(dx < 0 ? 1 : -1);
            }
        }

        // ---------------- 设置 ----------------

        public static void Settings(Transform layer)
        {
            bool showDySub = DouyinBridge.IsDouyin;
            Modal(layer, "settings", "系统设置", new Vector2(840, showDySub ? 980 : 840), out var p, Pal.Hex("56677A"));
            Ui.Skin(p, "modal_well", new Vector2(748, showDySub ? 424 : 288), new Vector2(0, 156), 1f);
            Toggle(p, showDySub ? 292 : 224, "游戏音效", S.Sound == 1, on => { S.Sound = on ? 1 : 0; Sfx.On = on; Save(); Settings(layer); });
            Toggle(p, showDySub ? 156 : 88, "背景音乐", S.Music == 1, on =>
            {
                S.Music = on ? 1 : 0;
                Sfx.Music = on;
                Save();
                if (on) Sfx.PlayMusic(Bgm.Menu);
                else Sfx.PlayMusic(Bgm.None);
                Settings(layer);
            });
            if (showDySub)
            {
                var r = Ui.Rect(p, "sub_notify");
                r.anchoredPosition = new Vector2(0, 20);
                r.sizeDelta = new Vector2(720, 118);
                Ui.Skin(r, "row", new Vector2(720, 118), Vector2.zero);
                Ui.SingleLine(Ui.Label(r, "消息订阅提醒", 32, WarmTitle, new Vector2(-150, 18), new Vector2(340, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
                Ui.SingleLine(Ui.Label(r, "巡村收益满仓与每日签到通知", 22, WarmSub, new Vector2(-150, -22), new Vector2(340, 34), TextAnchor.MiddleLeft, Fonts.Heavy), 17);
                bool subToday = Meta.HasDySubPatrolToday(S, Profile.Today) && Meta.HasDySubSignToday(S, Profile.Today);
                var subBtn = Ui.Btn(r, subToday ? "继续订阅" : "订阅通知", new Vector2(184, 78), new Vector2(236, 0), Pal.Azure, () =>
                {
                    DouyinBridge.RequestSubscribe("all", (ok, info) =>
                    {
                        if (ok)
                        {
                            Meta.MarkDySubscribed(S, "all", Profile.Today);
                            Save();
                            Ui.Toast("已开启消息订阅提醒", 200);
                            if (layer != null && layer.Find("modal_settings") != null) Settings(layer);
                        }
                        else if (info == "no_tmpl_cfg") Ui.Toast("订阅通知模板准备中，敬请期待", 200);
                        else if (info == "reject") Ui.Toast("已取消本次订阅提醒", 180);
                    });
                }, 28);
                BindDouyinSubscribeBtn(subBtn, "all", () =>
                {
                    if (layer != null && layer.Find("modal_settings") != null) Settings(layer);
                });
            }
            Ui.Label(p, $"当前通关 {S.Cleared}/{Defs.LevelCount}  ·  战绩 {S.Wins} 胜 / {S.Battles} 战  ·  累计摇人 {S.Pulls} 次",
                25, WarmTitle, new Vector2(0, showDySub ? -118 : -48), new Vector2(760, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Btn(p, "重置存档", new Vector2(310, 96), new Vector2(0, showDySub ? -252 : -186), Pal.Red, () => Confirm(layer, "确定清空全部游戏进度？\n此操作不可恢复。", () =>
            {
                Profile.Reset();
                Game.I.ShowHome();
            }), 36);
            Ui.Label(p, "村口大战外星人 v1.0 · 幸福村保卫版", 22, WarmSub, new Vector2(0, showDySub ? -390 : -324), new Vector2(740, 36), TextAnchor.MiddleCenter, Fonts.Bold);
        }

        static void Toggle(Transform p, float y, string name, bool on, Action<bool> set)
        {
            var r = Ui.Rect(p, "toggle_" + name);
            r.anchoredPosition = new Vector2(0, y);
            r.sizeDelta = new Vector2(720, 118);
            Ui.Skin(r, "row", new Vector2(720, 118), Vector2.zero);
            Ui.Label(r, name, 34, WarmTitle, new Vector2(-170, 0), new Vector2(300, 56), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Btn(r, on ? "已开启" : "已关闭", new Vector2(184, 78), new Vector2(236, 0), on ? Pal.Green : Pal.Slate, () => set(!on), 30);
        }

        public static void Confirm(Transform layer, string text, Action yes)
        {
            var m = Modal(layer, "confirm", "提示", new Vector2(780, 520), out var p);
            Ui.Label(p, text, 32, WarmTitle, new Vector2(0, 48), new Vector2(660, 150), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Btn(p, "取消", new Vector2(240, 94), new Vector2(-152, -148), Pal.Slate, () => Close(m), 36);
            Ui.Btn(p, "确定", new Vector2(240, 94), new Vector2(152, -148), Pal.Red, () => { Close(m); yes(); }, 36);
        }

        // ---------------- 日常挑战 / 截取生辰纲 ----------------

        public const int DailyUnlock = 3, EscortUnlock = 6;

        public static void Daily(Transform layer)
        {
            var st = Defs.DailyStage(S.Cleared, Profile.Today);
            var bd = Defs.Enemy(st.BossKind);
            Modal(layer, "daily", "民兵大比武", new Vector2(920, 1180), out var p);
            Ui.Skin(p, "dark", new Vector2(840, 420), new Vector2(0, 300));
            Ui.Box(p, new Vector2(500, 200), new Vector2(0, 160), Pal.Hex("4AD0FF").A(0.28f), Art.SoftDot);
            Ui.Icon(p, bd.Art, 300, new Vector2(0, 270));
            Ui.Outlined(p, $"今日首领：{bd.Name}", 40, Pal.Champagne, new Vector2(0, 474), new Vector2(800, 56), Pal.Ink, 3f);
            Ui.Label(p, $"强化版第 {Mathf.Min(Defs.LevelCount, S.Cleared + 2)} 关 · 首领血量 ×1.2 · 每天轮换首领", 28, Pal.SubInk, new Vector2(0, 50), new Vector2(820, 44));
            if (st.BuffRole.HasValue) Ui.Label(p, "本关增益：" + st.BuffText, 28, Pal.GreenDeep, new Vector2(0, 6), new Vector2(820, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Label(p, "胜利奖励", 30, Pal.Ink, new Vector2(0, -50), new Vector2(400, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            var r = Meta.BattleRewards(S, st, true, st.Waves, 1, 0, new Rng(1));
            ItemRow(p, r.Items, new Vector2(0, -160), 130);
            Ui.Label(p, "失败也按坚持的波数给部分奖励", 24, Pal.Muted, new Vector2(0, -300), new Vector2(700, 40));
            int left = Meta.DailyTriesMax - S.DailyTries;
            Ui.Btn(p, left > 0 ? $"挑战（剩 {left} 次）" : "今日已用完", new Vector2(460, 120), new Vector2(0, -420), left > 0 ? Pal.Gold : Pal.Slate, () =>
            {
                if (left <= 0) return;
                Game.I.StartDaily();
            }, 42);
            Ui.Label(p, $"消耗体力 {Meta.BattleStamina}", 24, Pal.SubInk, new Vector2(0, -500), new Vector2(400, 36));
        }

        public static void Escort(Transform layer)
        {
            var st = Defs.EscortStage(S.Cleared);
            Modal(layer, "escort", "截获外星补给", new Vector2(920, 1120), out var p);
            Ui.Skin(p, "dark", new Vector2(840, 400), new Vector2(0, 290));
            for (int i = 0; i < 3; i++) Ui.Icon(p, "en_porter", 220, new Vector2((i - 1) * 230, 270 - Mathf.Abs(i - 1) * 20));
            Ui.Outlined(p, "外星母舰的样本搬运队正偷偷溜过村口", 36, Pal.Champagne, new Vector2(0, 450), new Vector2(820, 56), Pal.Ink, 3f);
            Ui.Label(p, $"共 {st.Waves} 波搬运工，每波 {st.PorterCount} 箱。打爆越多，金币越多；搬运工不触发盲盒。", 28, Pal.SubInk, new Vector2(0, 50), new Vector2(820, 80));
            Ui.Label(p, "每箱可得", 30, Pal.Ink, new Vector2(0, -40), new Vector2(400, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            var r = Meta.BattleRewards(S, st, true, st.Waves, 1, 1, new Rng(1));
            r.Items.RemoveAll(x => x.N <= 0);
            ItemRow(p, r.Items, new Vector2(0, -140), 120);
            Ui.Label(p, "每 3 箱额外得合金钢 1", 24, Pal.Muted, new Vector2(0, -240), new Vector2(600, 40));
            int left = Meta.EscortTriesMax - S.EscortTries;
            Ui.Btn(p, left > 0 ? $"出发（剩 {left} 次）" : "今日已用完", new Vector2(460, 120), new Vector2(0, -390), left > 0 ? Pal.Gold : Pal.Slate, () =>
            {
                if (left <= 0) return;
                Game.I.StartEscort();
            }, 42);
            Ui.Label(p, $"消耗体力 {Meta.BattleStamina}", 24, Pal.SubInk, new Vector2(0, -470), new Vector2(400, 36));
        }

        // ---------------- 章节宝箱 ----------------

        public static void Chest(Transform layer, int chapter, int k)
        {
            if (Meta.CanOpenChest(S, chapter, k))
            {
                var r = Meta.OpenChest(S, chapter, k);
                Save();
                ShowRewards(layer, $"{Meta.ChestStars[k]} 星宝箱", r);
                return;
            }
            var m = Modal(layer, "chest", $"{Meta.ChestStars[k]} 星宝箱", new Vector2(820, 660), out var p);
            Ui.Icon(p, k == 0 ? "ic_chest_wood" : k == 1 ? "ic_chest_silver" : "ic_chest_gold", 200, new Vector2(0, 180));
            bool got = (S.ChestClaimed[chapter - 1] & (1 << k)) != 0;
            Ui.Label(p, got ? "已领取" : $"本章累计 {Meta.ChestStars[k]} 星可领（当前 {Meta.ChapterStars(S, chapter)} 星）", 30, Pal.Ink, new Vector2(0, 40), new Vector2(740, 50), TextAnchor.MiddleCenter, Fonts.Heavy);
            ItemRow(p, Meta.ChestReward(chapter, k).Items, new Vector2(0, -90), 120);
            Ui.Btn(p, "知道了", new Vector2(260, 100), new Vector2(0, -240), Pal.Azure, () => Close(m), 40);
        }

        // ---------------- 招募结果（已升级迁移至 MetaRecruitUi.cs） ----------------

        // ---------------- 好汉详情 ----------------

        static string SkillIcon(HeroDef d, int i) => i == 0 ? d.AtkIcon : i == 1 ? d.UltIcon ?? "ic_lock" : "ic_star";

        /// <summary>职业小图标。</summary>
        public static string RoleArt(Role r) =>
            r == Role.Archer ? "ic_arrow" : r == Role.Bomber ? "ic_bomb" : r == Role.Mage ? "fx_zap" : r == Role.Fighter ? "ic_fist" : r == Role.Support ? "ic_heart" : "ic_hand";

        static readonly Color SkillOn = Pal.Hex("1874B0");
        static readonly Color SkillOff = Pal.Hex("C46A28");

        /// <summary>已达成的百分比用霁蓝标出。</summary>
        static string HighlightNums(string s, bool on)
        {
            if (!on || string.IsNullOrEmpty(s)) return s;
            return System.Text.RegularExpressions.Regex.Replace(s, @"([+-]\d+%)", m => "<color=#1874B0>" + m.Groups[1].Value + "</color>");
        }

        static string Plain(string s) =>
            System.Text.RegularExpressions.Regex.Replace(s ?? "", @"</?color(?:=[^>]+)?>", "");

        /// <summary>点技能名：按所在那一行认技能。解锁等级跟这一行走，不跟同名的另一条走。</summary>
        static void ShowSkill(RectTransform anchor, HeroId h, int row, string name, bool on)
        {
            var d = Defs.Hero(h);
            int lv = Mathf.Max(1, S.HeroLv[(int)h]);
            int need = row >= 0 && row < Meta.UnlockLv.Length ? Meta.UnlockLv[row] : 1;
            var kind = Meta.TalentSkillOf(h, row, name);
            string icon = d.AtkIcon;
            string tag = "技能";
            var tagCol = Pal.Hex("2B88C4");
            string cd = null;
            string body;
            string foot = on ? "" : $"{need}级解锁";
            string AtkCd() => (d.Interval * (lv >= Meta.SurgePlusLv ? 0.9f : 1f)).ToString("0.00") + "s";
            var surge = Meta.OptPerk(h, 1);
            var top = Meta.OptPerk(h, 2);
            if (kind == Meta.TalentSkill.Attack)
            {
                cd = AtkCd();
                body = Plain(HeroText.Atk(d, null, Mathf.Max(0, Meta.HeroDisplayAtk(S, h))));
                if (!on) foot = "尚未解锁";
            }
            else if (kind == Meta.TalentSkill.Ult)
            {
                icon = string.IsNullOrEmpty(d.UltIcon) ? "ic_lock" : d.UltIcon;
                tag = "大招";
                tagCol = Pal.Hex("E07A2E");
                cd = d.UltCd.ToString("0.00") + "s";
                body = Plain(HeroText.Ult(d));
                foot = on ? "局内强化抽到后释放" : $"{need}级解锁后，局内强化可抽到";
            }
            else if (kind == Meta.TalentSkill.Passive)
            {
                int unlock = Meta.PassiveUnlock(h);
                bool lit = S.HeroLv[(int)h] >= unlock;
                icon = "ic_star";
                tag = "被动";
                tagCol = Pal.Hex("8E5CE0");
                body = Plain(HeroText.Passive(d));
                foot = lit ? "解锁后永久生效" : $"{unlock}级解锁";
                Ui.SkillCard(anchor, icon, d.Rarity, !lit, name, tag, tagCol, cd, body, foot);
                return;
            }
            else if (kind == Meta.TalentSkill.SurgePlus)
            {
                tag = "强化";
                tagCol = Pal.Hex("C48A14");
                body = h == HeroId.HuaRong
                    ? "场上满 4 位时穿透 +1。此招必定暴击，技能冷却 -10%"
                    : d.Buff.HasValue
                        ? "此招效果翻倍，技能冷却 -10%"
                        : "此招必定暴击，触发几率 +10%，技能冷却 -10%";
                foot = on ? "解锁后永久生效" : $"{need}级解锁";
            }
            else if (kind == Meta.TalentSkill.Top && top != null)
            {
                tag = "强化";
                tagCol = Pal.Hex("C48A14");
                body = Plain(top.Desc);
                foot = on ? "局内强化可抽到" : $"{need}级解锁后，局内强化可抽到";
            }
            else if (surge != null)
            {
                tag = "强化";
                tagCol = Pal.Hex("C48A14");
                body = Plain(surge.Desc);
                foot = on ? "局内强化可抽到" : $"{need}级解锁后，局内强化可抽到";
            }
            else
            {
                tag = "强化";
                tagCol = Pal.Hex("C48A14");
                body = on ? "已解锁" : "尚未解锁";
                foot = on ? "局内强化可抽到" : $"{need}级解锁";
            }
            Ui.SkillCard(anchor, icon, d.Rarity, !on, name, tag, tagCol, cd, body, foot);
        }

        /// <summary>点六边形技能：弹出说明卡。没有大招的好汉单独说明。</summary>
        static void OpenHexSkill(RectTransform anchor, HeroId h, int i, int ulv)
        {
            var d = Defs.Hero(h);
            if (i == 1 && !d.HasUlt)
            {
                Ui.SkillCard(anchor, "ic_lock", d.Rarity, true, "无", "大招", Pal.Hex("E07A2E"), null, "仅传说乡亲拥有大招", null);
                return;
            }
            string name = i == 0 ? d.AtkName : i == 1 ? d.UltName : d.PassiveName;
            int row = i == 0 ? 0 : i == 1 ? 1 : 2;
            bool on = i == 0 || (i == 1 ? ulv >= Meta.UltLv : ulv >= Meta.PassiveUnlock(h));
            ShowSkill(anchor, h, row, name, on);
        }

        /// <summary>里程碑一行：技能名单独成段，可点开说明。已解锁霁蓝，未解锁赭石。</summary>
        static void TalentLine(Transform p, HeroId h, int i, bool on, float y)
        {
            string raw = Meta.Talent(h, i);
            var re = new System.Text.RegularExpressions.Regex("「(.*?)」");
            var ms = re.Matches(raw);
            if (ms.Count == 0)
            {
                Fit(Ui.Label(p, HighlightNums(raw, on), 26, on ? WarmTitle : WarmSub, new Vector2(28, y), new Vector2(628, 56), TextAnchor.MiddleLeft, Fonts.Heavy), 20);
                return;
            }

            var host = Ui.Rect(p, "talent");
            host.pivot = new Vector2(0f, 0.5f);
            host.anchoredPosition = new Vector2(28f - 314f, y);
            host.sizeDelta = new Vector2(628, 56);

            var segs = new List<(string text, string skill)>();
            int last = 0;
            foreach (System.Text.RegularExpressions.Match m in ms)
            {
                if (m.Index > last) segs.Add((raw.Substring(last, m.Index - last), null));
                segs.Add((null, m.Groups[1].Value));
                last = m.Index + m.Length;
            }
            if (last < raw.Length) segs.Add((raw.Substring(last), null));

            float x = 0f;
            var links = new List<(Text t, string skill)>();
            foreach (var seg in segs)
            {
                bool link = seg.skill != null;
                string shown = link ? (on ? "[" + seg.skill + "]" : "「" + seg.skill + "」") : HighlightNums(seg.text, on);
                if (string.IsNullOrEmpty(shown)) continue;
                Color col = link ? (on ? SkillOn : SkillOff) : (on ? WarmTitle : WarmSub);
                var t = Ui.Label(host, shown, 26, col, Vector2.zero, new Vector2(900, 56), TextAnchor.MiddleLeft, Fonts.Heavy, link ? "skill" : "txt");
                t.horizontalOverflow = HorizontalWrapMode.Overflow;
                // Label 默认锚在父节点中心。这里要从说明区左缘接上，和没有「」的行对齐。
                var rt = t.rectTransform;
                rt.anchorMin = rt.anchorMax = new Vector2(0f, 0.5f);
                rt.pivot = new Vector2(0f, 0.5f);
                Canvas.ForceUpdateCanvases();
                float w = t.preferredWidth;
                if (w < 1f) w = shown.Length * t.fontSize;
                rt.anchoredPosition = new Vector2(x, 0f);
                rt.sizeDelta = new Vector2(w, 56f);
                if (link)
                {
                    var bar = Ui.Box(t.rectTransform, new Vector2(Mathf.Max(12f, w - 6f), 3f), new Vector2(0f, -18f), col, Art.White, "ul");
                    bar.raycastTarget = false;
                    links.Add((t, seg.skill));
                }
                x += w;
            }
            foreach (var lk in links)
            {
                var rt = lk.t.rectTransform;
                string title = lk.skill;
                Ui.Tap(lk.t, () => ShowSkill(rt, h, i, title, on));
            }
            if (x > 620f) host.localScale = Vector3.one * (620f / x);
        }

        static void StatBox(Transform p, Vector2 pos, string icon, string label, string value, string sub, Color? iconBg = null)
        {
            var r = Ui.Rect(p, "stat_" + label);
            r.anchoredPosition = pos;
            r.sizeDelta = new Vector2(430, 120);
            Ui.Skin(r, "row", new Vector2(430, 120), Vector2.zero, 0.6f);
            Slot(r, "slot_wood", 96, new Vector2(-152, 0));
            if (iconBg.HasValue) Ui.Box(r, Vector2.one * 68, new Vector2(-152, 0), iconBg.Value, Art.Circle, "roleBg");
            Ui.Icon(r, icon, 62, new Vector2(-152, 2));
            Ui.Label(r, label, 26, Pal.SubInk, new Vector2(10, 28), new Vector2(200, 36), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(r, value, 38, Pal.Ink, new Vector2(10, -16), new Vector2(200, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
            if (sub != null)
                Ui.Label(r, sub, sub.StartsWith("+") ? 30 : 22, sub.StartsWith("+") ? Pal.GreenDeep : Pal.SubInk, new Vector2(150, -16), new Vector2(150, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
        }

        static Image CostTile(Transform p, Vector2 pos, string skin, string icon, string text, bool ok, bool shard)
        {
            var r = Ui.Rect(p, "cost");
            r.anchoredPosition = pos;
            r.sizeDelta = new Vector2(140, 170);
            var face = Slot(r, skin, 130, new Vector2(0, 16));
            if (shard)
            {
                var mask = Ui.Rect(r, "bustMask");
                mask.sizeDelta = Vector2.one * 100f;
                mask.anchoredPosition = new Vector2(0, 17);
                mask.gameObject.AddComponent<RectMask2D>();
                Ui.Icon(mask, icon, 122, new Vector2(0, -14));
                Ui.Icon(r, "ic_shard", 46, new Vector2(-42, 58));
            }
            else
            {
                Ui.Icon(r, icon, 92, new Vector2(0, 18));
            }
            Ui.Outlined(r, text, 28, ok ? Color.white : Pal.Hex("FF7A6A"), new Vector2(0, -66), new Vector2(200, 40), Pal.Ink, 2f);
            if (!ok)
            {
                var plus = Ui.Box(r, Vector2.one * 40, new Vector2(50, 66), Pal.Green, Art.Circle, "plus");
                Ui.Outlined(plus.transform, "+", 30, Color.white, new Vector2(0, 2), new Vector2(40, 40), Pal.GreenDeep, 1.5f);
            }
            return face;
        }

        /// <summary>参考视频的好汉详情：头像压在框顶，伤害/职业两格，三个六边形技能（点选看说明），等级里程碑，底部碎片、铜钱和大号升级键。</summary>
        public static void HeroDetail(Transform layer, HeroId h)
        {
            var d = Defs.Hero(h);
            int lv = S.HeroLv[(int)h];
            bool owned = lv > 0;
            int ulv = Mathf.Max(1, lv);
            var m = Modal(layer, "hero", null, new Vector2(980, 1560), out var p, null, -130);
            var rc = RarityColor(d.Rarity);

            // 抬头：稀有度光晕 + 头像压在框顶
            Ui.Box(p, new Vector2(940, 320), new Vector2(0, 680), rc.A(0.4f), Art.SoftDot, "headGlow");
            var medal = Ui.Icon(p, "ui/medal", 250, new Vector2(0, 776), "medal");
            medal.color = Color.Lerp(rc, Color.white, 0.3f);
            var art = Ui.Icon(p, d.Art, 300, new Vector2(0, 805), "art");
            if (!owned) art.color = new Color(0.3f, 0.3f, 0.34f);
            Tween.Run(art, 999f, k => art.rectTransform.anchoredPosition = new Vector2(0, 805 + 5 * Mathf.Sin(k * 999f * 2f)));

            var lvc = Ui.Icon(p, "ui/lv", 86, new Vector2(-150, 622), "lv");
            Ui.Outlined(lvc.transform, owned ? lv.ToString() : "-", 40, Color.white, new Vector2(0, 2), new Vector2(86, 60), Pal.Ink, 2f);
            Ui.SingleLine(Ui.Outlined(p, d.Name, 54, Color.white, new Vector2(10, 624), new Vector2(240, 70), Pal.Ink, 3f), 32);
            Badge(p, d.RarityName, rc, new Vector2(110, 50), new Vector2(176, 624), 26);
            Ui.SingleLine(Ui.Label(p, $"「{d.Nick}」{d.Desc}", 28, Pal.SubInk, new Vector2(0, 562), new Vector2(900, 44), TextAnchor.MiddleCenter, Fonts.Heavy), 20);

            int slot = Array.IndexOf(S.Lineup, (int)h);
            if (owned)
            {
                if (slot >= 0)
                {
                    var tag = Ui.Icon(p, "ui/tag_red", 132, new Vector2(-372, 670), "onTag");
                    Ui.Outlined(tag.transform, "出战中", 26, Color.white, new Vector2(-6, 2), new Vector2(112, 48), Pal.RedDeep, 1.4f);
                }
                if (Meta.CanResetHero(S, h))
                {
                    Ui.Btn(p, "免费重置", new Vector2(184, 72), new Vector2(366, 616), Pal.Slate, () =>
                    {
                        if (!Meta.ResetHero(S, h, out int rc2, out int rs2)) return;
                        Save();
                        Sfx.Play(Snd.Coin, 0.85f);
                        HeroDetail(layer, h);
                        Ui.Toast($"已重置为1级 · 返还金币 {Ui.Num(rc2)}、碎片 ×{rs2}", 220);
                    }, 28);
                }
            }

            int atk = Meta.HeroDisplayAtk(S, h);
            int next = owned && lv < Meta.MaxHeroLv ? Meta.HeroNextAtkDelta(S, h) : 0;
            StatBox(p, new Vector2(-226, 460), "ic_sword", "攻击力", Ui.Num(atk), next > 0 ? $"+{next}" : null);
            StatBox(p, new Vector2(226, 460), RoleArt(d.Kind), "职业", d.Role, HeroText.Tip(d).Split('：')[0], RoleColor(d.Kind));

            string[] tags = { "技能", "大招", "被动" };
            string[] names = { d.AtkName, d.UltName ?? "无", d.PassiveName };
            for (int i = 0; i < 3; i++)
            {
                bool locked = (i == 2 && ulv < Meta.PassiveUnlock(h)) || (i == 1 && (!d.HasUlt || ulv < Meta.UltLv));
                float x = (i - 1) * 240;
                var hx = MetaFx.Hex(p, SkillIcon(d, i), 128, new Vector2(x, 304), locked, d.Rarity);
                var cap = Ui.SingleLine(Ui.Outlined(p, $"{tags[i]}·{names[i]}", 28, Color.white, new Vector2(x, 210), new Vector2(236, 42), Pal.Ink, 2f), 20);
                int si = i;
                var hit = Ui.Box(hx, new Vector2(170, 180), Vector2.zero, new Color(0, 0, 0, 0.001f), Art.White, "hit");
                void Open() => OpenHexSkill(hx, h, si, ulv);
                Ui.Tap(hit, Open, hx);
                Ui.Tap(cap, Open, hx);
            }

            Ui.Skin(p, "modal_well", new Vector2(912, 396), new Vector2(0, -54), 1f);
            for (int i = 1; i < Meta.UnlockLv.Length; i++)
            {
                int need = Meta.UnlockLv[i];
                bool on = lv >= need;
                float y = 132 - (i - 1) * 74;
                Ui.Skin(p, on ? "row_claim" : "row", new Vector2(888, 68), new Vector2(0, y), 0.50f);
                // 徽章右缘 -320，勾选左缘 386：说明严格落在中间，左右各留 16px 以上
                Badge(p, $"Lv.{need}", on ? Pal.Teal : Pal.Slate, new Vector2(112, 46), new Vector2(-386, y), 24);
                TalentLine(p, h, i, on, y);
                var mark = Ui.Icon(p, on ? "ic_check" : "ic_lock", 36, new Vector2(404, y));
                if (!on) mark.color = new Color(1, 1, 1, 0.72f);
            }

            float sy = -316;
            Ui.Box(p, new Vector2(920, 60), new Vector2(0, sy), Pal.Hex("5CD890").A(0.24f), Art.Rounded, "bonus");
            Ui.Label(p, $"升级奖励：全村暴击伤害 <color=#1E7A40>+1%</color>（当前 +{Meta.LevelCritDmg(S) * 100:0}%）", 29, Pal.GreenDeep, new Vector2(0, sy), new Vector2(900, 56), TextAnchor.MiddleCenter, Fonts.Heavy);

            float by = -490;
            if (!owned)
            {
                string how = "敲锣摇人获得" + (d.Rarity >= 4 && !Meta.OrangeOpened(S) ? $"（通关第 {Meta.OrangeOpen} 关后进入摇人池）" : "");
                Ui.Label(p, HeroText.OnLight(how), 30, Pal.Ink, new Vector2(0, by + 56), new Vector2(880, 50), TextAnchor.MiddleCenter, Fonts.Heavy);
                Ui.Btn(p, "获取途径", new Vector2(320, 110), new Vector2(0, by - 36), Pal.Azure, () => GetPaths(layer, h), 40);
                return;
            }
            if (lv >= Meta.MaxHeroLv)
            {
                Ui.Outlined(p, "已满级", 56, Pal.Champagne, new Vector2(0, by), new Vector2(400, 80), Pal.Ink, 3f);
                return;
            }
            int sc = Meta.ShardCost(lv), cc = Meta.CopperCost(lv);
            bool shardOk = S.Shards[(int)h] >= sc, copperOk = S.Copper >= cc;
            float cy = by + 22;
            var st = CostTile(p, new Vector2(-370, cy), RaritySlot(d.Rarity), d.Art, $"{S.Shards[(int)h]}/{sc}", shardOk, true);
            Ui.Tap(st, () => GetPaths(layer, h), st.transform.parent);
            var ct = CostTile(p, new Vector2(-200, cy), "slot_wood", "ic_coins", $"{Ui.Num(S.Copper)}/{Ui.Num(cc)}", copperOk, false);
            Ui.Tap(ct, () => GetPaths(layer, null), ct.transform.parent);
            bool can = shardOk && copperOk;
            var up = Ui.Btn(p, "升级", new Vector2(390, 138), new Vector2(200, cy), can ? Pal.Green : Pal.Slate, () => DoLevelUp(layer, h), 56);
            var arrow = Ui.Icon(up.Find("body"), "ic_fast", 66, new Vector2(156, 42), "upArrow");
            arrow.transform.localRotation = Quaternion.Euler(0, 0, 90);
            if (can)
            {
                arrow.color = Pal.Hex("7CFF5A");
                Ui.Breathe(arrow, 6f);
                var glow = Ui.Box(up, new Vector2(540, 250), Vector2.zero, Pal.Gold.A(0.35f), Art.SoftDot, "glow");
                glow.transform.SetAsFirstSibling();
                Tween.Run(glow, 999f, k => glow.color = Pal.Gold.A(0.2f + 0.15f * Mathf.Sin(k * 999f * 4f)));
            }
            else arrow.color = new Color(0.62f, 0.62f, 0.62f);
        }

        /// <summary>字放不下时自动缩小，最小 min。</summary>
        public static Text Fit(Text t, int min)
        {
            t.resizeTextForBestFit = true;
            t.resizeTextMaxSize = t.fontSize;
            t.resizeTextMinSize = min;
            t.verticalOverflow = VerticalWrapMode.Truncate;
            return t;
        }

        static void DoLevelUp(Transform layer, HeroId h)
        {
            int lv = S.HeroLv[(int)h];
            float oldPw = Meta.HeroPower(S, h), oldCd = Meta.LevelCritDmg(S);
            if (!Meta.LevelUp(S, h))
            {
                Sfx.Play(Snd.Deny);
                bool shard = S.Shards[(int)h] < Meta.ShardCost(lv);
                Ui.Toast(shard ? "乡亲碎片不足" : "金币不足", 200);
                GetPaths(layer, shard ? h : (HeroId?)null);
                return;
            }
            Save();
            HeroDetail(layer, h);
            MetaFx.LevelUp(layer, new MetaFx.LevelUpInfo
            {
                Hero = h, NewLv = S.HeroLv[(int)h], OldPower = oldPw, NewPower = Meta.HeroPower(S, h),
                OldCritDmg = oldCd, NewCritDmg = Meta.LevelCritDmg(S),
            });
        }

        /// <summary>好汉页在前台就进页内换人模式（顶上四位头顶出箭头），否则弹选择框。</summary>
        static void BeginSwap(Transform layer, HeroId h)
        {
            var home = Game.I.Home;
            if (home != null && home.Tab == HomeScreen.TabHero) home.BeginSwap(h);
            else PickSwap(layer, h);
        }

        /// <summary>获取途径：hero 为空时是铜钱。</summary>
        public static void GetPaths(Transform layer, HeroId? hero)
        {
            var m = Modal(layer, "paths", "获取途径", new Vector2(860, hero.HasValue ? 860 : 900), out var p, Pal.Hex("3A6A8A"));
            float top = (hero.HasValue ? 860 : 900) * 0.5f;
            var head = Ui.Rect(p, "head");
            head.anchoredPosition = new Vector2(0, top - 150);
            head.sizeDelta = new Vector2(780, 170);
            Ui.Skin(head, "row", new Vector2(780, 170), Vector2.zero, 0.7f);
            if (hero.HasValue)
            {
                var d = Defs.Hero(hero.Value);
                Slot(head, RaritySlot(d.Rarity), 132, new Vector2(-300, 0));
                var mask = Ui.Rect(head, "bustMask");
                mask.sizeDelta = Vector2.one * 102f;
                mask.anchoredPosition = new Vector2(-300, 1);
                mask.gameObject.AddComponent<RectMask2D>();
                Ui.Icon(mask, d.Art, 124, new Vector2(0, -14));
                Ui.Icon(head, "ic_shard", 48, new Vector2(-344, 44));
                Ui.Label(head, d.Name + "碎片", 36, Pal.Ink, new Vector2(-50, 40), new Vector2(360, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
                Ui.Label(head, HeroText.OnLight($"拥有数量：{HeroText.O(S.Shards[(int)hero.Value])}"), 26, Pal.SubInk, new Vector2(240, 40), new Vector2(260, 40), TextAnchor.MiddleRight, Fonts.Heavy);
                Ui.Label(head, $"用于升级{d.Name}，重复摇到会自动折成碎片", 24, Pal.SubInk, new Vector2(60, -30), new Vector2(580, 70), TextAnchor.MiddleLeft);
            }
            else
            {
                Slot(head, "slot_wood", 132, new Vector2(-300, 0));
                Ui.Icon(head, "ic_coins", 94, new Vector2(-300, 2));
                Ui.Label(head, "金币", 36, Pal.Ink, new Vector2(-50, 40), new Vector2(360, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
                Ui.Label(head, HeroText.OnLight($"拥有数量：{HeroText.O(Ui.Num(S.Copper))}"), 26, Pal.SubInk, new Vector2(240, 40), new Vector2(260, 40), TextAnchor.MiddleRight, Fonts.Heavy);
                Ui.Label(head, "乡亲升级、装备强化、点亮潜能都要用到", 24, Pal.SubInk, new Vector2(60, -30), new Vector2(580, 70), TextAnchor.MiddleLeft);
            }
            var rows = new List<(string icon, string name, string sub, Action go)>();
            var home = Game.I.Home;
            void Tab(int t) { Close(m); Close(layer.Find("modal_hero") as RectTransform); home?.SetTab(t); }
            if (hero.HasValue)
            {
                var d = Defs.Hero(hero.Value);
                rows.Add(("prop_drum", "敲锣摇人", "摇到重复乡亲折成碎片", () => Tab(HomeScreen.TabShop)));
                rows.Add(("tab_battle", "主线守村", Meta.Owned(S, hero.Value) ? "胜利后随机给出战乡亲碎片" : "胜利奖励大喇叭券", () => Tab(HomeScreen.TabBattle)));
                if (d.Rarity <= 3) rows.Add(("ic_chest_gold", "章节宝箱", "集星开宝箱得大喇叭券", () => Tab(HomeScreen.TabBattle)));
            }
            else
            {
                rows.Add(("tab_idle", "巡村收益", "离线也在攒金币", () => { Close(m); Idle(layer); }));
                rows.Add(("tab_battle", "主线守村", "每次胜利都有金币", () => Tab(HomeScreen.TabBattle)));
                rows.Add(("tab_shop", "村口供销社", "星钻换一袋金币", () => Tab(HomeScreen.TabShop)));
            }
            for (int i = 0; i < rows.Count; i++)
            {
                var row = rows[i];
                Row(p, top - 340 - i * 150, row.icon, row.name, row.sub, "前往", Pal.Hex("4FB548"), row.go, 780);
            }
        }

        /// <summary>选一个已上阵的好汉换下（不在好汉页时用）。</summary>
        public static void PickSwap(Transform layer, HeroId h)
        {
            var m = Modal(layer, "swap", "替换谁？", new Vector2(960, 560), out var p);
            for (int i = 0; i < 4; i++)
            {
                var od = Defs.Hero((HeroId)S.Lineup[i]);
                var c = Ui.Rect(p, "s" + i);
                c.anchoredPosition = new Vector2((i - 1.5f) * 220, 20);
                c.sizeDelta = new Vector2(200, 260);
                var face = Card(c, RarityCard(od.Rarity), new Vector2(200, 260), Vector2.zero);
                Ui.Icon(c, od.Art, 190, new Vector2(0, 20));
                Ui.Outlined(c, od.Name, 32, Color.white, new Vector2(0, -100), new Vector2(200, 44), Pal.Ink, 2f);
                int idx = i;
                Ui.Tap(face, () =>
                {
                    Meta.SetLineup(S, idx, h);
                    Save();
                    Sfx.Play(Snd.Swap);
                    Close(m);
                    HeroDetail(layer, h);
                    Ui.Toast($"{Defs.Hero(h).Name} 上阵", 200);
                }, c);
            }
            Ui.Label(p, "上阵的四位乡亲会在战斗中被摇出来", 28, Pal.SubInk, new Vector2(0, -200), new Vector2(800, 44));
        }

        // ---------------- 装备详情 / 锻造 ----------------

        static int _sheetSlot = -1, _sheetTab;
        static bool _forgeWash, _forgeFromSheet;
        static int _washTotem;

        static void FromTop(Component c, float x, float yFromTop)
        {
            var rt = c.transform as RectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = new Vector2(x, -yFromTop);
        }

        static void FromBottom(Component c, float x, float yFromBottom)
        {
            var rt = c.transform as RectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = new Vector2(x, yFromBottom);
        }

        static void DropPop(Transform layer, string key)
        {
            var old = layer.Find(key);
            if (old) Object.DestroyImmediate(old.gameObject);
        }

        static string EquipNum(int slot, int lv, int quality)
        {
            if (lv < 0) return "—";
            var d = Meta.Equips[slot];
            float v = Meta.EquipValue(slot, lv, quality);
            string n = d.Pct ? $"{v * 100:0.#}%" : $"{v:0}";
            return (slot == 2 || slot == 5 ? "-" : "+") + n;
        }

        static int EquipScore(int slot)
        {
            var d = Meta.Equips[slot];
            float v = Meta.EquipValue(slot, S.EquipLv[slot], S.EquipQ[slot]);
            int score = d.Pct ? Mathf.RoundToInt(v * 100f) : Mathf.RoundToInt(v);
            int b = slot * Meta.TotemSocketsPerSlot;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                var t = Meta.FindTotem(S, S.TotemEquipped[b + k]);
                if (t != null) score += Meta.TotemAtk(t);
            }
            return score;
        }

        /// <summary>点开装备：顶部统一五阶品质雕花横幅+品质方框图标，中部双段立体切换（图腾镶嵌/装备属性），底部一键直达铁匠铺强化。</summary>
        public static void EquipSheet(Transform layer, int slot, Action changed = null)
        {
            if (slot != _sheetSlot) { _sheetSlot = slot; _sheetTab = 0; }
            bool again = layer.Find("modal_equip") != null;
            DropPop(layer, "modal_equip");
            DropPop(layer, "modal_forge");

            var e = Meta.Equips[slot];
            int lv = S.EquipLv[slot], q = S.EquipQ[slot];
            var root = Ui.Rect(layer, "modal_equip");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var dim = Ui.Fill(root, new Color(0.03f, 0.07f, 0.12f, 0.66f), true, "dim");
            Ui.Tap(dim.GetComponent<Image>(), () => DropPop(layer, "modal_equip"), null, false);

            var card = Ui.Rect(root, "card");
            card.sizeDelta = new Vector2(968, 1140);
            card.anchoredPosition = new Vector2(0, 36);
            var face = Ui.Skin(card, "panel", new Vector2(968, 1140), Vector2.zero, 1f, null, "face");
            face.raycastTarget = true;

            const float top = 570f;
            Color head = QualBanner(q);
            Color stroke = QualStroke(q);
            Color glow = QualGlow(q);

            // 品质顶冠横幅（内嵌于宋瓷浮雕框顶，带柔光舞台与金/银饰底线）
            Ui.Box(card, new Vector2(932, 246), new Vector2(0, top - 139), head, Art.Rounded);
            Ui.Box(card, new Vector2(932, 42), new Vector2(0, top - 241), head, Art.White);
            Ui.Box(card, new Vector2(440, 220), new Vector2(-280, top - 138), glow.A(0.32f), Art.SoftDot);
            Ui.Box(card, new Vector2(932, 4), new Vector2(0, top - 262), glow.A(0.85f), Art.White);
            Ui.Box(card, new Vector2(932, 2), new Vector2(0, top - 265), stroke.A(0.55f), Art.White);

            // 左侧统一五阶雕花品质方框 + 装备大图标
            var iconPos = new Vector2(-346, top - 138);
            if (q >= 2)
                Ui.Box(card, new Vector2(210, 210), iconPos, glow.A(q >= 3 ? 0.45f : 0.30f), Art.SoftDot);
            Slot(card, QualitySlot(q), 156, iconPos);
            Ui.Icon(card, e.Icon, 122, iconPos + new Vector2(0, 2));

            // 名称 + 统一品质徽章 + 等级/战力胶囊
            Ui.SingleLine(Ui.Outlined(card, e.Name, 44, Color.white, new Vector2(-36, top - 86), new Vector2(360, 56), stroke, 2.3f, TextAnchor.MiddleLeft), 28);
            var qTag = Ui.Box(card, new Vector2(94, 38), new Vector2(-180, top - 146), stroke.A(0.75f), Art.Pill);
            Ui.SingleLine(Ui.Outlined(qTag.transform, Meta.QualityName[q], 23, glow, new Vector2(0, 1), new Vector2(90, 38), Pal.Ink, 1.4f), 16);
            var lvBar = Ui.Box(card, new Vector2(288, 38), new Vector2(22, top - 146), new Color(0, 0, 0, 0.24f), Art.Pill);
            Ui.SingleLine(Ui.Outlined(lvBar.transform, $"Lv.{lv}   战力 {EquipScore(slot)}", 24, Color.white, new Vector2(0, 1), new Vector2(276, 38), stroke, 1.5f), 18);

            if (Meta.Breaks(lv) > 0)
                Ui.SingleLine(Ui.Outlined(card, $"◆ {Meta.BreakText(slot, lv)}", 23, Pal.Hex("FFF2B2"), new Vector2(-16, top - 202), new Vector2(420, 34), stroke, 1.5f, TextAnchor.MiddleLeft), 18);
            else
                Ui.SingleLine(Ui.Outlined(card, $"满 10 级突破：{Defs.RoleName(e.Role)}增伤 +4%", 22, new Color(1, 1, 1, 0.88f), new Vector2(-16, top - 202), new Vector2(420, 34), stroke, 1.3f, TextAnchor.MiddleLeft), 18);

            // 右侧主属性大字面板
            var statBox = Ui.Box(card, new Vector2(208, 126), new Vector2(328, top - 142), new Color(0, 0, 0, 0.20f), Art.RoundedSmall);
            Ui.Label(statBox.transform, e.Stat, 24, new Color(1, 1, 1, 0.92f), new Vector2(0, 32), new Vector2(188, 32), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Outlined(statBox.transform, EquipNum(slot, lv, q), 48, Pal.Hex("FFF5C0"), new Vector2(0, -18), new Vector2(196, 58), stroke, 2.2f);

            var x = Ui.Icon(card, "ui/close", 74, new Vector2(436, top - 44), "close");
            Ui.Tap(x, () => DropPop(layer, "modal_equip"), null, false);

            // 双段式立体胶囊切换栏（与寨主抽屉、铁匠铺同款亮金选中皮肤）
            var track = Ui.Box(card, new Vector2(884, 76), new Vector2(0, top - 320), Pal.Hex("6D675D"), Art.Pill);
            Ui.Box(card, new Vector2(876, 68), new Vector2(0, top - 320), Pal.Hex("7E786E"), Art.Pill);
            track.raycastTarget = true;
            for (int i = 0; i < 2; i++)
            {
                bool on = i == _sheetTab;
                float tx = i == 0 ? -218f : 218f;
                Image tab;
                if (on)
                {
                    tab = Ui.Skin(card, "btn_gold", new Vector2(434, 70), new Vector2(tx, top - 319), 0.72f, null, "tab" + i);
                    var tl = Ui.Label(card, i == 0 ? "徽章镶嵌" : "装备属性", 32, Pal.Hex("542F06"), new Vector2(tx, top - 318), new Vector2(380, 56),
                        TextAnchor.MiddleCenter, Fonts.Heavy);
                    var sh = tl.gameObject.AddComponent<Shadow>();
                    sh.effectColor = new Color(1f, 0.98f, 0.88f, 0.65f);
                    sh.effectDistance = new Vector2(0f, -1.3f);
                }
                else
                {
                    tab = Ui.Box(card, new Vector2(428, 64), new Vector2(tx, top - 320), new Color(0, 0, 0, 0), Art.Pill, "tab" + i);
                    Ui.Outlined(card, i == 0 ? "徽章镶嵌" : "装备属性", 30, Pal.Hex("F8F5EE"), new Vector2(tx, top - 319), new Vector2(380, 56), Pal.Hex("464038"), 1.6f);
                }
                tab.raycastTarget = true;
                int ti = i;
                Ui.Tap(tab, () => { _sheetTab = ti; EquipSheet(layer, slot, changed); }, null, false);
            }

            if (_sheetTab == 0) BuildTotemRows(card, slot, layer, changed, top);
            else BuildEquipAttr(card, slot, top);

            var forgeBtn = Ui.Btn(card, "前往强化", new Vector2(436, 106), new Vector2(0, -468), Pal.Gold,
                () => ForgeSlot(layer, slot, changed), 40, null, Pal.Hex("542F06"));
            if (Meta.CanForge(S, slot)) Dot(forgeBtn, new Vector2(196, 40));

            root.SetAsLastSibling();
            if (!again) Tween.Pop(card, 0.2f);
        }

        static void BuildTotemRows(RectTransform card, int slot, Transform layer, Action changed, float top)
        {
            int b = slot * Meta.TotemSocketsPerSlot;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                float y = top - 432 - k * 128;
                bool open = Meta.TotemSocketOpen(S, k);
                var td = open ? Meta.FindTotem(S, S.TotemEquipped[b + k]) : null;
                var row = Ui.Skin(card, "row", new Vector2(886, 118), new Vector2(0, y), 1f,
                    open ? Color.white : Pal.Hex("E4DFD4"), "sock" + k);
                row.raycastTarget = true;
                if (!open)
                {
                    var hex = Ui.Box(row.transform, new Vector2(68, 68), new Vector2(-368, 0), Pal.Hex("C4BEB0"), Art.Hex6);
                    hex.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                    Ui.Icon(row.transform, "ic_lock", 38, new Vector2(-368, 1));
                    int need = Meta.TotemSocketUnlockCleared[k];
                    Ui.Label(row.transform, $"第 {k + 1} 徽章槽 · 通关第 <color=#D04840>{need}</color> 关解锁", 28, Pal.Hex("7A7468"),
                        new Vector2(24, 0), new Vector2(640, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
                }
                else if (td != null)
                {
                    Slot(row.transform, TotemSlot(td.Rarity), 94, new Vector2(-368, 0));
                    Ui.Icon(row.transform, Meta.TotemIcon(td), 76, new Vector2(-368, 2));
                    Ui.SingleLine(Ui.Label(row.transform, Meta.TotemEffectText(td, true), 27, Pal.Hex("26303A"),
                        new Vector2(-18, 15), new Vector2(510, 44), TextAnchor.MiddleLeft, Fonts.Heavy), 20);
                    Ui.SingleLine(Ui.Label(row.transform, $"{Meta.TotemRarityNames[td.Rarity]}徽章 · 攻击 +{Meta.TotemAtk(td)}", 21, QualInk(td.Rarity),
                        new Vector2(-18, -26), new Vector2(510, 30), TextAnchor.MiddleLeft, Fonts.Heavy), 16);
                    int id = td.Id;
                    Ui.Btn(row.transform, "卸下", new Vector2(138, 66), new Vector2(350, 0), Pal.Orange, () =>
                    {
                        Meta.ToggleInlayTotem(S, id);
                        Save();
                        Sfx.Play(Snd.Unlock, 0.7f);
                        EquipSheet(layer, slot, changed);
                        changed?.Invoke();
                    }, 27);
                }
                else
                {
                    var hexRim = Ui.Box(row.transform, new Vector2(72, 72), new Vector2(-368, 0), Pal.Hex("7C92A6"), Art.Hex6);
                    hexRim.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                    var hexIn = Ui.Box(row.transform, new Vector2(60, 60), new Vector2(-368, 0), Pal.Hex("243648"), Art.Hex6);
                    hexIn.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                    Ui.Outlined(row.transform, "+", 38, Pal.Hex("9CC4E4"), new Vector2(-368, 2), new Vector2(60, 60), Pal.Ink, 1.5f);
                    Ui.Label(row.transform, "空镶嵌槽 · 可镶嵌同部位神宠徽章", 27, Pal.Hex("6E7882"),
                        new Vector2(-18, 0), new Vector2(510, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
                    Ui.Btn(row.transform, "去挑选", new Vector2(146, 66), new Vector2(346, 0), Pal.Teal, () =>
                    {
                        DropPop(layer, "modal_equip");
                        Game.I.Home?.SetForgeSubTab(0);
                    }, 26);
                }
            }
        }

        static void BuildEquipAttr(RectTransform card, int slot, float top)
        {
            var e = Meta.Equips[slot];
            int lv = S.EquipLv[slot], q = S.EquipQ[slot];
            var box = Ui.Box(card, new Vector2(886, 496), new Vector2(0, top - 624f), Pal.Hex("EAE4D6"), Art.RoundedSmall);
            box.raycastTarget = false;
            float y = top - 418f;
            AttrHead(card, "基础与神宠加成", ref y);
            AttrLine(card, e.Stat, EquipNum(slot, lv, q), ref y, Pal.GreenDeep);
            AttrLine(card, "装备品质", $"{Meta.QualityName[q]}（基础倍率 ×{(1f + 0.15f * q):0.00}）", ref y, QualInk(q));
            int totem = 0;
            int b = slot * Meta.TotemSocketsPerSlot;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                var t = Meta.FindTotem(S, S.TotemEquipped[b + k]);
                if (t != null) totem += Meta.TotemAtk(t);
            }
            AttrLine(card, "神宠徽章总攻击", "+" + totem, ref y);
            y -= 14f;
            AttrHead(card, "阶位突破加成（每满 10 级激活）", ref y);
            int brk = Meta.Breaks(lv);
            if (brk > 0)
                AttrLine(card, $"当前突破（{brk}阶）", Meta.BreakText(slot, lv), ref y, Pal.Hex("1F68B5"));
            else
                AttrLine(card, "10级突破预告", $"{Defs.RoleName(e.Role)}乡亲伤害 +4%", ref y, Pal.Hex("7C766A"));
        }

        static void AttrHead(RectTransform card, string title, ref float y)
        {
            var mark = Ui.Box(card, new Vector2(14, 14), new Vector2(-400, y), Pal.Hex("C8BBA4"), Art.White);
            mark.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            mark.raycastTarget = false;
            Ui.Label(card, title, 26, Pal.Hex("9A9084"), new Vector2(-20, y), new Vector2(640, 36), TextAnchor.MiddleLeft, Fonts.Heavy);
            y -= 54f;
        }

        static void AttrLine(RectTransform card, string name, string val, ref float y, Color? valColor = null)
        {
            Ui.Label(card, name, 30, Pal.Hex("3A424C"), new Vector2(-80, y), new Vector2(420, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(card, val, 30, valColor ?? Pal.Hex("2C343C"), new Vector2(180, y), new Vector2(300, 44), TextAnchor.MiddleRight, Fonts.Heavy);
            y -= 50f;
        }

        /// <summary>锻造页（v9 精雕版）：汤隆炉火铁砧无缝锁定微拱石檐 + 顶栏资源胶囊 + 等距饱满石碑属性卡 + 琥珀金强化主钮 + 100%完整露出的六部位装备带 + 居中对齐双菱章底栏。</summary>
        public static void ForgeSlot(Transform layer, int slot, Action changed = null, bool wash = false, bool? fromSheet = null)
        {
            _forgeWash = wash;
            if (fromSheet.HasValue) _forgeFromSheet = fromSheet.Value;
            bool again = layer.Find("modal_forge") != null;
            if (!again && !fromSheet.HasValue) _forgeFromSheet = layer.Find("modal_equip") != null;
            DropPop(layer, "modal_equip");
            DropPop(layer, "modal_forge");

            var e = Meta.Equips[slot];
            int lv = S.EquipLv[slot], q = S.EquipQ[slot];
            var root = Ui.Rect(layer, "modal_forge");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            // 宽幅遮罩兼容略宽于 9:16 的编辑器窗口，杜绝两侧露缝
            Ui.Box(root, new Vector2(1280, 3200), Vector2.zero, Pal.Hex("18283A"), Art.White, "backdrop").raycastTarget = true;

            // 1. 铁匠铺炉火近景：锚定工作台顶檐恒贴合在 scene 本地 y=664 处（铁砧底座），向上微收时 y = -sceneShift > 0！
            float sceneUp = Mathf.Clamp(52f - Ui.SafeTop * 0.65f - Ui.Spare * 0.16f, -24f, 52f);
            float sheetTop = 664f - sceneUp;
            var sceneRt = Ui.Rect(root, "scene");
            sceneRt.anchorMin = sceneRt.anchorMax = new Vector2(0.5f, 1f);
            sceneRt.pivot = new Vector2(0.5f, 1f);
            sceneRt.sizeDelta = new Vector2(1080, 810f);
            sceneRt.anchoredPosition = new Vector2(0, sceneUp);
            if (sceneUp < 0f)
                Ui.Box(Ui.Top(root, 0, -sceneUp * 0.5f, new Vector2(1280, -sceneUp + 8f), "sceneTopCap"), new Vector2(1280, -sceneUp + 8f), Vector2.zero, Pal.Hex("2C1E1C"), Art.White);
            var scene = sceneRt.gameObject.AddComponent<Image>();
            scene.sprite = Art.Img("forge_scene");
            scene.raycastTarget = false;

            // 顶部紧凑资源胶囊条（避开右侧微信小游戏胶囊位，铜钱与材料均可点 + 查看获取途径）
            float topBarY = Ui.SafeTop + 46f;
            void ForgeCurPill(float px, string icon, string val, Action onPlus)
            {
                var cp = Ui.Top(root, px, topBarY, new Vector2(202, 50), "fcur_" + icon);
                Ui.Box(cp, new Vector2(188, 44), new Vector2(6, 0), new Color(0.05f, 0.10f, 0.16f, 0.84f), Art.Pill);
                Ui.Box(cp, new Vector2(184, 40), new Vector2(6, 0), new Color(0.75f, 0.86f, 1f, 0.14f), Art.Pill);
                Ui.Icon(cp, icon, 52, new Vector2(-80, 1));
                Ui.Outlined(cp, val, 25, Color.white, new Vector2(onPlus != null ? 0 : 12, 1), new Vector2(124, 40), Pal.Hex("0E1A28"), 1.6f);
                if (onPlus != null)
                {
                    var pRim = Ui.Box(cp, new Vector2(34, 34), new Vector2(82, 0), Pal.Hex("123E22"), Art.Circle);
                    var pFace = Ui.Box(pRim.transform, new Vector2(28, 28), Vector2.zero, Pal.Hex("42D86B"), Art.Circle);
                    Ui.Outlined(pRim.transform, "+", 24, Color.white, new Vector2(0, 1), new Vector2(34, 34), Pal.Hex("124424"), 1.2f);
                    Ui.Tap(pFace, onPlus, cp);
                }
            }
            ForgeCurPill(-388, "ic_ingot", Ui.Num(S.Ingots), null);
            ForgeCurPill(-170, "ic_coins", Ui.Num(S.Copper), () => GetPaths(layer, null));
            ForgeCurPill(48, _forgeWash ? "ic_refine" : "ic_iron",
                _forgeWash ? Ui.Num(S.RefineStones) : Ui.Num(S.Iron),
                () => Ui.Toast(_forgeWash ? "改装芯片：神宠十连寻宝 · 村口供销社 · 活跃宝箱" : "合金钢：主线通关 · 巡村挂机 · 截获补给", 210));

            // 装备悬浮于炉火正中，名称铭牌精准嵌合在青石铁砧前壁两枚金扣之间（y=580）
            Color qGlow = QualColor(q);
            var fireGlow = Ui.Box(sceneRt, new Vector2(350, 350), Vector2.zero, new Color(1f, 0.62f, 0.18f, 0.22f), Art.SoftDot, "fireGlow");
            FromTop(fireGlow, -10f, 382f);
            var halo = Ui.Box(sceneRt, new Vector2(290, 290), Vector2.zero, qGlow.A(0.36f), Art.SoftDot, "halo");
            FromTop(halo, -10f, 378f);
            var ic = Ui.Icon(sceneRt, e.Icon, 236, Vector2.zero);
            FromTop(ic, -10f, 376f);
            Tween.Run(ic, 999f, k =>
            {
                float t = k * 999f;
                ic.rectTransform.anchoredPosition = new Vector2(-10f, -376f + 7f * Mathf.Sin(t * 2.2f));
                halo.color = qGlow.A(0.26f + 0.12f * Mathf.Sin(t * 2.2f));
            });

            var nameBg = Ui.Box(sceneRt, new Vector2(312, 48), Vector2.zero, new Color(0.08f, 0.10f, 0.14f, 0.88f), Art.Pill);
            FromTop(nameBg, -10f, 580f);
            Ui.Box(nameBg.transform, new Vector2(304, 40), Vector2.zero, qGlow.A(0.28f), Art.Pill);
            Ui.SingleLine(Ui.Outlined(nameBg.transform, $"{Meta.QualityName[q]}·{e.Name}", 28, q == 0 ? Pal.Hex("DCFAF0") : QualGlow(q),
                new Vector2(0, 1), new Vector2(296, 44), Pal.Hex("101820"), 2.1f), 20);

            // 2. 下半屏宋石工作台：底边严丝合缝停在 tabBarH=138f 顶沿，绝无任何遮挡！
            const float tabBarH = 138f;
            var sheet = Ui.Rect(root, "sheet");
            sheet.anchorMin = new Vector2(0f, 0f);
            sheet.anchorMax = new Vector2(1f, 1f);
            sheet.offsetMin = new Vector2(0f, tabBarH);
            sheet.offsetMax = new Vector2(0f, -sheetTop);
            float sheetH = Mathf.Max(1080f, Ui.Height - sheetTop - tabBarH);
            float extra = Mathf.Max(0f, sheetH - 1170f);

            var sheetFace = Ui.Box(sheet, new Vector2(1280, sheetH + 40f), new Vector2(0, -24f), Pal.Hex("F2EDE2"), Art.White, "face");
            sheetFace.raycastTarget = true;

            // 高清 4x 超采样微拱折顶石檐（拱顶微越出工作台顶沿压在铁砧深色底座上，与下方米白台面零缝合一）
            var arch = Ui.Box(sheet, new Vector2(1120, 64), Vector2.zero, Color.white, Art.Img("ui/forge_arch"), "arch");
            FromTop(arch, 0, -4f);

            // 三段黄金比例纵向分区计算（自适应 16:9 ~ 21:9，卡片内部等距排满无留白荒漠）
            float stripY = 104f + Mathf.Min(24f, extra * 0.12f);
            float actionY = stripY + 184f + Mathf.Min(34f, extra * 0.16f);
            float cardTop = 44f + Mathf.Min(28f, extra * 0.14f);
            float cardMaxH = sheetH - cardTop - (actionY + 92f);
            float cardH = Mathf.Clamp(cardMaxH, 540f, 640f);
            float cardOffsetTop = cardTop + Mathf.Max(0f, (cardMaxH - cardH) * 0.45f);

            if (!_forgeWash) BuildForgeUpgrade(sheet, cardOffsetTop, cardH, actionY, layer, slot, changed);
            else BuildForgeWash(sheet, cardOffsetTop, cardH, actionY, layer, slot, changed);

            BuildForgeStrip(sheet, stripY, layer, slot, changed);
            BuildForgeTabs(root, tabBarH, layer, slot, changed);

            root.SetAsLastSibling();
            if (!again) Tween.Pop(ic.transform, 0.22f);
        }

        static Image ForgeCostTile(Transform sheet, float x, float actionY, string icon, string text, bool ok)
        {
            var r = Ui.Rect(sheet, "fcost_" + icon);
            r.sizeDelta = new Vector2(142, 152);
            FromBottom(r, x, actionY);
            string skin = icon == "ic_refine" ? "slot_orange" : icon == "ic_coins" ? "slot_wood" : icon == "ic_iron" ? "slot_grey" : "slot_blue";
            var face = Slot(r, skin, 114, new Vector2(0, 16));
            face.raycastTarget = true;
            Ui.Icon(r, icon, 82, new Vector2(0, 18));
            if (!ok)
            {
                var plus = Ui.Box(r, new Vector2(30, 30), new Vector2(42, 58), Pal.Hex("143E22"), Art.Circle);
                Ui.Box(plus.transform, new Vector2(24, 24), Vector2.zero, Pal.Hex("42D86B"), Art.Circle);
                Ui.Outlined(plus.transform, "+", 20, Color.white, new Vector2(0, 1), new Vector2(28, 28), Pal.Hex("124424"), 1.1f);
            }
            string rich = text;
            int slash = text.IndexOf('/');
            if (!ok && slash > 0)
                rich = $"<color=#D9382E>{text.Substring(0, slash)}</color>{text.Substring(slash)}";
            var lbl = Ui.Label(r, rich, 25, Pal.Hex("4E4538"), new Vector2(0, -56), new Vector2(168, 34), TextAnchor.MiddleCenter, Fonts.Heavy);
            lbl.horizontalOverflow = HorizontalWrapMode.Overflow;
            return face;
        }

        static void BuildForgeUpgrade(RectTransform sheet, float cardTop, float cardH, float actionY, Transform layer, int slot, Action changed)
        {
            var e = Meta.Equips[slot];
            int lv = S.EquipLv[slot], q = S.EquipQ[slot], max = Meta.EquipMax(S);
            bool capped = lv >= max;
            var green = Pal.Hex("299826");
            var brown = Pal.Hex("4E361E");
            var ink = Pal.Hex("383129");

            var card = Ui.Rect(sheet, "statCard");
            card.sizeDelta = new Vector2(988, cardH);
            FromTop(card, 0, cardTop + cardH * 0.5f);
            var cardSkin = Ui.Skin(card, "forge_card", new Vector2(988, cardH), Vector2.zero, 1f, null, "cardBg");
            cardSkin.raycastTarget = true;

            float cTop = cardH * 0.5f;
            // 1) 顶部紧凑醒目的大字号等级跃升：+0 ▶▶ +1（左右紧贴鎏金双箭头，视觉重心稳居正中）
            float lvY = cTop - 54f;
            if (capped)
            {
                Ui.Label(card, $"+{lv}（当前上限）", 50, brown, new Vector2(0, lvY), new Vector2(560, 68), TextAnchor.MiddleCenter, Fonts.Heavy);
            }
            else
            {
                Ui.Label(card, $"+{lv}", 58, brown, new Vector2(-146, lvY), new Vector2(200, 70), TextAnchor.MiddleRight, Fonts.Heavy);
                var dArr = Ui.Icon(card, "ui/forge_darrow", 66, new Vector2(0, lvY + 1));
                Tween.Run(dArr, 999f, k => dArr.rectTransform.anchoredPosition = new Vector2(3f * Mathf.Sin(k * 999f * 4.5f), lvY + 1));
                Ui.Label(card, $"+{lv + 1}", 58, green, new Vector2(146, lvY), new Vector2(200, 70), TextAnchor.MiddleLeft, Fonts.Heavy);
            }

            // 2) 主属性对比胶囊条（左对齐属性名，右对齐数值跃升，短数字如 +0 ▶ +2 也紧贴右侧不漂移）
            float statY = cTop - 134f;
            Ui.Box(card, new Vector2(916, 68), new Vector2(0, statY), Pal.Hex("D4CCBC"), Art.Pill);
            Ui.Label(card, e.Stat, 31, ink, new Vector2(-268, statY + 1), new Vector2(296, 52), TextAnchor.MiddleLeft, Fonts.Heavy);
            if (capped)
            {
                Ui.Label(card, EquipNum(slot, lv, q), 33, green, new Vector2(296, statY + 1), new Vector2(240, 52), TextAnchor.MiddleRight, Fonts.Heavy);
            }
            else
            {
                Ui.Label(card, EquipNum(slot, lv, q), 32, ink, new Vector2(178, statY + 1), new Vector2(190, 52), TextAnchor.MiddleRight, Fonts.Heavy);
                Ui.Icon(card, "ui/forge_sarrow", 30, new Vector2(300, statY + 1));
                Ui.Label(card, EquipNum(slot, lv + 1, q), 33, green, new Vector2(396, statY + 1), new Vector2(140, 52), TextAnchor.MiddleLeft, Fonts.Heavy);
            }

            // 3) 精致阴刻石槽虚线分割条
            float divY = cTop - 190f;
            for (int d = -12; d <= 12; d++)
            {
                Ui.Box(card, new Vector2(22, 2.5f), new Vector2(d * 36f, divY), Pal.Hex("C3B9A6"), Art.White);
                Ui.Box(card, new Vector2(22, 1.5f), new Vector2(d * 36f, divY - 2f), new Color(1f, 0.99f, 0.95f, 0.55f), Art.White);
            }

            // 4) 固定完整展示 +10 / +20 / +30 / +40 四档阶位突破里程碑，纵向均匀撑满碑卡底部（零空白荒漠！）
            float availRowsH = cardH - 224f;
            float rowStep = availRowsH / 4f;
            float rowStart = cTop - 208f - rowStep * 0.5f;
            for (int idx = 0; idx < 4; idx++)
            {
                int m = (idx + 1) * 10;
                bool unlocked = lv >= m;
                float ry = rowStart - idx * rowStep;
                Ui.Box(card, new Vector2(916, 62), new Vector2(0, ry), unlocked ? Pal.Hex("EFE6CC") : Pal.Hex("D3CCBA"), Art.Pill);
                var tag = Ui.Box(card, new Vector2(134, 62), new Vector2(-391, ry), unlocked ? Pal.Hex("DFBC62") : Pal.Hex("BEB5A2"), Art.Pill);
                Ui.Label(tag.transform, unlocked ? $"突破+{m}" : $"+{m}", unlocked ? 23 : 26,
                    unlocked ? Pal.Hex("54360A") : Pal.Hex("625A4E"), new Vector2(0, 1), new Vector2(128, 50), TextAnchor.MiddleCenter, Fonts.Heavy);

                var rIcon = Ui.Icon(card, RoleArt(e.Role), 34, new Vector2(-286, ry + 1));
                if (!unlocked) rIcon.color = new Color(0.75f, 0.72f, 0.68f, 0.85f);

                Ui.Label(card, Meta.BreakText(slot, m), 28, unlocked ? Pal.Hex("2E6E24") : Pal.Hex("655D52"),
                    new Vector2(56, ry + 1), new Vector2(610, 50), TextAnchor.MiddleLeft, Fonts.Heavy);

                if (unlocked)
                    Ui.Icon(card, "ic_check", 38, new Vector2(416, ry + 1));
                else
                    Ui.Icon(card, "ic_lock", 38, new Vector2(416, ry + 2));
            }

            // 5) 对称居中的双材料槽 + 3D 琥珀鎏金【强化】主按钮（对标参考图：材料不足时红字提示、主按钮仍保持温润金色可点引路）
            if (capped)
            {
                var capBox = Ui.Box(sheet, new Vector2(880, 82), Vector2.zero, Pal.Hex("E6DFD0"), Art.Pill);
                FromBottom(capBox, 0, actionY + 6);
                Ui.Label(capBox.transform, lv >= 40 ? "护村装备已臻至 +40 满级！" : $"已达当前章节上限（+{max}），继续通关主线自动提升上限",
                    27, Pal.Hex("6E5A3E"), Vector2.zero, new Vector2(840, 64), TextAnchor.MiddleCenter, Fonts.Heavy);
                return;
            }

            int iron = Meta.IronCost(lv), copper = Meta.EquipCopper(lv);
            bool ironOk = S.Iron >= iron, copperOk = S.Copper >= copper;
            // 整组横跨 [-402 .. +402]，严格左右对称！
            var ironTile = ForgeCostTile(sheet, -334, actionY, "ic_iron", $"{Ui.Num(S.Iron)}/{Ui.Num(iron)}", ironOk);
            Ui.Tap(ironTile, () => Ui.Toast("合金钢获取：主线通关 · 巡村挂机 · 截获补给", 210), ironTile.transform.parent);
            var coinTile = ForgeCostTile(sheet, -172, actionY, "ic_coins", $"{Ui.Num(S.Copper)}/{Ui.Num(copper)}", copperOk);
            Ui.Tap(coinTile, () => GetPaths(layer, null), coinTile.transform.parent);

            bool can = Meta.CanForge(S, slot);
            var btn = Ui.Btn(sheet, "强化", new Vector2(452, 112), Vector2.zero, Pal.Gold, () =>
            {
                float before = Meta.TeamPower(S);
                int prevBreak = Meta.Breaks(S.EquipLv[slot]);
                if (!Meta.Forge(S, slot))
                {
                    Sfx.Play(Snd.Deny);
                    bool lackIron = S.Iron < Meta.IronCost(S.EquipLv[slot]);
                    Ui.Toast(lackIron ? "合金钢不足：主线通关、巡村挂机、截获补给可获取" : "金币不足", 210);
                    if (!lackIron) GetPaths(layer, null);
                    return;
                }
                Save();
                Sfx.Play(Snd.Forge, 0.9f);
                if (Meta.Breaks(S.EquipLv[slot]) > prevBreak) Sfx.Play(Snd.Unlock, 0.8f);
                ForgeSlot(layer, slot, changed, false);
                var fp = layer.Find("modal_forge/scene");
                if (fp) MetaFx.Burst(fp, new Vector2(-10, 36), 14, 240);
                MetaFx.StatUp(layer, "战力", before, Meta.TeamPower(S));
                changed?.Invoke();
            }, 44, null, Pal.Hex("542F06"));
            FromBottom(btn, 176, actionY + 6);
            if (can) Dot(btn, new Vector2(204, 44));
        }

        static void BuildForgeWash(RectTransform sheet, float cardTop, float cardH, float actionY, Transform layer, int slot, Action changed)
        {
            var card = Ui.Rect(sheet, "washCard");
            card.sizeDelta = new Vector2(988, cardH);
            FromTop(card, 0, cardTop + cardH * 0.5f);
            var cardSkin = Ui.Skin(card, "forge_card", new Vector2(988, cardH), Vector2.zero, 1f, null, "cardBg");
            cardSkin.raycastTarget = true;

            float cTop = cardH * 0.5f;
            Ui.Label(card, "点选已镶嵌神宠徽章 · 重铸随机强力词条", 29, Pal.Hex("5C5142"),
                new Vector2(0, cTop - 44f), new Vector2(860, 42), TextAnchor.MiddleCenter, Fonts.Heavy);

            int b = slot * Meta.TotemSocketsPerSlot;
            int pickedId = 0;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                var td = Meta.FindTotem(S, S.TotemEquipped[b + k]);
                if (td == null) continue;
                if (pickedId == 0 || td.Id == _washTotem) pickedId = td.Id;
            }
            _washTotem = pickedId;

            float rowStep = (cardH - 96f) / 4f;
            float rowStart = cTop - 80f - rowStep * 0.5f;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                float ry = rowStart - k * rowStep;
                bool open = Meta.TotemSocketOpen(S, k);
                var td = open ? Meta.FindTotem(S, S.TotemEquipped[b + k]) : null;
                bool on = td != null && td.Id == pickedId;

                float rh = Mathf.Min(102f, rowStep - 12f);
                var row = Ui.Box(card, new Vector2(916, rh), new Vector2(0, ry),
                    on ? Pal.Hex("FFF6DC") : open ? Pal.Hex("F6F2E9") : Pal.Hex("D8D0C0"), Art.RoundedSmall, "wash" + k);
                if (on) Ui.Box(row.transform, new Vector2(922, rh + 6f), Vector2.zero, Pal.Hex("E4A828"), Art.RoundedSmall).transform.SetAsFirstSibling();
                row.raycastTarget = true;

                if (!open)
                {
                    var hex = Ui.Box(row.transform, new Vector2(60, 60), new Vector2(-404, 0), Pal.Hex("C0B7A4"), Art.Hex6);
                    hex.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                    Ui.Icon(row.transform, "ic_lock", 36, new Vector2(-404, 1));
                    Ui.Label(row.transform, $"第 {k + 1} 徽章孔 · 通关第 {Meta.TotemSocketUnlockCleared[k]} 关解锁",
                        26, Pal.Hex("746C5E"), new Vector2(18, 0), new Vector2(720, 56), TextAnchor.MiddleLeft, Fonts.Heavy);
                }
                else if (td != null)
                {
                    Slot(row.transform, TotemSlot(td.Rarity), 76, new Vector2(-404, 0));
                    Ui.Icon(row.transform, Meta.TotemIcon(td), 62, new Vector2(-404, 1));
                    Ui.SingleLine(Ui.Label(row.transform, Meta.TotemEffectText(td, true), 27, Pal.Hex("342E26"),
                        new Vector2(18, 0), new Vector2(680, 64), TextAnchor.MiddleLeft, Fonts.Heavy), 20);
                    if (td.Locked) Ui.Icon(row.transform, "ic_lock", 32, new Vector2(414, 0));
                    else if (on) Ui.Icon(row.transform, "ic_check", 36, new Vector2(414, 0));
                    int id = td.Id;
                    Ui.Tap(row, () => { _washTotem = id; ForgeSlot(layer, slot, changed, true); }, row.transform);
                }
                else
                {
                    var hex = Ui.Box(row.transform, new Vector2(64, 64), new Vector2(-404, 0), Pal.Hex("CFC6B2"), Art.RoundedSmall);
                    Ui.Label(hex.transform, "+", 40, Pal.Hex("786E5E"), new Vector2(0, 2), new Vector2(60, 60), TextAnchor.MiddleCenter, Fonts.Heavy);
                    Ui.Label(row.transform, $"第 {k + 1} 徽章孔空闲 · 点击前往镶嵌徽章", 26, Pal.Hex("746A5A"),
                        new Vector2(18, 0), new Vector2(680, 56), TextAnchor.MiddleLeft, Fonts.Heavy);
                    Ui.Tap(row, () => EquipSheet(layer, slot, changed), row.transform);
                }
            }

            if (pickedId == 0)
            {
                var goEquip = Ui.Btn(sheet, "前往镶嵌徽章", new Vector2(400, 108), Vector2.zero, Pal.Teal,
                    () => EquipSheet(layer, slot, changed), 36);
                FromBottom(goEquip, 0, actionY + 6);
                return;
            }
            var cur = Meta.FindTotem(S, _washTotem);
            int cost = cur != null ? Meta.RefineStoneCost(cur.Rarity) : 1;
            bool stoneOk = cur != null && S.RefineStones >= cost;
            var stTile = ForgeCostTile(sheet, -236, actionY, "ic_refine", $"{S.RefineStones}/{cost}", stoneOk);
            Ui.Tap(stTile, () => Ui.Toast("改装芯片获取：神宠十连寻宝 · 村口供销社 · 活跃宝箱", 210), stTile.transform.parent);

            var washBtn = Ui.Btn(sheet, "洗炼词条", new Vector2(420, 112), Vector2.zero, Pal.Gold, () =>
            {
                if (cur == null) return;
                if (cur.Rarity < 2) { Ui.Toast("史诗及以上品质徽章才可洗炼", 200); return; }
                if (cur.Locked) { Ui.Toast("徽章上了锁，先解开再洗炼", 200); return; }
                float before = Meta.TeamPower(S);
                if (!Meta.RefineTotem(S, cur.Id, new Rng(Environment.TickCount)))
                {
                    Sfx.Play(Snd.Deny);
                    Ui.Toast("改装芯片不足：神宠十连、供销社、活跃宝箱可获得", 210);
                    return;
                }
                Save();
                Sfx.Play(Snd.Merge, 0.85f);
                ForgeSlot(layer, slot, changed, true);
                var fp = layer.Find("modal_forge/scene");
                if (fp) MetaFx.Burst(fp, new Vector2(-10, 36), 12, 210);
                float after = Meta.TeamPower(S);
                if (Mathf.Abs(after - before) >= 1f) MetaFx.StatUp(layer, "战力", before, after);
                changed?.Invoke();
            }, 42, null, Pal.Hex("542F06"));
            FromBottom(washBtn, 142, actionY + 6);
        }

        static void BuildForgeStrip(RectTransform sheet, float stripY, Transform layer, int slot, Action changed)
        {
            // 底部六部位装备切换槽托盘（离底 stripY>=104px，与底栏留足 18px+ 净空，100% 完整露出图标与 +等级！）
            var trayRim = Ui.Box(sheet, new Vector2(1036, 174), Vector2.zero, Pal.Hex("CEC5B2"), Art.RoundedSmall, "stripRim");
            FromBottom(trayRim, 0, stripY);
            var stripBg = Ui.Box(sheet, new Vector2(1030, 168), Vector2.zero, Pal.Hex("DFD8C8"), Art.RoundedSmall, "stripTray");
            FromBottom(stripBg, 0, stripY);

            int[] order = { 4, 5, 1, 0, 3, 2 };
            for (int i = 0; i < order.Length; i++)
            {
                int s = order[i];
                float x = (i - 2.5f) * 165f;
                bool on = s == slot;
                int qq = S.EquipQ[s], slv = S.EquipLv[s];

                var tile = Ui.Rect(sheet, "piece" + s);
                tile.sizeDelta = new Vector2(148, 148);
                FromBottom(tile, x, stripY);

                if (on)
                    Ui.Box(tile, new Vector2(168, 168), Vector2.zero, Pal.Gold.A(0.32f), Art.SoftDot, "selGlow");

                var slotFace = Slot(tile, QualitySlot(qq), 140, Vector2.zero);
                slotFace.raycastTarget = true;
                Ui.Icon(tile, Meta.Equips[s].Icon, 94, new Vector2(0, 5));

                // 左上琥珀橙阶位：每满 10 级一阶，+0 是 0 阶，不是下一次突破的等级。
                int tier = Meta.Breaks(slv);
                Ui.Box(tile, new Vector2(68, 27), new Vector2(-34, 51), Pal.Hex("6E3806"), Art.RoundedSmall);
                var badge = Ui.Box(tile, new Vector2(64, 23), new Vector2(-34, 51), Pal.Hex("EA8E24"), Art.RoundedSmall);
                Ui.Outlined(badge.transform, $"{tier}阶", 18, Color.white, new Vector2(0, 0.5f), new Vector2(64, 24), Pal.Hex("5A2E06"), 1.2f);

                // 右下高对比描边强化等级（完整落于方框右下内侧，绝不裁切！）
                Ui.Outlined(tile, $"+{slv}", 24, Color.white, new Vector2(22, -45), new Vector2(86, 30), Pal.Hex("142230"), 2.0f, TextAnchor.MiddleRight);

                if (Meta.CanForge(S, s) && !on && !_forgeWash)
                    Ui.Breathe(Ui.Box(tile, new Vector2(30, 30), new Vector2(49, 49), Color.white, Art.UpArrow));

                if (on)
                {
                    var sel = Ui.Skin(tile, "forge_sel", new Vector2(158, 158), Vector2.zero, 1f, null, "sel");
                    sel.raycastTarget = false;
                }

                int si = s;
                Ui.Tap(slotFace, () => { if (si != slot) ForgeSlot(layer, si, changed, _forgeWash); }, tile);
            }
        }

        static void BuildForgeTabs(RectTransform root, float h, Transform layer, int slot, Action changed)
        {
            // 关键修复：pivot 设为 (0.5, 0.5) 并锚在 y = h*0.5，使所有子元素坐标严格以底栏中心为原点，顶沿精准止于 y = h（138px），绝不向上越界遮挡装备槽！
            var bar = Ui.Rect(root, "forgeTabs");
            bar.anchorMin = bar.anchorMax = new Vector2(0.5f, 0f);
            bar.pivot = new Vector2(0.5f, 0.5f);
            bar.sizeDelta = new Vector2(1080, h);
            bar.anchoredPosition = new Vector2(0, h * 0.5f);

            float halfH = h * 0.5f;
            float extDown = Ui.SafeBottom + 44f;
            var under = Ui.Box(bar, new Vector2(1280, h + extDown), new Vector2(0, -extDown * 0.5f), Pal.Hex("234568"), Art.White, "bar");
            under.raycastTarget = true;

            // 顶沿冷铁锯齿压边（严丝合缝贴在 y = +halfH 交界线上，绝不越过 138px）
            Ui.Box(bar, new Vector2(1280, 8), new Vector2(0, halfH - 4f), Pal.Hex("3D6892"), Art.White);
            Ui.Box(bar, new Vector2(1280, 3), new Vector2(0, halfH + 0.5f), Pal.Hex("152C44"), Art.White);
            for (int i = 0; i < 24; i++)
            {
                var cog = Ui.Box(bar, new Vector2(13, 13), new Vector2((i - 11.5f) * 48f, halfH - 4f), Pal.Hex("3D6892"), Art.RoundedSmall);
                cog.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            }

            // 左下 3D 圆角青蓝返回键（在 138px 底栏内垂直居中）
            var back = Ui.Icon(bar, "ui/forge_back", 128, new Vector2(-432, -2), "back");
            Ui.Tap(back, () =>
            {
                if (_forgeFromSheet) EquipSheet(layer, slot, changed);
                else DropPop(layer, "modal_forge");
            }, back.transform, true);

            // 右侧图文双菱盾页签：【强化】 / 【洗炼】（未选中态同样配深海暗铁菱盾底座，左右体量均衡顶级）
            string[] names = { "强化", "洗炼" };
            string[] icons = { "ic_hammer", "ic_refine" };
            for (int i = 0; i < 2; i++)
            {
                bool on = i == 0 ? !_forgeWash : _forgeWash;
                float x = i == 0 ? 186f : 392f;
                var tab = Ui.Rect(bar, "ft" + i);
                tab.anchoredPosition = new Vector2(x, 0);
                tab.sizeDelta = new Vector2(172, h);
                var hit = Ui.Box(tab, new Vector2(172, h), Vector2.zero, new Color(0, 0, 0, 0), Art.White);
                hit.raycastTarget = true;
                if (on)
                    Ui.Box(tab, new Vector2(154, 126), new Vector2(0, 12), Pal.Hex("5CC4FF").A(0.24f), Art.SoftDot);
                Ui.Icon(tab, on ? "ui/forge_tab_on" : "ui/forge_tab_off", on ? 114 : 102, new Vector2(0, 14));
                var ic = Ui.Icon(tab, icons[i], on ? 64 : 52, new Vector2(0, on ? 16 : 14));
                if (!on) ic.color = new Color(0.76f, 0.86f, 0.96f, 0.88f);
                Ui.Outlined(tab, names[i], on ? 28 : 26, on ? Pal.Hex("FFE88E") : Pal.Hex("C2D6EA"),
                    new Vector2(0, -44), new Vector2(156, 36), Pal.Hex("102236"), on ? 2.0f : 1.6f);
                bool wash = i == 1;
                Ui.Tap(hit, () => { if (wash != _forgeWash) ForgeSlot(layer, slot, changed, wash); }, tab, true);
            }
        }

        // ---------------- 寨主天赋 ----------------

        static string TalentIcon(int i)
        {
            if (i % 10 == 0) return "ic_crown";
            var k = Meta.TalentKind(i);
            return k == Meta.TalentStat.CritDmg ? "ic_rage" : k == Meta.TalentStat.Crit ? "ic_sword" : k == Meta.TalentStat.Wall ? "ic_wall" : k == Meta.TalentStat.Coins ? "ic_silver" : "ic_fast";
        }

        /// <summary>参考视频：竖向一串六边形节点，点亮的部分像水位一样往上涨；点下一个节点直接激活，每个节点加攻击力和一项副属性，上限跟主线通关走。</summary>
        public static void TalentTree(Transform layer, Action changed = null, int riseFrom = -1)
        {
            float ph = Mathf.Min(1640, Ui.Height - Ui.SafeTop - 260);
            var m = Modal(layer, "talent", "村长潜能", new Vector2(1000, ph), out var p, Pal.Hex("3A6A8A"));
            int have = S.Talent, cap = Meta.TalentCap(S);
            Meta.TalentSum(have, out var atk, out var crit, out var cd, out var wall, out var coins, out var spd);
            float top = ph * 0.5f;
            Ui.Skin(p, "dark", new Vector2(920, 190), new Vector2(0, top - 150), 1f);
            Ui.Outlined(p, $"已点亮 {have}/{Meta.TalentMax}", 40, Pal.Hex("FFE08A"), new Vector2(0, top - 96), new Vector2(800, 56), Pal.Ink, 2.5f);
            Fit(Ui.Label(p, $"攻击力 {HeroText.O("+" + atk.ToString("0"))}   暴击率 {HeroText.O("+" + (crit * 100).ToString("0.#") + "%")}   暴击伤害 {HeroText.O("+" + (cd * 100).ToString("0") + "%")}\n防线生命 {HeroText.O("+" + (wall * 100).ToString("0.#") + "%")}   攻速 {HeroText.O("+" + (spd * 100).ToString("0.#") + "%")}   开局能量币 {HeroText.O("+" + coins.ToString("0"))}",
                25, Pal.Cream, new Vector2(0, top - 176), new Vector2(880, 100), TextAnchor.MiddleCenter, Fonts.Heavy), 19);

            float viewH = ph - 470;
            var view = Ui.Rect(p, "view");
            view.sizeDelta = new Vector2(920, viewH);
            view.anchoredPosition = new Vector2(0, top - 250 - viewH * 0.5f);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Box(view, new Vector2(920, viewH), Vector2.zero, Pal.Hex("182C40"), Art.Rounded, "deep");
            var content = Ui.Rect(view, "content");
            const float step = 150;
            int show = Math.Min(Meta.TalentMax, Math.Max(cap, have) + 4);
            float H = show * step + 120;
            content.sizeDelta = new Vector2(920, H);
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            var top0 = Ui.Rect(content, "top");
            top0.anchorMin = top0.anchorMax = new Vector2(0.5f, 1f);
            top0.sizeDelta = Vector2.zero;
            float NodeY(int i) => -(70 + (show - i) * step);

            // 水位：从底部涨到当前点亮的节点
            var water = Ui.Box(top0, new Vector2(920, 10), Vector2.zero, Pal.Hex("2684B0"), Art.White, "water");
            water.rectTransform.pivot = new Vector2(0.5f, 0f);
            water.rectTransform.anchoredPosition = new Vector2(0, -H);
            var surf = Ui.Box(top0, new Vector2(920, 10), Vector2.zero, Pal.Hex("B8F2FF").A(0.85f), Art.White, "surface");
            float Level(int n) => n <= 0 ? 0 : H + NodeY(n) + step * 0.5f;
            void SetWater(float h)
            {
                water.rectTransform.sizeDelta = new Vector2(920, h);
                surf.rectTransform.anchoredPosition = new Vector2(0, -H + h);
            }
            SetWater(Level(riseFrom >= 0 ? riseFrom : have));
            if (riseFrom >= 0 && riseFrom != have)
            {
                float wFrom = Level(riseFrom), wTo = Level(have);
                Tween.Run(water, 0.6f, k => SetWater(Mathf.Lerp(wFrom, wTo, Tween.OutCubic(k))), null, 0.1f);
            }
            for (int i = 0; i < 6; i++)
            {
                var bub = Ui.Box(water.transform, Vector2.one * (10 + i * 3), Vector2.zero, Color.white.A(0.25f), Art.Circle, "bubble");
                bub.rectTransform.anchorMin = bub.rectTransform.anchorMax = new Vector2(0.1f + i * 0.16f, 0);
                float off = i * 0.37f;
                Tween.Run(bub, 999f, k =>
                {
                    float t = (k * 999f * 0.25f + off) % 1f;
                    bub.rectTransform.anchoredPosition = new Vector2(Mathf.Sin(t * 12 + off * 9) * 12, t * Mathf.Max(0, water.rectTransform.sizeDelta.y - 10));
                    bub.color = Color.white.A(0.3f * (1 - t));
                });
            }

            const float cx = -230;
            for (int i = 1; i <= show; i++)
            {
                float y = NodeY(i);
                bool on = i <= have, next = i == have + 1 && i <= cap, locked = i > cap;
                if (i < show)
                {
                    var line = Ui.Box(top0, new Vector2(16, step), new Vector2(cx, y + step * 0.5f), i < have ? Pal.Hex("68F0A0") : Pal.Hex("38526C"), Art.White, "line");
                    line.transform.SetSiblingIndex(2);
                }
                bool big = i % 10 == 0;
                if (next)
                {
                    var glow = Ui.Box(top0, Vector2.one * 220, new Vector2(cx, y), Pal.Gold.A(0.55f), Art.SoftDot, "glow");
                    Tween.Run(glow, 999f, k => glow.transform.localScale = Vector3.one * (1f + 0.12f * Mathf.Sin(k * 999f * 4f)));
                }
                var hx = MetaFx.Hex(top0, TalentIcon(i), big ? 130 : 104, new Vector2(cx, y), locked, big ? 4 : 2);
                if (!on && !locked)
                {
                    hx.Find("frame").GetComponent<Image>().color = next ? Color.white : new Color(0.68f, 0.76f, 0.84f);
                    hx.Find("window/icon").GetComponent<Image>().color = next ? Color.white : new Color(0.72f, 0.78f, 0.85f);
                }
                if (next)
                {
                    var up = Ui.Icon(hx, "ic_fast", 52, new Vector2(56, 52), "up");
                    up.transform.localRotation = Quaternion.Euler(0, 0, 90);
                    up.color = Pal.Hex("68F098");
                    Ui.Breathe(up, 5f);
                }
                var col = on ? Pal.Champagne : next ? Color.white : locked ? Pal.Hex("8CA2B8") : Pal.Hex("C8DAE8");
                Ui.Outlined(top0, $"{i}. {Meta.TalentText(i)}", big ? 30 : 27, col, new Vector2(cx + 100 + 280, y + (next ? 18 : 0)), new Vector2(560, 50), Pal.Ink, 1.5f, TextAnchor.MiddleLeft);
                if (next) Ui.Outlined(top0, $"点击激活 · 金币 {Ui.Num(Meta.TalentCost(i))}", 24, S.Copper >= Meta.TalentCost(i) ? Pal.Hex("8CFFAA") : Pal.Hex("FF8A7A"),
                    new Vector2(cx + 100 + 280, y - 22), new Vector2(560, 36), Pal.Ink, 1.5f, TextAnchor.MiddleLeft);
                int idx = i;
                var hit = Ui.Box(hx, new Vector2(130, 150), Vector2.zero, new Color(0, 0, 0, 0.001f), Art.White, "hit");
                Ui.Tap(hit, () =>
                {
                    if (idx == S.Talent + 1) Learn(layer, changed);
                    else if (idx <= S.Talent) Ui.Hint(hx, "已点亮", Meta.TalentText(idx));
                    else if (idx > Meta.TalentCap(S)) Ui.Hint(hx, "尚未解锁", "继续通关主线解锁（每关 +3）");
                    else Ui.Hint(hx, "还不能点", "先点亮下面的潜能");
                }, hx);
            }
            float total = content.sizeDelta.y;
            float focus = -NodeY(Math.Max(1, have + 1));
            content.anchoredPosition = new Vector2(0, Mathf.Clamp(focus - viewH * 0.6f, 0, Mathf.Max(0, total - viewH)));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit").transform.SetAsFirstSibling();

            float by = -top + 110;
            if (have >= Meta.TalentMax)
            {
                Ui.Outlined(p, "潜能已全部点亮", 44, Pal.Champagne, new Vector2(0, by), new Vector2(600, 60), Pal.Ink, 3f);
                return;
            }
            if (have >= cap)
            {
                Ui.Label(p, "继续通关主线解锁更多潜能（每关 +3）", 32, Pal.Ink, new Vector2(0, by), new Vector2(880, 50), TextAnchor.MiddleCenter, Fonts.Heavy);
                return;
            }
            int cost = Meta.TalentCost(have + 1);
            Ui.Icon(p, "ic_coins", 64, new Vector2(-330, by));
            Ui.Outlined(p, $"{Ui.Num(S.Copper)}/{Ui.Num(cost)}", 34, S.Copper >= cost ? Color.white : Pal.Hex("FF8070"), new Vector2(-160, by), new Vector2(300, 50), Pal.Ink, 2f);
            bool can = Meta.CanTalent(S);
            Ui.Btn(p, "激活", new Vector2(300, 120), new Vector2(240, by), can ? Pal.Green : Pal.Slate, () => Learn(layer, changed), 46);
        }

        static void Learn(Transform layer, Action changed)
        {
            int before = S.Talent;
            if (!Meta.LearnTalent(S))
            {
                Sfx.Play(Snd.Deny);
                if (S.Talent >= Meta.TalentCap(S)) Ui.Toast("继续通关主线解锁更多潜能", 200);
                else { Ui.Toast("金币不足", 200); GetPaths(layer, null); }
                return;
            }
            Save();
            TalentTree(layer, changed, before);
            MetaFx.TalentUp(layer, TalentIcon(S.Talent), Meta.TalentText(S.Talent));
            changed?.Invoke();
        }
    }
}
