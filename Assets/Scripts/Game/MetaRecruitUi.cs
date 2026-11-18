using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace Liangshan
{
    /// <summary>
    /// 擂鼓招募 v11 全面升级演出：
    /// 1. 阶段一「天罡点将台 · 星陨神光降临 + 席位玄金翻牌」：
    ///    摒弃无走路帧立绘的生硬平移与丑陋脚底蓝圈！改为近景白玉鎏金点将台——
    ///    每击一鼓，天外星陨贯入祭坛 → 冲天羽化神光柱轰然炸开 → 好汉 368px 巨幅特写破光降临（带「绰号·姓名」展翼铭牌与星芒法相）
    ///    → 亮相后化作流光飞入下方 5×2 玄金卡背牌阵，触发竖向破晓光缝 + 3D 翻牌 + 斜向闪卡扫光！
    /// 2. 彻底移除冗余的单人全屏揭晓弹窗，保持连抽爽感不断档。
    /// 3. 阶段二「累计获得 · 天罡冠冕震撼大屏」：
    ///    破晓闪屏 + 赤金星芒天穹 + 860px 皇家三重展翼大冠冕 + 星耀神坛逐张翻牌扫光 + 碎片进度条动态涨满。
    /// </summary>
    public static partial class MetaUi
    {
        struct MergedPull
        {
            public HeroId Hero;
            public HeroDef Def;
            public bool AnyNew;
            public int GainShards;
            public int Count;
        }

        public static void RecruitResult(Transform layer, List<Pull> pulls)
        {
            if (pulls == null || pulls.Count == 0) return;

            foreach (var pl in pulls)
            {
                var artName = Defs.Hero(pl.Hero).Art;
                if (ArtPack.Has(artName)) ArtPack.Ensure(artName);
            }

            bool skip = S.SkipRecruitAnim != 0;

            // 单点招募（免费招募 / 擂鼓一抽）：
            // 只要抽出传说好汉，哪怕勾选了「跳过动画」也必触发全屏天罡封神大戏（左上角保留一键跳过）；
            // 普通品质未勾跳过时同样采用全屏无托盘一体式单抽点将台！
            if (pulls.Count == 1)
            {
                int r1 = Defs.Hero(pulls[0].Hero).Rarity;
                if (!skip || r1 >= 4)
                {
                    ShowSingleRecruitStage(layer, pulls[0], null);
                }
                else
                {
                    Sfx.Play(Snd.Drum, 0.85f);
                    ShowRecruitSummary(layer, pulls);
                }
                return;
            }

            // 十连招募：若勾选了「跳过动画」但抽中了传说好汉，先播头号传说的封神揭晓，再进十连累计获得大屏！
            if (skip)
            {
                int bestLegendIdx = -1;
                for (int i = 0; i < pulls.Count; i++)
                {
                    if (Defs.Hero(pulls[i].Hero).Rarity >= 4 && (bestLegendIdx < 0 || pulls[i].New))
                        bestLegendIdx = i;
                }
                if (bestLegendIdx >= 0)
                {
                    ShowSingleRecruitStage(layer, pulls[bestLegendIdx], () => ShowRecruitSummary(layer, pulls));
                    return;
                }
                Sfx.Play(Snd.Drum, 0.85f);
                ShowRecruitSummary(layer, pulls);
            }
            else
            {
                ShowRecruitStage(layer, pulls);
            }
        }

        /// <summary>
        /// 单点招募专属·全屏一体式天罡点将台（无下半屏空托盘，一镜到底！）：
        /// 抽出传说好汉时触发三幕式「紫极生金异变 → 双环金阵剪影 → 破晓金刃封神常驻画卷 + 皇家冠冕 + 天罡大招名帖」！
        /// </summary>
        static void ShowSingleRecruitStage(Transform layer, Pull pl, Action onChainSummary)
        {
            var d = Defs.Hero(pl.Hero);
            int r = d.Rarity;
            int tier = HeroTier(r);
            Color trueCol = BeamColor(r);
            Color hotCol = Color.Lerp(trueCol, Color.white, 0.76f);

            var old = layer.Find("fx_pulls");
            if (old) Object.DestroyImmediate(old.gameObject);

            var root = Ui.Rect(layer, "fx_pulls");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var cg = root.gameObject.AddComponent<CanvasGroup>();
            Tween.Fade(cg, 0f, 1f, 0.16f);
            var block = Ui.Fill(root, new Color(0.02f, 0.05f, 0.10f, 1f), true, "block");
            root.SetAsLastSibling();

            float uiH = Ui.Height;
            const float altarX = 0f, altarSurfaceY = -14f;

            // 全屏无遮挡点将台世界层
            var stageWorld = Ui.Rect(root, "stageWorld");
            stageWorld.sizeDelta = new Vector2(1080f, uiH);

            const float bgW = 1280f, bgH = 2276f;
            float bgY = altarSurfaceY - (0.5f - 0.695f) * bgH;
            var bg = Ui.Box(stageWorld, new Vector2(bgW, bgH), new Vector2(altarX, bgY), Color.white, Art.Img("recruit_stage_bg"), "stageBg");
            bg.type = Image.Type.Simple;

            var altarWarmth = Ui.Box(stageWorld, new Vector2(580, 260), new Vector2(altarX, altarSurfaceY + 24f),
                Pal.Hex("FFD86B").A(0.24f), Art.SoftDot, "altarWarmth");
            Tween.Run(altarWarmth, 999f, k => altarWarmth.color = Pal.Hex("FFD86B").A(0.18f + 0.10f * Mathf.Sin(k * 999f * 2.8f)));

            var vignette = Ui.Icon(stageWorld, "ui/fx_stage_vignette", 1700, new Vector2(altarX, altarSurfaceY + 180f), "vignette");
            vignette.preserveAspect = false;
            vignette.rectTransform.sizeDelta = new Vector2(1620f, uiH + 500f);
            vignette.color = Color.white.A(r >= 3 ? 0.72f : 0.25f);

            // 天罡双环罗盘星盘
            var omen = Ui.Rect(stageWorld, "omen");
            omen.anchoredPosition = new Vector2(altarX, altarSurfaceY + 520f);
            var omenGlow = Ui.Box(omen, Vector2.one * 740f, Vector2.zero, Color.white.A(0f), Art.SoftDot, "omenGlow");
            var omenOuter = Ui.Icon(omen, "ui/fx_magic_seal", 580, Vector2.zero, "omenOuter");
            var omenInner = Ui.Icon(omen, "ui/fx_halo_ring", 440, Vector2.zero, "omenInner");
            omenOuter.color = omenInner.color = Color.white.A(0f);
            float omenSpin = 110f, omenAngle = 0f, omenLastK = 0f;
            Tween.Run(omenOuter, 999f, k =>
            {
                float dt = (k - omenLastK) * 999f;
                omenLastK = k;
                omenAngle -= dt * omenSpin;
                omenOuter.rectTransform.localRotation = Quaternion.Euler(0, 0, omenAngle);
                if (omenInner) omenInner.rectTransform.localRotation = Quaternion.Euler(0, 0, -omenAngle * 0.75f);
            });
            void OmenColor(Color c, float a)
            {
                if (!omenOuter) return;
                omenOuter.color = c.A(a);
                omenInner.color = Color.Lerp(c, Color.white, 0.72f).A(a * 0.95f);
                omenGlow.color = c.A(a * 0.48f);
                Tween.Punch(omen, 0.18f, 0.12f);
            }

            var altarHeroLayer = Ui.Rect(stageWorld, "altarHeroLayer");
            altarHeroLayer.sizeDelta = new Vector2(1080f, uiH);

            // 左下石阶迎宾鼓官
            var drumRig = Ui.Rect(stageWorld, "drumRig");
            drumRig.anchoredPosition = new Vector2(-356f, 42f);
            drumRig.sizeDelta = new Vector2(320, 320);
            drumRig.localScale = Vector3.one * 0.84f;
            var drumCg = drumRig.gameObject.AddComponent<CanvasGroup>();

            Ui.Box(drumRig, new Vector2(280, 48), new Vector2(-6, -126), new Color(0.04f, 0.06f, 0.10f, 0.44f), Art.GroundShadow, "drumShadow");
            var herald = Ui.Icon(drumRig, "stage_herald", 236, new Vector2(-88, 20), "herald");
            Tween.Run(herald, 999f, k => herald.rectTransform.anchoredPosition = new Vector2(-88f, 20f + 5f * Mathf.Sin(k * 999f * 4.2f)));
            var drum = Ui.Icon(drumRig, "stage_drum", 238, new Vector2(54, -14), "drum");
            var malletPivot = Ui.Rect(drumRig, "malletPivot");
            malletPivot.anchoredPosition = new Vector2(-16, 90);
            malletPivot.localRotation = Quaternion.Euler(0, 0, 30f);
            var mallet = Ui.Icon(malletPivot, "stage_mallet", 162, new Vector2(52, 32), "mallet");
            mallet.rectTransform.localRotation = Quaternion.Euler(0, 0, -25f);

            var bubble = Ui.Rect(drumRig, "bubble");
            bubble.anchoredPosition = new Vector2(76f, 210f);
            bubble.sizeDelta = new Vector2(350, 66);
            Ui.Skin(bubble, "hint", new Vector2(350, 66), Vector2.zero, 0.82f);
            var bubbleTxt = Ui.Outlined(bubble, r >= 4 ? "村东冒金光……变压器有异象！" : "敲响大铜锣！喊乡亲上阵咯！",
                22, Pal.Hex("FFF6D6"), new Vector2(0, 2), new Vector2(324, 52), Pal.Ink, 1.8f);
            void Say(string s, float punch = 0.10f)
            {
                if (!bubbleTxt) return;
                bubbleTxt.text = s;
                Tween.Punch(bubble, 0.18f, punch);
            }

            // UI 交互承载层（破晓揭晓后浮现冠冕、大招名帖、进度条与操作按钮）
            var hudLayer = Ui.Rect(root, "singleHud");
            hudLayer.anchorMin = Vector2.zero;
            hudLayer.anchorMax = Vector2.one;
            hudLayer.offsetMin = hudLayer.offsetMax = Vector2.zero;

            var flash = Ui.Fill(root, Color.white.A(0f), false, "flash");
            var flashImg = flash.GetComponent<Image>();

            var skipBtn = Ui.Top(root, -396f, Ui.SafeTop + 62f, new Vector2(204, 78), "skipSingleBtn");
            var skipFace = Ui.Icon(skipBtn, "ui/gacha_skip_btn", 204, Vector2.zero, "face");
            skipFace.rectTransform.sizeDelta = new Vector2(204, 78);
            Ui.Outlined(skipBtn, "跳过", 30, Color.white, new Vector2(24, 1), new Vector2(120, 56), Pal.Ink, 2.2f);

            void Flash(Color c, float peak, float dur)
            {
                if (!flashImg) return;
                flash.SetAsLastSibling();
                if (skipBtn) skipBtn.SetAsLastSibling();
                Tween.Run(flashImg, dur, k => flashImg.color = c.A(peak * (1f - Tween.OutCubic(k))));
            }

            void Shake(float amp, float dur = 0.24f)
            {
                Tween.Run(stageWorld, dur, k =>
                {
                    float damp = 1f - k;
                    stageWorld.anchoredPosition = new Vector2(Mathf.Sin(k * 48f) * amp * damp, Mathf.Cos(k * 40f) * amp * 0.7f * damp);
                }, () => { if (stageWorld) stageWorld.anchoredPosition = Vector2.zero; });
            }

            void BeatSingleDrum(int rar, string shout)
            {
                Color bc = BeamColor(rar);
                Tween.Run(malletPivot, 0.08f, k => malletPivot.localRotation = Quaternion.Euler(0, 0, Mathf.Lerp(34f, -28f, Tween.InCubic(k))), () =>
                {
                    if (malletPivot)
                        Tween.Run(malletPivot, 0.18f, k => malletPivot.localRotation = Quaternion.Euler(0, 0, Mathf.Lerp(-28f, 30f, Tween.OutBack(k))));
                });
                Tween.Punch(herald.transform, 0.20f, 0.11f);
                Tween.Run(drum, 0.20f, k =>
                {
                    float s = Mathf.Sin(k * Mathf.PI);
                    drum.rectTransform.localScale = new Vector3(1f + 0.15f * s, 1f - 0.10f * s, 1f);
                }, () => { if (drum) drum.rectTransform.localScale = Vector3.one; });
                var dg = Ui.Box(drumRig, Vector2.one * 180f, new Vector2(64, 14), bc.A(0.70f), Art.SoftDot, "pulse");
                Tween.Run(dg, 0.28f, k =>
                {
                    dg.rectTransform.localScale = Vector3.one * Mathf.Lerp(0.7f, 1.9f, Tween.OutCubic(k));
                    dg.color = bc.A(0.70f * (1f - k));
                }, () => { if (dg) Object.Destroy(dg.gameObject); });
                Sfx.Play(Snd.Drum, 0.92f);
                if (!string.IsNullOrEmpty(shout))
                {
                    var hw = Ui.Outlined(drumRig, shout, 30, Color.white, new Vector2(86, 102), new Vector2(360, 52), Pal.Ink, 2.2f);
                    Tween.Run(hw, 0.48f, k =>
                    {
                        hw.rectTransform.anchoredPosition = new Vector2(86f + k * 14f, 102f + Tween.OutCubic(k) * 54f);
                        if (k > 0.6f) hw.color = hw.color.A(1f - (k - 0.6f) / 0.4f);
                    }, () => { if (hw) Object.Destroy(hw.gameObject); });
                }
            }

            bool revealed = false, closed = false;
            int seqTok = 0;
            RectTransform meteorNode = null;
            SilFx activeSil = null;

            void CloseStage()
            {
                if (closed) return;
                closed = true;
                MetaFx.Dismiss(root);
                onChainSummary?.Invoke();
            }

            Vector2 altarSpot = new Vector2(altarX, altarSurfaceY);

            void DoFinalReveal()
            {
                if (revealed || closed || !root) return;
                revealed = true;
                seqTok++;
                if (meteorNode) Object.Destroy(meteorNode.gameObject);
                if (activeSil != null && activeSil.Node) Object.Destroy(activeSil.Node.gameObject);
                if (omen) Object.Destroy(omen.gameObject);
                if (skipBtn && onChainSummary == null) Object.Destroy(skipBtn.gameObject);

                // 鼓官优雅退隐让出下半屏领奖空间
                if (drumCg) Tween.Fade(drumCg, drumCg.alpha, 0f, 0.22f, () => { if (drumRig) drumRig.gameObject.SetActive(false); });

                if (r >= 3)
                {
                    Flash(Color.Lerp(trueCol, Color.white, 0.65f), r >= 4 ? 0.92f : 0.62f, r >= 4 ? 0.48f : 0.32f);
                    var slash = Ui.Icon(altarHeroLayer, "ui/fx_arc_slash", 1420, altarSpot + new Vector2(0, 190f), "dawnSlash");
                    slash.preserveAspect = false;
                    slash.rectTransform.sizeDelta = new Vector2(1420f, r >= 4 ? 380f : 280f);
                    slash.color = Color.Lerp(trueCol, Color.white, 0.58f);
                    Tween.Run(slash, 0.40f, k =>
                    {
                        slash.rectTransform.localScale = new Vector3(Mathf.Lerp(0.45f, 1.25f, Tween.OutCubic(k)), Mathf.Lerp(1.4f, 0.12f, k), 1f);
                        slash.color = slash.color.A(1f - k * k);
                    }, () => { if (slash) Object.Destroy(slash.gameObject); });

                    var lines = Ui.Icon(altarHeroLayer, "ui/fx_speed_lines", 1600, altarSpot + new Vector2(0, 180f), "speedLines");
                    lines.color = Color.Lerp(trueCol, Color.white, 0.45f).A(0.94f);
                    Tween.Run(lines, r >= 4 ? 0.90f : 0.60f, k =>
                    {
                        lines.rectTransform.localScale = Vector3.one * Mathf.Lerp(1.25f, 0.98f, Tween.OutCubic(k));
                        lines.color = lines.color.A(0.94f * (1f - k));
                    }, () => { if (lines) Object.Destroy(lines.gameObject); });
                }

                float vigTarget = r >= 4 ? 0.56f : (r == 3 ? 0.34f : 0.16f);
                float v0 = vignette.color.a;
                Tween.Run(vignette, 0.45f, k => vignette.color = Color.white.A(Mathf.Lerp(v0, vigTarget, k)));
                float push0 = stageWorld.localScale.x;
                Tween.Run(stageWorld, 0.55f, k => stageWorld.localScale = Vector3.one * Mathf.Lerp(push0, 1f, Tween.OutCubic(k)));
                Shake(r >= 4 ? 13f : (r == 3 ? 7f : 3.5f), 0.28f);

                Haptic(root, r >= 4 ? 3 : r == 3 ? 2 : 1);
                Sfx.Play(r >= 4 ? Snd.Jackpot : r == 3 ? Snd.Unlock : Snd.Reveal, r >= 4 ? 1f : 0.85f);

                if (r >= 4)
                {
                    MetaFx.Confetti(hudLayer, 46);
                    SpawnRisingEmbers(hudLayer, 26, Pal.Hex("FFD44A"));
                }

                // 点将台中央巨幅好汉镇场（传说放大至 1.14 倍 = 420px+ 巨幅威压！）
                var spot = SpawnAltarHeroSpotlight(altarHeroLayer, altarSpot, d, pl.New, r >= 3);
                if (r >= 4) spot.localScale = Vector3.one * 1.12f;

                // 顶部皇家三重展翼大冠冕（传说专属封神顶冠 / 史诗稀有雅致题额）
                float topLim = uiH * 0.5f - Ui.SafeTop - 128f;
                float crownY = Mathf.Min(topLim, 726f);
                if (r >= 4)
                {
                    var crown = Ui.Rect(hudLayer, "legendCrown");
                    crown.anchoredPosition = new Vector2(0, crownY);
                    crown.sizeDelta = new Vector2(820, 174);
                    Ui.Box(crown, new Vector2(860, 220), Vector2.zero, Pal.Hex("FFB82E").A(0.46f), Art.SoftDot);
                    var cImg = Ui.Icon(crown, "ui/gacha_sum_crown", 820, Vector2.zero, "crownArt");
                    cImg.preserveAspect = false;
                    cImg.rectTransform.sizeDelta = new Vector2(820, 174);
                    Ui.Outlined(crown, pl.New ? "战神出山" : "传说再临", 58, Pal.Hex("FFFBE2"),
                        new Vector2(0, -14), new Vector2(500, 74), Pal.Hex("4E1804"), 3.2f);
                    crown.localScale = Vector3.one * 1.65f;
                    Tween.Run(crown, 0.26f, k => crown.localScale = Vector3.one * Mathf.Lerp(1.65f, 1f, Tween.OutBack(k)));
                }
                else
                {
                    var hdr = Ui.Rect(hudLayer, "singleHdr");
                    hdr.anchoredPosition = new Vector2(0, Mathf.Min(topLim, 640f));
                    hdr.sizeDelta = new Vector2(460, 78);
                    Ui.Skin(hdr, "gacha_oct_badge", new Vector2(460, 78), Vector2.zero, -1f);
                    Ui.Outlined(hdr, pl.New ? $"新乡亲上阵 · {RarityName(r)}" : $"摇人成功 · {RarityName(r)}乡亲",
                        32, Pal.Hex("FFF3C4"), new Vector2(0, 1), new Vector2(420, 56), Pal.Ink, 2.2f);
                    Tween.Pop(hdr, 0.22f);
                }

                // 石坛前方：天罡绝学名帖（传说展示觉醒大招 + 普攻；史诗/稀有展示招牌绝技）
                var skillCard = Ui.Rect(hudLayer, "skillCard");
                skillCard.anchoredPosition = new Vector2(0, -206f);
                if (r >= 4 && !string.IsNullOrEmpty(d.UltName))
                {
                    skillCard.sizeDelta = new Vector2(860, 152);
                    Ui.Skin(skillCard, "gacha_dock_gold", new Vector2(860, 152), Vector2.zero, 0.72f);
                    var uSlot = Slot(skillCard, "slot_orange", 104, new Vector2(-346, 0));
                    if (!string.IsNullOrEmpty(d.UltIcon)) Ui.Icon(uSlot.transform, d.UltIcon, 78, Vector2.zero);
                    Badge(skillCard, "镇村大招", Pal.Red, new Vector2(112, 32), new Vector2(-346, 54), 18);
                    string tipFlat = string.IsNullOrEmpty(d.UltTip) ? d.Desc : d.UltTip.Replace("\n", "，");
                    Ui.SingleLine(Ui.Outlined(skillCard, $"【{d.UltName}】 <size=22><color=#FFE6A0>招牌：{d.AtkName}</color></size>",
                        29, Pal.Hex("FFF4C2"), new Vector2(44, 24), new Vector2(640, 42), Pal.Ink, 2.0f, TextAnchor.MiddleLeft), 20);
                    Ui.SingleLine(Ui.Outlined(skillCard, tipFlat, 23, Pal.Hex("E6F2FF"),
                        new Vector2(44, -24), new Vector2(640, 40), Pal.Ink, 1.6f, TextAnchor.MiddleLeft), 18);
                }
                else
                {
                    skillCard.sizeDelta = new Vector2(820, 118);
                    Ui.Skin(skillCard, r == 3 ? "gacha_dock_purple" : "gacha_tray", new Vector2(820, 118), Vector2.zero, 0.68f);
                    var aSlot = Slot(skillCard, RaritySlot(r), 86, new Vector2(-336, 0));
                    if (!string.IsNullOrEmpty(d.AtkIcon)) Ui.Icon(aSlot.transform, d.AtkIcon, 62, Vector2.zero);
                    Ui.SingleLine(Ui.Outlined(skillCard, $"招牌绝技 · 【{d.AtkName}】", 26, Pal.Hex("FFE89E"),
                        new Vector2(36, 18), new Vector2(620, 36), Pal.Ink, 1.8f, TextAnchor.MiddleLeft), 20);
                    Ui.SingleLine(Ui.Outlined(skillCard, d.Desc, 22, Pal.Hex("DCEEFF"),
                        new Vector2(36, -20), new Vector2(620, 34), Pal.Ink, 1.5f, TextAnchor.MiddleLeft), 17);
                }
                Tween.Pop(skillCard, 0.24f, 0.06f);

                // 一体式碎片等级进度 + 额外获赠信物横条
                var rewardStrip = Ui.Rect(hudLayer, "rewardStrip");
                rewardStrip.anchoredPosition = new Vector2(0, -396f);
                rewardStrip.sizeDelta = new Vector2(860, 136);
                Ui.Box(rewardStrip, new Vector2(860, 132), Vector2.zero, new Color(0.04f, 0.09f, 0.18f, 0.88f), Art.Rounded);
                Ui.Box(rewardStrip, new Vector2(856, 2), new Vector2(0, 64), trueCol.A(0.55f), Art.White);

                int lv = S.HeroLv[(int)pl.Hero];
                int need = Meta.ShardCost(lv);
                int curShards = S.Shards[(int)pl.Hero];
                int prevShards = Mathf.Max(0, curShards - pl.Shards);
                bool max = lv >= Meta.MaxHeroLv;
                bool canUp = Meta.CanLevel(S, pl.Hero);

                string gainHeadline = pl.New
                    ? $"<color=#FFE678>全新加入守村队！</color> 当前 Lv.{lv}"
                    : $"已结识乡亲 · 转化{RarityName(r)}碎片 <color=#FFE678>+{pl.Shards}</color>";
                Ui.Outlined(rewardStrip, gainHeadline, 25, Color.white, new Vector2(-148, 28), new Vector2(500, 36), Pal.Ink, 1.8f, TextAnchor.MiddleLeft);

                const float barW = 360f, barH = 24f, barX = -196f, barY = -22f;
                float f0 = max ? 1f : Mathf.Clamp01(prevShards / (float)Mathf.Max(1, need));
                float f1 = max ? 1f : Mathf.Clamp01(curShards / (float)Mathf.Max(1, need));
                var fillRt = MetaUi.Bar(rewardStrip, new Vector2(barX, barY), new Vector2(barW, barH), f1, MetaUi.ShardFill(max, canUp),
                    max ? "满级" : $"{curShards}/{need}");
                MetaUi.GrowBar(fillRt, f0, f1, barW, barH, 0.45f, 0.12f);

                // 右侧额外获赠：聚义信物 +10 & 招募经验 +1
                Ui.Box(rewardStrip, new Vector2(2, 96), new Vector2(72, 0), Color.white.A(0.14f), Art.White);
                Ui.Outlined(rewardStrip, "额外获赠", 20, Pal.Hex("FFE294"), new Vector2(252, 36), new Vector2(280, 28), Pal.Ink, 1.5f);
                Ui.Icon(rewardStrip, "ic_credit", 48, new Vector2(138, -14));
                Ui.Outlined(rewardStrip, $"工分 +{Meta.CreditsPerPull}", 22, Color.white, new Vector2(216, -14), new Vector2(120, 30), Pal.Ink, 1.6f, TextAnchor.MiddleLeft);
                Ui.Icon(rewardStrip, "stage_drum", 46, new Vector2(304, -14));
                Ui.Outlined(rewardStrip, "经验 +1", 22, Color.white, new Vector2(376, -14), new Vector2(100, 30), Pal.Ink, 1.6f, TextAnchor.MiddleLeft);
                Tween.Pop(rewardStrip, 0.24f, 0.10f);

                // 底部行动双按钮
                float btnBotLim = -uiH * 0.5f + Ui.SafeBottom + 136f;
                float btnY = Mathf.Max(btnBotLim, -600f);
                var btns = Ui.Rect(hudLayer, "btns");
                btns.anchoredPosition = new Vector2(0, btnY);

                if (onChainSummary != null)
                {
                    Ui.Btn(btns, "查看十连战果", new Vector2(440, 122), Vector2.zero, Pal.Gold, CloseStage, 38);
                }
                else
                {
                    Ui.Btn(btns, "编入民兵队", new Vector2(316, 120), new Vector2(-182, 0), Pal.Azure, CloseStage, 38);
                    var againBtn = Ui.SubBtn(btns, "再摇一次", "ic_token", $"{S.Tokens}/1",
                        new Vector2(336, 120), new Vector2(178, 0), Pal.Gold, () =>
                        {
                            if (closed) return;
                            closed = true;
                            MetaFx.Dismiss(root);
                            Game.I.Home?.DoRecruit(1, false);
                        }, 36, 23);
                    if (S.Tokens >= 1) Dot(againBtn, new Vector2(152, 48));
                }
                Tween.Pop(btns, 0.24f, 0.14f);
            }

            // 左上角跳过：十连前置揭晓时直接进十连结算；普通单抽时若尚未揭晓则瞬切揭晓，已揭晓则关闭
            Ui.Tap(skipFace, () =>
            {
                if (onChainSummary != null || revealed) CloseStage();
                else DoFinalReveal();
            }, skipBtn);

            // 点击背景：尚未揭晓时一键瞬切破晓揭晓！
            var tapDummy = Ui.Rect(root, "tapDummy");
            Ui.Tap(block.GetComponent<Image>(), () =>
            {
                if (!revealed) DoFinalReveal();
            }, tapDummy, false);

            // ---------------- 启动单抽分品质戏剧时间轴 ----------------
            int myTok = ++seqTok;
            if (r <= 2)
            {
                // 稀有蓝卡：一鼓冰蓝星陨 0.16s 清脆直出！
                BeatSingleDrum(2, "<color=#94E6FF>好锣!</color>");
                Haptic(root, 1);
                Vector2 s0 = new Vector2(-180f, uiH * 0.5f + 160f), s1 = altarSpot + new Vector2(0, 36f);
                Vector2 dir = (s1 - s0).normalized;
                meteorNode = Ui.Icon(altarHeroLayer, "ui/fx_meteor_streak", 420, s0, "meteor").rectTransform;
                var mImg = meteorNode.GetComponent<Image>();
                mImg.preserveAspect = false;
                meteorNode.sizeDelta = new Vector2(170f, 410f);
                meteorNode.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg + 90f);
                mImg.color = Color.Lerp(trueCol, Color.white, 0.38f);
                Tween.Run(meteorNode, 0.16f, k => meteorNode.anchoredPosition = Vector2.Lerp(s0, s1, k), () =>
                {
                    if (myTok == seqTok) DoFinalReveal();
                });
                return;
            }

            if (r == 3)
            {
                // 史诗紫卡：星盘泛紫 + 紫电星陨 + 0.44s 双环剪影 + 0.08s 定格破晓！
                BeatSingleDrum(3, "<color=#F2A8FF>震村好锣!</color>");
                OmenColor(trueCol, 0.94f);
                Haptic(root, 2);
                Say("东头冒紫光！有高手出门了！");
                Vector2 s0 = new Vector2(-180f, uiH * 0.5f + 160f), s1 = altarSpot + new Vector2(0, 36f);
                Vector2 dir = (s1 - s0).normalized;
                meteorNode = Ui.Icon(altarHeroLayer, "ui/fx_meteor_streak", 440, s0, "meteor").rectTransform;
                var mImg = meteorNode.GetComponent<Image>();
                mImg.preserveAspect = false;
                meteorNode.sizeDelta = new Vector2(204f, 450f);
                meteorNode.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg + 90f);
                mImg.color = Color.Lerp(trueCol, Color.white, 0.38f);
                Tween.Run(meteorNode, 0.20f, k => meteorNode.anchoredPosition = Vector2.Lerp(s0, s1, k), () =>
                {
                    if (meteorNode) Object.Destroy(meteorNode.gameObject);
                    if (myTok != seqTok || !root) return;
                    Shake(5f, 0.20f);
                    Tween.Run(stageWorld, 0.44f, k => stageWorld.localScale = Vector3.one * Mathf.Lerp(1f, 1.09f, Tween.OutCubic(k)));
                    activeSil = SpawnSilhouette(altarHeroLayer, altarSpot, d, trueCol);
                    Sfx.Play(Snd.Spell, 0.75f);
                    Tween.Run(root, 0.44f, _ => { }, () =>
                    {
                        if (myTok != seqTok || !root) return;
                        if (activeSil != null) activeSil.Frozen = true;
                        Tween.Run(root, 0.09f, _ => { }, () => { if (myTok == seqTok) DoFinalReveal(); });
                    });
                });
                return;
            }

            // 传说橙卡（r >= 4）：一发入魂 · 紫极生金三幕封神大典！
            omen.localScale = Vector3.one * 1.15f;
            Tween.Run(vignette, 0.26f, k => vignette.color = Color.white.A(Mathf.Lerp(0.45f, 0.92f, k)));
            BeatSingleDrum(3, "<color=#F2A8FF>响彻十里!</color>");
            OmenColor(BeamColor(3), 0.92f);
            Haptic(root, 1);

            // 0.38s：紫盘骤裂，双层炽白金雷劈开天罡金盘！
            Tween.Run(root, 0.001f, _ => { }, () =>
            {
                if (myTok != seqTok || !root) return;
                omenSpin = 280f;
                OmenColor(trueCol, 1f);
                Haptic(root, 3);
                Sfx.Play(Snd.Thunder, 0.98f);
                Shake(11f, 0.28f);
                Flash(Pal.Hex("FFE696"), 0.58f, 0.30f);
                Say("卧槽？！变压器冒金光——是全村隐藏战神！！", 0.18f);

                var skyCrack = Ui.Rect(stageWorld, "skyCrack");
                skyCrack.anchoredPosition = omen.anchoredPosition;
                Ui.Icon(skyCrack, "ui/fx_lightning_crack", 640, Vector2.zero, "g").color = trueCol;
                Ui.Icon(skyCrack, "ui/fx_lightning_crack", 600, Vector2.zero, "c").color = hotCol;
                Tween.Run(skyCrack, 0.44f, k =>
                {
                    skyCrack.localScale = Vector3.one * Mathf.Lerp(0.8f, 1.32f, Tween.OutCubic(k));
                    foreach (var im in skyCrack.GetComponentsInChildren<Image>())
                        im.color = im.color.A(1f - k * k);
                }, () => { if (skyCrack) Object.Destroy(skyCrack.gameObject); });

                // 金色巨型陨星贯入祭坛
                Vector2 s0 = omen.anchoredPosition + new Vector2(-120f, 160f), s1 = altarSpot + new Vector2(0, 36f);
                Vector2 dir = (s1 - s0).normalized;
                meteorNode = Ui.Icon(altarHeroLayer, "ui/fx_meteor_streak", 480, s0, "goldMeteor").rectTransform;
                var mImg = meteorNode.GetComponent<Image>();
                mImg.preserveAspect = false;
                meteorNode.sizeDelta = new Vector2(236f, 500f);
                meteorNode.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg + 90f);
                mImg.color = Color.Lerp(trueCol, Color.white, 0.45f);
                Tween.Run(meteorNode, 0.24f, k => meteorNode.anchoredPosition = Vector2.Lerp(s0, s1, Tween.InCubic(k) * 0.35f + k * 0.65f), () =>
                {
                    if (meteorNode) Object.Destroy(meteorNode.gameObject);
                    if (myTok != seqTok || !root) return;
                    Shake(9f, 0.22f);
                    Sfx.Play(Snd.Spell, 0.85f);
                    Say("金光聚舞台……看是哪位大爷大姨！");
                    Tween.Run(stageWorld, 0.56f, k => stageWorld.localScale = Vector3.one * Mathf.Lerp(1f, 1.16f, Tween.OutCubic(k)));
                    activeSil = SpawnSilhouette(altarHeroLayer, altarSpot, d, trueCol);
                    Tween.Run(root, 0.62f, _ => { }, () =>
                    {
                        if (myTok != seqTok || !root) return;
                        if (activeSil != null) activeSil.Frozen = true;
                        Tween.Run(root, 0.12f, _ => { }, () => { if (myTok == seqTok) DoFinalReveal(); });
                    });
                });
            }, 0.38f);
        }

        sealed class SilFx
        {
            public RectTransform Node;
            public Image SealOuter, SealInner, PillarGlow, PillarCore, Aura, HeartStar;
            public Image[] Rims;
            public Image Sil;
            public bool Frozen;
            public float Spin = 1f;

            public void SetColor(Color c)
            {
                Color hot = Color.Lerp(c, Color.white, 0.78f);
                if (SealOuter) SealOuter.color = c.A(0.95f);
                if (SealInner) SealInner.color = hot.A(0.96f);
                if (PillarGlow) PillarGlow.color = c.A(0.78f);
                if (PillarCore) PillarCore.color = hot.A(0.92f);
                if (Aura) Aura.color = c.A(0.55f);
                if (HeartStar) HeartStar.color = hot;
                if (Rims != null)
                    foreach (var rm in Rims) if (rm) rm.color = Color.Lerp(c, Color.white, 0.52f).A(0.92f);
            }
        }

        static Color BeamColor(int rarity) =>
            rarity >= 4 ? Pal.Hex("FFB82E") : rarity == 3 ? Pal.Hex("C85CFF") : Pal.Hex("4CC9FF");

        /// <summary>微信真机触感：1 轻点，2 双连中震，3 三连重震。桌面端没有接口时静默。</summary>
        static void Haptic(Object owner, int level)
        {
            int pulses = level >= 3 ? 3 : level == 2 ? 2 : 1;
            string type = level >= 3 ? "heavy" : level == 2 ? "medium" : "light";
            for (int p = 0; p < pulses; p++)
                Tween.Run(owner, 0.001f, _ => { }, () => VibrateShort(type), p * 0.10f);
        }

        static void VibrateShort(string type)
        {
            if (DouyinBridge.IsDouyin)
            {
                DouyinBridge.VibrateShort(type);
                return;
            }
            try
            {
                var wx = Type.GetType("WeChatWASM.WX, Wx") ?? Type.GetType("WeChatWASM.WX");
                if (wx == null) return;
                var optT = wx.Assembly.GetType("WeChatWASM.VibrateShortOption");
                if (optT == null) return;
                var opt = Activator.CreateInstance(optT);
                var f = optT.GetField("type");
                if (f != null) f.SetValue(opt, type);
                else optT.GetProperty("type")?.SetValue(opt, type);
                wx.GetMethod("VibrateShort", new[] { optT })?.Invoke(null, new[] { opt });
            }
            catch (Exception) { }
        }

        /// <summary>
        /// 挑选本轮真正值得停下镜头播「剪影悬念大戏」的高光席位：
        /// 传说必演、新入伙史诗必演；若全为重复卡且无传说，仅挑选压轴最后一张史诗代表演出，重复紫卡走爽脆快闪，绝不拖沓！
        /// </summary>
        static bool[] ComputeClimaxSlots(List<Pull> pulls)
        {
            int n = pulls.Count;
            var climax = new bool[n];
            if (n == 1)
            {
                climax[0] = Defs.Hero(pulls[0].Hero).Rarity >= 3;
                return climax;
            }

            int count = 0, lastEpic = -1;
            for (int i = n - 1; i >= 0; i--)
            {
                int r = Defs.Hero(pulls[i].Hero).Rarity;
                if (r >= 3 && lastEpic < 0) lastEpic = i;
                if (r >= 4 || (r == 3 && pulls[i].New))
                {
                    if (count < 3 || r >= 4)
                    {
                        climax[i] = true;
                        count++;
                    }
                }
            }
            if (count == 0 && lastEpic >= 0)
                climax[lastEpic] = true;
            return climax;
        }

        static void ShowRecruitStage(Transform layer, List<Pull> pulls)
        {
            int n = pulls.Count;
            int maxRarity = 2;
            foreach (var pl in pulls) maxRarity = Mathf.Max(maxRarity, Defs.Hero(pl.Hero).Rarity);
            var isClimax = ComputeClimaxSlots(pulls);

            var old = layer.Find("fx_pulls");
            if (old) Object.DestroyImmediate(old.gameObject);

            var root = Ui.Rect(layer, "fx_pulls");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var cg = root.gameObject.AddComponent<CanvasGroup>();
            Tween.Fade(cg, 0f, 1f, 0.16f);
            var block = Ui.Fill(root, new Color(0.02f, 0.05f, 0.10f, 1f), true, "block");
            root.SetAsLastSibling();

            bool finished = false;
            void FinishToSummary()
            {
                if (finished) return;
                finished = true;
                MetaFx.Dismiss(root);
                ShowRecruitSummary(layer, pulls);
            }

            float uiH = Ui.Height;
            float trayH = Mathf.Clamp(uiH * 0.40f, 730f, 830f);
            float stageH = uiH - trayH;
            float stageOffY = trayH + stageH * 0.5f - uiH * 0.5f;

            // ---------------- 1. 上半屏：白玉鎏金点将台 + 星夜聚光剧场 ----------------
            var stage = Ui.Rect(root, "stage");
            stage.anchorMin = Vector2.zero;
            stage.anchorMax = Vector2.one;
            stage.offsetMin = new Vector2(0f, trayH);
            stage.offsetMax = Vector2.zero;
            stage.gameObject.AddComponent<RectMask2D>();

            var stageWorld = Ui.Rect(stage, "stageWorld");
            stageWorld.sizeDelta = new Vector2(1080f, stageH);

            const float bgW = 1152f, bgH = 2048f;
            const float altarX = 36f;
            float bgY = 0.345f * bgH - stageH * 0.5f + 18f;
            float altarSurfaceY = bgY + (0.5f - 0.695f) * bgH;
            var bg = Ui.Box(stageWorld, new Vector2(bgW, bgH), new Vector2(altarX, bgY), Color.white, Art.Img("recruit_stage_bg"), "stageBg");
            bg.type = Image.Type.Simple;

            var altarWarmth = Ui.Box(stageWorld, new Vector2(520, 240), new Vector2(altarX, altarSurfaceY + 24f),
                Pal.Hex("FFD86B").A(0.22f), Art.SoftDot, "altarWarmth");
            Tween.Run(altarWarmth, 999f, k => altarWarmth.color = Pal.Hex("FFD86B").A(0.16f + 0.08f * Mathf.Sin(k * 999f * 2.8f)));

            // 深邃星夜聚光暗角：置于背景之上、特效与英雄之下！高光时只压暗背景杂光，让神光与英雄 100% 纯净夺目！
            var vignette = Ui.Icon(stageWorld, "ui/fx_stage_vignette", 1600, new Vector2(altarX, altarSurfaceY + 180f), "vignette");
            vignette.preserveAspect = false;
            vignette.rectTransform.sizeDelta = new Vector2(1560f, stageH + 540f);
            vignette.color = Color.white.A(0f);

            // 天罡双环罗盘星盘（彩晕底环 + 炽白高光内环反向旋转）
            var omen = Ui.Rect(stageWorld, "omen");
            omen.anchoredPosition = new Vector2(altarX, altarSurfaceY + 520f);
            var omenGlow = Ui.Box(omen, Vector2.one * 720f, Vector2.zero, Color.white.A(0f), Art.SoftDot, "omenGlow");
            var omenOuter = Ui.Icon(omen, "ui/fx_magic_seal", 560, Vector2.zero, "omenOuter");
            var omenInner = Ui.Icon(omen, "ui/fx_halo_ring", 430, Vector2.zero, "omenInner");
            omenOuter.color = omenInner.color = Color.white.A(0f);
            float omenSpin = 95f, omenAngle = 0f, omenLastK = 0f;
            Tween.Run(omenOuter, 999f, k =>
            {
                float dt = (k - omenLastK) * 999f;
                omenLastK = k;
                omenAngle -= dt * omenSpin;
                omenOuter.rectTransform.localRotation = Quaternion.Euler(0, 0, omenAngle);
                if (omenInner) omenInner.rectTransform.localRotation = Quaternion.Euler(0, 0, -omenAngle * 0.72f);
            });
            void OmenColor(Color c, float a)
            {
                if (!omenOuter) return;
                omenOuter.color = c.A(a);
                omenInner.color = Color.Lerp(c, Color.white, 0.72f).A(a * 0.95f);
                omenGlow.color = c.A(a * 0.46f);
                Tween.Punch(omen, 0.18f, 0.11f);
            }

            var altarHeroLayer = Ui.Rect(stageWorld, "altarHeroLayer");
            altarHeroLayer.sizeDelta = new Vector2(1080f, stageH);

            // 左下石阶：迎宾鼓官 + 大红战鼓（气泡右移入安全区，彻底消除窄屏左侧切字！）
            var drumRig = Ui.Rect(stageWorld, "drumRig");
            drumRig.anchorMin = drumRig.anchorMax = new Vector2(0.5f, 0f);
            drumRig.anchoredPosition = new Vector2(-346f, 152f);
            drumRig.sizeDelta = new Vector2(320, 320);
            drumRig.localScale = Vector3.one * 0.86f;

            Ui.Box(drumRig, new Vector2(280, 48), new Vector2(-6, -126), new Color(0.04f, 0.06f, 0.10f, 0.44f), Art.GroundShadow, "drumShadow");
            var herald = Ui.Icon(drumRig, "stage_herald", 236, new Vector2(-88, 20), "herald");
            Tween.Run(herald, 999f, k => herald.rectTransform.anchoredPosition = new Vector2(-88f, 20f + 5f * Mathf.Sin(k * 999f * 4.2f)));
            var drum = Ui.Icon(drumRig, "stage_drum", 238, new Vector2(54, -14), "drum");
            var malletPivot = Ui.Rect(drumRig, "malletPivot");
            malletPivot.anchoredPosition = new Vector2(-16, 90);
            malletPivot.localRotation = Quaternion.Euler(0, 0, 30f);
            var mallet = Ui.Icon(malletPivot, "stage_mallet", 162, new Vector2(52, 32), "mallet");
            mallet.rectTransform.localRotation = Quaternion.Euler(0, 0, -25f);

            var bubble = Ui.Rect(drumRig, "bubble");
            bubble.anchoredPosition = new Vector2(68f, 210f);
            bubble.sizeDelta = new Vector2(344, 66);
            Ui.Skin(bubble, "hint", new Vector2(344, 66), Vector2.zero, 0.82f);
            var bubbleTxt = Ui.Outlined(bubble, "铜锣敲响！全村摇人！", 22, Pal.Hex("FFF6D6"), new Vector2(0, 2), new Vector2(318, 52), Pal.Ink, 1.8f);
            Tween.Pop(bubble, 0.24f, 0.04f);
            void Say(string s, float punch = 0.09f)
            {
                if (!bubbleTxt) return;
                bubbleTxt.text = s;
                Tween.Punch(bubble, 0.18f, punch);
            }

            var skipBtn = Ui.Top(root, -396f, Ui.SafeTop + 62f, new Vector2(204, 78), "skipStageBtn");
            var skipFace = Ui.Icon(skipBtn, "ui/gacha_skip_btn", 204, Vector2.zero, "face");
            skipFace.rectTransform.sizeDelta = new Vector2(204, 78);
            Ui.Outlined(skipBtn, "跳过", 30, Color.white, new Vector2(24, 1), new Vector2(120, 56), Pal.Ink, 2.2f);
            Ui.Tap(skipFace, FinishToSummary, skipBtn);

            // ---------------- 2. 下半屏：玄金卡背 5×2 牌阵 ----------------
            var tray = Ui.Rect(root, "tray");
            tray.anchorMin = Vector2.zero;
            tray.anchorMax = new Vector2(1f, 0f);
            tray.pivot = new Vector2(0.5f, 0f);
            tray.sizeDelta = new Vector2(0f, trayH);
            tray.anchoredPosition = Vector2.zero;
            var trayBg = Ui.Skin(tray, "gacha_tray", new Vector2(1080, trayH), Vector2.zero, 1f, null, "trayBg");
            trayBg.rectTransform.anchorMin = Vector2.zero;
            trayBg.rectTransform.anchorMax = Vector2.one;
            trayBg.rectTransform.offsetMin = trayBg.rectTransform.offsetMax = Vector2.zero;

            var progBadge = Ui.Rect(root, "progBadge");
            progBadge.anchorMin = progBadge.anchorMax = new Vector2(0.5f, 0f);
            progBadge.anchoredPosition = new Vector2(0f, trayH - 2f);
            progBadge.sizeDelta = new Vector2(396, 72);
            Ui.Skin(progBadge, "gacha_oct_badge", new Vector2(396, 72), Vector2.zero, -1f);
            var progTxt = Ui.Outlined(progBadge, $"已摇人：0 / {n}", 30, Pal.Hex("FFF3C4"), new Vector2(0, 1), new Vector2(340, 54), Pal.Ink, 2.2f);

            var seatRoots = new RectTransform[n];
            var seatCentersRoot = new Vector2[n];
            Vector2 cardSz = n == 1 ? new Vector2(256f, 324f) : new Vector2(180f, 226f);
            float usableTop = trayH - 58f;
            float usableBot = Ui.SafeBottom + 36f;
            float midTrayY = (usableTop + usableBot) * 0.5f;
            for (int i = 0; i < n; i++)
            {
                Vector2 trayPos;
                if (n == 1) trayPos = new Vector2(0f, midTrayY);
                else
                {
                    int col = i % 5, row = i / 5;
                    float rowStep = Mathf.Clamp((usableTop - usableBot) * 0.48f, 244f, 286f);
                    trayPos = new Vector2((col - 2f) * 200f, midTrayY + (0.5f - row) * rowStep);
                }
                var seat = Ui.Rect(tray, "seat" + i);
                seat.anchorMin = seat.anchorMax = new Vector2(0.5f, 0f);
                seat.anchoredPosition = trayPos;
                seat.sizeDelta = cardSz;
                var preBack = Ui.Icon(seat, "ui/gacha_card_back", Mathf.Max(cardSz.x, cardSz.y), Vector2.zero, "preBack");
                preBack.preserveAspect = false;
                preBack.rectTransform.sizeDelta = cardSz;
                preBack.color = new Color(0.74f, 0.80f, 0.90f, 0.96f);
                seat.localScale = Vector3.zero;
                Tween.Run(seat, 0.18f, k => seat.localScale = Vector3.one * Tween.OutBack(k), null, 0.018f * i);
                seatRoots[i] = seat;
                seatCentersRoot[i] = new Vector2(trayPos.x, trayPos.y - uiH * 0.5f);
            }

            var flyLayer = Ui.Rect(root, "flyLayer");
            flyLayer.anchorMin = Vector2.zero;
            flyLayer.anchorMax = Vector2.one;
            flyLayer.offsetMin = flyLayer.offsetMax = Vector2.zero;

            var flash = Ui.Fill(root, Color.white.A(0f), false, "flash");
            var flashImg = flash.GetComponent<Image>();
            void Flash(Color c, float peak, float dur)
            {
                if (!flashImg) return;
                flash.SetAsLastSibling();
                skipBtn.SetAsLastSibling();
                Tween.Run(flashImg, dur, k => flashImg.color = c.A(peak * (1f - Tween.OutCubic(k))));
            }

            Vector2 altarSpotStage = new Vector2(altarX, altarSurfaceY);
            Vector2 drumFacePos = new Vector2(64f, 14f);

            void Shake(float amp, float dur = 0.22f)
            {
                Tween.Run(stageWorld, dur, k =>
                {
                    float damp = 1f - k;
                    stageWorld.anchoredPosition = new Vector2(Mathf.Sin(k * 48f) * amp * damp, Mathf.Cos(k * 40f) * amp * 0.7f * damp);
                }, () => { if (stageWorld) stageWorld.anchoredPosition = Vector2.zero; });
            }

            void BeatDrum(int rar, string shout, float vol = 0.85f)
            {
                Color beamCol = BeamColor(rar);
                Tween.Run(malletPivot, 0.08f, k => malletPivot.localRotation = Quaternion.Euler(0, 0, Mathf.Lerp(34f, -28f, Tween.InCubic(k))), () =>
                {
                    if (malletPivot)
                        Tween.Run(malletPivot, 0.16f, k => malletPivot.localRotation = Quaternion.Euler(0, 0, Mathf.Lerp(-28f, 30f, Tween.OutBack(k))));
                });
                Tween.Punch(herald.transform, 0.18f, 0.10f);
                Tween.Run(drum, 0.18f, k =>
                {
                    float s = Mathf.Sin(k * Mathf.PI);
                    drum.rectTransform.localScale = new Vector3(1f + 0.14f * s, 1f - 0.09f * s, 1f);
                }, () => { if (drum) drum.rectTransform.localScale = Vector3.one; });
                var drumGlow = Ui.Box(drumRig, Vector2.one * 180f, drumFacePos, beamCol.A(0.68f), Art.SoftDot, "drumPulse");
                Tween.Run(drumGlow, 0.26f, k =>
                {
                    drumGlow.rectTransform.localScale = Vector3.one * Mathf.Lerp(0.7f, 1.85f, Tween.OutCubic(k));
                    drumGlow.color = beamCol.A(0.68f * (1f - k));
                }, () => { if (drumGlow) Object.Destroy(drumGlow.gameObject); });
                Sfx.Play(Snd.Drum, vol, 0.96f + UnityEngine.Random.Range(0f, 0.08f));

                if (!string.IsNullOrEmpty(shout))
                {
                    var hitWord = Ui.Outlined(drumRig, shout, 29, Color.white, drumFacePos + new Vector2(22f, 88f), new Vector2(360, 52), Pal.Ink, 2.2f);
                    hitWord.rectTransform.localScale = Vector3.one * 0.5f;
                    Tween.Run(hitWord, 0.46f, k =>
                    {
                        hitWord.rectTransform.localScale = Vector3.one * (k < 0.25f ? Mathf.Lerp(0.5f, 1.18f, k / 0.25f) : Mathf.Lerp(1.18f, 0.96f, (k - 0.25f) / 0.75f));
                        hitWord.rectTransform.anchoredPosition = drumFacePos + new Vector2(22f + k * 16f, 88f + Tween.OutCubic(k) * 56f);
                        if (k > 0.62f) hitWord.color = hitWord.color.A(1f - (k - 0.62f) / 0.38f);
                    }, () => { if (hitWord) Object.Destroy(hitWord.gameObject); });
                }
            }

            // ---------------- 3. 疾风连打 + 高光驻足导演状态机 ----------------
            int cur = -1, flipped = 0, seqToken = 0;
            bool canAdvance = false;
            var dispatched = new bool[n];
            RectTransform curNode = null;
            Action instantReveal = null;

            void Dispatch(RectTransform heroNode, int hIdx)
            {
                if (hIdx < 0 || hIdx >= n || dispatched[hIdx] || finished) return;
                dispatched[hIdx] = true;
                var plPrev = pulls[hIdx];
                var dPrev = Defs.Hero(plPrev.Hero);
                Color colPrev = BeamColor(dPrev.Rarity);
                Vector2 fromRoot = new Vector2(altarX, altarSurfaceY + 170f + stageOffY);

                if (heroNode)
                {
                    var hCg = heroNode.GetComponent<CanvasGroup>();
                    if (!hCg) hCg = heroNode.gameObject.AddComponent<CanvasGroup>();
                    Tween.Run(heroNode, 0.14f, k =>
                    {
                        if (!heroNode) return;
                        heroNode.localScale = Vector3.one * Mathf.Lerp(1f, 0.42f, k);
                        if (hCg) hCg.alpha = 1f - k;
                    }, () => { if (heroNode) Object.Destroy(heroNode.gameObject); });
                }

                Vector2 toRoot = seatCentersRoot[hIdx];
                var comet = Ui.Rect(flyLayer, "soulComet_" + hIdx);
                comet.anchoredPosition = fromRoot;
                comet.sizeDelta = new Vector2(150, 150);
                Ui.Box(comet, Vector2.one * (dPrev.Rarity >= 4 ? 240 : 175), Vector2.zero, colPrev.A(0.92f), Art.SoftDot, "glow");
                Ui.Icon(comet, "ui/fx_shock_burst", dPrev.Rarity >= 4 ? 175 : 130, Vector2.zero, "flare").color = Color.Lerp(colPrev, Color.white, 0.68f);
                Tween.Run(comet, 0.20f, k =>
                {
                    Vector2 pos = Vector2.Lerp(fromRoot, toRoot, Tween.InCubic(k) * 0.35f + Tween.OutCubic(k) * 0.65f);
                    pos.y += Mathf.Sin(k * Mathf.PI) * 64f;
                    comet.anchoredPosition = pos;
                    comet.localScale = Vector3.one * Mathf.Lerp(1.12f, 0.70f, k);
                    comet.localRotation = Quaternion.Euler(0, 0, k * 240f);
                }, () =>
                {
                    if (comet) Object.Destroy(comet.gameObject);
                    if (!root || finished) return;
                    FlipStageSeatCard(seatRoots[hIdx], flyLayer, toRoot, plPrev, dPrev, cardSz, () =>
                    {
                        if (!root || finished) return;
                        flipped++;
                        progTxt.text = $"已摇人：{flipped} / {n}";
                        Tween.Punch(progBadge, 0.16f, 0.09f);
                        if (flipped >= n)
                        {
                            Say(n > 1 ? "全员到齐！乡亲们抄家伙上墙！" : "乡亲到场！一块痛扁外星人！");
                            Tween.Run(root, 0.52f, _ => { }, FinishToSummary);
                        }
                    });
                });
            }

            float legendGuardUntil = 0f;

            void Advance()
            {
                if (finished) return;
                // 若当前正在剪影蓄力或流星飞行，轻点屏幕直接瞬切破晓揭晓！
                if (instantReveal != null)
                {
                    var rev = instantReveal;
                    instantReveal = null;
                    rev();
                    return;
                }
                if (!canAdvance || Time.realtimeSinceStartup < legendGuardUntil) return;
                canAdvance = false;
                seqToken++;
                int idx = cur;
                var node = curNode;
                curNode = null;
                Dispatch(node, idx);
                if (idx + 1 < n)
                    PlayHero(idx + 1);
            }

            var tapDummy = Ui.Rect(root, "tapDummy");
            Ui.Tap(block.GetComponent<Image>(), Advance, tapDummy, false);

            void Reveal(int idx, Pull pl, HeroDef d, bool climax, SilFx sil)
            {
                if (!root || finished || cur != idx) return;
                instantReveal = null;
                int r = d.Rarity;
                Color trueCol = BeamColor(r);
                if (sil != null && sil.Node) Object.Destroy(sil.Node.gameObject);

                if (climax)
                {
                    // 高光破晓：横贯全屏电影级星芒斩 + 速度线放射 + 闪屏退暗角
                    Flash(Color.Lerp(trueCol, Color.white, 0.65f), r >= 4 ? 0.88f : 0.62f, r >= 4 ? 0.44f : 0.32f);

                    var slash = Ui.Icon(altarHeroLayer, "ui/fx_arc_slash", 1360, altarSpotStage + new Vector2(0, 178f), "dawnSlash");
                    slash.preserveAspect = false;
                    slash.rectTransform.sizeDelta = new Vector2(1380f, r >= 4 ? 360f : 280f);
                    slash.color = Color.Lerp(trueCol, Color.white, 0.55f);
                    Tween.Run(slash, 0.36f, k =>
                    {
                        slash.rectTransform.localScale = new Vector3(Mathf.Lerp(0.45f, 1.22f, Tween.OutCubic(k)), Mathf.Lerp(1.35f, 0.15f, k), 1f);
                        slash.color = slash.color.A(1f - k * k);
                    }, () => { if (slash) Object.Destroy(slash.gameObject); });

                    var lines = Ui.Icon(altarHeroLayer, "ui/fx_speed_lines", 1500, altarSpotStage + new Vector2(0, 170f), "speedLines");
                    lines.color = Color.Lerp(trueCol, Color.white, 0.45f).A(0.92f);
                    Tween.Run(lines, r >= 4 ? 0.78f : 0.56f, k =>
                    {
                        lines.rectTransform.localScale = Vector3.one * Mathf.Lerp(1.22f, 0.98f, Tween.OutCubic(k));
                        lines.color = lines.color.A(0.92f * (1f - k));
                    }, () => { if (lines) Object.Destroy(lines.gameObject); });

                    float v0 = vignette.color.a;
                    Tween.Run(vignette, 0.55f, k => vignette.color = Color.white.A(Mathf.Lerp(v0, 0f, k)));
                    float push0 = stageWorld.localScale.x;
                    Tween.Run(stageWorld, 0.65f, k => stageWorld.localScale = Vector3.one * Mathf.Lerp(push0, 1f, Tween.OutCubic(k)));
                    Shake(r >= 4 ? 12f : 7f, 0.28f);
                }
                else if (r == 3)
                {
                    // 重复史诗快闪：利落微闪 + 小幅震屏，不拖泥带水
                    Flash(Color.Lerp(trueCol, Color.white, 0.6f), 0.28f, 0.20f);
                    Shake(4.5f, 0.18f);
                }

                Haptic(root, r >= 4 ? 3 : r == 3 ? 2 : 1);
                Sfx.Play(r >= 4 ? Snd.Jackpot : r == 3 ? Snd.Unlock : Snd.Reveal, r >= 4 ? 1f : r == 3 ? 0.82f : 0.68f);

                curNode = SpawnAltarHeroSpotlight(altarHeroLayer, altarSpotStage, d, pl.New, climax);
                if (climax && r >= 3)
                {
                    string bigTitle = r >= 4 ? "镇村战神" : (pl.New ? "硬核乡亲" : "高手助阵");
                    var word = MetaFx.BigWord(curNode, bigTitle, new Vector2(0, 528), r >= 4 ? 88 : 72);
                    if (r < 4) word.color = Pal.Hex("F5C6FF");
                }
                if (r >= 4)
                {
                    legendGuardUntil = Time.realtimeSinceStartup + 0.60f;
                    if (!string.IsNullOrEmpty(d.UltName))
                    {
                        var uPill = Ui.Rect(curNode, "ultPill");
                        uPill.anchoredPosition = new Vector2(0, -48f);
                        uPill.sizeDelta = new Vector2(396, 48);
                        Ui.Skin(uPill, "gacha_oct_badge", new Vector2(396, 48), Vector2.zero, -1f);
                        Ui.Outlined(uPill, $"★ 镇村大招：{d.UltName} ★", 22, Pal.Hex("FFF4B8"), Vector2.zero, new Vector2(376, 40), Pal.Ink, 1.9f);
                        Tween.Pop(uPill, 0.22f, 0.08f);
                    }
                }
                if (r >= 4) Say($"金光破晓！【{d.Name}】扛家伙来啦！", 0.15f);
                else if (climax && r == 3) Say($"紫电闪耀！【{d.Name}】赶到村口！", 0.12f);
                else if (r == 3) Say($"硬核出手！【{d.Name}】前来助阵！");
                else if (idx % 3 == 1) Say("锣声一响！热心乡亲到场！");

                // 疾风蓝卡 0.24s 流水连击 / 重复紫卡 0.44s 爽脆快闪 / 高光角色 1.15s~1.40s 尽情亮相！
                float hold = climax ? (r >= 4 ? 1.40f : 1.15f) : (r == 3 ? 0.44f : 0.24f);
                canAdvance = true;
                int tok = ++seqToken;
                Tween.Run(root, hold, _ => { }, () => { if (tok == seqToken && canAdvance) Advance(); });
            }

            void PlayHero(int i)
            {
                if (!root || finished) return;
                cur = i;
                canAdvance = false;
                int myTok = ++seqToken;
                var pl = pulls[i];
                var d = Defs.Hero(pl.Hero);
                int r = d.Rarity;
                bool climax = isClimax[i];

                // 仅在真正的高光席位才可能触发「天机异变」升阶反转！
                int startR = r;
                if (climax)
                {
                    if (r >= 4 && UnityEngine.Random.value < 0.65f) startR = 3;
                    else if (r == 3 && UnityEngine.Random.value < 0.35f) startR = 2;
                }
                bool fake = startR != r;
                Color startCol = BeamColor(startR), trueCol = BeamColor(r);

                string shout = climax && startR >= 4 ? $"<color=#FFE866>震天巨响!!</color> ×{i + 1}"
                    : startR >= 3 ? $"<color=#F2A8FF>好鼓!</color> ×{i + 1}"
                    : $"<color=#94E6FF>连击</color> ×{i + 1}";
                BeatDrum(startR, shout, climax ? 0.92f : 0.72f);
                if (climax) Haptic(root, 1);

                Vector2 skyStart = new Vector2(altarX - 170f, stageH * 0.5f + 210f);
                Vector2 skyEnd = altarSpotStage + new Vector2(0f, 36f);
                Vector2 dir = (skyEnd - skyStart).normalized;
                var meteor = Ui.Icon(altarHeroLayer, "ui/fx_meteor_streak", 440, skyStart, "meteor_" + i);
                meteor.preserveAspect = false;
                meteor.rectTransform.sizeDelta = new Vector2(climax ? 216f : 164f, climax ? 470f : 390f);
                meteor.rectTransform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg + 90f);
                meteor.color = Color.Lerp(startCol, Color.white, 0.38f);

                SilFx sil = null;
                instantReveal = () =>
                {
                    if (meteor) Object.Destroy(meteor.gameObject);
                    Reveal(i, pl, d, climax, sil);
                };

                float meteorDur = climax ? 0.22f : (r == 3 ? 0.15f : 0.12f);
                Tween.Run(meteor, meteorDur, k =>
                {
                    meteor.rectTransform.anchoredPosition = Vector2.Lerp(skyStart, skyEnd, Tween.InCubic(k) * 0.3f + k * 0.7f);
                    meteor.rectTransform.localScale = new Vector3(Mathf.Lerp(0.75f, 1.15f, k), Mathf.Lerp(0.85f, 1.25f, k), 1f);
                }, () =>
                {
                    if (meteor) Object.Destroy(meteor.gameObject);
                    if (!root || finished || myTok != seqToken) return;

                    if (!climax)
                    {
                        Reveal(i, pl, d, false, null);
                        return;
                    }

                    // 高光时刻：星夜聚光剧场开启 + 镜头推近 + 双环罗盘四向金边星云剪影！
                    Shake(r >= 4 ? 7f : 4.5f, 0.20f);
                    float vigTo = r >= 4 ? 0.94f : 0.84f;
                    float vig0 = vignette.color.a;
                    Tween.Run(vignette, 0.26f, k => vignette.color = Color.white.A(Mathf.Lerp(vig0, vigTo, k)));
                    float push = r >= 4 ? 1.15f : 1.09f;
                    Tween.Run(stageWorld, 0.50f, k => stageWorld.localScale = Vector3.one * Mathf.Lerp(1f, push, Tween.OutCubic(k)));
                    Say(startR >= 3 ? "舞台聚光……是村里哪位高手？" : "看那熟悉的身影……");
                    Sfx.Play(Snd.Spell, 0.75f);

                    sil = SpawnSilhouette(altarHeroLayer, altarSpotStage, d, startCol);
                    float silDur = r >= 4 ? 0.56f : 0.44f;

                    void HitStopThenReveal()
                    {
                        if (!root || finished || myTok != seqToken) return;
                        if (sil != null) sil.Frozen = true;
                        Tween.Run(root, 0.10f, _ => { }, () =>
                        {
                            if (myTok == seqToken) Reveal(i, pl, d, true, sil);
                        });
                    }

                    Tween.Run(root, silDur, _ => { }, () =>
                    {
                        if (!root || finished || myTok != seqToken) return;
                        if (!fake)
                        {
                            HitStopThenReveal();
                            return;
                        }
                        // 天机异变：双层炽白+彩晕惊雷裂空，光色升阶暴涨！
                        if (sil != null) sil.Frozen = true;
                        Haptic(root, 2);
                        Sfx.Play(Snd.Thunder, 0.96f);
                        Shake(r >= 4 ? 11f : 7f, 0.28f);

                        var crackWrap = Ui.Rect(altarHeroLayer, "crackWrap");
                        crackWrap.anchoredPosition = altarSpotStage + new Vector2(0, 185f);
                        var crackGlow = Ui.Icon(crackWrap, "ui/fx_lightning_crack", 620, Vector2.zero, "glow");
                        var crackCore = Ui.Icon(crackWrap, "ui/fx_lightning_crack", 590, Vector2.zero, "core");
                        crackGlow.color = trueCol;
                        crackCore.color = Color.Lerp(trueCol, Color.white, 0.82f);
                        Tween.Run(crackWrap, 0.46f, k =>
                        {
                            float a = k < 0.22f ? 1f : 1f - (k - 0.22f) / 0.78f;
                            crackGlow.color = trueCol.A(a);
                            crackCore.color = Color.Lerp(trueCol, Color.white, 0.82f).A(a);
                            crackWrap.localScale = Vector3.one * Mathf.Lerp(0.78f, 1.28f, Tween.OutCubic(k));
                        }, () => { if (crackWrap) Object.Destroy(crackWrap.gameObject); });

                        Flash(Color.Lerp(trueCol, Color.white, 0.5f), 0.46f, 0.26f);
                        Say(r >= 4 ? "好家伙？！金光暴涨——隐藏战神出山！！" : "不对！紫光冲天升阶了！", 0.16f);
                        sil?.SetColor(trueCol);
                        Tween.Run(root, 0.10f, _ => { }, () =>
                        {
                            if (sil != null) { sil.Frozen = false; sil.Spin = 3.2f; }
                        });
                        Tween.Run(root, 0.46f, _ => { }, HitStopThenReveal);
                    });
                });
            }

            // ---------------- 4. 凝练序幕（0.82s ~ 1.08s）：一鼓开天盘 + 十星齐落入阵 ----------------
            omen.localScale = Vector3.one * 1.12f;
            Tween.Run(vignette, 0.24f, k => vignette.color = Color.white.A(0.72f * k));
            BeatDrum(maxRarity >= 3 ? 3 : 2, "开大锣！");
            OmenColor(BeamColor(2), 0.90f);
            Haptic(root, 1);
            Tween.Run(omen, 0.24f, k => omen.localScale = Vector3.one * Mathf.Lerp(1.55f, 1.12f, Tween.OutCubic(k)));

            if (maxRarity >= 3)
            {
                Tween.Run(root, 0.001f, _ => { }, () =>
                {
                    if (!root || finished) return;
                    omenSpin = 175f;
                    OmenColor(BeamColor(3), 0.96f);
                    Say("舞台泛紫！有硬核高手！");
                    Haptic(root, 2);
                }, 0.26f);
            }

            float preEnd = 0.84f;
            if (maxRarity >= 4)
            {
                Tween.Run(root, 0.001f, _ => { }, () =>
                {
                    if (!root || finished) return;
                    omenSpin = 260f;
                    OmenColor(BeamColor(4), 1f);
                    Flash(Pal.Hex("FFE7A0"), 0.65f, 0.36f);
                    Shake(9f, 0.25f);
                    Haptic(root, 3);
                    Sfx.Play(Snd.Jackpot, 0.92f);
                    Say("金光耀村口！必有镇村战神！", 0.16f);
                }, 0.50f);
                preEnd = 1.08f;
            }

            // 十道命星流光齐射入牌阵（0.28s 飒爽落座，高品质卡背泛出华彩微光）
            Tween.Run(root, 0.001f, _ => { }, () =>
            {
                if (!root || finished) return;
                Vector2 omenRoot = new Vector2(omen.anchoredPosition.x, omen.anchoredPosition.y + stageOffY);
                for (int s = 0; s < n; s++)
                {
                    int si = s;
                    int rs = Defs.Hero(pulls[si].Hero).Rarity;
                    Color sc = rs >= 3 ? BeamColor(rs) : Pal.Hex("B8E6FF");
                    var star = Ui.Box(flyLayer, Vector2.one * (rs >= 4 ? 80f : 62f), omenRoot, Color.Lerp(sc, Color.white, 0.45f), Art.Sparkle, "omenStar");
                    Vector2 to = seatCentersRoot[si];
                    Tween.Run(star, 0.26f, k =>
                    {
                        Vector2 p = Vector2.Lerp(omenRoot, to, Tween.InCubic(k));
                        p.x += Mathf.Sin(k * Mathf.PI) * (si % 5 - 2) * 34f;
                        star.rectTransform.anchoredPosition = p;
                        star.rectTransform.localRotation = Quaternion.Euler(0, 0, k * 320f);
                    }, () =>
                    {
                        if (star) Object.Destroy(star.gameObject);
                        var seat = seatRoots[si];
                        if (!seat) return;
                        Tween.Punch(seat, 0.14f, 0.08f);
                        if (rs >= 3)
                        {
                            var hint = Ui.Box(seat, new Vector2(cardSz.x * 1.44f, cardSz.y * 1.34f), Vector2.zero, sc.A(rs >= 4 ? 0.65f : 0.42f), Art.SoftDot, "hint");
                            hint.transform.SetAsFirstSibling();
                            var sigil = Ui.Icon(seat, "ui/fx_magic_seal", cardSz.x * 0.72f, Vector2.zero, "sigil");
                            sigil.color = Color.Lerp(sc, Color.white, 0.55f).A(rs >= 4 ? 0.85f : 0.58f);
                            Tween.Run(sigil, 999f, k =>
                            {
                                sigil.rectTransform.localRotation = Quaternion.Euler(0, 0, k * 999f * (rs >= 4 ? 48f : 30f));
                                if (hint) hint.color = sc.A((rs >= 4 ? 0.48f : 0.30f) + 0.16f * Mathf.Sin(k * 999f * 4.2f));
                            });
                        }
                    }, si * 0.018f);
                }
            }, preEnd - 0.34f);

            Tween.Run(root, 0.001f, _ => { }, () =>
            {
                if (!root || finished) return;
                Tween.Run(omen, 0.24f, k =>
                {
                    if (omenOuter) omenOuter.color = omenOuter.color.A(Mathf.Lerp(omenOuter.color.a, 0f, k));
                    if (omenInner) omenInner.color = omenInner.color.A(Mathf.Lerp(omenInner.color.a, 0f, k));
                    if (omenGlow) omenGlow.color = omenGlow.color.A(Mathf.Lerp(omenGlow.color.a, 0f, k));
                    if (vignette) vignette.color = Color.white.A(Mathf.Lerp(vignette.color.a, 0f, k));
                });
                PlayHero(0);
            }, preEnd);
        }

        /// <summary>
        /// 高光角色登场前的星云鎏金剪影：
        /// 1. 地面透视双层反向旋转天罡罗盘（饱和彩晕底盘 + 炽白高光星轨盘）；
        /// 2. 彩晕+白芯双层丝绸圣光柱；
        /// 3. 四向均匀等距流光金边轮廓（绝无缩放偏位！）+ 玄靛神秘剪影 + 胸口呼吸命星耀斑！
        /// </summary>
        static SilFx SpawnSilhouette(RectTransform parent, Vector2 altarPos, HeroDef d, Color col)
        {
            var fx = new SilFx();
            Color hot = Color.Lerp(col, Color.white, 0.78f);
            var node = Ui.Rect(parent, "sil_" + d.Id);
            node.anchoredPosition = altarPos;
            node.sizeDelta = new Vector2(500, 560);
            fx.Node = node;
            var cgN = node.gameObject.AddComponent<CanvasGroup>();
            Tween.Fade(cgN, 0f, 1f, 0.16f);

            // 1. 地面透视双层反向旋转天罡罗盘
            var flat = Ui.Rect(node, "sealFlat");
            flat.anchoredPosition = new Vector2(0, 8);
            flat.localScale = new Vector3(0.25f, 0.38f, 1f);
            fx.Aura = Ui.Box(flat, Vector2.one * 640f, Vector2.zero, col.A(0.55f), Art.SoftDot, "aura");
            fx.SealOuter = Ui.Icon(flat, "ui/fx_magic_seal", 520, Vector2.zero, "sealOuter");
            fx.SealInner = Ui.Icon(flat, "ui/fx_halo_ring", 390, Vector2.zero, "sealInner");
            fx.SealOuter.color = col.A(0.95f);
            fx.SealInner.color = hot.A(0.96f);
            Tween.Run(flat, 0.26f, k => flat.localScale = new Vector3(Mathf.Lerp(0.25f, 1.04f, Tween.OutBack(k)), 0.38f, 1f));
            float ang = 0f, lastK = 0f;
            Tween.Run(fx.SealOuter, 999f, k =>
            {
                float dt = (k - lastK) * 999f;
                lastK = k;
                if (fx.Frozen) return;
                ang += dt * 210f * fx.Spin;
                fx.SealOuter.rectTransform.localRotation = Quaternion.Euler(0, 0, ang);
                if (fx.SealInner) fx.SealInner.rectTransform.localRotation = Quaternion.Euler(0, 0, -ang * 1.25f);
            });

            // 2. 双层体积感冲天圣光柱（外层饱和光晕 + 内层炽白光芯）
            fx.PillarGlow = Ui.Icon(node, "ui/fx_summon_pillar", 860, new Vector2(0, 410), "pillarGlow");
            fx.PillarGlow.preserveAspect = false;
            fx.PillarGlow.rectTransform.sizeDelta = new Vector2(310f, 860f);
            fx.PillarGlow.color = col.A(0.78f);

            fx.PillarCore = Ui.Icon(node, "ui/fx_summon_pillar", 860, new Vector2(0, 410), "pillarCore");
            fx.PillarCore.preserveAspect = false;
            fx.PillarCore.rectTransform.sizeDelta = new Vector2(118f, 860f);
            fx.PillarCore.color = hot.A(0.92f);

            // 3. 四向均匀等距流光轮廓 + 深靛玄金剪影（彻底解决缩放描边脚底与武器错位！）
            var silWrap = Ui.Rect(node, "silWrap");
            silWrap.anchoredPosition = new Vector2(0, 162);
            silWrap.sizeDelta = new Vector2(380, 380);

            var idle = Art.Frames(d.Art);
            Sprite sp0 = idle != null && idle.Length > 0 ? idle[0] : null;
            Vector2[] rimOffsets = { new Vector2(-4.5f, 0f), new Vector2(4.5f, 0f), new Vector2(0f, -4.5f), new Vector2(0f, 4.5f) };
            fx.Rims = new Image[rimOffsets.Length];
            Color rimCol = Color.Lerp(col, Color.white, 0.52f).A(0.92f);
            for (int r = 0; r < rimOffsets.Length; r++)
            {
                var rm = Ui.Icon(silWrap, d.Art, 368, rimOffsets[r], "rim" + r);
                if (sp0) rm.sprite = sp0;
                rm.color = rimCol;
                fx.Rims[r] = rm;
            }

            fx.Sil = Ui.Icon(silWrap, d.Art, 368, Vector2.zero, "sil");
            if (sp0) fx.Sil.sprite = sp0;
            fx.Sil.color = new Color(0.05f, 0.06f, 0.14f, 0.96f);

            // 剪影胸口闪烁的「天罡命星」十字星耀，神秘感与精致感点睛
            fx.HeartStar = Ui.Icon(silWrap, "ui/fx_shock_burst", 148, new Vector2(0, 12f), "heartStar");
            fx.HeartStar.color = hot;

            Tween.Run(silWrap, 999f, k =>
            {
                if (fx.Frozen) return;
                float t = k * 999f;
                silWrap.anchoredPosition = new Vector2(Mathf.Sin(t * 40f) * 2.2f, 162f + Mathf.Sin(t * 6f) * 3f);
                if (fx.HeartStar)
                {
                    fx.HeartStar.rectTransform.localRotation = Quaternion.Euler(0, 0, t * 90f);
                    fx.HeartStar.rectTransform.localScale = Vector3.one * (0.85f + 0.25f * Mathf.Sin(t * 14f));
                }
            });

            for (int s = 0; s < 14; s++)
            {
                float a = s * (Mathf.PI * 2f / 14f);
                float rad = UnityEngine.Random.Range(220f, 320f);
                Vector2 from = new Vector2(Mathf.Cos(a) * rad, 150f + Mathf.Sin(a) * rad * 0.65f);
                Vector2 to = new Vector2(0f, 174f);
                var sp = Ui.Box(node, Vector2.one * UnityEngine.Random.Range(22f, 38f), from, hot, Art.Sparkle, "gather");
                Tween.Run(sp, 0.38f, k =>
                {
                    sp.rectTransform.anchoredPosition = Vector2.Lerp(from, to, Tween.InCubic(k));
                    sp.color = sp.color.A(k < 0.8f ? 1f : (1f - k) * 5f);
                }, () => { if (sp) Object.Destroy(sp.gameObject); }, UnityEngine.Random.Range(0f, 0.24f));
            }
            return fx;
        }

        /// <summary>
        /// 白玉鎏金点将台·英雄破光特写登场：
        /// 双层体积感圣光天柱 + 72 针鎏金日轮背光神环（fx_halo_ring）+ 368px 高清英雄弹性降临 + 展翼报幕铭牌。
        /// </summary>
        static RectTransform SpawnAltarHeroSpotlight(RectTransform parent, Vector2 altarPos, HeroDef d, bool isNew, bool climax = false)
        {
            int tier = HeroTier(d.Rarity);
            Color glowCol = tier >= 3 ? Pal.Hex("FFB82E") : tier == 2 ? Pal.Hex("C85CFF") : Pal.Hex("58CCFF");
            Color hotCol = Color.Lerp(glowCol, Color.white, 0.76f);

            var node = Ui.Rect(parent, "spotHero_" + d.Id);
            node.anchoredPosition = altarPos;
            node.sizeDelta = new Vector2(500, 560);
            node.gameObject.AddComponent<CanvasGroup>();

            // 1. 双层体积感冲天圣光柱（宽幅彩晕 + 炽白光芯，通透璀璨不发灰）
            float basePillarW = tier >= 3 ? 460f : tier == 2 ? 360f : 270f;
            var pillarGlow = Ui.Icon(node, "ui/fx_summon_pillar", 920, new Vector2(0, 440), "pillarGlow");
            pillarGlow.preserveAspect = false;
            pillarGlow.rectTransform.sizeDelta = new Vector2(basePillarW, 920f);
            pillarGlow.color = glowCol.A(0.85f);

            var pillarCore = Ui.Icon(node, "ui/fx_summon_pillar", 920, new Vector2(0, 440), "pillarCore");
            pillarCore.preserveAspect = false;
            pillarCore.rectTransform.sizeDelta = new Vector2(basePillarW * 0.42f, 920f);
            pillarCore.color = hotCol.A(0.95f);

            Tween.Run(pillarGlow, 0.44f, k =>
            {
                float sx = k < 0.20f ? Mathf.Lerp(0.3f, 1.28f, Tween.OutCubic(k / 0.20f)) : Mathf.Lerp(1.28f, 0.72f, (k - 0.20f) / 0.80f);
                pillarGlow.rectTransform.localScale = new Vector3(sx, 1f, 1f);
                if (pillarCore) pillarCore.rectTransform.localScale = new Vector3(sx * 0.9f, 1f, 1f);
                float fade = k < 0.24f ? 1f : Mathf.Lerp(1f, climax ? 0.45f : 0.26f, (k - 0.24f) / 0.76f);
                pillarGlow.color = glowCol.A(0.85f * fade);
                if (pillarCore) pillarCore.color = hotCol.A(0.95f * fade);
            });

            // 2. 干净真实的贴地柔和脚影
            Ui.Box(node, new Vector2(204, 44), new Vector2(0, -2), new Color(0.06f, 0.04f, 0.03f, 0.46f), Art.GroundShadow, "footShadow");

            // 3. 英雄背后神圣法相：史诗/传说专属 72 针鎏金日轮 + 反向天罡内环！
            float haloSz = tier >= 3 ? 560f : tier == 2 ? 470f : 360f;
            if (tier >= 2)
            {
                var sunHalo = Ui.Icon(node, "ui/fx_halo_ring", haloSz, new Vector2(0, 168), "sunHalo");
                sunHalo.color = Color.Lerp(glowCol, Color.white, 0.42f).A(tier >= 3 ? 0.94f : 0.78f);
                Tween.Run(sunHalo, 999f, k => sunHalo.rectTransform.localRotation = Quaternion.Euler(0, 0, k * 999f * 26f));

                if (tier >= 3 || climax)
                {
                    var innerSeal = Ui.Icon(node, "ui/fx_magic_seal", haloSz * 0.74f, new Vector2(0, 168), "innerSeal");
                    innerSeal.color = hotCol.A(0.76f);
                    Tween.Run(innerSeal, 999f, k => innerSeal.rectTransform.localRotation = Quaternion.Euler(0, 0, -k * 999f * 36f));
                }
            }
            else
            {
                var backFlare = Ui.Icon(node, "ui/fx_shock_burst", haloSz, new Vector2(0, 160), "backFlare");
                backFlare.color = hotCol.A(0.62f);
                Tween.Run(backFlare, 999f, k => backFlare.rectTransform.localRotation = Quaternion.Euler(0, 0, k * 999f * 32f));
            }

            var popBurst = Ui.Icon(node, "ui/fx_shock_burst", haloSz * 1.18f, new Vector2(0, 160), "popBurst");
            popBurst.color = Color.white.A(0.94f);
            Tween.Run(popBurst, 0.26f, k =>
            {
                popBurst.rectTransform.localScale = Vector3.one * Mathf.Lerp(0.45f, 1.65f, Tween.OutCubic(k));
                popBurst.color = Color.Lerp(Color.white, glowCol, k).A(0.94f * (1f - k));
            }, () => { if (popBurst) Object.Destroy(popBurst.gameObject); });

            int sparkCount = tier >= 3 ? 16 : tier == 2 ? 10 : 5;
            for (int s = 0; s < sparkCount; s++)
            {
                float sx0 = UnityEngine.Random.Range(-155f, 155f);
                float sy0 = UnityEngine.Random.Range(-6f, 80f);
                float sy1 = sy0 + UnityEngine.Random.Range(180f, 340f);
                float sSz = UnityEngine.Random.Range(20f, 40f);
                var sp = Ui.Box(node, Vector2.one * sSz, new Vector2(sx0, sy0),
                    Color.Lerp(glowCol, Color.white, UnityEngine.Random.Range(0.45f, 0.88f)), Art.Sparkle, "sp");
                Tween.Run(sp, UnityEngine.Random.Range(0.38f, 0.62f), k =>
                {
                    sp.rectTransform.anchoredPosition = new Vector2(sx0 + Mathf.Sin(k * 8f + s) * 18f, Mathf.Lerp(sy0, sy1, Tween.OutCubic(k)));
                    sp.rectTransform.localScale = Vector3.one * (1f - k * 0.6f);
                    sp.color = sp.color.A(1f - k * k);
                }, () => { if (sp) Object.Destroy(sp.gameObject); });
            }

            // 4. 368px 巨幅高清英雄真身破光降临
            var heroHolder = Ui.Rect(node, "heroHolder");
            heroHolder.anchoredPosition = new Vector2(0, 162);
            heroHolder.sizeDelta = new Vector2(368, 368);

            var idleFrames = Art.Frames(d.Art);
            var heroImg = Ui.Icon(heroHolder, d.Art, 368, Vector2.zero, "heroArt");
            if (idleFrames != null && idleFrames.Length > 0) heroImg.sprite = idleFrames[0];

            var flashCopy = Ui.Icon(heroHolder, d.Art, 368, Vector2.zero, "flash");
            if (idleFrames != null && idleFrames.Length > 0) flashCopy.sprite = idleFrames[0];
            flashCopy.color = Color.white.A(0.90f);
            Tween.Run(flashCopy, 0.20f, k =>
            {
                flashCopy.rectTransform.localScale = Vector3.one * Mathf.Lerp(1.10f, 1.0f, k);
                flashCopy.color = hotCol.A(0.90f * (1f - Tween.OutCubic(k)));
            }, () => { if (flashCopy) Object.Destroy(flashCopy.gameObject); });

            Tween.Run(heroHolder, 0.20f, k =>
            {
                float dropY = Mathf.Lerp(256f, 162f, Tween.OutCubic(Mathf.Clamp01(k / 0.62f)));
                heroHolder.anchoredPosition = new Vector2(0f, dropY);
                if (k < 0.58f)
                {
                    float t = k / 0.58f;
                    heroHolder.localScale = new Vector3(Mathf.Lerp(0.78f, 1.07f, t), Mathf.Lerp(1.24f, 0.94f, t), 1f);
                }
                else
                {
                    float t = (k - 0.58f) / 0.42f;
                    heroHolder.localScale = Vector3.Lerp(new Vector3(1.07f, 0.94f, 1f), Vector3.one, Tween.OutBack(t));
                }
            }, () =>
            {
                if (!heroHolder) return;
                Tween.Run(heroHolder, 999f, k =>
                {
                    heroHolder.anchoredPosition = new Vector2(0f, 162f + 5f * Mathf.Sin(k * 999f * 4.2f));
                    var curIdle = Art.Frames(d.Art);
                    if (curIdle != null && curIdle.Length > 1)
                        heroImg.sprite = curIdle[Mathf.FloorToInt(k * 999f * 6f) % curIdle.Length];
                });
            });

            // 5. 头顶高定鎏金展翼英雄报幕铭牌
            var plaque = Ui.Rect(node, "heroPlaque");
            plaque.anchoredPosition = new Vector2(0, 386);
            plaque.sizeDelta = new Vector2(444, 88);
            var pImg = Ui.Icon(plaque, "ui/fx_hero_plaque", 444, Vector2.zero, "pBg");
            pImg.preserveAspect = false;
            pImg.rectTransform.sizeDelta = new Vector2(444, 88);

            var tagPill = Ui.Rect(plaque, "qTag");
            tagPill.anchoredPosition = new Vector2(0, 44);
            tagPill.sizeDelta = new Vector2(168, 34);
            Ui.Box(tagPill, new Vector2(168, 32), Vector2.zero, QualBanner(tier), Art.Pill);
            Ui.Box(tagPill, new Vector2(164, 28), Vector2.zero, Color.white.A(0.16f), Art.Pill);
            Ui.Outlined(tagPill, $"{RarityName(d.Rarity)} · {d.Role}", 20, Color.white, Vector2.zero, new Vector2(162, 32), QualStroke(tier), 1.6f);

            string fullTitle = !string.IsNullOrEmpty(d.Nick) ? $"<color=#FFE28A>「{d.Nick}」</color>{d.Name}" : d.Name;
            Ui.SingleLine(Ui.Outlined(plaque, fullTitle, 31, Color.white, new Vector2(0, -3), new Vector2(396, 52), Pal.Ink, 2.3f), 20);

            if (isNew)
                Badge(plaque, "新乡亲!", Pal.Red, new Vector2(98, 34), new Vector2(158, 38), 19);

            Tween.Pop(plaque, 0.20f, 0.03f);
            return node;
        }

        /// <summary>
        /// 席位 3D 立体翻牌仪式（干脆利落 + 竖向破晓白金光缝 + 斜向闪卡扫光）。
        /// </summary>
        static void FlipStageSeatCard(RectTransform seat, RectTransform fxLayer, Vector2 rootPos, Pull pl, HeroDef d, Vector2 sz, Action onFlipped)
        {
            for (int i = seat.childCount - 1; i >= 0; i--)
                Object.Destroy(seat.GetChild(i).gameObject);

            int tier = HeroTier(d.Rarity);
            Color qCol = BeamColor(d.Rarity);

            var backGlow = Ui.Box(seat, new Vector2(sz.x * 1.50f, sz.y * 1.40f), Vector2.zero,
                qCol.A(tier >= 3 ? 0.78f : tier >= 2 ? 0.50f : 0.22f), Art.SoftDot, "glow");

            var front = BuildStageFlippedCardFace(seat, pl, d, sz);
            front.localScale = new Vector3(0f, 1f, 1f);

            var back = Ui.Rect(seat, "cardBack");
            back.sizeDelta = sz;
            var backImg = Ui.Icon(back, "ui/gacha_card_back", Mathf.Max(sz.x, sz.y), Vector2.zero, "backArt");
            backImg.preserveAspect = false;
            backImg.rectTransform.sizeDelta = sz;
            Sfx.Play(Snd.Card, 0.72f, 0.98f);

            var slit = Ui.Box(seat, new Vector2(sz.x * 0.22f, sz.y * 1.65f), Vector2.zero,
                Color.Lerp(qCol, Color.white, 0.70f).A(0f), Art.SoftDot, "lightSlit");

            float holdDur = d.Rarity >= 4 ? 0.20f : d.Rarity >= 3 ? 0.13f : 0.08f;
            Tween.Run(back, holdDur, k =>
            {
                float drop = k < 0.45f ? Mathf.Lerp(1.22f, 1.0f, Tween.OutCubic(k / 0.45f)) : 1.0f;
                float shake = d.Rarity >= 3 && k >= 0.45f ? Mathf.Sin(k * 58f) * (d.Rarity >= 4 ? 5f : 2.8f) : 0f;
                back.localScale = Vector3.one * drop;
                back.anchoredPosition = new Vector2(shake, 0f);
                if (k > 0.30f)
                {
                    float sk = (k - 0.30f) / 0.70f;
                    slit.color = Color.Lerp(qCol, Color.white, 0.70f).A(sk * 0.95f);
                    slit.rectTransform.localScale = new Vector3(Mathf.Lerp(0.4f, 1.35f, sk), 1f, 1f);
                }
            }, () =>
            {
                if (!seat) return;
                Tween.Run(back, 0.08f, k =>
                {
                    back.localScale = new Vector3(1f - k, 1.04f, 1f);
                    slit.rectTransform.localScale = new Vector3(Mathf.Lerp(1.35f, 2.2f, k), 1.15f, 1f);
                }, () =>
                {
                    if (back) Object.Destroy(back.gameObject);
                    if (!seat) return;

                    Sfx.Play(d.Rarity >= 4 ? Snd.Jackpot : d.Rarity >= 3 ? Snd.Unlock : Snd.Flip,
                        d.Rarity >= 4 ? 0.92f : 0.74f, d.Rarity >= 3 ? 1.08f : 1.0f);

                    MetaFx.Burst(fxLayer, rootPos, d.Rarity >= 4 ? 22 : d.Rarity >= 3 ? 12 : 6,
                        d.Rarity >= 4 ? 270f : 175f, Color.Lerp(qCol, Color.white, 0.48f));

                    Tween.Run(front, 0.18f, k =>
                    {
                        float sx = Tween.OutBack(k);
                        front.localScale = new Vector3(sx, Mathf.Lerp(1.06f, 1f, k), 1f);
                        if (slit) slit.color = slit.color.A((1f - k) * 0.9f);
                    }, () =>
                    {
                        if (slit) Object.Destroy(slit.gameObject);
                        if (tier >= 2 && backGlow)
                            Tween.Run(backGlow, 999f, k => backGlow.transform.localScale = Vector3.one * (1f + (tier >= 3 ? 0.10f : 0.05f) * Mathf.Sin(k * 999f * 3.8f)));
                    });

                    SweepCardShine(front, sz, d.Rarity >= 3 ? 0.94f : 0.58f);
                    onFlipped?.Invoke();
                });
            });
        }

        static RectTransform BuildStageFlippedCardFace(RectTransform seat, Pull pl, HeroDef d, Vector2 sz)
        {
            int tier = HeroTier(d.Rarity);
            var front = Ui.Rect(seat, "front");
            front.sizeDelta = sz;

            Card(front, RarityCard(d.Rarity), sz, Vector2.zero);

            var mask = Ui.Rect(front, "artMask");
            mask.sizeDelta = new Vector2(sz.x * 0.86f, sz.y * 0.74f);
            mask.anchoredPosition = new Vector2(0f, sz.y * 0.06f);
            mask.gameObject.AddComponent<RectMask2D>();
            if (tier >= 2)
            {
                Color cGlow = BeamColor(d.Rarity);
                Ui.Box(mask, Vector2.one * (sz.x * 1.02f), new Vector2(0f, sz.y * 0.08f), cGlow.A(tier >= 3 ? 0.52f : 0.34f), Art.SoftDot);
                var miniHalo = Ui.Icon(mask, "ui/fx_halo_ring", sz.x * 0.84f, new Vector2(0f, sz.y * 0.04f), "miniHalo");
                miniHalo.color = Color.Lerp(cGlow, Color.white, 0.55f).A(tier >= 3 ? 0.62f : 0.34f);
            }
            Ui.Box(mask, new Vector2(sz.x * 0.56f, sz.y * 0.10f), new Vector2(0f, -sz.y * 0.22f), new Color(0.05f, 0.05f, 0.10f, 0.36f), Art.GroundShadow);
            Ui.Icon(mask, d.Art, sz.x * 0.88f, new Vector2(0f, -sz.y * 0.02f));

            float rSz = sz.x * 0.22f;
            Vector2 rPos = new Vector2(-sz.x * 0.35f, sz.y * 0.36f);
            Ui.Box(front, Vector2.one * (rSz + 5f), rPos, Color.white, Art.Circle);
            Ui.Box(front, Vector2.one * rSz, rPos, RoleColor(d.Kind), Art.Circle);
            Ui.Icon(front, RoleArt(d.Kind), rSz * 0.76f, rPos);

            Ui.Box(front, new Vector2(sz.x * 0.84f, sz.y * 0.20f), new Vector2(0f, -sz.y * 0.34f), new Color(0.05f, 0.10f, 0.18f, 0.84f), Art.RoundedSmall);
            Ui.Outlined(front, d.Name, Mathf.RoundToInt(sz.x * 0.135f), tier >= 3 ? Pal.Hex("FFF1B4") : (tier == 2 ? Pal.Hex("F6DCFF") : Color.white),
                new Vector2(0f, -sz.y * 0.34f), new Vector2(sz.x - 10f, sz.y * 0.18f), Pal.Ink, 1.9f);

            if (pl.New)
            {
                Badge(front, "新!", Pal.Red, new Vector2(sz.x * 0.40f, sz.y * 0.15f), new Vector2(sz.x * 0.26f, sz.y * 0.38f), Mathf.RoundToInt(sz.x * 0.115f));
            }
            else
            {
                var spPill = Ui.Rect(front, "sp");
                spPill.anchoredPosition = new Vector2(sz.x * 0.22f, sz.y * 0.37f);
                spPill.sizeDelta = new Vector2(sz.x * 0.48f, sz.y * 0.14f);
                Ui.Box(spPill, spPill.sizeDelta, Vector2.zero, new Color(0.06f, 0.13f, 0.22f, 0.88f), Art.Pill);
                Ui.Icon(spPill, "ic_shard", sz.x * 0.14f, new Vector2(-sz.x * 0.14f, 0f));
                Ui.Outlined(spPill, $"+{pl.Shards}", Mathf.RoundToInt(sz.x * 0.11f), Pal.Hex("FFE682"),
                    new Vector2(sz.x * 0.06f, 0f), new Vector2(sz.x * 0.34f, sz.y * 0.14f), Pal.Ink, 1.6f);
            }
            return front;
        }

        static void SweepCardShine(RectTransform cardFace, Vector2 sz, float peakAlpha = 0.85f, float delay = 0f)
        {
            var clip = Ui.Rect(cardFace, "shineClip");
            clip.sizeDelta = sz - new Vector2(12f, 12f);
            clip.gameObject.AddComponent<RectMask2D>();
            var bar = Ui.Icon(clip, "ui/gacha_shine_bar", sz.y * 1.25f, new Vector2(-sz.x * 0.85f, 0f), "shine");
            bar.preserveAspect = false;
            bar.rectTransform.sizeDelta = new Vector2(sz.x * 0.62f, sz.y * 1.25f);
            bar.color = new Color(1f, 0.98f, 0.88f, peakAlpha);
            bar.raycastTarget = false;
            Tween.Run(bar, 0.42f, k =>
            {
                bar.rectTransform.anchoredPosition = new Vector2(Mathf.Lerp(-sz.x * 0.85f, sz.x * 0.85f, Tween.OutCubic(k)), 0f);
            }, () => { if (clip) Object.Destroy(clip.gameObject); }, delay);
        }

        // =========================================================================================
        // 阶段二：「累计获得」天罡冠冕震撼结算大屏
        // =========================================================================================

        static void ShowRecruitSummary(Transform layer, List<Pull> pulls)
        {
            int n = pulls.Count;
            var merged = MergePulls(pulls);
            int mCount = merged.Count;
            int maxRarity = 2, orangeCnt = 0, purpleCnt = 0;
            foreach (var pl in pulls)
            {
                int r = Defs.Hero(pl.Hero).Rarity;
                maxRarity = Mathf.Max(maxRarity, r);
                if (r >= 4) orangeCnt++;
                else if (r == 3) purpleCnt++;
            }

            RectTransform root = null;
            root = MetaFx.Overlay(layer, "recruit_sum", 0.96f, () => MetaFx.Dismiss(root), 0.55f);

            var nightTint = Ui.Fill(root, new Color(0.05f, 0.06f, 0.12f, 0.94f), false, "nightTint");
            nightTint.SetSiblingIndex(1);

            Color themeCol = maxRarity >= 4 ? Pal.Hex("FFB82E") : maxRarity >= 3 ? Pal.Hex("DF88FF") : Pal.Hex("4CA8FF");
            var topSkyGlow = Ui.Box(root, new Vector2(1800, 1100), new Vector2(0, 620), Pal.Hex("D85A18").A(0.36f), Art.SoftDot, "topSkyGlow");
            topSkyGlow.transform.SetSiblingIndex(2);
            var centerHalo = Ui.Box(root, new Vector2(1680, 1520), new Vector2(0, 150), Pal.Hex("FFAE24").A(0.38f), Art.SoftDot, "centerHalo");
            centerHalo.transform.SetSiblingIndex(3);
            var subHalo = Ui.Box(root, new Vector2(1260, 1080), new Vector2(0, 180), themeCol.A(0.34f), Art.SoftDot, "subHalo");
            subHalo.transform.SetSiblingIndex(4);
            Tween.Run(centerHalo, 999f, k => centerHalo.transform.localScale = Vector3.one * (1f + 0.09f * Mathf.Sin(k * 999f * 2.5f)));

            MetaFx.Rays(root, new Vector2(0, 260), 1680, Pal.Hex("FFE074").A(0.46f));
            MetaFx.Rays(root, new Vector2(0, 660), 1120, Pal.Hex("FFF2A8").A(0.38f));
            SpawnRisingEmbers(root, maxRarity >= 4 ? 42 : 30, Pal.Hex("FFD85A"));
            MetaFx.Confetti(root, n > 1 ? 72 : 36);
            Sfx.Play(maxRarity >= 4 ? Snd.Jackpot : Snd.Reward, 0.95f);

            float sp = Mathf.Clamp(Ui.Spare * 0.28f, 0f, 92f);

            float crownY = 674f + sp;
            var crown = Ui.Rect(root, "sumCrown");
            crown.anchoredPosition = new Vector2(0, crownY);
            crown.sizeDelta = new Vector2(860, 184);
            var crownImg = Ui.Icon(crown, "ui/gacha_sum_crown", 860, Vector2.zero, "crownFace");
            crownImg.preserveAspect = false;
            crownImg.rectTransform.sizeDelta = new Vector2(860, 184);
            Ui.Outlined(crown, "累计获得", 64, Pal.Hex("FFF9DE"), new Vector2(0, -6), new Vector2(460, 96), Pal.Hex("4E1608"), 4.2f);

            crown.localScale = Vector3.one * 1.95f;
            Tween.Run(crown, 0.28f, k => crown.localScale = Vector3.one * Mathf.Lerp(1.95f, 1.0f, Tween.OutBack(k)), () =>
            {
                if (!root) return;
                MetaFx.Burst(root, new Vector2(0, crownY), 22, 460f, Pal.Hex("FFE885"));
                var cWave = Ui.Icon(root, "ui/fx_shock_burst", 420f, new Vector2(0, crownY - 6f), "crownWave");
                cWave.color = Pal.Gold.A(0.85f);
                Tween.Run(cWave, 0.45f, k =>
                {
                    cWave.rectTransform.localScale = new Vector3(Mathf.Lerp(0.8f, 2.4f, Tween.OutCubic(k)), Mathf.Lerp(0.6f, 1.4f, Tween.OutCubic(k)), 1f);
                    cWave.color = Pal.Gold.A(0.85f * (1f - k));
                }, () => { if (cWave) Object.Destroy(cWave.gameObject); });
            });

            string statStr = orangeCnt > 0
                ? $"本轮十连大捷：<color=#FFD84D>传说 ×{orangeCnt}</color>  ·  <color=#E29EFF>史诗 ×{purpleCnt}</color>  ·  共获 <color=#5FF282>{n}</color> 次嘉奖"
                : purpleCnt > 0
                    ? $"本轮敲锣摇得 <color=#5FF282>{n}</color> 次助力  ·  含 <color=#E6A6FF>史诗乡亲 ×{purpleCnt}</color>"
                    : $"本轮敲锣摇人共获 <color=#5FF282>{n}</color> 次乡亲助力";
            var subPill = Ui.Rect(root, "subPill");
            subPill.anchoredPosition = new Vector2(0, crownY - 110f);
            subPill.sizeDelta = new Vector2(780, 48);
            Ui.Box(subPill, new Vector2(760, 44), Vector2.zero, new Color(0.06f, 0.14f, 0.26f, 0.82f), Art.Pill);
            Ui.Box(subPill, new Vector2(760, 2), new Vector2(0, 21), Pal.Gold.A(0.45f), Art.White);
            Ui.Outlined(subPill, statStr, 25, Pal.Hex("F4F9FF"), Vector2.zero, new Vector2(740, 42), Pal.Ink, 1.8f);
            Tween.Pop(subPill, 0.26f, 0.10f);

            int maxPerRow = mCount <= 4 ? Mathf.Max(1, mCount) : mCount <= 8 ? 4 : 5;
            int rows = (mCount + maxPerRow - 1) / maxPerRow;
            float cardScale = mCount == 1 ? 1.22f : maxPerRow == 5 ? 0.78f : rows == 1 ? 0.98f : 0.88f;
            float stepX = maxPerRow == 5 ? 196f : 238f * cardScale + 18f;
            float stepY = 298f * cardScale + 20f;
            float gridCenterY = rows == 1 ? (226f + sp * 0.30f) : (214f + sp * 0.30f);

            float pedW = mCount == 1 ? 520f : 1020f;
            float pedH = rows * (298f * cardScale) + (rows - 1) * 20f + 78f;
            var pedestal = Ui.Rect(root, "pedestal");
            pedestal.anchoredPosition = new Vector2(0, gridCenterY - 4f);
            pedestal.sizeDelta = new Vector2(pedW, pedH);
            Ui.Skin(pedestal, "gacha_sum_pedestal", new Vector2(pedW, pedH), Vector2.zero, 1f, null, "pedBg");
            Tween.Pop(pedestal, 0.28f, 0.06f);

            for (int i = 0; i < mCount; i++)
            {
                int r = i / maxPerRow;
                int c = i % maxPerRow;
                int colsInThisRow = Mathf.Min(maxPerRow, mCount - r * maxPerRow);
                float x = (c - (colsInThisRow - 1) * 0.5f) * stepX;
                float y = gridCenterY + ((rows - 1) * 0.5f - r) * stepY;

                var mp = merged[i];
                var slotWrap = Ui.Rect(root, "sumSlot_" + i);
                slotWrap.anchoredPosition = new Vector2(x, y);
                slotWrap.sizeDelta = new Vector2(232, 298);
                slotWrap.localScale = Vector3.one * cardScale;

                var cardFront = BuildSummaryHeroCard(slotWrap, mp, 0.18f + i * 0.07f);
                cardFront.localScale = new Vector3(0f, 1f, 1f);

                var cBack = Ui.Icon(slotWrap, "ui/gacha_card_back", 252, new Vector2(0, 18), "back");
                cBack.preserveAspect = false;
                cBack.rectTransform.sizeDelta = new Vector2(228, 252);

                float delay = 0.10f + i * 0.065f;
                float targetScale = cardScale;
                slotWrap.localScale = Vector3.zero;
                int rar = mp.Def.Rarity;
                Vector2 burstPos = new Vector2(x, y + 18f * cardScale);

                Tween.Run(slotWrap, 0.16f, k => slotWrap.localScale = Vector3.one * (targetScale * Tween.OutBack(k)), () =>
                {
                    if (!slotWrap) return;
                    Tween.Run(cBack, 0.09f, k => cBack.rectTransform.localScale = new Vector3(1f - k, 1.04f, 1f), () =>
                    {
                        if (cBack) Object.Destroy(cBack.gameObject);
                        if (!cardFront) return;
                        Sfx.Play(rar >= 4 ? Snd.Unlock : Snd.Flip, rar >= 4 ? 0.85f : 0.55f, 0.98f + i * 0.03f);
                        if (rar >= 3)
                            MetaFx.Burst(root, burstPos, rar >= 4 ? 18 : 10, rar >= 4 ? 240f : 160f,
                                Color.Lerp(QualColor(HeroTier(rar)), Color.white, 0.4f));
                        Tween.Run(cardFront, 0.20f, k => cardFront.localScale = new Vector3(Tween.OutBack(k), 1f, 1f));
                    });
                }, delay);
            }

            float pedBotY = (gridCenterY - 4f) - pedH * 0.5f;
            float bonusY = Mathf.Clamp(pedBotY - 106f, -390f, -210f);

            var bonusBox = Ui.Rect(root, "bonusStrip");
            bonusBox.anchoredPosition = new Vector2(0, bonusY);
            bonusBox.sizeDelta = new Vector2(780, 152);
            Ui.Box(bonusBox, new Vector2(220, 3), new Vector2(-248, 66), Pal.Gold.A(0.65f), Art.White);
            Ui.Box(bonusBox, new Vector2(220, 3), new Vector2(248, 66), Pal.Gold.A(0.65f), Art.White);
            Ui.Box(bonusBox, new Vector2(10, 10), new Vector2(-124, 66), Pal.Gold, Art.Circle);
            Ui.Box(bonusBox, new Vector2(10, 10), new Vector2(124, 66), Pal.Gold, Art.Circle);
            Ui.Outlined(bonusBox, "额外获赠", 27, Pal.Hex("FFE89C"), new Vector2(0, 66), new Vector2(220, 38), Pal.Ink, 2.0f);

            int gainCred = n * Meta.CreditsPerPull;
            BuildBonusItemTile(bonusBox, new Vector2(-126f, -14f), "slot_orange", "ic_credit", $"×{gainCred}", "互助工分",
                () => Ui.Hint(bonusBox, "互助工分", $"本轮获赠 +{gainCred}（当前共 {Meta.RecruitCredits(S)}）\n可在供销社【工分兑换】半价定向兑换已结识乡亲碎片"));
            BuildBonusItemTile(bonusBox, new Vector2(126f, -14f), "slot_purple", "stage_drum", $"+{n}", $"摇人经验 (Lv.{S.RecruitLv})",
                () => Ui.Hint(bonusBox, $"摇人等级 Lv.{S.RecruitLv}", $"每摇人 1 次积累 1 点摇人经验\n升级永久提高传说与史诗乡亲出现概率！"));
            Tween.Pop(bonusBox, 0.28f, 0.22f);

            float btnY = Mathf.Max(-704f - sp, bonusY - 178f);
            var btns = Ui.Rect(root, "btns");
            btns.anchoredPosition = new Vector2(0, btnY);

            Ui.Btn(btns, "编入民兵队", new Vector2(312, 120), new Vector2(-182, 0), Pal.Azure, () => MetaFx.Dismiss(root), 38);

            var againBtn = Ui.SubBtn(btns, n > 1 ? "再摇十次" : "再摇一次", "ic_token", $"{S.Tokens}/{n}",
                new Vector2(336, 120), new Vector2(178, 0), Pal.Gold, () =>
                {
                    MetaFx.Dismiss(root);
                    Game.I.Home?.DoRecruit(n, false);
                }, 36, 23);
            if (n >= 10) Badge(againBtn, "必出史诗", Pal.Red, new Vector2(112, 34), new Vector2(-98, 56), 19);
            if (S.Tokens >= n) Dot(againBtn, new Vector2(152, 48));

            var hintTxt = Ui.Outlined(root, "点击空白处关闭", 26, Pal.Hex("C8DCF0").A(0.8f),
                new Vector2(0, btnY - 88f), new Vector2(520, 38), Pal.Ink, 1.5f);
            Tween.Run(hintTxt, 999f, k => hintTxt.color = Pal.Hex("C8DCF0").A(0.45f + 0.35f * Mathf.Sin(k * 999f * 3f)));

            var openFlash = Ui.Fill(root, Color.Lerp(Pal.Gold, Color.white, 0.65f).A(0.72f), false, "openFlash");
            openFlash.SetAsLastSibling();
            var fImg = openFlash.GetComponent<Image>();
            Tween.Run(fImg, 0.28f, k => fImg.color = fImg.color.A(0.72f * (1f - Tween.OutCubic(k))),
                () => { if (openFlash) Object.Destroy(openFlash.gameObject); });
        }

        static void BuildBonusItemTile(Transform parent, Vector2 pos, string slotSkin, string icon, string countStr, string label, Action onTap)
        {
            var tile = Ui.Rect(parent, "bonus_" + icon);
            tile.anchoredPosition = pos;
            tile.sizeDelta = new Vector2(210, 134);
            Ui.Box(tile, Vector2.one * 150, new Vector2(0, 12), Pal.Gold.A(0.24f), Art.SoftDot);
            var face = Slot(tile, slotSkin, 108, new Vector2(0, 14));
            Ui.Icon(tile, icon, 82, new Vector2(0, 16));
            Ui.Outlined(tile, countStr, 24, Color.white, new Vector2(26, -18), new Vector2(96, 30), Pal.Ink, 2.0f, TextAnchor.MiddleRight);
            Ui.Outlined(tile, label, 21, Pal.Hex("FFEAA8"), new Vector2(0, -54), new Vector2(220, 28), Pal.Ink, 1.7f);
            Ui.Tap(face, onTap, tile);
        }

        static void SpawnRisingEmbers(Transform root, int count, Color baseCol)
        {
            var holder = Ui.Rect(root, "embers");
            holder.anchorMin = Vector2.zero;
            holder.anchorMax = Vector2.one;
            holder.offsetMin = holder.offsetMax = Vector2.zero;
            holder.SetSiblingIndex(2);

            for (int i = 0; i < count; i++)
            {
                float x0 = UnityEngine.Random.Range(-500f, 500f);
                float y0 = UnityEngine.Random.Range(-780f, 520f);
                float sz = UnityEngine.Random.Range(18f, 42f);
                float dur = UnityEngine.Random.Range(2.6f, 4.4f);
                float sway = UnityEngine.Random.Range(22f, 55f);
                float ph = UnityEngine.Random.Range(0f, 6.28f);
                var sp = Ui.Box(holder, Vector2.one * sz, new Vector2(x0, y0),
                    Color.Lerp(baseCol, Pal.Hex("FFF6C8"), UnityEngine.Random.Range(0.3f, 0.8f)).A(0.65f), Art.Sparkle, "ember");
                sp.raycastTarget = false;
                Tween.Run(sp, 999f, k =>
                {
                    float t = (k * 999f + ph) % dur / dur;
                    float cy = Mathf.Lerp(-820f, 780f, t);
                    float cx = x0 + Mathf.Sin(t * Mathf.PI * 2f + ph) * sway;
                    sp.rectTransform.anchoredPosition = new Vector2(cx, cy);
                    float a = Mathf.Sin(t * Mathf.PI) * 0.72f;
                    sp.color = sp.color.A(a);
                });
            }
        }

        static List<MergedPull> MergePulls(List<Pull> pulls)
        {
            var map = new Dictionary<HeroId, int>();
            var list = new List<MergedPull>();
            foreach (var pl in pulls)
            {
                if (!map.TryGetValue(pl.Hero, out int idx))
                {
                    idx = list.Count;
                    map[pl.Hero] = idx;
                    list.Add(new MergedPull
                    {
                        Hero = pl.Hero,
                        Def = Defs.Hero(pl.Hero),
                        AnyNew = pl.New,
                        GainShards = pl.Shards,
                        Count = 1,
                    });
                }
                else
                {
                    var cur = list[idx];
                    cur.AnyNew |= pl.New;
                    cur.GainShards += pl.Shards;
                    cur.Count++;
                    list[idx] = cur;
                }
            }
            list.Sort((a, b) =>
            {
                int r = b.Def.Rarity.CompareTo(a.Def.Rarity);
                if (r != 0) return r;
                if (a.AnyNew != b.AnyNew) return a.AnyNew ? -1 : 1;
                return b.GainShards.CompareTo(a.GainShards);
            });
            return list;
        }

        static RectTransform BuildSummaryHeroCard(Transform parent, MergedPull mp, float animDelay)
        {
            var d = mp.Def;
            int lv = S.HeroLv[(int)mp.Hero];
            int tier = HeroTier(d.Rarity);
            var c = Ui.Rect(parent, "sumCard_" + mp.Hero);
            c.sizeDelta = new Vector2(232, 298);

            if (tier >= 2)
            {
                Color cCol = BeamColor(d.Rarity);
                var aura = Ui.Box(c, new Vector2(304, 322), new Vector2(0, 18), cCol.A(tier >= 3 ? 0.76f : 0.44f), Art.SoftDot, "aura");
                Tween.Run(aura, 999f, k => aura.color = cCol.A((tier >= 3 ? 0.56f : 0.30f) + 0.18f * Mathf.Sin(k * 999f * 3.2f)));
                var cardRays = Ui.Icon(c, "ui/fx_halo_ring", tier >= 3 ? 336 : 276, new Vector2(0, 22), "cardRays");
                cardRays.color = Color.Lerp(cCol, Color.white, 0.48f).A(tier >= 3 ? 0.85f : 0.45f);
                Tween.Run(cardRays, 999f, k => cardRays.transform.localRotation = Quaternion.Euler(0, 0, k * 999f * 26f));
            }

            var face = Card(c, RarityCard(d.Rarity), new Vector2(228, 252), new Vector2(0, 18));

            var artMask = Ui.Rect(c, "artMask");
            artMask.sizeDelta = new Vector2(204, 188);
            artMask.anchoredPosition = new Vector2(0, 30);
            artMask.gameObject.AddComponent<RectMask2D>();
            if (tier >= 2)
            {
                Color cCol = BeamColor(d.Rarity);
                Ui.Box(artMask, Vector2.one * 204, new Vector2(0, 8), cCol.A(tier >= 3 ? 0.52f : 0.30f), Art.SoftDot);
                var inHalo = Ui.Icon(artMask, "ui/fx_halo_ring", 184, new Vector2(0, 8), "inHalo");
                inHalo.color = Color.Lerp(cCol, Color.white, 0.55f).A(tier >= 3 ? 0.68f : 0.36f);
            }
            Ui.Box(artMask, new Vector2(128, 24), new Vector2(0, -46), new Color(0.05f, 0.05f, 0.10f, 0.36f), Art.GroundShadow);
            Ui.Icon(artMask, d.Art, 198, new Vector2(0, -2));

            SweepCardShine(artMask, new Vector2(204, 188), tier >= 2 ? 0.88f : 0.55f, animDelay + 0.14f);

            Ui.Box(c, Vector2.one * 54, new Vector2(-84, 115), Color.white, Art.Circle);
            Ui.Box(c, Vector2.one * 44, new Vector2(-84, 115), RoleColor(d.Kind), Art.Circle);
            Ui.Icon(c, RoleArt(d.Kind), 34, new Vector2(-84, 116));

            if (mp.AnyNew && mp.GainShards == 0)
            {
                Badge(c, "新乡亲!", Pal.Red, new Vector2(108, 38), new Vector2(56, 118), 21);
            }
            else
            {
                var gainPill = Ui.Rect(c, "gainPill");
                gainPill.anchoredPosition = new Vector2(50, 116);
                gainPill.sizeDelta = new Vector2(118, 38);
                Ui.Box(gainPill, new Vector2(118, 36), Vector2.zero, new Color(0.07f, 0.14f, 0.24f, 0.90f), Art.Pill);
                Ui.Icon(gainPill, "ic_shard", 30, new Vector2(-36, 1));
                Ui.Outlined(gainPill, $"+{mp.GainShards}", 22, Pal.Hex("FFE680"), new Vector2(14, 1), new Vector2(80, 34), Pal.Ink, 1.8f);
                if (mp.AnyNew)
                    Badge(c, "新!", Pal.Red, new Vector2(66, 32), new Vector2(74, 80), 19);
            }

            int need = Meta.ShardCost(lv);
            int curShards = S.Shards[(int)mp.Hero];
            int prevShards = Mathf.Max(0, curShards - mp.GainShards);
            bool max = lv >= Meta.MaxHeroLv;
            bool can = Meta.CanLevel(S, mp.Hero);

            float barW = can ? 124f : 140f;
            const float barH = 24f, rowY = -72f;
            float barX = can ? 8f : 14f;
            float frac0 = max ? 1f : Mathf.Clamp01(prevShards / (float)Mathf.Max(1, need));
            float frac1 = max ? 1f : Mathf.Clamp01(curShards / (float)Mathf.Max(1, need));
            var fillRt = MetaUi.Bar(c, new Vector2(barX, rowY), new Vector2(barW, barH), frac1, MetaUi.ShardFill(max, can),
                max ? "满级" : $"{curShards}/{need}");
            MetaUi.GrowBar(fillRt, frac0, frac1, barW, barH, 0.48f, animDelay + 0.12f);

            var lvPos = new Vector2(barX - barW * 0.5f - 18f, rowY);
            Ui.Box(c, Vector2.one * 40, lvPos, Pal.Hex("14202C"), Art.Circle);
            Ui.Box(c, Vector2.one * 34, lvPos, tier >= 3 ? Pal.Hex("FFE288") : Color.white, Art.Circle);
            Ui.Box(c, Vector2.one * 27, lvPos, Pal.Hex("27394C"), Art.Circle);
            Ui.Outlined(c, lv.ToString(), 18, Color.white, lvPos + new Vector2(0, 1), new Vector2(36, 28), Pal.Hex("101A24"), 1.3f);

            if (can)
            {
                var up = Ui.Box(c, new Vector2(34, 34), new Vector2(barX + barW * 0.5f + 16f, rowY + 2f), Color.white, Art.UpArrow, "up");
                Ui.Breathe(up, 4f);
            }

            Ui.Outlined(c, d.Name, 28, tier >= 3 ? Pal.Hex("FFF1B4") : Color.white,
                new Vector2(0, -128), new Vector2(228, 38), Pal.Ink, 2.0f);

            string gainTip = mp.AnyNew && mp.GainShards > 0
                ? $"本次新加入并额外转化碎片 +{mp.GainShards}"
                : mp.AnyNew ? "本次全新加入守村队！" : $"本次转化乡亲碎片 +{mp.GainShards}";
            Ui.Tap(face, () => Ui.Hint(c, $"{d.Name} · {RarityName(d.Rarity)}{d.Role}", $"{d.Desc}\n{gainTip}"), c);
            return c;
        }
    }
}
