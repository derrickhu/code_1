using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;
using Object = UnityEngine.Object;

namespace Liangshan
{
    /// <summary>局外的庆祝演出：升级成功、火焰属性条、永久强化、天赋提升、恭喜获得、新好汉揭晓。都挂在 Layer 最上层，点一下推进或关闭。</summary>
    public static class MetaFx
    {
        static readonly Color BandColor = new Color(0.05f, 0.12f, 0.22f, 0.98f);

        /// <summary>全屏遮罩。minShow 秒内点击无效，免得连点把演出直接点没了。</summary>
        public static RectTransform Overlay(Transform layer, string key, float dim, Action onTap, float minShow = 0.35f)
        {
            var old = layer.Find("fx_" + key);
            if (old) Object.DestroyImmediate(old.gameObject);
            var root = Ui.Rect(layer, "fx_" + key);
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var cg = root.gameObject.AddComponent<CanvasGroup>();
            var bg = Ui.Fill(root, new Color(0, 0, 0, dim), true, "dim");
            Tween.Fade(cg, 0, 1, 0.15f);
            float born = Time.unscaledTime;
            var b = bg.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            b.onClick.AddListener(() =>
            {
                if (Time.unscaledTime - born < minShow) return;
                onTap?.Invoke();
            });
            root.SetAsLastSibling();
            return root;
        }

        public static void Dismiss(RectTransform root, Action then = null)
        {
            if (!root || root.name.EndsWith("_closing")) return;
            root.name += "_closing";
            var cg = root.GetComponent<CanvasGroup>();
            foreach (var g in root.GetComponentsInChildren<Graphic>()) g.raycastTarget = false;
            if (cg) Tween.Fade(cg, cg.alpha, 0, 0.16f, () => { if (root) Object.Destroy(root.gameObject); });
            else Object.Destroy(root.gameObject);
            then?.Invoke();
        }

        /// <summary>横贯屏幕的暗金光带，上下压一道金线。</summary>
        public static RectTransform Band(Transform p, float y, float h)
        {
            var band = Ui.Rect(p, "band");
            band.anchorMin = new Vector2(0, 0.5f);
            band.anchorMax = new Vector2(1, 0.5f);
            band.sizeDelta = new Vector2(0, h);
            band.anchoredPosition = new Vector2(0, y);
            var glow = Ui.Box(band, new Vector2(1500, h * 2.2f), Vector2.zero, Pal.Gold.A(0.22f), Art.SoftDot, "glow");
            glow.rectTransform.anchorMin = glow.rectTransform.anchorMax = new Vector2(0.5f, 0.5f);
            var fill = Ui.Fill(band, BandColor, false, "fill");
            fill.GetComponent<Image>().sprite = Art.White;
            for (int s = -1; s <= 1; s += 2)
            {
                var line = Ui.Box(band, new Vector2(0, 5), Vector2.zero, Pal.Gold.A(0.85f), Art.White, "line");
                line.rectTransform.anchorMin = new Vector2(0, s > 0 ? 1 : 0);
                line.rectTransform.anchorMax = new Vector2(1, s > 0 ? 1 : 0);
                line.rectTransform.sizeDelta = new Vector2(0, 5);
                line.rectTransform.anchoredPosition = Vector2.zero;
                var shine = Ui.Box(band, new Vector2(260, 9), Vector2.zero, Color.white.A(0.9f), Art.SoftDot, "shine");
                shine.rectTransform.anchorMin = shine.rectTransform.anchorMax = new Vector2(0.5f, s > 0 ? 1 : 0);
                float dir = s;
                Tween.Run(shine, 1.2f, k => shine.rectTransform.anchoredPosition = new Vector2(dir * Mathf.Lerp(-640, 640, Tween.OutCubic(k)), 0));
            }
            band.localScale = new Vector3(1, 0, 1);
            Tween.Run(band, 0.2f, k => band.localScale = new Vector3(1, Tween.OutBack(k), 1));
            return band;
        }

        /// <summary>金色带翅膀的绶带标题。</summary>
        public static RectTransform GoldBanner(Transform p, string title, Vector2 pos, float w = 760)
        {
            var r = Ui.Rect(p, "goldBanner");
            r.anchoredPosition = pos;
            r.sizeDelta = new Vector2(w, w * 231f / 760f);
            var img = Ui.Box(r, r.sizeDelta, Vector2.zero, Color.white, Art.Img("ui/banner_gold"), "face");
            img.type = Image.Type.Simple;
            Ui.Outlined(r, title, (int)(w * 0.078f), Pal.Hex("FFFBEA"), new Vector2(0, w * 0.03f), new Vector2(w * 0.72f, w * 0.14f), Pal.Hex("9A5408"), 3.5f);
            Tween.Pop(r, 0.32f);
            return r;
        }

        /// <summary>大号描金字（天赋提升、永久强化这类标题）。</summary>
        public static Text BigWord(Transform p, string s, Vector2 pos, int size = 96)
        {
            var t = Ui.Outlined(p, s, size, Pal.Hex("FFE36A"), pos, new Vector2(1000, size * 1.4f), Pal.Hex("8A3A06"), 5f);
            t.gameObject.AddComponent<Outline>().effectColor = Pal.Hex("FFF4C0").A(0.5f);
            var rt = t.rectTransform;
            rt.localScale = Vector3.one * 2.2f;
            Tween.Run(rt, 0.28f, k => rt.localScale = Vector3.one * Mathf.Lerp(2.2f, 1f, Tween.OutBack(k)));
            return t;
        }

        /// <summary>星光向四周迸开。</summary>
        public static void Burst(Transform p, Vector2 at, int n = 14, float r = 320, Color? c = null)
        {
            var col = c ?? Pal.Gold;
            for (int i = 0; i < n; i++)
            {
                float a = (i + UnityEngine.Random.value * 0.6f) / n * Mathf.PI * 2;
                float dist = r * (0.6f + UnityEngine.Random.value * 0.5f);
                float sz = 30 + UnityEngine.Random.value * 40;
                var s = Ui.Box(p, Vector2.one * sz, at, Color.Lerp(col, Color.white, UnityEngine.Random.value * 0.5f), Art.Sparkle, "spark");
                var to = at + new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * dist;
                Tween.Run(s, 0.7f + UnityEngine.Random.value * 0.3f, k =>
                {
                    s.rectTransform.anchoredPosition = Vector2.Lerp(at, to, Tween.OutCubic(k));
                    s.rectTransform.localRotation = Quaternion.Euler(0, 0, k * 180);
                    var cc = s.color;
                    cc.a = 1 - k * k;
                    s.color = cc;
                }, () => { if (s) Object.Destroy(s.gameObject); });
            }
        }

        /// <summary>彩纸从上方飘落。</summary>
        public static void Confetti(Transform p, int n = 40)
        {
            string[] cols = { "FF5A5A", "FFC93C", "57C443", "4C8EE8", "C07BFF", "FF9A2E" };
            for (int i = 0; i < n; i++)
            {
                var from = new Vector2(UnityEngine.Random.Range(-560f, 560f), UnityEngine.Random.Range(700f, 1000f));
                var to = from + new Vector2(UnityEngine.Random.Range(-200f, 200f), -UnityEngine.Random.Range(1500f, 2000f));
                var c = Ui.Box(p, new Vector2(UnityEngine.Random.Range(14f, 26f), UnityEngine.Random.Range(26f, 40f)), from, Pal.Hex(cols[i % cols.Length]), Art.RoundedSmall, "confetti");
                float spin = UnityEngine.Random.Range(-720f, 720f), wob = UnityEngine.Random.Range(2f, 5f);
                Tween.Run(c, UnityEngine.Random.Range(2.2f, 3.4f), k =>
                {
                    c.rectTransform.anchoredPosition = Vector2.Lerp(from, to, k) + new Vector2(Mathf.Sin(k * wob * 6) * 40, 0);
                    c.rectTransform.localRotation = Quaternion.Euler(0, 0, spin * k);
                    c.rectTransform.localScale = new Vector3(Mathf.Cos(k * wob * 9), 1, 1);
                }, () => { if (c) Object.Destroy(c.gameObject); }, UnityEngine.Random.value * 0.5f);
            }
        }

        /// <summary>慢慢旋转的光芒，放在主角背后。</summary>
        public static Image Rays(Transform p, Vector2 pos, float size, Color c)
        {
            var r = Ui.Box(p, Vector2.one * size, pos, c, Art.Sparkle, "rays");
            Tween.Run(r, 999f, k => r.transform.localRotation = Quaternion.Euler(0, 0, k * 999f * 25f));
            var r2 = Ui.Box(p, Vector2.one * size * 0.8f, pos, c.A(c.a * 0.7f), Art.Sparkle, "rays2");
            Tween.Run(r2, 999f, k => r2.transform.localRotation = Quaternion.Euler(0, 0, 22 - k * 999f * 18f));
            return r;
        }

        /// <summary>数字从 from 滚到 to，边滚边嘀嗒。</summary>
        public static void Count(Text t, float from, float to, float dur, Func<float, string> fmt, float delay = 0)
        {
            t.text = fmt(from);
            int last = -1;
            Tween.Run(t, dur, k =>
            {
                float v = Mathf.Lerp(from, to, Tween.OutCubic(k));
                t.text = fmt(v);
                int step = (int)(k * 8);
                if (step != last && k < 1f) { last = step; Sfx.Play(Snd.Tick, 0.35f, 1f + k * 0.4f); }
            }, null, delay);
        }

        /// <summary>火焰属性条：「攻击 334 +4」，从左边滑进来，数字往上滚。</summary>
        public static RectTransform FlameBar(Transform p, string label, float from, float to, Vector2 pos, float delay = 0, string fmt = "0")
        {
            var r = Ui.Rect(p, "flame");
            r.anchoredPosition = pos;
            r.sizeDelta = new Vector2(640, 170);
            Ui.Skin(r, "flame_bar", new Vector2(640, 170), Vector2.zero, -1f, null, "face");
            const float y = -15;
            Ui.Icon(r, "ic_sword", 92, new Vector2(-250, y + 4));
            Ui.Outlined(r, label, 42, Color.white, new Vector2(-142, y), new Vector2(140, 60), Pal.Hex("8A2A08"), 3f);
            var num = Ui.Outlined(r, "", 50, Color.white, new Vector2(10, y), new Vector2(180, 64), Pal.Hex("8A2A08"), 3f, TextAnchor.MiddleLeft);
            var add = Ui.Outlined(r, "+" + (to - from).ToString(fmt), 42, Pal.Hex("B6FF6A"), new Vector2(170, y), new Vector2(150, 60), Pal.Hex("1E5A10"), 3f, TextAnchor.MiddleLeft);
            add.color = add.color.A(0);
            var start = pos + new Vector2(-900, 0);
            r.anchoredPosition = start;
            Tween.Run(r, 0.3f, k => r.anchoredPosition = Vector2.Lerp(start, pos, Tween.OutBack(k)), () =>
            {
                Count(num, from, to, 0.55f, v => v.ToString(fmt));
                Tween.Run(add, 0.25f, k =>
                {
                    add.color = add.color.A(k);
                    add.rectTransform.localScale = Vector3.one * Mathf.Lerp(1.6f, 1f, Tween.OutBack(k));
                }, null, 0.35f);
            }, delay);
            return r;
        }

        /// <summary>一行副属性：深色胶囊左对齐属性名、右对齐数值与绿字涨幅，从右边滑进。</summary>
        public static RectTransform StatLine(Transform p, string label, string value, string add, Vector2 pos, float delay = 0)
        {
            var r = Ui.Rect(p, "statLine");
            r.sizeDelta = new Vector2(720, 82);
            Ui.Skin(r, "pill", new Vector2(720, 80), Vector2.zero, -1f);
            Ui.Outlined(r, label, 31, Color.white, new Vector2(-150, 1), new Vector2(340, 60), Pal.Ink, 2f, TextAnchor.MiddleLeft);
            Ui.Outlined(r, value, 34, Pal.Hex("FFE08A"), new Vector2(82, 1), new Vector2(180, 60), Pal.Ink, 2.2f, TextAnchor.MiddleRight);
            Ui.Outlined(r, add, 31, Pal.Hex("9CFF6A"), new Vector2(268, 1), new Vector2(136, 60), Pal.Hex("1B4E12"), 2.0f, TextAnchor.MiddleLeft);
            var start = pos + new Vector2(900, 0);
            r.anchoredPosition = start;
            Tween.Run(r, 0.3f, k => r.anchoredPosition = Vector2.Lerp(start, pos, Tween.OutBack(k)), null, delay);
            return r;
        }

        /// <summary>六边形技能图标：金框内嵌对应品质底色（稀有蓝、史诗紫、传说橙，锁定暗灰），图标居中收在框内绝不压边。</summary>
        public static RectTransform Hex(Transform p, string icon, float size, Vector2 pos, bool locked = false, int rarity = 2)
        {
            float h = size * (253f / 220f);
            var r = Ui.Rect(p, "hex");
            r.anchoredPosition = pos;
            r.sizeDelta = new Vector2(size, h);
            var f = Ui.Box(r, new Vector2(size, h), Vector2.zero, locked ? new Color(0.45f, 0.47f, 0.52f) : Color.white, Art.Img("ui/hex"), "frame");
            f.type = Image.Type.Simple;

            Color bgCol = locked ? Pal.Hex("4E5562")
                : rarity >= 5 ? Pal.Hex("E26452")
                : rarity == 4 ? Pal.Hex("EA9B3E")
                : rarity == 3 ? Pal.Hex("9E6AE8")
                : Pal.Hex("74B8E8");
            var window = Ui.Rect(r, "window");
            window.sizeDelta = new Vector2(size, h);
            window.anchoredPosition = Vector2.zero;
            var maskImg = window.gameObject.AddComponent<Image>();
            maskImg.sprite = Art.HexInner;
            maskImg.type = Image.Type.Simple;
            maskImg.color = bgCol;
            maskImg.raycastTarget = false;
            var mask = window.gameObject.AddComponent<Mask>();
            mask.showMaskGraphic = true;

            var sp = Art.Img(icon);
            float tw = sp != null ? Mathf.Max(1f, sp.rect.width) : 1f;
            float th = sp != null ? Mathf.Max(1f, sp.rect.height) : 1f;
            float u0 = tw * 0.5f, v0 = th * 0.5f;
            float hwSafe = size * 0.33f, hhSafe = size * 0.35f;
            float uEff = tw / th < 0.50f ? u0 * 0.35f : u0;
            float scale = Mathf.Min(Mathf.Min(hwSafe / u0, hhSafe / v0), hwSafe / (0.5f * uEff + 0.8660254f * v0));
            var ic = Ui.Icon(window, icon, 8f, new Vector2(0f, size * 0.005f), "icon");
            ic.rectTransform.sizeDelta = new Vector2(tw * scale, th * scale);
            if (locked)
            {
                ic.color = new Color(0.62f, 0.66f, 0.74f, 0.88f);
                Ui.Icon(r, "ic_lock", size * 0.28f, new Vector2(size * 0.24f, -size * 0.24f), "lock");
            }
            return r;
        }

        // ---------------- 升级成功 ----------------

        public struct LevelUpInfo
        {
            public HeroId Hero;
            public int NewLv;
            public float OldPower, NewPower;
            public float OldCritDmg, NewCritDmg;
        }

        public static void LevelUp(Transform layer, LevelUpInfo info, Action done = null)
        {
            RectTransform root = null;
            bool closed = false;
            void Close()
            {
                if (closed) return;
                closed = true;
                Dismiss(root);
                int ui = Array.IndexOf(Meta.UnlockLv, info.NewLv);
                if (ui > 0) Perma(layer, info.Hero, ui, done);
                else done?.Invoke();
            }
            root = Overlay(layer, "levelup", 0.76f, Close);
            Sfx.Play(Snd.LevelUp, 0.9f);
            Band(root, 56, 548);
            GoldBanner(root, "升级成功", new Vector2(0, 344), 720);
            Burst(root, new Vector2(0, 344), 16, 420);

            var lvPill = Ui.Rect(root, "lvPill");
            lvPill.anchoredPosition = new Vector2(0, 184);
            lvPill.sizeDelta = new Vector2(460, 52);
            Ui.Box(lvPill, new Vector2(460, 50), Vector2.zero, new Color(0.03f, 0.08f, 0.16f, 0.80f), Art.Pill);
            Ui.Outlined(lvPill, $"{Defs.Hero(info.Hero).Name}  升至  <color=#FFE47A>Lv.{info.NewLv}</color>",
                33, Color.white, new Vector2(0, 1), new Vector2(436, 46), Pal.Ink, 2.2f);
            Tween.Pop(lvPill, 0.24f, 0.10f);

            FlameBar(root, "战力", info.OldPower, info.NewPower, new Vector2(-10, 34), 0.22f);
            StatLine(root, "全村暴击伤害", $"{info.NewCritDmg * 100:0.#}%", $"+{(info.NewCritDmg - info.OldCritDmg) * 100:0.#}%", new Vector2(0, -124), 0.36f);
            Hint(root, -284);
            Tween.Run(root, 2.6f, k => { }, Close);
        }

        static string FormatMilestoneDesc(string s)
        {
            if (string.IsNullOrEmpty(s)) return "";
            s = s.Replace("」\n", "」").Replace("额外\n", "额外").Replace("首领\n", "首领").Replace("\n", "，");
            if (!s.Contains("<color="))
            {
                s = System.Text.RegularExpressions.Regex.Replace(s, "「(.*?)」", m => HeroText.O("[" + m.Groups[1].Value + "]"));
                s = System.Text.RegularExpressions.Regex.Replace(s, @"([+-]?\d+(?:\.\d+)?(?:%|秒))", m => HeroText.O(m.Groups[1].Value));
            }
            return s;
        }

        /// <summary>等级里程碑：5、20 级往局内卡池加选项，用「解锁选项」；其余是「永久强化」。分区排版杜绝任何多行重叠。</summary>
        public static void Perma(Transform layer, HeroId h, int unlockIdx, Action done = null)
        {
            var d = Defs.Hero(h);
            RectTransform root = null;
            root = Overlay(layer, "perma", 0.86f, () => { Dismiss(root); done?.Invoke(); }, 0.6f);
            Sfx.Play(Snd.Unlock, 0.9f);
            var opt = unlockIdx == 1 ? Meta.OptPerk(h, 1) : unlockIdx == 4 ? Meta.OptPerk(h, 2) : null;
            int lvNeed = unlockIdx >= 0 && unlockIdx < Meta.UnlockLv.Length ? Meta.UnlockLv[unlockIdx] : 5;

            // 传说好汉升至 5 级：同时解锁「天罡大招」与「爆发强化选项」，采用双横卡宽敞分栏展示！
            if (unlockIdx == 1 && d.HasUlt && opt != null)
            {
                Band(root, 68, 564);
                var dualWord = BigWord(root, "解锁选项", new Vector2(0, 366), 86);
                Burst(root, new Vector2(0, 366), 18, 460);

                var dualSub = Ui.Rect(root, "dualSub");
                dualSub.anchoredPosition = new Vector2(0, 252);
                dualSub.sizeDelta = new Vector2(680, 46);
                Ui.Box(dualSub, new Vector2(680, 44), Vector2.zero, new Color(0.03f, 0.09f, 0.18f, 0.78f), Art.Pill);
                Ui.Outlined(dualSub, $"{d.Name} Lv.{lvNeed} 突破 · 上阵时局内强化池新增",
                    25, Pal.Hex("A8E4FF"), new Vector2(0, 1), new Vector2(656, 40), Pal.Ink, 1.7f);

                void BuildUnlockRow(Vector2 pos, string ic, string tag, Color tagCol, string title, string rawDesc, float delay)
                {
                    var card = Ui.Rect(root, "unlockCard_" + title);
                    card.anchoredPosition = pos;
                    card.sizeDelta = new Vector2(900, 160);
                    Ui.Box(card, new Vector2(900, 160), Vector2.zero, new Color(0.03f, 0.08f, 0.15f, 0.88f), Art.Rounded);
                    Ui.Box(card, new Vector2(892, 2), new Vector2(0, 78), Pal.Gold.A(0.48f), Art.White);
                    Ui.Box(card, new Vector2(696, 2), new Vector2(68, 2), Color.white.A(0.10f), Art.White);

                    var hx = Hex(card, string.IsNullOrEmpty(ic) ? d.AtkIcon : ic, 108, new Vector2(-364, 0), false, d.Rarity);
                    Tween.Pop(hx, 0.32f, delay);

                    MetaUi.Badge(card, tag, tagCol, new Vector2(118, 36), new Vector2(-230, 38), 20);
                    Ui.Outlined(card, title, 36, Pal.Hex("FFE7A0"), new Vector2(126, 38), new Vector2(556, 46), Pal.Ink, 2.4f, TextAnchor.MiddleLeft);

                    var dt = Ui.Outlined(card, FormatMilestoneDesc(rawDesc), 26, Color.white,
                        new Vector2(64, -36), new Vector2(706, 54), Pal.Ink, 1.6f, TextAnchor.MiddleLeft);
                    MetaUi.Fit(dt, 21);
                    Tween.Pop(card, 0.24f, delay * 0.6f);
                }

                string ultRaw = !string.IsNullOrEmpty(d.UltTip) ? d.UltTip : HeroText.Ult(d);
                BuildUnlockRow(new Vector2(0, 112), d.UltIcon, "镇村大招", Pal.Red, d.UltName, ultRaw, 0.10f);
                BuildUnlockRow(new Vector2(0, -82), d.AtkIcon, "爆发选项", Pal.Hex("D67A12"), opt.Name, opt.Desc, 0.20f);

                Hint(root, -278);
                dualWord.transform.SetAsLastSibling();
                return;
            }

            // 常规单项里程碑：标题 → 六边形徽章 → 技能名 → 来源胶囊 → 独立暗金说明框（每行独立节点，绝不撞字）
            bool hasExtraLine = opt != null && unlockIdx == 4;
            float boxH = hasExtraLine ? 148f : 104f;
            float boxY = hasExtraLine ? -172f : -150f;
            float bandBot = boxY - boxH * 0.5f - 38f;
            const float bandTop = 342f;
            Band(root, (bandTop + bandBot) * 0.5f, bandTop - bandBot);

            var word = BigWord(root, opt != null ? "解锁选项" : "永久强化", new Vector2(0, 358), 86);
            Burst(root, new Vector2(0, 358), 18, 460);

            string icon = opt != null ? (opt.Opt == 2 ? "ic_star" : d.AtkIcon) : unlockIdx == 2 ? "ic_star" : unlockIdx == 6 ? "ic_fast" : d.AtkIcon;
            Ui.Box(root, Vector2.one * 240f, new Vector2(0, 184), MetaUi.RarityColor(d.Rarity).A(0.32f), Art.SoftDot, "hexGlow");
            var hex = Hex(root, icon, 148, new Vector2(0, 184), false, d.Rarity);
            Tween.Pop(hex, 0.35f, 0.12f);

            string name = opt != null ? opt.Name : unlockIdx == 2 ? d.PassiveName : unlockIdx == 3 ? Meta.OptPerk(h, 1).Name + "·精通" :
                unlockIdx == 5 ? d.AtkName + "·极意" : "疾风";
            Ui.Outlined(root, name, 46, Pal.Hex("FFE7A0"), new Vector2(0, 30), new Vector2(840, 58), Pal.Ink, 3f);

            var subPill = Ui.Rect(root, "subPill");
            subPill.anchoredPosition = new Vector2(0, -46);
            subPill.sizeDelta = new Vector2(640, 46);
            Ui.Box(subPill, new Vector2(640, 44), Vector2.zero, new Color(0.03f, 0.09f, 0.18f, 0.78f), Art.Pill);
            string subText = opt != null
                ? $"{d.Name} Lv.{lvNeed} 解锁 · 上阵时局内强化可抽到"
                : $"{d.Name} Lv.{lvNeed} 突破 · 属性与技能永久生效";
            Ui.Outlined(subPill, subText, 25, opt != null ? Pal.Hex("9EE2FF") : Pal.Hex("A8F5BE"),
                new Vector2(0, 1), new Vector2(616, 40), Pal.Ink, 1.7f);

            var descBox = Ui.Rect(root, "descBox");
            descBox.anchoredPosition = new Vector2(0, boxY);
            descBox.sizeDelta = new Vector2(880, boxH);
            Ui.Box(descBox, new Vector2(880, boxH), Vector2.zero, new Color(0.03f, 0.08f, 0.15f, 0.86f), Art.Rounded);
            Ui.Box(descBox, new Vector2(872, 2), new Vector2(0, boxH * 0.5f - 2f), Pal.Gold.A(0.45f), Art.White);

            string mainLine;
            if (opt != null)
            {
                mainLine = FormatMilestoneDesc(opt.Desc);
            }
            else if (unlockIdx == 2)
            {
                string pas = FormatMilestoneDesc(HeroText.Passive(d));
                string dmgNote = h == HeroId.YanQing
                    ? $"满{HeroText.O("4位")}钢钉{HeroText.O("+1")}，伤害 {HeroText.O("+20%")}"
                    : $"普攻与技能伤害 {HeroText.O("+20%")}";
                mainLine = $"{pas}，{dmgNote}";
            }
            else
            {
                mainLine = FormatMilestoneDesc(Meta.Talent(h, unlockIdx));
            }

            if (hasExtraLine)
            {
                MetaUi.Fit(Ui.Outlined(descBox, mainLine, 29, Color.white, new Vector2(0, 32), new Vector2(832, 48), Pal.Ink, 1.9f), 22);
                Ui.Box(descBox, new Vector2(780, 2), new Vector2(0, -1), Color.white.A(0.10f), Art.White);
                MetaUi.Fit(Ui.Outlined(descBox, "额外突破：所有取舍强化不再降低属性", 26, Pal.Hex("9CFF6A"),
                    new Vector2(0, -34), new Vector2(832, 44), Pal.Hex("143E18"), 1.7f), 21);
            }
            else
            {
                MetaUi.Fit(Ui.Outlined(descBox, mainLine, 30, Color.white, Vector2.zero, new Vector2(832, 76), Pal.Ink, 1.9f), 22);
            }
            Tween.Pop(descBox, 0.24f, 0.16f);

            Hint(root, bandBot - 64f);
            word.transform.SetAsLastSibling();
        }

        static string HeroArtOrIcon(HeroId h) => Defs.Hero(h).Art;

        static void Hint(Transform root, float y)
        {
            var t = Ui.Label(root, "点击空白处关闭", 30, Color.white.A(0), new Vector2(0, y), new Vector2(600, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            Tween.Run(t, 999f, k =>
            {
                float tt = k * 999f;
                t.color = Color.white.A(tt < 0.8f ? 0 : 0.45f + 0.35f * Mathf.Sin((tt - 0.8f) * 3f));
            });
        }

        // ---------------- 天赋提升、强化成功 ----------------

        /// <summary>不挡操作的大字提示：天赋提升。</summary>
        public static void TalentUp(Transform layer, string icon, string stat)
        {
            var root = Ui.Rect(layer, "fx_talent");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var cg = root.gameObject.AddComponent<CanvasGroup>();
            cg.blocksRaycasts = false;
            Sfx.Play(Snd.Talent, 0.9f);
            Band(root, 110, 330);
            var word = BigWord(root, "潜能提升", new Vector2(0, 275), 92);
            var hex = Hex(root, icon, 124, new Vector2(0, 126), false);
            Tween.Pop(hex, 0.3f, 0.1f);
            Ui.Outlined(root, stat, 36, Pal.Hex("B6FF6A"), new Vector2(0, -2), new Vector2(840, 54), Pal.Ink, 2.5f);
            word.transform.SetAsLastSibling();
            Burst(root, new Vector2(0, 275), 14, 420);
            Tween.Fade(cg, 1, 0, 0.3f, () => { if (root) Object.Destroy(root.gameObject); }, 1.3f);
        }

        /// <summary>强化成功：火焰条 + 属性涨幅，不挡操作。</summary>
        public static void StatUp(Transform layer, string label, float from, float to, string fmt = "0")
        {
            var root = Ui.Rect(layer, "fx_stat");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var cg = root.gameObject.AddComponent<CanvasGroup>();
            cg.blocksRaycasts = false;
            FlameBar(root, label, from, to, new Vector2(-10, -40), 0, fmt);
            Tween.Fade(cg, 1, 0, 0.3f, () => { if (root) Object.Destroy(root.gameObject); }, 1.4f);
        }

        // ---------------- 恭喜获得 ----------------

        public static void Gain(Transform layer, string sub, List<Item> items, Action done = null)
        {
            RectTransform root = null;
            root = Overlay(layer, "gain", 0.72f, () => { Dismiss(root); done?.Invoke(); }, 0.5f);
            Sfx.Play(Snd.Reward, 0.8f);
            int rows = (items.Count + 4) / 5;
            float bandH = 200 + rows * 210;
            float cy = 40;
            Band(root, cy - 20, bandH);
            GoldBanner(root, "恭喜获得", new Vector2(0, cy + bandH * 0.5f + 40), 700);
            Burst(root, new Vector2(0, cy + bandH * 0.5f + 40), 14, 380);
            if (!string.IsNullOrEmpty(sub))
                Ui.Label(root, sub, 30, Pal.Hex("FFE7B0"), new Vector2(0, cy + bandH * 0.5f - 60), new Vector2(800, 44), TextAnchor.MiddleCenter, Fonts.Heavy);
            for (int i = 0; i < items.Count; i++)
            {
                int row = i / 5, col = i % 5;
                int inRow = Mathf.Min(5, items.Count - row * 5);
                var pos = new Vector2((col - (inRow - 1) * 0.5f) * 190, cy - 30 - (row - (rows - 1) * 0.5f) * 210);
                var t = MetaUi.ItemTile(root, items[i], pos, 140);
                float delay = 0.2f + i * 0.09f;
                Tween.Pop(t, 0.3f, delay);
                var glow = Ui.Box(t, Vector2.one * 220, Vector2.zero, Pal.Gold.A(0.35f), Art.SoftDot, "glow");
                glow.transform.SetAsFirstSibling();
                Tween.Run(t, delay + 0.01f, k => { }, () => Sfx.Play(Snd.Coin, 0.4f, 1f + 0.06f * i));
            }
            Hint(root, cy - bandH * 0.5f - 90);
        }

        // ---------------- 新好汉揭晓 ----------------

        public static void HeroReveal(Transform layer, HeroId h, Action done = null)
        {
            var d = Defs.Hero(h);
            var col = MetaUi.RarityColor(d.Rarity);
            RectTransform root = null;
            root = Overlay(layer, "reveal", 0.92f, () => { Dismiss(root); done?.Invoke(); }, 0.9f);
            var tint = Ui.Fill(root, col.Mul(0.45f).A(0.85f), false, "tint");
            tint.SetSiblingIndex(1);
            Ui.Box(root, new Vector2(1400, 1400), new Vector2(0, 40), col.A(0.55f), Art.SoftDot, "halo");
            Rays(root, new Vector2(0, 40), 1100, Color.Lerp(col, Color.white, 0.5f).A(0.5f));
            Sfx.Play(Snd.Reveal, 0.9f);
            string title = $"结识{d.RarityName}乡亲！";
            var tt = Ui.Outlined(root, title, 76, Color.white, new Vector2(0, 560), new Vector2(1000, 110), col.Mul(0.5f), 5f);
            Tween.Pop(tt.transform, 0.35f, 0.5f);

            var card = Ui.Rect(root, "card");
            card.anchoredPosition = new Vector2(0, 40);
            card.sizeDelta = new Vector2(440, 560);
            MetaUi.Card(card, MetaUi.RarityCard(d.Rarity), new Vector2(440, 560), Vector2.zero);
            var art = Ui.Icon(card, d.Art, 400, new Vector2(0, 52));
            var namePlaque = Ui.Box(card, new Vector2(340, 74), new Vector2(0, -206), new Color(0.06f, 0.10f, 0.16f, 0.68f), Art.Pill);
            Ui.Box(namePlaque.transform, new Vector2(332, 66), Vector2.zero, MetaUi.QualGlow(MetaUi.HeroTier(d.Rarity)).A(0.28f), Art.Pill);
            Ui.Outlined(card, d.Name, 54, d.Rarity >= 4 ? Pal.Hex("FFF1B4") : Color.white, new Vector2(0, -205), new Vector2(330, 72), Pal.Ink, 3f);
            MetaUi.Badge(card, d.Role, MetaUi.RoleColor(d.Kind), new Vector2(132, 54), new Vector2(-128, 232), 28);
            Ui.SingleLine(Ui.Outlined(root, $"「{d.Nick}」{d.Desc}", 32, Pal.Hex("FFE7B0"), new Vector2(0, -330), new Vector2(980, 50), Pal.Ink, 2f), 21);

            // 好汉先从左边拖着尾光冲到中间，再翻成卡
            card.localScale = new Vector3(0, 1, 1);
            var fly = Ui.Icon(root, d.Art, 260, new Vector2(-700, 120));
            var trail = Ui.Box(root, new Vector2(420, 90), new Vector2(-900, 120), Pal.Gold.A(0.7f), Art.SoftDot, "trail");
            Tween.Run(fly, 0.45f, k =>
            {
                var p = Vector2.Lerp(new Vector2(-700, 120), new Vector2(0, 80), Tween.OutCubic(k));
                fly.rectTransform.anchoredPosition = p;
                fly.rectTransform.localRotation = Quaternion.Euler(0, 0, (1 - k) * 25);
                trail.rectTransform.anchoredPosition = p - new Vector2(200, 0);
                trail.color = Pal.Gold.A(0.7f * (1 - k));
            }, () =>
            {
                if (fly) Object.Destroy(fly.gameObject);
                if (trail) Object.Destroy(trail.gameObject);
                Sfx.Play(Snd.Flip, 0.9f);
                Tween.Run(card, 0.3f, k => card.localScale = new Vector3(Tween.OutBack(k), 1, 1), () =>
                {
                    Burst(root, new Vector2(0, 40), 22, 520, Color.Lerp(col, Color.white, 0.4f));
                    Confetti(root, 50);
                });
                Tween.Run(art, 999f, k => art.rectTransform.anchoredPosition = new Vector2(0, 70 + 8 * Mathf.Sin(k * 999f * 2.4f)), null, 0.3f);
            }, 0.15f);
            Hint(root, -560);
        }

        /// <summary>依次揭晓若干好汉，最后回调。</summary>
        public static void RevealAll(Transform layer, List<HeroId> heroes, Action done = null)
        {
            if (heroes.Count == 0) { done?.Invoke(); return; }
            var h = heroes[0];
            heroes.RemoveAt(0);
            HeroReveal(layer, h, () => RevealAll(layer, heroes, done));
        }
    }
}
