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
            DouyinBridge.StateChanged += h.OnDouyinStateChanged;
            return h;
        }

        void OnDestroy()
        {
            Profile.Changed -= MarkDirty;
            DouyinBridge.StateChanged -= OnDouyinStateChanged;
        }

        void OnDouyinStateChanged()
        {
            _dirty = true;
            if (Layer != null && Layer.Find("modal_dy_welfare") != null)
                MetaUi.DouyinWelfare(Layer);
        }

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
            Ui.Icon(avMask, "lord_songjiang", 244, new Vector2(4f, -6f));
            int lv = Meta.LordLevel(S, out float xp);
            Ui.Icon(av, "ui/h_round", 46, new Vector2(-42, -42), "lvBadge");
            Ui.Outlined(av, lv.ToString(), 22, Paper, new Vector2(-42, -41), new Vector2(44, 36), Ink, 1.4f);
            Ui.Tap(frame, () => MetaUi.Settings(Layer), av);
            // 名字顶、经验条底和头像框里的人像上下沿对齐，上下留白一致。
            string nick = RankService.MyName;
            var id = Ui.Top(_page, -278, y, new Vector2(220, 116), "identity");
            int nickSz = nick.Length > 7 ? 24 : nick.Length > 5 ? 28 : 32;
            var nickText = Ui.Outlined(id, nick, nickSz, Paper, new Vector2(0, 32), new Vector2(236, 44), Ink, 1.6f, TextAnchor.MiddleLeft);
            nickText.horizontalOverflow = HorizontalWrapMode.Overflow;
            nickText.verticalOverflow = VerticalWrapMode.Overflow;
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
            var under = Ui.Box(bar, new Vector2(1080, TabH), Vector2.zero, Pal.Hex("090E1E"), Art.White, "under");
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
            lip.sizeDelta = new Vector2(0f, 18f);
            lip.anchoredPosition = Vector2.zero;
            var lipImg = lip.gameObject.AddComponent<Image>();
            lipImg.sprite = Art.FadeDown;
            lipImg.color = Pal.Hex("00F57A").A(0.22f);
            lipImg.raycastTarget = false;
            var topLine = Ui.Rect(under.transform, "topLine");
            topLine.anchorMin = new Vector2(0f, 1f);
            topLine.anchorMax = new Vector2(1f, 1f);
            topLine.pivot = new Vector2(0.5f, 1f);
            topLine.sizeDelta = new Vector2(0f, 3f);
            topLine.anchoredPosition = Vector2.zero;
            var topLineImg = topLine.gameObject.AddComponent<Image>();
            topLineImg.sprite = Art.White;
            topLineImg.color = Pal.Hex("00F57A");
            topLineImg.raycastTarget = false;
            string[] names = { "供销社", "乡亲", "守村", "村长", "村委" };
            string[] icons = { "tab_shop", "tab_hero", "tab_battle", "tab_forge", "tab_fort" };
            // 降噪原则：当前激活页签不重复挂红点；山寨有可领收益或图鉴新怪时轻提示
            bool[] dots = { ShopBadge(), HeroBadge(), false, ForgeBadge(), FortBadge() };
            for (int d = 0; d < 4; d++)
            {
                if (d == _tab || d + 1 == _tab) continue;
                var sep = Ui.Box(bar, new Vector2(2f, 64f), new Vector2((d - 1.5f) * 212f, -8f), Pal.Hex("233A56").A(0.48f), Art.White, "sep" + d);
                sep.raycastTarget = false;
            }
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
                    Ui.Box(tab, new Vector2(236, 178), new Vector2(0, 18), Pal.Hex("FFB800").A(0.26f), Art.SoftDot, "glow");
                    var badge = Ui.Box(tab, new Vector2(188, 172), new Vector2(0, 10), Color.white, Art.Img("ui/h_tab_on"), "badge");
                    badge.type = Image.Type.Simple;
                }
                var ic = Ui.Icon(tab, icons[i], on ? 118 : 96, new Vector2(0, on ? 30 : 16));
                if (on) Tween.Run(ic, 999f, k => ic.rectTransform.anchoredPosition = new Vector2(0, 30 + 3.5f * Mathf.Sin(k * 999f * 3f)));
                if (on) Ui.GradOutlined(tab, names[i], 30, Pal.Hex("FFFDF0"), Pal.Hex("FFE070"), new Vector2(0, -46), new Vector2(210, 40), Pal.Hex("361804"), 2.4f);
                else Ui.Outlined(tab, names[i], 26, Pal.Hex("BDD0E4"), new Vector2(0, -49), new Vector2(210, 40), Ink, 1.8f);
                if (dots[i] && !on) MetaUi.Dot(tab, new Vector2(44, 46));
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
        static bool DyWelfareBadge(int day) =>
            DouyinBridge.IsDouyin && DouyinBridge.SidebarSupported &&
            ((Meta.CanDySidebar(S, day) && DouyinBridge.LaunchedFromSidebar) || Meta.CanDyShortcut(S));
        static bool GrowthBadge() => SevenBadge() || SprintBadge() || Meta.CanWelfare(S, Profile.Today) || DyWelfareBadge(Profile.Today);

        // ---------------- 出征 ----------------

        /// <summary>
        /// 守村主页上下双舞台分层（Home v6 扁平 2D 统一画风）：
        /// 上半屏为远景幸福村公路，晴空悬主标题，公路尽头立本关外星首领/统领与紧凑关卡铭牌；
        /// 下半屏为前景守村防线露台（home_deck），四位出战乡亲并立于四连位防守台（h_podium4）之上；
        /// 三只糖果条纹 Q 版关卡宝箱左右分列「羁绊」与「战力」，底部居中六边鎏金「摇人守村」主按钮（配金芒流光与左右切关三角）。
        /// </summary>
        void BuildBattle(bool anim)
        {
            var st = Defs.Level(S.Selected);
            var roadSize = Cover("home_road", new Vector2(1080, 1920), Color.white, 0.5f);
            Shade(0.18f, 0.12f);
            float sp = Ui.Spare;
            int day = Profile.Today;
            float baseY = TabH;

            // 下半区独立前景守村露台：紧凑黄金比例，消除中段空旷感
            float podiumY = baseY + 412f + sp * 0.14f;
            float deckH = 568f + sp * 0.14f;
            float deckCenterY = podiumY + 106f - deckH * 0.5f;
            Ui.Box(Bottom(0, podiumY + 84f, new Vector2(860, 54), "deckStepShade"),
                new Vector2(860, 54), Vector2.zero, new Color(0.03f, 0.08f, 0.15f, 0.28f), Art.SoftDot, "shadow");
            var deck = Bottom(0, deckCenterY, new Vector2(1080, deckH), "homeDeck");
            var deckImg = Ui.Box(deck, new Vector2(1080, deckH), Vector2.zero, Color.white, Art.Img("home_deck"), "art");
            deckImg.type = Image.Type.Simple;

            // 左侧领奖补给坞（含章节星级宝箱；抖音环境额外收纳「入口有礼」）
            int stars = Meta.ChapterStars(S, st.Chapter);
            int chap = st.Chapter;
            bool chapDot = ChestBadge(chap);
            bool showDy = DouyinBridge.IsDouyin && DouyinBridge.SidebarSupported;
            float colY = 258 + sp * 0.04f;
            float colStep = 132 + sp * 0.025f;
            float leftStep = showDy ? (110f + sp * 0.02f) : colStep;
            SideDock(-468, colY, leftStep, showDy ? 5 : 4);
            SideBtn(-468, colY, "tab_welfare", "福利", Meta.CanWelfare(S, day), () => MetaUi.Welfare(Layer));
            SideBtn(-468, colY + leftStep, "tab_gift", "签到", Meta.CanSign(S, day), () => MetaUi.SignIn(Layer));
            SideBtn(-468, colY + leftStep * 2, "ic_feast", "流水席", MealBadge(), () => MetaUi.Meals(Layer));
            var starBtn = SideBtn(-468, colY + leftStep * 3, "ic_chest_gold", $"★{stars}/30", chapDot, () => MetaUi.ChapterChests(Layer, chap));
            if (chapDot)
            {
                var chestIc = starBtn.GetChild(2);
                Tween.Run(chestIc, 999f, kk => chestIc.localRotation = Quaternion.Euler(0f, 0f, 6f * Mathf.Sin(kk * 999f * 7f)));
            }
            if (showDy)
                SideBtn(-468, colY + leftStep * 4, "ic_chest", "入口有礼", DyWelfareBadge(day), () => MetaUi.DouyinWelfare(Layer));

            int rightCount = Meta.SevenFinished(S) ? 3 : 4;
            SideDock(468, colY, colStep, rightCount);
            int side = 0;
            SideBtn(468, colY + colStep * side++, "tab_task", "任务", Meta.TaskBadge(S) > 0, () => MetaUi.Tasks(Layer));
            if (!Meta.SevenFinished(S)) SideBtn(468, colY + colStep * side++, "tab_seven", "七日", SevenBadge(), () => MetaUi.Seven(Layer));
            SideBtn(468, colY + colStep * side++, "tab_sprint", "冲刺", SprintBadge(), () => MetaUi.Sprint(Layer));
            SideBtn(468, colY + colStep * side, "ic_rank_stage", "排行榜", RankBadge(), () => RankUi.Open(Layer, -1, () => Rebuild(false)));

            // 远景村口公路尽头：晴空悬主标题，本关主统领稳踩收窄路面的最终平坝
            float roadEndScreenY = Ui.Height * 0.5f + (0.418f - 0.5f) * roadSize.y;
            float logoTop = Ui.SafeTop + 128f + sp * 0.04f;
            float logoH = Mathf.Clamp((roadEndScreenY - logoTop) * 0.24f, 122f, 158f);
            float logoW = logoH * 900f / 268f;
            var logo = Ui.Top(_page, 0f, logoTop + logoH * 0.5f, new Vector2(logoW, logoH), "logo");
            Ui.Box(logo, new Vector2(logoW * 1.08f, logoH * 1.30f), Vector2.zero, Color.white.A(0.30f), Art.SoftDot, "glow");
            Ui.Icon(logo, "logo", logoW, Vector2.zero, "art");
            if (anim) Tween.Pop(logo, 0.35f);

            var bd = Defs.Enemy(st.LeaderKind);
            var bossSpr = Art.Img(bd.Art);
            float aspect = bossSpr != null && bossSpr.rect.height > 1f ? bossSpr.rect.width / bossSpr.rect.height : 0.85f;
            float logoBottom = logoTop + logoH;
            float maxBossH = Mathf.Max(268f, roadEndScreenY - (logoBottom + 22f));
            float bossH = Mathf.Min(st.IsChapterBoss ? 384f : 356f, maxBossH);
            float bossW = Mathf.Clamp(bossH * aspect, 196f, 410f);
            bossH = bossW / Mathf.Max(0.25f, aspect);

            const float previewLift = 72f;
            var boss = Ui.Top(_page, 0f, roadEndScreenY - previewLift, Vector2.zero, "boss");

            var mistImg = Ui.Box(boss, new Vector2(bossW * 1.62f, 118f), new Vector2(0f, 42f),
                Pal.Hex("00F57A").A(0.28f), Art.SoftDot, "valleyMist");
            if (st.IsChapterBoss)
                Ui.Box(boss, new Vector2(bossW * 0.90f, 44f), new Vector2(0f, -2f), Pal.Hex("FF5E3A").A(0.18f), Art.SoftDot, "bossAura");
            var castSh = Ui.Box(boss, new Vector2(bossW * 0.96f, 52f), new Vector2(6f, -4f),
                new Color(0.04f, 0.10f, 0.18f, 0.44f), Art.SoftDot, "castShadow");
            var contactSh = Ui.Box(boss, new Vector2(bossW * 0.62f, 24f), new Vector2(0f, -2f),
                new Color(0.03f, 0.06f, 0.12f, 0.68f), Art.GroundShadow, "contactShadow");

            var icon = Ui.Box(boss, new Vector2(bossW, bossH), new Vector2(0f, bd.Flying ? 32f : 0f), Color.white, bossSpr, "icon");
            icon.type = Image.Type.Simple;
            icon.preserveAspect = false;
            icon.rectTransform.pivot = new Vector2(0.5f, 0.012f);
            var breather = icon.gameObject.AddComponent<BossBreathing>();
            breather.Setup(bd.Flying, contactSh.rectTransform, castSh.rectTransform, mistImg.rectTransform);
            if (anim) Tween.Pop(boss, 0.35f);

            // 1) 统领脚下紧凑 04 黑曜霓虹关卡标题（左侧青蓝目录钮 + 亮金艺术字，点击直开选关/敌情）
            float tagScreenY = roadEndScreenY + 28f - previewLift;
            var tag = Ui.Top(_page, 0f, tagScreenY, new Vector2(560, 72), "levelTag");
            string stTitle = $"{st.No}.{st.Name}";
            var stLbl = Ui.GradOutlined(tag, stTitle, 40, Pal.Hex("FFFBE0"), Pal.Hex("FFC83D"),
                new Vector2(22f, 0f), new Vector2(420, 56), Pal.Hex("0A1424"), 3.2f, TextAnchor.MiddleCenter, "stName");
            Canvas.ForceUpdateCanvases();
            float stHalfW = Mathf.Clamp(stLbl.preferredWidth * 0.5f, 90f, 195f);
            var tagRim = Ui.Box(tag, new Vector2(stHalfW * 2f + 44f, 52f), new Vector2(22f, 0f), Pal.Hex("00F57A").A(0.65f), Art.Pill, "tagRim");
            tagRim.transform.SetAsFirstSibling();
            var tagBg = Ui.Box(tag, new Vector2(stHalfW * 2f + 40f, 48f), new Vector2(22f, 0f), Pal.Hex("0A1326").A(0.88f), Art.Pill, "tagBg");
            tagBg.transform.SetSiblingIndex(1);

            var listBtn = Ui.Rect(tag, "listBtn");
            listBtn.anchoredPosition = new Vector2(22f - stHalfW - 52f, 0f);
            listBtn.sizeDelta = new Vector2(60, 60);
            Ui.Box(listBtn, Vector2.one * 58, new Vector2(0, -2), new Color(0.02f, 0.05f, 0.10f, 0.45f), Art.Circle);
            Ui.Box(listBtn, Vector2.one * 54, Vector2.zero, Pal.Hex("00E5FF"), Art.Circle);
            var listFace = Ui.Box(listBtn, Vector2.one * 46, Vector2.zero, Pal.Hex("0B182E"), Art.Circle);
            for (int r = -1; r <= 1; r++)
                Ui.Box(listBtn, new Vector2(22, 3.6f), new Vector2(0, r * 8f), Pal.Hex("EAF2FF"), Art.Pill);
            Ui.Tap(listFace, () => MetaUi.LevelList(Layer), listBtn);
            var tagHit = Ui.Box(tag, new Vector2(stHalfW * 2f + 44f, 58f), new Vector2(22f, 0f), new Color(0, 0, 0, 0), Art.White, "tagHit");
            Ui.Tap(tagHit, () => MetaUi.StageEnemies(Layer, st), stLbl.transform);

            // 2) 村口公路中段 04 霓虹绿透视荧光关卡大字与情报胶囊（融入暗夜飞碟光束路面）
            float deckTopScreenY = Ui.Height - (podiumY + 78f);
            float roadMidScreenY = Mathf.Lerp(roadEndScreenY + 80f, deckTopScreenY - 24f, 0.52f) - previewLift;
            var roadMark = Ui.Top(_page, 0f, roadMidScreenY, new Vector2(560, 210), "roadImprint");
            roadMark.SetSiblingIndex(2);

            var roadInk = Pal.Hex("00F57A").A(0.54f);
            var roadNo = Ui.Label(roadMark, $"第 {st.No} 关", 40, roadInk, new Vector2(0, 66f), new Vector2(420, 54), TextAnchor.MiddleCenter, Fonts.Heavy, "rNo");
            roadNo.raycastTarget = false;
            var nameFont = Fonts.Fits(Fonts.Brush, st.Name) ? Fonts.Brush : Fonts.Heavy;
            var roadName = Ui.Label(roadMark, st.Name, nameFont == Fonts.Brush ? 76 : 64, Pal.Hex("B8FFE0").A(0.65f),
                new Vector2(0, 2f), new Vector2(540, 92), TextAnchor.MiddleCenter, nameFont, "rName");
            roadName.raycastTarget = false;

            int nextSpecial = ((st.No - 1) / 5 + 1) * 5;
            string roadSub = st.BuffRole.HasValue
                ? $"本关{Defs.RoleName(st.BuffRole.Value)}伤害 +{(int)(st.BuffPct * 100 + 0.5f)}%"
                : st.IsChapterBoss ? "首领坐镇 · 击败开启5格豪华盲盒" : $"第{Mathf.Min(Defs.LevelCount, nextSpecial)}关迎战外星首领";
            var roadPillRim = Ui.Box(roadMark, new Vector2(340, 44), new Vector2(0, -68f), Pal.Hex("00F57A").A(0.42f), Art.Pill, "rPillRim");
            roadPillRim.raycastTarget = false;
            var roadPill = Ui.Box(roadMark, new Vector2(336, 40), new Vector2(0, -68f), Pal.Hex("071220").A(0.76f), Art.Pill, "rPill");
            roadPill.raycastTarget = false;
            var roadSubTxt = Ui.Label(roadMark, roadSub, 21, Pal.Hex("C8FFE8").A(0.92f), new Vector2(0, -68f), new Vector2(320, 36), TextAnchor.MiddleCenter, Fonts.Heavy, "rSub");
            roadSubTxt.raycastTarget = false;

            // 出战乡亲：并立于四连位一体式防守台（ui/h_podium4），脚下按品级铺设扁平 2D 底座垫（ui/h_pad_0..4）
            const float podW = 636f, podH = 200f;
            var podium = Bottom(0, podiumY, new Vector2(podW, podH), "podium");
            var podStage = Ui.Box(podium, new Vector2(podW, podH), Vector2.zero, Color.white, Art.Img("ui/h_podium4"), "stage");
            podStage.type = Image.Type.Simple;

            float ringY = 0.2075f * podH;
            float padY = 0.200f * podH;
            float[] slotFrac = { -0.3492f, -0.1131f, 0.1134f, 0.3483f };
            var lu = Meta.Lineup(S);

            for (int i = 0; i < lu.Length; i++)
            {
                var hd = Defs.Hero(lu[i]);
                int tier = MetaUi.HeroTier(hd.Rarity);
                float sx = slotFrac[Mathf.Clamp(i, 0, 3)] * podW;
                var pad = Ui.Box(podium, new Vector2(138f, 88f), new Vector2(sx, padY), Color.white, Art.Img("ui/h_pad_" + tier), "pad" + i);
                pad.type = Image.Type.Simple;
                pad.raycastTarget = false;
                if (tier >= 2)
                {
                    float baseA = tier >= 3 ? 0.24f : 0.14f;
                    var aura = Ui.Box(podium, new Vector2(124f, 54f), new Vector2(sx, padY + 8f), MetaUi.QualGlow(tier).A(baseA), Art.SoftDot, "padGlow" + i);
                    aura.raycastTarget = false;
                    Color gc = MetaUi.QualGlow(tier);
                    float ph = i * 0.9f;
                    Tween.Run(aura, 999f, k => aura.color = gc.A(baseA + (tier >= 3 ? 0.08f : 0.05f) * Mathf.Sin(k * 999f * 2.6f + ph)));
                }
            }

            var arts = new Image[lu.Length];
            for (int i = 0; i < lu.Length; i++)
            {
                var d = Defs.Hero(lu[i]);
                float sx = slotFrac[Mathf.Clamp(i, 0, 3)] * podW;
                var g = Ui.Rect(podium, "hero" + i);
                g.anchoredPosition = new Vector2(sx, ringY + 65f);
                g.sizeDelta = new Vector2(142, 200);
                Ui.Box(g, new Vector2(96, 26), new Vector2(0, -74f), new Color(0.05f, 0.04f, 0.10f, 0.48f), Art.GroundShadow, "shadow");
                bool framed = Art.Animated(d.Art);
                float draw = 160f, standY = 5f;
                if (framed)
                {
                    float bodyH = 0.64f, foot = 0.016f;
                    if (AnimMeta.Info.TryGetValue(d.Art, out var meta)) { bodyH = meta.Body; foot = meta.Foot; }
                    draw = 148f / Mathf.Max(0.28f, bodyH);
                    standY = -74f - draw * (foot - 0.5f);
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
                if (!framed)
                    Tween.Run(art, 999f, k => art.rectTransform.anchoredPosition = new Vector2(0, standY + 3 * Mathf.Sin(k * 999f * 2.2f + i * 0.8f)));
                var heroHit = Ui.Box(g, new Vector2(140, 186), new Vector2(0, -2), new Color(0, 0, 0, 0), Art.White, "hit");
                Ui.Tap(heroHit, () => SetTab(TabHero), art.transform);
                if (Meta.CanLevel(S, lu[i]))
                {
                    Ui.Breathe(Ui.UpgradeMark(g, 30, new Vector2(46, -50), "upHint"), 4f);
                }
                if (anim) Tween.Pop(g, 0.3f, 0.1f + i * 0.05f);
            }

            // 3) 紧凑三宝箱：透视六角展示垫盘上并排三只 Q 版箱子；羁绊在左、战力在右，扫荡/增援让到外侧
            float chestY = baseY + 250f + sp * 0.10f;
            float startY = baseY + 112f + sp * 0.05f;

            bool aid = S.Selected > S.Cleared && S.LostStage == S.Selected && S.AdStart2Star < AidPerDay;
            if (Meta.CanSweep(S, st.No))
            {
                var sw = Bottom(456, chestY + 6f, new Vector2(118, 118), "sweep");
                var swVis = Ui.Rect(sw, "vis");
                swVis.sizeDelta = new Vector2(118, 118);
                Ui.Icon(swVis, "ui/h_round", 88, new Vector2(0, 12), "bg");
                Ui.Icon(swVis, "ic_sweep", 56, new Vector2(0, 14));
                Ui.Outlined(swVis, "扫荡", 22, Paper, new Vector2(0, -32), new Vector2(116, 28), Ink, 1.7f);
                var swHit = Ui.Box(sw, new Vector2(124, 124), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
                Ui.Tap(swHit, () => Sweep(st), swVis);
            }
            else if (aid)
            {
                var aidNode = Bottom(456, chestY + 6f, new Vector2(124, 118), "aid");
                var aidVis = Ui.Rect(aidNode, "vis");
                aidVis.sizeDelta = new Vector2(124, 118);
                Ui.Icon(aidVis, "ui/h_round", 88, new Vector2(0, 12), "bg");
                Ui.Icon(aidVis, "ic_ad", 52, new Vector2(0, 14));
                Ui.Outlined(aidVis, "增援", 22, Pal.Hex("A8FFBE"), new Vector2(0, -32), new Vector2(120, 28), Ink, 1.7f);
                var aidHit = Ui.Box(aidNode, new Vector2(126, 124), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
                Ui.Tap(aidHit, OfferAid, aidVis);
            }

            var row = Bottom(0, chestY, new Vector2(380, 116), "chests");
            var matImg = Ui.Box(row, new Vector2(372, 70), new Vector2(0, -21f), Color.white, Art.Img("ui/h_chest_mat"), "mat");
            matImg.type = Image.Type.Simple;

            for (int k = 0; k < 3; k++)
            {
                bool got = Meta.LevelChestGot(S, st.No, k);
                bool ready = Meta.CanOpenLevelChest(S, st.No, k);
                float x = (k - 1) * 114f;
                var cSlot = Ui.Rect(row, "chestSlot" + k);
                cSlot.anchoredPosition = new Vector2(x, 0f);
                cSlot.sizeDelta = new Vector2(110, 110);
                var c = Ui.Icon(cSlot, got ? MetaUi.ChestOpenArt(k) : MetaUi.ChestArt(k), 106, new Vector2(0, 12f), "chest" + k);
                if (got) MetaUi.Check(cSlot, new Vector2(34, -22), 26);
                if (ready)
                {
                    MetaUi.Dot(c.transform, new Vector2(38, 28));
                    var ic = c;
                    float phase = k * 0.6f;
                    Tween.Run(ic, 999f, kk => ic.rectTransform.localRotation = Quaternion.Euler(0, 0, 6f * Mathf.Sin(kk * 999f * 6f + phase)));
                }
                int ck = k, lvl = st.No;
                var cHit = Ui.Box(cSlot, new Vector2(114, 114), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
                Ui.Tap(cHit, () =>
                {
                    if (!Meta.CanOpenLevelChest(S, lvl, ck))
                    {
                        MetaUi.LevelChestCard(Layer, lvl, ck, c.transform);
                        return;
                    }
                    var gotR = Meta.OpenLevelChest(S, lvl, ck, new Rng(Environment.TickCount));
                    Profile.Save();
                    MetaUi.ShowRewards(Layer, "关卡宝箱", gotR);
                }, c.transform);
                if (anim) Tween.Pop(cSlot, 0.28f, 0.15f + k * 0.05f);
            }

            float flankY = chestY + 2f;
            const float flankX = 276f;

            float roleSyn = Defs.RoleSynergyBonus(lu);
            var bonds = Defs.ActiveBonds(lu);
            float totalSyn = roleSyn;
            foreach (var bnd in bonds) totalSyn += Mathf.Max(bnd.Dmg, Mathf.Max(bnd.Elite, Mathf.Max(bnd.Crit, bnd.FlyCav)));
            int synPct = Mathf.RoundToInt(totalSyn * 100f);
            string bondNum = synPct > 0 ? $"+{synPct}%" : "";

            const float bpH = 48f;
            var bondHolder = Bottom(-flankX, flankY, new Vector2(180, bpH), "bondBtn");
            var bondBody = Ui.Rect(bondHolder, "body");
            bondBody.sizeDelta = new Vector2(180, bpH);

            var nameLbl = Ui.Label(bondBody, "羁绊", 26, Pal.Hex("F4F6F8"), Vector2.zero, new Vector2(80, 40),
                TextAnchor.MiddleCenter, Fonts.Heavy, "name");
            nameLbl.fontSize = 26;
            nameLbl.horizontalOverflow = HorizontalWrapMode.Overflow;
            nameLbl.verticalOverflow = VerticalWrapMode.Overflow;
            var nameCs = nameLbl.gameObject.AddComponent<CrispStroke>();
            nameCs.Color = Pal.Hex("2C333A");
            nameCs.Radius = 1.5f;

            Text numLbl = null;
            if (bondNum.Length > 0)
            {
                var numFont = Fonts.Fits(Fonts.Number, bondNum) ? Fonts.Number : Fonts.Heavy;
                numLbl = Ui.Label(bondBody, bondNum, 28, Pal.Hex("7DFF6A"), Vector2.zero, new Vector2(120, 40),
                    TextAnchor.MiddleCenter, numFont, "num");
                numLbl.fontSize = numFont == Fonts.Number ? 28 : 26;
                numLbl.horizontalOverflow = HorizontalWrapMode.Overflow;
                numLbl.verticalOverflow = VerticalWrapMode.Overflow;
                var numCs = numLbl.gameObject.AddComponent<CrispStroke>();
                numCs.UseGradient = true;
                numCs.TopColor = Pal.Hex("C8FFB0");
                numCs.BottomColor = Pal.Hex("3AD45C");
                numCs.Color = Pal.Hex("0E3A16");
                numCs.Radius = 1.6f;
            }
            Canvas.ForceUpdateCanvases();

            float nameW = Mathf.Max(nameLbl.preferredWidth, 52f);
            float numW = numLbl != null ? Mathf.Max(numLbl.preferredWidth, 40f) : 0f;
            const float gap = 8f, padX = 18f;
            float inner = nameW + (numLbl != null ? gap + numW : 0f);
            float bpW = inner + padX * 2f;
            const float pillRight = -200f;
            bondHolder.anchoredPosition = new Vector2(pillRight - bpW * 0.5f, flankY);
            bondHolder.sizeDelta = new Vector2(bpW, bpH);
            bondBody.sizeDelta = new Vector2(bpW, bpH);
            Ui.Box(bondBody, new Vector2(bpW, bpH), new Vector2(0, -1f), Pal.Hex("00F57A").A(0.72f), Art.Pill, "rim");
            Ui.Box(bondBody, new Vector2(bpW - 4f, bpH - 4f), Vector2.zero, Pal.Hex("0B1528"), Art.Pill, "face");

            float contentLeft = -inner * 0.5f;
            nameLbl.rectTransform.sizeDelta = new Vector2(nameW + 6f, 40f);
            nameLbl.rectTransform.anchoredPosition = new Vector2(contentLeft + nameW * 0.5f, 1f);
            nameLbl.transform.SetAsLastSibling();
            if (numLbl != null)
            {
                numLbl.rectTransform.sizeDelta = new Vector2(numW + 8f, 40f);
                numLbl.rectTransform.anchoredPosition = new Vector2(contentLeft + nameW + gap + numW * 0.5f, 0.5f);
                numLbl.transform.SetAsLastSibling();
            }
            var bondHit = Ui.Box(bondHolder, new Vector2(bpW + 12f, bpH + 16f), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "bondHit");
            Ui.Tap(bondHit, () => MetaUi.BondTip(Layer, lu), bondBody, true, 2f);

            string pwNum = Ui.Num(Meta.TeamPower(S));
            var pwFont = Fonts.Fits(Fonts.Number, pwNum) ? Fonts.Number : Fonts.Heavy;
            var pwNode = Bottom(flankX, flankY, new Vector2(220, 48), "powerMark");
            var pwLbl = Ui.Label(pwNode, pwNum, pwFont == Fonts.Number ? 38 : 34, Color.white, Vector2.zero, new Vector2(200, 48), TextAnchor.MiddleLeft, pwFont, "pwNum");
            if (pwFont == Fonts.Number) pwLbl.fontSize = 38;
            var pwCs = pwLbl.gameObject.AddComponent<CrispStroke>();
            pwCs.UseGradient = true;
            pwCs.TopColor = Pal.Hex("FFFBE0");
            pwCs.BottomColor = Pal.Hex("FFC63A");
            pwCs.Color = Pal.Hex("281808");
            pwCs.Radius = 2.4f;
            Canvas.ForceUpdateCanvases();

            float pwW = Mathf.Clamp(pwLbl.preferredWidth + 4f, 48f, 150f);
            const float swSz = 38f, swGap = 4f;
            float totalPwW = swSz + swGap + pwW;
            Ui.Icon(pwNode, "ic_sword", swSz, new Vector2(-totalPwW * 0.5f + swSz * 0.5f, 1f), "sword");
            pwLbl.rectTransform.sizeDelta = new Vector2(pwW + 12f, 48f);
            pwLbl.rectTransform.anchoredPosition = new Vector2(-totalPwW * 0.5f + swSz + swGap + (pwW + 12f) * 0.5f, 1f);

            // 4) 底部核心行动区：全场唯一鎏金焦点「摇人守村」六边主按钮 + 左右切关三角箭头
            var start = Ui.SubBtn(_page, "摇人守村", "ic_wine", Meta.BattleStamina.ToString(), new Vector2(468f, 142f), Vector2.zero,
                Pal.Gold, () => Game.I.StartLevel(S.Selected), 50, 26, true);
            start.anchorMin = start.anchorMax = new Vector2(0.5f, 0f);
            start.anchoredPosition = new Vector2(0f, startY);

            if (S.Selected > 1) StageArrow(startY, -292f, -1);
            if (S.Selected <= S.Cleared && S.Selected < Defs.LevelCount) StageArrow(startY, 292f, 1);

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

        /// <summary>「摇人守村」两侧的淡金扁平 2D 三角切关按钮。</summary>
        void StageArrow(float y, float x, int dir)
        {
            var holder = Bottom(x, y, new Vector2(86, 96), dir < 0 ? "prevStage" : "nextStage");
            var body = Ui.Rect(holder, "body");
            body.sizeDelta = new Vector2(74, 84);
            var ic = Ui.Icon(body, "ui/h_stage_arrow", 82, Vector2.zero, "arrow");
            ic.color = Pal.Hex("FFE7A3");
            if (dir > 0) ic.rectTransform.localScale = new Vector3(-1f, 1f, 1f);
            var hit = Ui.Box(holder, new Vector2(104, 114), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            Ui.Tap(hit, () =>
            {
                S.Selected = Mathf.Clamp(S.Selected + dir, 1, Mathf.Min(Defs.LevelCount, S.Cleared + 1));
                Profile.Save();
            }, body);
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
        RectTransform SideBtn(float x, float y, string icon, string name, bool dot, Action act, bool locked = false)
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
            return b;
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
            Ui.Label(p, "写下这套方案的名字", 28, Pal.Hex("8CA6C6"), new Vector2(0, 166), new Vector2(680, 48), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Box(p, new Vector2(566, 102), new Vector2(0, 24), Pal.Hex("00E5FF").A(0.55f), Art.Pill, "wellRim");
            var well = Ui.Box(p, new Vector2(560, 96), new Vector2(0, 24), Pal.Hex("080D1A"), Art.Pill, "well");
            var field = Ui.Rect(well.transform, "field");
            field.sizeDelta = new Vector2(520, 80);
            var hit = field.gameObject.AddComponent<Image>();
            hit.color = new Color(1f, 1f, 1f, 0.001f);
            var shown = Ui.Label(field, "", 36, Pal.Hex("EAF2FF"), Vector2.zero, new Vector2(500, 72), TextAnchor.MiddleCenter, Fonts.Heavy, "text");
            shown.supportRichText = false;
            var ph = Ui.Label(field, "方案" + (pi + 1), 36, Pal.Hex("5E7694"), Vector2.zero, new Vector2(500, 72), TextAnchor.MiddleCenter, Fonts.Heavy, "ph");
            ph.raycastTarget = false;
            var input = field.gameObject.AddComponent<InputField>();
            input.textComponent = shown;
            input.placeholder = ph;
            input.characterLimit = 6;
            input.lineType = InputField.LineType.SingleLine;
            input.text = Meta.PresetName(S, pi);
            input.caretColor = Pal.Hex("00E5FF");
            input.selectionColor = new Color(0f, 0.90f, 1f, 0.35f);
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
            }, 36, null, Pal.Hex("1E1002"));
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
                // 脚下内嵌品级底座垫 + 贴地接触阴影 + 右下职业圆章（与守村主页防守台同源）
                int tier = MetaUi.HeroTier(d.Rarity);
                var qPad = Ui.Box(g, new Vector2(188, 108), new Vector2(0, -99), Color.white, Art.Img("ui/h_pad_" + tier), "qAura");
                qPad.type = Image.Type.Simple;
                qPad.raycastTarget = false;
                Ui.Box(g, new Vector2(138, 30), new Vector2(0, -102), new Color(0.06f, 0.04f, 0.10f, 0.48f), Art.GroundShadow, "shadow");
                float pedDraw = 180f;
                float pedY = -103f;
                bool pedFramed = Art.Animated(d.Art);
                if (pedFramed && AnimMeta.Info.TryGetValue(d.Art, out var pedMeta))
                {
                    pedDraw = 152f / Mathf.Max(0.28f, pedMeta.Body);
                    pedY = -102f - pedDraw * pedMeta.Foot;
                }
                var art = Ui.Icon(g, d.Art, pedDraw, Vector2.zero, "art");
                art.rectTransform.pivot = new Vector2(0.5f, 0f);
                art.rectTransform.anchoredPosition = new Vector2(0, pedY);
                float ph = i * 0.7f;
                if (pedFramed)
                {
                    string pedKey = d.Art;
                    Art.Late(art, pedKey, () =>
                    {
                        var fr = Art.Frames(pedKey);
                        if (fr == null || fr.Length == 0 || !art) return;
                        art.sprite = fr[0];
                        Tween.Run(art, 999f, k =>
                        {
                            if (!art) return;
                            float t = k * 999f + ph;
                            art.sprite = fr[((int)(t * 1.6f)) % Mathf.Min(2, fr.Length)];
                            art.rectTransform.localScale = new Vector3(1f, 1f + 0.012f * Mathf.Sin(t * 2.2f), 1f);
                        });
                    });
                }
                else
                {
                    Tween.Run(art, 999f, k => art.rectTransform.localScale = new Vector3(1f, 1f + 0.012f * Mathf.Sin(k * 999f * 2.2f + ph), 1f));
                }
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

            // 战力盾徽压在名册顶沿，图 4 同款鎏金-电青 V 字折角顶梁 + 深宝蓝战术名册舱
            float py = pgY + 96f;
            var panel = Top(0, py, new Vector2(1068, 10), "roster");
            panel.pivot = new Vector2(0.5f, 1f);
            float ph2 = Mathf.Max(820f, Ui.Height - Ui.SafeTop - py - 176f);
            Ui.Skin(panel, "dark", new Vector2(1068, ph2), new Vector2(0, -ph2 * 0.5f), 1f);
            var amb = Ui.Box(panel, new Vector2(960, 560), new Vector2(0, -ph2 * 0.42f), Pal.Hex("2E5CC8").A(0.22f), Art.SoftDot, "ambGlow");
            amb.raycastTarget = false;
            var hdrV = Ui.Box(panel, new Vector2(1060, 62), new Vector2(0, -18f), Color.white, Art.Img("ui/drawer_header_v"), "hdrV");
            hdrV.type = Image.Type.Simple;
            hdrV.raycastTarget = false;

            var pw = Ui.Rect(panel, "power");
            pw.sizeDelta = new Vector2(392, 86);
            pw.anchoredPosition = new Vector2(0, 12);
            Ui.Skin(pw, "power_crest", new Vector2(392, 86), Vector2.zero, 1f);
            Ui.Icon(pw, "ic_sword", 52, new Vector2(-96, 2));
            Ui.Outlined(pw, Ui.Num(Meta.TeamPower(S)), 40, Gold, new Vector2(22, 2), new Vector2(210, 56), Ink, 2.2f);

            // 高对比宝蓝霓虹暴击伤害增幅横幅
            var critWell = Ui.Rect(panel, "critWell");
            critWell.sizeDelta = new Vector2(800, 60);
            critWell.anchoredPosition = new Vector2(0, -82);
            Ui.Box(critWell, new Vector2(800, 60), Vector2.zero, Pal.Hex("00E5FF").A(0.65f), Art.Pill);
            Ui.Box(critWell, new Vector2(794, 54), Vector2.zero, Pal.Hex("1B315E"), Art.Pill);
            var crit = Ui.Outlined(critWell, $"全村暴击伤害增幅：<color=#FFD84A>{Meta.BuildLoadout(S).CritDmg * 100:0.#}%</color>", 32, Paper, new Vector2(-18, 1), new Vector2(690, 50), Pal.Hex("091326"), 1.4f);
            crit.GetComponent<CrispStroke>().Radius = 0.9f;
            var bang = Ui.Box(critWell, Vector2.one * 40, new Vector2(352, 0), Pal.Hex("091326"), Art.Circle, "bang");
            Ui.Box(bang.transform, Vector2.one * 36, Vector2.zero, Pal.Hex("2D5894"), Art.Circle);
            Ui.Outlined(bang.transform, "!", 25, Color.white, new Vector2(0, 1), new Vector2(36, 34), Pal.Hex("091326"), 1.2f);
            Ui.Tap(bang, () => Ui.Hint(bang.transform, "全村暴击伤害", "任意乡亲每升 1 级，\n全村暴击伤害 +1%"), bang.transform);

            var roles = new List<int> { -1 };
            foreach (var r in Defs.RoleOrder) roles.Add((int)r);
            int owned = 0;
            for (int h = 0; h < Defs.HeroCount; h++) if (Meta.Owned(S, (HeroId)h)) owned++;
            for (int i = 0; i < roles.Count; i++)
            {
                int rf = roles[i];
                bool sel = rf == _roleFilter;
                var pos = new Vector2((i - (roles.Count - 1) * 0.5f) * 144, -158);
                var tb = Ui.Skin(panel, sel ? "btn_gold" : "h_capsule", new Vector2(138, 60), pos, -1f,
                    sel ? (Color?)null : Pal.Hex("D6EAFF"));
                if (rf >= 0) Ui.Icon(tb.transform, MetaUi.RoleArt((Role)rf), 36, new Vector2(-40, 2));
                Ui.Outlined(tb.transform, rf < 0 ? $"全部 {owned}" : Defs.RoleName((Role)rf), rf < 0 ? 23 : 25,
                    sel ? Pal.Hex("1E1002") : Pal.Hex("E8F4FF"), new Vector2(rf < 0 ? 0 : 16, 1), new Vector2(114, 56),
                    sel ? Pal.Hex("FFF4B8") : Ink, sel ? 0.9f : 1.5f);
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
            // 按下只缩小画面。热区留在 c 上，否则框一缩，手指就掉到框外，进出反复闪。
            var body = Ui.Rect(c, "body");

            // 传说好汉卡外圈呼吸鎏金气场（拉开顶阶尊贵度）
            if (owned && tier >= 3)
            {
                var aura = Ui.Box(c, new Vector2(276, 294), new Vector2(0, 20), Pal.Hex("FFC842").A(0.28f), Art.SoftDot, "aura");
                Tween.Run(aura, 999f, k => aura.color = Pal.Hex("FFC842").A(0.20f + 0.10f * Mathf.Sin(k * 999f * 2.6f)));
            }

            // 长按换将只认这块卡框。框外（名字、卡与卡的空隙）不进长按。
            var frameSize = new Vector2(234, 258);
            var framePos = new Vector2(0, 20);
            var face = MetaUi.Card(c, owned ? MetaUi.RarityCard(d.Rarity) : "card_lock", frameSize, framePos);

            // 卡内舞台背光与立绘裁切窗（饱和品阶宝石卡底 + 柔和逆光光晕 + 贴地脚影）
            var artMask = Ui.Rect(c, "artMask");
            artMask.sizeDelta = new Vector2(210, 194);
            artMask.anchoredPosition = new Vector2(0, 32);
            artMask.gameObject.AddComponent<RectMask2D>();
            if (owned)
            {
                var backGlow = Ui.Box(artMask, Vector2.one * (tier >= 3 ? 204 : 184), new Vector2(0, 8),
                    MetaUi.QualGlow(tier).A(tier >= 3 ? 0.44f : 0.30f), Art.SoftDot, "stageGlow");
                backGlow.raycastTarget = false;
            }
            Ui.Box(artMask, new Vector2(130, 26), new Vector2(0, -48), new Color(0.03f, 0.05f, 0.12f, owned ? 0.42f : 0.24f), Art.GroundShadow, "footSh");
            var art = Ui.Icon(artMask, d.Art, 162, Vector2.zero);
            art.rectTransform.pivot = new Vector2(0.5f, 0f);
            art.rectTransform.anchoredPosition = new Vector2(0, -50);
            if (!owned) art.color = new Color(0.16f, 0.22f, 0.32f, 0.90f);

            // 左上角立体白瓷镶边职业徽章（对标参考图左上压角圆章）
            Ui.Box(c, Vector2.one * 60, new Vector2(-87, 117), new Color(0.05f, 0.09f, 0.15f, 0.32f), Art.Circle, "roleSh");
            Ui.Box(c, Vector2.one * 56, new Vector2(-87, 119), Color.white, Art.Circle, "roleRing");
            Ui.Box(c, Vector2.one * 46, new Vector2(-87, 119), owned ? MetaUi.RoleColor(d.Kind) : Pal.Slate, Art.Circle, "roleBg");
            Ui.Icon(c, MetaUi.RoleArt(d.Kind), 35, new Vector2(-87, 120));

            // 卡框正下方清晰名牌（传说好汉暖香槟金字，其余纯白描边字）
            Color nameCol = !owned ? Pal.Hex("9EB2C6") : tier >= 3 ? Pal.Hex("FFF1B4") : Color.white;
            Ui.Outlined(c, d.Name, 29, nameCol, new Vector2(0, -130), new Vector2(234, 40), Pal.Ink, 2f);
            var nameHit = Ui.Box(c, new Vector2(234, 40), new Vector2(0, -130), new Color(1f, 1f, 1f, 0.001f), Art.White, "nameHit");
            nameHit.raycastTarget = true;

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
                    Ui.Breathe(Ui.UpgradeMark(c, 34, new Vector2(barX + barW * 0.5f + 16f, rowY + 2f)), 4f);
                }
            }
            else
            {
                Ui.Icon(c, "ic_lock", 46, new Vector2(84, 118));
                string src = d.Rarity >= 4 && !Meta.OrangeOpened(S) ? $"第{Meta.OrangeOpen}关后可摇" : "摇人获得";
                Ui.Box(c, new Vector2(188, 28), new Vector2(0, -74), new Color(0.07f, 0.11f, 0.16f, 0.72f), Art.Pill, "lockBar");
                Ui.Outlined(c, src, 20, Pal.Hex("CFE2F2"), new Vector2(0, -73), new Vector2(184, 30), Pal.Hex("0E1720"), 1.2f);
            }
            var hit = Ui.Box(c, frameSize, framePos, new Color(1f, 1f, 1f, 0.001f), Art.White, "hit");
            hit.raycastTarget = true;
            LineupDrag drag = null;
            // 已经站在点将台上的，长按不抬起来，也不进换位。
            if (owned && Array.IndexOf(S.Lineup, (int)h) < 0)
            {
                drag = hit.gameObject.AddComponent<LineupDrag>();
                drag.Init(this, h, c.GetComponentInParent<ScrollRect>());
            }
            System.Action open = () =>
            {
                if (drag != null && drag.Ate) return;
                MetaUi.HeroDetail(Layer, h);
            };
            Ui.Tap(hit, open, body);
            Ui.Tap(nameHit, open, body);
            var visuals = new List<Transform>();
            for (int i = 0; i < c.childCount; i++)
            {
                var ch = c.GetChild(i);
                if (ch == body || ch == hit.transform || ch == nameHit.transform) continue;
                visuals.Add(ch);
            }
            foreach (var ch in visuals) ch.SetParent(body, false);
            return c;
        }

        /// <summary>按住卡框内一小会儿就抬起可拖。手指离开卡框就取消长按；先滑出一段，才交给名单滚动。</summary>
        sealed class LineupDrag : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler, IInitializePotentialDragHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
        {
            HomeScreen _home;
            HeroId _hero;
            ScrollRect _scroll;
            bool _down, _drag, _passed;
            float _t;
            int _pointer = -1;
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
                _down = Inside(e.position);
                _drag = false;
                _passed = false;
                _t = Time.unscaledTime;
                _pointer = e.pointerId;
                _origin = _pos = e.position;
                if (!_down) return;
                var scroll = Scroll();
                if (scroll) scroll.StopMovement();
            }

            public void OnPointerExit(PointerEventData e)
            {
                if (_drag || _passed) return;
                _down = false;
            }

            void Update()
            {
                if (!_down || _drag || _passed || _home == null || _home.Swapping) return;
                if (Live(out var p)) _pos = p;
                if (!Inside(_pos)) { _down = false; return; }
                if (Time.unscaledTime - _t < Hold) return;
                StartDrag(_pos);
            }

            /// <summary>屏幕点是否落在这块卡框矩形内。遮罩画布用空相机。</summary>
            bool Inside(Vector2 screen) =>
                RectTransformUtility.RectangleContainsScreenPoint((RectTransform)transform, screen, null);

            bool Live(out Vector2 p)
            {
                if (Input.touchCount > 0)
                {
                    for (int i = 0; i < Input.touchCount; i++)
                    {
                        var t = Input.GetTouch(i);
                        if (t.fingerId == _pointer) { p = t.position; return true; }
                    }
                }
                p = Input.mousePosition;
                return true;
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
                if (!Inside(e.position))
                {
                    _down = false;
                    if (Slid(e.position)) HandToScroll(e);
                    return;
                }
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
                if (!Inside(e.position))
                {
                    _down = false;
                    if (Slid(e.position)) HandToScroll(e);
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
                () => MetaUi.ForgeSlot(Layer, anyForge ? bestSlot : 0, () => Rebuild(false)), 42, null, Pal.Hex("1E1002"));
            if (anyForge) MetaUi.Dot(enhCreated, new Vector2(164, 38));

            // 4. 下半屏 04 黑曜霓虹战术抽屉（底边精准停在 TabBar 顶沿，内部为中央突起盾徽预留 106px 安全净空，绝不重叠）
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

            var dShadow = Ui.Box(drawer, Vector2.one, Vector2.zero, new Color(0.02f, 0.05f, 0.12f, 0.45f), Art.Rounded, "dShadow");
            TopStretch(dShadow.rectTransform, 8f, new Vector2(1086, drawerH + 44f));
            var dOuter = Ui.Box(drawer, Vector2.one, Vector2.zero, Pal.Hex("050914"), Art.Rounded, "dOuter");
            TopStretch(dOuter.rectTransform, 0f, new Vector2(1086, drawerH + 36f));
            var dTrim = Ui.Box(drawer, Vector2.one, Vector2.zero, Pal.Hex("00E5FF").A(0.85f), Art.Rounded, "dTrim");
            TopStretch(dTrim.rectTransform, -2.2f, new Vector2(1084, drawerH + 34f));
            var dFace = Ui.Box(drawer, Vector2.one, Vector2.zero, Pal.Hex("132242"), Art.Rounded, "dFace");
            TopStretch(dFace.rectTransform, -7f, new Vector2(1084, drawerH + 29f));
            dFace.raycastTarget = true;

            // 抽屉中央柔和电青-星紫环境底光，消除暗沉空旷感
            var dAmb = Ui.Box(drawer, new Vector2(980, 560), new Vector2(0, -drawerH * 0.48f), Pal.Hex("2E62C8").A(0.24f), Art.SoftDot, "dAmb");
            dAmb.rectTransform.anchorMin = dAmb.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            dAmb.raycastTarget = false;

            // 图 4 设定图同款：鎏金-电青双轨 V 字折角顶梁！
            var dHdrV = Ui.Box(drawer, new Vector2(1084, 64), new Vector2(0, 6f), Color.white, Art.Img("ui/drawer_header_v"), "dHdrV");
            dHdrV.type = Image.Type.Simple;
            dHdrV.rectTransform.anchorMin = dHdrV.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            dHdrV.rectTransform.pivot = new Vector2(0.5f, 1f);
            dHdrV.raycastTarget = false;

            // 三段式立体胶囊切换栏：徽章 / 装备 / 材料（宝蓝金属槽 + 亮金选中皮肤）
            var seg = Ui.Rect(drawer, "seg");
            seg.anchorMin = seg.anchorMax = new Vector2(0.5f, 1f);
            seg.anchoredPosition = new Vector2(0, -68);
            seg.sizeDelta = new Vector2(944, 76);
            Ui.Box(seg, new Vector2(944, 76), Vector2.zero, Pal.Hex("3870B8").A(0.75f), Art.Pill);
            Ui.Box(seg, new Vector2(938, 70), Vector2.zero, Pal.Hex("0C1730"), Art.Pill);
            Ui.Box(seg, new Vector2(930, 62), Vector2.zero, Pal.Hex("182B52"), Art.Pill);
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
                    var sl = Ui.Label(seg, subNames[i], 32, Pal.Hex("1E1002"), new Vector2(sx, 2), new Vector2(260, 56),
                        TextAnchor.MiddleCenter, Fonts.Heavy);
                    var sh = sl.gameObject.AddComponent<Shadow>();
                    sh.effectColor = new Color(1f, 0.98f, 0.88f, 0.65f);
                    sh.effectDistance = new Vector2(0f, -1.3f);
                }
                else
                {
                    pill = Ui.Box(seg, new Vector2(304, 60), new Vector2(sx, 0), new Color(0, 0, 0, 0), Art.Pill, "sub" + i);
                    Ui.Outlined(seg, subNames[i], 30, Pal.Hex("B8CCE4"), new Vector2(sx, 1), new Vector2(260, 56), Pal.Hex("0B1424"), 1.6f);
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
                Ui.Breathe(Ui.UpgradeMark(b, 36, new Vector2(31, 37)));
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
                Ui.Breathe(Ui.UpgradeMark(c, 34, new Vector2(cw * 0.5f - 18, ch * 0.5f - 16)));

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

            float viewH = drawerH - 256f;
            // 内嵌切角科技装备仓底盘（带冰青细边，让徽章矩阵有清晰边界与层次感）
            var bayFrame = Ui.Skin(drawer, "dark", new Vector2(1018, viewH + 14f), new Vector2(0, -112f - viewH * 0.5f), 0.85f, null, "totemBay");
            bayFrame.rectTransform.anchorMin = bayFrame.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            bayFrame.raycastTarget = false;

            var view = Ui.Rect(drawer, "totemView");
            view.anchorMin = view.anchorMax = new Vector2(0.5f, 1f);
            view.pivot = new Vector2(0.5f, 1f);
            view.sizeDelta = new Vector2(1000, viewH);
            view.anchoredPosition = new Vector2(0, -112);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");

            const float cell = 176f, step = 192f;
            int minSlots = Mathf.Max(15, ((list.Count + 4) / 5) * 5);
            int rows = minSlots / 5;
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(1000, Mathf.Max(viewH, rows * step + 20f));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;

            for (int i = 0; i < minSlots; i++)
            {
                Vector2 cPos = new Vector2(((i % 5) - 2) * step, -100 - (i / 5) * step);
                if (i >= list.Count)
                {
                    var empty = Ui.Box(content, Vector2.one * (cell - 8f), cPos, Color.white, Art.Img("ui/slot_empty_tech"), "empty_" + i);
                    empty.type = Image.Type.Simple;
                    empty.rectTransform.anchorMin = empty.rectTransform.anchorMax = new Vector2(0.5f, 1f);
                    empty.raycastTarget = false;
                    continue;
                }
                var t = list[i];
                var tile = Ui.Rect(content, "totem_" + t.Id);
                tile.anchorMin = tile.anchorMax = new Vector2(0.5f, 1f);
                tile.sizeDelta = new Vector2(cell, cell);
                tile.anchoredPosition = cPos;
                bool sel = t.Id == _selectedTotemId;
                string slotSkin = MetaUi.TotemSlot(t.Rarity);
                var face = MetaUi.Slot(tile, slotSkin, cell - 4f, Vector2.zero);
                face.raycastTarget = true;
                if (sel)
                {
                    var selBox = Ui.Skin(tile, "forge_sel", new Vector2(cell + 8, cell + 8), Vector2.zero, 1f, null, "sel");
                    selBox.raycastTarget = false;
                }

                var tGlow = Ui.Box(tile, Vector2.one * 136f, new Vector2(0, 6), MetaUi.QualGlow(t.Rarity).A(0.30f), Art.SoftDot, "tGlow");
                tGlow.raycastTarget = false;
                Ui.Icon(tile, Meta.TotemIcon(t), 126, new Vector2(0, 6));
                // 左下高对比霓虹镶边部位角标
                var partPos = new Vector2(-cell * 0.5f + 31, -cell * 0.5f + 31);
                Ui.Box(tile, new Vector2(46, 46), partPos, Pal.Hex("48C8FF").A(0.85f), Art.RoundedSmall);
                var partBox = Ui.Box(tile, new Vector2(42, 42), partPos, Pal.Hex("0B1730"), Art.RoundedSmall);
                Ui.Icon(partBox.transform, Meta.Equips[t.Slot].Icon, 34, Vector2.zero);
                if (Meta.IsTotemEquipped(S, t.Id))
                {
                    var eqTag = Ui.Box(tile, new Vector2(68, 28), new Vector2(cell * 0.5f - 42, cell * 0.5f - 22), Pal.Hex("00C878"), Art.Pill);
                    Ui.Outlined(eqTag.transform, "已镶", 18, Color.white, Vector2.zero, new Vector2(68, 28), Pal.Hex("062818"), 1.3f);
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
            if (list.Count == 0)
            {
                var emptyBanner = Ui.Box(content, new Vector2(720, 62), new Vector2(0, -viewH * 0.48f), Pal.Hex("0D1A36").A(0.92f), Art.Pill);
                emptyBanner.rectTransform.anchorMin = emptyBanner.rectTransform.anchorMax = new Vector2(0.5f, 1f);
                Ui.Outlined(emptyBanner.transform, "暂无该部位神宠徽章 · 点击下方【寻宝】获取", 26, Pal.Hex("DCEEFF"),
                    Vector2.zero, new Vector2(700, 56), Ink, 1.4f);
            }

            // 抽屉底栏：三枚高对比彩色战术按钮（冰蓝部位筛选 / 熔岩金寻宝 / 翠绿或电青一键合成，彻底告别暗灰！）
            float barY = -drawerH + 106f;
            string filterText = _totemFilter < 0 ? "部位：全部" : $"部位：{Meta.Equips[_totemFilter].Name}";
            var filterBtn = Ui.Btn(drawer, filterText, new Vector2(284, 82), new Vector2(-336, barY), Pal.Azure, () =>
            {
                _totemFilter = _totemFilter >= Meta.Equips.Length - 1 ? -1 : _totemFilter + 1;
                Rebuild(false);
            }, 26);
            filterBtn.anchorMin = filterBtn.anchorMax = new Vector2(0.5f, 1f);

            var huntBtn = Ui.Btn(drawer, $"寻宝 ({S.Hammers})", new Vector2(296, 84), new Vector2(0, barY), Pal.Gold, () => SetShopSubTab(1), 30, "ic_hammer");
            huntBtn.anchorMin = huntBtn.anchorMax = new Vector2(0.5f, 1f);
            if (S.Hammers > 0) MetaUi.Dot(huntBtn, new Vector2(132, 33));

            bool canMerge = Meta.CanMergeAnyTotem(S);
            var mergeBtn = Ui.Btn(drawer, "一键合成", new Vector2(284, 82), new Vector2(336, barY), canMerge ? Pal.Green : Pal.Teal, () =>
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
            if (canMerge) MetaUi.Dot(mergeBtn, new Vector2(126, 33));
        }

        void BuildEquipDrawer(RectTransform drawer, float drawerH)
        {
            Action re = () => Rebuild(false);
            // 顶部：装备箱快捷开启横条（双行严格左对齐，单行不折行，彻底根除文字重叠）
            var boxRow = Ui.Rect(drawer, "gearBoxRow");
            boxRow.anchorMin = boxRow.anchorMax = new Vector2(0.5f, 1f);
            boxRow.anchoredPosition = new Vector2(0, -168);
            boxRow.sizeDelta = new Vector2(960, 118);
            Ui.Skin(boxRow, "row", new Vector2(960, 118), Vector2.zero, 1f);
            Ui.Icon(boxRow, "ic_gearbox", 86, new Vector2(-412, 1));
            Ui.SingleLine(Ui.Label(boxRow, $"五金工具箱 ×{S.GearBoxes}", 30, Pal.Hex("EAF2FF"), new Vector2(-58, 22), new Vector2(580, 38), TextAnchor.MiddleLeft, Fonts.Heavy), 22);
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
                Ui.SingleLine(Ui.Label(card, $"<color=#{MetaUi.QualInkHex(q)}>{Meta.QualityName[q]}</color>·{e.Name} Lv.{lv}", 23, Pal.Hex("EAF2FF"), new Vector2(46, 30), new Vector2(332, 30), TextAnchor.MiddleLeft, Fonts.Heavy), 17);
                Ui.SingleLine(Ui.Label(card, Meta.EquipText(i, lv, q), 20, Pal.Hex("00F57A"), new Vector2(46, 0), new Vector2(332, 28), TextAnchor.MiddleLeft, Fonts.Heavy), 16);
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
            var bayFrame = Ui.Skin(drawer, "dark", new Vector2(1018, viewH + 10f), new Vector2(0, -112f - viewH * 0.5f), 0.85f, null, "matBay");
            bayFrame.rectTransform.anchorMin = bayFrame.rectTransform.anchorMax = new Vector2(0.5f, 1f);
            bayFrame.raycastTarget = false;

            var view = Ui.Rect(drawer, "matView");
            view.anchorMin = view.anchorMax = new Vector2(0.5f, 1f);
            view.pivot = new Vector2(0.5f, 1f);
            view.sizeDelta = new Vector2(1000, viewH);
            view.anchoredPosition = new Vector2(0, -112);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");

            const float cell = 176f, step = 192f;
            int minSlots = Mathf.Max(15, ((items.Count + 4) / 5) * 5);
            int rows = minSlots / 5;
            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            content.sizeDelta = new Vector2(1000, Mathf.Max(viewH, rows * step + 24f));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.horizontal = false;
            sr.movementType = ScrollRect.MovementType.Clamped;

            for (int i = 0; i < minSlots; i++)
            {
                Vector2 mPos = new Vector2(((i % 5) - 2) * step, -98 - (i / 5) * step);
                if (i >= items.Count)
                {
                    var empty = Ui.Box(content, Vector2.one * (cell - 10f), mPos, Color.white, Art.Img("ui/slot_empty_tech"), "empty_" + i);
                    empty.type = Image.Type.Simple;
                    empty.rectTransform.anchorMin = empty.rectTransform.anchorMax = new Vector2(0.5f, 1f);
                    empty.raycastTarget = false;
                    continue;
                }
                var it = items[i];
                var tile = MetaUi.ItemTile(content, it, Vector2.zero, cell - 10f, false, Layer);
                tile.anchorMin = tile.anchorMax = new Vector2(0.5f, 1f);
                tile.anchoredPosition = mPos;
            }
        }

        // ---------------- 村委五建筑全景领地 ----------------

        struct FortBld
        {
            public string Name, Sub, Icon, Skin, AccentHex;
            public float X, Y, HitW, HitH, TagX, TagY;
            public bool Heroic;
            public FortBld(string name, string sub, float x, float y, float hw, float hh, float tx, float ty, string icon, string skin, string accent, bool heroic = false)
            {
                Name = name; Sub = sub; X = x; Y = y; HitW = hw; HitH = hh;
                TagX = tx; TagY = ty; Icon = icon; Skin = skin; AccentHex = accent; Heroic = heroic;
            }
        }

        // 对应 map_fort.jpg 五座独立 3/4 等轴测 04 风格村口建筑，整栋建筑轮廓均可点击触发对应功能
        static readonly FortBld[] Buildings =
        {
            new FortBld("档案室", "异星图鉴", 0.500f, 0.248f, 444f, 456f,  0f, -190f, "tab_codex",     "h_bond_pill",     "1FF088"),
            new FortBld("训练场", "民兵比武", 0.215f, 0.432f, 400f, 412f,  0f, -168f, "ic_medal",      "btn_orange_well", "FF7A38"),
            new FortBld("风云榜", "守村排行", 0.802f, 0.418f, 360f, 436f, -4f, -178f, "ic_rank_stage", "row_claim",       "FFD447", true),
            new FortBld("拦截点", "截获补给", 0.220f, 0.690f, 396f, 456f, 12f, -190f, "ic_cart",       "btn_purple_well", "B56BFF"),
            new FortBld("联防队", "巡逻挂机", 0.775f, 0.695f, 414f, 464f,  6f, -190f, "tab_idle",      "h_plaque",        "2CE0FF"),
        };

        void BuildFort(bool anim)
        {
            var size = Cover("map_fort", new Vector2(1080, 1920), Color.white, 0.5f);
            Shade(0.14f, 0.10f);
            bool dOpen = S.Cleared >= MetaUi.DailyUnlock, eOpen = S.Cleared >= MetaUi.EscortUnlock;

            for (int i = 0; i < Buildings.Length; i++)
            {
                var b = Buildings[i];
                var accent = Pal.Hex(b.AccentHex);
                bool locked = (i == 1 && !dOpen) || (i == 3 && !eOpen);
                var pos = new Vector2((b.X - 0.5f) * size.x, (0.5f - b.Y) * size.y);

                var c = Ui.Rect(_page, "bld" + i);
                c.anchoredPosition = pos;
                c.sizeDelta = new Vector2(b.HitW, b.HitH);

                // 建筑呼吸微光：与五座建筑各自霓虹色呼应，增强可交互实感且不遮挡建筑细节
                float baseA = locked ? 0.04f : (b.Heroic ? 0.15f : 0.08f);
                float pulseA = locked ? 0.02f : (b.Heroic ? 0.07f : 0.04f);
                float phase = i * 1.15f;
                var glow = Ui.Box(c, new Vector2(b.HitW * 0.74f, b.HitH * 0.62f), new Vector2(0f, 20f), accent.A(baseA), Art.SoftDot, "glow");
                Tween.Run(glow, 999f, k => glow.color = accent.A(baseA + pulseA * Mathf.Sin(k * 999f * 2.6f + phase)));

                // 建筑门檐铭牌：锚定在每栋建筑正门基座处，顶部菱形指示针指向建筑主体
                float pw = b.Heroic ? 252f : 232f;
                float ph = b.Heroic ? 76f : 72f;
                var tag = Ui.Rect(c, "tag");
                tag.anchoredPosition = new Vector2(b.TagX, b.TagY);
                tag.sizeDelta = new Vector2(pw, ph);

                var pinRim = Ui.Box(tag, new Vector2(16f, 16f), new Vector2(0f, ph * 0.5f + 5f), Pal.Hex("091120"), null, "pinRim");
                pinRim.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);
                var pinCore = Ui.Box(tag, new Vector2(10f, 10f), new Vector2(0f, ph * 0.5f + 5f), locked ? Pal.Hex("6E8299") : accent, null, "pinCore");
                pinCore.rectTransform.localRotation = Quaternion.Euler(0f, 0f, 45f);

                var plate = Ui.Skin(tag, locked ? "h_capsule" : b.Skin, new Vector2(pw, ph), Vector2.zero, -1f);
                if (locked) plate.color = new Color(0.82f, 0.86f, 0.92f, 0.92f);
                var ic = Ui.Icon(tag, b.Icon, b.Heroic ? 72f : 64f, new Vector2(-pw * 0.5f + 35f, 2f));
                if (locked) ic.color = new Color(0.75f, 0.80f, 0.88f, 1f);

                if (b.Heroic)
                    Ui.GradOutlined(tag, b.Name, 31, Pal.Hex("FFFBE0"), Pal.Hex("FFD458"), new Vector2(22f, 12f), new Vector2(166, 40), Pal.Hex("3E2206"), 2.5f);
                else
                    Ui.Outlined(tag, b.Name, 29, locked ? Pal.Hex("DCE6F2") : Paper, new Vector2(22f, 12f), new Vector2(154, 38), Ink, 2.0f);

                string sub = i == 1 && !dOpen ? $"第{MetaUi.DailyUnlock}关开放"
                    : i == 3 && !eOpen ? $"第{MetaUi.EscortUnlock}关开放"
                    : b.Sub;
                Color subCol = locked ? Pal.Hex("9EB2C8") : b.Heroic ? Pal.Hex("FFE28A") : Color.Lerp(accent, Color.white, 0.52f);
                Ui.Outlined(tag, sub, 19, subCol, new Vector2(22f, -16f), new Vector2(158, 26), Ink, 1.4f);

                bool dot = i == 0 ? Meta.CodexBadge(S) > 0
                    : i == 1 ? (dOpen && S.DailyTries < Meta.DailyTriesMax)
                    : i == 2 ? RankBadge()
                    : i == 3 ? (eOpen && S.EscortTries < Meta.EscortTriesMax)
                    : IdleBadge();
                if (dot) MetaUi.Dot(tag, new Vector2(pw * 0.5f - 8f, ph * 0.5f - 4f));

                if (i == 4)
                {
                    var r = Meta.IdleRewards(S, Meta.IdleHours(S, Profile.Now));
                    int copper = r.Get(Cur.Copper);
                    if (copper > 0)
                    {
                        var bub = Ui.Skin(c, "row_claim", new Vector2(186, 54), new Vector2(8f, 188f));
                        Ui.Icon(bub.transform, "ic_coins", 48, new Vector2(-62, 2));
                        Ui.Label(bub.transform, Ui.Num(copper), 26, Pal.Hex("FFC83D"), new Vector2(16, 0), new Vector2(124, 46), TextAnchor.MiddleCenter, Fonts.Heavy);
                        Tween.Run(bub, 999f, k => bub.rectTransform.anchoredPosition = new Vector2(8f, 186f + 5f * Mathf.Sin(k * 999f * 3f)));
                    }
                }

                // 整栋建筑全区域透明点击热区（覆盖屋顶、建筑主体、道具与门牌），点击建筑任意位置即触发对应功能
                var hit = Ui.Fill(c, new Color(0f, 0f, 0f, 0.001f), true, "buildingHit").GetComponent<Image>();
                hit.transform.SetAsLastSibling();
                int bi = i;
                Ui.Tap(hit, () => OnBuilding(bi), tag);
                if (anim) Tween.Pop(tag, 0.3f, 0.08f + i * 0.05f);
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
                Ui.Icon(wArtMask, wd.Art, 126, new Vector2(0, 8));
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
            Ui.SingleLine(Ui.Label(c, d.Name, 27, Pal.Hex("EAF2FF"), new Vector2(0, 92), new Vector2(216, 40), TextAnchor.MiddleCenter, Fonts.Heavy), 20);
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
