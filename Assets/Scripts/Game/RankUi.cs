using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>
    /// 旗舰级全屏排行榜系统（v2 像素级精雕重构版）：
    /// - 顶部：聚义荣光金殿穹顶 + 皇室暖金双折耳卷轴牌匾 + 冠亚季军立体荣耀高台（大尺寸威武好汉 + 手绘雕花称号牌 + 金章点赞）
    /// - 中部：无缝微拱鎏金青石顶檐 + 双层深海蓝内凹圆角槽（rank_well）+ 4~50 名奶油白立体榜卡（渐变立体金字名次 + 宝剑雕花头像框）
    /// - 底部：暖琥珀个人专属横幅 + 巨幅暖金光晕【进度奖励】宝箱
    /// - 底栏：左青蓝 3D 返回键 + 四榜席位（主线榜 / 战力榜 实时双榜 + 演武榜 / 劫纲榜 空间预留）
    /// </summary>
    public static class RankUi
    {
        static int _board = RankService.BoardStage;
        static float _savedScroll;
        static SaveData S => Profile.S;

        const float TabBarH = 148f;
        const float MeRowH = 142f;

        public static void Open(Transform layer, int board = -1, Action onClose = null)
        {
            if (board >= 0) { _board = board; _savedScroll = 0f; }
            bool again = layer.Find("modal_rank") != null;
            var old = layer.Find("modal_rank");
            if (old) UnityEngine.Object.DestroyImmediate(old.gameObject);

            var root = Ui.Rect(layer, "modal_rank");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            root.SetAsLastSibling();

            // 宽幅底衬遮罩（与外层面板 #2F5678 同色）
            Ui.Box(root, new Vector2(1280, 3200), Vector2.zero, Pal.Hex("2F5678"), Art.White, "backdrop").raycastTarget = true;

            float sp = Ui.Spare;
            float st = Ui.SafeTop;

            // 1. 顶部聚义荣光金殿穹顶背景（按屏宽铺满上半屏）
            float bgScale = Mathf.Max(Ui.W / 1080f, Ui.Height / 1920f);
            Vector2 bgSize = new Vector2(1080f * bgScale, 1920f * bgScale);
            var hall = Ui.Top(root, 0, bgSize.y * 0.48f, bgSize, "hallBg");
            var hallImg = hall.gameObject.AddComponent<Image>();
            hallImg.sprite = Art.Img("rank_hall_bg");
            hallImg.raycastTarget = false;

            // 顶部皇室暖金双折耳卷轴标题（严格避让微信右上角胶囊：宽 504px，右缘 x=+252）
            string boardTitle = _board == RankService.BoardPower ? "战力排行榜" : "主线排行榜";
            var hdr = Ui.Top(root, 0, st + 58f + sp * 0.02f, new Vector2(516, 108), "header");
            var ban = Ui.Icon(hdr, "ui/rank_scroll_hdr", 516, Vector2.zero, "ribbon");
            ban.preserveAspect = true;
            Ui.GradOutlined(hdr, boardTitle, 42, Color.white, Pal.Hex("FFF0B8"),
                new Vector2(0, 5f), new Vector2(400, 66), Pal.Hex("6E3B08"), 3.2f);

            // 2. 高台与中部深海青蓝榜单区的黄金腰线
            float panelTopY = st + 664f + sp * 0.22f;

            // 先建高台容器（位于微拱顶檐下层，让微拱顶檐自然压住三座高台底脚，严丝合缝如参考图！）
            var stage = Ui.Rect(root, "podiumStage");
            stage.anchorMin = Vector2.zero;
            stage.anchorMax = Vector2.one;
            stage.offsetMin = stage.offsetMax = Vector2.zero;

            // 3. 中下半屏双层深海蓝容器（外层 #2F5678 + 微拱鎏金顶檐无缝叠合 + 内层 rank_well 圆角暗槽）
            var bodyFill = Ui.Rect(root, "listBody");
            bodyFill.anchorMin = Vector2.zero;
            bodyFill.anchorMax = Vector2.one;
            bodyFill.offsetMin = new Vector2(-100f, TabBarH - 8f);
            // 顶边定在 panelTopY + 76，而 arch 覆盖 [panelTopY, panelTopY + 112]，重叠 36px 保证 0 缝隙！
            bodyFill.offsetMax = new Vector2(100f, -(panelTopY + 76f));
            var bodyImg = bodyFill.gameObject.AddComponent<Image>();
            bodyImg.color = Pal.Hex("2F5678");
            bodyImg.sprite = Art.White;
            bodyImg.raycastTarget = true;

            var arch = Ui.Top(root, 0, panelTopY + 56f, new Vector2(1080, 112), "arch");
            var archImg = arch.gameObject.AddComponent<Image>();
            archImg.sprite = Art.Img("ui/rank_arch");
            archImg.raycastTarget = false;

            // 参考图同款内凹深蓝大圆角槽底（包住滚动列表与个人底栏，左右留出 26px 立体外框边）
            float wellTopInset = panelTopY + 62f;
            float wellBotInset = TabBarH + 16f;
            var wellRt = Ui.Rect(root, "listWell");
            wellRt.anchorMin = Vector2.zero;
            wellRt.anchorMax = Vector2.one;
            wellRt.offsetMin = new Vector2(24f, wellBotInset);
            wellRt.offsetMax = new Vector2(-24f, -wellTopInset);
            var wellImg = wellRt.gameObject.AddComponent<Image>();
            wellImg.sprite = Art.Skin("rank_well");
            wellImg.type = Image.Type.Sliced;
            wellImg.raycastTarget = false;

            // 榜单滚动视口（嵌于内凹槽内部上方，底部留给「我」专属卡）
            float listTopInset = wellTopInset + 16f;
            float listBotInset = wellBotInset + MeRowH + 22f;
            var view = Ui.Rect(root, "scrollView");
            view.anchorMin = Vector2.zero;
            view.anchorMax = Vector2.one;
            view.offsetMin = new Vector2(36f, listBotInset);
            view.offsetMax = new Vector2(-36f, -listTopInset);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0f, 0f, 0f, 0.001f), true, "dragHit");

            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);

            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.viewport = view;
            sr.horizontal = false;
            sr.vertical = true;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.elasticity = 0.08f;
            sr.scrollSensitivity = 42f;

            // 底部「我」专属容器（嵌在深蓝凹槽底端）
            var meSlot = Ui.Bottom(root, 0, wellBotInset + MeRowH * 0.5f + 10f, new Vector2(996, MeRowH), "meSlot");

            // 4. 最底部四榜导航栏
            BuildBottomTabs(root, layer, onClose);

            RankService.FetchBoard(_board, false, (entries, myRank) =>
            {
                if (!root) return;
                PopulateBoard(root, layer, stage, content, view, meSlot, entries, myRank, onClose);
            });

            var watcher = root.gameObject.AddComponent<RankSyncWatcher>();
            watcher.OnSynced = () =>
            {
                if (!root) return;
                RankService.FetchBoard(_board, true, (entries, myRank) =>
                {
                    if (!root) return;
                    PopulateBoard(root, layer, stage, content, view, meSlot, entries, myRank, onClose);
                });
            };

            if (!again)
            {
                Sfx.Play(Snd.Open, 0.7f);
                var cg = root.gameObject.AddComponent<CanvasGroup>();
                Tween.Fade(cg, 0f, 1f, 0.16f);
            }
        }

        sealed class RankSyncWatcher : MonoBehaviour
        {
            public Action OnSynced;
            void OnEnable() => RankService.ProfileSynced += HandleSync;
            void OnDisable() => RankService.ProfileSynced -= HandleSync;
            void HandleSync() => OnSynced?.Invoke();
        }

        static void PopulateBoard(RectTransform root, Transform layer, RectTransform stage, RectTransform content,
            RectTransform view, RectTransform meSlot, List<RankService.Entry> entries, int myRank, Action onClose)
        {
            while (stage.childCount > 0) UnityEngine.Object.DestroyImmediate(stage.GetChild(0).gameObject);
            while (content.childCount > 0) UnityEngine.Object.DestroyImmediate(content.GetChild(0).gameObject);
            while (meSlot.childCount > 0) UnityEngine.Object.DestroyImmediate(meSlot.GetChild(0).gameObject);

            float sp = Ui.Spare;
            float panelTopY = Ui.SafeTop + 664f + sp * 0.22f;

            // 1. 冠、亚、季军三座荣耀高台（先画 2、3 再画 1，让中央冠军威压全场；空位写虚位以待）
            int[] podiumOrder = { 1, 2, 0 };
            foreach (int idx in podiumOrder)
            {
                if (idx >= entries.Count)
                    BuildPodiumVacant(stage, idx + 1, panelTopY);
                else
                    BuildPodiumOne(stage, layer, entries[idx], idx + 1, panelTopY, () => RefreshInPlace(layer, onClose));
            }

            // 2. 第 4 ~ 50 名奶油白圆角榜卡列表
            const float rowH = 140f;
            const float gap = 14f;
            const float step = rowH + gap;
            int listCount = Mathf.Max(0, entries.Count - 3);
            float viewH = Mathf.Max(260f, view.rect.height);
            float totalH = Mathf.Max(viewH + 4f, listCount * step + 12f);
            content.sizeDelta = new Vector2(996, totalH);

            for (int i = 3; i < entries.Count; i++)
            {
                int rk = i + 1;
                float cy = -(6f + (i - 3) * step + rowH * 0.5f);
                BuildListRow(content, layer, entries[i], rk, cy, () => RefreshInPlace(layer, onClose));
            }
            if (listCount == 0)
            {
                string hint = myRank < 0 ? "榜单暂时连不上，过会儿再来" : "还没有其他村民上榜";
                var hintTxt = Ui.Label(content, hint, 28, Pal.Hex("D6E6F4"),
                    new Vector2(0f, -88f), new Vector2(720, 52), TextAnchor.MiddleCenter, Fonts.Bold, "emptyHint");
                var hintRt = hintTxt.rectTransform;
                hintRt.anchorMin = hintRt.anchorMax = new Vector2(0.5f, 1f);
            }
            content.anchoredPosition = new Vector2(0f, Mathf.Clamp(_savedScroll, 0f, Mathf.Max(0f, totalH - viewH)));

            // 3. 底部个人排名横幅 + 大光晕进度奖励宝箱
            RankService.Entry prevEntry = null;
            bool chasingTail = false;
            if (myRank > 1 && myRank - 2 >= 0 && myRank - 2 < entries.Count)
                prevEntry = entries[myRank - 2];
            else if (myRank > entries.Count && entries.Count > 0)
            {
                prevEntry = entries[entries.Count - 1];
                chasingTail = true;
            }
            int others = 0;
            for (int i = 0; i < entries.Count; i++)
                if (!entries[i].IsMe) others++;
            BuildMyBar(root, meSlot, layer, RankService.BuildMyEntry(), myRank, prevEntry, others, chasingTail, () =>
            {
                _savedScroll = content ? content.anchoredPosition.y : 0f;
                Open(layer, _board, onClose);
            });
        }

        static void RefreshInPlace(Transform layer, Action onClose)
        {
            var cur = layer.Find("modal_rank/scrollView/content") as RectTransform;
            if (cur) _savedScroll = cur.anchoredPosition.y;
            Open(layer, _board, onClose);
        }

        static void BuildPodiumOne(RectTransform stage, Transform layer, RankService.Entry e, int rank, float panelTopY, Action refresh)
        {
            bool isFirst = rank == 1;
            float x = rank == 1 ? 0f : rank == 2 ? -338f : 338f;
            Vector2 podSz = isFirst ? new Vector2(364, 244) : rank == 2 ? new Vector2(316, 206) : new Vector2(316, 192);
            // 拱檐实心线在中点为 panelTopY+20，两侧为 panelTopY+44；高台底沿探入拱檐下 22px，文字全部稳居高台中上部！
            float archSolidAtX = panelTopY + (isFirst ? 20f : 38f);
            float podBottomY = archSolidAtX + 24f;
            float podCenterY = podBottomY - podSz.y * 0.5f;

            var slot = Ui.Top(stage, x, podCenterY, podSz, "top" + rank);

            // 背后荣耀圣光环
            if (isFirst)
            {
                var halo = Ui.Box(slot, new Vector2(440, 440), new Vector2(0, 236), Pal.Hex("FFE27A").A(0.42f), Art.SoftDot, "halo");
                Tween.Run(halo, 999f, k =>
                {
                    float t = k * 999f;
                    halo.transform.localScale = Vector3.one * (1f + 0.06f * Mathf.Sin(t * 2.4f));
                    halo.color = Pal.Hex("FFE27A").A(0.34f + 0.10f * Mathf.Sin(t * 2.4f));
                });
            }
            else
            {
                Ui.Box(slot, new Vector2(300, 280), new Vector2(0, 186),
                    (rank == 2 ? Pal.Hex("A8D8FF") : Pal.Hex("FFD2A2")).A(0.28f), Art.SoftDot, "subHalo");
            }

            // 高台主体贴图
            var pod = Ui.Icon(slot, "ui/rank_podium_" + rank, podSz.x, Vector2.zero, "pedestal");
            pod.rectTransform.sizeDelta = podSz;
            pod.preserveAspect = false;

            // 大尺寸威武好汉立绘（脚踩台面中心，比例向参考图对齐，绝不显小！）
            float deckTopLocalY = podSz.y * 0.5f - 24f;
            var hd = Defs.Hero(e.Hero);
            float heroDraw = isFirst ? 342f : 284f;
            float standY = deckTopLocalY + heroDraw * 0.40f;
            bool framed = Art.Animated(hd.Art);
            if (framed && AnimMeta.Info.TryGetValue(hd.Art, out var meta))
            {
                float targetBody = isFirst ? 292f : 242f;
                heroDraw = targetBody / Mathf.Max(0.58f, meta.Body);
                standY = deckTopLocalY - heroDraw * (meta.Foot - 0.5f);
            }

            Ui.Box(slot, new Vector2(isFirst ? 204 : 172, 38), new Vector2(0, deckTopLocalY + 2f),
                new Color(0.08f, 0.04f, 0.02f, 0.36f), Art.GroundShadow, "shadow");

            var heroImg = Ui.Icon(slot, hd.Art, heroDraw, new Vector2(0, standY), "hero");
            if (framed)
            {
                string key = hd.Art;
                Art.Late(heroImg, key, () =>
                {
                    var fr = Art.Frames(key);
                    if (fr != null && fr.Length > 0 && heroImg) heroImg.sprite = fr[0];
                });
            }
            float bobPhase = rank * 1.1f;
            float baseHeroY = standY;
            Tween.Run(heroImg, 999f, k => heroImg.rectTransform.anchoredPosition = new Vector2(0, baseHeroY + 4f * Mathf.Sin(k * 999f * 2.3f + bobPhase)));

            // 头顶美术级雕花称号徽章
            var (titleTxt, titleTier) = Meta.HonorTitle(rank, e.Cleared, e.Power);
            float badgeY = deckTopLocalY + (isFirst ? 302f : 252f);
            BuildTitleBadge(slot, titleTxt, titleTier, new Vector2(0, badgeY), isFirst ? 0.98f : 0.90f);

            // 高台左上压角金/银/铜展翼名次奖章
            float medalSz = isFirst ? 86f : 76f;
            Vector2 medalPos = new Vector2(-podSz.x * 0.5f + (isFirst ? 48f : 42f), podSz.y * 0.5f - (isFirst ? 60f : 56f));
            var medal = Ui.Icon(slot, "ui/rank_medal_" + rank, medalSz, medalPos, "medal");
            Color medalEdge = rank == 1 ? Pal.Hex("5C3204") : rank == 2 ? Pal.Hex("1A3554") : Pal.Hex("4A250E");
            Ui.GradOutlined(medal.transform, rank.ToString(), isFirst ? 36 : 31, Color.white, Pal.Hex("FFEFA8"),
                new Vector2(0, -1), new Vector2(70, 50), medalEdge, 2.6f);

            // 台面铭牌内的玩家头像小徽章（若有微信头像）+ 玩家昵称 + 成绩
            Color plaqueEdge = rank == 1 ? Pal.Hex("481014") : rank == 2 ? Pal.Hex("162A44") : Pal.Hex("3C1E0E");
            bool hasAv = !string.IsNullOrEmpty(e.Avatar);
            float textCenterX = hasAv ? 34f : 18f;
            float nameY = isFirst ? 12f : 10f;
            float scoreY = isFirst ? -32f : -28f;
            if (hasAv)
            {
                float miniSz = isFirst ? 42f : 36f;
                float avX = -podSz.x * 0.5f + (isFirst ? 82f : 72f);
                var miniWrap = Ui.Rect(slot, "podiumWxAv");
                miniWrap.anchoredPosition = new Vector2(avX, nameY);
                miniWrap.sizeDelta = new Vector2(miniSz + 6f, miniSz + 6f);
                Ui.Box(miniWrap, new Vector2(miniSz + 6f, miniSz + 6f), Vector2.zero, Pal.Gold, Art.RoundedSmall, "rim");
                var miniMask = Ui.Rect(miniWrap, "m");
                miniMask.sizeDelta = new Vector2(miniSz, miniSz);
                miniMask.gameObject.AddComponent<RectMask2D>();
                var rawImg = Ui.Box(miniMask, new Vector2(miniSz, miniSz), Vector2.zero, Pal.Hex("24486A"), Art.White, "pic");
                RankService.LoadAvatar(e.Avatar, spr =>
                {
                    if (spr != null && rawImg != null)
                    {
                        rawImg.sprite = spr;
                        rawImg.color = Color.white;
                    }
                });
            }
            Ui.SingleLine(Ui.Outlined(slot, Truncate(e.Name, hasAv ? 6 : 7), isFirst ? 27 : 24, e.IsMe ? Pal.Hex("FFF284") : Color.white,
                new Vector2(textCenterX, nameY), new Vector2(podSz.x - (hasAv ? 116f : 84f), 40), plaqueEdge, 2.2f), 18);
            Ui.SingleLine(Ui.GradOutlined(slot, ScoreLabel(e), isFirst ? 32 : 28, Color.white, Pal.Hex("FFE68E"),
                new Vector2(18f, scoreY), new Vector2(podSz.x - 48f, 44), plaqueEdge, 2.6f), 20);

            // 点击高台或好汉查看该名强者的出战阵容名片
            var inspectHit = Ui.Box(slot, new Vector2(podSz.x - 16f, podSz.y + 260f), new Vector2(0, 116f), new Color(0, 0, 0, 0), Art.White, "inspectHit");
            inspectHit.raycastTarget = true;
            Ui.Tap(inspectHit, () => ShowPlayerCard(layer, e, rank, refresh), slot, false);

            // 高台右上侧立体金圆点赞钮 + 点赞数字
            Vector2 likePos = new Vector2(podSz.x * 0.5f - 40f, deckTopLocalY + 34f);
            BuildLikeBtn(slot, e, likePos, isFirst ? 76f : 68f, true, refresh);
        }

        static void BuildPodiumVacant(RectTransform stage, int rank, float panelTopY)
        {
            bool isFirst = rank == 1;
            float x = rank == 1 ? 0f : rank == 2 ? -338f : 338f;
            Vector2 podSz = isFirst ? new Vector2(364, 244) : rank == 2 ? new Vector2(316, 206) : new Vector2(316, 192);
            float archSolidAtX = panelTopY + (isFirst ? 20f : 38f);
            float podBottomY = archSolidAtX + 24f;
            float podCenterY = podBottomY - podSz.y * 0.5f;

            var slot = Ui.Top(stage, x, podCenterY, podSz, "top" + rank);
            var pod = Ui.Icon(slot, "ui/rank_podium_" + rank, podSz.x, Vector2.zero, "pedestal");
            pod.rectTransform.sizeDelta = podSz;
            pod.preserveAspect = false;
            pod.color = new Color(1f, 1f, 1f, 0.42f);

            Color plaqueEdge = rank == 1 ? Pal.Hex("481014") : rank == 2 ? Pal.Hex("162A44") : Pal.Hex("3C1E0E");
            Ui.Outlined(slot, "虚位以待", isFirst ? 28 : 24, new Color(1f, 1f, 1f, 0.78f),
                new Vector2(18f, isFirst ? -4f : -2f), new Vector2(podSz.x - 84f, 44), plaqueEdge, 2.0f);
        }

        static void BuildListRow(RectTransform parent, Transform layer, RankService.Entry e, int rank, float cy, Action refresh)
        {
            var row = Ui.Rect(parent, "row_" + rank);
            row.anchorMin = row.anchorMax = new Vector2(0.5f, 1f);
            row.sizeDelta = new Vector2(968, 140);
            row.anchoredPosition = new Vector2(0f, cy);

            string rowSkin = e.IsMe ? "rank_row_me" : "rank_row";
            var bg = Ui.Skin(row, rowSkin, new Vector2(968, 140), Vector2.zero, 1f, null, "card");
            Ui.Tap(bg, () => ShowPlayerCard(layer, e, rank, refresh), row, false);

            // 1) 左侧立体金黄双色渐变大名次（4~6 名醒目金琥珀，7+ 名温润象牙白，复刻参考图层次！）
            if (rank <= 6)
            {
                Ui.GradOutlined(row, rank.ToString(), 52, Pal.Hex("FFF699"), Pal.Hex("F2AD24"),
                    new Vector2(-412f, 2f), new Vector2(112, 80), Pal.Hex("543208"), 3.2f);
            }
            else
            {
                Ui.GradOutlined(row, rank.ToString(), rank >= 100 ? 40 : 48, Color.white, Pal.Hex("EAE0CE"),
                    new Vector2(-412f, 2f), new Vector2(112, 76), Pal.Hex("4E4236"), 2.8f);
            }

            // 2) 手绘宝剑雕花头像框（优先展示微信真实头像，未授权回退最强好汉立绘）
            BuildOrnateAvatar(row, e.Hero, e.Avatar, rank <= 6 || e.Cleared >= 36, new Vector2(-288f, 2f), 116f);

            // 3) 性别徽记 + 深棕粗体昵称 + 下方美术级雕花称号徽章
            string genderPrefix = e.Gender == 2 ? "<color=#FF6EA8>♀</color>" : e.Gender == 1 ? "<color=#3B9EFF>♂</color>" : "";
            Ui.SingleLine(Ui.Label(row, genderPrefix + Truncate(e.Name, 8), 29, Pal.Hex("5A473A"),
                new Vector2(-58f, 30f), new Vector2(304, 42), TextAnchor.MiddleLeft, Fonts.Heavy, "name"), 20);

            var (titleTxt, titleTier) = Meta.HonorTitle(rank, e.Cleared, e.Power);
            BuildTitleBadge(row, titleTxt, titleTier, new Vector2(-114f, -22f), 0.90f);

            // 4) 中右醒目单一主成绩大字（去掉底下零碎副字，与参考图一样清爽高对比！）
            Ui.Label(row, ScoreLabel(e), 34, Pal.Hex("4D3D30"),
                new Vector2(204f, 2f), new Vector2(246, 52), TextAnchor.MiddleCenter, Fonts.Heavy, "score");

            // 5) 最右侧金色点赞勋章 + 获赞数
            BuildLikeBtn(row, e, new Vector2(404f, 10f), 74f, false, refresh);
        }

        static void BuildMyBar(RectTransform modalRoot, RectTransform meSlot, Transform layer, RankService.Entry me, int myRank,
            RankService.Entry prev, int others, bool chasingTail, Action refresh)
        {
            Ui.Skin(meSlot, "rank_row_me", new Vector2(968, MeRowH), Vector2.zero, 1f, null, "meBg");

            // 左侧我的排名（前 3 挂奖章，其余醒目渐变金字；拉不到榜时用横线，不冒充名次）
            if (myRank >= 1 && myRank <= 3)
            {
                var m = Ui.Icon(meSlot, "ui/rank_medal_" + myRank, 82, new Vector2(-412f, 2f), "myMedal");
                Ui.GradOutlined(m.transform, myRank.ToString(), 32, Color.white, Pal.Hex("FFEFA8"),
                    new Vector2(0, -1), new Vector2(64, 46), Pal.Hex("4E2A06"), 2.4f);
            }
            else if (myRank <= 0)
            {
                Ui.GradOutlined(meSlot, "—", 46, Pal.Hex("FFF699"), Pal.Hex("F2AD24"),
                    new Vector2(-412f, 2f), new Vector2(114, 72), Pal.Hex("543208"), 3.0f);
            }
            else
            {
                string rkStr = myRank > 999 ? "999+" : myRank.ToString();
                Ui.GradOutlined(meSlot, rkStr, myRank >= 100 ? 36 : 46, Pal.Hex("FFF699"), Pal.Hex("F2AD24"),
                    new Vector2(-412f, 2f), new Vector2(114, 72), Pal.Hex("543208"), 3.0f);
            }

            // 个人金翼雕花头像框（优先展示微信真实头像；未授权时微信环境下支持一键原生授权同步！）
            var av = Ui.Rect(meSlot, "myAvatar");
            av.anchoredPosition = new Vector2(-288f, 2f);
            av.sizeDelta = new Vector2(114, 114);
            var mask = Ui.Rect(av, "mask");
            mask.sizeDelta = new Vector2(74, 78);
            mask.anchoredPosition = new Vector2(0f, -4f);
            mask.gameObject.AddComponent<RectMask2D>();
            Ui.Box(mask, new Vector2(82, 86), Vector2.zero, Pal.Hex("234466"), Art.White);
            var fallbackLord = Ui.Icon(mask, "lord_songjiang", 156, new Vector2(0, -32));
            if (!string.IsNullOrEmpty(me.Avatar))
            {
                RankService.LoadAvatar(me.Avatar, spr =>
                {
                    if (spr == null || !mask) return;
                    if (fallbackLord) fallbackLord.gameObject.SetActive(false);
                    var wxPic = Ui.Box(mask, new Vector2(78, 82), Vector2.zero, Color.white, spr, "wxAv");
                    wxPic.preserveAspect = true;
                });
            }
            var avFrame = Ui.Icon(av, "ui/rank_av_gold", 116, Vector2.zero, "frame");
            bool needDySync = DouyinBridge.IsDouyin && !RankService.HasWeChatProfile;
            bool needWxSync = !DouyinBridge.IsDouyin && DouyinBridge.IsWeChat && !RankService.HasWeChatProfile;
            bool needSocialSync = needDySync || needWxSync;

            if (needDySync)
            {
                Action<DouyinBridge.WxUserPayload> onDyOk = u =>
                {
                    Sfx.Play(Snd.Coin);
                    RankService.ApplyWeChatUser(u);
                    Ui.Toast("已同步抖音名号：" + RankService.MyName, 240f);
                };
                Action<string> onDyFail = _ => ShowRenameModal(layer, refresh);
                DouyinBridge.BindDouyinUserProfileGesture(av, onDyOk, onDyFail);
                Ui.Tap(avFrame, () => DouyinBridge.RequestDouyinUserProfile(onDyOk, onDyFail), av);
            }
            else
            {
                Ui.Tap(avFrame, () => ShowRenameModal(layer, refresh), av);
            }

            if (needWxSync)
            {
                // 微信尚未同步头像昵称时，在头像框正上方挂透明原生 UserInfoButton：点一下直接弹微信官方授权！
                DouyinBridge.BindWeChatUserInfoButton(av, modalRoot, layer,
                    u =>
                    {
                        Sfx.Play(Snd.Coin);
                        RankService.ApplyWeChatUser(u);
                        Ui.Toast("已同步微信名号：" + RankService.MyName, 240f);
                    },
                    _ => ShowRenameModal(layer, refresh));
            }

            // 中部醒目个人进度 + 精炼追赶目标（清爽两行，绝不拥挤）
            string myMain = _board == RankService.BoardPower
                ? $"{Truncate(me.Name, 5)} · 战力 {Ui.Num(me.Power)}"
                : (me.Cleared > 0 ? $"{Truncate(me.Name, 5)} · 第{me.Cleared}关" : $"{Truncate(me.Name, 5)} · 第1关前");

            Ui.SingleLine(Ui.Label(meSlot, myMain, 31, Pal.Hex("4A3219"),
                new Vector2(-18f, 18f), new Vector2(392, 46), TextAnchor.MiddleLeft, Fonts.Heavy), 21);

            string chaseTxt;
            if (needDySync)
                chaseTxt = "点击左侧头像 · 同步抖音头像与昵称";
            else if (needWxSync)
                chaseTxt = "点击左侧头像 · 同步微信头像与昵称";
            else if (myRank == 1 && others > 0)
                chaseTxt = $"{Truncate(me.Name, 7)} · 十里八乡总榜首";
            else if (myRank == 1)
                chaseTxt = me.Cleared > 0 ? "榜上还只有你一人 · 快邀好友比拼" : "通关主线后，冲刺全村榜首";
            else if (myRank <= 0)
                chaseTxt = "榜单暂时连不上 · 本地进度已保留";
            else if (prev != null)
            {
                string goal = chasingTail ? $"挤进前{Mathf.Max(1, others)}名" : $"升至第{myRank - 1}名";
                if (_board == RankService.BoardPower)
                    chaseTxt = $"差 {Ui.Num(Mathf.Max(1, prev.Power - me.Power + 1))} 战力{goal}";
                else
                    chaseTxt = me.Cleared < prev.Cleared
                        ? $"再闯 {Mathf.Max(1, prev.Cleared - me.Cleared)} 关{goal}"
                        : $"再夺 {Mathf.Max(1, prev.Stars - me.Stars + 1)} 星{goal}";
            }
            else
                chaseTxt = DouyinBridge.IsDouyin ? "点击左侧头像可同步抖音或修改名号" : "点击左侧头像可同步微信或修改名号";

            Ui.SingleLine(Ui.Label(meSlot, chaseTxt, 22, needSocialSync ? Pal.Hex("1D7A3A") : Pal.Hex("7C5526"),
                new Vector2(-18f, -22f), new Vector2(400, 32), TextAnchor.MiddleLeft, Fonts.Bold), 17);

            // 右侧大范围暖金放射光晕 + 发光宝箱【进度奖励】（完全还原参考图右下高光宝箱！）
            var chestSlot = Ui.Rect(meSlot, "rewardBtn");
            chestSlot.anchoredPosition = new Vector2(368f, 4f);
            chestSlot.sizeDelta = new Vector2(172, 130);

            int readyCnt = Meta.RankRewardBadge(S);
            var outerGlow = Ui.Box(chestSlot, new Vector2(196, 152), new Vector2(0, 6),
                Pal.Hex("FFA822").A(readyCnt > 0 ? 0.56f : 0.34f), Art.SoftDot, "outerGlow");
            Ui.Box(chestSlot, new Vector2(124, 112), new Vector2(0, 12), Pal.Hex("FFF2A6").A(0.42f), Art.SoftDot, "innerGlow");
            var chestIc = Ui.Icon(chestSlot, "ic_rank_chest", 98, new Vector2(0, 14), "chest");
            Ui.GradOutlined(chestSlot, "进度奖励", 25, Color.white, Pal.Hex("FFEBA4"),
                new Vector2(0, -40), new Vector2(160, 36), Pal.Hex("4A2806"), 2.4f);

            if (readyCnt > 0)
            {
                MetaUi.Dot(chestSlot, new Vector2(42, 44));
                Tween.Run(chestIc, 999f, k =>
                {
                    float t = k * 999f;
                    chestIc.rectTransform.localRotation = Quaternion.Euler(0, 0, 6.5f * Mathf.Sin(t * 5.8f));
                    outerGlow.transform.localScale = Vector3.one * (1f + 0.12f * Mathf.Sin(t * 4.2f));
                });
            }
            var chestHit = Ui.Box(chestSlot, new Vector2(172, 130), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            chestHit.raycastTarget = true;
            Ui.Tap(chestHit, () => ShowProgressRewards(layer, refresh), chestSlot);
        }

        static void BuildBottomTabs(RectTransform root, Transform layer, Action onClose)
        {
            var bar = Ui.Rect(root, "rankTabs");
            bar.anchorMin = bar.anchorMax = new Vector2(0.5f, 0f);
            bar.pivot = new Vector2(0.5f, 0.5f);
            bar.sizeDelta = new Vector2(1080, TabBarH);
            bar.anchoredPosition = new Vector2(0f, TabBarH * 0.5f);

            float halfH = TabBarH * 0.5f;
            float extDown = Ui.SafeBottom + 48f;
            var under = Ui.Box(bar, new Vector2(1280, TabBarH + extDown), new Vector2(0, -extDown * 0.5f), Pal.Hex("234360"), Art.White, "bg");
            under.raycastTarget = true;

            // 顶沿冷铁铆钉锯齿压边（与参考图底部导航栏压边完全一致）
            Ui.Box(bar, new Vector2(1280, 7), new Vector2(0, halfH - 3.5f), Pal.Hex("3E688E"), Art.White);
            Ui.Box(bar, new Vector2(1280, 3), new Vector2(0, halfH + 0.5f), Pal.Hex("14283C"), Art.White);
            for (int i = 0; i < 24; i++)
            {
                var cog = Ui.Box(bar, new Vector2(12, 12), new Vector2((i - 11.5f) * 48f, halfH - 3.5f), Pal.Hex("3E688E"), Art.RoundedSmall);
                cog.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            }

            // 左下 3D 圆角青蓝左箭头返回键
            var back = Ui.Icon(bar, "ui/forge_back", 132, new Vector2(-436f, -2f), "back");
            Ui.Tap(back, () =>
            {
                Sfx.Play(Snd.Close, 0.6f);
                var m = layer.Find("modal_rank");
                if (m) UnityEngine.Object.Destroy(m.gameObject);
                onClose?.Invoke();
            }, back.transform, true);

            // 右侧四榜席位：主线榜（实装）、战力榜（实装）、演武榜（预留）、劫纲榜（预留）
            (string Name, string Icon, int Id, bool Ready, string PreviewTip)[] tabs =
            {
                ("主线榜", "ic_rank_stage",  RankService.BoardStage,  true,  null),
                ("战力榜", "ic_rank_power",  RankService.BoardPower,  true,  null),
                ("比武榜", "ic_rank_arena",  RankService.BoardArena,  false, "【比武榜】席位已预留 · 民兵新赛季开启"),
                ("拦截榜", "ic_rank_escort", RankService.BoardEscort, false, "【拦截榜】席位已预留 · 补给新赛季开启"),
            };

            for (int i = 0; i < tabs.Length; i++)
            {
                var tb = tabs[i];
                bool on = tb.Ready && _board == tb.Id;
                float tx = -212f + i * 204f;
                var slot = Ui.Rect(bar, "tab_" + i);
                slot.anchoredPosition = new Vector2(tx, 0f);
                slot.sizeDelta = new Vector2(188, TabBarH);

                var hit = Ui.Box(slot, new Vector2(188, TabBarH), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
                hit.raycastTarget = true;

                if (on)
                {
                    Ui.Box(slot, new Vector2(176, 132), new Vector2(0, 12), Pal.Hex("68D4FF").A(0.28f), Art.SoftDot, "glow");
                    Ui.Icon(slot, "ui/forge_tab_on", 118, new Vector2(0, 15), "plate");
                }
                else
                {
                    var offPlate = Ui.Icon(slot, "ui/forge_tab_off", 102, new Vector2(0, 15), "plate");
                    offPlate.color = new Color(0.76f, 0.86f, 0.96f, tb.Ready ? 0.86f : 0.56f);
                }

                var ic = Ui.Icon(slot, tb.Icon, on ? 82 : 66, new Vector2(0, on ? 19 : 16), "icon");
                if (!tb.Ready)
                {
                    ic.color = new Color(0.56f, 0.68f, 0.82f, 0.68f);
                    // 用精致小锁章标示预留席位，彻底杜绝窄胶囊文字换行！
                    Ui.Icon(slot, "ic_lock", 30, new Vector2(34f, 40f), "lock");
                }
                else if (!on)
                {
                    ic.color = new Color(0.80f, 0.90f, 1f, 0.88f);
                }

                if (on)
                {
                    Ui.GradOutlined(slot, tb.Name, 29, Color.white, Pal.Hex("FFE98E"),
                        new Vector2(0, -46), new Vector2(176, 38), Pal.Hex("0E2034"), 2.4f);
                }
                else
                {
                    Color txtCol = tb.Ready ? Pal.Hex("B8D0E8") : Pal.Hex("7E9AB6");
                    Ui.Outlined(slot, tb.Name, 26, txtCol, new Vector2(0, -46), new Vector2(176, 36), Pal.Hex("0F2032"), 1.6f);
                }

                int targetBoard = tb.Id;
                bool isReady = tb.Ready;
                string tip = tb.PreviewTip;
                Ui.Tap(hit, () =>
                {
                    if (!isReady)
                    {
                        Sfx.Play(Snd.Tap, 0.6f);
                        Ui.Toast(tip, -420f);
                        return;
                    }
                    if (_board == targetBoard) return;
                    Sfx.Play(Snd.Swap);
                    Open(layer, targetBoard, onClose);
                }, slot, true);
            }
        }

        static void BuildTitleBadge(Transform parent, string title, int tier, Vector2 pos, float scale = 1f)
        {
            var b = Ui.Rect(parent, "titleBadge");
            b.anchoredPosition = pos;
            float w = Mathf.Clamp(title.Length * 30f + 118f, 224f, 268f);
            b.sizeDelta = new Vector2(w, 68f);
            b.localScale = Vector3.one * scale;
            string skin = "rank_badge_" + Mathf.Clamp(tier, 1, 4);
            Ui.Skin(b, skin, new Vector2(w, 68f), Vector2.zero, 68f / 84f);

            Color edge = tier == 1 ? Pal.Hex("5A1408") : tier == 2 ? Pal.Hex("2E1254") : tier == 3 ? Pal.Hex("0E3050") : Pal.Hex("123C22");
            Color bot = tier == 1 ? Pal.Hex("FFE27A") : tier == 2 ? Pal.Hex("F6D8FF") : tier == 3 ? Pal.Hex("CAFAFF") : Pal.Hex("E2FFB8");
            Ui.SingleLine(Ui.GradOutlined(b, title, 23, Color.white, bot, new Vector2(2f, 1f), new Vector2(w - 64f, 44), edge, 2.2f), 17);
        }

        static void BuildOrnateAvatar(Transform parent, HeroId h, string avatarUrl, bool gold, Vector2 pos, float sz)
        {
            var box = Ui.Rect(parent, "avatar");
            box.anchoredPosition = pos;
            box.sizeDelta = new Vector2(sz, sz);

            float innerW = sz * (gold ? 0.61f : 0.65f);
            float innerH = sz * 0.65f;
            var mask = Ui.Rect(box, "mask");
            mask.sizeDelta = new Vector2(innerW, innerH);
            mask.anchoredPosition = new Vector2(gold ? 0f : -sz * 0.022f, -sz * (gold ? 0.036f : 0.018f));
            mask.gameObject.AddComponent<RectMask2D>();
            Ui.Box(mask, new Vector2(innerW + 6f, innerH + 6f), Vector2.zero,
                gold ? Pal.Hex("2C4E72") : Pal.Hex("24486A"), Art.White, "bg");

            var d = Defs.Hero(h);
            var ic = Ui.Icon(mask, d.Art, innerH * 1.48f, new Vector2(0, -innerH * 0.22f));
            if (Art.Animated(d.Art))
            {
                string key = d.Art;
                Art.Late(ic, key, () =>
                {
                    var fr = Art.Frames(key);
                    if (fr != null && fr.Length > 0 && ic) ic.sprite = fr[0];
                });
            }

            if (!string.IsNullOrEmpty(avatarUrl))
            {
                RankService.LoadAvatar(avatarUrl, spr =>
                {
                    if (spr == null || !mask) return;
                    if (ic) ic.gameObject.SetActive(false);
                    var wxImg = Ui.Box(mask, new Vector2(innerW + 4f, innerH + 4f), Vector2.zero, Color.white, spr, "wxAv");
                    wxImg.preserveAspect = true;
                });
            }

            // 雕花外框压在人像上层，形成参考图同款立体压边遮罩感！
            Ui.Icon(box, gold ? "ui/rank_av_gold" : "ui/rank_av_azure", sz, Vector2.zero, "frame");
        }

        static void BuildLikeBtn(Transform parent, RankService.Entry e, Vector2 pos, float sz, bool onPodium, Action refresh)
        {
            bool liked = RankService.HasLikedToday(e.Id);
            var wrap = Ui.Rect(parent, "like");
            wrap.anchoredPosition = pos;
            wrap.sizeDelta = new Vector2(sz + 24f, sz + 36f);

            var ic = Ui.Icon(wrap, "ic_rank_like", sz, new Vector2(0, 10f), "thumb");
            if (liked) ic.color = new Color(1f, 0.94f, 0.78f, 0.84f);

            if (onPodium)
            {
                Ui.Outlined(wrap, e.Likes.ToString(), 22, Color.white,
                    new Vector2(0, -sz * 0.43f), new Vector2(124, 30), Pal.Hex("2E1808"), 2.0f);
            }
            else
            {
                Color cntFg = liked ? Pal.Hex("C46A10") : Pal.Hex("5A4A3A");
                Ui.Label(wrap, e.Likes.ToString(), 22, cntFg,
                    new Vector2(0, -sz * 0.42f), new Vector2(120, 30), TextAnchor.MiddleCenter, Fonts.Heavy);
            }

            var hit = Ui.Box(wrap, new Vector2(sz + 24f, sz + 36f), Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            hit.raycastTarget = true;
            Ui.Tap(hit, () =>
            {
                if (!RankService.TryLike(e, out var got))
                {
                    Ui.Toast("今日已为该村民点过赞啦", 220f);
                    return;
                }
                Sfx.Play(Snd.Coin);
                Tween.Pop(wrap, 0.28f);
                if (got != null && got.Count > 0)
                    Ui.Toast($"点赞成功！星钻 +10 · 金币 +200（今日 {S.RankLikes}/{Meta.RankLikesMax}）", 260f);
                else
                    Ui.Toast("点赞成功！人气 +1", 260f);
                refresh?.Invoke();
            }, wrap);
        }

        // ---------------- 排行榜【进度奖励】里程碑弹窗 ----------------

        public static void ShowProgressRewards(Transform layer, Action changed = null)
        {
            float ph = Mathf.Min(1380f, Ui.Height - Ui.SafeTop - 220f);
            MetaUi.Modal(layer, "rankRewards", "主线冲榜奖励", new Vector2(940, ph), out var p, Pal.Hex("C8861C"));
            float top = ph * 0.5f;

            Ui.Skin(p, "dark", new Vector2(868, 128), new Vector2(0, top - 122f), 1f);
            int ready = Meta.RankRewardBadge(S);
            Ui.SingleLine(Ui.GradOutlined(p, $"当前通关：第 {S.Cleared} 关", 34, Color.white, Pal.Hex("FFE27A"),
                new Vector2(-150f, top - 102f), new Vector2(480, 46), Pal.Ink, 2.2f, TextAnchor.MiddleLeft), 22);
            Ui.SingleLine(Ui.Label(p, "突破主线关口即可领取丰厚星钻、大喇叭券与破译扳手", 22, Pal.Hex("C6DCF0"),
                new Vector2(-118f, top - 144f), new Vector2(576, 34), TextAnchor.MiddleLeft, Fonts.Bold), 18);

            if (ready > 0)
            {
                var claimAll = Ui.Btn(p, "一键全领", new Vector2(228, 78), new Vector2(296f, top - 122f), Pal.Gold, () =>
                {
                    var items = Meta.ClaimAllRankMilestones(S);
                    if (items.Count == 0) return;
                    Profile.Save();
                    Sfx.Play(Snd.Coin);
                    ShowProgressRewards(layer, changed);
                    changed?.Invoke();
                    MetaUi.ShowRewards(layer, "冲榜进度大奖", items);
                }, 32, null, Pal.Hex("543008"));
                MetaUi.Dot(claimAll, new Vector2(96, 30));
            }

            float viewH = ph - 268f;
            Ui.Skin(p, "modal_well", new Vector2(884, viewH + 16f), new Vector2(0, top - 204f - viewH * 0.5f), 1f);
            var view = Ui.Rect(p, "view");
            view.sizeDelta = new Vector2(868, viewH);
            view.anchoredPosition = new Vector2(0, top - 204f - viewH * 0.5f);
            view.gameObject.AddComponent<RectMask2D>();
            Ui.Fill(view, new Color(0, 0, 0, 0.001f), true, "hit");

            var content = Ui.Rect(view, "content");
            content.anchorMin = content.anchorMax = new Vector2(0.5f, 1f);
            content.pivot = new Vector2(0.5f, 1f);
            const float rowH = 138f;
            var defs = Meta.RankMilestones;
            float totalH = Mathf.Max(viewH + 4f, defs.Length * rowH + 16f);
            content.sizeDelta = new Vector2(868, totalH);

            int firstFocus = 0;
            for (int i = 0; i < defs.Length; i++)
                if (!Meta.RankMilestoneGot(S, i)) { firstFocus = i; break; }

            for (int i = 0; i < defs.Length; i++)
            {
                var d = defs[i];
                bool got = Meta.RankMilestoneGot(S, i);
                bool can = Meta.CanClaimRankMilestone(S, i);
                float ry = -(8f + i * rowH + rowH * 0.5f);

                var r = Ui.Rect(content, "ms_" + i);
                r.anchorMin = r.anchorMax = new Vector2(0.5f, 1f);
                r.sizeDelta = new Vector2(852, 128);
                r.anchoredPosition = new Vector2(0, ry);
                Ui.Skin(r, can ? "row_claim" : got ? "row_done" : "row", new Vector2(852, 128), Vector2.zero, 1f);

                for (int k = 0; k < d.Items.Length; k++)
                {
                    var it = d.Items[k];
                    var tl = MetaUi.ItemTile(r, it, new Vector2(-362f + k * 98f, 1f), 90f, false, layer);
                    if (got) foreach (var img in tl.GetComponentsInChildren<Image>()) img.color = img.color.Mul(0.82f);
                }

                float textLeft = -362f + d.Items.Length * 98f - 28f;
                float midW = 224f - textLeft;
                float midCx = textLeft + midW * 0.5f;
                Ui.SingleLine(Ui.Label(r, $"通关第 {d.Stage} 关 · {d.Name}", 27, got ? Pal.Hex("8A8276") : Pal.Hex("443322"),
                    new Vector2(midCx, 22f), new Vector2(midW, 40), TextAnchor.MiddleLeft, Fonts.Heavy), 20);
                float frac = Mathf.Clamp01(S.Cleared / (float)Mathf.Max(1, d.Stage));
                MetaUi.Bar(r, new Vector2(midCx, -22f), new Vector2(midW, 24f), frac, can || got ? Pal.Hex("58C2EE") : Pal.Green,
                    $"{Mathf.Min(S.Cleared, d.Stage)}/{d.Stage}");

                int idx = i;
                if (got)
                {
                    MetaUi.Check(r, new Vector2(284f, 0f), 34f);
                    Ui.Label(r, "已领取", 26, Pal.Hex("8A8276"), new Vector2(348f, 0f), new Vector2(120, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
                }
                else if (can)
                {
                    var btn = Ui.Btn(r, "领取", new Vector2(168, 76), new Vector2(326f, 0f), Pal.Gold, () =>
                    {
                        var items = Meta.ClaimRankMilestone(S, idx);
                        if (items.Count == 0) return;
                        Profile.Save();
                        Sfx.Play(Snd.Coin);
                        ShowProgressRewards(layer, changed);
                        changed?.Invoke();
                        MetaUi.ShowRewards(layer, $"通关第{d.Stage}关奖励", items);
                    }, 30, null, Pal.Hex("543008"));
                    MetaUi.Dot(btn, new Vector2(72, 28));
                }
                else
                {
                    Ui.Btn(r, "未达成", new Vector2(168, 74), new Vector2(326f, 0f), Pal.Slate,
                        () => Ui.Toast($"通关第 {d.Stage} 关即可领取", 220f), 28);
                }
            }

            content.anchoredPosition = new Vector2(0f, Mathf.Clamp(firstFocus * rowH - 60f, 0f, Mathf.Max(0f, totalH - viewH)));
            var sr = view.gameObject.AddComponent<ScrollRect>();
            sr.content = content;
            sr.viewport = view;
            sr.horizontal = false;
            sr.vertical = true;
            sr.movementType = ScrollRect.MovementType.Elastic;
            sr.scrollSensitivity = 40f;
        }

        // ---------------- 榜单强者阵容名片检视 ----------------

        static void ShowPlayerCard(Transform layer, RankService.Entry e, int rank, Action refresh)
        {
            MetaUi.Modal(layer, "rankPlayer", "守村名片", new Vector2(880, 860), out var p, Pal.Hex("2B6E9A"));

            Ui.Skin(p, "dark", new Vector2(804, 210), new Vector2(0, 216f), 1f);
            BuildOrnateAvatar(p, e.Hero, e.Avatar, rank <= 6 || e.Cleared >= 30, new Vector2(-296f, 216f), 146f);

            Ui.SingleLine(Ui.GradOutlined(p, e.Name, 36, Color.white, Pal.Hex("FFE890"),
                new Vector2(26f, 264f), new Vector2(440, 48), Pal.Ink, 2.4f, TextAnchor.MiddleLeft), 22);
            var (titleTxt, titleTier) = Meta.HonorTitle(rank, e.Cleared, e.Power);
            BuildTitleBadge(p, titleTxt, titleTier, new Vector2(-84f, 204f), 0.94f);
            Ui.SingleLine(Ui.Outlined(p, $"第 {rank} 名  ·  主线 第{Mathf.Max(1, e.Cleared)}关  ·  总战力 {Ui.Num(e.Power)}",
                24, Pal.Hex("CBE2F6"), new Vector2(88f, 148f), new Vector2(586, 36), Pal.Ink, 1.5f, TextAnchor.MiddleLeft), 18);

            Ui.Label(p, "主力出战阵容", 28, Pal.Ink, new Vector2(0, 68f), new Vector2(400, 40), TextAnchor.MiddleCenter, Fonts.Heavy);

            var lu = e.Lineup ?? Meta.Starters;
            for (int i = 0; i < lu.Length && i < 4; i++)
            {
                var hd = Defs.Hero(lu[i]);
                int hlv = e.LineupLv != null && i < e.LineupLv.Length ? e.LineupLv[i] : 1;
                float cx = (i - 1.5f) * 194f;
                var cell = Ui.Rect(p, "lu_" + i);
                cell.anchoredPosition = new Vector2(cx, -88f);
                cell.sizeDelta = new Vector2(174, 224);

                Ui.Icon(cell, "ui/" + MetaUi.RarityCard(hd.Rarity), 168, new Vector2(0, 14f));
                var mask = Ui.Rect(cell, "m");
                mask.sizeDelta = new Vector2(146, 146);
                mask.anchoredPosition = new Vector2(0, 18f);
                mask.gameObject.AddComponent<RectMask2D>();
                var ic = Ui.Icon(mask, hd.Art, 156, new Vector2(0, -6f));
                if (Art.Animated(hd.Art))
                {
                    string key = hd.Art;
                    Art.Late(ic, key, () =>
                    {
                        var fr = Art.Frames(key);
                        if (fr != null && fr.Length > 0 && ic) ic.sprite = fr[0];
                    });
                }
                Ui.Outlined(cell, $"Lv.{hlv}", 21, Pal.Hex("FFE684"), new Vector2(0, -48f), new Vector2(140, 30), Pal.Ink, 1.6f);
                Ui.Label(cell, hd.Name, 25, Pal.Ink, new Vector2(0, -92f), new Vector2(170, 34), TextAnchor.MiddleCenter, Fonts.Heavy);
            }

            bool liked = RankService.HasLikedToday(e.Id);
            Ui.Btn(p, liked ? $"已点赞 ({e.Likes})" : $"点赞致敬 ({e.Likes})", new Vector2(360, 92), new Vector2(0, -296f),
                liked ? Pal.Slate : Pal.Gold, () =>
                {
                    if (!RankService.TryLike(e, out var got))
                    {
                        Ui.Toast("今日已为该村民点过赞啦", 220f);
                        return;
                    }
                    Sfx.Play(Snd.Coin);
                    if (got != null && got.Count > 0)
                        Ui.Toast($"点赞成功！星钻 +10 · 金币 +200（今日 {S.RankLikes}/{Meta.RankLikesMax}）", 260f);
                    ShowPlayerCard(layer, e, rank, refresh);
                    refresh?.Invoke();
                }, 34, null, liked ? (Color?)null : Pal.Hex("543008"));
        }

        // ---------------- 玩家微信头像昵称同步与自定义榜上名号 ----------------

        static void ShowRenameModal(Transform layer, Action refresh)
        {
            bool isDy = DouyinBridge.IsDouyin;
            bool showWxBtn = !isDy && (DouyinBridge.IsWeChat || Application.isEditor);
            bool showSocialBtn = isDy || showWxBtn;
            float modalH = showSocialBtn ? 680f : 560f;
            var m = MetaUi.Modal(layer, "rankNick", "名号与头像设置", new Vector2(800, modalH), out var p, Pal.Hex("3A6E98"));
            string subTip = isDy
                ? "可一键同步抖音真实头像与昵称，或自由切换幸福村响亮名号"
                : showWxBtn
                    ? "可一键同步微信真实头像与昵称，或自由切换幸福村响亮名号"
                    : "点击随机切换响亮幸福村名号，实时同步至全服排行榜";
            Ui.SingleLine(Ui.Label(p, subTip,
                24, Pal.SubInk, new Vector2(0, showSocialBtn ? 186f : 126f), new Vector2(710, 40)), 18);

            var box = Ui.Skin(p, "dark", new Vector2(580, 92), new Vector2(0, showSocialBtn ? 96f : 26f), 1f);
            string curName = RankService.MyName;
            var txt = Ui.SingleLine(Ui.Outlined(box.transform, curName, 34, Pal.Hex("FFE88E"), Vector2.zero, new Vector2(536, 64), Pal.Ink, 2.0f), 22);

            if (isDy)
            {
                Action<DouyinBridge.WxUserPayload> onDyOk = u =>
                {
                    RankService.ApplyWeChatUser(u);
                    Sfx.Play(Snd.Coin);
                    if (m) MetaUi.Close(m);
                    refresh?.Invoke();
                    Ui.Toast("已同步抖音头像与昵称：" + RankService.MyName, 240f);
                };
                Action<string> onDyFail = _ => Ui.Toast("未完成抖音授权，也可直接使用下方名号上榜", 240f);
                var dyBtn = Ui.Btn(p, "同步抖音头像与昵称", new Vector2(460, 88), new Vector2(0f, -18f), Pal.Teal, () =>
                {
                    Sfx.Play(Snd.Tap);
                    DouyinBridge.RequestDouyinUserProfile(onDyOk, onDyFail);
                }, 31);
                DouyinBridge.BindDouyinUserProfileGesture(dyBtn, onDyOk, onDyFail);
            }
            else if (showWxBtn)
            {
                var wxBtn = Ui.Btn(p, "同步微信头像与昵称", new Vector2(460, 88), new Vector2(0f, -18f), Pal.Green, () =>
                {
                    Sfx.Play(Snd.Tap);
                    DouyinBridge.WxRequestUserInfoDirect(
                        u =>
                        {
                            RankService.ApplyWeChatUser(u);
                            Sfx.Play(Snd.Coin);
                            if (m) MetaUi.Close(m);
                            refresh?.Invoke();
                            Ui.Toast("已同步微信头像与昵称：" + RankService.MyName, 240f);
                        },
                        _ => Ui.Toast("未完成微信授权，也可直接使用下方名号上榜", 240f));
                }, 31);
                DouyinBridge.BindWeChatUserInfoButton(wxBtn, m, layer,
                    u =>
                    {
                        RankService.ApplyWeChatUser(u);
                        Sfx.Play(Snd.Coin);
                        if (m) MetaUi.Close(m);
                        refresh?.Invoke();
                        Ui.Toast("已同步微信头像与昵称：" + RankService.MyName, 240f);
                    },
                    _ => Ui.Toast("未完成微信授权，也可直接使用下方名号上榜", 240f));
            }

            string[] pool =
            {
                "村口情报局长", "全村的希望", "村霸大鹅统领", "野生手工焊神", "广场舞总领队",
                "苞米地守望者", "拖拉机漂移王", "退伍炊事班长", "槐树下第一棋", "专治外星不服",
            };
            int seedIdx = Mathf.Abs(Environment.TickCount) % pool.Length;
            float botY = showSocialBtn ? -168f : -124f;

            Ui.Btn(p, "换个名号", new Vector2(248, 86), new Vector2(-150f, botY), Pal.Azure, () =>
            {
                Sfx.Play(Snd.Tap);
                curName = pool[seedIdx++ % pool.Length] + UnityEngine.Random.Range(10, 99);
                txt.text = curName;
            }, 32);

            Ui.Btn(p, "确认上榜", new Vector2(248, 86), new Vector2(150f, botY), Pal.Gold, () =>
            {
                S.Nick = curName;
                Profile.Save();
                RankService.SubmitIfChanged(true);
                Sfx.Play(Snd.Coin);
                MetaUi.Close(m);
                refresh?.Invoke();
                Ui.Toast("名号已更新：" + curName, 240f);
            }, 32, null, Pal.Hex("543008"));
        }

        static string ScoreLabel(RankService.Entry e)
        {
            if (_board == RankService.BoardPower) return $"战力 {Ui.Num(e.Power)}";
            return e.Cleared > 0 ? $"第{e.Cleared}关" : "第1关前";
        }

        static string Truncate(string s, int maxChars)
        {
            if (string.IsNullOrEmpty(s)) return "热心村民";
            if (s.Length <= maxChars) return s;
            return s.Substring(0, maxChars) + "…";
        }
    }
}
