using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>每日任务（活跃宝箱）、七日目标、招募冲刺、每日福利（v2 旗舰重构：木栓暖米黄挂板 + 等大活跃方块 + 清爽胶囊条 + 立体三态横条 + 侧边书签）。</summary>
    public static partial class MetaUi
    {
        static readonly Color Claim = Pal.Gold;
        static readonly Color Grass = Pal.Green;
        static readonly Color WarmTitle = Pal.Hex("443322");
        static readonly Color WarmSub = Pal.Hex("7C6852");

        // ---------------- 通用部件 ----------------

        /// <summary>可上下拖的列表：well 为 true 时在视口外包一层微凹暖米槽底（modal_well），让横条队列层次清晰如参考图。</summary>
        static RectTransform ScrollList(Transform p, float w, float top, float bottom, float contentH, float cx = 0f, bool well = true)
        {
            float h = top - bottom;
            Vector2 center = new Vector2(cx, (top + bottom) * 0.5f);
            if (well)
            {
                var wellBg = Ui.Skin(p, "modal_well", new Vector2(w + 20f, h + 18f), center, 1f, null, "listWell");
                wellBg.raycastTarget = false;
            }
            var view = Ui.Rect(p, "view");
            view.sizeDelta = new Vector2(w, h);
            view.anchoredPosition = center;
            view.gameObject.AddComponent<RectMask2D>();
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(w, Mathf.Max(h, contentH));
            content.anchoredPosition = Vector2.zero;
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.viewport = view;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.elasticity = 0.08f;
            sr.scrollSensitivity = 40f;
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit").transform.SetAsFirstSibling();
            return content;
        }

        static RectTransform TopChild(Transform content, string name, float y, Vector2 size)
        {
            var r = Ui.Rect(content, name);
            r.anchorMin = r.anchorMax = new Vector2(0.5f, 1f);
            r.anchoredPosition = new Vector2(0, y);
            r.sizeDelta = size;
            return r;
        }

        /// <summary>与道具方格 100% 等大对齐的活跃度/积分奖励格（复刻参考图 1 左侧并列蓝色活跃牌 + 道具框的工整阵列）。</summary>
        static RectTransform PointsTile(Transform p, int points, Vector2 pos, float size, string tipTitle, string tipBody)
        {
            var t = Ui.Rect(p, "ptsTile");
            t.anchoredPosition = pos;
            t.sizeDelta = Vector2.one * size;
            var face = Slot(t, "slot_blue", size + 6f, Vector2.zero);
            Ui.Icon(t, "ic_active", size * 0.68f, new Vector2(0, size * 0.05f));
            Ui.Outlined(t, points.ToString(), Mathf.Max(22, Mathf.RoundToInt(size * 0.205f)), Color.white,
                new Vector2(-size * 0.10f, -size * 0.29f), new Vector2(size * 0.84f, size * 0.28f),
                Pal.Hex("18222E"), 1.8f, TextAnchor.MiddleRight);
            Ui.Tap(face, () => Ui.Hint(t, tipTitle, tipBody), t);
            return t;
        }

        enum RowState { Go, Claim, Taken, Locked }

        /// <summary>对标参考图 1 的标准任务横条：左侧等大方格阵列（道具 + 积分卡），中部暖棕标题 + 清爽胶囊进度条，右侧琥珀金领取 / 青翠前往立体按钮。</summary>
        static void ProgressRow(RectTransform r, float w, IList<Item> rewards, string title, int cur, int need, RowState st,
            Action claim, Action go, Transform tipLayer, int points = 0, string ptsTitle = "活跃度", string ptsDesc = "完成日常任务获取，集满可开启上方活跃宝箱")
        {
            string rowSkin = st == RowState.Claim ? "row_claim" : (st == RowState.Taken || st == RowState.Locked) ? "row_done" : "row";
            Ui.Skin(r, rowSkin, new Vector2(w, 134f), Vector2.zero, 1f, null, "card");

            const float tileSz = 92f;
            const float tileStep = 100f;
            float x = -w * 0.5f + 66f;
            int slotCount = (rewards?.Count ?? 0) + (points > 0 ? 1 : 0);

            if (rewards != null)
            {
                foreach (var it in rewards)
                {
                    var tl = ItemTile(r, it, new Vector2(x, 1f), tileSz, false, tipLayer);
                    if (st == RowState.Taken)
                        foreach (var img in tl.GetComponentsInChildren<Image>()) img.color = img.color.Mul(0.82f);
                    x += tileStep;
                }
            }
            if (points > 0)
            {
                var pt = PointsTile(r, points, new Vector2(x, 1f), tileSz, ptsTitle, ptsDesc);
                if (st == RowState.Taken)
                    foreach (var img in pt.GetComponentsInChildren<Image>()) img.color = img.color.Mul(0.82f);
                x += tileStep;
            }

            // 中部标题与清爽窄胶囊进度条严格同左沿对齐
            float textLeft = x - tileSz * 0.5f + (slotCount <= 1 ? 26f : 18f);
            float btnW = 176f;
            float btnCenterX = w * 0.5f - btnW * 0.5f - 22f;
            float textRight = btnCenterX - btnW * 0.5f - 20f;
            float midW = Mathf.Max(180f, textRight - textLeft);
            float midCenterX = textLeft + midW * 0.5f;

            Color titleCol = st == RowState.Taken ? Pal.Hex("8C8274") : WarmTitle;
            Fit(Ui.Label(r, title, 30, titleCol, new Vector2(midCenterX, 24f), new Vector2(midW, 44f), TextAnchor.MiddleLeft, Fonts.Heavy), 22);

            float frac = cur / (float)Mathf.Max(1, need);
            Color barFill = st == RowState.Claim || cur >= need ? Pal.Hex("58C2EE") : Grass;
            Bar(r, new Vector2(midCenterX, -24f), new Vector2(midW, 24f), frac, barFill, $"{Mathf.Min(cur, need)}/{need}");

            var bpos = new Vector2(btnCenterX, 1f);
            switch (st)
            {
                case RowState.Taken:
                    var chk = Ui.Icon(r, "ic_check", 42f, bpos + new Vector2(-46f, 0f));
                    chk.color = new Color(1f, 1f, 1f, 0.85f);
                    Ui.Label(r, "已领取", 28, Pal.Hex("8A8276"), bpos + new Vector2(20f, 0f), new Vector2(120, 48), TextAnchor.MiddleLeft, Fonts.Heavy);
                    break;
                case RowState.Claim:
                    var cb = Ui.Btn(r, "领取", new Vector2(btnW, 80f), bpos, Claim, claim, 32);
                    Dot(cb, new Vector2(btnW * 0.5f - 10f, 32f));
                    break;
                case RowState.Locked:
                    Ui.Btn(r, "未开启", new Vector2(btnW, 78f), bpos, Pal.Slate, () => Ui.Toast("还没到这一天", 200), 28);
                    break;
                default:
                    if (go != null) Ui.Btn(r, "前往", new Vector2(btnW, 80f), bpos, Pal.Teal, go, 32);
                    else Ui.Label(r, "进行中", 28, WarmSub, bpos, new Vector2(btnW, 52), TextAnchor.MiddleCenter, Fonts.Heavy);
                    break;
            }
        }

        /// <summary>复刻参考图 1 顶部木栓暖米黄积分挂板：左侧大积分徽章 + 等间距一字排开的奖励箱（绝不再按非线性比例挤成一团！）。</summary>
        static void BoxBar(Transform p, float y, float w, int points, int[] need, Func<int, bool> opened, Func<int, bool> can,
            Action<int> open, string[] icons, Func<int, IList<Item>> preview, Transform tipLayer)
        {
            const float trayH = 186f;
            var tray = Ui.Rect(p, "boxTray");
            tray.anchoredPosition = new Vector2(0, y);
            tray.sizeDelta = new Vector2(w, trayH);
            Ui.Skin(tray, "quest_tray", new Vector2(w, trayH), Vector2.zero, 1f, null, "trayBg");

            int count = need.Length;
            float leftBadgeX = -w * 0.5f + 78f;
            float firstX = leftBadgeX + 144f;
            float lastX = w * 0.5f - 70f;
            float span = Mathf.Max(200f, lastX - firstX);
            float trackStart = leftBadgeX + 46f;
            float trackW = lastX - trackStart;

            // 分段计算视觉进度（因为宝箱等距排列，按当前积分落在哪两个门槛之间插值，视觉 100% 精准对应每个宝箱节点！）
            float segProg = 0f;
            for (int k = 0; k < count; k++)
            {
                int prevNeed = k == 0 ? 0 : need[k - 1];
                float nodeFrac0 = k == 0 ? 0f : (firstX + span * (k - 1) / Mathf.Max(1, count - 1) - trackStart) / trackW;
                float nodeFrac1 = (firstX + span * k / Mathf.Max(1, count - 1) - trackStart) / trackW;
                if (points >= need[k])
                {
                    segProg = nodeFrac1;
                }
                else if (points > prevNeed)
                {
                    float localT = (points - prevNeed) / (float)Mathf.Max(1, need[k] - prevNeed);
                    segProg = Mathf.Lerp(nodeFrac0, nodeFrac1, localT);
                    break;
                }
                else break;
            }

            // 贯穿各节点的清爽胶囊进度连接轨道
            Bar(tray, new Vector2(trackStart + trackW * 0.5f, 4f), new Vector2(trackW, 20f), segProg, Claim);

            // 左侧当前总活跃/总积分花瓣圆章（压在轨道起点之上）
            var badge = Ui.Rect(tray, "curPts");
            badge.anchoredPosition = new Vector2(leftBadgeX, 6f);
            badge.sizeDelta = new Vector2(112, 128);
            Slot(badge, "slot_orange", 96f, new Vector2(0, 10f));
            Ui.Icon(badge, "ic_active", 72f, new Vector2(0, 12f));
            Ui.Outlined(badge, points.ToString(), 28, Color.white, new Vector2(0, -48f), new Vector2(110, 36), Pal.Hex("4A2E14"), 2.2f);

            // 等间距排布 5 个阶段宝箱（彻底消除 50 与 100 贴脸拥挤！）
            for (int k = 0; k < count; k++)
            {
                int kk = k;
                float bx = count == 1 ? (firstX + lastX) * 0.5f : firstX + span * k / (count - 1);
                var c = Ui.Rect(tray, "box" + k);
                c.anchoredPosition = new Vector2(bx, 10f);
                c.sizeDelta = new Vector2(108, 128);

                bool o = opened(k), ok = can(k);
                string boxSlot = k >= count - 1 ? "slot_orange" : k >= count - 2 ? "slot_purple" : k >= 1 ? "slot_blue" : "slot_wood";
                var slotImg = Slot(c, boxSlot, 90f, new Vector2(0, 8f));
                if (o) slotImg.color = new Color(0.84f, 0.84f, 0.84f, 0.85f);

                if (ok)
                {
                    var glow = Ui.Box(c, new Vector2(138, 138), new Vector2(0, 8f), Pal.Gold.A(0.48f), Art.SoftDot);
                    glow.transform.SetAsFirstSibling();
                    Tween.Run(glow, 999f, t => glow.color = Pal.Gold.A(0.28f + 0.22f * Mathf.Sin(t * 999f * 5f)));
                }

                var ic = Ui.Icon(c, o ? "ic_chest_open" : icons[Mathf.Min(k, icons.Length - 1)], 74f, new Vector2(0, 10f));
                if (o) ic.color = new Color(0.9f, 0.9f, 0.9f, 0.72f);

                // 箱底清晰门槛数字（暖深棕粗体，如同参考图 20 / 50 / 80 / 100）
                if (o)
                {
                    Check(c, new Vector2(28f, -18f), 30f);
                    Ui.Label(c, "已领", 22, WarmSub, new Vector2(0, -52f), new Vector2(96, 30), TextAnchor.MiddleCenter, Fonts.Heavy);
                }
                else
                {
                    Ui.Label(c, need[k].ToString(), 24, ok ? Pal.Hex("B85C08") : WarmTitle,
                        new Vector2(0, -52f), new Vector2(96, 30), TextAnchor.MiddleCenter, Fonts.Heavy);
                }

                if (ok)
                {
                    Dot(c, new Vector2(36f, 44f));
                    var t0 = ic.transform;
                    Tween.Run(ic, 999f, t => t0.localRotation = Quaternion.Euler(0, 0, 6.5f * Mathf.Sin(t * 999f * 8.5f)));
                }

                var hit = Ui.Box(c, new Vector2(104, 124), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
                Ui.Tap(hit, () =>
                {
                    if (can(kk)) open(kk);
                    else if (opened(kk)) Ui.Toast("已经领过了", 200);
                    else BoxPreview(tipLayer, preview(kk), $"积分达到 {need[kk]} 即可开启领取");
                }, c);
            }
        }

        /// <summary>宝箱没到门槛时看一眼里面有什么。</summary>
        static void BoxPreview(Transform layer, IList<Item> items, string hint)
        {
            var m = Modal(layer, "boxPreview", "宝箱奖励预览", new Vector2(820, 540), out var p, Pal.Gold);
            ItemRow(p, new List<Item>(items), new Vector2(0, 48), 128);
            Ui.Label(p, hint, 28, WarmSub, new Vector2(0, -148), new Vector2(740, 42), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Btn(p, "知道了", new Vector2(240, 86), new Vector2(0, -214), Pal.Teal, () => Close(m), 34);
        }

        static readonly string[] ChestIcons = { "ic_chest_wood", "ic_chest_silver", "ic_chest_silver", "ic_chest_gold", "ic_chest" };

        // ---------------- 每日任务 ----------------

        public static void Tasks(Transform layer)
        {
            float ph = Mathf.Min(1380f, Ui.Height - Ui.SafeTop - 220f);
            var m = Modal(layer, "tasks", "每日任务", new Vector2(960, ph), out var p);
            float top = ph * 0.5f;

            // 1. 顶部木栓暖米黄活跃宝箱挂板（贴近卷轴下方，干脆利落不啰嗦）
            BoxBar(p, top - 162f, 876f, Meta.ActPoints(S), Meta.ActBoxNeed, k => (S.ActBox & (1 << k)) != 0, k => Meta.CanActBox(S, k), k =>
            {
                var got = Meta.OpenActBox(S, k);
                if (got == null) return;
                Save();
                Tasks(layer);
                ShowRewards(layer, "活跃宝箱", new List<Item>(got));
            }, ChestIcons, Meta.ActBoxReward, layer);

            // 2. 下部微凹槽包裹的任务卡片列表
            var order = new List<int>();
            for (int pass = 0; pass < 3; pass++)
                for (int i = 0; i < Meta.Tasks.Length; i++)
                {
                    bool taken = Meta.TaskTaken(S, i), done = Meta.TaskDone(S, i);
                    if ((pass == 0 && done && !taken) || (pass == 1 && !done) || (pass == 2 && taken)) order.Add(i);
                }

            float listTop = top - 274f;
            float listBot = -top + 54f;
            const float step = 146f;
            var content = ScrollList(p, 876f, listTop, listBot, order.Count * step + 14f);
            for (int n = 0; n < order.Count; n++)
            {
                int i = order[n];
                var t = Meta.Tasks[i];
                var r = TopChild(content, "task" + i, -74f - n * step, new Vector2(860, 134));
                var st = Meta.TaskTaken(S, i) ? RowState.Taken : Meta.TaskDone(S, i) ? RowState.Claim : RowState.Go;
                Action go = t.Kind == Act.Login ? null : (Action)(() => { Close(m); Game.I.Home?.Goto(t.Kind); });
                ProgressRow(r, 860f, new[] { t.Reward }, t.Name, Meta.TaskCount(S, i), t.Need, st, () =>
                {
                    if (!Meta.ClaimTask(S, i)) return;
                    Save();
                    Tasks(layer);
                    ShowRewards(layer, $"任务奖励 · 活跃度 +{t.Points}", new List<Item> { t.Reward });
                }, go, layer, t.Points);
            }
        }

        // ---------------- 七日目标 ----------------

        static int _sevenDay;

        public static void Seven(Transform layer, int day = 0)
        {
            int today = Profile.Today, now = Mathf.Clamp(Meta.DayNo(S, today), 1, Meta.SevenDays);
            if (day <= 0) day = _sevenDay > 0 ? _sevenDay : FirstSevenDay(today, now);
            _sevenDay = day;

            float ph = Mathf.Min(1440f, Ui.Height - Ui.SafeTop - 200f);
            var m = Modal(layer, "seven", "七日目标", new Vector2(1000, ph), out var p, Pal.Gold);
            float top = ph * 0.5f;

            var hd = Defs.Hero(Meta.SevenHero);
            Ui.Label(p, $"完成目标攒积分，集满 350 积分请出传说猛将 <color=#C85A14>{hd.Nick}·{hd.Name}</color>", 26, WarmTitle,
                new Vector2(0, top - 82f), new Vector2(900, 38), TextAnchor.MiddleCenter, Fonts.Heavy);

            // 1. 顶部木栓暖米黄七日积分挂板（50 / 100 / 175 / 250 / 350 等间距大气排布！）
            BoxBar(p, top - 204f, 916f, Meta.SevenPointsOf(S), Meta.SevenBoxNeed, k => (S.SevenBox & (1 << k)) != 0, k => Meta.CanSevenBox(S, k), k =>
            {
                var got = Meta.OpenSevenBox(S, k, out var unlock);
                if (got == null) return;
                Save();
                Seven(layer);
                ShowRewards(layer, "七日积分宝箱", new List<Item>(got), unlock);
            }, ChestIcons, Meta.SevenBoxReward, layer);

            // 2. 左侧 7 枚高清立体三态日签（选中青翠、可切暖白、未开冷灰蓝，彻底告别发灰糊边！）
            float bodyTop = top - 318f;
            float bodyBot = -top + 96f;
            float tabSpan = bodyTop - bodyBot;
            float tabStep = tabSpan / Meta.SevenDays;
            float tabH = Mathf.Clamp(tabStep - 10f, 102f, 118f);

            for (int d = 1; d <= Meta.SevenDays; d++)
            {
                int dd = d;
                bool open = d <= now, on = d == day;
                float ty = bodyTop - (d - 0.5f) * tabStep;
                var tab = Ui.Rect(p, "day" + d);
                tab.anchoredPosition = new Vector2(-392f, ty);
                tab.sizeDelta = new Vector2(142f, tabH);

                string vSkin = on ? "vtab_on" : open ? "vtab_off" : "vtab_lock";
                var face = Ui.Skin(tab, vSkin, new Vector2(142f, tabH), Vector2.zero, 1f, null, "face");

                if (on)
                {
                    Ui.Outlined(tab, $"第{d}天", 29, Color.white, new Vector2(0, d == now ? 14f : 2f), new Vector2(132, 40), Pal.Hex("0E4440"), 2.0f);
                    if (d == now)
                        Ui.Outlined(tab, "今天", 20, Pal.Hex("FFF3A8"), new Vector2(0, -22f), new Vector2(110, 28), Pal.Hex("0E4440"), 1.5f);
                }
                else if (open)
                {
                    Ui.Label(tab, $"第{d}天", 28, WarmTitle, new Vector2(0, d == now ? 14f : 2f), new Vector2(132, 40), TextAnchor.MiddleCenter, Fonts.Heavy);
                    if (d == now)
                        Ui.Label(tab, "今天", 20, Pal.Hex("C86E14"), new Vector2(0, -22f), new Vector2(110, 28), TextAnchor.MiddleCenter, Fonts.Heavy);
                }
                else
                {
                    Ui.Label(tab, $"第{d}天", 26, Pal.Hex("586878"), new Vector2(0, 16f), new Vector2(132, 36), TextAnchor.MiddleCenter, Fonts.Heavy);
                    var lk = Ui.Icon(tab, "ic_lock", 34f, new Vector2(0, -20f));
                    lk.color = new Color(1f, 1f, 1f, 0.88f);
                }

                int badge = open ? Meta.DayBadge(S, d, today) : 0;
                if (badge > 0) Dot(tab, new Vector2(54f, tabH * 0.5f - 12f), badge);
                Ui.Tap(face, () => Seven(layer, dd), tab);
            }

            // 3. 右侧微凹槽包裹的当日 5 项任务卡片列表
            bool dayOpen = day <= now;
            var dayGoals = new List<int>();
            for (int pass = 0; pass < 3; pass++)
                for (int i = 0; i < Meta.Goals.Length; i++)
                {
                    if (Meta.Goals[i].Day != day) continue;
                    bool taken = Meta.GoalTaken(S, i), done = Meta.GoalDone(S, i);
                    if (!dayOpen) { if (pass == 0) dayGoals.Add(i); }
                    else if ((pass == 0 && done && !taken) || (pass == 1 && !done) || (pass == 2 && taken)) dayGoals.Add(i);
                }

            const float gStep = 146f;
            var content = ScrollList(p, 748f, bodyTop, bodyBot, dayGoals.Count * gStep + 14f, 84f, true);
            for (int rIdx = 0; rIdx < dayGoals.Count; rIdx++)
            {
                int i = dayGoals[rIdx];
                var g = Meta.Goals[i];
                var r = TopChild(content, "goal" + i, -74f - rIdx * gStep, new Vector2(734, 134));
                int idx = i;
                var st = !dayOpen ? RowState.Locked : Meta.GoalTaken(S, i) ? RowState.Taken : Meta.GoalDone(S, i) ? RowState.Claim : RowState.Go;
                ProgressRow(r, 734f, g.Reward, g.Name, Meta.GoalValue(S, g), g.Need, st, () =>
                {
                    var got = Meta.ClaimGoal(S, idx, today);
                    if (got == null) return;
                    Save();
                    Seven(layer);
                    ShowRewards(layer, $"七日目标 · 积分 +{Meta.SevenPoints}", new List<Item>(got));
                }, () => { Close(m); Game.I.Home?.Goto(g.Act); }, layer);
            }

            string tip = dayOpen ? $"每完成 1 个目标 +{Meta.SevenPoints} 积分，后续天数的目标也可提前累积进度" : $"第 {day} 天零点解锁领取，当前可提前累积任务进度";
            Ui.Label(p, tip, 24, WarmSub, new Vector2(84f, -top + 52f), new Vector2(748, 36), TextAnchor.MiddleCenter, Fonts.Heavy);
        }

        /// <summary>打开时先跳到有奖可领的那天，没有就跳今天。</summary>
        static int FirstSevenDay(int today, int now)
        {
            for (int d = 1; d <= now; d++) if (Meta.DayBadge(S, d, today) > 0) return d;
            return now;
        }

        // ---------------- 招募冲刺 ----------------

        public static void Sprint(Transform layer, int tab = 0)
        {
            int today = Profile.Today;
            float ph = Mathf.Min(1420f, Ui.Height - Ui.SafeTop - 200f);
            var m = Modal(layer, "sprint", "摇人冲刺", new Vector2(980, ph), out var p, Pal.Gold);
            float top = ph * 0.5f;

            // 顶部深海石青横幅展示舞台
            var stage = Ui.Rect(p, "sprintStage");
            stage.anchoredPosition = new Vector2(0, top - 148f);
            stage.sizeDelta = new Vector2(896, 148);
            Ui.Skin(stage, "dark", new Vector2(896, 148), Vector2.zero, 1f);
            Ui.Icon(stage, "tab_sprint", 122, new Vector2(-364, 2));
            Ui.GradOutlined(stage, $"本轮已摇人 {Meta.SprintPulls(S)} 次", 36, Color.white, Pal.Hex("FFE692"),
                new Vector2(-28, 22), new Vector2(460, 48), Pal.Ink, 2.4f, TextAnchor.MiddleLeft);
            Ui.Label(stage, $"每轮 {Meta.SprintDays} 天 · 剩余 <color=#FFE074>{Meta.SprintDaysLeft(S, today)}</color> 天 · 摇人越多返利越丰厚", 23, Pal.Hex("D2E6F8"),
                new Vector2(-28, -24), new Vector2(470, 36), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Btn(stage, "去摇人", new Vector2(196, 82), new Vector2(328, 0), Pal.Gold, () => { Close(m); Game.I.Home?.Goto(Act.Recruit); }, 32);

            // 双段式胶囊切换栏（冲刺目标 / 冲刺任务）
            float segY = top - 270f;
            var segBg = Ui.Skin(p, "modal_well", new Vector2(896, 82), new Vector2(0, segY), 1f, null, "segTrack");
            segBg.raycastTarget = true;
            string[] tabs = { "冲刺目标", "冲刺任务" };
            int[] badges = { Meta.SprintTierBadge(S), Meta.SprintTaskBadge(S) };
            for (int i = 0; i < 2; i++)
            {
                int ti = i;
                bool on = i == tab;
                float sx = (i - 0.5f) * 438f;
                if (on)
                {
                    var pill = Ui.Skin(p, "vtab_on", new Vector2(436, 68), new Vector2(sx, segY + 1f), 0.72f, null, "seg" + i);
                    Ui.Outlined(p, tabs[i], 32, Color.white, new Vector2(sx, segY + 2f), new Vector2(400, 56), Pal.Hex("0E4440"), 2.0f);
                    Ui.Tap(pill, () => Sprint(layer, ti));
                    if (badges[i] > 0) Dot(pill.transform, new Vector2(196, 24), badges[i]);
                }
                else
                {
                    var hit = Ui.Box(p, new Vector2(436, 68), new Vector2(sx, segY), new Color(0, 0, 0, 0), Art.White, "seg" + i);
                    Ui.Label(p, tabs[i], 30, WarmSub, new Vector2(sx, segY), new Vector2(400, 56), TextAnchor.MiddleCenter, Fonts.Heavy);
                    Ui.Tap(hit, () => Sprint(layer, ti));
                    if (badges[i] > 0) Dot(hit.transform, new Vector2(196, 24), badges[i]);
                }
            }

            int n = tab == 0 ? Meta.SprintTierNeed.Length : Meta.SprintTasks.Length;
            var order = new List<int>();
            for (int pass = 0; pass < 3; pass++)
                for (int i = 0; i < n; i++)
                {
                    bool taken = tab == 0 ? (S.SprintTier & (1 << i)) != 0 : Meta.SprintTaskTaken(S, i);
                    bool can = tab == 0 ? Meta.CanSprintTier(S, i) : Meta.CanSprintTask(S, i);
                    if ((pass == 0 && can) || (pass == 1 && !can && !taken) || (pass == 2 && taken)) order.Add(i);
                }

            float listTop = top - 332f;
            float listBot = -top + 54f;
            const float step = 146f;
            var content = ScrollList(p, 896f, listTop, listBot, order.Count * step + 14f);
            for (int k = 0; k < order.Count; k++)
            {
                int i = order[k];
                var r = TopChild(content, "row" + i, -74f - k * step, new Vector2(880, 134));
                if (tab == 0)
                {
                    int need = Meta.SprintTierNeed[i];
                    var st = (S.SprintTier & (1 << i)) != 0 ? RowState.Taken : Meta.CanSprintTier(S, i) ? RowState.Claim : RowState.Go;
                    ProgressRow(r, 880f, Meta.SprintTierReward(i), $"本轮累计摇人 {need} 次", Meta.SprintPulls(S), need, st, () =>
                    {
                        var got = Meta.ClaimSprintTier(S, i);
                        if (got == null) return;
                        Save();
                        Sprint(layer, 0);
                        ShowRewards(layer, "冲刺奖励", new List<Item>(got));
                    }, () => { Close(m); Game.I.Home?.Goto(Act.Recruit); }, layer);
                }
                else
                {
                    var t = Meta.SprintTasks[i];
                    var st = Meta.SprintTaskTaken(S, i) ? RowState.Taken : Meta.CanSprintTask(S, i) ? RowState.Claim : RowState.Go;
                    ProgressRow(r, 880f, new[] { t.Reward }, t.Name, Meta.SprintTaskCount(S, i), t.Need, st, () =>
                    {
                        var got = Meta.ClaimSprintTask(S, i);
                        if (got == null) return;
                        Save();
                        Sprint(layer, 1);
                        ShowRewards(layer, "冲刺任务", new List<Item> { got.Value });
                    }, () => { Close(m); Game.I.Home?.Goto(t.Kind); }, layer);
                }
            }
        }

        // ---------------- 每日福利 ----------------

        public static void Welfare(Transform layer)
        {
            int today = Profile.Today;
            Modal(layer, "welfare", "每日福利", new Vector2(880, 880), out var p, Pal.Gold);
            Ui.Skin(p, "quest_tray", new Vector2(796, 260), new Vector2(0, 210), 1f);
            Ui.Box(p, new Vector2(260, 220), new Vector2(0, 218), Pal.Gold.A(0.32f), Art.SoftDot);
            Ui.Icon(p, "tab_welfare", 206, new Vector2(0, 222));
            Ui.Label(p, "幸福村委每日补贴 · 零点准时刷新", 26, WarmTitle, new Vector2(0, 108), new Vector2(740, 38), TextAnchor.MiddleCenter, Fonts.Heavy);

            ItemRow(p, new List<Item>(Meta.WelfareReward(S)), new Vector2(0, -48), 136);
            bool can = Meta.CanWelfare(S, today);
            var btn = Ui.Btn(p, can ? "免费领取" : "明日再来", new Vector2(340, 108), new Vector2(0, -286), can ? Claim : Pal.Slate, () =>
            {
                var got = Meta.ClaimWelfare(S, today);
                if (got == null) { Ui.Toast("今天已经领过了", 200); return; }
                Save();
                Welfare(layer);
                ShowRewards(layer, "每日福利", new List<Item>(got));
            }, 40);
            if (can) Dot(btn, new Vector2(154, 42));
        }

        // ---------------- 抖音专属福利（侧边栏复访 + 添加桌面） ----------------

        public static void DouyinWelfare(Transform layer)
        {
            int today = Profile.Today;
            Modal(layer, "dy_welfare", "抖音专属有礼", new Vector2(920, 1180), out var p, Pal.Gold);
            Ui.SingleLine(Ui.Label(p, "侧边栏每日领补给 · 加桌面再领豪华礼包", 25, WarmSub, new Vector2(0, 446), new Vector2(820, 38), TextAnchor.MiddleCenter, Fonts.Heavy), 19);

            // 1. 侧边栏复访有礼（每日可领）
            Ui.Skin(p, "quest_tray", new Vector2(836, 468), new Vector2(0, 176), 1f);
            Ui.SingleLine(Ui.Label(p, "侧边栏复访有礼（每日零点刷新）", 30, WarmTitle, new Vector2(-12, 368), new Vector2(760, 42), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
            Ui.SingleLine(Ui.Label(p, "① 点击下方「去侧边栏」直达抖音首页侧边栏", 22, WarmSub, new Vector2(0, 318), new Vector2(770, 32), TextAnchor.MiddleLeft, Fonts.Heavy), 17);
            Ui.SingleLine(Ui.Label(p, "② 在侧边栏最近使用中点击「村口大战外星人」卡片返回", 22, WarmSub, new Vector2(0, 282), new Vector2(770, 32), TextAnchor.MiddleLeft, Fonts.Heavy), 17);
            Ui.SingleLine(Ui.Label(p, "③ 从侧边栏进入后，按钮自动切换为「领取奖励」", 22, Pal.GreenDeep, new Vector2(0, 246), new Vector2(770, 32), TextAnchor.MiddleLeft, Fonts.Heavy), 17);

            ItemRow(p, new List<Item>(Meta.DySidebarRewards), new Vector2(-150, 92), 116);
            bool canSb = Meta.CanDySidebar(S, today);
            bool fromSb = DouyinBridge.LaunchedFromSidebar;
            string sbText = !canSb ? "今日已领" : fromSb ? "领取奖励" : "去侧边栏";
            Color sbCol = !canSb ? Pal.Slate : fromSb ? Claim : Pal.Teal;
            var sbBtn = Ui.Btn(p, sbText, new Vector2(268, 96), new Vector2(244, 92), sbCol, () =>
            {
                if (!Meta.CanDySidebar(S, Profile.Today))
                {
                    Ui.Toast("今日侧边栏好礼已领取，明日零点刷新", 200);
                    return;
                }
                if (DouyinBridge.LaunchedFromSidebar)
                {
                    var got = Meta.ClaimDySidebar(S, Profile.Today);
                    if (got == null) return;
                    Save();
                    DouyinWelfare(layer);
                    ShowRewards(layer, "侧边栏复访有礼", new List<Item>(got));
                    return;
                }
                DouyinBridge.NavigateToSidebar((ok, _) =>
                {
                    if (!ok)
                    {
                        Ui.Toast("请点击右上角「···」从抖音首页侧边栏重新进入领奖", 240);
                        return;
                    }
                    if (layer != null && layer.Find("modal_dy_welfare") != null)
                        DouyinWelfare(layer);
                });
            }, 34);
            if (canSb && fromSb) Dot(sbBtn, new Vector2(118, 36));

            // 2. 添加桌面有礼（限领一次）
            Ui.Skin(p, "quest_tray", new Vector2(836, 396), new Vector2(0, -292), 1f);
            Ui.SingleLine(Ui.Label(p, "添加桌面有礼（限领一次）", 30, WarmTitle, new Vector2(-12, -138), new Vector2(760, 42), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
            Ui.SingleLine(Ui.Label(p, "将「村口大战外星人」添加到手机桌面，一键开战立领豪礼！", 22, WarmSub, new Vector2(0, -192), new Vector2(770, 34), TextAnchor.MiddleLeft, Fonts.Heavy), 17);

            ItemRow(p, new List<Item>(Meta.DyShortcutRewards), new Vector2(-150, -346), 116);
            bool canSc = Meta.CanDyShortcut(S);
            bool addedSc = DouyinBridge.ShortcutAdded;
            string scText = !canSc ? "已领取" : addedSc ? "领取奖励" : "加到桌面";
            Color scCol = !canSc ? Pal.Slate : addedSc ? Claim : Pal.Azure;
            var scBtn = Ui.Btn(p, scText, new Vector2(268, 96), new Vector2(244, -346), scCol, () =>
            {
                if (!Meta.CanDyShortcut(S))
                {
                    Ui.Toast("桌面礼包已领取", 200);
                    return;
                }
                void ClaimNow()
                {
                    var got = Meta.ClaimDyShortcut(S);
                    if (got == null) return;
                    Save();
                    DouyinWelfare(layer);
                    ShowRewards(layer, "添加桌面有礼", new List<Item>(got));
                }
                if (DouyinBridge.ShortcutAdded)
                {
                    ClaimNow();
                    return;
                }
                DouyinBridge.AddShortcut((ok, _) =>
                {
                    if (!ok)
                    {
                        Ui.Toast("未完成添加桌面，请在系统权限中允许创建快捷方式", 220);
                        return;
                    }
                    ClaimNow();
                });
            }, 34);
            if (canSc && addedSc) Dot(scBtn, new Vector2(118, 36));
        }
    }
}
