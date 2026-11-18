using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>主界面：顶栏资源、五个页签（商城/好汉/出征/寨主/山寨），弹窗都挂在 Layer 上。</summary>
    public sealed partial class HomeScreen : MonoBehaviour
    {
        public const int TabShop = 0, TabHero = 1, TabBattle = 2, TabForge = 3, TabFort = 4;

        RectTransform _root, _page;
        public RectTransform Layer { get; private set; }
        int _tab = TabBattle;
        /// <summary>好汉页职业筛选：-1 全部。</summary>
        int _roleFilter = -1;
        float _rosterScroll, _shopScroll;
        int _forgeSubTab, _totemFilter = -1, _selectedTotemId, _shopSubTab;
        bool _dirty;
        Text _staminaText, _staminaWait;
        float _tickT;

        public int Tab => _tab;
        static SaveData S => Profile.S;

        public static HomeScreen Create(int tab)
        {
            var rt = Ui.Rect(Ui.Root, "Home");
            Stretch(rt);
            var h = rt.gameObject.AddComponent<HomeScreen>();
            h._root = rt;
            h._tab = tab;
            h.Layer = Ui.Rect(rt, "layer");
            Stretch(h.Layer);
            h.Rebuild(true);
            Profile.Changed += h.MarkDirty;
            return h;
        }

        void OnDestroy() => Profile.Changed -= MarkDirty;
        void MarkDirty() => _dirty = true;

        static void Stretch(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
        }

        float _slideDir;

        public void SetTab(int t)
        {
            if (t == _tab) return;
            _slideDir = t > _tab ? 1f : -1f;
            _tab = t;
            _swap = null;
            Sfx.Play(Snd.Tab, 0.8f);
            Rebuild(true);
        }

        /// <summary>任务“前往”：跳到能完成该任务的地方。</summary>
        public void Goto(Act a)
        {
            switch (a)
            {
                case Act.HeroUp: SetTab(TabHero); break;
                case Act.Forge: case Act.Talent: SetTab(TabForge); break;
                case Act.Ad: case Act.Recruit: SetTab(TabShop); break;
                default: SetTab(TabBattle); break;
            }
        }

        void LateUpdate()
        {
            if (_dirty)
            {
                _dirty = false;
                Rebuild(false);
            }
            if ((_tickT -= Time.unscaledDeltaTime) <= 0 && _staminaText)
            {
                _tickT = 0.5f;
                _staminaText.text = $"{S.Stamina}/{Meta.StaminaMax}";
                int w = Meta.StaminaWait(S, Profile.Now);
                _staminaWait.text = S.Stamina >= Meta.StaminaMax ? "" : $"{w / 60}:{w % 60:00}";
            }
        }

        void Rebuild(bool anim)
        {
            Ui.Fit();
            if (_page) DestroyImmediate(_page.gameObject);
            _page = Ui.Rect(_root, "page");
            Stretch(_page);
            _page.SetSiblingIndex(0);
            switch (_tab)
            {
                case TabShop: BuildShop(anim); break;
                case TabHero: BuildHeroes(anim); break;
                case TabForge: BuildForge(anim); break;
                case TabFort: BuildFort(anim); break;
                default: BuildBattle(anim); break;
            }
            // 页面内容收进 body，切页时只让 body 淡入滑入，顶栏和页签不闪
            var body = Ui.Rect(_page, "body");
            Stretch(body);
            while (_page.childCount > 1) _page.GetChild(0).SetParent(body, false);
            if (anim)
            {
                var cg = body.gameObject.AddComponent<CanvasGroup>();
                float dir = _slideDir;
                Tween.Run(body, 0.2f, k =>
                {
                    cg.alpha = Mathf.Lerp(0.2f, 1f, k);
                    body.anchoredPosition = new Vector2(dir * 60f * (1 - Tween.OutCubic(k)), 0);
                });
            }
            BuildTopBar();
            BuildTabs();
            BuildGm();
            Layer.SetAsLastSibling();
        }

        RectTransform Top(float x, float y, Vector2 size, string name) => Ui.Top(_page, x, y + Ui.SafeTop, size, name);
        RectTransform Bottom(float x, float y, Vector2 size, string name) => Ui.Bottom(_page, x, y, size, name);

        /// <summary>背景按屏幕铺满（cover），返回图片实际尺寸。</summary>
        Vector2 Cover(string art, Vector2 natural, Color tint, float centerY = 0.5f)
        {
            var bg = Ui.Box(_page, natural, Vector2.zero, tint, Art.Img(art), "bg");
            bg.type = Image.Type.Simple;
            float scale = Mathf.Max(Ui.W / natural.x, Ui.Height / natural.y);
            var size = natural * scale;
            bg.rectTransform.sizeDelta = size;
            bg.rectTransform.anchoredPosition = new Vector2(0, (centerY - 0.5f) * (size.y - Ui.Height));
            return size;
        }

        /// <summary>顶、底各压一层墨褐渐变，只为托住顶栏和页签上的白字，不把画面压暗。</summary>
        void Shade(float top, float bottom)
        {
            var tint = Ink;
            if (top > 0)
            {
                var t = Ui.Box(_page, new Vector2(1080, 420), Vector2.zero, tint.A(top), Art.VGrad, "shadeTop");
                t.rectTransform.anchorMin = new Vector2(0, 1);
                t.rectTransform.anchorMax = new Vector2(1, 1);
                t.rectTransform.sizeDelta = new Vector2(0, 420);
                t.rectTransform.anchoredPosition = new Vector2(0, -210);
                t.rectTransform.localScale = new Vector3(1, -1, 1);
            }
            if (bottom > 0)
            {
                var b = Ui.Box(_page, new Vector2(1080, 760), Vector2.zero, tint.A(bottom), Art.VGrad, "shadeBottom");
                b.rectTransform.anchorMin = new Vector2(0, 0);
                b.rectTransform.anchorMax = new Vector2(1, 0);
                b.rectTransform.sizeDelta = new Vector2(0, 760);
                b.rectTransform.anchoredPosition = new Vector2(0, 380);
            }
        }

        // ---------------- 顶栏、页签 ----------------

        static readonly Color Glass = new Color(0.06f, 0.13f, 0.21f, 0.54f);
        static readonly Color DockEdge = Pal.Hex("5EC4E8").A(0.32f);
        static readonly Color TopPill = new Color(0.08f, 0.15f, 0.24f, 0.72f);

        /// <summary>冷白瓷面上的深靛字。</summary>
        static readonly Color Cocoa = Pal.Hex("243B53");
        /// <summary>压在晴空场景上的白字描边。</summary>
        static readonly Color Edge = Pal.Hex("12283E");
        /// <summary>主界面「青绿水泊 · 霁蓝宋瓷」：深靛描边、鎏金字、冷瓷白字、霁蓝描边、鎏金深琥珀描边。</summary>
        static readonly Color Ink = Pal.Hex("0F1E2E");
        static readonly Color Gold = Pal.Hex("FFE066");
        static readonly Color Paper = Pal.Hex("F5FAFF");
        static readonly Color AzureDeep = Pal.Hex("0E3554");
        static readonly Color GoldStroke = Pal.Hex("6B4206");

        void BuildTopBar()
        {
            float y = Ui.SafeTop + 62;

            // 头像：香槟金青瓷双线框 + 半身统帅胸像裁切（避免全身立绘缩成蚂蚁）
            var av = Ui.Top(_page, -470, y, new Vector2(116, 116), "avatar");
            var frame = Ui.Icon(av, "ui/h_avatar", 116, Vector2.zero, "frame");
            var avMask = Ui.Rect(av, "avMask");
            avMask.sizeDelta = new Vector2(94, 94);
            avMask.anchoredPosition = new Vector2(0, 1);
            avMask.gameObject.AddComponent<RectMask2D>();
            Ui.Icon(avMask, "lord_songjiang", 204, new Vector2(0, -48));
            int lv = Meta.LordLevel(S, out float xp);
            Ui.Icon(av, "ui/h_round", 46, new Vector2(-42, -42), "lvBadge");
            Ui.Outlined(av, lv.ToString(), 22, Paper, new Vector2(-42, -41), new Vector2(44, 36), Ink, 1.4f);
            if (ForgeBadge()) MetaUi.Dot(av, new Vector2(48, 48));
            Ui.Tap(frame, () => SetTab(TabForge), av);
            // 名字顶、经验条底和头像框里的人像上下沿对齐，上下留白一致。
            var id = Ui.Top(_page, -278, y, new Vector2(220, 116), "identity");
            Ui.Outlined(id, "老村长", 32, Paper, new Vector2(0, 32), new Vector2(220, 44), Ink, 1.6f, TextAnchor.MiddleLeft);
            MetaUi.Bar(id, new Vector2(-6, -27), new Vector2(208, 28), xp, Pal.Hex("3DDC6A"));

            CurPill(-50, y - 14, "ic_ingot", Ui.Num(S.Ingots), () => SetTab(TabShop));
            CurPill(184, y - 14, "ic_coins", Ui.Num(S.Copper), null);
            var st = CurPill(414, y - 14, "ic_wine", $"{S.Stamina}/{Meta.StaminaMax}", () => MetaUi.StaminaShop(Layer));
            _staminaText = st.Find("text").GetComponent<Text>();
            _staminaWait = Ui.Outlined(st, "", 20, Color.white, new Vector2(8, -40), new Vector2(160, 26), Edge, 1.2f);
            _tickT = 0;
        }

        /// <summary>资源胶囊：深靛银边，冷瓷白字；左侧图标压边，右侧高清翠绿圆形加号。</summary>
        RectTransform CurPill(float x, float y, string icon, string text, Action plus)
        {
            var c = Ui.Top(_page, x, y, new Vector2(204, 56), "cur_" + icon);
            Ui.Skin(c, "h_capsule", new Vector2(188, 52), new Vector2(8, 0), -1f, null, "bg");
            Ui.Icon(c, icon, 60, new Vector2(-82, 1));
            Ui.Outlined(c, text, 28, Paper, new Vector2(plus != null ? 4 : 14, 1), new Vector2(130, 46), Ink, 1.6f, TextAnchor.MiddleCenter, "text");
            if (plus != null)
            {
                var pRim = Ui.Box(c, new Vector2(38, 38), new Vector2(84, 0), Pal.Hex("123E22"), Art.Circle, "plusRim");
                Ui.Box(pRim.transform, new Vector2(33, 33), Vector2.zero, Pal.Hex("FFFFFF").A(0.85f), Art.Circle);
                var pFace = Ui.Box(pRim.transform, new Vector2(29, 29), Vector2.zero, Pal.Hex("42D86B"), Art.Circle, "plus");
                Ui.Outlined(pRim.transform, "+", 26, Color.white, new Vector2(0, 2), new Vector2(38, 38), Pal.Hex("124424"), 1.3f);
                Ui.Tap(pFace, plus, c);
            }
            return c;
        }

        public const float TabH = 156;
        const int AidPerDay = 5;

        void BuildTabs()
        {
            var bar = Ui.Rect(_page, "tabs");
            bar.anchorMin = new Vector2(0, 0);
            bar.anchorMax = new Vector2(1, 0);
            bar.sizeDelta = new Vector2(0, TabH);
            bar.anchoredPosition = new Vector2(0, TabH * 0.5f);
            var under = Ui.Box(bar, new Vector2(1080, TabH), Vector2.zero, Pal.Hex("243E56"), Art.Rounded, "under");
            Stretch(under.rectTransform);
            under.rectTransform.offsetMin = new Vector2(0, -Ui.SafeBottom - 40);
            // 顶边收到普通图标的头顶。选中的盾还会再高出一截，不把底色铺到它上面。
            under.rectTransform.offsetMax = new Vector2(0, -15);
            under.raycastTarget = true;
            var mask = under.gameObject.AddComponent<Mask>();
            mask.showMaskGraphic = true;
            var lip = Ui.Rect(under.transform, "lip");
            lip.anchorMin = new Vector2(0f, 1f);
            lip.anchorMax = new Vector2(1f, 1f);
            lip.pivot = new Vector2(0.5f, 1f);
            lip.sizeDelta = new Vector2(0f, 28f);
            lip.anchoredPosition = Vector2.zero;
            var lipImg = lip.gameObject.AddComponent<Image>();
            lipImg.sprite = Art.FadeDown;
            lipImg.color = Pal.Hex("F4F8FC").A(0.38f);
            lipImg.raycastTarget = false;
            string[] names = { "供销社", "乡亲", "守村", "村长", "村委" };
            string[] icons = { "tab_shop", "tab_hero", "tab_battle", "tab_forge", "tab_fort" };
            // 降噪原则：当前激活页签不重复挂红点；山寨有可领收益或图鉴新怪时轻提示
            bool[] dots = { ShopBadge(), HeroBadge(), false, ForgeBadge(), FortBadge() };
            for (int i = 0; i < 5; i++)
            {
                float x = (i - 2) * 212;
                bool on = i == _tab;
                var tab = Ui.Rect(bar, "tab" + i);
                tab.anchoredPosition = new Vector2(x, 0);
                tab.sizeDelta = new Vector2(212, TabH);
                var face = Ui.Box(tab, new Vector2(204, TabH), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "face");
                face.raycastTarget = true;
                if (on)
                {
                    Ui.Box(tab, new Vector2(250, 190), new Vector2(0, 34), Pal.Hex("5AD4FF").A(0.28f), Art.SoftDot, "glow");
                    Ui.Icon(tab, "ui/h_tab_on", 178, new Vector2(0, 28), "badge");
                }
                var ic = Ui.Icon(tab, icons[i], on ? 128 : 94, new Vector2(0, on ? 44 : 16));
                if (on) Tween.Run(ic, 999f, k => ic.rectTransform.anchoredPosition = new Vector2(0, 44 + 4 * Mathf.Sin(k * 999f * 3f)));
                if (on) Ui.Outlined(tab, names[i], 30, Color.white, new Vector2(0, -48), new Vector2(210, 40), AzureDeep, 2f);
                else Ui.Outlined(tab, names[i], 26, Pal.Hex("B8CDE0"), new Vector2(0, -50), new Vector2(210, 40), Ink, 1.5f);
                if (dots[i] && !on) MetaUi.Dot(tab, new Vector2(54, 48));
                int ti = i;
                Ui.Tap(face, () => SetTab(ti), tab, false);
            }
        }

        // 看视频才有的次数不亮红点，只有手里有招募令或寻宝锤才提醒。
        static bool ShopBadge() => S.Tokens >= 1 || S.Hammers >= 1;
        static bool HeroBadge()
        {
            for (int h = 0; h < Defs.HeroCount; h++) if (Meta.CanLevel(S, (HeroId)h)) return true;
            return false;
        }
        static bool ForgeBadge()
        {
            for (int i = 0; i < Meta.Equips.Length; i++) if (Meta.CanForge(S, i)) return true;
            return Meta.CanTalent(S) || Meta.CanPage(S) || Meta.CanTome(S) || Meta.CanFlagUp(S) || Meta.CanCloakUp(S) || Meta.CanMergeAnyTotem(S) || S.GearBoxes > 0;
        }
        static bool IdleBadge() => Meta.IdleHours(S, Profile.Now) >= 1;
        static bool MealBadge() => Meta.MealsReady(S, DateTime.Now.Hour) > 0;
        static bool ChestBadge(int ch)
        {
            for (int k = 0; k < 3; k++) if (Meta.CanOpenChest(S, ch, k)) return true;
            return false;
        }
        static bool BattleBadge()
        {
            if (Meta.CanSign(S, Profile.Today) || Meta.TaskBadge(S) > 0 || Meta.CodexBadge(S) > 0 || IdleBadge() || MealBadge() || GrowthBadge() || RankBadge()) return true;
            for (int c = 1; c <= Defs.Chapters.Length; c++) if (ChestBadge(c)) return true;
            int n = Math.Min(S.Cleared, S.Stars.Length);
            for (int i = 0; i < n; i++)
                for (int k = 0; k < 3; k++)
                    if (Meta.CanOpenLevelChest(S, i + 1, k)) return true;
            return false;
        }
        static bool RankBadge() => Meta.RankRewardBadge(S) > 0;
        static bool FortBadge() => IdleBadge() || Meta.CodexBadge(S) > 0 || RankBadge();
        static bool SevenBadge() => !Meta.SevenFinished(S) && Meta.SevenBadge(S, Profile.Today) > 0;
        static bool SprintBadge() => Meta.SprintTierBadge(S) + Meta.SprintTaskBadge(S) > 0;
        static bool GrowthBadge() => SevenBadge() || SprintBadge() || Meta.CanWelfare(S, Profile.Today);

        // ---------------- 出征 ----------------

        /// <summary>
        /// 主页为青绿水泊梁山寨门：门楼挂书法标题，城门前站本关首领，脚下霁蓝关卡绶带；
        /// 青石御道站出战四好汉（脚踏青玉石台），下方承托式宝箱进度卡，底部唯一鎏金主行动按钮「开始挑战」。
        /// 左右两列功能入口收纳进半透明深靛毛玻璃侧坞（左：补给挂机；右：目标图鉴），视觉分区井然有序。
        /// </summary>
        void BuildBattle(bool anim)
        {
            var st = Defs.Level(S.Selected);
            Cover("home_road", new Vector2(1080, 1920), Color.white, 0.5f);
            Shade(0.24f, 0.22f);
            float sp = Ui.Spare;
            int day = Profile.Today;

            var gear = Top(-474, 158, new Vector2(76, 76), "settings");
            var gearBg = Ui.Icon(gear, "ui/h_round", 68, Vector2.zero, "bg");
            Ui.Icon(gear, "ic_gear", 46, new Vector2(0, 1));
            Ui.Tap(gearBg, () => MetaUi.Settings(Layer), gear);

            // 出征主页极简降噪（对标蔚蓝星球）：巡山、图鉴、演武、生辰纲统一收进「山寨」领地页签，主页左右仅保留各 3 枚福利/目标圆章
            float colY = 268 + sp * 0.04f;
            float colStep = 136 + sp * 0.025f;
            SideDock(-468, colY, colStep, 3);
            SideBtn(-468, colY, "tab_welfare", "福利", Meta.CanWelfare(S, day), () => MetaUi.Welfare(Layer));
            SideBtn(-468, colY + colStep, "tab_gift", "签到", Meta.CanSign(S, day), () => MetaUi.SignIn(Layer));
            SideBtn(-468, colY + colStep * 2, "ic_feast", "流水席", MealBadge(), () => MetaUi.Meals(Layer));

            int rightCount = Meta.SevenFinished(S) ? 3 : 4;
            SideDock(468, colY, colStep, rightCount);
            int side = 0;
            SideBtn(468, colY + colStep * side++, "tab_task", "任务", Meta.TaskBadge(S) > 0, () => MetaUi.Tasks(Layer));
            if (!Meta.SevenFinished(S)) SideBtn(468, colY + colStep * side++, "tab_seven", "七日", SevenBadge(), () => MetaUi.Seven(Layer));
            SideBtn(468, colY + colStep * side++, "tab_sprint", "冲刺", SprintBadge(), () => MetaUi.Sprint(Layer));
            SideBtn(468, colY + colStep * side, "ic_rank_stage", "排行榜", RankBadge(), () => RankUi.Open(Layer, -1, () => Rebuild(false)));

            // 背景台阶下沿在图高 34%：本关主统领（首领关为大首领，普通关为领军精英统领）站在城门口，脚踩台阶下沿。
            var bd = Defs.Enemy(st.LeaderKind);
            const float bodyPx = 286f;
            const float bsz = 348f;
            float bodyFrac = 0.86f, bossFoot = 0.012f;
            bool bossFramed = Art.Animated(bd.Art);
            if (bossFramed && AnimMeta.Info.TryGetValue(bd.Art, out var bm)) { bodyFrac = bm.Body; bossFoot = bm.Foot; }
            float bossDraw = bossFramed ? bodyPx / Mathf.Max(0.55f, bodyFrac) : bodyPx;
            float stair = 0.342f * Ui.Height;
            float feet = stair - Ui.SafeTop + 40f;

            // 标题压在门楼上，背后衬一层柔和云白光晕，与晴空青瓦清晰分离。
            float logoTop = 148f, logoBottom = feet - bsz * 0.86f;
            float logoH = Mathf.Clamp(logoBottom - logoTop, 118f, 166f), logoW = logoH * 900f / 268f;
            var logo = Top(0, logoTop + logoH * 0.5f, new Vector2(logoW, logoH), "logo");
            Ui.Box(logo, new Vector2(logoW * 1.1f, logoH * 1.35f), Vector2.zero, Color.white.A(0.32f), Art.SoftDot, "glow");
            Ui.Icon(logo, "logo", logoW, Vector2.zero, "art");
            if (anim) Tween.Pop(logo, 0.35f);

            var boss = Top(0, feet - bsz * 0.5f, new Vector2(bsz, bsz), "boss");
            Ui.Box(boss, new Vector2(bsz * 0.78f, 64), new Vector2(0, -bsz * 0.47f), new Color(0.04f, 0.1f, 0.18f, 0.42f), Art.SoftDot);
            Ui.Box(boss, new Vector2(bsz * 0.92f, 92), new Vector2(0, -bsz * 0.46f), (st.IsChapterBoss ? Pal.Purple : Pal.Hex("38A8D8")).A(0.36f), Art.SoftDot);
            float bossStand = bossFramed ? -bsz * 0.5f + bossDraw * (0.5f - bossFoot) : 0f;
            var icon = Ui.Icon(boss, bd.Art, bossDraw, new Vector2(0, bossStand));
            if (bossFramed)
            {
                icon.color = Color.white.A(0f);
                string key = bd.Art;
                Art.Late(icon, key, () =>
                {
                    var fr = Art.Frames(key);
                    if (fr.Length > 0) icon.sprite = fr[0];
                    icon.color = Color.white;
                });
            }
            Tween.Run(icon, 999f, k => icon.rectTransform.anchoredPosition = new Vector2(0, bossStand + 5 * Mathf.Sin(k * 999f * 2f)));
            if (anim) Tween.Pop(boss, 0.35f);

            // 关卡绶带下面一行：首领：名字，有增益再跟上兵种；右侧蓝钮打开敌情。
            float tagY = feet + 44f;
            var tag = Top(0, tagY, new Vector2(540, 100), "levelTag");
            var ribbon = Ui.Skin(tag, "h_ribbon", new Vector2(540, 100), Vector2.zero, -1f, null, "ribbon");
            Ui.SingleLine(Ui.Outlined(tag, $"第{st.No}关 · {st.Name}", 36, Paper, new Vector2(0, 5), new Vector2(436, 60), AzureDeep, 2.5f), 25);
            Ui.Tap(ribbon, () => MetaUi.LevelList(Layer), tag);
            if (S.Selected > 1) ArrowBtn(tag, -304, -1);
            if (S.Selected <= S.Cleared && S.Selected < Defs.LevelCount) ArrowBtn(tag, 304, 1);
            string leadLabel = bd.IsBoss ? "首领" : "统领";
            string buffPlain = st.BuffRole.HasValue ? $" · {Defs.RoleName(st.BuffRole.Value)} +{(int)(st.BuffPct * 100 + 0.5f)}%" : "";
            string info = $"{leadLabel}：{bd.Name}" + (st.BuffRole.HasValue
                ? $" · <color=#78F0A8>{Defs.RoleName(st.BuffRole.Value)} +{(int)(st.BuffPct * 100 + 0.5f)}%</color>"
                : "");
            const float maxW = 560f, btnReserve = 108f;
            float capW = Mathf.Clamp((3 + bd.Name.Length + buffPlain.Length) * 22f + btnReserve + 28f, 320f, maxW);
            float capH = 48f;
            float InfoY(float h) => tagY + 50f + 8f + h * 0.5f;
            var infoBox = Top(0, InfoY(capH), new Vector2(capW, capH), "levelInfo");
            var infoBg = Ui.Skin(infoBox, "h_capsule", new Vector2(capW, capH), Vector2.zero, -1f);
            var infoText = Ui.Label(infoBox, info, 22, Pal.Hex("DCEAF7"), new Vector2(-42, 0), new Vector2(capW - btnReserve, 40f), TextAnchor.MiddleCenter, Fonts.Heavy);
            Canvas.ForceUpdateCanvases();
            if (infoText.preferredWidth > capW - btnReserve + 2f)
            {
                capW = maxW;
                capH = 88f;
                infoBox.sizeDelta = new Vector2(capW, capH);
                infoBox.anchoredPosition = new Vector2(0, -(InfoY(capH) + Ui.SafeTop));
                infoBg.rectTransform.sizeDelta = new Vector2(capW, capH);
                var tr = infoText.rectTransform;
                tr.sizeDelta = new Vector2(capW - btnReserve, 72f);
                infoText.verticalOverflow = VerticalWrapMode.Truncate;
                infoText.lineSpacing = 0.9f;
            }
            var spyBtn = Ui.Box(infoBox, new Vector2(88, 34), new Vector2(capW * 0.5f - 52f, 0), Pal.Hex("2472A4"), Art.Pill, "enemyPreview");
            Ui.Outlined(spyBtn.transform, "敌情", 21, Color.white, new Vector2(0, 1), new Vector2(86, 34), Ink, 1.4f);
            Ui.Tap(infoBg, () => MetaUi.StageEnemies(Layer, st), infoBox);
            Ui.Tap(spyBtn, () => MetaUi.StageEnemies(Layer, st), spyBtn.transform);

            // 出战好汉：站在青瓷白玉石台上；上阵好汉不再挂刺眼红点，改用柔和翠绿小升级标（好汉页签已有汇总提醒）
            float baseY = TabH;
            float wallY = baseY + 505 + sp * 0.27f;
            var podium = Bottom(0, wallY, new Vector2(1200, 277), "podium");
            var lu = Meta.Lineup(S);
            var arts = new Image[lu.Length];
            for (int i = 0; i < lu.Length; i++)
            {
                var d = Defs.Hero(lu[i]);
                var g = Ui.Rect(podium, "hero" + i);
                g.anchoredPosition = new Vector2((i - 1.5f) * 134, 96);
                g.sizeDelta = new Vector2(130, 200);
                Ui.Box(g, new Vector2(146, 56), new Vector2(0, -72), new Color(0.04f, 0.1f, 0.18f, 0.28f), Art.SoftDot, "aura");
                Ui.Icon(g, "ui/h_pedestal", 126, new Vector2(0, -76), "pedestal");
                bool framed = Art.Animated(d.Art);
                float draw = 160f, standY = 5f;
                if (framed)
                {
                    float bodyH = 0.85f, foot = 0.01f;
                    if (AnimMeta.Info.TryGetValue(d.Art, out var meta)) { bodyH = meta.Body; foot = meta.Foot; }
                    draw = 150f / Mathf.Max(0.6f, bodyH);
                    standY = -75f - draw * (foot - 0.5f);
                }
                var art = Ui.Icon(g, d.Art, draw, new Vector2(0, standY), "art");
                if (framed)
                {
                    art.color = Color.white.A(0f);
                    string key = d.Art;
                    Art.Late(art, key, () =>
                    {
                        var fr = Art.Frames(key);
                        art.sprite = fr[0];
                        art.color = Color.white;
                    });
                }
                arts[i] = art;
                // 有攻击帧的好汉脚踩在石台上，呼吸和出手跟战场用同一套帧，不再整个人上下飘。
                if (!framed)
                    Tween.Run(art, 999f, k => art.rectTransform.anchoredPosition = new Vector2(0, standY + 3 * Mathf.Sin(k * 999f * 2.2f + i * 0.8f)));
                Ui.Tap(art, () => SetTab(TabHero), g);
                if (Meta.CanLevel(S, lu[i]))
                {
                    var up = Ui.Icon(g, "ic_fast", 30, new Vector2(44, -52), "upHint");
                    up.transform.localRotation = Quaternion.Euler(0, 0, 90);
                    up.color = Pal.Hex("68F098");
                    Ui.Breathe(up, 4f);
                }
                if (anim) Tween.Pop(g, 0.3f, 0.1f + i * 0.05f);
            }
            var pw = Ui.Rect(podium, "power");
            pw.anchoredPosition = new Vector2(0, -42);
            pw.sizeDelta = new Vector2(226, 50);
            Ui.Skin(pw, "h_capsule", new Vector2(226, 50), Vector2.zero, -1f);
            Ui.Icon(pw, "ic_sword", 40, new Vector2(-70, 1));
            Ui.Outlined(pw, Ui.Num(Meta.TeamPower(S)), 32, Gold, new Vector2(16, 1), new Vector2(156, 46), Ink, 2f);

            int roleCnt = Defs.DistinctRoles(lu, out _);
            float roleSyn = Defs.RoleSynergyBonus(lu);
            var bonds = Defs.ActiveBonds(lu);
            if (roleSyn > 0 || bonds.Count > 0)
            {
                string synTxt = roleSyn > 0 ? $"{roleCnt}职同心 +{(int)(roleSyn * 100)}%" : "";
                if (bonds.Count > 0) synTxt += (synTxt.Length > 0 ? " · " : "") + $"<color=#FFE066>{bonds[0].Name}</color>";
                var syn = Ui.Rect(podium, "synergy");
                syn.anchoredPosition = new Vector2(0, -86);
                syn.sizeDelta = new Vector2(420, 34);
                var synBg = Ui.Box(syn, new Vector2(Mathf.Clamp(synTxt.Length * 18f + 44f, 220f, 440f), 32), Vector2.zero, TopPill, Art.Pill);
                Ui.Label(syn, synTxt, 20, Pal.Hex("B8F0D2"), new Vector2(0, 1), new Vector2(430, 30), TextAnchor.MiddleCenter, Fonts.Heavy);
                Ui.Tap(synBg, () => MetaUi.BondTip(Layer, lu), syn);
            }

            // 关卡三宝箱：承托在半透明深靛玉盘底座上，层次分明
            float chestY = baseY + 334 + sp * 0.18f;
            var row = Bottom(0, chestY, new Vector2(440, 136), "chests");
            Ui.Box(row, new Vector2(436, 118), new Vector2(0, -6), DockEdge, Art.Rounded, "trayRim");
            Ui.Box(row, new Vector2(430, 112), new Vector2(0, -6), Glass, Art.Rounded, "tray");
            for (int k = 0; k < 3; k++)
            {
                bool got = Meta.LevelChestGot(S, st.No, k);
                bool ready = Meta.CanOpenLevelChest(S, st.No, k);
                float x = (k - 1) * 132;
                Ui.Box(row, new Vector2(106, 32), new Vector2(x, -38), new Color(0, 0, 0, 0.28f), Art.SoftDot, "plate" + k);
                var c = Ui.Icon(row, got ? "ic_chest_open" : MetaUi.ChestArt(k), 92, new Vector2(x, 0), "chest" + k);
                if (!got && !ready) c.color = new Color(0.86f, 0.92f, 0.98f, 0.62f);
                if (got) MetaUi.Check(row, new Vector2(x + 32, -26), 30);
                if (ready)
                {
                    MetaUi.Dot(c.transform, new Vector2(34, 34));
                    var ic = c;
                    float phase = k * 0.6f;
                    Tween.Run(ic, 999f, kk => ic.rectTransform.localRotation = Quaternion.Euler(0, 0, 6f * Mathf.Sin(kk * 999f * 6f + phase)));
                }
                int ck = k, lvl = st.No;
                Ui.Tap(c, () =>
                {
                    if (!Meta.CanOpenLevelChest(S, lvl, ck))
                    {
                        MetaUi.LevelChestCard(Layer, lvl, ck, c.transform);
                        return;
                    }
                    var gotR = Meta.OpenLevelChest(S, lvl, ck, new Rng(Environment.TickCount));
                    Profile.Save();
                    MetaUi.ShowRewards(Layer, "关卡宝箱", gotR);
                });
                if (anim) Tween.Pop(c.transform, 0.28f, 0.15f + k * 0.05f);
            }

            // 左：章节星级宝箱（深靛青瓷方牌）；右：扫荡
            int stars = Meta.ChapterStars(S, st.Chapter);
            float sideY = wallY + 12;
            var cs = Bottom(-410, sideY, new Vector2(164, 118), "chapterStars");
            var csBg = Ui.Skin(cs, "h_tile", new Vector2(156, 114), Vector2.zero, 1f);
            Ui.Icon(cs, "ic_chest_gold", 68, new Vector2(-32, 10));
            Ui.Icon(cs, "ic_star", 34, new Vector2(36, 20));
            Ui.Outlined(cs, $"{stars}/30", 23, Paper, new Vector2(28, -26), new Vector2(106, 30), Ink, 1.5f);
            if (ChestBadge(st.Chapter)) MetaUi.Dot(cs, new Vector2(66, 44));
            int chap = st.Chapter;
            Ui.Tap(csBg, () => MetaUi.ChapterChests(Layer, chap), cs);
            if (Meta.CanSweep(S, st.No))
            {
                var sw = Bottom(410, sideY, new Vector2(144, 144), "sweep");
                var swBg = Ui.Icon(sw, "ui/h_round", 108, new Vector2(0, 14), "bg");
                Ui.Icon(sw, "ic_sweep", 74, new Vector2(0, 16));
                Ui.Outlined(sw, "扫荡", 26, Paper, new Vector2(0, -42), new Vector2(140, 34), Ink, 1.8f);
                Ui.Outlined(sw, $"体力 -{Meta.BattleStamina}", 19, Pal.Hex("B8DCFA"), new Vector2(0, -68), new Vector2(160, 26), Ink, 1.4f);
                Ui.Tap(swBg, () => Sweep(st), sw);
            }

            // 开始挑战：鎏金主按钮。这一关打输过才在右侧并一颗同高的绿色援军按钮，两颗作为一组落在石路中央。
            float startY = baseY + 148 + sp * 0.1f;
            const float bh = 144f;
            bool aid = S.Selected > S.Cleared && S.LostStage == S.Selected && S.AdStart2Star < AidPerDay;
            float bw = aid ? 400f : 496f;
            const float aw = 208f, gap = 16f;
            float startX = aid ? -(aw + gap) * 0.5f : 0f;
            var start = Ui.SubBtn(_page, "摇人守村", "ic_wine", Meta.BattleStamina.ToString(), new Vector2(bw, bh), new Vector2(0, startY),
                Pal.Gold, () => Game.I.StartLevel(S.Selected), 54, 28, true);
            start.anchorMin = start.anchorMax = new Vector2(0.5f, 0);
            start.anchoredPosition = new Vector2(startX, startY);
            var glow = Ui.Box(start, new Vector2(bw + (aid ? 28f : 88f), bh + (aid ? 40f : 56f)), Vector2.zero, Pal.Gold.A(0.24f), Art.SoftDot, "glow");
            glow.transform.SetAsFirstSibling();
            Tween.Run(start, 9999f, k =>
            {
                float t = k * 9999f;
                start.localScale = Vector3.one * (1f + 0.016f * Mathf.Sin(t * 3.6f));
                glow.color = Pal.Gold.A(0.16f + 0.09f * Mathf.Sin(t * 3.6f));
            });

            if (aid)
            {
                float aidX = startX + bw * 0.5f + gap + aw * 0.5f;
                var aidBtn = Ui.SubBtn(_page, "增援", "ic_ad", "2星+80", new Vector2(aw, bh), Vector2.zero,
                    Pal.Green, OfferAid, 40, 22);
                aidBtn.anchorMin = aidBtn.anchorMax = new Vector2(0.5f, 0);
                aidBtn.anchoredPosition = new Vector2(aidX, startY);
            }

            var raid = Ui.Rect(_page, "raid");
            raid.anchorMin = Vector2.zero;
            raid.anchorMax = Vector2.one;
            raid.offsetMin = raid.offsetMax = Vector2.zero;
            raid.SetAsLastSibling();
            raid.gameObject.AddComponent<HomeVolley>().Begin(icon, arts, lu, StrongestDealer(lu));
        }

        void OfferAid()
        {
            if (S.Stamina < Meta.BattleStamina)
            {
                Sfx.Play(Snd.Deny);
                MetaUi.StaminaShop(Layer);
                return;
            }
            MetaUi.Confirm(Layer, "看完视频后，一位上阵乡亲以2星入场，并多80能量币。", () =>
                Ads.Show("start_2star", () => Game.I.StartLevel(S.Selected, true)));
        }

        /// <summary>首页出手的人：上阵里战力最高的输出；全是辅助时退回战力最高的那位。</summary>
        int StrongestDealer(HeroId[] lu)
        {
            int best = -1, any = 0;
            for (int i = 0; i < lu.Length; i++)
            {
                int p = Meta.HeroPower(S, lu[i]);
                if (p > Meta.HeroPower(S, lu[any])) any = i;
                if (Defs.Hero(lu[i]).Coef > 0f && (best < 0 || p > Meta.HeroPower(S, lu[best]))) best = i;
            }
            return best >= 0 ? best : any;
        }

        void Sweep(LevelDef st)
        {
            if (S.Stamina < Meta.BattleStamina)
            {
                Sfx.Play(Snd.Deny);
                MetaUi.StaminaShop(Layer);
                return;
            }
            var r = Meta.Sweep(S, st, new Rng(Environment.TickCount));
            if (r == null) return;
            Profile.Save();
            Sfx.Play(Snd.Coin);
            MetaUi.ShowRewards(Layer, $"扫荡 第{st.No}关", r);
        }

        /// <summary>关卡绶带两侧的朱红圆箭头。原图朝左，向右的翻过来。</summary>
        void ArrowBtn(RectTransform tag, float x, int dir)
        {
            var b = Ui.Icon(tag, "ui/h_arrow", 80, new Vector2(x, 4), "arrow");
            if (dir > 0) b.rectTransform.localScale = new Vector3(-1, 1, 1);
            Ui.Tap(b, () =>
            {
                S.Selected = Mathf.Clamp(S.Selected + dir, 1, Mathf.Min(Defs.LevelCount, S.Cleared + 1));
                Profile.Save();
            });
        }

        /// <summary>左右功能侧坞：半透明深靛毛玻璃竖舱，把零散入口收纳成清爽模块。</summary>
        void SideDock(float x, float firstY, float step, int count)
        {
            if (count <= 0) return;
            float h = (count - 1) * step + 144f;
            float cy = firstY + (count - 1) * step * 0.5f - 2f;
            var d = Top(x, cy, new Vector2(118, h), x < 0 ? "dockL" : "dockR");
            Ui.Box(d, new Vector2(120, h + 4), Vector2.zero, DockEdge, Art.Rounded, "rim");
            Ui.Box(d, new Vector2(114, h - 2), Vector2.zero, Glass, Art.Rounded, "fill");
        }

        /// <summary>入口圆章：深靛银边圆底托住图标，冷瓷白字清楚利落。</summary>
        void SideBtn(float x, float y, string icon, string name, bool dot, Action act, bool locked = false)
        {
            var b = Top(x, y, new Vector2(112, 128), "side_" + name);
            var hit = Ui.Box(b, new Vector2(112, 128), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            Ui.Icon(b, "ui/h_round", 92, new Vector2(0, 12), "bg");
            var ic = Ui.Icon(b, icon, 66, new Vector2(0, 14));
            if (locked)
            {
                ic.color = new Color(0.52f, 0.58f, 0.65f);
                Ui.Icon(b, "ic_lock", 34, new Vector2(26, -6));
            }
            Ui.Outlined(b, name, 24, Paper, new Vector2(0, -44), new Vector2(130, 32), Ink, 1.9f);
            if (dot) MetaUi.Dot(b, new Vector2(34, 48)).rectTransform.localScale = Vector3.one * 0.72f;
            Ui.Tap(hit, act, b);
        }

        // ---------------- 好汉 ----------------

        /// <summary>换人模式：详情里点了「上阵」的好汉，等玩家点顶上要替换的位置。</summary>
        HeroId? _swap;
        int _popSlot = -1;
        HeroId? _dragHero;
        RectTransform _dragGhost, _dragDim;
        readonly List<RectTransform> _dragSlots = new List<RectTransform>();
        readonly List<Image> _dragMarks = new List<Image>();
        public bool Swapping => _swap.HasValue;

        public void BeginSwap(HeroId h)
        {
            _swap = h;
            Sfx.Play(Snd.Swap, 0.6f);
            Rebuild(false);
        }

        void EndSwap(int slot)
        {
            if (_swap.HasValue && slot >= 0)
            {
                var h = _swap.Value;
                Meta.SetLineup(S, slot, h);
                Profile.Save();
                Sfx.Play(Snd.Swap);
                Ui.Toast($"{Defs.Hero(h).Name} 上阵", 200);
                _popSlot = slot;
            }
            _swap = null;
            Rebuild(false);
        }

        /// <summary>长按还没上阵的好汉，拖到上方四位里松手就换上。已经在阵上的长按不起效果。</summary>
        public void BeginLineupDrag(HeroId h, Vector2 screen)
        {
            CancelLineupDrag();
            if (!Meta.Owned(S, h) || _swap.HasValue) return;
            if (Array.IndexOf(S.Lineup, (int)h) >= 0) return;
            _dragHero = h;
            var d = Defs.Hero(h);
            var g = Ui.Rect(Layer, "dragHero");
            g.sizeDelta = new Vector2(220, 280);
            var shadow = Ui.Box(g, new Vector2(150, 36), new Vector2(0, -118), new Color(0.1f, 0.08f, 0.05f, 0.4f), Art.GroundShadow, "sh");
            var art = Ui.Icon(g, d.Art, 230, new Vector2(0, 8));
            art.rectTransform.pivot = new Vector2(0.5f, 0f);
            art.rectTransform.anchoredPosition = new Vector2(0, -100);
            Ui.Outlined(g, d.Name, 28, Color.white, new Vector2(0, -128), new Vector2(220, 40), Pal.Ink, 1.6f);
            foreach (var gr in g.GetComponentsInChildren<Graphic>()) gr.raycastTarget = false;
            shadow.raycastTarget = false;
            _dragGhost = g;
            var lu = _page != null ? _page.Find("body/lineup") as RectTransform : null;
            // 暗层只盖名单，不盖点将台，台上四位一直亮着。
            _dragDim = DimBelow(lu);
            if (lu != null)
            {
                for (int i = 0; i < lu.childCount && i < 4; i++)
                {
                    var slot = lu.GetChild(i) as RectTransform;
                    if (slot == null) continue;
                    var glow = Ui.Box(slot, new Vector2(230, 280), new Vector2(0, 16), Pal.Hex("FFE98A").A(0.45f), Art.SoftDot, "dragGlow");
                    glow.raycastTarget = false;
                    glow.transform.SetAsFirstSibling();
                    float off = i * 0.6f;
                    Tween.Run(glow, 999f, k => { if (glow) glow.color = Pal.Hex("FFE98A").A(0.32f + 0.2f * Mathf.Sin(k * 999f * 5f + off)); });
                    _dragSlots.Add(slot);
                    if (!SlotPoint(slot, new Vector2(0, 216f), out var at))
                    {
                        _dragMarks.Add(null);
                        continue;
                    }
                    var badge = Ui.Box(Layer, Vector2.one * 58, at, Pal.Hex("14202C").A(0.92f), Art.Circle, "swapBadge");
                    badge.raycastTarget = false;
                    var mark = Ui.Box(badge.transform, Vector2.one * 38, Vector2.zero, Color.white, Art.SwapMark, "swap");
                    mark.raycastTarget = false;
                    _dragMarks.Add(mark);
                }
            }
            MoveLineupDrag(screen);
            _dragGhost.SetAsLastSibling();
            Sfx.Play(Snd.Tick, 0.7f);
        }

        /// <summary>从点将台下沿盖到屏幕底。台上的人留在暗层外面。</summary>
        RectTransform DimBelow(RectTransform lineup)
        {
            float top = 0f;
            if (lineup)
            {
                var corners = new Vector3[4];
                lineup.GetWorldCorners(corners);
                var screen = RectTransformUtility.WorldToScreenPoint(null, corners[0]);
                if (RectTransformUtility.ScreenPointToLocalPointInRectangle(Layer, screen, null, out var local))
                    top = local.y - 8f;
            }
            float bottom = Layer.rect.yMin;
            var rt = Ui.Rect(Layer, "dragDim");
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0f);
            rt.pivot = new Vector2(0.5f, 0f);
            rt.sizeDelta = new Vector2(Layer.rect.width + 40f, Mathf.Max(0f, top - bottom));
            rt.anchoredPosition = Vector2.zero;
            var img = rt.gameObject.AddComponent<Image>();
            img.color = new Color(0.02f, 0.05f, 0.1f, 0.58f);
            img.raycastTarget = false;
            return rt;
        }

        bool SlotPoint(RectTransform slot, Vector2 local, out Vector2 layer)
        {
            layer = Vector2.zero;
            var world = slot.TransformPoint(local);
            var screen = RectTransformUtility.WorldToScreenPoint(null, world);
            return RectTransformUtility.ScreenPointToLocalPointInRectangle(Layer, screen, null, out layer);
        }

        public void MoveLineupDrag(Vector2 screen)
        {
            if (_dragGhost == null) return;
            if (RectTransformUtility.ScreenPointToLocalPointInRectangle(Layer, screen, null, out var local))
                _dragGhost.anchoredPosition = local;
            int hot = HitLineupSlot(screen);
            for (int i = 0; i < _dragSlots.Count; i++)
            {
                _dragSlots[i].localScale = Vector3.one * (i == hot ? 1.08f : 1.04f);
                if (i >= _dragMarks.Count || !_dragMarks[i]) continue;
                bool on = i == hot;
                _dragMarks[i].sprite = on ? Art.SwitchHero : Art.SwapMark;
                _dragMarks[i].color = on ? Pal.Hex("14301C") : Color.white;
                _dragMarks[i].rectTransform.localScale = Vector3.one * (on ? 1.08f : 1f);
                var badge = _dragMarks[i].transform.parent.GetComponent<Image>();
                if (badge) badge.color = Pal.Hex(on ? "7DFF9A" : "14202C").A(on ? 0.96f : 0.92f);
            }
        }

        public void FinishLineupDrag(Vector2 screen)
        {
            int slot = _dragHero.HasValue ? HitLineupSlot(screen) : -1;
            var hero = _dragHero;
            CancelLineupDrag();
            if (!hero.HasValue || slot < 0 || slot >= S.Lineup.Length) return;
            if (S.Lineup[slot] == (int)hero.Value) return;
            bool moved = Array.IndexOf(S.Lineup, (int)hero.Value) >= 0;
            Meta.SetLineup(S, slot, hero.Value);
            _popSlot = slot;
            Profile.Save();
            Sfx.Play(Snd.Swap);
            Ui.Toast(moved ? $"{Defs.Hero(hero.Value).Name} 换位" : $"{Defs.Hero(hero.Value).Name} 上阵", 200);
            Rebuild(false);
        }

        public void CancelLineupDrag()
        {
            _dragHero = null;
            if (_dragGhost) Destroy(_dragGhost.gameObject);
            _dragGhost = null;
            if (_dragDim) Destroy(_dragDim.gameObject);
            _dragDim = null;
            for (int i = 0; i < _dragSlots.Count; i++)
            {
                if (!_dragSlots[i]) continue;
                _dragSlots[i].localScale = Vector3.one;
                var glow = _dragSlots[i].Find("dragGlow");
                if (glow) Destroy(glow.gameObject);
            }
            for (int i = 0; i < _dragMarks.Count; i++)
                if (_dragMarks[i] && _dragMarks[i].transform.parent) Destroy(_dragMarks[i].transform.parent.gameObject);
            _dragSlots.Clear();
            _dragMarks.Clear();
        }

        int HitLineupSlot(Vector2 screen)
        {
            for (int i = 0; i < _dragSlots.Count; i++)
                if (_dragSlots[i] && RectTransformUtility.RectangleContainsScreenPoint(_dragSlots[i], screen, null))
                    return i;
            return -1;
        }

        void SwitchPreset(int pi)
        {
            if (pi == S.Preset) return;
            Meta.UsePreset(S, pi);
            Profile.Save();
            Sfx.Play(Snd.Swap);
            _swap = null;
            Rebuild(false);
            var l = _page.Find("body/lineup");
            if (l) for (int k = 0; k < l.childCount; k++) Tween.Pop(l.GetChild(k), 0.28f, k * 0.04f);
        }

        void RenamePreset(int pi)
        {
            var m = MetaUi.Modal(Layer, "presetName", "方案改名", new Vector2(780, 560), out var p);
            Ui.Label(p, "写下这套方案的名字", 28, Pal.Hex("7C6852"), new Vector2(0, 166), new Vector2(680, 48), TextAnchor.MiddleCenter, Fonts.Heavy);
            var well = Ui.Box(p, new Vector2(560, 96), new Vector2(0, 24), Pal.Hex("F4E6CC"), Art.Pill, "well");
            var field = Ui.Rect(well.transform, "field");
            field.sizeDelta = new Vector2(520, 80);
            var hit = field.gameObject.AddComponent<Image>();
            hit.color = new Color(1f, 1f, 1f, 0.001f);
            var shown = Ui.Label(field, "", 36, Pal.Hex("543006"), Vector2.zero, new Vector2(500, 72), TextAnchor.MiddleCenter, Fonts.Heavy, "text");
            shown.supportRichText = false;
            var ph = Ui.Label(field, "方案" + (pi + 1), 36, Pal.Hex("B08968"), Vector2.zero, new Vector2(500, 72), TextAnchor.MiddleCenter, Fonts.Heavy, "ph");
            ph.raycastTarget = false;
            var input = field.gameObject.AddComponent<InputField>();
            input.textComponent = shown;
            input.placeholder = ph;
            input.characterLimit = 6;
            input.lineType = InputField.LineType.SingleLine;
            input.text = Meta.PresetName(S, pi);
            input.caretColor = Pal.Hex("543006");
            input.selectionColor = new Color(0.91f, 0.71f, 0.35f, 0.45f);
            input.ActivateInputField();
            Ui.Btn(p, "取消", new Vector2(240, 94), new Vector2(-150, -168), Pal.Slate, () => MetaUi.Close(m), 36);
            Ui.Btn(p, "确定", new Vector2(240, 94), new Vector2(150, -168), Pal.Gold, () =>
            {
                string trimmed = (input.text ?? "").Trim();
                if (trimmed.Length > 0 && !FontCanShow(trimmed))
                {
                    Ui.Toast("有写不出来的字，换一个", 220);
                    return;
                }
                Meta.SetPresetName(S, pi, trimmed);
                Profile.Save();
                Sfx.Play(Snd.Tap);
                MetaUi.Close(m);
                Rebuild(false);
            }, 36, null, Pal.Hex("543008"));
        }

        static bool FontCanShow(string s)
        {
            var font = Fonts.Heavy;
            if (!font) return true;
            foreach (var c in s)
            {
                if (char.IsWhiteSpace(c)) continue;
                if (!font.HasCharacter(c)) return false;
            }
            return true;
        }

        void BuildHeroes(bool anim)
        {
            Cover("hero_stage_bg", new Vector2(1080, 1920), Color.white, 0.5f);
            Shade(0.24f, 0f);
            float sp = Ui.Spare;

            // 上半：出战四好汉稳踏梁山山巅青石点将台（脚底落定于石坪贴地暗影，绝不踩屋顶悬空）
            var line = Meta.Lineup(S);
            float luY = 434 + sp * 0.15f;
            var lu = Top(0, luY, new Vector2(1000, 300), "lineup");
            lu.localScale = Vector3.one * (1f + Mathf.Min(0.1f, sp / 2500f));
            for (int i = 0; i < 4; i++)
            {
                var h = line[i];
                var d = Defs.Hero(h);
                var g = Ui.Rect(lu, "lu" + i);
                g.anchoredPosition = new Vector2((i - 1.5f) * 246, 0);
                g.sizeDelta = new Vector2(240, 300);
                // 脚下贴地接触阴影 + 对应品质柔光底座环 + 右下职业圆章（对标参考图点将台效果）
                int tier = MetaUi.HeroTier(d.Rarity);
                if (tier >= 1)
                    Ui.Box(g, new Vector2(174, 42), new Vector2(0, -101), MetaUi.QualColor(tier).A(tier >= 3 ? 0.52f : 0.38f), Art.SoftDot, "qAura");
                Ui.Box(g, new Vector2(158, 32), new Vector2(0, -103), new Color(0.18f, 0.11f, 0.05f, 0.46f), Art.GroundShadow, "shadow");
                var art = Ui.Icon(g, d.Art, 242, Vector2.zero, "art");
                art.rectTransform.pivot = new Vector2(0.5f, 0f);
                art.rectTransform.anchoredPosition = new Vector2(0, -104);
                float ph = i * 0.7f;
                Tween.Run(art, 999f, k => art.rectTransform.localScale = new Vector3(1f, 1f + 0.012f * Mathf.Sin(k * 999f * 2.2f + ph), 1f));
                // 右下精致职业圆章
                Ui.Box(g, Vector2.one * 44, new Vector2(66, -86), Color.white, Art.Circle, "rRing");
                Ui.Box(g, Vector2.one * 37, new Vector2(66, -86), MetaUi.RoleColor(d.Kind), Art.Circle, "rBg");
                Ui.Icon(g, MetaUi.RoleArt(d.Kind), 28, new Vector2(66, -85));
                var plate = Ui.Skin(g, "h_capsule", new Vector2(206, 46), new Vector2(0, -134), -1f);
                Ui.SingleLine(Ui.Outlined(plate.transform, $"Lv.{S.HeroLv[(int)h]} {d.Name}", 23, d.Rarity >= 4 ? Pal.Hex("FFF0B2") : Paper, new Vector2(0, 1), new Vector2(194, 42), Ink, 1.5f), 18);
                int slot = i;
                if (_swap.HasValue)
                {
                    var glow = Ui.Box(g, new Vector2(230, 280), new Vector2(0, 16), Pal.Hex("B6FF8A").A(0.4f), Art.SoftDot, "swapGlow");
                    glow.raycastTarget = false;
                    glow.transform.SetAsFirstSibling();
                    float pulse = i * 0.5f;
                    Tween.Run(glow, 999f, k => glow.color = Pal.Hex("B6FF8A").A(0.28f + 0.18f * Mathf.Sin(k * 999f * 5f + pulse)));
                    var arrow = Ui.Icon(g, "ui/arrow", 86, new Vector2(0, 160), "swapArrow");
                    arrow.transform.localRotation = Quaternion.Euler(0, 0, 90);
                    arrow.color = Pal.Hex("8CFF6A");
                    float off = i * 0.4f;
                    Tween.Run(arrow, 999f, k => arrow.rectTransform.anchoredPosition = new Vector2(0, 160 + 12 * Mathf.Sin(k * 999f * 6f + off)));
                    Ui.Tap(art, () => EndSwap(slot), g);
                    Ui.Tap(arrow, () => EndSwap(slot), g);
                }
                else
                {
                    Ui.Tap(art, () => MetaUi.HeroDetail(Layer, h), g);
                    if (Meta.CanLevel(S, h)) MetaUi.Dot(g, new Vector2(98, -104));
                }
                if (anim) Tween.Pop(g, 0.3f, 0.05f + i * 0.05f);
                if (_popSlot == i)
                {
                    Tween.Pop(g, 0.35f);
                    MetaFx.Burst(lu, g.anchoredPosition, 10, 180);
                }
            }
            _popSlot = -1;

            float pgY = luY + 200;
            const float gap = 18f;
            var widths = new float[Meta.PresetCount];
            float row = 0f;
            for (int i = 0; i < Meta.PresetCount; i++)
            {
                if (i == S.Preset)
                {
                    float textW = Mathf.Max(108f, Meta.PresetName(S, i).Length * 34f);
                    widths[i] = 36f + textW + 62f;
                }
                else widths[i] = 72f;
                row += widths[i];
            }
            row += gap * (Meta.PresetCount - 1);
            float cursor = -row * 0.5f;
            for (int i = 0; i < Meta.PresetCount; i++)
            {
                bool on = i == S.Preset;
                float w = widths[i];
                float cx = cursor + w * 0.5f;
                cursor += w + gap;
                int pi = i;
                var dot = Top(cx, pgY, new Vector2(w, 80), "preset" + i);
                if (!on)
                {
                    var face = Ui.Box(dot, Vector2.one * 64, Vector2.zero, Pal.Hex("3E4E5E"), Art.Circle, "face");
                    Ui.Box(dot, Vector2.one * 54, Vector2.zero, Pal.Hex("536577"), Art.Circle, "inner");
                    Ui.Outlined(dot, (i + 1).ToString(), 28, Color.white, new Vector2(0, 1), new Vector2(64, 56), Ink, 1.3f);
                    Ui.Tap(face, () => SwitchPreset(pi), dot);
                    continue;
                }
                float badgeX = -w * 0.5f + 36f;
                float pillW = w - 28f;
                float pillX = badgeX + pillW * 0.5f - 8f;
                var shadow = Ui.Box(dot, new Vector2(pillW, 64), new Vector2(pillX, -3f), Pal.Hex("3A2414"), Art.Pill, "shade");
                shadow.raycastTarget = false;
                Ui.Box(dot, new Vector2(pillW, 64), new Vector2(pillX, 0), Pal.Hex("6B4528"), Art.Pill, "pill");
                Ui.Box(dot, Vector2.one * 76, new Vector2(badgeX, 0), Pal.Hex("C98412"), Art.Circle, "rim");
                var badge = Ui.Box(dot, Vector2.one * 64, new Vector2(badgeX, 0), Pal.Hex("F6C53A"), Art.Circle, "badge");
                Ui.Outlined(badge.transform, (i + 1).ToString(), 34, Pal.Hex("543006"), new Vector2(0, 1), new Vector2(64, 56), Pal.Hex("FFF1C2"), 1.1f);
                float penX = w * 0.5f - 30f;
                float nameLeft = badgeX + 36f;
                float nameW = Mathf.Max(72f, penX - 22f - nameLeft);
                var name = Ui.Label(dot, Meta.PresetName(S, i), 30, Pal.Hex("F6E6C4"), new Vector2(nameLeft + nameW * 0.5f, 1f), new Vector2(nameW, 56), TextAnchor.MiddleCenter, Fonts.Heavy, "name");
                name.raycastTarget = false;
                var pen = Ui.Box(dot, new Vector2(44, 48), new Vector2(penX, 2f), Pal.Hex("F4E4C2"), Art.Quill, "pen");
                Ui.Tap(pen, () => RenamePreset(pi), pen.rectTransform);
            }

            // 战力盾徽压在名册顶沿，顶边金线+菱花扣，暴击伤害增幅嵌于内凹深靛横幅（对标参考图名册框体）
            float py = pgY + 96f;
            var panel = Top(0, py, new Vector2(1068, 10), "roster");
            panel.pivot = new Vector2(0.5f, 1f);
            float ph2 = Mathf.Max(820f, Ui.Height - Ui.SafeTop - py - 176f);
            Ui.Skin(panel, "dark", new Vector2(1068, ph2), new Vector2(0, -ph2 * 0.5f), 1f);

            // 顶边溜金饰线与中央菱星扣
            Ui.Box(panel, new Vector2(680, 2.5f), new Vector2(0, -40f), Pal.Hex("DFC784").A(0.55f), Art.White);
            var topDia = Ui.Box(panel, new Vector2(12, 12), new Vector2(0, -40f), Pal.Hex("FFE69E"), Art.White);
            topDia.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);

            var pw = Ui.Rect(panel, "power");
            pw.sizeDelta = new Vector2(392, 86);
            pw.anchoredPosition = new Vector2(0, 8);
            Ui.Skin(pw, "power_crest", new Vector2(392, 86), Vector2.zero, 1f);
            Ui.Icon(pw, "ic_sword", 52, new Vector2(-96, 2));
            Ui.Outlined(pw, Ui.Num(Meta.TeamPower(S)), 40, Gold, new Vector2(22, 2), new Vector2(210, 56), Ink, 2.2f);

            // 内凹深海蓝暴击伤害增幅横幅（对标参考图顶部胶囊数据栏）
            var critWell = Ui.Rect(panel, "critWell");
            critWell.sizeDelta = new Vector2(780, 58);
            critWell.anchoredPosition = new Vector2(0, -82);
            Ui.Box(critWell, new Vector2(780, 58), Vector2.zero, Pal.Hex("3B627E").A(0.65f), Art.RoundedSmall);
            Ui.Box(critWell, new Vector2(774, 52), Vector2.zero, Pal.Hex("152838"), Art.RoundedSmall);
            var crit = Ui.Outlined(critWell, $"全村暴击伤害增幅：<color=#FFC84A>{Meta.BuildLoadout(S).CritDmg * 100:0.#}%</color>", 32, Paper, new Vector2(-18, 1), new Vector2(680, 50), Pal.Hex("0D1822"), 1.2f);
            crit.GetComponent<CrispStroke>().Radius = 0.8f;
            var bang = Ui.Box(critWell, Vector2.one * 38, new Vector2(342, 0), Pal.Hex("0C1620"), Art.Circle, "bang");
            Ui.Box(bang.transform, Vector2.one * 34, Vector2.zero, Pal.Hex("26445C"), Art.Circle);
            Ui.Outlined(bang.transform, "!", 25, Color.white, new Vector2(0, 1), new Vector2(36, 34), Pal.Hex("0C1620"), 1.2f);
            Ui.Tap(bang, () => Ui.Hint(bang.transform, "全村暴击伤害", "任意乡亲每升 1 级，\n全村暴击伤害 +1%"), bang.transform);

            var roles = new List<int> { -1 };
            foreach (var r in Defs.RoleOrder) roles.Add((int)r);
            int owned = 0;
            for (int h = 0; h < Defs.HeroCount; h++) if (Meta.Owned(S, (HeroId)h)) owned++;
            for (int i = 0; i < roles.Count; i++)
            {
                int rf = roles[i];
                bool sel = rf == _roleFilter;
                var col = rf < 0 ? Pal.Azure : MetaUi.RoleColor((Role)rf);
                var pos = new Vector2((i - (roles.Count - 1) * 0.5f) * 144, -158);
                var tb = Ui.Skin(panel, sel ? "btn_teal" : "h_capsule", new Vector2(136, 60), pos, -1f);
                if (rf >= 0) Ui.Icon(tb.transform, MetaUi.RoleArt((Role)rf), 36, new Vector2(-40, 2));
                Ui.Outlined(tb.transform, rf < 0 ? $"全部 {owned}" : Defs.RoleName((Role)rf), rf < 0 ? 23 : 25, sel ? Color.white : Pal.Hex("C6DAE8"), new Vector2(rf < 0 ? 0 : 16, 1), new Vector2(114, 56), Ink, 1.4f);
                Ui.Tap(tb, () =>
                {
                    if (_roleFilter == rf) return;
                    _roleFilter = rf;
                    _rosterScroll = 0;
                    Sfx.Play(Snd.Tab, 0.6f);
                    Rebuild(false);
                }, tb.transform, false);
            }

            var order = new List<HeroId>();
            for (int h = 0; h < Defs.HeroCount; h++)
                if (_roleFilter < 0 || (int)Defs.Hero((HeroId)h).Kind == _roleFilter) order.Add((HeroId)h);
            order.Sort((a, b) =>
            {
                bool oa = Meta.Owned(S, a), ob = Meta.Owned(S, b);
                if (oa != ob) return oa ? -1 : 1;
                bool la = Array.IndexOf(S.Lineup, (int)a) >= 0, lb = Array.IndexOf(S.Lineup, (int)b) >= 0;
                if (la != lb) return la ? -1 : 1;
                int r = Defs.Hero(b).Rarity.CompareTo(Defs.Hero(a).Rarity);
                if (r != 0) return r;
                if (!oa)
                {
                    int ua = Meta.UnlockLevelOf(a), ub = Meta.UnlockLevelOf(b);
                    if (ua != ub) return (ua == 0 ? 999 : ua).CompareTo(ub == 0 ? 999 : ub);
                }
                return S.HeroLv[(int)b] != S.HeroLv[(int)a] ? S.HeroLv[(int)b].CompareTo(S.HeroLv[(int)a]) : a.CompareTo(b);
            });

            float viewH = ph2 - 214;
            var view = Ui.Rect(panel, "view");
            view.anchorMin = view.anchorMax = new Vector2(0.5f, 1f);
            view.pivot = new Vector2(0.5f, 1f);
            view.sizeDelta = new Vector2(1030, viewH);
            view.anchoredPosition = new Vector2(0, -204);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            const float rowH = 318;
            int rows = (order.Count + 3) / 4;
            content.sizeDelta = new Vector2(1030, rows * rowH + 80);
            var top = Ui.Rect(content, "top");
            top.anchorMin = top.anchorMax = new Vector2(0.5f, 1f);
            top.sizeDelta = Vector2.zero;
            for (int i = 0; i < order.Count; i++)
            {
                var c = HeroCard(top, order[i], new Vector2(((i % 4) - 1.5f) * 250, -(162 + (i / 4) * rowH)));
                if (anim && i < 12) Tween.Pop(c, 0.28f, 0.04f + i * 0.025f);
            }
            Ui.Outlined(top, "碎片来源：通关 · 敲锣摇人 · 签到 · 章节宝箱", 26, Pal.Cream, new Vector2(0, -(rows * rowH + 34)), new Vector2(900, 44), Pal.Ink, 1.5f);
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.scrollSensitivity = 30;
            content.anchoredPosition = new Vector2(0, Mathf.Clamp(_rosterScroll, 0, Mathf.Max(0, content.sizeDelta.y - viewH)));
            sr.onValueChanged.AddListener(_ => _rosterScroll = content.anchoredPosition.y);

            if (_swap.HasValue)
            {
                var sh = _swap.Value;
                var dim = Ui.Box(panel, new Vector2(1060, ph2), new Vector2(0, -ph2 * 0.5f), new Color(0.02f, 0.05f, 0.1f, 0.78f), Art.Rounded, "swapDim");
                dim.raycastTarget = true;
                Ui.Tap(dim, () => EndSwap(-1), null, false);
                var card = HeroCard(panel, sh, new Vector2(0, -ph2 * 0.36f));
                card.localScale = Vector3.one * 1.3f;
                foreach (var g in card.GetComponentsInChildren<Graphic>()) g.raycastTarget = false;
                var glow = Ui.Box(panel, new Vector2(520, 560), new Vector2(0, -ph2 * 0.36f), Pal.Gold.A(0.4f), Art.SoftDot, "glow");
                glow.transform.SetSiblingIndex(card.GetSiblingIndex());
                Ui.Outlined(panel, "点击上方要替换的乡亲", 40, Pal.Hex("FFE08A"), new Vector2(0, -ph2 * 0.36f - 260), new Vector2(900, 56), Pal.Ink, 2.5f);
                Ui.Btn(panel, "取消", new Vector2(240, 96), new Vector2(0, -ph2 * 0.36f - 360), Pal.Hex("A08A70"), () => EndSwap(-1), 38);
            }
        }

        /// <summary>好汉卡（全游统一品质体系升级版）：稀有晶蓝斜切框 / 史诗星紫雕花框 / 传说鎏金神翼光环框，内嵌等级球+满碎片翠绿胶囊条，卡下清晰名牌。</summary>
        RectTransform HeroCard(Transform parent, HeroId h, Vector2 pos)
        {
            var d = Defs.Hero(h);
            int lv = S.HeroLv[(int)h];
            bool owned = lv > 0;
            int tier = MetaUi.HeroTier(d.Rarity);
            var c = Ui.Rect(parent, "card_" + h);
            c.anchoredPosition = pos;
            c.sizeDelta = new Vector2(238, 306);

            // 传说好汉卡外圈呼吸鎏金气场（拉开顶阶尊贵度）
            if (owned && tier >= 3)
            {
                var aura = Ui.Box(c, new Vector2(276, 294), new Vector2(0, 20), Pal.Hex("FFC842").A(0.28f), Art.SoftDot, "aura");
                Tween.Run(aura, 999f, k => aura.color = Pal.Hex("FFC842").A(0.20f + 0.10f * Mathf.Sin(k * 999f * 2.6f)));
            }

            var face = MetaUi.Card(c, owned ? MetaUi.RarityCard(d.Rarity) : "card_lock", new Vector2(234, 258), new Vector2(0, 20));

            // 卡内舞台背光与立绘裁切窗（全彩满铺卡底 + 贴地脚影）
            var artMask = Ui.Rect(c, "artMask");
            artMask.sizeDelta = new Vector2(210, 194);
            artMask.anchoredPosition = new Vector2(0, 32);
            artMask.gameObject.AddComponent<RectMask2D>();
            if (owned && tier >= 2)
            {
                var backGlow = Ui.Box(artMask, Vector2.one * (tier >= 3 ? 196 : 172), new Vector2(0, 6),
                    MetaUi.QualGlow(tier).A(tier >= 3 ? 0.36f : 0.22f), Art.SoftDot, "stageGlow");
                backGlow.raycastTarget = false;
            }
            Ui.Box(artMask, new Vector2(130, 26), new Vector2(0, -48), new Color(0.06f, 0.05f, 0.10f, owned ? 0.34f : 0.22f), Art.GroundShadow, "footSh");
            var art = Ui.Icon(artMask, d.Art, 202, new Vector2(0, -2));
            if (!owned) art.color = new Color(0.13f, 0.16f, 0.21f, 0.88f);

            // 左上角立体白瓷镶边职业徽章（对标参考图左上压角圆章）
            Ui.Box(c, Vector2.one * 60, new Vector2(-87, 117), new Color(0.05f, 0.09f, 0.15f, 0.32f), Art.Circle, "roleSh");
            Ui.Box(c, Vector2.one * 56, new Vector2(-87, 119), Color.white, Art.Circle, "roleRing");
            Ui.Box(c, Vector2.one * 46, new Vector2(-87, 119), owned ? MetaUi.RoleColor(d.Kind) : Pal.Slate, Art.Circle, "roleBg");
            Ui.Icon(c, MetaUi.RoleArt(d.Kind), 35, new Vector2(-87, 120));

            // 卡框正下方清晰名牌（传说好汉暖香槟金字，其余纯白描边字）
            Color nameCol = !owned ? Pal.Hex("9EB2C6") : tier >= 3 ? Pal.Hex("FFF1B4") : Color.white;
            Ui.Outlined(c, d.Name, 29, nameCol, new Vector2(0, -130), new Vector2(234, 40), Pal.Ink, 2f);

            if (owned)
            {
                if (Array.IndexOf(S.Lineup, (int)h) >= 0)
                {
                    var on = Ui.Icon(c, "ui/tag_red", 104, new Vector2(-58, -32), "onTag");
                    Ui.Outlined(on.transform, "出战中", 21, Color.white, new Vector2(-5, 1), new Vector2(88, 34), Pal.Hex("5C120E"), 1.4f);
                }

                int need = Meta.ShardCost(lv);
                bool max = lv >= Meta.MaxHeroLv;
                bool can = Meta.CanLevel(S, h);
                float frac = max ? 1f : Mathf.Clamp01(S.Shards[(int)h] / (float)Mathf.Max(1, need));

                // 等级圆章靠在胶囊左沿外侧，条本身和任务进度条同一套皮。可升级冰蓝、攒碎片翠绿、满级鎏金。
                float barW = can ? 132f : 148f;
                const float barH = 24f, rowY = -74f;
                float barX = can ? 10f : 16f;
                MetaUi.Bar(c, new Vector2(barX, rowY), new Vector2(barW, barH), frac, MetaUi.ShardFill(max, can),
                    max ? "满级" : $"{S.Shards[(int)h]}/{need}");

                var lvPos = new Vector2(barX - barW * 0.5f - 20f, rowY);
                Ui.Box(c, Vector2.one * 42, lvPos, Pal.Hex("14202C"), Art.Circle, "lvInk");
                Ui.Box(c, Vector2.one * 36, lvPos, tier >= 3 ? Pal.Hex("FFE288") : Color.white, Art.Circle, "lvRim");
                Ui.Box(c, Vector2.one * 29, lvPos, Pal.Hex("27394C"), Art.Circle, "lvCore");
                Ui.Outlined(c, lv.ToString(), 19, Color.white, lvPos + new Vector2(0, 1), new Vector2(38, 30), Pal.Hex("101A24"), 1.3f);

                if (can)
                {
                    var up = Ui.Box(c, new Vector2(34, 34), new Vector2(barX + barW * 0.5f + 16f, rowY + 2f), Color.white, Art.UpArrow, "up");
                    Ui.Breathe(up, 4f);
                }
            }
            else
            {
                Ui.Icon(c, "ic_lock", 46, new Vector2(84, 118));
                string src = d.Rarity >= 4 && !Meta.OrangeOpened(S) ? $"第{Meta.OrangeOpen}关后可摇" : "摇人获得";
                Ui.Box(c, new Vector2(188, 28), new Vector2(0, -74), new Color(0.07f, 0.11f, 0.16f, 0.72f), Art.Pill, "lockBar");
                Ui.Outlined(c, src, 20, Pal.Hex("CFE2F2"), new Vector2(0, -73), new Vector2(184, 30), Pal.Hex("0E1720"), 1.2f);
            }
            var hit = Ui.Box(c, new Vector2(238, 306), Vector2.zero, new Color(1f, 1f, 1f, 0.001f), Art.White, "hit");
            hit.raycastTarget = true;
            LineupDrag drag = null;
            // 已经站在点将台上的，长按不抬起来，也不进换位。
            if (owned && Array.IndexOf(S.Lineup, (int)h) < 0)
            {
                drag = hit.gameObject.AddComponent<LineupDrag>();
                drag.Init(this, h, c.GetComponentInParent<ScrollRect>());
            }
            Ui.Tap(hit, () =>
            {
                if (drag != null && drag.Ate) return;
                MetaUi.HeroDetail(Layer, h);
            }, c);
            return c;
        }

        /// <summary>按住已拥有的好汉一小会儿就抬起可拖。手指先滑出一段，才交给名单滚动。</summary>
        sealed class LineupDrag : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IInitializePotentialDragHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
        {
            HomeScreen _home;
            HeroId _hero;
            ScrollRect _scroll;
            bool _down, _drag, _passed;
            float _t;
            Vector2 _origin, _pos;
            const float Hold = 0.16f;

            public bool Ate { get; private set; }

            public void Init(HomeScreen home, HeroId hero, ScrollRect scroll)
            {
                _home = home;
                _hero = hero;
                _scroll = scroll;
            }

            ScrollRect Scroll()
            {
                if (_scroll == null) _scroll = GetComponentInParent<ScrollRect>();
                return _scroll;
            }

            public void OnPointerDown(PointerEventData e)
            {
                Ate = false;
                _down = true;
                _drag = false;
                _passed = false;
                _t = Time.unscaledTime;
                _origin = _pos = e.position;
                var scroll = Scroll();
                if (scroll) scroll.StopMovement();
            }

            void Update()
            {
                if (!_down || _drag || _passed || _home == null || _home.Swapping) return;
                if (Time.unscaledTime - _t < Hold) return;
                StartDrag(_pos);
            }

            public void OnInitializePotentialDrag(PointerEventData e)
            {
                var scroll = Scroll();
                if (!_drag && !_passed && scroll) scroll.OnInitializePotentialDrag(e);
            }

            public void OnBeginDrag(PointerEventData e)
            {
                _pos = e.position;
                if (_drag || _passed || _home == null) return;
                if (Time.unscaledTime - _t >= Hold && !_home.Swapping)
                {
                    StartDrag(e.position);
                    return;
                }
                if (Slid(e.position)) HandToScroll(e);
            }

            public void OnDrag(PointerEventData e)
            {
                _pos = e.position;
                if (_drag)
                {
                    if (_home != null) _home.MoveLineupDrag(e.position);
                    return;
                }
                if (_passed)
                {
                    var scroll = Scroll();
                    if (scroll) scroll.OnDrag(e);
                    return;
                }
                if (Slid(e.position)) HandToScroll(e);
            }

            public void OnEndDrag(PointerEventData e)
            {
                var scroll = Scroll();
                if (!_passed || scroll == null) return;
                scroll.OnEndDrag(e);
                _passed = false;
            }

            public void OnPointerUp(PointerEventData e)
            {
                _down = false;
                if (!_drag)
                {
                    if (_passed) Ate = true;
                    return;
                }
                Ate = true;
                _drag = false;
                _home.FinishLineupDrag(e.position);
            }

            /// <summary>明显滑动才算在翻名单。按住时的轻微晃动不算。</summary>
            bool Slid(Vector2 p)
            {
                float scale = Ui.Root ? Ui.Root.lossyScale.x : 1f;
                return Vector2.Distance(p, _origin) >= Mathf.Max(36f, 24f * scale);
            }

            void HandToScroll(PointerEventData e)
            {
                if (_passed) return;
                _passed = true;
                _down = false;
                var scroll = Scroll();
                if (scroll == null) return;
                scroll.OnBeginDrag(e);
                scroll.OnDrag(e);
            }

            void StartDrag(Vector2 screen)
            {
                if (_drag || _passed || _home == null || _home.Swapping) return;
                _drag = true;
                _down = false;
                Ate = true;
                _home.BeginLineupDrag(_hero, screen);
            }

            void OnDestroy()
            {
                if (_drag && _home != null) _home.CancelLineupDrag();
            }
        }

        // ---------------- 寨主（统帅 + 2x3装备 + 图腾/装备/材料三页签抽屉，对标参考图2/3/4） ----------------

        public void SetForgeSubTab(int sub, int selectTotemId = 0)
        {
            _forgeSubTab = Mathf.Clamp(sub, 0, 2);
            if (selectTotemId > 0) _selectedTotemId = selectTotemId;
            if (_tab != TabForge) SetTab(TabForge);
            else Rebuild(false);
        }

        public void SetShopSubTab(int sub)
        {
            _shopSubTab = Mathf.Clamp(sub, 0, 1);
            // 纵向下拉长卷：0 回到顶部【擂鼓招募】，1 精准滚动定位至第二模块【兽魂寻宝】
            _shopScroll = _shopSubTab == 1 ? 824f : 0f;
            if (_tab != TabShop) SetTab(TabShop);
            else Rebuild(false);
        }

        void BuildForge(bool anim)
        {
            Cover("forge_bg", new Vector2(1080, 1920), Color.white, 0.25f);
            var fbg = _page.Find("body/bg") as RectTransform ?? _page.Find("bg") as RectTransform;
            if (fbg != null)
            {
                fbg.sizeDelta *= 1.16f;
                fbg.anchoredPosition += new Vector2(0, 138f);
            }
            Shade(0.24f, 0f);
            float sp = Ui.Spare;
            Action re = () => Rebuild(false);

            // 1. 左侧竖排 5 枚养成系统圆章（武器天赋 / 披风战氅 / 玄女天书 / 杏黄战旗 / 图鉴藏品）
            float leftStart = 212f + sp * 0.04f;
            float leftStep = 122f + sp * 0.02f;
            LordLeftBadge(-462, leftStart + leftStep * 0, "eq_weapon", "潜能", Meta.CanTalent(S), false, () => MetaUi.TalentTree(Layer, re));
            LordLeftBadge(-462, leftStart + leftStep * 1, "eq_cloak", "大衣", Meta.CanCloakUp(S), false, () => MetaUi.Cloak(Layer, re));
            LordLeftBadge(-462, leftStart + leftStep * 2, "ic_tome", "秘籍", Meta.CanPage(S) || Meta.CanTome(S), false, () => MetaUi.Tome(Layer, re));
            LordLeftBadge(-462, leftStart + leftStep * 3, "ic_flag", "锦旗", Meta.CanFlagUp(S), false, () => MetaUi.Flag(Layer, re));
            LordLeftBadge(-462, leftStart + leftStep * 4, "tab_codex", "图鉴", false, Meta.CodexBadge(S) > 0, () => MetaUi.Codex(Layer));

            // 2. 中央统帅立绘：与 Loading 页形象完全一致的全身宋江，实打实踩在演武石坪上（去掉悬浮蓝光圆盘）
            float stageY = 536f + sp * 0.16f;
            var sj = Top(-126, stageY, new Vector2(460, 520), "songjiang");
            Ui.Box(sj, new Vector2(216, 40), new Vector2(0, -211), new Color(0.16f, 0.10f, 0.05f, 0.48f), Art.GroundShadow, "shadow");
            var art = Ui.Icon(sj, "lord_songjiang", 464, Vector2.zero, "art");
            art.rectTransform.pivot = new Vector2(0.5f, 0f);
            art.rectTransform.anchoredPosition = new Vector2(0, -212);
            Tween.Run(art, 999f, k => art.rectTransform.localScale = new Vector3(1f, 1f + 0.012f * Mathf.Sin(k * 999f * 2.0f), 1f));
            Ui.Tap(art, () => MetaUi.LordStats(Layer), sj);
            if (anim) Tween.Pop(sj, 0.32f);

            // 战力条 + 详情感叹号
            var pw = Top(-126, stageY + 232f, new Vector2(304, 58), "lordPower");
            Ui.Box(pw, new Vector2(272, 52), Vector2.zero, Pal.Hex("0D1926").A(0.92f), Art.Pill);
            Ui.Box(pw, new Vector2(268, 48), Vector2.zero, Pal.Hex("5B82A6").A(0.85f), Art.Pill);
            Ui.Box(pw, new Vector2(263, 43), Vector2.zero, Pal.Hex("162A3E").A(0.94f), Art.Pill);
            Ui.Icon(pw, "ic_sword", 42, new Vector2(-94, 1));
            Ui.Outlined(pw, Ui.Num(Meta.TeamPower(S)), 36, Gold, new Vector2(-2, 1), new Vector2(156, 48), Pal.Hex("101C28"), 2.0f);
            var infoRim = Ui.Box(pw, new Vector2(44, 44), new Vector2(106, 0), Pal.Hex("0E1B28"), Art.Circle, "infoRim");
            Ui.Box(infoRim.transform, new Vector2(40, 40), Vector2.zero, Pal.Hex("7298BA"), Art.Circle);
            var infoBtn = Ui.Box(infoRim.transform, new Vector2(35, 35), Vector2.zero, Pal.Hex("233E58"), Art.Circle, "info");
            Ui.Outlined(infoRim.transform, "!", 27, Color.white, new Vector2(0, 1), new Vector2(42, 42), Pal.Hex("0E1B28"), 1.4f);
            Ui.Tap(infoBtn, () => MetaUi.LordStats(Layer), infoRim.transform);

            // 3. 右侧 2x3 清爽装备矩阵 + 左上图腾章 + 底部一键强化大按钮
            float eqTop = 214f + sp * 0.05f;
            var totemQuick = Top(40, eqTop + 26f, new Vector2(96, 112), "totemQuick");
            Ui.Box(totemQuick, new Vector2(88, 88), new Vector2(0, 10), new Color(0.05f, 0.11f, 0.18f, 0.36f), Art.Hex6);
            Ui.Box(totemQuick, new Vector2(86, 86), new Vector2(0, 12), Pal.Hex("112030"), Art.Hex6);
            Ui.Box(totemQuick, new Vector2(80, 80), new Vector2(0, 12), Pal.Hex("749EC0"), Art.Hex6);
            var tqHex = Ui.Box(totemQuick, new Vector2(72, 72), new Vector2(0, 12), Pal.Hex("1E364E"), Art.Hex6);
            Ui.Icon(totemQuick, "totem_wolf", 54, new Vector2(0, 12));
            Ui.Outlined(totemQuick, "徽章", 22, Paper, new Vector2(0, -39), new Vector2(96, 30), Ink, 1.5f);
            Ui.Tap(tqHex, () => SetForgeSubTab(0), totemQuick);

            // 部位顺序按参考图排列：玉佩、盘龙角 / 凤翅盔、龙泉剑 / 踏云靴、明光铠
            int[] displayOrder = { 4, 5, 1, 0, 3, 2 };
            for (int idx = 0; idx < 6; idx++)
            {
                int slot = displayOrder[idx];
                int col = idx % 2, row = idx / 2;
                float cx = 188f + col * 194f;
                float cy = eqTop + 68f + row * 168f;
                BuildEquipCard(cx, cy, slot, anim, idx);
            }

            // 右下琥珀金「强化」主按钮
            bool anyForge = false;
            int bestSlot = 0;
            for (int i = 0; i < Meta.Equips.Length; i++)
            {
                if (!Meta.CanForge(S, i)) continue;
                if (!anyForge || S.EquipLv[i] < S.EquipLv[bestSlot]) bestSlot = i;
                anyForge = true;
            }
            var enhBtn = Top(285, eqTop + 564f, new Vector2(372, 96), "quickForge");
            var enhCreated = Ui.Btn(enhBtn, "强化", new Vector2(372, 96), Vector2.zero, Pal.Gold,
                () => MetaUi.ForgeSlot(Layer, anyForge ? bestSlot : 0, () => Rebuild(false)), 42, null, Pal.Hex("56340C"));
            if (anyForge) MetaUi.Dot(enhCreated, new Vector2(164, 38));

            // 4. 下半屏温润宋瓷米白圆角抽屉（底边精准停在 TabBar 顶沿，内部为中央突起盾徽预留 106px 安全净空，绝不重叠）
            float drawerTop = 844f + sp * 0.24f;
            float drawerH = Mathf.Max(660f, Ui.Height - Ui.SafeTop - drawerTop - TabH);
            var drawer = Top(0, drawerTop, new Vector2(1080, drawerH), "drawer");
            drawer.pivot = new Vector2(0.5f, 1f);
            // Top 已经把刘海算进去了。这里改了轴心再写坐标，必须同样加上 SafeTop，否则微信上抽屉会整块上移，盖住强化按钮。
            drawer.anchoredPosition = new Vector2(0, -(drawerTop + Ui.SafeTop));

            static void TopStretch(RectTransform rt, float y, Vector2 sz)
            {
                rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
                rt.pivot = new Vector2(0.5f, 1f);
                rt.sizeDelta = sz;
                rt.anchoredPosition = new Vector2(0, y);
            }

            var dShadow = Ui.Box(drawer, Vector2.one, Vector2.zero, new Color(0.05f, 0.09f, 0.15f, 0.20f), Art.Rounded, "dShadow");
            TopStretch(dShadow.rectTransform, 6f, new Vector2(1086, drawerH + 42f));
            var dOuter = Ui.Box(drawer, Vector2.one, Vector2.zero, Pal.Hex("8A7F6D"), Art.Rounded, "dOuter");
            TopStretch(dOuter.rectTransform, 0f, new Vector2(1086, drawerH + 36f));
            var dTrim = Ui.Box(drawer, Vector2.one, Vector2.zero, Pal.Hex("E4DDD0"), Art.Rounded, "dTrim");
            TopStretch(dTrim.rectTransform, -2.5f, new Vector2(1084, drawerH + 33f));
            var dFace = Ui.Box(drawer, Vector2.one, Vector2.zero, Pal.Hex("F3EFE6"), Art.Rounded, "dFace");
            TopStretch(dFace.rectTransform, -11f, new Vector2(1084, drawerH + 25f));
            dFace.raycastTarget = true;

            // 顶沿装饰双细线 + 中央菱花扣（对标参考图抽屉顶饰）
            var dLine = Ui.Box(drawer, new Vector2(980, 2.5f), new Vector2(0, -13f), Pal.Hex("C9BFA9"), Art.White, "dLine");
            dLine.rectTransform.anchorMin = dLine.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            var dDiaRim = Ui.Box(drawer, new Vector2(20, 20), new Vector2(0, -13f), Pal.Hex("B5A88E"), Art.RoundedSmall, "dDiaRim");
            dDiaRim.rectTransform.anchorMin = dDiaRim.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            dDiaRim.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            var dDia = Ui.Box(drawer, new Vector2(13, 13), new Vector2(0, -13f), Pal.Hex("EFECE2"), Art.RoundedSmall, "dDia");
            dDia.rectTransform.anchorMin = dDia.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            dDia.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);

            // 三段式立体胶囊切换栏：图腾 / 装备 / 材料（采用高清亮金选中皮肤，质感与下方按钮统一）
            var seg = Ui.Rect(drawer, "seg");
            seg.anchorMin = seg.anchorMax = new Vector2(0.5f, 1f);
            seg.anchoredPosition = new Vector2(0, -64);
            seg.sizeDelta = new Vector2(936, 74);
            Ui.Box(seg, new Vector2(936, 74), Vector2.zero, Pal.Hex("6D675D"), Art.Pill);
            Ui.Box(seg, new Vector2(928, 66), Vector2.zero, Pal.Hex("7E786E"), Art.Pill);
            string[] subNames = { "徽章", "装备", "材料" };
            bool[] subDots = { Meta.CanMergeAnyTotem(S), S.GearBoxes > 0, false };
            for (int i = 0; i < 3; i++)
            {
                bool on = i == _forgeSubTab;
                float sx = (i - 1) * 306f;
                Image pill;
                if (on)
                {
                    pill = Ui.Skin(seg, "btn_gold", new Vector2(310, 68), new Vector2(sx, 1), 0.72f, null, "sub" + i);
                    var sl = Ui.Label(seg, subNames[i], 32, Pal.Hex("542F06"), new Vector2(sx, 2), new Vector2(260, 56),
                        TextAnchor.MiddleCenter, Fonts.Heavy);
                    var sh = sl.gameObject.AddComponent<Shadow>();
                    sh.effectColor = new Color(1f, 0.98f, 0.88f, 0.65f);
                    sh.effectDistance = new Vector2(0f, -1.3f);
                }
                else
                {
                    pill = Ui.Box(seg, new Vector2(304, 60), new Vector2(sx, 0), new Color(0, 0, 0, 0), Art.Pill, "sub" + i);
                    Ui.Outlined(seg, subNames[i], 30, Pal.Hex("F8F5EE"), new Vector2(sx, 1), new Vector2(260, 56), Pal.Hex("464038"), 1.6f);
                }
                if (subDots[i] && !on) MetaUi.Dot(seg, new Vector2(sx + 108, 22));
                int idx = i;
                Ui.Tap(pill, () =>
                {
                    if (_forgeSubTab == idx) return;
                    _forgeSubTab = idx;
                    Sfx.Play(Snd.Tab, 0.7f);
                    Rebuild(false);
                }, null, false);
            }

            if (_forgeSubTab == 0) BuildTotemDrawer(drawer, drawerH);
            else if (_forgeSubTab == 1) BuildEquipDrawer(drawer, drawerH);
            else BuildMaterialDrawer(drawer, drawerH);
        }

        void LordLeftBadge(float x, float y, string icon, string title, bool upArrow, bool redDot, Action onTap)
        {
            var b = Top(x, y, new Vector2(106, 114), "lord_" + title);
            var hit = Ui.Box(b, new Vector2(106, 114), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            Ui.Icon(b, "ui/h_round", 92, new Vector2(0, 10), "bg");
            Ui.Icon(b, icon, 56, new Vector2(0, 11));
            Ui.Outlined(b, title, 23, Paper, new Vector2(0, -37), new Vector2(112, 30), Ink, 1.6f);
            if (upArrow)
                Ui.Breathe(Ui.Box(b, new Vector2(36, 36), new Vector2(31, 37), Color.white, Art.UpArrow, "up"));
            else if (redDot)
                MetaUi.Dot(b, new Vector2(32, 38)).rectTransform.localScale = Vector3.one * 0.82f;
            Ui.Tap(hit, onTap, b);
        }

        void BuildEquipCard(float x, float y, int slot, bool anim, int orderIdx)
        {
            var e = Meta.Equips[slot];
            int lv = S.EquipLv[slot];
            int q = S.EquipQ[slot];
            const float cw = 186f, ch = 160f;
            var c = Top(x, y, new Vector2(cw, ch), "eq" + slot);

            // 传说装备专属呼吸鎏金光晕
            if (q >= 3)
            {
                var aura = Ui.Box(c, new Vector2(cw + 28f, ch + 28f), Vector2.zero, Pal.Hex("FFC842").A(0.28f), Art.SoftDot, "aura");
                Tween.Run(aura, 999f, k => aura.color = Pal.Hex("FFC842").A(0.18f + 0.10f * Mathf.Sin(k * 999f * 2.5f + orderIdx)));
            }

            // 全游统一五阶雕花装备专框（含底部暗晶宝石镶座，与好汉卡/装备格同源品质配色与包角纹饰）
            var face = MetaUi.EqCard(c, q, new Vector2(cw, ch), Vector2.zero);
            face.raycastTarget = true;

            if (q >= 2)
                Ui.Box(c, new Vector2(118, 118), new Vector2(0, 18), MetaUi.QualGlow(q).A(q >= 3 ? 0.34f : 0.22f), Art.SoftDot);
            Ui.Icon(c, e.Icon, 94, new Vector2(0, 17));

            // 左上品质金属镶边等级角标
            var lvPos = new Vector2(-cw * 0.5f + 41f, ch * 0.5f - 20f);
            Ui.Box(c, new Vector2(66, 26), lvPos, Pal.Hex("15202C"), Art.Pill);
            var lvTag = Ui.Box(c, new Vector2(62, 22), lvPos, MetaUi.QualBanner(q), Art.Pill);
            Ui.Outlined(lvTag.transform, $"Lv.{lv}", 18, Color.white, new Vector2(0, 0.5f), new Vector2(62, 24), MetaUi.QualStroke(q), 1.2f);

            int brk = Meta.Breaks(lv);
            if (brk > 0)
                Ui.Outlined(c, $"{brk}阶", 18, Pal.Hex("FFF0A8"), new Vector2(cw * 0.5f - 36f, -18f), new Vector2(56, 24), Pal.Hex("14202C"), 1.4f, TextAnchor.MiddleRight);

            // 底部暗晶底座内嵌 4 枚切面兽魂宝石（按已镶图腾真实五阶品质发光，空槽呈深邃金属凹槽）
            int baseIdx = slot * Meta.TotemSocketsPerSlot;
            for (int k = 0; k < Meta.TotemSocketsPerSlot; k++)
            {
                bool open = Meta.TotemSocketOpen(S, k);
                int tid = open ? S.TotemEquipped[baseIdx + k] : 0;
                var td = tid > 0 ? Meta.FindTotem(S, tid) : null;
                Color bezelCol = !open ? Pal.Hex("3B4A58") : td != null ? MetaUi.QualGlow(td.Rarity) : Pal.Hex("587088");
                Color coreCol = !open ? Pal.Hex("202B36") : td != null ? MetaUi.QualColor(td.Rarity) : Pal.Hex("172432");
                Vector2 pp = new Vector2((k - 1.5f) * 34f, -ch * 0.5f + 22f);
                var pInk = Ui.Box(c, new Vector2(24, 24), pp, Pal.Hex("0C141E"), Art.Hex6);
                pInk.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                var pr = Ui.Box(c, new Vector2(21, 21), pp, bezelCol, Art.Hex6);
                pr.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                var pc = Ui.Box(c, new Vector2(15, 15), pp, coreCol, Art.Hex6);
                pc.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                if (td != null)
                    Ui.Box(c, new Vector2(5, 5), pp + new Vector2(-2f, 2f), new Color(1f, 1f, 1f, 0.88f), Art.Circle);
            }

            if (Meta.CanForge(S, slot))
                Ui.Breathe(Ui.Box(c, new Vector2(34, 34), new Vector2(cw * 0.5f - 18, ch * 0.5f - 16), Color.white, Art.UpArrow, "up"));

            int si = slot;
            Ui.Tap(face, () => MetaUi.EquipSheet(Layer, si, () => Rebuild(false)), c);
            if (anim) Tween.Pop(c, 0.26f, 0.06f + orderIdx * 0.04f);
        }

        void BuildTotemDrawer(RectTransform drawer, float drawerH)
        {
            var list = new List<TotemData>();
            foreach (var t in S.Totems)
                if (_totemFilter < 0 || t.Slot == _totemFilter) list.Add(t);
            list.Sort((a, b) =>
            {
                bool ea = Meta.IsTotemEquipped(S, a.Id), eb = Meta.IsTotemEquipped(S, b.Id);
                if (ea != eb) return ea ? -1 : 1;
                if (b.Rarity != a.Rarity) return b.Rarity.CompareTo(a.Rarity);
                return a.Slot != b.Slot ? a.Slot.CompareTo(b.Slot) : a.Id.CompareTo(b.Id);
            });

            float viewH = drawerH - 252f;
            var view = Ui.Rect(drawer, "totemView");
            view.anchorMin = view.anchorMax = new Vector2(0.5f, 1f);
            view.pivot = new Vector2(0.5f, 1f);
            view.sizeDelta = new Vector2(1000, viewH);
            view.anchoredPosition = new Vector2(0, -112);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");

            const float cell = 176f, step = 192f;
            int rows = Mathf.Max(1, (list.Count + 4) / 5);
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(1000, Mathf.Max(viewH, rows * step + 20f));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;

            if (list.Count == 0)
            {
                Ui.Label(content, "暂无该部位神宠徽章 · 点击右下【寻宝】获取", 28, Pal.Hex("7C7870"),
                    new Vector2(0, -viewH * 0.45f), new Vector2(820, 60), TextAnchor.MiddleCenter, Fonts.Heavy);
            }
            for (int i = 0; i < list.Count; i++)
            {
                var t = list[i];
                var tile = Ui.Rect(content, "totem_" + t.Id);
                tile.anchorMin = tile.anchorMax = new Vector2(0.5f, 1f);
                tile.sizeDelta = new Vector2(cell, cell);
                tile.anchoredPosition = new Vector2(((i % 5) - 2) * step, -100 - (i / 5) * step);
                bool sel = t.Id == _selectedTotemId;
                string slotSkin = MetaUi.TotemSlot(t.Rarity);
                var face = MetaUi.Slot(tile, slotSkin, cell - 4f, Vector2.zero);
                face.raycastTarget = true;
                if (sel)
                {
                    var selBox = Ui.Skin(tile, "forge_sel", new Vector2(cell + 8, cell + 8), Vector2.zero, 1f, null, "sel");
                    selBox.raycastTarget = false;
                }

                Ui.Icon(tile, Meta.TotemIcon(t), 124, new Vector2(0, 6));
                // 左下部位小标
                var partBox = Ui.Box(tile, new Vector2(44, 44), new Vector2(-cell * 0.5f + 31, -cell * 0.5f + 31), new Color(0.1f, 0.16f, 0.24f, 0.80f), Art.RoundedSmall);
                Ui.Icon(partBox.transform, Meta.Equips[t.Slot].Icon, 34, Vector2.zero);
                if (Meta.IsTotemEquipped(S, t.Id))
                {
                    var eqTag = Ui.Box(tile, new Vector2(66, 28), new Vector2(cell * 0.5f - 42, cell * 0.5f - 22), Pal.Teal, Art.Pill);
                    Ui.Outlined(eqTag.transform, "已镶", 18, Color.white, Vector2.zero, new Vector2(66, 28), Ink, 1.2f);
                }
                if (t.Locked)
                    Ui.Icon(tile, "ic_lock", 32, new Vector2(-cell * 0.5f + 26, cell * 0.5f - 26));

                int tid = t.Id;
                Ui.Tap(face, () =>
                {
                    _selectedTotemId = tid;
                    MetaUi.TotemDetail(Layer, tid, () => Rebuild(false));
                }, tile);
            }

            // 抽屉底栏：严格三等分对称排版（x = -336 / 0 / +336），底边留足 66px 净空避开底部页签突起盾徽！
            float barY = -drawerH + 106f;
            string filterText = _totemFilter < 0 ? "部位：全部" : $"部位：{Meta.Equips[_totemFilter].Name}";
            var filterBtn = Ui.Btn(drawer, filterText, new Vector2(280, 80), new Vector2(-336, barY), Pal.Slate, () =>
            {
                _totemFilter = _totemFilter >= Meta.Equips.Length - 1 ? -1 : _totemFilter + 1;
                Rebuild(false);
            }, 26);
            filterBtn.anchorMin = filterBtn.anchorMax = new Vector2(0.5f, 1f);

            var huntBtn = Ui.Btn(drawer, $"寻宝 ({S.Hammers})", new Vector2(292, 80), new Vector2(0, barY), Pal.Gold, () => SetShopSubTab(1), 30, "ic_hammer");
            huntBtn.anchorMin = huntBtn.anchorMax = new Vector2(0.5f, 1f);
            if (S.Hammers > 0) MetaUi.Dot(huntBtn, new Vector2(130, 32));

            bool canMerge = Meta.CanMergeAnyTotem(S);
            var mergeBtn = Ui.Btn(drawer, "一键合成", new Vector2(280, 80), new Vector2(336, barY), canMerge ? Pal.Green : Pal.Slate, () =>
            {
                var got = Meta.MergeAllTotems(S, new Rng(Environment.TickCount));
                if (got.Count == 0)
                {
                    Sfx.Play(Snd.Deny);
                    Ui.Toast("需要 3 个同品质且未镶嵌、未上锁的徽章才能合成", 200);
                    return;
                }
                Profile.Save();
                Sfx.Play(Snd.Merge);
                Rebuild(false);
                MetaUi.TotemPullResult(Layer, got, null);
            }, 30);
            mergeBtn.anchorMin = mergeBtn.anchorMax = new Vector2(0.5f, 1f);
            if (canMerge) MetaUi.Dot(mergeBtn, new Vector2(124, 32));
        }

        void BuildEquipDrawer(RectTransform drawer, float drawerH)
        {
            Action re = () => Rebuild(false);
            // 顶部：装备箱快捷开启横条（双行严格左对齐，单行不折行，彻底根除文字重叠）
            var boxRow = Ui.Rect(drawer, "gearBoxRow");
            boxRow.anchorMin = boxRow.anchorMax = new Vector2(0.5f, 1f);
            boxRow.anchoredPosition = new Vector2(0, -168);
            boxRow.sizeDelta = new Vector2(960, 118);
            Ui.Skin(boxRow, "row", new Vector2(960, 118), Vector2.zero, 1f, Pal.Hex("F6F2E8"));
            Ui.Icon(boxRow, "ic_gearbox", 86, new Vector2(-412, 1));
            Ui.SingleLine(Ui.Label(boxRow, $"五金工具箱 ×{S.GearBoxes}", 30, Pal.Ink, new Vector2(-58, 22), new Vector2(580, 38), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
            Ui.SingleLine(Ui.Label(boxRow, "开启必得精良~传说装备，低阶自动回收合金钢", 20, Pal.SubInk, new Vector2(-58, -21), new Vector2(580, 32), TextAnchor.MiddleLeft), 16);
            var openBtn = Ui.Btn(boxRow, "开启", new Vector2(188, 76), new Vector2(360, 0), S.GearBoxes > 0 ? Pal.Gold : Pal.Slate, () => MetaUi.GearBox(Layer, re), 34);
            if (S.GearBoxes > 0) MetaUi.Dot(openBtn, new Vector2(80, 31));

            // 六部位属性与突破一览双列卡（紧凑排版留出底部安全边距，避免压到页签盾徽）
            for (int i = 0; i < Meta.Equips.Length; i++)
            {
                var e = Meta.Equips[i];
                int lv = S.EquipLv[i], q = S.EquipQ[i];
                var card = Ui.Rect(drawer, "eqRow" + i);
                card.anchorMin = card.anchorMax = new Vector2(0.5f, 1f);
                card.sizeDelta = new Vector2(470, 114);
                card.anchoredPosition = new Vector2((i % 2 == 0 ? -1 : 1) * 244f, -294 - (i / 2) * 124f);
                Ui.Skin(card, "row", new Vector2(470, 114), Vector2.zero);
                var hit = Ui.Box(card, new Vector2(470, 114), Vector2.zero, new Color(0, 0, 0, 0), Art.White);
                MetaUi.Slot(card, MetaUi.QualitySlot(q), 90, new Vector2(-174, 0));
                Ui.Icon(card, e.Icon, 70, new Vector2(-174, 2));
                Ui.SingleLine(Ui.Label(card, $"<color=#{MetaUi.QualInkHex(q)}>{Meta.QualityName[q]}</color>·{e.Name} Lv.{lv}", 23, Pal.Ink, new Vector2(46, 30), new Vector2(332, 30), TextAnchor.MiddleLeft, Fonts.Heavy), 17);
                Ui.SingleLine(Ui.Label(card, Meta.EquipText(i, lv, q), 20, Pal.GreenDeep, new Vector2(46, 0), new Vector2(332, 28), TextAnchor.MiddleLeft, Fonts.Heavy), 16);
                Ui.SingleLine(Ui.Label(card, Meta.Breaks(lv) > 0 ? Meta.BreakText(i, lv) : $"满10级突破：{Defs.RoleName(e.Role)}+4%", 18, Pal.SubInk, new Vector2(46, -30), new Vector2(332, 26), TextAnchor.MiddleLeft), 15);
                int si = i;
                Ui.Tap(hit, () => MetaUi.EquipSheet(Layer, si, re), card);
            }
        }

        void BuildMaterialDrawer(RectTransform drawer, float drawerH)
        {
            var items = new List<Item>();
            Cur[] bagOrder = { Cur.Refine, Cur.Hammer, Cur.Meteor, Cur.Tome, Cur.Page, Cur.GearBox, Cur.Token, Cur.Silk, Cur.Iron, Cur.Ingot };
            foreach (var c in bagOrder)
            {
                int n = Meta.Have(S, c);
                if (n > 0) items.Add(new Item(c, n));
            }
            for (int h = 0; h < Defs.HeroCount; h++)
                if (S.Shards[h] > 0) items.Add(new Item(Cur.Shard, S.Shards[h], (HeroId)h));

            float viewH = drawerH - 138f;
            var view = Ui.Rect(drawer, "matView");
            view.anchorMin = view.anchorMax = new Vector2(0.5f, 1f);
            view.pivot = new Vector2(0.5f, 1f);
            view.sizeDelta = new Vector2(1000, viewH);
            view.anchoredPosition = new Vector2(0, -112);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");

            const float cell = 176f, step = 192f;
            int rows = Mathf.Max(1, (items.Count + 4) / 5);
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(1000, Mathf.Max(viewH, rows * step + 24f));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;

            for (int i = 0; i < items.Count; i++)
            {
                var it = items[i];
                var tile = MetaUi.ItemTile(content, it, Vector2.zero, cell - 10f, false, Layer);
                tile.anchorMin = tile.anchorMax = new Vector2(0.5f, 1f);
                tile.anchoredPosition = new Vector2(((i % 5) - 2) * step, -98 - (i / 5) * step);
            }
        }

        // ---------------- 山寨地图 ----------------

        // 去芜存菁（对标参考图领地主页）：移除与底栏/商城/寨主页重复的山门、铁匠铺、酒馆及啰嗦的副标题小字，
        // 仅保留 5 座高辨识度核心地标，东侧护城河魁首石雕广场独占「排行榜」C位！
        static readonly (string Name, float X, float Y, string Icon, bool Heroic)[] Buildings =
        {
            ("档案室", 0.52f, 0.27f, "tab_codex",     false),
            ("训练场", 0.23f, 0.42f, "ic_medal",      false),
            ("风云榜", 0.69f, 0.54f, "ic_rank_stage", true),
            ("拦截点", 0.24f, 0.70f, "ic_cart",       false),
            ("联防队", 0.73f, 0.76f, "tab_idle",      false),
        };

        void BuildFort(bool anim)
        {
            var size = Cover("map_fort", new Vector2(1080, 1920), Color.white, 0.5f);
            Shade(0.24f, 0.16f);
            bool dOpen = S.Cleared >= MetaUi.DailyUnlock, eOpen = S.Cleared >= MetaUi.EscortUnlock;

            for (int i = 0; i < Buildings.Length; i++)
            {
                var b = Buildings[i];
                var pos = new Vector2((b.X - 0.5f) * size.x, (0.5f - b.Y) * size.y);
                var c = Ui.Rect(_page, "bld" + i);
                c.anchoredPosition = pos + new Vector2(0, -36);
                float pw = b.Heroic ? 248f : 206f;
                float ph = b.Heroic ? 68f : 60f;
                c.sizeDelta = new Vector2(pw + 20f, ph + 44f);

                if (b.Heroic)
                {
                    var glow = Ui.Box(c, new Vector2(pw + 46f, ph + 38f), Vector2.zero, Pal.Gold.A(0.26f), Art.SoftDot, "glow");
                    Tween.Run(glow, 999f, k => glow.color = Pal.Gold.A(0.18f + 0.10f * Mathf.Sin(k * 999f * 2.8f)));
                }

                var plate = Ui.Skin(c, "h_capsule", new Vector2(pw, ph), Vector2.zero, -1f);
                Ui.Icon(c, b.Icon, b.Heroic ? 76f : 64f, new Vector2(-pw * 0.5f + 28f, 4f));

                if (b.Heroic)
                    Ui.GradOutlined(c, b.Name, 34, Pal.Hex("FFFBE0"), Pal.Hex("FFD458"), new Vector2(22f, 2f), new Vector2(168, 52), Pal.Hex("3E2206"), 2.8f);
                else
                    Ui.Outlined(c, b.Name, 31, Paper, new Vector2(20f, 1f), new Vector2(146, 48), Ink, 2.0f);

                bool dot = i == 0 ? Meta.CodexBadge(S) > 0
                    : i == 1 ? (dOpen && S.DailyTries < Meta.DailyTriesMax)
                    : i == 2 ? RankBadge()
                    : i == 3 ? (eOpen && S.EscortTries < Meta.EscortTriesMax)
                    : IdleBadge();
                if (dot) MetaUi.Dot(c, new Vector2(pw * 0.5f - 8f, ph * 0.5f - 2f));

                if (i == 4)
                {
                    var r = Meta.IdleRewards(S, Meta.IdleHours(S, Profile.Now));
                    int copper = r.Get(Cur.Copper);
                    if (copper > 0)
                    {
                        var bub = Ui.Skin(c, "row", new Vector2(182, 54), new Vector2(0, 74));
                        Ui.Icon(bub.transform, "ic_coins", 48, new Vector2(-62, 2));
                        Ui.Label(bub.transform, Ui.Num(copper), 26, Pal.Ink, new Vector2(16, 0), new Vector2(124, 46), TextAnchor.MiddleCenter, Fonts.Heavy);
                        Tween.Run(bub, 999f, k => bub.rectTransform.anchoredPosition = new Vector2(0, 72 + 5 * Mathf.Sin(k * 999f * 3f)));
                    }
                }
                int bi = i;
                Ui.Tap(plate, () => OnBuilding(bi), c);
                if (anim) Tween.Pop(c, 0.3f, 0.08f + i * 0.05f);
            }
        }

        void OnBuilding(int i)
        {
            switch (i)
            {
                case 0: MetaUi.Codex(Layer); break;
                case 1:
                    if (S.Cleared < MetaUi.DailyUnlock) Ui.Toast($"通关第 {MetaUi.DailyUnlock} 关后开放民兵大比武", 200);
                    else MetaUi.Daily(Layer);
                    break;
                case 2: RankUi.Open(Layer, -1, () => Rebuild(false)); break;
                case 3:
                    if (S.Cleared < MetaUi.EscortUnlock) Ui.Toast($"通关第 {MetaUi.EscortUnlock} 关后开放截获外星补给", 200);
                    else MetaUi.Escort(Layer);
                    break;
                default: MetaUi.Idle(Layer); break;
            }
        }

        // ---------------- 商城（纵向下拉长卷：聚义擂鼓招募大坞 + 星宿兽魂寻宝大祭坛 + 梁山集市） ----------------

        void BuildShop(bool anim)
        {
            Cover("hall_bg", new Vector2(1080, 1920), Color.white, 0.34f);
            Shade(0.32f, 0f);

            // 全屏纵向下拉视口（顶避头像资源栏，底避五页签导航栏，无任何二层切换 Tab）
            float topInset = Ui.SafeTop + 136f;
            float botInset = TabH + 8f;
            float viewH = Mathf.Max(600f, Ui.Height - topInset - botInset);

            var view = Ui.Rect(_page, "shopScroll");
            view.anchorMin = Vector2.zero;
            view.anchorMax = Vector2.one;
            view.offsetMin = new Vector2(0f, botInset);
            view.offsetMax = new Vector2(0f, -topInset);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0f, 0f, 0f, 0.001f), true, "scrollHit");

            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);

            float cursorY = 8f;

            // =========================================================================
            // 模块一：【聚义招贤 · 擂鼓招募】皇家霁蓝鎏金一体式祈愿大卡坞
            // =========================================================================
            const float recH = 804f;
            var recDock = Ui.Rect(content, "recruitDock");
            recDock.anchorMin = recDock.anchorMax = new Vector2(0.5f, 1f);
            recDock.sizeDelta = new Vector2(1036, recH);
            recDock.anchoredPosition = new Vector2(0f, -(cursorY + recH * 0.5f));
            Ui.Skin(recDock, "gacha_dock_gold", new Vector2(1036, recH), Vector2.zero, 1f, null, "dockBg");

            // 1.1 顶冠信息栏：左鼓徽标题+招募等级条 | 右信物商店快捷入口+招募令胶囊
            const float rHdrY = 336f;
            Ui.Icon(recDock, "stage_drum", 68, new Vector2(-446f, rHdrY));
            Ui.Outlined(recDock, "敲锣摇人", 36, Gold, new Vector2(-304f, rHdrY + 2f), new Vector2(210, 48), Ink, 2.2f, TextAnchor.MiddleLeft);

            var lvBox = Ui.Rect(recDock, "recLv");
            lvBox.anchoredPosition = new Vector2(-104f, rHdrY);
            lvBox.sizeDelta = new Vector2(230, 64);
            var lvBg = Ui.Skin(lvBox, "h_capsule", new Vector2(230, 62), Vector2.zero, -1f);
            bool lvMax = S.RecruitLv >= Meta.RecruitMaxLv;
            float lvFrac = lvMax ? 1f : S.RecruitExp / (float)Mathf.Max(1, Meta.RecruitNeed(S.RecruitLv));
            Ui.Outlined(lvBox, $"摇人等级 {S.RecruitLv}", 20, Pal.Hex("FFE694"), new Vector2(0, 16), new Vector2(210, 24), Ink, 1.5f);
            MetaUi.Bar(lvBox, new Vector2(0, -14), new Vector2(196, 22), lvFrac, Pal.Gold,
                lvMax ? "满级" : $"{S.RecruitExp}/{Meta.RecruitNeed(S.RecruitLv)}");
            Ui.Tap(lvBg, () => Ui.Hint(lvBox, $"摇人等级 Lv.{S.RecruitLv}",
                $"累计摇人提升等级（当前进度 {(S.RecruitLv >= Meta.RecruitMaxLv ? "已满级" : $"{S.RecruitExp}/{Meta.RecruitNeed(S.RecruitLv)}")}）\n当前传说概率：{Meta.OrangeRate(S) * 100:0}% · 史诗概率：{Meta.PurpleRate(S) * 100:0}%"), lvBox);

            // 信物兑换入口（采用新绘鎏金红玉聚义信物徽章 ic_credit）
            int credCount = Meta.RecruitCredits(S);
            var credBtn = Ui.Btn(recDock, $"工分 ({credCount})", new Vector2(232, 56), new Vector2(158f, rHdrY),
                Pal.Teal, () => MetaUi.Tavern(Layer, () => Rebuild(false)), 23, "ic_credit");
            if (credCount >= 10) MetaUi.Dot(credBtn, new Vector2(104, 22));

            MetaUi.Pill(recDock, "ic_token", Ui.Num(S.Tokens), new Vector2(382f, rHdrY), 178);

            // 1.2 全幅高清战鼓舞台视窗（980 × 432，镶香槟金内描边）
            const float rWinY = 66f, rWinW = 980f, rWinH = 432f;
            Ui.Box(recDock, new Vector2(rWinW + 6f, rWinH + 6f), new Vector2(0, rWinY), Pal.Hex("FFE48E").A(0.68f), Art.RoundedSmall, "winRim");
            var rWin = Ui.Rect(recDock, "recViewport");
            rWin.anchoredPosition = new Vector2(0f, rWinY);
            rWin.sizeDelta = new Vector2(rWinW, rWinH);
            rWin.gameObject.AddComponent<RectMask2D>();

            var rBanner = Ui.Box(rWin, new Vector2(984f, 554f), new Vector2(0f, -12f), Color.white, Art.Img("recruit_banner"), "art");
            rBanner.type = Image.Type.Simple;
            var drumHalo = Ui.Box(rWin, new Vector2(440f, 360f), new Vector2(0f, 34f), Pal.Gold.A(0.20f), Art.SoftDot, "halo");
            Tween.Run(drumHalo, 999f, k => drumHalo.color = Pal.Gold.A(0.14f + 0.10f * Mathf.Sin(k * 999f * 2.4f)));

            // 视窗底部柔和深靛渐变保底说明带（绝不遮挡中心战鼓高光，左侧避让心愿立牌）
            var rGrad = Ui.Box(rWin, new Vector2(rWinW, 128f), new Vector2(0f, -rWinH * 0.5f + 64f), new Color(0.04f, 0.09f, 0.17f, 0.90f), Art.VGrad, "grad");
            rGrad.rectTransform.localScale = new Vector3(1f, -1f, 1f);
            Ui.Box(rWin, new Vector2(rWinW, 54f), new Vector2(0f, -rWinH * 0.5f + 27f), new Color(0.04f, 0.09f, 0.16f, 0.78f), Art.White, "gradBase");

            if (Meta.OrangeOpened(S))
            {
                Ui.Outlined(rWin, $"传说 {Meta.OrangeRate(S) * 100:0}% · 史诗 {Meta.PurpleRate(S) * 100:0}% · 十连必出史诗 · 心愿 50% UP",
                    24, Paper, new Vector2(-86f, -148f), new Vector2(760, 36), Ink, 1.6f);
                int pityNeed = S.LegendPulled == 0 ? Meta.FirstOrangePity : Meta.OrangePity;
                int left = Mathf.Max(1, pityNeed - S.Pity);
                Ui.Outlined(rWin, $"再摇人 <color=#FFE466>{left}</color> 次必得传说乡亲！",
                    27, Gold, new Vector2(-86f, -186f), new Vector2(760, 40), Ink, 1.9f);
            }
            else
            {
                Ui.Outlined(rWin, $"史诗 {Meta.PurpleRate(S) * 100:0}% · 十连必出史诗乡亲 · 同品质心愿 50% UP",
                    24, Paper, new Vector2(-86f, -148f), new Vector2(760, 36), Ink, 1.6f);
                Ui.Outlined(rWin, $"传说乡亲：通关第 {Meta.OrangeOpen} 关开放（首张传说仅需 {Meta.FirstOrangePity} 抽保底！）",
                    25, Gold, new Vector2(-86f, -186f), new Vector2(760, 40), Ink, 1.9f);
            }

            // 右侧「心愿好汉祈愿立牌」（采用顶级五阶品质卡框，呼吸金辉）
            var wish = Meta.GetWish(S);
            var wBox = Ui.Rect(recDock, "wishSlot");
            wBox.anchoredPosition = new Vector2(382f, rWinY - 68f);
            wBox.sizeDelta = new Vector2(168, 212);
            var wHalo = Ui.Box(wBox, new Vector2(204, 236), Vector2.zero, Pal.Gold.A(0.32f), Art.SoftDot, "wHalo");
            Tween.Run(wHalo, 999f, k => wHalo.transform.localScale = Vector3.one * (1f + 0.06f * Mathf.Sin(k * 999f * 3f)));
            string wCardSkin = wish.HasValue ? MetaUi.RarityCard(Defs.Hero(wish.Value).Rarity) : "card_orange";
            var wCard = MetaUi.Card(wBox, wCardSkin, new Vector2(162, 198), Vector2.zero);
            wCard.raycastTarget = true;

            var wArtMask = Ui.Rect(wBox, "wMask");
            wArtMask.sizeDelta = new Vector2(142, 142);
            wArtMask.anchoredPosition = new Vector2(0, 12);
            wArtMask.gameObject.AddComponent<RectMask2D>();
            if (wish.HasValue)
            {
                var wd = Defs.Hero(wish.Value);
                Ui.Box(wArtMask, Vector2.one * 136, Vector2.zero, MetaUi.QualGlow(MetaUi.HeroTier(wd.Rarity)).A(0.32f), Art.SoftDot);
                Ui.Icon(wArtMask, wd.Art, 142, new Vector2(0, -4));
                Ui.Box(wBox, new Vector2(138, 34), new Vector2(0, -68), new Color(0.05f, 0.10f, 0.18f, 0.82f), Art.Pill);
                Ui.Outlined(wBox, wd.Name, 22, Gold, new Vector2(0, -67), new Vector2(142, 32), Ink, 1.7f);
                Ui.Box(wBox, Vector2.one * 38, new Vector2(62, -68), Pal.Hex("1A3652"), Art.Circle);
                Ui.Icon(wBox, "ic_refresh", 26, new Vector2(62, -68));
            }
            else
            {
                var plus = Ui.Outlined(wArtMask, "+", 68, Gold, new Vector2(0, 4), new Vector2(120, 90), Ink, 2.2f);
                Tween.Run(plus, 999f, k => plus.transform.localScale = Vector3.one * (1f + 0.10f * Mathf.Sin(k * 999f * 3.4f)));
                Ui.Box(wBox, new Vector2(138, 34), new Vector2(0, -68), new Color(0.05f, 0.10f, 0.18f, 0.82f), Art.Pill);
                Ui.Outlined(wBox, "定心愿", 22, Gold, new Vector2(0, -67), new Vector2(142, 32), Ink, 1.7f);
            }
            MetaUi.Badge(wBox, "心愿UP", Pal.Red, new Vector2(108, 34), new Vector2(0, 94), 20);
            Ui.Tap(wCard, () => MetaUi.WishPicker(Layer, () => Rebuild(false)), wBox);

            // 1.3 专属操控栏 &「跳过动画」黄金归位（左右边缘与下方三联大按钮 ±480px 像素级严格对齐！）
            const float rCtrlY = -188f;
            Ui.Box(recDock, new Vector2(960, 58), new Vector2(0f, rCtrlY), new Color(0.04f, 0.09f, 0.17f, 0.78f), Art.RoundedSmall, "ctrlBar");
            Ui.Box(recDock, new Vector2(960, 2), new Vector2(0f, rCtrlY + 28f), Pal.Hex("5AC4EA").A(0.28f), Art.White);
            Ui.Icon(recDock, "ic_credit", 46, new Vector2(-446f, rCtrlY + 1f));
            Ui.Outlined(recDock, "每抽必赠 <color=#FFE47A>互助工分 ×10</color> · 半价兑乡亲碎片", 24, Pal.Hex("E8F3FC"),
                new Vector2(-118f, rCtrlY + 1f), new Vector2(590, 42), Ink, 1.7f, TextAnchor.MiddleLeft);

            bool skipOn = S.SkipRecruitAnim != 0;
            var skipBox = Ui.Rect(recDock, "skipAnim");
            skipBox.anchoredPosition = new Vector2(364f, rCtrlY);
            skipBox.sizeDelta = new Vector2(232, 54);
            var skipHit = Ui.Skin(skipBox, "h_capsule", new Vector2(228, 50), Vector2.zero, -1f);
            Ui.Icon(skipBox, skipOn ? "ui/gacha_check_on" : "ui/gacha_check_off", 44, new Vector2(-74f, 0f), "chk");
            Ui.Outlined(skipBox, "跳过动画", 26, skipOn ? Gold : Paper, new Vector2(18f, 1f), new Vector2(146, 42), Ink, 1.8f);
            Ui.Tap(skipHit, () =>
            {
                S.SkipRecruitAnim = skipOn ? 0 : 1;
                Profile.Save();
                Rebuild(false);
            }, skipBox);

            // 1.4 底部三联高清 3D 招募大按钮（左沿 -480 ~ 右沿 +480，与上方视窗及操控栏严丝合缝对齐）
            const float rBtnY = -304f;
            int adLeft = Meta.AdRecruitMax - S.AdRecruit;
            Ui.SubBtn(recDock, adLeft > 0 ? "免费摇人" : "明日再来", "ic_ad", $"剩余 {adLeft}/{Meta.AdRecruitMax}",
                new Vector2(304, 124), new Vector2(-328f, rBtnY), adLeft > 0 ? Pal.Green : Pal.Slate, () => DoRecruit(1, true), 36, 23);

            var b1 = Ui.SubBtn(recDock, "敲锣一抽", "ic_token", $"{S.Tokens}/1",
                new Vector2(304, 124), new Vector2(0f, rBtnY), Pal.Azure, () => DoRecruit(1, false), 36, 24);

            var b10 = Ui.SubBtn(recDock, "十连摇人", "ic_token", $"{S.Tokens}/10",
                new Vector2(304, 124), new Vector2(328f, rBtnY), Pal.Gold, () => DoRecruit(10, false), 36, 24);
            MetaUi.Badge(b10, "必出史诗", Pal.Red, new Vector2(114, 34), new Vector2(-92, 58), 19);
            if (S.Tokens >= 10) MetaUi.Dot(b10, new Vector2(138, 50));
            else if (S.Tokens >= 1) MetaUi.Dot(b1, new Vector2(138, 50));

            if (anim) Tween.Pop(recDock, 0.28f, 0.02f);
            cursorY += recH + 38f;

            // =========================================================================
            // 模块二：【星宿灵石 · 兽魂寻宝】星宿紫金大祭坛坞（无需切 Tab，下拉即见！）
            // =========================================================================
            const float totH = 746f;
            var totDock = Ui.Rect(content, "totemDock");
            totDock.anchorMin = totDock.anchorMax = new Vector2(0.5f, 1f);
            totDock.sizeDelta = new Vector2(1036, totH);
            totDock.anchoredPosition = new Vector2(0f, -(cursorY + totH * 0.5f));
            Ui.Skin(totDock, "gacha_dock_purple", new Vector2(1036, totH), Vector2.zero, 1f, null, "dockBg");

            // 2.1 顶冠栏：左锤徽标题+流派标签 | 右洗炼石+寻宝锤库存胶囊
            const float tHdrY = 308f;
            Ui.Icon(totDock, "ic_hammer", 66, new Vector2(-446f, tHdrY));
            Ui.Outlined(totDock, "神宠寻宝", 36, Pal.Hex("F6DBFF"), new Vector2(-304f, tHdrY + 2f), new Vector2(210, 48), Pal.Hex("1D0E36"), 2.2f, TextAnchor.MiddleLeft);

            var tagPill = Ui.Rect(totDock, "totTag");
            tagPill.anchoredPosition = new Vector2(-102f, tHdrY);
            tagPill.sizeDelta = new Vector2(214, 46);
            Ui.Box(tagPill, new Vector2(214, 44), Vector2.zero, new Color(0.22f, 0.12f, 0.40f, 0.85f), Art.Pill);
            Ui.Outlined(tagPill, "神宠徽章 · 质变词条", 20, Pal.Hex("FFE69E"), Vector2.zero, new Vector2(204, 38), Pal.Hex("1C0E34"), 1.5f);

            MetaUi.Pill(totDock, "ic_refine", Ui.Num(S.RefineStones), new Vector2(174f, tHdrY), 182);
            MetaUi.Pill(totDock, "ic_hammer", Ui.Num(S.Hammers), new Vector2(378f, tHdrY), 182);

            // 2.2 全幅高清星宿灵石祭坛视窗（980 × 404）
            const float tWinY = 50f, tWinW = 980f, tWinH = 404f;
            Ui.Box(totDock, new Vector2(tWinW + 6f, tWinH + 6f), new Vector2(0, tWinY), Pal.Hex("DFAAFF").A(0.62f), Art.RoundedSmall, "winRim");
            var tWin = Ui.Rect(totDock, "totViewport");
            tWin.anchoredPosition = new Vector2(0f, tWinY);
            tWin.sizeDelta = new Vector2(tWinW, tWinH);
            tWin.gameObject.AddComponent<RectMask2D>();

            var tBanner = Ui.Box(tWin, new Vector2(984f, 554f), new Vector2(0f, -6f), Color.white, Art.Img("totem_banner"), "art");
            tBanner.type = Image.Type.Simple;
            var stoneGlow = Ui.Box(tWin, new Vector2(360f, 320f), new Vector2(0f, 36f), Pal.Hex("D87BFF").A(0.28f), Art.SoftDot, "stoneGlow");
            Tween.Run(stoneGlow, 999f, k => stoneGlow.transform.localScale = Vector3.one * (1f + 0.10f * Mathf.Sin(k * 999f * 2.6f)));

            // 左右两侧拱卫三尊神兽灵魄圆徽（不遮挡中央星宿紫晶原石）
            string[] showBeasts = { "totem_tiger", "totem_qilin", "totem_bear" };
            Vector2[] beastPos = { new Vector2(-334f, 44f), new Vector2(334f, 56f), new Vector2(-206f, 118f) };
            float[] beastSz = { 126f, 134f, 98f };
            for (int k = 0; k < 3; k++)
            {
                Vector2 bp = beastPos[k];
                float sz = beastSz[k];
                Ui.Box(tWin, Vector2.one * (sz * 1.25f), bp, (k == 1 ? Pal.Gold : Pal.Purple).A(0.32f), Art.SoftDot);
                var bi = Ui.Icon(tWin, showBeasts[k], sz, bp);
                float ph = k * 1.4f;
                Tween.Run(bi, 999f, t => bi.rectTransform.anchoredPosition = new Vector2(bp.x, bp.y + 6f * Mathf.Sin(t * 999f * 2.3f + ph)));
            }

            var tGrad = Ui.Box(tWin, new Vector2(tWinW, 122f), new Vector2(0f, -tWinH * 0.5f + 61f), new Color(0.07f, 0.04f, 0.16f, 0.90f), Art.VGrad);
            tGrad.rectTransform.localScale = new Vector3(1f, -1f, 1f);
            Ui.Box(tWin, new Vector2(tWinW, 50f), new Vector2(0f, -tWinH * 0.5f + 25f), new Color(0.06f, 0.04f, 0.15f, 0.80f), Art.White);
            Ui.Outlined(tWin, "破译外星神秘盲盒 · 获取稀有~绝世神宠徽章 · 十连必出史诗+",
                24, Paper, new Vector2(0f, -136f), new Vector2(900, 36), Pal.Hex("160B2C"), 1.6f);
            Ui.Outlined(tWin, $"再寻宝 <color=#FFE466>{Meta.TotemOrangePity - S.TotemPity}</color> 次必得传说及以上徽章！",
                26, Gold, new Vector2(0f, -174f), new Vector2(900, 40), Pal.Hex("160B2C"), 1.9f);

            // 2.3 寻宝福利说明栏 + 底部双联大按钮
            const float tCtrlY = -186f;
            Ui.Box(totDock, new Vector2(980, 50), new Vector2(0f, tCtrlY), new Color(0.09f, 0.05f, 0.20f, 0.72f), Art.RoundedSmall);
            Ui.Icon(totDock, "ic_refine", 40, new Vector2(-362f, tCtrlY + 1f));
            Ui.Outlined(totDock, "十连寻宝享星钻九折特惠 · 额外必赠【改装芯片 ×1】", 22, Pal.Hex("EAD9FF"),
                new Vector2(22f, tCtrlY + 1f), new Vector2(760, 38), Pal.Hex("160B2C"), 1.5f);

            const float tBtnY = -278f;
            var t1 = Ui.SubBtn(totDock, "寻宝 1 次", S.Hammers >= 1 ? "ic_hammer" : "ic_ingot",
                S.Hammers >= 1 ? $"{S.Hammers}/1" : Meta.TotemPullIngot1.ToString(),
                new Vector2(452, 122), new Vector2(-244f, tBtnY), Pal.Azure, () => DoTotemPull(1), 37, 24);

            var t10 = Ui.SubBtn(totDock, "寻宝 10 次", S.Hammers >= 10 ? "ic_hammer" : "ic_ingot",
                S.Hammers >= 10 ? $"{S.Hammers}/10" : $"{Meta.TotemPullIngot10}（九折）",
                new Vector2(452, 122), new Vector2(244f, tBtnY), Pal.Gold, () => DoTotemPull(10), 37, 24);
            MetaUi.Badge(t10, "赠芯片", Pal.Purple, new Vector2(118, 34), new Vector2(-156, 56), 19);
            if (S.Hammers >= 1) MetaUi.Dot(S.Hammers >= 10 ? t10 : t1, new Vector2(208, 48));

            if (anim) Tween.Pop(totDock, 0.28f, 0.06f);
            cursorY += totH + 34f;

            // =========================================================================
            // 模块三：【梁山集市 · 每日特惠】宋瓷货架坞
            // =========================================================================
            var items = Meta.Shop(S);
            int mktRows = (items.Length + 3) / 4;
            float mktH = 118f + mktRows * 268f;

            var market = Ui.Rect(content, "market");
            market.anchorMin = market.anchorMax = new Vector2(0.5f, 1f);
            market.sizeDelta = new Vector2(1036, mktH);
            market.anchoredPosition = new Vector2(0f, -(cursorY + mktH * 0.5f));
            Ui.Skin(market, "dark", new Vector2(1036, mktH), Vector2.zero);

            var shopHdr = Ui.Rect(market, "shopHdr");
            shopHdr.anchoredPosition = new Vector2(0f, mktH * 0.5f - 10f);
            shopHdr.sizeDelta = new Vector2(396, 72);
            Ui.Skin(shopHdr, "h_ribbon", new Vector2(396, 72), Vector2.zero, -1f);
            Ui.Outlined(shopHdr, "村口供销社", 34, Paper, new Vector2(0, 3), new Vector2(340, 54), AzureDeep, 2.2f);

            float firstCardY = mktH * 0.5f - 196f;
            for (int i = 0; i < items.Length; i++)
            {
                var c = ShopCard(market, items[i], i);
                c.anchoredPosition = new Vector2(((i % 4) - 1.5f) * 248f, firstCardY - (i / 4) * 266f);
                if (anim) Tween.Pop(c, 0.28f, 0.08f + i * 0.03f);
            }

            cursorY += mktH + 44f;
            content.sizeDelta = new Vector2(1080f, Mathf.Max(viewH + 1f, cursorY));

            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.elasticity = 0.08f;
            sr.decelerationRate = 0.12f;
            sr.scrollSensitivity = 36f;
            float maxScroll = Mathf.Max(0f, content.sizeDelta.y - viewH);
            content.anchoredPosition = new Vector2(0f, Mathf.Clamp(_shopScroll, 0f, maxScroll));
            sr.onValueChanged.AddListener(_ => _shopScroll = content.anchoredPosition.y);
        }

        public void DoTotemPull(int n)
        {
            if (S.Hammers >= n) S.Hammers -= n;
            else
            {
                int cost = n >= 10 ? Meta.TotemPullIngot10 : Meta.TotemPullIngot1 * n;
                if (!Meta.Spend(S, Cur.Ingot, cost))
                {
                    Sfx.Play(Snd.Deny);
                    Ui.Toast("破译扳手或星钻不足", 200);
                    return;
                }
            }
            if (n >= 10) S.RefineStones += 1;
            var pulls = Meta.PullTotems(S, n, new Rng(Environment.TickCount));
            Profile.Save();
            Rebuild(false);
            MetaUi.TotemPullResult(Layer, pulls, () => DoTotemPull(n));
        }

        void Place(RectTransform rt, float x, float y)
        {
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1);
            rt.anchoredPosition = new Vector2(x, -(y + Ui.SafeTop));
        }

        RectTransform ShopCard(Transform parent, Meta.ShopDef d, int i)
        {
            var c = Ui.Rect(parent, "shop" + i);
            c.sizeDelta = new Vector2(236, 250);
            var face = Ui.Skin(c, "tab_on", new Vector2(236, 250), Vector2.zero);
            Ui.SingleLine(Ui.Label(c, d.Name, 27, Pal.Ink, new Vector2(0, 92), new Vector2(216, 40), TextAnchor.MiddleCenter, Fonts.Heavy), 20);
            Ui.Icon(c, d.Icon, 110, new Vector2(0, 26));
            Ui.Outlined(c, "×" + Ui.Num(d.Get.N), 28, Color.white, new Vector2(52, -16), new Vector2(116, 36), Ink, 2f);
            int used = d.Ad ? (d.Get.Cur == Cur.Ingot ? S.AdIngots : S.AdStamina) : 0;
            int max = d.Ad ? (d.Get.Cur == Cur.Ingot ? Meta.AdIngotsMax : Meta.AdStaminaMax) : 0;
            bool soldOut = d.Ad && used >= max;
            var pb = Ui.Btn(c, d.Ad ? (soldOut ? "已领完" : $"免费 {max - used}") : d.Price.ToString(),
                new Vector2(202, 62), new Vector2(0, -84), soldOut ? Pal.Slate : d.Ad ? Pal.Green : Pal.Azure,
                () => Buy(d), 26, d.Ad ? "ic_ad" : "ic_ingot");
            Ui.Tap(face, () => Buy(d), pb.Find("body"));
            return c;
        }

        void Buy(Meta.ShopDef d)
        {
            if (d.Ad)
            {
                bool ingot = d.Get.Cur == Cur.Ingot;
                if ((ingot ? S.AdIngots >= Meta.AdIngotsMax : S.AdStamina >= Meta.AdStaminaMax)) { Ui.Toast("今日次数已用完", 200); return; }
                Ads.Show(ingot ? "shop_ingot" : "shop_stamina", () =>
                {
                    if (ingot) S.AdIngots++;
                    else S.AdStamina++;
                    Meta.Give(S, d.Get);
                    Profile.Save();
                    MetaUi.ShowRewards(Layer, "获得", new List<Item> { d.Get });
                });
                return;
            }
            if (!Meta.Spend(S, Cur.Ingot, d.Price))
            {
                Sfx.Play(Snd.Deny);
                Ui.Toast("星钻不足：看广告、做任务可得", 200);
                return;
            }
            Meta.Give(S, d.Get);
            Profile.Save();
            Sfx.Play(Snd.Coin);
            MetaUi.ShowRewards(Layer, "购买成功", new List<Item> { d.Get });
        }

        public void DoRecruit(int n, bool ad)
        {
            if (ad)
            {
                if (S.AdRecruit >= Meta.AdRecruitMax) { Ui.Toast("今日免费次数已用完", 200); return; }
                Ads.Show("recruit", () =>
                {
                    S.AdRecruit++;
                    int seed = Environment.TickCount ^ (S.Pulls * 73856093) ^ (int)(DateTime.UtcNow.Ticks & 0x7FFFFFFF);
                    var res = Meta.Recruit(S, 1, new Rng(seed));
                    Profile.Save();
                    MetaUi.RecruitResult(Layer, res);
                });
                return;
            }
            if (!Meta.Spend(S, Cur.Token, n))
            {
                Sfx.Play(Snd.Deny);
                Ui.Toast("大喇叭券不足：供销社用星钻兑换", 200);
                return;
            }
            int rSeed = Environment.TickCount ^ (S.Pulls * 73856093) ^ (int)(DateTime.UtcNow.Ticks & 0x7FFFFFFF);
            var r = Meta.Recruit(S, n, new Rng(rSeed));
            Profile.Save();
            MetaUi.RecruitResult(Layer, r);
        }
    }
}
