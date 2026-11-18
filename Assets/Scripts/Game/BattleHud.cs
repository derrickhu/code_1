using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>战斗界面：顶栏、墙血、底部召唤/强化、横幅、三选一、老虎机、暂停、统计、结算、新手引导。</summary>
    public sealed class BattleHud : MonoBehaviour
    {
        BattleView _v;
        Battle B => _v.B;
        RectTransform _root;
        float _st;

        Text _title, _wave, _timer, _speedText, _coins, _hpText, _leaderText, _lordCd;
        RectTransform _lordBadge;
        Image _lordFill, _lordGlow;
        Text _sumLabel, _sumCost, _enhLabel, _enhCost;
        Image _hpFill, _hpGhost, _speedHex, _sumGlow, _enhGlow;
        Image _enhRim, _enhFace, _enhBevel, _sumRim, _sumFace, _sumBevel;
        Vector3 _bookBaseScale = Vector3.one, _bookBasePos;
        float _bookLitK;
        RectTransform _coinPill, _sumBtn, _enhBtn, _hpBar, _wavePill;
        RectTransform _gm, _gmPanel;
        bool _bossAlive;
        RectTransform _bubble;
        Text _bubbleText;
        float _bubbleT;
        RectTransform _info;
        float _infoT;
        bool _infoLord;
        RectTransform _perkDock, _perkPanel;
        string _perkSig = "";
        HeroId _perkHero;
        float _shownHp = 1f, _ghostHp = 1f;
        int _shownCoins, _coinInFlight;
        Image[] _rage;
        float _rageT;

        RectTransform _modal;
        string _modalKind;
        float _reelsDelay;
        readonly Queue<Action> _banners = new Queue<Action>();
        /// <summary>播报层；弹窗打开时整层隐藏，不透到弹窗上。</summary>
        RectTransform _announce;
        CanvasGroup _announceGroup;
        RectTransform _rageTag;
        float _bannerBusy;
        RectTransform _guide;
        int _guideStep = -1;

        public void PressSummon() => TrySummon();
        public void PressEnhance() => TryEnhance();
        public void ChooseCard(int i) => PickCard(i, _cards);
        public void OpenPanel(string kind)
        {
            if (kind == "pause") OpenPause();
            else if (!_statsOpen) ToggleStats();
        }
        public void ClosePanel() => CloseModal();
        List<RectTransform> _cards = new List<RectTransform>();

        public bool Blocking => _modal != null;
        public string ModalKind => _modal != null ? _modalKind : null;

        public static BattleHud Create(BattleView v)
        {
            var rt = Ui.Rect(Ui.Root, "BattleHud");
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            var hud = rt.gameObject.AddComponent<BattleHud>();
            hud._v = v;
            hud._root = rt;
            hud.Build();
            return hud;
        }

        // ---------------- 搭建 ----------------

        void Build()
        {
            _st = Ui.SafeTop;
            BuildTop();
            BuildBottom();
            BuildRage();
            _announce = Ui.Rect(_root, "announce");
            _announce.anchorMin = Vector2.zero;
            _announce.anchorMax = Vector2.one;
            _announce.offsetMin = _announce.offsetMax = Vector2.zero;
            _announceGroup = _announce.gameObject.AddComponent<CanvasGroup>();
            _announceGroup.blocksRaycasts = false;
            _shownCoins = B.Coins;
            BuildGm();
        }

        /// <summary>左侧统计下面的小巧调试钮。弹层或详情打开时自动避让隐藏，绝不遮挡任何界面。</summary>
        void BuildGm()
        {
            if (!Gm.Allowed) return;
            _gm = TopRt(-462, 520, new Vector2(108, 54), "gm");
            Ui.Btn(_gm, "GM", new Vector2(108, 54), Vector2.zero, Pal.Red, ShowBattleGm, 28);
        }

        void ShowBattleGm()
        {
            if (_gmPanel || B.Phase == Phase.Victory || B.Phase == Phase.Defeat) return;
            _v.Paused = true;
            var layer = Ui.Rect(_root, "gmPanel");
            layer.anchorMin = Vector2.zero;
            layer.anchorMax = Vector2.one;
            layer.offsetMin = layer.offsetMax = Vector2.zero;
            _gmPanel = layer;
            var dim = Ui.Fill(layer, new Color(0.02f, 0.04f, 0.08f, 0.72f), true, "dim");
            var hit = dim.gameObject.AddComponent<Button>();
            hit.transition = Selectable.Transition.None;
            hit.onClick.AddListener(CloseBattleGm);
            var card = Ui.Panel(layer, new Vector2(820, 760), new Vector2(0, 40));
            Ui.Ribbon(card, "GM", new Vector2(0, 386), 420, Pal.Red);
            var x = Ui.Icon(card, "ui/close", 100, new Vector2(370, 340), "close");
            Ui.Tap(x, CloseBattleGm, null, false);
            Ui.Label(card, "直接结束这一局，走真正的结算。\n胜利按满血三星，失败按防线失守，守到第几波就按第几波算。", 32, Pal.SubInk, new Vector2(0, 160), new Vector2(700, 140));
            Ui.Btn(card, "跳过本关", new Vector2(560, 120), new Vector2(0, -20), Pal.Red, GmWin, 48);
            Ui.Btn(card, "失败结算", new Vector2(560, 120), new Vector2(0, -180), Pal.Slate, GmLose, 48);
            layer.SetAsLastSibling();
            Tween.Pop(card, 0.25f);
        }

        void CloseBattleGm()
        {
            if (!_gmPanel) return;
            Destroy(_gmPanel.gameObject);
            _gmPanel = null;
            _v.Paused = false;
        }

        void GmWin() => GmEnd(true);

        void GmLose() => GmEnd(false);

        void GmEnd(bool win)
        {
            CloseBattleGm();
            if (_modal != null) CloseModal();
            if (win) B.ForceWin();
            else B.ForceLose();
            _resultDelay = 0f;
        }

        RectTransform TopRt(float x, float y, Vector2 size, string name) => Ui.Top(_root, x, y + _st, size, name);

        void BuildTop()
        {
            var title = TopRt(0, 60, new Vector2(720, 80), "title");
            _title = Ui.SingleLine(Ui.Outlined(title, B.Stage.Title, 50, Color.white, Vector2.zero, new Vector2(720, 80), Pal.Hex("102236"), 3.5f), 28);
            _wavePill = TopRt(0, 126, new Vector2(276, 54), "wave");
            Ui.Box(_wavePill, new Vector2(276, 54), Vector2.zero, Pal.Hex("5E82A4").A(0.55f), Art.Pill);
            Ui.Box(_wavePill, new Vector2(270, 48), Vector2.zero, Pal.Hex("132232").A(0.84f), Art.Pill);
            _wave = Ui.Outlined(_wavePill, $"波次：1/{B.Stage.Waves}", 32, Pal.Cream, new Vector2(0, 1), new Vector2(270, 48), Pal.Hex("0D1824"), 2f);
            if (B.Stage.BuffRole.HasValue)
            {
                var buff = TopRt(-276, 126, new Vector2(228, 48), "buff");
                Ui.Box(buff, new Vector2(228, 46), Vector2.zero, Pal.Hex("1F523A").A(0.88f), Art.Pill);
                Ui.Outlined(buff, B.Stage.BuffText, 24, Pal.Hex("C8FFB8"), new Vector2(0, 1), new Vector2(222, 46), Pal.Ink, 1.5f);
            }

            // 狂暴后挂在波次下面的红色提示条
            _rageTag = TopRt(0, 184, new Vector2(300, 52), "rageTag");
            Ui.Box(_rageTag, new Vector2(300, 48), new Vector2(0, -3), Pal.Shadow, Art.Pill);
            Ui.Box(_rageTag, new Vector2(300, 48), Vector2.zero, Pal.Hex("5A1410"), Art.Pill);
            Ui.Box(_rageTag, new Vector2(290, 38), Vector2.zero, Pal.Hex("C5352A"), Art.Pill);
            Ui.Icon(_rageTag, "ic_rage", 62, new Vector2(-122, 6));
            Ui.Outlined(_rageTag, "外星军进入狂暴", 28, Color.white, new Vector2(18, 1), new Vector2(240, 44), Pal.Hex("5A1410"), 2f);
            _rageTag.gameObject.SetActive(false);

            // 左列三枚六角框同一外径、同一描边，计时夹在暂停和倍速中间。
            const float hex = 96f, face = 84f;
            Image Hex(float y, string name, out RectTransform rt)
            {
                rt = TopRt(-462, y, new Vector2(hex, hex), name);
                Ui.Box(rt, new Vector2(hex, hex), new Vector2(0, -3), Pal.Shadow, Art.Hex6);
                Ui.Box(rt, new Vector2(hex - 4, hex - 4), Vector2.zero, Pal.Hex("6D8EAE").A(0.75f), Art.Hex6);
                return Ui.Box(rt, new Vector2(face, face), Vector2.zero, Pal.Hex("162638").A(0.86f), Art.Hex6);
            }
            var pbg = Hex(80, "pause", out var pause);
            Ui.Box(pause, new Vector2(12, 34), new Vector2(-11, 0), Pal.Cream, Art.RoundedSmall);
            Ui.Box(pause, new Vector2(12, 34), new Vector2(11, 0), Pal.Cream, Art.RoundedSmall);
            Ui.Tap(pbg, OpenPause, pause);
            _timer = Ui.Outlined(TopRt(-462, 152, new Vector2(120, 40), "timer"), "0:00", 28, Color.white, Vector2.zero, new Vector2(120, 40), Pal.Hex("0E1A28"), 2.2f);

            _speedHex = Hex(224, "speed", out var speed);
            _speedText = Ui.Outlined(speed, "×1", 34, Color.white, new Vector2(0, 1), new Vector2(hex, 52), Pal.Hex("0E1A28"), 2.2f);
            Ui.Tap(_speedHex, ToggleSpeed, speed);

            Hex(368, "stats", out var stats);
            _statRing = stats.GetChild(1).GetComponent<Image>();
            _statHex = stats.GetChild(2).GetComponent<Image>();
            _statBars = new Image[3];
            for (int i = 0; i < 3; i++)
                _statBars[i] = Ui.Box(stats, new Vector2(11, 18 + i * 10), new Vector2(-16 + i * 16, -6 + i * 8), Pal.Cream, Art.RoundedSmall);
            Ui.Outlined(stats, "统计", 24, Color.white, new Vector2(0, -62), new Vector2(96, 32), Pal.Hex("0E1A28"), 2f);
            Ui.Tap(_statHex, ToggleStats, stats);

            // 右列：本关怪物入口（清爽双线方框，无波次预告噪点；首领血条改为直接跟随首领头顶，绝不横挡视野）
            BuildRoster();
        }

        const float HpW = 924f, HpH = 34f;

        /// <summary>贴在填充条上的横条（随填充一起伸缩）：inset 为左右总内缩，y 为离中心的偏移。</summary>
        static void Strip(Transform parent, float inset, float h, float y, Color c)
        {
            var rt = Ui.Box(parent, new Vector2(0, h), new Vector2(0, y), c, Art.RoundedSmall).rectTransform;
            rt.anchorMin = new Vector2(0, 0.5f);
            rt.anchorMax = new Vector2(1, 0.5f);
            rt.sizeDelta = new Vector2(inset, h);
            rt.anchoredPosition = new Vector2(0, y);
        }

        void BuildBottom()
        {
            // 墙血条：贴着墙脚，按世界坐标换算。
            _hpBar = Ui.Bottom(_root, 0, Ui.FromBottom(-6.48f), new Vector2(920, 50), "hp");
            Ui.Box(_hpBar, new Vector2(948, 56), new Vector2(0, -4), Color.black.A(0.42f), Art.RoundedSmall);
            Ui.Box(_hpBar, new Vector2(948, 56), Vector2.zero, Pal.Hex("121E2C"), Art.RoundedSmall);
            Ui.Box(_hpBar, new Vector2(938, 46), Vector2.zero, Pal.Hex("4E6882"), Art.RoundedSmall);
            Ui.Box(_hpBar, new Vector2(932, 40), Vector2.zero, Pal.Hex("1C2B3B"), Art.RoundedSmall);
            Ui.Box(_hpBar, new Vector2(926, 10), new Vector2(0, 14), Color.black.A(0.32f), Art.RoundedSmall);
            _hpGhost = Ui.Box(_hpBar, new Vector2(HpW, HpH), Vector2.zero, Pal.Hex("F2F6FA"), Art.RoundedSmall);
            _hpFill = Ui.Box(_hpBar, new Vector2(HpW, HpH), Vector2.zero, Pal.Hex("3ED248"), Art.RoundedSmall);
            Strip(_hpFill.transform, -10, 7, -12, Color.black.A(0.18f));
            Strip(_hpFill.transform, -12, 11, 7, new Color(0.86f, 1f, 0.72f, 0.45f));
            foreach (var img in new[] { _hpGhost, _hpFill })
            {
                img.rectTransform.pivot = new Vector2(0, 0.5f);
                img.rectTransform.anchoredPosition = new Vector2(-HpW * 0.5f, 0);
            }
            var heart = Ui.Icon(_hpBar, "ic_heart", 42, new Vector2(315, 44));
            _hpText = Ui.Outlined(_hpBar, "6000", 36, Color.white, new Vector2(416, 44), new Vector2(160, 48), Pal.Hex("0E1A28"), 2.6f, TextAnchor.MiddleLeft);
            heart.rectTransform.anchoredPosition = new Vector2(315, 44);

            // 银两：紧贴血条左下方，深靛鎏金双层胶囊 + 亮银祥云币（数字字号与下方强化/召唤价格统一 36 号）。
            _coinPill = Ui.Bottom(_root, -444, Ui.FromBottom(-7.22f), new Vector2(198, 68), "coins");
            Ui.Box(_coinPill, new Vector2(174, 54), new Vector2(14, -4), Pal.Shadow, Art.Pill);
            Ui.Box(_coinPill, new Vector2(174, 54), new Vector2(14, 0), Pal.Hex("0E1A28"), Art.Pill);
            Ui.Box(_coinPill, new Vector2(166, 46), new Vector2(14, 0), Pal.Hex("6B8EAD"), Art.Pill);
            Ui.Box(_coinPill, new Vector2(158, 38), new Vector2(14, 0), Pal.Hex("17293D"), Art.Pill);
            Ui.Box(_coinPill, new Vector2(144, 15), new Vector2(14, 9), Pal.Hex("233D58"), Art.Pill);
            Ui.Box(_coinPill, new Vector2(72, 72), new Vector2(-62, -2), Color.black.A(0.28f), Art.Circle);
            Ui.Box(_coinPill, new Vector2(68, 68), new Vector2(-62, 1), Color.white, Art.Coin);
            _coins = Ui.Outlined(_coinPill, "100", 36, Color.white, new Vector2(28, 1), new Vector2(132, 50), Pal.Hex("0C1622"), 2.5f);

            // 底部按钮：严格镜像对称，上下分栏铭牌，价格字号全栏统一 36 号。
            if (_v.Book)
            {
                _bookBaseScale = _v.Book.localScale;
                _bookBasePos = _v.Book.localPosition;
            }
            _enhBtn = BottomButton(-304, "改装", out _enhLabel, out _enhCost, out _enhGlow, out _enhRim, out _enhFace, out _enhBevel, () => TryEnhance(), _v.Book);
            _sumBtn = BottomButton(304, "摇人", out _sumLabel, out _sumCost, out _sumGlow, out _sumRim, out _sumFace, out _sumBevel, () => TrySummon(), _v.Drum);

            // 召唤进度刻在点将碉台下层条石正中（对齐蔚蓝星球无黑丸刻字质感）。
            var leader = Ui.Bottom(_root, 0, 32, new Vector2(150, 44), "leader");
            Ui.Box(leader, new Vector2(124, 34), Vector2.zero, Pal.Hex("0E1A28").A(0.52f), Art.Pill);
            _leaderText = Ui.Outlined(leader, "0/5", 32, Pal.Hex("8CE0FF"), new Vector2(0, 1), new Vector2(148, 44), Pal.Hex("0B1520"), 2.4f);
            var leaderHit = Ui.Bottom(_root, 0, 158, new Vector2(236, 236), "leaderHit").gameObject.AddComponent<Image>();
            leaderHit.color = new Color(0, 0, 0, 0);
            Ui.Tap(leaderHit, () => LordInfo(), null, false);

            // 寨主技能章挂在点将碉台右侧台肩，紧凑精致不压人物与铭牌。
            _lordBadge = Ui.Bottom(_root, 108, 108, new Vector2(68, 68), "lordSkill");
            _lordGlow = Ui.Box(_lordBadge, new Vector2(118, 118), Vector2.zero, Pal.Gold.A(0), Art.SoftDot, "glow");
            Ui.Box(_lordBadge, new Vector2(68, 68), Vector2.zero, Pal.Hex("D8B258"), Art.Circle);
            var lbg = Ui.Box(_lordBadge, new Vector2(60, 60), Vector2.zero, Pal.Hex("152434"), Art.Circle);
            _lordFill = Ui.Box(_lordBadge, new Vector2(60, 60), Vector2.zero, Pal.Hex("F2B632"), Art.Circle, "fill");
            _lordFill.type = Image.Type.Filled;
            _lordFill.fillMethod = Image.FillMethod.Radial360;
            _lordFill.fillOrigin = (int)Image.Origin360.Top;
            _lordFill.fillClockwise = true;
            Ui.Box(_lordBadge, new Vector2(46, 46), Vector2.zero, Pal.Hex("1E3248").A(0.94f), Art.Circle);
            Ui.Icon(_lordBadge, "ic_sword", 36, new Vector2(0, 4));
            _lordCd = Ui.Outlined(_lordBadge, "", 20, Pal.Hex("FFF2B2"), new Vector2(0, -16), new Vector2(84, 26), Pal.Hex("0E1A28"), 1.8f);
            Ui.Tap(lbg, () => LordInfo(), _lordBadge, false);

            _bubble = Ui.Bottom(_root, 0, 306, new Vector2(420, 118), "bubble");
            Ui.Box(_bubble, new Vector2(420, 112), new Vector2(0, -4), Pal.Shadow, Art.Rounded);
            Ui.Box(_bubble, new Vector2(420, 112), Vector2.zero, Pal.Hex("5C80A2"), Art.Rounded);
            Ui.Box(_bubble, new Vector2(408, 100), Vector2.zero, Pal.Cream, Art.Rounded);
            var tail = Ui.Box(_bubble, new Vector2(28, 28), new Vector2(0, -54), Pal.Cream, Art.RoundedSmall);
            tail.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            _bubbleText = Ui.Label(_bubble, "", 32, Pal.Ink, new Vector2(0, 2), new Vector2(396, 96), TextAnchor.MiddleCenter, Fonts.Heavy);
            _bubble.gameObject.SetActive(false);
        }

        RectTransform BottomButton(float x, string label, out Text lbl, out Text cost, out Image glow,
            out Image rim, out Image face, out Image bevel, Action onTap, Transform prop)
        {
            var hit = Ui.Bottom(_root, x, 154, new Vector2(316, 268), label + "Hit");
            var hitImg = hit.gameObject.AddComponent<Image>();
            hitImg.color = new Color(0, 0, 0, 0);
            // 对标蔚蓝星球上下双色铭牌：上层深靛标题栏、下层亮底价格栏、左侧外凸立体圆银币，标题 34 号 / 价格固定 36 号。
            var b = Ui.Bottom(_root, x, 44, new Vector2(252, 98), label);
            glow = Ui.Box(b, new Vector2(316, 158), new Vector2(0, 4), Pal.Gold.A(0), Art.SoftDot, "glow");
            Ui.Box(b, new Vector2(240, 92), new Vector2(4, -5), Pal.Shadow, Art.Rounded);
            Ui.Box(b, new Vector2(240, 92), new Vector2(4, 0), Pal.Hex("0D1824"), Art.Rounded);
            rim = Ui.Box(b, new Vector2(232, 84), new Vector2(4, 0), Pal.Hex("5A7692"), Art.Rounded);
            face = Ui.Box(b, new Vector2(224, 76), new Vector2(4, 0), Pal.Hex("152436"), Art.Rounded);
            bevel = Ui.Box(b, new Vector2(216, 36), new Vector2(4, -17), Pal.Hex("243B54"), Art.RoundedSmall);
            Ui.Box(b, new Vector2(84, 84), new Vector2(-84, -2), Color.black.A(0.32f), Art.Circle);
            Ui.Box(b, new Vector2(80, 80), new Vector2(-84, 0), Pal.Hex("0E1A28"), Art.Circle);
            Ui.Box(b, new Vector2(74, 74), new Vector2(-84, 1), Color.white, Art.Coin);
            lbl = Ui.Outlined(b, label, 34, Pal.Hex("FFE68A"), new Vector2(28, 19), new Vector2(158, 40), Pal.Hex("0B1420"), 2.4f);
            cost = Ui.Outlined(b, "0", 36, Color.white, new Vector2(28, -17), new Vector2(158, 40), Pal.Hex("0B1420"), 2.5f, TextAnchor.MiddleCenter);
            cost.resizeTextForBestFit = false;
            lbl.resizeTextForBestFit = false;
            Ui.Tap(hitImg, () =>
            {
                if (prop)
                {
                    if (prop == _v.Book) prop.localScale = _bookBaseScale;
                    Tween.Punch(prop, 0.18f, 0.08f);
                }
                onTap();
            }, b, false);
            return b;
        }

        void BuildRage()
        {
            _rage = new Image[2];
            for (int i = 0; i < 2; i++)
            {
                var img = Ui.Box(_root, new Vector2(1080, 260), Vector2.zero, Pal.Red.A(0), Art.VGrad, "rage");
                var rt = img.rectTransform;
                rt.anchorMin = new Vector2(0, i == 0 ? 1 : 0);
                rt.anchorMax = new Vector2(1, i == 0 ? 1 : 0);
                rt.sizeDelta = new Vector2(0, 260);
                rt.anchoredPosition = new Vector2(0, i == 0 ? -130 : 130);
                if (i == 0) rt.localRotation = Quaternion.Euler(0, 0, 180);
                img.transform.SetAsFirstSibling();
                _rage[i] = img;
            }
        }

        // ---------------- 操作 ----------------

        void TrySummon()
        {
            if (Blocking || B.Phase != Phase.Running) return;
            if (!B.HasEmptySlot())
            {
                Sfx.Play(Snd.Deny);
                Say("防线站满了\n拖动相同乡亲合体");
                return;
            }
            if (B.SpendableCoins < B.SummonCost)
            {
                Sfx.Play(Snd.Deny);
                Tween.Punch(_coinPill, 0.2f, 0.15f);
                Ui.Toast("能量币不足", 260);
                return;
            }
            B.Summon();
            if (_guideStep == 0) NextGuide();
        }

        /// <summary>本局已经召唤的次数。合成会把场上人数吃掉，强化只看召唤了几次。</summary>
        bool SummonedEnough() => B.Recruited >= Defs.EnhanceUnlockSummons;

        void TryEnhance()
        {
            if (Blocking || B.Phase != Phase.Running) return;
            if (!SummonedEnough())
            {
                Sfx.Play(Snd.Deny);
                ShowEnhanceNeed();
                return;
            }
            if (B.SpendableCoins < B.EnhanceCost)
            {
                Sfx.Play(Snd.Deny);
                Tween.Punch(_coinPill, 0.2f, 0.15f);
                Ui.Toast("能量币不足", 260);
                return;
            }
            if (!B.Enhance())
            {
                Ui.Toast("所有强化都已拿满", 260);
                return;
            }
            Sfx.Play(Snd.Card);
            if (_guideStep == 2) NextGuide();
        }

        RectTransform _enhNeedTip;

        /// <summary>召唤次数不够时，提示贴在强化书正上方，点下去就能看见。</summary>
        void ShowEnhanceNeed()
        {
            string s = $"摇人{Defs.EnhanceUnlockSummons}次，才能改装";
            if (_enhNeedTip) Destroy(_enhNeedTip.gameObject);
            const float w = 456f, h = 72f;
            // 强化点击区顶边离底 288。提示底边再抬 12，和按钮同一列，略往右让左边不裁出屏幕。
            var host = Ui.Bottom(_root, -248f, 288f + 12f + h * 0.5f, new Vector2(w, h), "enhNeed");
            var bg = Ui.Skin(host, "pill", new Vector2(w, h), Vector2.zero, -1f);
            bg.raycastTarget = false;
            var label = Ui.Label(host, s, 32, Pal.Cream, Vector2.zero, new Vector2(w - 28f, h), TextAnchor.MiddleCenter, Fonts.Heavy);
            label.raycastTarget = false;
            host.SetAsLastSibling();
            Tween.Pop(host, 0.18f);
            _enhNeedTip = host;
            Tween.Run(host, 1.6f, _ => { }, () =>
            {
                if (_enhNeedTip == host) _enhNeedTip = null;
                if (host) Destroy(host.gameObject);
            });
        }

        /// <summary>主线还没打通过的关不能加速。机器人自检不受限。</summary>
        bool SpeedLocked() => _v.Auto == null && B.Stage.Mode == StageMode.Main && B.Stage.No > Profile.S.Cleared;

        void ToggleSpeed()
        {
            if (SpeedLocked())
            {
                _v.Speed = 1f;
                Sfx.Play(Snd.Deny);
                Ui.Toast("通关本关后才能加速", 220);
                return;
            }
            var s = Profile.S;
            bool can15 = s.Cleared >= 1 || s.Speed15 == 1 || _v.Auto != null;
            if (!can15)
            {
                Ui.Toast("通关第 1 关后开放倍速", 200);
                return;
            }
            bool can2Free = (B.Stage.Mode == StageMode.Main && B.Stage.No <= s.Cleared) || s.Speed2Day == Profile.Today || _v.Auto != null;
            if (_v.Speed < 1.2f)
            {
                _v.Speed = 1.5f;
                PlayerPrefs.SetInt("battle_spd", 1);
            }
            else if (_v.Speed < 1.8f)
            {
                if (can2Free)
                {
                    _v.Speed = 2f;
                    PlayerPrefs.SetInt("battle_spd", 2);
                }
                else
                {
                    FakeAd("speed2", () =>
                    {
                        s.Speed2Day = Profile.Today;
                        Profile.Save();
                        _v.Speed = 2f;
                        PlayerPrefs.SetInt("battle_spd", 2);
                        Ui.Toast("今日全天已解锁 ×2.0 极速！", 220);
                    });
                }
            }
            else
            {
                _v.Speed = 1f;
                PlayerPrefs.SetInt("battle_spd", 0);
            }
        }

        // ---------------- 每帧 ----------------

        void Update()
        {
            if (_v == null || B == null) return;
            MaybeShowRoster();
            float dt = Time.unscaledDeltaTime;
            _wave.text = $"波次：{Mathf.Max(1, B.Wave)}/{B.Stage.Waves}";
            int sec = Mathf.FloorToInt(B.Time);
            _timer.text = $"{sec / 60}:{sec % 60:00}";
            if (SpeedLocked() && _v.Speed > 1.01f) _v.Speed = 1f;
            bool fast2 = _v.Speed > 1.75f;
            bool fast = _v.Speed > 1.01f;
            _speedText.text = fast2 ? "×2" : fast ? "×1.5" : "×1";
            _speedHex.color = fast2 ? Pal.Hex("C84828") : fast ? Pal.Hex("D88424") : Pal.Hex("162638").A(0.86f);
            if (_statsOpen && _stats != null)
            {
                bool show = B.Phase == Phase.Running && !Blocking && !InfoOpen;
                if (_stats.gameObject.activeSelf != show) _stats.gameObject.SetActive(show);
                if (show) RefreshStats();
            }

            if (B.Phase == Phase.Victory || B.Phase == Phase.Defeat)
            {
                _coinInFlight = 0;
                B.FlushHeldCoins();
                _shownCoins = Mathf.Max(0, B.Coins);
            }
            else
            {
                int coinTarget = Mathf.Max(0, B.Coins - _coinInFlight);
                int coinGap = coinTarget - _shownCoins;
                if (coinGap < 0)
                {
                    float step = Mathf.Max(1f, -coinGap * 14f * dt);
                    _shownCoins = (int)Mathf.MoveTowards(_shownCoins, coinTarget, step);
                }
            }
            _coins.text = Ui.Num(_shownCoins);
            _coins.color = Color.white;

            float hp = B.WallMax > 0 ? Mathf.Clamp01(B.Wall / B.WallMax) : 0;
            _shownHp = Mathf.MoveTowards(_shownHp, hp, dt * 2f);
            _ghostHp = _ghostHp < _shownHp ? _shownHp : Mathf.MoveTowards(_ghostHp, _shownHp, dt * 0.35f);
            _hpFill.rectTransform.sizeDelta = new Vector2(HpW * Mathf.Max(0.03f, _shownHp), HpH);
            _hpGhost.rectTransform.sizeDelta = new Vector2(HpW * Mathf.Max(0.03f, _ghostHp), HpH);
            _hpFill.color = hp > 0.5f ? Pal.Hex("45C531") : hp > 0.25f ? Pal.Hex("E8B830") : Pal.Hex("E2483A");
            _hpText.text = Mathf.CeilToInt(B.Wall).ToString();

            RefreshSummonEnhance();
            float cd = Mathf.Max(0.5f, B.LordDur);
            // 满圈（正好 1）时径向填充的网格会粘住，下一轮不再转。停在 0.999。
            float charge = Mathf.Clamp(1f - B.LordT / cd, 0f, 0.999f);
            if (_lordFill.fillAmount > 0.99f && charge < 0.5f)
            {
                _lordFill.fillMethod = Image.FillMethod.Horizontal;
                _lordFill.fillAmount = 0f;
                _lordFill.fillMethod = Image.FillMethod.Radial360;
                _lordFill.fillOrigin = (int)Image.Origin360.Top;
                _lordFill.fillClockwise = true;
            }
            _lordFill.fillAmount = charge;
            _lordCd.text = B.LordT > 0.5f ? $"{Mathf.CeilToInt(B.LordT)}s" : "";
            _lordGlow.color = Pal.Gold.A(B.LordT < 3f ? 0.35f + 0.25f * Mathf.Sin(Time.unscaledTime * 8f) : 0);

            UpdateBubble(dt);
            if (_info && ((_infoT -= dt) <= 0 || (_infoSlot != null && _infoSlot.Unit == null))) CloseInfo();
            UpdateEnemyInfo();
            SyncPerks();
            if (_rageT > 0)
            {
                float a = 0.5f + 0.18f * Mathf.Sin(Time.unscaledTime * 4f);
                foreach (var r in _rage) r.color = Pal.Red.A(a);
            }
            if (_bannerBusy > 0) _bannerBusy -= dt;
            else if (_banners.Count > 0 && !Blocking) _banners.Dequeue()();
            _announceGroup.alpha = Mathf.MoveTowards(_announceGroup.alpha, Blocking || InfoOpen ? 0 : 1, dt * 10f);
            if (_info && !Blocking) _info.SetAsLastSibling();
            UpdatePhase(dt);
            UpdateGuide();
            if (_gm)
            {
                bool done = B.Phase == Phase.Victory || B.Phase == Phase.Defeat;
                _gm.gameObject.SetActive(!done && _gmPanel == null && !Blocking && !InfoOpen);
                if (_gm.gameObject.activeSelf) _gm.SetAsLastSibling();
            }
        }

        void UpdateBubble(float dt)
        {
            if (_bubbleT <= 0) return;
            _bubbleT -= dt;
            if (_bubbleT <= 0) _bubble.gameObject.SetActive(false);
        }

        public void Say(string s, float dur = 2.2f)
        {
            _bubbleText.text = s;
            _bubble.gameObject.SetActive(true);
            _bubble.SetAsLastSibling();
            _bubble.localScale = Vector3.one;
            Tween.Pop(_bubble, 0.25f);
            _bubbleT = dur;
        }

        // ---------------- 视图回调 ----------------

        public void OnSummon()
        {
            if (_sumBtn == null) return;
            _sumBtn.localScale = Vector3.one;
            Tween.Punch(_sumBtn, 0.15f, 0.08f);
        }

        public void OnLordSkill()
        {
            Tween.Punch(_lordBadge, 0.3f, 0.25f);
        }

        public void OnSlotAdded()
        {
            Say("民兵壮大\n扩建防线战位！");
        }

        public void OnWallHit()
        {
            Tween.Punch(_hpBar, 0.12f, 0.025f);
        }

        public void PunchCoins() => Tween.Punch(_coinPill, 0.16f, 0.12f);

        bool BattleOver => B != null && (B.Phase == Phase.Victory || B.Phase == Phase.Defeat);

        /// <summary>银币离手：账上先挂住，数字先别涨，也不能拿去花。</summary>
        public void HoldCoin(int amount)
        {
            if (amount <= 0 || BattleOver) return;
            _coinInFlight += amount;
            B.HoldCoins(amount);
        }

        /// <summary>银币落到银币点：这一下就入账，数字跟上，召唤和强化马上能花。</summary>
        public void ArriveCoin(int amount)
        {
            if (amount <= 0 || BattleOver) return;
            _coinInFlight = Mathf.Max(0, _coinInFlight - amount);
            B.ReleaseCoins(amount);
            SnapSpendableCoins();
            if (_coinPill) Tween.Punch(_coinPill, 0.2f, 0.16f);
        }

        /// <summary>飞不动了的银币：不飘，直接入账。</summary>
        public void QueueCoin(int amount)
        {
            if (amount <= 0 || BattleOver) return;
            SnapSpendableCoins();
            PunchCoins();
        }

        /// <summary>把左下角余额拨到当前能花的数，并立刻重刷召唤、强化。</summary>
        void SnapSpendableCoins()
        {
            _shownCoins = Mathf.Max(0, B.Coins - _coinInFlight);
            if (_coins)
            {
                _coins.text = Ui.Num(_shownCoins);
                _coins.color = Color.white;
            }
            RefreshSummonEnhance();
        }

        void RefreshSummonEnhance()
        {
            bool canSum = B.CanSummon;
            _sumCost.text = Ui.Num(B.SummonCost);
            _sumCost.color = canSum ? Color.white : B.SpendableCoins >= B.SummonCost ? Pal.Hex("AFC2D4") : Pal.Hex("FF5C52");
            _sumRim.color = canSum ? Pal.Hex("E8C060") : Pal.Hex("5A7692");
            _sumFace.color = canSum ? Pal.Hex("182D44") : Pal.Hex("152436");
            _sumBevel.color = canSum ? Pal.Hex("2D5278") : Pal.Hex("223850");
            _sumLabel.color = canSum ? Pal.Hex("FFE68A") : Pal.Hex("DCEAF8");
            _sumGlow.color = Pal.Gold.A(canSum ? 0.22f + 0.12f * Mathf.Sin(Time.unscaledTime * 5f) : 0);

            bool canEnh = B.CanEnhance && SummonedEnough();
            _enhCost.text = Ui.Num(B.EnhanceCost);
            _enhCost.color = canEnh ? Color.white : B.SpendableCoins >= B.EnhanceCost ? Pal.Hex("AFC2D4") : Pal.Hex("FF5C52");
            _enhRim.color = canEnh ? Pal.Hex("E8C060") : Pal.Hex("5A7692");
            _enhFace.color = canEnh ? Pal.Hex("182D44") : Pal.Hex("152436");
            _enhBevel.color = canEnh ? Pal.Hex("2D5278") : Pal.Hex("223850");
            _enhLabel.color = canEnh ? Pal.Hex("FFE68A") : Pal.Hex("DCEAF8");
            _enhGlow.color = Pal.Gold.A(canEnh ? 0.22f + 0.12f * Mathf.Sin(Time.unscaledTime * 5f) : 0);
            if (_v.Book)
            {
                _bookLitK = Mathf.MoveTowards(_bookLitK, canEnh ? 1f : 0f, Time.unscaledDeltaTime * 5.5f);
                float breath = 0.5f + 0.5f * Mathf.Sin(Time.unscaledTime * 3.2f);
                if (!Tween.IsPunching(_v.Book))
                    _v.Book.localScale = _bookBaseScale * (1f + _bookLitK * (0.012f + 0.024f * breath));
                _v.Book.localPosition = _bookBasePos + new Vector3(0f, _bookLitK * 0.025f * (breath - 0.5f), 0f);
                if (_v.BookLit)
                    _v.BookLit.color = Color.white.A(_bookLitK * (0.86f + 0.14f * breath));
                if (_v.BookAura)
                {
                    _v.BookAura.color = Pal.Hex("5CF2FF").A(_bookLitK * (0.14f + 0.16f * breath));
                    float asx = 0.78f + 0.14f * breath;
                    float asy = 0.52f + 0.10f * breath;
                    _v.BookAura.transform.localScale = new Vector3(asx, asy, 1f);
                }
            }
            _leaderText.text = B.Slots.Count >= Layout.MaxSlots ? "已满" : $"{Defs.SummonsPerSlot - B.SummonsToNextSlot}/{Defs.SummonsPerSlot}";
        }

        /// <summary>波次自然连续演进，仅静默更新顶部「波次：X/10」，绝不弹出任何波次大字或倒计时框。</summary>
        public void OnWave(int w) { }

        public void OnWaveClear(int w) { }

        public void Rage()
        {
            _rageT = 999f;
            if (_rageTag.gameObject.activeSelf) return;
            _rageTag.gameObject.SetActive(true);
            Tween.Pop(_rageTag, 0.35f);
        }

        public void SyncBoss(Enemy boss)
        {
            bool on = boss != null;
            if (_bossAlive != on)
            {
                _bossAlive = on;
                if (!on) Sfx.PlayMusic(Bgm.Battle);
            }
        }

        /// <summary>横幅：深色长条从右滑入，停一下再滑出。</summary>
        public void Banner(string title, string sub, Color accent, string icon, bool small = false)
        {
            _banners.Enqueue(() => ShowBanner(title, sub, accent, icon, small));
        }

        void ShowBanner(string title, string sub, Color accent, string icon, bool small)
        {
            _bannerBusy = 1.5f;
            var band = Ui.Rect(_announce, "banner");
            band.anchorMin = band.anchorMax = new Vector2(0.5f, 1f);
            band.sizeDelta = new Vector2(1080, small ? 170 : 220);
            band.anchoredPosition = new Vector2(0, -(_st + 640));
            var group = band.gameObject.AddComponent<CanvasGroup>();
            group.blocksRaycasts = false;
            Ui.Box(band, new Vector2(1200, small ? 170 : 220), Vector2.zero, Pal.Hex("0F1C2A").A(0.84f), Art.White);
            Ui.Box(band, new Vector2(1200, 6), new Vector2(0, (small ? 85 : 110) - 3), accent, Art.White);
            Ui.Box(band, new Vector2(1200, 6), new Vector2(0, -(small ? 85 : 110) + 3), accent, Art.White);
            var content = Ui.Rect(band, "content");
            content.sizeDelta = band.sizeDelta;
            float tx = 0;
            if (icon != null)
            {
                Ui.Icon(content, icon, small ? 150 : 200, new Vector2(-330, 6));
                tx = 70;
            }
            Ui.Outlined(content, title, small ? 76 : 100, accent == Pal.TealDeep ? Pal.Hex("FFE9A8") : Pal.Hex("FFE08A"), new Vector2(tx, small ? 18 : 26), new Vector2(800, 130), accent.Mul(0.5f), 4.5f);
            Ui.Label(content, sub, small ? 32 : 36, Pal.Cream, new Vector2(tx, small ? -46 : -62), new Vector2(800, 50));
            Tween.Run(band, 1.5f, k =>
            {
                float x = k < 0.18f ? Mathf.Lerp(1100, 0, Tween.OutCubic(k / 0.18f)) : k > 0.85f ? Mathf.Lerp(0, -1100, Tween.InCubic((k - 0.85f) / 0.15f)) : 0;
                content.anchoredPosition = new Vector2(x, 0);
                group.alpha = k < 0.1f ? k / 0.1f : k > 0.9f ? (1 - k) / 0.1f : 1;
            }, () => Destroy(band.gameObject));
        }

        public void ChestDrop(Vector2 world)
        {
            _reelsDelay = 1.0f;
            var fx = WorldFx.I;
            fx.Burst(Art.SoftDot, world + new Vector2(0, 0.5f), 2.5f, 0.6f, 9500, Pal.Gold.A(0.9f));
            fx.Fly(Art.Img("ic_chest"), world + new Vector2(0, 0.4f), new Vector2(0, 1.2f), 1.2f, 0.85f, 1.5f);
            fx.Sparks(Art.Img("fx_star"), world + new Vector2(0, 0.4f), 10, 0.35f, 3.5f, Color.white, 0.6f, 9600, 2f);
            Sfx.Play(Snd.Jackpot, 0.5f);
        }

        RectTransform _mergeTip;
        Text _mergeTipText;
        readonly HashSet<EnemyKind> _flashedNew = new HashSet<EnemyKind>();
        RectTransform _newEnemyCard;

        /// <summary>拖拽悬停到可合成目标格上方时，浮出合成结果与辅助奖励预览。</summary>
        public void ShowMergePreview(Slot from, Slot to)
        {
            if (from?.Unit == null || to?.Unit == null) { HideMergePreview(); return; }
            if (_mergeTip == null)
            {
                _mergeTip = Ui.Rect(_root, "mergePreview");
                _mergeTip.sizeDelta = new Vector2(360, 56);
                Ui.Box(_mergeTip, new Vector2(360, 54), new Vector2(0, -3), Pal.Shadow, Art.Pill);
                Ui.Box(_mergeTip, new Vector2(356, 50), Vector2.zero, Pal.Hex("FFE066"), Art.Pill);
                Ui.Box(_mergeTip, new Vector2(348, 42), Vector2.zero, Pal.Hex("122436"), Art.Pill);
                _mergeTipText = Ui.Outlined(_mergeTip, "", 24, Color.white, new Vector2(0, 1), new Vector2(340, 40), Pal.Ink, 1.5f);
            }
            int nextStar = to.Unit.Star + 1;
            bool wild = from.Unit.Wild || to.Unit.Wild;
            bool sup = from.Unit.Def.Kind == Role.Support || to.Unit.Def.Kind == Role.Support;
            string label = nextStar >= 4 ? "合体 → 满星觉醒！" : $"合体 → ★{nextStar} 随机乡亲";
            if (wild) label = $"万能替班 → ★{nextStar}";
            if (sup) label += $" <color=#7CF29A>+{14 * nextStar}币</color>";
            _mergeTipText.text = label;
            Vector3 sp = Game.Cam.WorldToScreenPoint(to.Pos.ToV() + new Vector2(0, 1.28f));
            RectTransformUtility.ScreenPointToLocalPointInRectangle(_root, sp, null, out var lp);
            _mergeTip.anchoredPosition = lp;
            _mergeTip.gameObject.SetActive(true);
            _mergeTip.SetAsLastSibling();
        }

        public void HideMergePreview()
        {
            if (_mergeTip) _mergeTip.gameObject.SetActive(false);
        }

        /// <summary>首次遭遇未收录的特殊官军时，右上角滑出 2.6 秒非阻塞弱点快闪卡。</summary>
        public void NotifyNewEnemy(EnemyDef d)
        {
            if (_v.Auto != null || !_flashedNew.Add(d.Kind)) return;
            if (_newEnemyCard) Destroy(_newEnemyCard.gameObject);
            var card = TopRt(292, 286, new Vector2(420, 108), "newEnemyFlash");
            _newEnemyCard = card;
            var cg = card.gameObject.AddComponent<CanvasGroup>();
            cg.blocksRaycasts = false;
            Ui.Box(card, new Vector2(420, 104), new Vector2(0, -4), Pal.Shadow, Art.RoundedSmall);
            Ui.Box(card, new Vector2(416, 100), Vector2.zero, Pal.Hex("E5A832"), Art.RoundedSmall);
            Ui.Box(card, new Vector2(408, 92), Vector2.zero, Pal.Hex("15283C").A(0.95f), Art.RoundedSmall);
            Ui.Icon(card, d.Art, 78, new Vector2(-156, 2));
            Ui.Outlined(card, $"新敌情 · {d.Name}", 25, Pal.Hex("FFE27A"), new Vector2(36, 22), new Vector2(288, 34), Pal.Ink, 1.6f, TextAnchor.MiddleLeft);
            string tip = EnemyText.Counter(d);
            if (string.IsNullOrEmpty(tip)) tip = d.Desc;
            var body = Ui.Label(card, tip, 21, Pal.Cream, new Vector2(36, -18), new Vector2(288, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
            MetaUi.Fit(body, 17);
            Tween.Pop(card, 0.24f);
            Tween.Run(card, 2.8f, k => { if (k > 0.82f) cg.alpha = (1f - k) / 0.18f; }, () => { if (card) Destroy(card.gameObject); });
        }

        Slot _infoSlot;
        const float InfoDur = 6f;

        /// <summary>
        /// 参考视频：点中好汉，顶部铺满一块深蓝信息面板（立绘卡 + 攻击力 + 定位 + 技能名/冷却/描述 + 六边形技能槽），
        /// 地面同时亮出攻击范围圈、所在格变蓝。点技能槽切换说明，点空地或超时收起。
        /// </summary>
        public void SlotInfo(Slot s, int tab = 0)
        {
            var u = s.Unit;
            if (u == null) return;
            ClosePerk();
            _infoLord = false;
            bool fresh = _info == null || _infoSlot != s;
            if (_info) Destroy(_info.gameObject);
            if (_infoEnemy != null) _v.MarkEnemy(-1, 0f);
            _infoEnemy = null;
            _infoEnemyHp = null;
            _infoSlot = s;
            var d = u.Def;
            const float W = 1044, H = 396;
            _info = TopRt(0, 386, new Vector2(W, H), "info");
            _info.SetAsLastSibling();
            Ui.Fill(_info, Color.clear, true, "eat");
            Ui.Box(_info, new Vector2(W, H), new Vector2(0, -8), Pal.Shadow, Art.Rounded);
            Ui.Box(_info, new Vector2(W, H), Vector2.zero, Pal.Hex("101E2E"), Art.Rounded);
            Ui.Box(_info, new Vector2(W - 8, H - 8), Vector2.zero, Pal.Hex("6B92B8"), Art.Rounded);
            Ui.Box(_info, new Vector2(W - 14, H - 14), Vector2.zero, Pal.Hex("1C2F44"), Art.Rounded);

            // 左侧立绘卡（统一五阶高清雕花品质卡框 + 星级徽标，与局外名册 100% 同品质皮肤）
            var card = new Vector2(-386, 0);
            MetaUi.Card(_info, MetaUi.RarityCard(d.Rarity), new Vector2(226, 354), card);
            Ui.Box(_info, new Vector2(150, 30), card + new Vector2(0, -40), new Color(0.05f, 0.08f, 0.14f, 0.30f), Art.GroundShadow);
            Ui.Icon(_info, d.Art, 204, card + new Vector2(0, 38));
            for (int i = 0; i < u.Star; i++)
                Ui.Icon(_info, "ic_star", 34, card + new Vector2((i - (u.Star - 1) * 0.5f) * 30, -82));
            Ui.Box(_info, new Vector2(186, 50), card + new Vector2(0, -134), new Color(0.06f, 0.10f, 0.16f, 0.72f), Art.Pill);
            Ui.Outlined(_info, d.Name, 32, d.Rarity >= 4 ? Pal.Hex("FFF1B4") : Color.white, card + new Vector2(0, -133), new Vector2(182, 48), Pal.Ink, 2f);

            // 第一层（顶行）：实时攻击力（与局外详情页完全同源） + 定位稀有度 + 右上关闭钮
            float atk = B.SlotHeroAtk(s);
            var row = new Vector2(130, 146);
            Ui.Box(_info, new Vector2(746, 58), row, Pal.Hex("132233"), Art.Rounded);
            Ui.Icon(_info, "ic_sword", 44, row + new Vector2(-334, 0));
            Ui.Label(_info, $"攻击力 {Ui.Num(Mathf.RoundToInt(atk))}", 32, Color.white, row + new Vector2(-194, 0), new Vector2(236, 52), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Box(_info, new Vector2(46, 46), row + new Vector2(-42, 0), Pal.Hex("2D4C6E"), Art.Circle);
            Ui.Icon(_info, d.AtkIcon, 34, row + new Vector2(-42, 0));
            string roleStr = $"{d.Role} · {d.RarityName}";
            if (u.Wild) roleStr += " · <color=#6CF2E8>百搭</color>";
            else if (B.IsAwakened(u.Hero)) roleStr += " · <color=#FFE066>已觉醒</color>";
            Ui.Label(_info, roleStr, 26, Pal.Hex("DCEAF8"), row + new Vector2(92, 1), new Vector2(210, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
            // 反痛点「换将令」：每局 1 次，可将 ≥2 星好汉（尤其是卡手的高星辅助）重随为同星输出好汉
            if (B.CanSwapUnit(s.Index))
            {
                bool freeForSup = d.Kind == Role.Support;
                var swapBtn = Ui.Btn(_info, freeForSup ? "换班(免)" : "轮换哨", new Vector2(150, 48), row + new Vector2(248, 0),
                    freeForSup ? Pal.Gold : Pal.Teal, () =>
                    {
                        int idx = s.Index;
                        Action doSwap = () =>
                        {
                            if (!B.SwapUnit(idx)) return;
                            CloseInfo();
                            Sfx.Play(Snd.Reveal, 0.8f);
                            Say($"轮换哨生效！\n换 {B.Slots[idx].Unit.Def.Name} 顶上");
                        };
                        if (freeForSup) doSwap();
                        else FakeAd("swap_unit", doSwap);
                    }, 24, freeForSup ? null : "ic_ad");
            }
            var closeX = Ui.Box(_info, new Vector2(46, 46), new Vector2(W * 0.5f - 36, H * 0.5f - 36), Pal.Hex("29425C"), Art.Circle, "x");
            Ui.Label(closeX.transform, "×", 32, Color.white, new Vector2(0, 2), new Vector2(46, 46), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Tap(closeX, () => CloseInfo(), closeX.transform, false);

            // 第二层（独立技能说明区，底边止于 y = -66，绝不与下方技能槽重叠！）
            var sk = Skill(u, tab, atk);
            var blk = new Vector2(130, 20);
            Ui.Box(_info, new Vector2(746, 174), blk, Pal.Hex("132233"), Art.Rounded);
            Ui.SingleLine(Ui.Outlined(_info, sk.Name, 34, sk.Locked ? Pal.Hex("8CA2B8") : Color.white, blk + new Vector2(-176, 58), new Vector2(368, 44), Pal.Hex("0C1622"), 2f, TextAnchor.MiddleLeft), 22);
            string cd = sk.Cd <= 0 ? "" : sk.Cut > 0.05f
                ? $"冷却：<color=#FFB648>{sk.Cd:0.0#}s</color><color=#7DE35A>-{sk.Cut:0.0#}s</color>"
                : $"冷却：<color=#FFB648>{sk.Cd:0.0#}s</color>";
            Ui.Label(_info, cd, 26, Pal.Hex("D7E6F5"), blk + new Vector2(196, 58), new Vector2(320, 42), TextAnchor.MiddleRight, Fonts.Heavy);
            Ui.Box(_info, new Vector2(712, 2), blk + new Vector2(0, 34), Pal.Hex("6D92B6").A(0.24f), Art.White);
            var descTxt = Ui.Label(_info, sk.Desc, tab == 4 ? 23 : 26, Pal.Hex("DCE8F4"), blk + new Vector2(0, -24), new Vector2(710, 106), TextAnchor.UpperLeft);
            MetaUi.Fit(descTxt, 20);

            // 第三层（独立底部六边形切换栏，含中文短签，零遮挡）
            string[] icons = { d.AtkIcon, d.UltIcon ?? "ic_lock", "ic_star", "ic_scroll", "fx_star" };
            string[] tabNames = { "普攻", "大招", "被动", "词条", "升星" };
            for (int i = 0; i < icons.Length; i++)
            {
                var info = Skill(u, i, atk);
                var hp = new Vector2(-130 + i * 130, -124);
                bool sel = i == tab;
                var edge = Ui.Box(_info, new Vector2(88, 88), hp, sel ? Pal.Hex("FFE066") : Pal.Hex("0F1D2C"), Art.Hex6, "hex" + i);
                edge.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                var face = Ui.Box(_info, new Vector2(78, 78), hp, info.Locked ? Pal.Hex("344658") : sel ? Pal.Hex("D89226") : Pal.Hex("29435E"), Art.Hex6);
                face.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                var icon = Ui.Icon(_info, icons[i], 48, hp);
                if (info.Locked)
                {
                    icon.color = new Color(0.55f, 0.64f, 0.74f, 0.55f);
                    Ui.Icon(_info, "ic_lock", 36, hp + new Vector2(0, -3));
                }
                Ui.Label(_info, tabNames[i], 20, sel ? Pal.Hex("FFE482") : Pal.Hex("B8CCE0"), hp + new Vector2(0, -52), new Vector2(96, 26), TextAnchor.MiddleCenter, Fonts.Heavy);
                if (info.Lv > 0)
                {
                    Ui.Box(_info, new Vector2(30, 30), hp + new Vector2(32, 28), Pal.Hex("101E2E"), Art.Circle);
                    Ui.Label(_info, info.Lv.ToString(), 20, Color.white, hp + new Vector2(32, 28), new Vector2(30, 30), TextAnchor.MiddleCenter, Fonts.Heavy);
                }
                int k = i;
                Ui.Tap(edge, () => SlotInfo(s, k), edge.transform);
            }

            if (fresh) Tween.Pop(_info, 0.2f);
            _infoT = InfoDur;
            _v.ShowRange(s, InfoDur);
            _v.Select(s.Index);
        }

        /// <summary>点主公：说明卡，地面画出替天行道实际打到的半圆。</summary>
        public void LordInfo()
        {
            if (_infoLord && _info != null) { CloseInfo(); return; }
            ClosePerk();
            if (_info) Destroy(_info.gameObject);
            if (_infoEnemy != null) _v.MarkEnemy(-1, 0f);
            _infoEnemy = null;
            _infoEnemyHp = null;
            _infoSlot = null;
            _infoLord = true;
            Sfx.Play(Snd.Tap);
            // 顶边和原来对齐，多出来的高度只往下长，用来放下三行说明。
            const float W = 820, H = 336;
            _info = TopRt(0, 384, new Vector2(W, H), "info");
            _info.SetAsLastSibling();
            Ui.Fill(_info, Color.clear, true, "eat");
            Ui.Box(_info, new Vector2(W, H), new Vector2(0, -6), Pal.Shadow, Art.Rounded);
            Ui.Box(_info, new Vector2(W, H), Vector2.zero, Pal.Hex("101E2E"), Art.Rounded);
            Ui.Box(_info, new Vector2(W - 8, H - 8), Vector2.zero, Pal.Hex("D8B058"), Art.Rounded);
            Ui.Box(_info, new Vector2(W - 14, H - 14), Vector2.zero, Pal.Hex("1C2F44"), Art.Rounded);

            var card = new Vector2(-304, 0);
            Ui.Box(_info, new Vector2(176, 300), card + new Vector2(0, -3), Pal.Hex("0E1B28"), Art.Rounded);
            Ui.Box(_info, new Vector2(168, 292), card, Pal.Hex("DFB256"), Art.Rounded);
            Ui.Box(_info, new Vector2(158, 282), card, Pal.Hex("F6F1E4"), Art.Rounded);
            Ui.Icon(_info, "lord_songjiang", 156, card + new Vector2(0, 26));
            Ui.Box(_info, new Vector2(158, 48), card + new Vector2(0, -112), Pal.Hex("E8DFC8"), Art.Rounded);
            Ui.Label(_info, "老村长", 30, Pal.Ink, card + new Vector2(0, -112), new Vector2(150, 46), TextAnchor.MiddleCenter, Fonts.Heavy);

            const float colX = 40f, colW = 478f;
            Ui.Box(_info, new Vector2(colW, 48), new Vector2(colX, 122), Pal.Hex("132233"), Art.Rounded);
            Ui.Icon(_info, "ic_sword", 34, new Vector2(colX - colW * 0.5f + 30, 122));
            Ui.Label(_info, Ui.Num(B.LordPower), 34, Color.white, new Vector2(colX - 78, 122), new Vector2(170, 44), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Label(_info, "村长", 26, Pal.Hex("FFE082"), new Vector2(colX + colW * 0.5f - 58, 122), new Vector2(90, 44), TextAnchor.MiddleRight, Fonts.Heavy);

            int hits = Mathf.Max(1, B.Lo.LordHits);
            string times = hits <= 1 ? "1道" : hits + "道";
            float pct = B.Lo.LordPct * 100f;
            float cut = Defs.LordCdBase - B.Lo.LordCd;
            string cd = cut > 0.05f
                ? $"冷却：<color=#FFB648>{Defs.LordCdBase:0.0}s</color> <color=#7DE35A>-{cut:0.0}s</color>"
                : $"冷却：<color=#FFB648>{B.Lo.LordCd:0.0}s</color>";
            Ui.Outlined(_info, Defs.LordSkillName, 32, Color.white, new Vector2(colX - 130, 68), new Vector2(220, 42), Pal.Hex("0C1622"), 2f, TextAnchor.MiddleLeft);
            Ui.Label(_info, cd, 24, Pal.Hex("D7E6F5"), new Vector2(colX + 120, 68), new Vector2(230, 40), TextAnchor.MiddleRight, Fonts.Heavy);
            Ui.Box(_info, new Vector2(colW, 2), new Vector2(colX, 40), Pal.Hex("6D92B6").A(0.24f), Art.White);
            string desc = $"举起高音大喇叭向范围内外星军轰出<color=#FFB648>{times}</color>声波。\n造成<color=#FFB648>{pct:0}%</color>村长声波伤害（单道<color=#FFB648>{Ui.Num(B.LordPower)}</color>）。";
            if (B.Lo.LordStun > 0.05f) desc += $" 命中眩晕<color=#FFB648>{B.Lo.LordStun:0.#}</color>秒。";
            if (B.Lo.LordBig > 1.01f) desc += $" 对精英、首领<color=#FFB648>+{(B.Lo.LordBig - 1f) * 100f:0}%</color>。";
            desc += $"\n<color=#8EA6BE>开战 {Defs.LordFirstCast:0} 秒第一次出手</color>";
            var descT = Ui.Label(_info, desc, 24, Pal.Hex("DCE8F4"), new Vector2(colX, -58), new Vector2(colW, 164), TextAnchor.UpperLeft);
            descT.verticalOverflow = VerticalWrapMode.Truncate;

            var hp = new Vector2(348, 16);
            var edge = Ui.Box(_info, new Vector2(96, 96), hp, Pal.Hex("FFE066"), Art.Hex6);
            edge.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
            var face = Ui.Box(_info, new Vector2(82, 82), hp, Pal.Hex("2A4560"), Art.Hex6);
            face.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
            Ui.Icon(_info, "ic_sword", 54, hp);

            var x = Ui.Box(_info, new Vector2(46, 46), new Vector2(-W * 0.5f + 36, -H * 0.5f - 32), Pal.Hex("132233"), Art.Circle, "x");
            Ui.Label(x.transform, "×", 32, Color.white, new Vector2(0, 2), new Vector2(46, 46), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Tap(x, () => CloseInfo(), x.transform, false);

            Tween.Pop(_info, 0.2f);
            Tween.Punch(_v.Leader, 0.2f, 0.08f);
            _infoT = InfoDur;
            _v.ShowLordRange(InfoDur);
            _v.Select(-1);
        }

        Enemy _infoEnemy;
        Text _infoEnemyHp;
        Image _infoEnemyFill;

        /// <summary>点中官军：顶部同款信息卡，写清血量、攻城伤害、标签（高速、远程、飞行……）、克制和特性，脚下套红圈。</summary>
        public void EnemyInfo(Enemy e)
        {
            ClosePerk();
            bool fresh = _info == null || _infoEnemy != e;
            if (_info) Destroy(_info.gameObject);
            _infoSlot = null;
            _infoLord = false;
            _infoEnemy = e;
            _v.HideRange();
            _v.Select(-1);
            var d = e.Def;
            const float W = 1044, H = 304;
            _info = TopRt(0, 344, new Vector2(W, H), "info");
            _info.SetAsLastSibling();
            Ui.Fill(_info, Color.clear, true, "eat");
            Ui.Box(_info, new Vector2(W, H), new Vector2(0, -8), Pal.Shadow, Art.Rounded);
            Ui.Box(_info, new Vector2(W, H), Vector2.zero, Pal.Hex("101E2E"), Art.Rounded);
            Ui.Box(_info, new Vector2(W - 8, H - 8), Vector2.zero, Pal.Hex("6B92B8"), Art.Rounded);
            Ui.Box(_info, new Vector2(W - 14, H - 14), Vector2.zero, Pal.Hex("1C2F44"), Art.Rounded);

            var rankC = EnemyText.RankColor(d);
            var card = new Vector2(-392, 0);
            Ui.Box(_info, new Vector2(232, 268), card + new Vector2(0, -4), Pal.Hex("0E1B28"), Art.Rounded);
            Ui.Box(_info, new Vector2(226, 260), card, rankC, Art.Rounded);
            Ui.Box(_info, new Vector2(216, 250), card, Pal.Hex("EEF3F8"), Art.Rounded);
            Ui.Box(_info, new Vector2(162, 34), card + new Vector2(0, -34), new Color(0.05f, 0.1f, 0.18f, 0.16f), Art.GroundShadow);
            Ui.Icon(_info, d.Art, 188, card + new Vector2(0, 22));
            Ui.Box(_info, new Vector2(216, 58), card + new Vector2(0, -96), Pal.Hex("D6E3F0"), Art.Rounded);
            Ui.SingleLine(Ui.Label(_info, d.Name, 34, Pal.Ink, card + new Vector2(0, -96), new Vector2(210, 56), TextAnchor.MiddleCenter, Fonts.Heavy), 22);

            // 第一行：血条 + 定位（同步切换为清爽胶囊皮肤）
            var row = new Vector2(132, 106);
            Ui.Box(_info, new Vector2(750, 62), row, Pal.Hex("132233"), Art.Rounded);
            Ui.Icon(_info, "ic_heart", 44, row + new Vector2(-332, 0));
            Ui.Skin(_info, "bar_bg", new Vector2(404, 34), row + new Vector2(-90, 0), -1f, null, "hpBg");
            _infoEnemyFill = Ui.Skin(_info, "bar_gold", new Vector2(392, 24), row + new Vector2(-90, 0), -1f, null, "hpFill");
            _infoEnemyFill.rectTransform.pivot = new Vector2(0, 0.5f);
            _infoEnemyFill.rectTransform.anchoredPosition = row + new Vector2(-90 - 196, 0);
            _infoEnemyHp = Ui.Outlined(_info, "", 24, Color.white, row + new Vector2(-90, 1), new Vector2(400, 40), Pal.Hex("0D1824"), 2f);
            var chip = Ui.Box(_info, new Vector2(138, 44), row + new Vector2(290, 0), B.FocusEnemyId == e.Id ? Pal.Red : rankC, Art.Pill);
            Ui.Outlined(chip.transform, B.FocusEnemyId == e.Id ? "集火中" : EnemyText.RankName(d), 26, Color.white, new Vector2(0, 1), new Vector2(138, 44), Pal.Ink, 2f);
            UpdateEnemyInfo();

            // 标签 + 说明
            var blk = new Vector2(132, -42);
            Ui.Box(_info, new Vector2(750, 196), blk, Pal.Hex("132233"), Art.Rounded);
            float tx = -350;
            foreach (var (text, color) in EnemyText.Tags(d))
            {
                float w = 30 * text.Length + 30;
                var tg = Ui.Box(_info, new Vector2(w, 42), blk + new Vector2(tx + w * 0.5f, 62), color, Art.Pill);
                Ui.Outlined(tg.transform, text, 26, Color.white, new Vector2(0, 1), new Vector2(w, 42), Pal.Ink, 1.6f);
                tx += w + 12;
            }
            string wall = d.WallDps > 0 ? $"拆墙：每秒 <color=#FFB648>{Ui.Num(B.EnemyWallDps(e))}</color>" : "不拆墙";
            if (d.Kind == EnemyKind.FireBomb || d.Kind == EnemyKind.Lantern) wall = $"撞墙自爆：<color=#FFB648>{Ui.Num(B.EnemyWallDps(e))}</color>";
            Ui.Label(_info, wall, 26, Pal.Hex("FFE2A6"), blk + new Vector2(tx + 150, 62), new Vector2(300, 42), TextAnchor.MiddleLeft, Fonts.Heavy);
            string counter = EnemyText.Counter(d);
            string body = d.Desc + (counter.Length > 0 ? "\n" + counter : "");
            Ui.Label(_info, body, 27, Pal.Hex("DCE8F4"), blk + new Vector2(0, -28), new Vector2(712, 110), TextAnchor.UpperLeft);

            var x = Ui.Box(_info, new Vector2(46, 46), new Vector2(W * 0.5f - 30, H * 0.5f - 30), Pal.Hex("132233"), Art.Circle, "x");
            Ui.Label(x.transform, "×", 32, Color.white, new Vector2(0, 2), new Vector2(46, 46), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Tap(x, () => CloseInfo(), x.transform, false);

            if (fresh) Tween.Pop(_info, 0.2f);
            _infoT = InfoDur;
            _v.MarkEnemy(e.Id, InfoDur);
        }

        void UpdateEnemyInfo()
        {
            if (_infoEnemy == null || _infoEnemyHp == null) return;
            if (_infoEnemy.Dead || !B.Enemies.Contains(_infoEnemy)) { CloseInfo(); return; }
            float k = _infoEnemy.MaxHp > 0 ? Mathf.Clamp01(_infoEnemy.Hp / _infoEnemy.MaxHp) : 0f;
            _infoEnemyFill.rectTransform.sizeDelta = new Vector2(Mathf.Max(24f, 392f * k), 24f);
            _infoEnemyHp.text = $"{Ui.Num(Mathf.Ceil(_infoEnemy.Hp))}/{Ui.Num(Mathf.Ceil(_infoEnemy.MaxHp))}";
        }

        RectTransform _roster;
        GameObject _rosterNew;

        /// <summary>右列「本关怪物」双线方框按钮（对标参考图右上怪物头像入口）。</summary>
        void BuildRoster()
        {
            _roster = TopRt(462, 186, new Vector2(106, 106), "roster");
            Ui.Box(_roster, new Vector2(100, 100), new Vector2(0, -3), Pal.Shadow, Art.RoundedSmall);
            Ui.Box(_roster, new Vector2(96, 96), Vector2.zero, Pal.Hex("1D334A"), Art.RoundedSmall);
            Ui.Box(_roster, new Vector2(90, 90), Vector2.zero, Color.white, Art.RoundedSmall);
            var bg = Ui.Box(_roster, new Vector2(82, 82), Vector2.zero, Pal.Hex("86C4EB"), Art.RoundedSmall);
            var list = B.StageRoster();
            string preview = Defs.Enemy(list.Count > 1 ? list[1] : EnemyKind.Soldier).Art;
            Ui.Icon(_roster, preview, 74, new Vector2(0, 2));
            var dot = Ui.Icon(_roster, "ui/dot", 30, new Vector2(36, 36), "new");
            _rosterNew = dot.gameObject;
            _rosterNew.SetActive(NewKinds() > 0);
            Ui.Tap(bg, () => OpenRoster(), _roster);
        }

        int NewKinds()
        {
            int n = 0;
            var seen = Profile.S.Seen;
            foreach (var k in B.StageRoster()) if ((int)k >= seen.Length || seen[(int)k] == 0) n++;
            return n;
        }

        /// <summary>本关怪物仅由右上角方框按钮按需点开查看（有新怪亮红点提醒），开局绝不主动弹窗打断战斗。</summary>
        void MaybeShowRoster() { }

        /// <summary>本关怪物：战场上的浅瓷卡片。左列立绘，右列名字和色签同一行，说明只写在名字下面，互不压住。</summary>
        public void OpenRoster()
        {
            if (_modal != null) return;
            Sfx.Play(Snd.Open, 0.6f);
            var list = B.StageRoster();
            var seen = Profile.S.Seen;
            const float pw = 920f, header = 92f, footer = 56f;
            float rowH = 142f;
            float ph = header + list.Count * rowH + footer;
            if (ph > 1280f)
            {
                rowH = (1280f - header - footer) / Mathf.Max(1, list.Count);
                ph = header + list.Count * rowH + footer;
            }
            var c = OpenModal("roster", 0.36f);
            var hit = _modal.GetComponentInChildren<Image>();
            Ui.Tap(hit, () => CloseModal(), null, false);
            var panel = Ui.Rect(c, "sheet");
            panel.sizeDelta = new Vector2(pw, ph);
            panel.anchoredPosition = new Vector2(0, 48);
            Ui.Box(panel, new Vector2(pw + 10, ph + 10), new Vector2(0, -6), new Color(0.05f, 0.08f, 0.12f, 0.28f), Art.Rounded);
            Ui.Box(panel, new Vector2(pw, ph), Vector2.zero, Pal.Hex("E4DDD0"), Art.Rounded);
            var face = Ui.Box(panel, new Vector2(pw - 10, ph - 10), Vector2.zero, Pal.Hex("FBF8F1"), Art.Rounded);
            face.raycastTarget = true;
            Ui.Tap(face, () => CloseModal(), null, false);
            float top = ph * 0.5f;
            float titleY = top - 48f;
            Ui.Box(panel, new Vector2(168, 3), new Vector2(-196, titleY), Pal.Hex("D5CBB8"), Art.Pill);
            Ui.Box(panel, new Vector2(168, 3), new Vector2(196, titleY), Pal.Hex("D5CBB8"), Art.Pill);
            Ui.Label(panel, "本关外星军", 36, Pal.Hex("3B2E22"), new Vector2(0, titleY), new Vector2(220, 52), TextAnchor.MiddleCenter, Fonts.Heavy);

            float iconX = -pw * 0.5f + 92f;
            float textLeft = -pw * 0.5f + 176f;
            float textRight = pw * 0.5f - 32f;
            float textW = textRight - textLeft;
            for (int i = 0; i < list.Count; i++)
            {
                var d = Defs.Enemy(list[i]);
                float rowTop = top - header - i * rowH;
                float mid = rowTop - rowH * 0.5f;
                if (i > 0)
                    Ui.Box(panel, new Vector2(pw - 48, 2), new Vector2(0, rowTop), Pal.Hex("E6E0D4"), Art.White);
                Ui.Icon(panel, d.Art, 108, new Vector2(iconX, mid + 2));

                const int nameSize = 32;
                float nameW = nameSize * d.Name.Length + 6f;
                float nameY = mid + 30f;
                var name = Ui.Label(panel, d.Name, nameSize, Pal.Hex("1E2D3D"), new Vector2(textLeft + nameW * 0.5f, nameY), new Vector2(nameW, 42), TextAnchor.MiddleLeft, Fonts.Heavy);
                name.horizontalOverflow = HorizontalWrapMode.Overflow;
                name.verticalOverflow = VerticalWrapMode.Truncate;

                var tags = EnemyText.Tags(d);
                if (d.Big) tags.Insert(0, (EnemyText.RankName(d), EnemyText.RankColor(d)));
                bool isNew = (int)d.Kind >= seen.Length || seen[(int)d.Kind] == 0;
                if (isNew) tags.Insert(0, ("新", Pal.Red));
                float tagLeft = textLeft + nameW + 12f;
                foreach (var (text, color) in tags)
                {
                    float tw = 26f * text.Length + 28f;
                    if (tagLeft + tw > textRight) break;
                    var tg = Ui.Box(panel, new Vector2(tw, 32), new Vector2(tagLeft + tw * 0.5f, nameY), color, Art.RoundedSmall);
                    Ui.Outlined(tg.transform, text, 20, Color.white, new Vector2(0, 1), new Vector2(tw, 32), color.Mul(0.45f), 1.2f);
                    tagLeft += tw + 8f;
                }

                float descTop = nameY - 28f;
                float descBottom = mid - rowH * 0.5f + 14f;
                float descH = Mathf.Max(48f, descTop - descBottom);
                var body = Ui.Label(panel, EnemyText.SheetBody(d), 24, Pal.Hex("5C6B78"),
                    new Vector2(textLeft + textW * 0.5f, (descTop + descBottom) * 0.5f), new Vector2(textW, descH), TextAnchor.UpperLeft);
                body.verticalOverflow = VerticalWrapMode.Truncate;
                body.lineSpacing = 0.92f;
            }
            Ui.Box(panel, new Vector2(pw - 64, 2), new Vector2(0, -top + footer), Pal.Hex("E6E0D4"), Art.White);
            Ui.Label(panel, "点击任意处继续", 22, Pal.Hex("8A8174"), new Vector2(0, -top + footer * 0.5f), new Vector2(pw - 48, 36), TextAnchor.MiddleCenter, Fonts.Heavy);
            Tween.Pop(panel, 0.22f);
            if (_rosterNew) _rosterNew.SetActive(false);
        }

        public void CloseRoster()
        {
            if (_modalKind == "roster") CloseModal();
        }

        struct SkillText
        {
            public string Name, Desc;
            public float Cd, Cut;
            public bool Locked;
            public int Lv;
        }

        static string O(object s) => $"<color=#FF9A3A>{s}</color>";

        SkillText Skill(Unit u, int tab, float panelAtk = 0f)
        {
            var d = u.Def;
            var h = d.Id;
            var t = new SkillText();
            float spd = B.HeroSpeedMul(h);
            if (tab == 0)
            {
                float s = spd * Defs.StarSpeed[u.Star - 1] * (1f + B.ChargeAura);
                t.Name = d.AtkName;
                t.Cd = d.Interval;
                t.Cut = d.Interval - B.SkillCd(h) * (1f - StarTraits.Fx(d, u.Star).Cd) / s;
                t.Lv = u.Star;
                t.Desc = HeroText.Atk(d, B, panelAtk, u.Star) + "\n<color=#8E9BAC>" + HeroText.Tip(d) + "</color>";
            }
            else if (tab == 1)
            {
                t.Locked = !B.HasUlt(h);
                t.Lv = t.Locked ? 0 : 1;
                if (!d.HasUlt)
                {
                    t.Name = "大招";
                    t.Desc = "<color=#8E9BAC>仅传说乡亲拥有大招</color>";
                }
                else
                {
                    t.Name = d.UltName;
                    t.Cd = d.UltCd;
                    t.Cut = d.UltCd - B.UltCd(h) / (spd * (1f + B.ChargeAura));
                    t.Desc = HeroText.Ult(d, 1f + B.Stat(h, Eff.UltPow))
                        + (B.Lo.Lv[(int)h] < Meta.UltLv ? $"\n<color=#FFB648>乡亲升至 {Meta.UltLv} 级后大招进入改装池</color>"
                        : t.Locked ? "\n<color=#8E9BAC>强化三选一抽到「大招」卡后解锁</color>" : "");
                }
            }
            else if (tab == 2)
            {
                int pNeed = Meta.PassiveUnlock(h);
                t.Name = d.PassiveName;
                t.Locked = B.Lo.Lv[(int)h] < pNeed && !B.Lo.Passive[(int)h];
                t.Desc = HeroText.Passive(d) + (t.Locked ? $"\n<color=#8E9BAC>乡亲升到 {pNeed} 级解锁</color>" : "");
            }
            else if (tab == 4)
            {
                t.Name = "升星质变";
                t.Lv = u.Star - 1;
                t.Locked = u.Star < 2;
                var sb = new System.Text.StringBuilder();
                foreach (var tr in StarTraits.Of(d))
                {
                    if (sb.Length > 0) sb.Append('\n');
                    bool on = u.Star >= tr.Star;
                    if (on) sb.Append($"<color=#FFD24A>{tr.Star}星「{tr.Name}」</color>{tr.Desc}");
                    else sb.Append($"<color=#8E9BAC>{tr.Star}星「{tr.Name}」{tr.Desc}</color>");
                }
                t.Desc = sb.ToString();
            }
            else
            {
                t.Name = "专属强化";
                var sb = new System.Text.StringBuilder();
                foreach (var p in Defs.Perks)
                {
                    int lv = B.Level(p.Id);
                    if (lv <= 0 || p.Hero != h) continue;
                    if (sb.Length > 0) sb.Append("  ");
                    sb.Append(p.Star ? "<color=#FFD24A>★</color>" : "").Append(p.Name).Append(O(" Lv" + lv));
                    t.Lv += lv;
                }
                t.Locked = t.Lv == 0;
                t.Desc = t.Locked ? "<color=#8E9BAC>强化三选一中选到他的专属强化后，在这里查看；合成满星可额外选一个满星技能</color>" : sb.ToString();
            }
            return t;
        }

        // ---------------- 状态切换 ----------------

        void UpdatePhase(float dt)
        {
            if (_reelsDelay > 0) _reelsDelay -= dt;
            if (_modal != null) return;
            switch (B.Phase)
            {
                case Phase.Choosing: OpenCards(); break;
                case Phase.Reels: if (_reelsDelay <= 0) OpenReels(); break;
                case Phase.Victory: OpenResult(true); break;
                case Phase.Defeat: OpenResult(false); break;
            }
        }

        RectTransform OpenModal(string kind, float dim = 0.7f)
        {
            CloseInfo();
            _modalKind = kind;
            var m = Ui.Rect(_root, "modal_" + kind);
            m.anchorMin = Vector2.zero;
            m.anchorMax = Vector2.one;
            m.offsetMin = m.offsetMax = Vector2.zero;
            var bg = Ui.Fill(m, new Color(0.02f, 0.04f, 0.08f, dim), true, "dim");
            var g = m.gameObject.AddComponent<CanvasGroup>();
            Tween.Fade(g, 0, 1, 0.18f);
            _modal = m;
            var c = Ui.Rect(m, "content");
            c.sizeDelta = new Vector2(1080, 1920);
            try { WorldFx.I?.ShowNumbers(false); }
            catch (Exception e) { Debug.LogException(e); }
            return c;
        }

        void CloseModal(Action after = null)
        {
            var m = _modal;
            _modal = null;
            _modalKind = null;
            WorldFx.I?.ShowNumbers(true);
            if (m == null) { after?.Invoke(); return; }
            var g = m.GetComponent<CanvasGroup>();
            g.blocksRaycasts = false;
            Tween.Fade(g, 1, 0, 0.15f, () => Destroy(m.gameObject));
            after?.Invoke();
        }

        public bool InfoOpen => _info != null;

        public void CloseInfo()
        {
            ClosePerk();
            _infoLord = false;
            if (_infoEnemy != null) _v.MarkEnemy(-1, 0f);
            _infoEnemy = null;
            _infoEnemyHp = null;
            if (_info == null) return;
            Destroy(_info.gameObject);
            _info = null;
            _infoSlot = null;
            _v.HideRange();
            _v.Select(-1);
        }

        /// <summary>强化过后，战场右侧挂出拿过词条的好汉，点开回看。</summary>
        void SyncPerks()
        {
            if (_perkDock) _perkDock.gameObject.SetActive(!Blocking && !InfoOpen);
            string sig = PerkSig();
            if (sig == _perkSig) return;
            _perkSig = sig;
            if (_perkDock) Destroy(_perkDock.gameObject);
            _perkDock = null;
            bool any = false;
            foreach (var id in B.Lineup) if (PerkCount(id) > 0) any = true;
            if (!any) return;
            _perkDock = Ui.Rect(_root, "perkDock");
            _perkDock.anchorMin = Vector2.zero;
            _perkDock.anchorMax = Vector2.one;
            _perkDock.offsetMin = _perkDock.offsetMax = Vector2.zero;
            float y0 = 400 + _st;
            int i = 0;
            foreach (var h in B.Lineup)
            {
                int cnt = PerkCount(h);
                if (cnt <= 0) continue;
                var hero = h;
                var b = Ui.Top(_perkDock, 468, y0 + i * 102f, new Vector2(88, 88), "perk" + (int)hero);
                var d = Defs.Hero(hero);
                Ui.Box(b, new Vector2(84, 84), new Vector2(0, -3), Pal.Shadow, Art.RoundedSmall);
                Ui.Box(b, new Vector2(82, 82), Vector2.zero, Pal.Hex("7DA6CC"), Art.RoundedSmall);
                Ui.Box(b, new Vector2(72, 72), Vector2.zero, Pal.Hex("1A2D42"), Art.RoundedSmall);
                Ui.Icon(b, d.Art, 66, new Vector2(0, 2));
                var badge = Ui.Box(b, new Vector2(36, 36), new Vector2(26, -26), Pal.Hex("0F1C2A"), Art.Hex6);
                badge.rectTransform.localRotation = Quaternion.Euler(0, 0, 90);
                Ui.Label(b, cnt.ToString(), 22, Color.white, new Vector2(26, -26), new Vector2(36, 36), TextAnchor.MiddleCenter, Fonts.Heavy);
                var hit = Ui.Box(b, new Vector2(88, 88), Vector2.zero, new Color(0, 0, 0, 0), Art.Rounded, "hit");
                Ui.Tap(hit, () => OpenPerks(hero), b);
                i++;
            }
            if (Blocking || InfoOpen) _perkDock.gameObject.SetActive(false);
            else if (_perkPanel) _perkDock.SetAsLastSibling();
        }

        static int PerkCount(Battle b, HeroId h)
        {
            int n = 0;
            foreach (var p in Defs.Perks) if (p.Hero == h) n += b.Level(p.Id);
            return n;
        }

        int PerkCount(HeroId h) => PerkCount(B, h);

        string PerkSig()
        {
            var sb = new System.Text.StringBuilder();
            foreach (var h in B.Lineup) sb.Append((int)h).Append(':').Append(PerkCount(h)).Append(';');
            return sb.ToString();
        }

        public void OpenPerks(HeroId h)
        {
            bool toggle = _perkPanel != null && _perkHero == h;
            CloseInfo();
            if (toggle || PerkCount(h) <= 0) return;
            _perkHero = h;
            var d = Defs.Hero(h);
            var list = new List<PerkDef>();
            foreach (var p in Defs.Perks) if (p.Hero == h && B.Level(p.Id) > 0) list.Add(p);
            int cols = Mathf.Min(2, list.Count);
            int rows = Mathf.CeilToInt(list.Count / (float)cols);
            float cw = cols == 1 ? 360 : 324;
            float ch = rows <= 1 ? 430 : rows == 2 ? 340 : 248;
            const float gapX = 20, gapY = 16;
            float pw = Mathf.Min(780, cols * cw + (cols - 1) * gapX + 56);
            float ph = rows * ch + (rows - 1) * gapY + 118;
            _perkPanel = Ui.Rect(_root, "perkPanel");
            _perkPanel.anchorMin = Vector2.zero;
            _perkPanel.anchorMax = Vector2.one;
            _perkPanel.offsetMin = _perkPanel.offsetMax = Vector2.zero;
            var dim = Ui.Fill(_perkPanel, new Color(0, 0, 0, 0.28f), true, "dim");
            Ui.Tap(dim.GetComponent<Image>(), () => ClosePerk(), null, false);
            var panel = Ui.Rect(_perkPanel, "sheet");
            panel.sizeDelta = new Vector2(pw, ph);
            var block = Ui.Box(panel, new Vector2(pw, ph), new Vector2(0, -6), Pal.Shadow, Art.Rounded);
            block.raycastTarget = true;
            Ui.Box(panel, new Vector2(pw, ph), Vector2.zero, Pal.Hex("101E2E"), Art.Rounded);
            Ui.Box(panel, new Vector2(pw - 8, ph - 8), Vector2.zero, Pal.Hex("6B92B8"), Art.Rounded);
            Ui.Box(panel, new Vector2(pw - 14, ph - 14), Vector2.zero, Pal.Hex("1C2F44"), Art.Rounded);
            Ui.Outlined(panel, d.Name + "词条", 38, Color.white, new Vector2(0, ph * 0.5f - 46), new Vector2(pw - 120, 60), Pal.Hex("0C1622"), 2.5f);
            for (int i = 0; i < list.Count; i++)
            {
                var p = list[i];
                int c = i % cols, r = i / cols;
                float x0 = (c - (cols - 1) * 0.5f) * (cw + gapX);
                float y0 = ph * 0.5f - 96 - r * (ch + gapY) - ch * 0.5f;
                var card = Ui.Rect(panel, "pk" + i);
                card.sizeDelta = new Vector2(cw, ch);
                card.anchoredPosition = new Vector2(x0, y0);
                var head = CardHeadColor(p);
                float headH = Mathf.Clamp(ch * 0.18f, 52, 74);
                int nameSize = ch > 340 ? 32 : 27;
                int descSize = ch > 340 ? 25 : 22;
                float icon = ch > 340 ? 154 : ch > 280 ? 112 : 84;
                Ui.Box(card, new Vector2(cw + 8, ch + 8), new Vector2(0, -4), Pal.Shadow, Art.Rounded);
                var face = Ui.Box(card, new Vector2(cw, ch), Vector2.zero, Pal.Hex("C8C2B4"), Art.Rounded);
                face.raycastTarget = true;
                Ui.Box(card, new Vector2(cw - 6, ch - 6), Vector2.zero, Pal.Hex("F6F4EC"), Art.Rounded);
                Ui.Box(card, new Vector2(cw - 6, headH), new Vector2(0, ch * 0.5f - 3 - headH * 0.5f), head, Art.Rounded);
                Ui.Box(card, new Vector2(cw - 6, 20), new Vector2(0, ch * 0.5f - headH + 6), head, Art.White);
                Ui.Box(card, new Vector2(cw - 20, ch - headH - 22), new Vector2(0, -headH * 0.5f + 2), Pal.Hex("DFD9C8"), Art.RoundedSmall);
                Ui.Box(card, new Vector2(cw - 24, ch - headH - 26), new Vector2(0, -headH * 0.5f + 2), Pal.Hex("F6F4EC"), Art.RoundedSmall);
                bool stamp = p.Ult || p.Star;
                Ui.SingleLine(Ui.Outlined(card, p.Name, nameSize, Color.white, new Vector2(stamp ? -26 : 0, ch * 0.5f - headH * 0.5f - 2), new Vector2(cw - (stamp ? 106 : 28), headH), head.Mul(0.4f), 2f), 19);
                Ui.Box(card, new Vector2(icon * 0.85f, icon * 0.24f), new Vector2(0, ch * 0.04f - icon * 0.34f), new Color(0.05f, 0.1f, 0.16f, 0.14f), Art.GroundShadow);
                Ui.Icon(card, d.Art, icon, new Vector2(0, ch * 0.08f));
                if (stamp)
                {
                    var tag = Ui.Box(card, new Vector2(76, 34), new Vector2(cw * 0.5f - 50, ch * 0.5f - headH * 0.5f - 2), p.Ult ? Pal.Hex("B83E18") : Pal.Hex("A87A14"), Art.Pill);
                    Ui.Outlined(tag.transform, p.Ult ? "大招" : "满星", 21, Color.white, Vector2.zero, new Vector2(76, 34), Pal.Ink, 1.4f);
                }
                int lv = B.Level(p.Id);
                float descY = -ch * 0.29f;
                if (lv > 1)
                {
                    Ui.Label(card, "Lv." + lv, 22, Pal.Hex("5E7286"), new Vector2(0, -ch * 0.5f + 28), new Vector2(cw - 36, 28), TextAnchor.MiddleCenter, Fonts.Heavy);
                    descY += 8;
                }
                Ui.Label(card, Colorize(p.Desc), descSize, Pal.Hex("243240"), new Vector2(0, descY), new Vector2(cw - 36, ch * 0.34f), TextAnchor.UpperCenter);
            }
            var btn = _perkDock != null ? _perkDock.Find("perk" + (int)h) as RectTransform : null;
            if (btn != null)
            {
                var host = (RectTransform)panel.parent;
                Vector2 at = host.InverseTransformPoint(btn.TransformPoint(btn.rect.center));
                float x = at.x - btn.rect.width * 0.5f - 18f - pw * 0.5f;
                float y = at.y;
                float halfH = Ui.Height * 0.5f;
                float halfW = 540f;
                y = Mathf.Clamp(y, -halfH + 430f + ph * 0.5f, halfH - 150f - ph * 0.5f);
                x = Mathf.Clamp(x, -halfW + pw * 0.5f + 20f, halfW - pw * 0.5f - 20f);
                panel.anchoredPosition = new Vector2(x, y);
            }
            Tween.Pop(panel, 0.22f);
            if (_perkDock) _perkDock.SetAsLastSibling();
        }

        public void ClosePerk()
        {
            if (_perkPanel == null) return;
            Destroy(_perkPanel.gameObject);
            _perkPanel = null;
        }

        static readonly Regex NumRx = new Regex(@"[+\-×]?\d+(\.\d+)?%?");

        static string Colorize(string s) => NumRx.Replace(s, m => m.Value.StartsWith("-")
            ? $"<color=#D63B2F>{m.Value}</color>"
            : $"<color=#1E9438>{m.Value}</color>");

        static string PerkIcon(PerkDef p) => Defs.Hero(p.Hero).Art;

        static Color KindColor(PerkKind k) => Pal.Hex(k == PerkKind.Trade ? "CE7028" : k == PerkKind.Morph ? "7A52C4" : k == PerkKind.Adv ? "C84038" : "4C7294");

        /// <summary>词条顶栏一律用这名好汉的品质色，和名册、卡框同一套，不按词条种类另配色。</summary>
        static Color CardHeadColor(PerkDef p) => MetaUi.RarityColor(Defs.Hero(p.Hero).Rarity);

        /// <summary>卡底一行：进阶写它从哪张来。取舍互斥只在发牌里生效，卡上不提。</summary>
        static string PerkNote(PerkDef p)
        {
            if (p.Req != null) return $"进阶自「{Defs.Perk(p.Req)?.Name}」";
            return null;
        }

        int Recommend(PerkDef[] c)
        {
            int best = 0;
            float bs = -1;
            for (int i = 0; i < c.Length; i++)
            {
                var p = c[i];
                float s = 1;
                foreach (var sl in B.Slots)
                    if (sl.Unit != null && sl.Unit.Hero == p.Hero) s += sl.Unit.Star;
                if (p.Eff == Eff.Dmg || p.Eff == Eff.Count || p.Eff == Eff.UltPow) s += 0.5f;
                if (p.Kind == PerkKind.Morph) s += 1.2f;
                if (p.Kind == PerkKind.Adv) s += 2f;
                if (p.Ult) s += 6f;
                if (s > bs) { bs = s; best = i; }
            }
            return best;
        }

        void OpenCards()
        {
            var c = OpenModal("cards", 0.80f);
            Sfx.Play(Snd.Card);
            bool star = B.StarPick.HasValue;
            if (star)
            {
                Sfx.Play(Snd.Jackpot, 0.7f);
                Ui.Box(c, new Vector2(900, 380), new Vector2(0, 560), Pal.Gold.A(0.38f), Art.SoftDot);
                Ui.Icon(c, Defs.Hero(B.StarPick.Value).Art, 224, new Vector2(0, 640));
            }
            var head = star
                ? Ui.Outlined(c, $"恭喜获得满星{Defs.Hero(B.StarPick.Value).Name}！\n请选择1个额外技能", 48, Pal.Hex("FFE27A"), new Vector2(0, 456), new Vector2(980, 140), Pal.Hex("0E1A28"), 3f)
                : Ui.Outlined(c, "请选择", 60, Color.white, new Vector2(0, 404), new Vector2(400, 88), Pal.Hex("0E1A28"), 3f);
            for (int s = -1; s <= 1 && !star; s += 2)
            {
                Ui.Box(c, new Vector2(216, 4), new Vector2(s * 276, 404), Pal.Hex("B8D6EC").A(0.85f), Art.Pill);
                var dia = Ui.Box(c, new Vector2(20, 20), new Vector2(s * 164, 404), Pal.Hex("B8D6EC"), Art.RoundedSmall);
                dia.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
                var dot2 = Ui.Box(c, new Vector2(12, 12), new Vector2(s * 144, 404), Pal.Hex("B8D6EC").A(0.7f), Art.RoundedSmall);
                dot2.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            }
            Tween.Pop(head.transform, 0.3f);
            var cards = new List<RectTransform>();
            _cards = cards;
            BuildCards(c, cards);

            var watch = Ui.Label(c, "", 28, Pal.Hex("DCE8F5"), new Vector2(0, -372), new Vector2(640, 42));
            RectTransform reroll = null, takeAll = null;
            bool showTakeAll = !star && B.OfferTakeAll && Profile.S.AdTakeAll < 5;
            Action refresh = () =>
            {
                int left = B.RerolledOnce ? 0 : 1;
                watch.text = showTakeAll ? "天降神运！可一次性收下全部 3 张强化" : $"当局剩余刷新次数 {left}/1";
                if (reroll)
                {
                    reroll.gameObject.SetActive(left > 0 && !star);
                    reroll.anchoredPosition = new Vector2(showTakeAll ? -196 : 0, -476);
                }
                if (takeAll) takeAll.gameObject.SetActive(showTakeAll);
                watch.gameObject.SetActive(!star);
            };
            reroll = Ui.Btn(c, "刷新", new Vector2(320, 102), new Vector2(showTakeAll ? -196 : 0, -476), Pal.Teal, () =>
            {
                if (B.RerolledOnce) return;
                FakeAd("reroll", () =>
                {
                    B.Reroll();
                    foreach (var x in cards) if (x) Destroy(x.gameObject);
                    cards.Clear();
                    BuildCards(c, cards);
                    refresh();
                });
            }, 42, "ic_ad");
            if (showTakeAll)
            {
                takeAll = Ui.Btn(c, "全收下", new Vector2(340, 102), new Vector2(196, -476), Pal.Gold, () =>
                {
                    FakeAd("take_all", () =>
                    {
                        Profile.S.AdTakeAll++;
                        Profile.Save();
                        Sfx.Play(Snd.Jackpot, 0.8f);
                        CloseModal(() =>
                        {
                            B.PickAll();
                            Ui.Toast("鸿运当头！三张强化全部收下", -200);
                        });
                    });
                }, 42, "ic_ad");
            }
            refresh();
            if (_v.Auto != null) Tween.Run(c, 1.4f, k => { }, () => { if (_modalKind == "cards") PickCard(AutoPick(), cards); });
        }

        int AutoPick()
        {
            return Recommend(B.Choices);
        }

        void BuildCards(RectTransform c, List<RectTransform> cards)
        {
            var choices = B.Choices;
            const float cw = 326f, chh = 568f, gap = 22f;
            for (int i = 0; i < choices.Length; i++)
            {
                var p = choices[i];
                float x = (i - (choices.Length - 1) * 0.5f) * (cw + gap);
                var card = Ui.Rect(c, "card" + i);
                card.sizeDelta = new Vector2(cw, chh);
                card.anchoredPosition = new Vector2(x, 22);
                var hd = Defs.Hero(p.Hero);
                var headC = CardHeadColor(p);

                // 宋瓷立式卡面：霁蓝顶栏 + 温润米白瓷身 + 细双线内框 + 底纹菱花。
                Ui.Box(card, new Vector2(cw + 10, chh + 12), new Vector2(0, -8), new Color(0.02f, 0.05f, 0.1f, 0.48f), Art.Rounded);
                var face = Ui.Box(card, new Vector2(cw, chh), Vector2.zero, Pal.Hex("34495E"), Art.Rounded);
                Ui.Box(card, new Vector2(cw - 8, chh - 8), Vector2.zero, Pal.Hex("F6F4EC"), Art.Rounded);

                float top = chh * 0.5f;
                float headH = 82f;
                float headY = top - 4 - headH * 0.5f;
                Ui.Box(card, new Vector2(cw - 8, headH), new Vector2(0, headY), headC, Art.Rounded);
                Ui.Box(card, new Vector2(cw - 8, 26), new Vector2(0, headY - headH * 0.5f + 12), headC, Art.White);
                Ui.Box(card, new Vector2(cw - 8, 3), new Vector2(0, headY - headH * 0.5f), headC.Mul(0.75f), Art.White);
                for (int s = -1; s <= 1; s += 2)
                {
                    var orn = Ui.Box(card, new Vector2(12, 12), new Vector2(s * (cw * 0.5f - 28), headY), Color.white.A(0.32f), Art.RoundedSmall);
                    orn.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
                }
                Ui.SingleLine(Ui.Outlined(card, p.Name, 38, Color.white, new Vector2(0, headY + 1), new Vector2(cw - 68, headH), headC.Mul(0.4f), 2.3f), 22);

                // 内衬细线框与底角菱纹
                float bodyH = chh - headH - 22f;
                float bodyY = -headH * 0.5f + 2f;
                Ui.Box(card, new Vector2(cw - 26, bodyH), new Vector2(0, bodyY), Pal.Hex("E0DACB"), Art.RoundedSmall);
                Ui.Box(card, new Vector2(cw - 30, bodyH - 4), new Vector2(0, bodyY), Pal.Hex("F6F4EC"), Art.RoundedSmall);
                var botDia = Ui.Box(card, new Vector2(12, 12), new Vector2(0, -top + 13), Pal.Hex("D6CEBC"), Art.RoundedSmall);
                botDia.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);

                // 好汉清晰全身立绘 + 接地阴影（无贴纸遮挡脚部）
                Ui.Box(card, new Vector2(154, 34), new Vector2(0, 22), new Color(0.05f, 0.1f, 0.16f, 0.14f), Art.GroundShadow);
                Ui.Icon(card, PerkIcon(p), 184, new Vector2(0, 96));

                Ui.Label(card, $"{hd.Name} · {hd.Role}", 24, Pal.Hex("5E7082"), new Vector2(0, -16), new Vector2(cw - 48, 34), TextAnchor.MiddleCenter, Fonts.Heavy);

                Ui.Box(card, new Vector2(cw - 64, 2), new Vector2(0, -44), Pal.Hex("E2DDD0"), Art.White);
                string note = PerkNote(p);
                var desc = Ui.Label(card, Colorize(p.Desc), 30, Pal.Hex("243240"), new Vector2(0, -124), new Vector2(cw - 48, 126));
                desc.lineSpacing = 1.15f;
                desc.verticalOverflow = VerticalWrapMode.Truncate;

                float foot = -top + 40;
                if (note != null)
                {
                    var nt = Ui.Label(card, note, 22, KindColor(p.Kind), new Vector2(0, foot), new Vector2(cw - 28, 34), TextAnchor.MiddleCenter, Fonts.Heavy);
                    nt.resizeTextForBestFit = true;
                    nt.resizeTextMinSize = 16;
                    nt.resizeTextMaxSize = 22;
                    nt.horizontalOverflow = HorizontalWrapMode.Wrap;
                    nt.verticalOverflow = VerticalWrapMode.Truncate;
                }
                else if (p.Max > 1)
                    Ui.Label(card, $"等级 {B.Level(p.Id)}→{B.Level(p.Id) + 1}", 22, Pal.Hex("7A8A9A"), new Vector2(0, foot), new Vector2(cw - 44, 32), TextAnchor.MiddleCenter, Fonts.Heavy);
                int idx = i;
                Ui.Tap(face, () => PickCard(idx, cards), card);
                Tween.Pop(card, 0.32f, 0.05f + i * 0.07f);
                cards.Add(card);
            }
        }

        void PickCard(int i, List<RectTransform> cards)
        {
            if (_modalKind != "cards" || B.Phase != Phase.Choosing) return;
            _modalKind = "picking";
            var p = B.Choices[i];
            Sfx.Play(Snd.Merge, 0.7f, 1.1f);
            for (int k = 0; k < cards.Count; k++)
            {
                var card = cards[k];
                if (k == i)
                {
                    Tween.Run(card, 0.35f, t => card.localScale = Vector3.one * (1f + 0.15f * Mathf.Sin(t * Mathf.PI)));
                }
                else
                {
                    var g = card.gameObject.AddComponent<CanvasGroup>();
                    Tween.Fade(g, 1, 0, 0.2f);
                }
            }
            Tween.Run(_root, 0.4f, k => { }, () =>
            {
                CloseModal();
                B.Pick(i);
                Ui.Toast((p.Ult ? "解锁大招：" : p.Star ? "满星技能：" : "获得：") + p.Name, -200);
            });
        }

        // ---------------- 老虎机（对标《永远的蔚蓝星球》木匣滚轮 + 顶部横向清晰奖励卡） ----------------

        string RandomReelArt()
        {
            if (UnityEngine.Random.value < 0.55f || B.Lineup == null || B.Lineup.Length == 0) return "ic_silver";
            return Defs.Hero(B.Lineup[UnityEngine.Random.Range(0, B.Lineup.Length)]).Art;
        }

        string FinalReelArt(Reel[] r, int idx)
        {
            if (r == null || idx < 0 || idx >= r.Length || r[idx] == Reel.Silver) return "ic_silver";
            var heroes = B.ReelCellHeroes;
            var h = heroes != null && idx < heroes.Length ? heroes[idx] : B.Lineup[0];
            return Defs.Hero(h).Art;
        }

        void OpenReels()
        {
            var c = OpenModal("reels", 0.74f);
            int cnt = B.ReelCount;
            bool gold5 = cnt >= 5;

            bool canClose = false, usedLucky = false;
            Reel[] r = null;

            Action collect = () =>
            {
                if (!canClose || _modalKind != "reels") return;
                _modalKind = "collecting";
                int gainedSilver = r != null ? B.ReelSilverOf(r) : 0;
                CloseModal(() =>
                {
                    B.ApplyReels(r);
                    if (gainedSilver > 0) QueueCoin(gainedSilver);
                });
                Sfx.Play(Snd.Coin, 0.8f);
            };

            // 全屏空白处点击关闭层（停轮展示完奖励后生效）
            var bgTap = Ui.Fill(c, Color.clear, true, "tapBlank");
            Ui.Tap(bgTap.GetComponent<Graphic>(), collect, null, false);

            // 上半区：停轮后弹出的横向白底金头奖励详情卡容器 + 特效层
            var fxLayer = Ui.Rect(c, "reelFx");
            fxLayer.sizeDelta = new Vector2(1080, 1920);
            var cardsLayer = Ui.Rect(c, "reelCards");
            cardsLayer.sizeDelta = new Vector2(1080, 1920);

            // 中下区：古风木架赤金摇奖机箱体（不再用大白板盖住滚轮，也不让大字糊标题）
            var machine = Ui.Rect(c, "reelMachine");
            machine.anchoredPosition = new Vector2(0, -136);
            float mw = gold5 ? 984f : 908f;
            const float mh = 316f;
            machine.sizeDelta = new Vector2(mw, mh + 96f);
            Ui.Fill(machine, Color.clear, true, "eatMachine");

            // 上下木质横梁与立柱底座（还原参考图厚实木匣造型）
            foreach (float sx in new[] { -mw * 0.36f, mw * 0.36f })
            {
                Ui.Box(machine, new Vector2(104, mh + 92), new Vector2(sx, 0), Pal.Hex("4A2E16"), Art.RoundedSmall);
                Ui.Box(machine, new Vector2(94, mh + 82), new Vector2(sx, 0), Pal.Hex("9E7244"), Art.RoundedSmall);
            }
            foreach (float by in new[] { mh * 0.5f + 22f, -mh * 0.5f - 22f })
            {
                Ui.Box(machine, new Vector2(mw - 36f, 58f), new Vector2(0, by - 4f), Pal.Shadow, Art.RoundedSmall);
                Ui.Box(machine, new Vector2(mw - 36f, 56f), new Vector2(0, by), Pal.Hex("4A2E16"), Art.RoundedSmall);
                Ui.Box(machine, new Vector2(mw - 46f, 46f), new Vector2(0, by), Pal.Hex("B58552"), Art.RoundedSmall);
            }

            // 赤褐金边滚轮主箱体
            Ui.Box(machine, new Vector2(mw + 8f, mh + 10f), new Vector2(0, -8f), Pal.Shadow, Art.Rounded);
            Ui.Box(machine, new Vector2(mw, mh), Vector2.zero, Pal.Hex("4E221C"), Art.Rounded);
            Ui.Box(machine, new Vector2(mw - 10f, mh - 10f), Vector2.zero, gold5 ? Pal.Hex("A84B3E") : Pal.Hex("8E4239"), Art.Rounded);
            Ui.Box(machine, new Vector2(mw - 28f, mh - 28f), Vector2.zero, Pal.Hex("682922"), Art.Rounded);

            var icons = new Image[cnt];
            var peekTops = new Image[cnt];
            var peekBots = new Image[cnt];
            var windows = new RectTransform[cnt];
            float step = gold5 ? 178f : 202f;
            float cellW = gold5 ? 160f : 182f;
            const float cellH = 242f;
            for (int i = 0; i < cnt; i++)
            {
                float x = (i - (cnt - 1) * 0.5f) * step;
                var w = Ui.Rect(machine, "reel" + i);
                w.anchoredPosition = Vector2.zero + new Vector2(x, 0);
                w.sizeDelta = new Vector2(cellW, cellH);
                Ui.Box(w, new Vector2(cellW + 8f, cellH + 8f), Vector2.zero, gold5 ? Pal.Hex("D9A13B") : Pal.Hex("B8893A"), Art.Rounded);

                var drum = Ui.Box(w, new Vector2(cellW - 4f, cellH - 4f), Vector2.zero, Pal.Hex("F5DF74"), Art.Rounded, "drum");
                drum.raycastTarget = false;
                var mask = drum.gameObject.AddComponent<Mask>();
                mask.showMaskGraphic = true;

                // 上下滚轮微露半截相邻图案（对齐参考图真实滚筒质感）
                peekTops[i] = Ui.Icon(drum.transform, RandomReelArt(), 96, new Vector2(0, 138));
                peekTops[i].color = new Color(1f, 1f, 1f, 0.88f);
                peekBots[i] = Ui.Icon(drum.transform, RandomReelArt(), 96, new Vector2(0, -138));
                peekBots[i].color = new Color(1f, 1f, 1f, 0.88f);
                icons[i] = Ui.Icon(drum.transform, i % 2 == 0 ? "ic_silver" : RandomReelArt(), 114, Vector2.zero);

                // 上下滚筒弧面暗影
                var shadeTop = Ui.Box(drum.transform, new Vector2(cellW, 44f), new Vector2(0, cellH * 0.5f - 22f), new Color(0.20f, 0.12f, 0.04f, 0.24f), Art.FadeDown);
                shadeTop.type = Image.Type.Simple;
                var shadeBot = Ui.Box(drum.transform, new Vector2(cellW, 44f), new Vector2(0, -cellH * 0.5f + 22f), new Color(0.20f, 0.12f, 0.04f, 0.24f), Art.FadeDown);
                shadeBot.type = Image.Type.Simple;
                shadeBot.rectTransform.localScale = new Vector3(1f, -1f, 1f);

                windows[i] = w;
            }

            var closeHint = Ui.Outlined(c, "点击空白处关闭", 30, Pal.Hex("E8EEF5"), new Vector2(0, -390), new Vector2(520, 46), Pal.Hex("0E1824"), 2.2f);
            closeHint.gameObject.SetActive(false);

            RectTransform takeBtn = null, luckyBtn = null;
            Action showAfterSpin = () =>
            {
                canClose = true;
                foreach (Transform ch in fxLayer) Destroy(ch.gameObject);
                foreach (Transform ch in cardsLayer) Destroy(ch.gameObject);

                bool all = Battle.IsAllSame(r);
                bool big = Battle.IsBigReelWin(r);
                if (big) Jackpot(fxLayer);
                BuildReelRewardCards(cardsLayer, r);

                closeHint.gameObject.SetActive(true);
                bool canLucky = !all && !usedLucky && _v.Auto == null;
                if (takeBtn)
                {
                    takeBtn.anchoredPosition = new Vector2(canLucky ? -188 : 0, -492);
                    takeBtn.gameObject.SetActive(canLucky);
                    if (canLucky) Tween.Pop(takeBtn, 0.22f);
                }
                if (luckyBtn)
                {
                    luckyBtn.gameObject.SetActive(canLucky);
                    if (canLucky) Tween.Pop(luckyBtn, 0.22f);
                }
                if (_v.Auto != null) Tween.Run(c, 1.2f, k => { }, collect);
            };

            takeBtn = Ui.Btn(c, "收下", new Vector2(310, 104), new Vector2(-188, -492), Pal.Orange, collect, 42);
            takeBtn.gameObject.SetActive(false);
            luckyBtn = Ui.Btn(c, "鸿运重转", new Vector2(340, 104), new Vector2(188, -492), Pal.Gold, () =>
            {
                if (usedLucky) return;
                FakeAd("reel_jackpot", () =>
                {
                    usedLucky = true;
                    canClose = false;
                    closeHint.gameObject.SetActive(false);
                    takeBtn.gameObject.SetActive(false);
                    luckyBtn.gameObject.SetActive(false);
                    foreach (Transform ch in fxLayer) Destroy(ch.gameObject);
                    foreach (Transform ch in cardsLayer) Destroy(ch.gameObject);
                    r = B.SpinReels(true);
                    SpinAnim(icons, peekTops, peekBots, windows, r, showAfterSpin);
                });
            }, 38, "ic_ad");
            luckyBtn.gameObject.SetActive(false);

            Tween.Pop(machine, 0.26f);
            Sfx.Play(Snd.Jackpot, 0.38f);
            // 打开宝箱即自动转动滚轮，利落不拖沓
            Tween.Run(machine, 0.16f, k => { }, () =>
            {
                r = B.SpinReels();
                SpinAnim(icons, peekTops, peekBots, windows, r, showAfterSpin);
            });
        }

        /// <summary>在摇奖机正上方依次弹出横向白底金头奖励卡：左图标 + 右标题与完整词条/银两说明。</summary>
        void BuildReelRewardCards(RectTransform parent, Reel[] r)
        {
            var rows = new List<(string icon, float iconSz, string title, string desc)>();
            foreach (var p in B.ReelPerks)
            {
                var hd = Defs.Hero(p.Hero);
                string tag = p.Ult ? "（大招）" : "";
                string cleanDesc = Colorize(p.Desc.Replace("\n", "，"));
                rows.Add((hd.Art, 114f, $"{hd.Name} · {p.Name}{tag}", cleanDesc));
            }
            int silver = B.ReelSilverOf(r);
            if (silver > 0)
            {
                int sCnt = Array.FindAll(r, x => x == Reel.Silver).Length;
                string sTitle = Battle.IsAllSame(r) ? "母舰金库 · 翻倍大奖" : sCnt >= 3 ? "整箱能量币" : sCnt == 2 ? "大袋能量币" : "补给能量币";
                rows.Add(("ic_silver", 92f, sTitle, $"立即获得 <color=#1E9438>+{silver}</color> 枚能量币"));
            }
            if (rows.Count == 0) return;

            const float cw = 868f;
            float ch = rows.Count >= 3 ? 126f : 140f;
            const float gap = 16f;
            // 从下往上排在摇奖机顶梁与「超爽!!!」上方（底边起于 y = +168，绝不与下方重叠）
            float baseBottomY = 172f;
            for (int i = 0; i < rows.Count; i++)
            {
                var item = rows[rows.Count - 1 - i];
                float cy = baseBottomY + ch * 0.5f + i * (ch + gap);
                var card = Ui.Rect(parent, "rewardCard" + i);
                card.anchoredPosition = new Vector2(0, cy);
                card.sizeDelta = new Vector2(cw, ch);

                Ui.Box(card, new Vector2(cw + 8f, ch + 8f), new Vector2(0, -5f), Pal.Shadow, Art.Rounded);
                Ui.Box(card, new Vector2(cw + 2f, ch + 2f), Vector2.zero, Pal.Hex("DFCFA6"), Art.Rounded);
                var body = Ui.Box(card, new Vector2(cw - 4f, ch - 4f), Vector2.zero, Pal.Hex("FFFDF7"), Art.Rounded, "body");
                body.raycastTarget = false;
                var mask = body.gameObject.AddComponent<Mask>();
                mask.showMaskGraphic = true;

                // 左侧暖金图标舱
                const float leftW = 166f;
                var leftWell = Ui.Box(body.transform, new Vector2(leftW, ch + 8f), new Vector2(-cw * 0.5f + leftW * 0.5f, 0), Pal.Hex("F6D672"), Art.White);
                leftWell.raycastTarget = false;
                Ui.Icon(body.transform, item.icon, Mathf.Min(item.iconSz, ch - 16f), new Vector2(-cw * 0.5f + leftW * 0.5f, 0));

                // 右侧标题 + 效果详情
                float textW = cw - leftW - 48f;
                float textX = -cw * 0.5f + leftW + 24f + textW * 0.5f;
                Ui.SingleLine(Ui.Label(body.transform, item.title, rows.Count >= 3 ? 29 : 32, Pal.Hex("2B231C"),
                    new Vector2(textX, ch * 0.22f), new Vector2(textW, 44f), TextAnchor.MiddleLeft, Fonts.Heavy), 21);
                var desc = Ui.Label(body.transform, item.desc, rows.Count >= 3 ? 23 : 25, Pal.Hex("5A5248"),
                    new Vector2(textX, -ch * 0.19f), new Vector2(textW, 56f), TextAnchor.MiddleLeft, Fonts.Bold);
                MetaUi.Fit(desc, 19);

                card.localScale = Vector3.zero;
                int delayIdx = rows.Count - 1 - i;
                Tween.Run(card, 0.08f * delayIdx + 0.01f, k => { }, () =>
                {
                    if (!card) return;
                    card.localScale = Vector3.one;
                    Tween.Pop(card, 0.24f);
                });
            }
        }

        void SpinAnim(Image[] icons, Image[] peekTops, Image[] peekBots, RectTransform[] windows, Reel[] r, Action done)
        {
            int cnt = r.Length;
            var stopped = new bool[cnt];
            float dur = 0.78f + cnt * 0.24f;
            float tick = 0;
            var owner = icons[0];
            Tween.Run(owner, dur, k =>
            {
                float t = k * dur;
                tick -= Time.unscaledDeltaTime;
                bool doTick = tick <= 0;
                if (doTick) tick = 0.055f;
                for (int i = 0; i < cnt; i++)
                {
                    if (stopped[i]) continue;
                    float stopAt = 0.68f + i * 0.24f;
                    if (t >= stopAt)
                    {
                        stopped[i] = true;
                        string art = FinalReelArt(r, i);
                        icons[i].sprite = Art.Img(art);
                        float sz = art == "ic_silver" ? 102f : 118f;
                        icons[i].rectTransform.sizeDelta = new Vector2(sz, sz);
                        icons[i].rectTransform.anchoredPosition = Vector2.zero;
                        peekTops[i].sprite = Art.Img(RandomReelArt());
                        peekTops[i].rectTransform.anchoredPosition = new Vector2(0, 140f);
                        peekBots[i].sprite = Art.Img(RandomReelArt());
                        peekBots[i].rectTransform.anchoredPosition = new Vector2(0, -140f);
                        Tween.Punch(windows[i], 0.2f, 0.10f);
                        Sfx.Play(Snd.ReelStop, 0.8f);
                        continue;
                    }
                    if (doTick)
                    {
                        string spinArt = RandomReelArt();
                        icons[i].sprite = Art.Img(spinArt);
                        float sz = spinArt == "ic_silver" ? 100f : 114f;
                        icons[i].rectTransform.sizeDelta = new Vector2(sz, sz);
                        peekTops[i].sprite = Art.Img(RandomReelArt());
                        peekBots[i].sprite = Art.Img(RandomReelArt());
                        if (i == 0) Sfx.Play(Snd.Reel, 0.35f);
                    }
                    float scroll = Mathf.Repeat(t * 1500f, 84f) - 42f;
                    icons[i].rectTransform.anchoredPosition = new Vector2(0, scroll);
                    peekTops[i].rectTransform.anchoredPosition = new Vector2(0, 138f + scroll);
                    peekBots[i].rectTransform.anchoredPosition = new Vector2(0, -138f + scroll);
                }
            }, done);
        }

        void Jackpot(RectTransform c)
        {
            Sfx.Play(Snd.Jackpot);
            var rays = Ui.Box(c, new Vector2(860, 620), new Vector2(0, -80), Pal.Gold.A(0.42f), Art.SoftDot);
            rays.transform.SetAsFirstSibling();
            var t = Ui.Outlined(c, "超爽!!!", 96, Pal.Hex("FFE15A"), new Vector2(0, 74), new Vector2(720, 128), Pal.Hex("982C0C"), 5f);
            t.rectTransform.localRotation = Quaternion.Euler(0, 0, 4);
            Tween.Pop(t.transform, 0.32f);
            Confetti(c, 36);
        }

        void Confetti(RectTransform parent, int n)
        {
            for (int i = 0; i < n; i++)
            {
                var col = new[] { Pal.Gold, Pal.Red, Pal.Teal, Pal.Blue, Pal.Green, Color.white }[UnityEngine.Random.Range(0, 6)];
                var img = Ui.Box(parent, new Vector2(18, 30), Vector2.zero, col, Art.RoundedSmall, "confetti");
                var rt = img.rectTransform;
                var p0 = new Vector2(UnityEngine.Random.Range(-520f, 520f), UnityEngine.Random.Range(700f, 1100f));
                float spd = UnityEngine.Random.Range(500f, 900f), sway = UnityEngine.Random.Range(30f, 90f), rot = UnityEngine.Random.Range(200f, 700f);
                float delay = UnityEngine.Random.Range(0f, 0.8f);
                Tween.Run(img, 2.6f, k =>
                {
                    float t = k * 2.6f;
                    rt.anchoredPosition = p0 + new Vector2(Mathf.Sin(t * 4f + p0.x) * sway, -spd * t);
                    rt.localRotation = Quaternion.Euler(0, 0, rot * t);
                }, () => { if (img) Destroy(img.gameObject); }, delay);
            }
        }

        // ---------------- 暂停 / 统计 ----------------

        void OpenPause()
        {
            if (Blocking || B.Phase != Phase.Running) return;
            var c = OpenModal("pause");
            var panel = Ui.Panel(c, new Vector2(720, 780), new Vector2(0, 0));
            Ui.Ribbon(c, "暂停", new Vector2(0, 390), 420);
            Ui.Label(panel, $"{B.Stage.Title} · 第{Mathf.Max(1, B.Wave)}/{B.Stage.Waves}波", 34, Pal.SubInk, new Vector2(0, 240), new Vector2(640, 50), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Btn(panel, "继续战斗", new Vector2(460, 112), new Vector2(0, 120), Pal.Green, () => CloseModal(), 46);
            RectTransform snd = null;
            snd = Ui.Btn(panel, Sfx.On ? "音效：开" : "音效：关", new Vector2(460, 112), new Vector2(0, -10), Pal.Blue, () =>
            {
                Sfx.On = !Sfx.On;
                Sfx.Music = Sfx.On;
                Sfx.PlayMusic(Sfx.On ? Bgm.Battle : Bgm.None);
                Ui.SetBtnText(snd, Sfx.On ? "音效：开" : "音效：关");
            }, 42);
            bool refund = Game.I.CanRefundStamina();
            Ui.Btn(panel, "重新开始", new Vector2(460, 112), new Vector2(0, -140), Pal.Orange, () => { CloseModal(); Game.I.Restart(); }, 42);
            Ui.Btn(panel, refund ? "退出（返还体力）" : "返回主页", new Vector2(460, 112), new Vector2(0, -270), refund ? Pal.Teal : Pal.Red,
                () => { CloseModal(); Game.I.QuitFromPause(); }, refund ? 36 : 42);
            Tween.Pop(panel, 0.25f);
        }

        bool _statsOpen;
        RectTransform _stats;
        Image _statHex, _statRing;
        Image[] _statBars;
        Text[] _statName, _statNum;
        Image[] _statIcon;

        void ToggleStats()
        {
            if (B.Phase != Phase.Running || Blocking) return;
            _statsOpen = !_statsOpen;
            PaintStatBtn();
            if (_statsOpen)
            {
                ShowStats();
                _stats.gameObject.SetActive(true);
                RefreshStats();
                Sfx.Play(Snd.Open, 0.55f);
            }
            else if (_stats) _stats.gameObject.SetActive(false);
        }

        void PaintStatBtn()
        {
            if (!_statHex) return;
            _statRing.color = _statsOpen ? Pal.Hex("E8B03A") : Pal.Hex("6D8EAE").A(0.75f);
            _statHex.color = _statsOpen ? Pal.Hex("F6C445") : Pal.Hex("162638").A(0.86f);
            if (_statBars == null) return;
            foreach (var b in _statBars) if (b) b.color = _statsOpen ? Color.white : Pal.Cream;
        }

        /// <summary>点开后常驻，战斗不停，半透明底透出战场。再点统计按钮收起。</summary>
        void ShowStats()
        {
            if (_stats) return;
            var rows = DmgRows();
            const float pw = 440f, rowH = 64f, header = 48f;
            float ph = header + rows.Count * rowH;
            var card = Ui.Rect(_root, "statboard");
            card.sizeDelta = new Vector2(pw, ph);
            card.anchoredPosition = new Vector2(-160f, 790f - ph * 0.5f);
            var dim = card.gameObject.AddComponent<CanvasGroup>();
            dim.blocksRaycasts = false;
            dim.interactable = false;
            Ui.Box(card, new Vector2(pw, ph), Vector2.zero, Pal.Hex("16344F").A(0.58f), Art.Rounded);
            Ui.Box(card, new Vector2(pw - 8, header - 6), new Vector2(0, ph * 0.5f - header * 0.5f), Pal.Hex("2A5278").A(0.72f), Art.RoundedSmall);
            Ui.Label(card, "我方贡献统计", 26, Pal.Hex("F3F8FF"), new Vector2(0, ph * 0.5f - header * 0.5f), new Vector2(pw - 20, header), TextAnchor.MiddleCenter, Fonts.Heavy);
            _statName = new Text[rows.Count];
            _statNum = new Text[rows.Count];
            _statIcon = new Image[rows.Count];
            for (int i = 0; i < rows.Count; i++)
            {
                float y = ph * 0.5f - header - rowH * 0.5f - i * rowH;
                if (i % 2 == 1)
                    Ui.Box(card, new Vector2(pw - 10, rowH - 2), new Vector2(0, y), Pal.Hex("081624").A(0.28f), Art.RoundedSmall);
                float iconX = -pw * 0.5f + 40f;
                Ui.Box(card, new Vector2(48, 48), new Vector2(iconX, y), Pal.Hex("8FB3D6").A(0.55f), Art.RoundedSmall);
                _statIcon[i] = Ui.Icon(card, rows[i].Art, 44, new Vector2(iconX, y + 1));
                _statName[i] = Ui.Label(card, rows[i].Name, 26, Pal.Hex("F4F8FF"), new Vector2(-pw * 0.5f + 156, y), new Vector2(160, 42), TextAnchor.MiddleLeft, Fonts.Heavy);
                _statNum[i] = Ui.Label(card, Ui.Num(rows[i].Dmg), 26, Color.white, new Vector2(pw * 0.5f - 72, y), new Vector2(120, 42), TextAnchor.MiddleRight, Fonts.Heavy);
            }
            _stats = card;
        }

        void RefreshStats()
        {
            if (_statNum == null) return;
            var rows = DmgRows();
            int n = Mathf.Min(rows.Count, _statNum.Length);
            for (int i = 0; i < n; i++)
            {
                _statName[i].text = rows[i].Name;
                _statNum[i].text = Ui.Num(rows[i].Dmg);
                var sp = Art.Img(rows[i].Art);
                if (sp && _statIcon[i].sprite != sp) _statIcon[i].sprite = sp;
            }
        }

        readonly struct DmgRow
        {
            public readonly string Name, Art;
            public readonly float Dmg;
            public readonly Color Col;
            public DmgRow(string name, string art, float dmg, Color col) { Name = name; Art = art; Dmg = dmg; Col = col; }
        }

        /// <summary>四位上阵好汉加寨主宋江，按输出从高到低。</summary>
        List<DmgRow> DmgRows()
        {
            var rows = new List<DmgRow>();
            foreach (var h in B.Lineup) rows.Add(new DmgRow(Defs.Hero(h).Name, Defs.Hero(h).Art, B.DamageBy[(int)h], RoleColor(h)));
            rows.Add(new DmgRow("老村长", "lord_songjiang", B.LordDamage, Pal.Gold));
            rows.Sort((a, b) => b.Dmg.CompareTo(a.Dmg));
            return rows;
        }

        static Color RoleColor(HeroId h) => MetaUi.RoleColor(Defs.Hero(h).Kind);

        // ---------------- 结算 ----------------

        float _resultDelay = -1;

        void OpenResult(bool win)
        {
            if (_resultDelay < 0) { _resultDelay = win ? 1.6f : 1.2f; return; }
            _resultDelay -= Time.unscaledDeltaTime;
            if (_resultDelay > 0) return;
            _resultDelay = -1;
            var c = OpenModal(win ? "victory" : "defeat", 0.6f);
            Sfx.PlayMusic(win ? Bgm.Victory : Bgm.Defeat);
            var band = Ui.Rect(c, "band");
            band.sizeDelta = new Vector2(1080, 1060);
            band.anchoredPosition = new Vector2(0, -10);
            // 胜利不再放进伙条，板子在奖励下方收住；失败提示更长，仍用整块。
            float panelH = win ? 960f : 1060f;
            float panelY = win ? 50f : 0f;
            Ui.Box(band, new Vector2(1200, panelH), new Vector2(0, panelY), (win ? Pal.Hex("182D44") : Pal.Hex("232E3A")).A(0.96f), Art.White);
            float lip = panelH * 0.5f - 4f;
            Ui.Box(band, new Vector2(1200, 8), new Vector2(0, panelY + lip), win ? Pal.Gold : Pal.Hex("7C8FA4"), Art.White);
            Ui.Box(band, new Vector2(1200, 8), new Vector2(0, panelY - lip), win ? Pal.Gold : Pal.Hex("7C8FA4"), Art.White);
            if (win) Ui.Box(c, new Vector2(1000, 700), new Vector2(0, 560), Pal.Gold.A(0.45f), Art.SoftDot).transform.SetSiblingIndex(0);
            var crown = Ui.Icon(c, win ? "ic_crown" : "ic_wall", 250, new Vector2(0, 660));
            if (!win) crown.color = Pal.Hex("B0A6A0");
            Tween.Pop(crown.transform, 0.4f, 0.1f);
            var rib = Ui.Ribbon(c, win ? "守村大捷" : "防线失守", new Vector2(0, 520), 560, win ? Pal.Hex("E0A022") : Pal.Hex("7A6A64"));
            Tween.Pop(rib, 0.35f);
            float hpPct = B.WallMax > 0 ? B.Wall / B.WallMax * 100f : 0;
            Ui.Label(band, B.Stage.Title, 40, Pal.Hex("FFD87A"), new Vector2(0, 390), new Vector2(700, 56), TextAnchor.MiddleCenter, Fonts.Heavy);
            Ui.Label(band, win ? $"剩余血量：{Mathf.RoundToInt(hpPct)}%" : $"坚守到 第{Mathf.Max(1, B.Wave)}/{B.Stage.Waves}波", 34, Pal.Hex("D6E6F6"), new Vector2(0, 336), new Vector2(700, 50));

            SectionTitle(band, "输出统计", 260);
            var rows = DmgRows();
            for (int i = 0; i < rows.Count; i++)
            {
                float x = -330 + (i % 3) * 330;
                float y = 160 - (i / 3) * 135;
                var r = rows[i];
                Ui.Box(band, new Vector2(112, 112), new Vector2(x - 90, y), r.Art == "lord_songjiang" ? Pal.Gold : Color.white, Art.Rounded);
                Ui.Box(band, new Vector2(100, 100), new Vector2(x - 90, y), Pal.Hex("8FB3D6"), Art.Rounded);
                Ui.Icon(band, r.Art, 96, new Vector2(x - 90, y + 2));
                if (i == 0)
                {
                    var mvp = Ui.Outlined(band, "MVP", 30, Pal.Hex("FFD84A"), new Vector2(x - 110, y + 50), new Vector2(110, 44), Pal.Hex("8A3A0A"), 2.5f);
                    mvp.rectTransform.localRotation = Quaternion.Euler(0, 0, 10);
                }
                Ui.Label(band, Ui.Num(r.Dmg), 40, Color.white, new Vector2(x + 60, y + 14), new Vector2(170, 56), TextAnchor.MiddleLeft, Fonts.Heavy);
                Ui.Label(band, r.Name, 28, Pal.Hex("BFD4EA"), new Vector2(x + 60, y - 30), new Vector2(170, 40), TextAnchor.MiddleLeft);
            }

            if (win)
            {
                var r = Game.I.Settle(B, true);
                for (int i = 0; i < 3 && B.Stage.Mode == StageMode.Main; i++)
                {
                    var st = Ui.Icon(band, "ic_star", i == 1 ? 96 : 76, new Vector2((i - 1) * 110, 470 + (i == 1 ? 14 : 0)));
                    if (i >= r.Stars) st.color = new Color(0.43f, 0.34f, 0.27f, 0.9f);
                    Tween.Pop(st.transform, 0.3f, 0.5f + i * 0.15f);
                }
                if (r.First)
                {
                    var tag = Ui.Box(band, new Vector2(130, 48), new Vector2(300, 390), Pal.Red, Art.Pill);
                    Ui.Outlined(tag.transform, "首通", 28, Color.white, Vector2.zero, new Vector2(130, 48), Pal.RedDeep, 2f);
                }
                SectionTitle(band, B.Stage.Mode == StageMode.Escort ? $"截获能量箱 {B.PortersKilled} 箱" : "通关奖励", -110);
                MetaUi.ItemRow(band, r.Items, new Vector2(0, -230), 170);
                Confetti(c, 60);
                Sfx.Play(Snd.Jackpot, 0.6f);
                bool doubled = false;
                RectTransform dbl = null;
                const float btnY = -540f;
                dbl = Ui.Btn(c, "双倍领取", new Vector2(340, 124), new Vector2(-190, btnY), Pal.Teal, () =>
                {
                    if (doubled) return;
                    FakeAd("double", () =>
                    {
                        doubled = true;
                        Game.I.GiveAgain(r);
                        Ui.SetBtnText(dbl, "已双倍");
                        Ui.Toast("奖励已翻倍", 200);
                        Sfx.Play(Snd.Jackpot, 0.6f);
                    });
                }, 40, "ic_ad");
                Ui.Btn(c, "返回", new Vector2(340, 124), new Vector2(190, btnY), Pal.Slate, () => { CloseModal(); Game.I.ShowHome(); }, 46);
                if (_v.Auto != null) Tween.Run(c, 3f, k => { }, () => Game.I.OnAutoDone(true));
            }
            else
            {
                SectionTitle(band, "败因提示", -110);
                Ui.Label(band, Tip(), 34, Pal.Cream, new Vector2(0, -210), new Vector2(880, 120));
                var pre = Game.I.Preview(B, false);
                if (pre.Items.Count > 0)
                {
                    Ui.Label(band, "离开可得", 28, Pal.Hex("A8BDD2"), new Vector2(-340, -330), new Vector2(200, 40));
                    MetaUi.ItemRow(band, pre.Items, new Vector2(60, -330), 110);
                }
                void Leave(int tab)
                {
                    Game.I.Settle(B, false);
                    CloseModal();
                    Game.I.ShowHome(tab);
                }
                if (!B.RevivedOnce)
                    Ui.Btn(c, "复活再战", new Vector2(340, 124), new Vector2(-340, -640), Pal.Teal, () =>
                    {
                        FakeAd("revive", () =>
                        {
                            CloseModal();
                            B.Revive();
                            Sfx.PlayMusic(Bgm.Battle);
                        });
                    }, 44, "ic_ad");
                Ui.Btn(c, "去养成", new Vector2(280, 124), new Vector2(B.RevivedOnce ? -170 : 0, -640), Pal.Hex("F2B632"), () => Leave(1), 44);
                Ui.Btn(c, "返回", new Vector2(260, 124), new Vector2(B.RevivedOnce ? 170 : 330, -640), Pal.Slate, () => Leave(2), 44);
                if (_v.Auto != null) Tween.Run(c, 3f, k => { }, () => { Game.I.Settle(B, false); Game.I.OnAutoDone(false); });
            }
            Tween.Pop(band, 0.3f);
        }

        void SectionTitle(RectTransform parent, string s, float y)
        {
            var d = Ui.Box(parent, new Vector2(20, 20), new Vector2(-440, y), Pal.Hex("C8A870"), Art.RoundedSmall);
            d.rectTransform.localRotation = Quaternion.Euler(0, 0, 45);
            Ui.Label(parent, s, 36, Pal.Hex("EAF3FC"), new Vector2(-260, y), new Vector2(320, 50), TextAnchor.MiddleLeft, Fonts.Heavy);
            Ui.Box(parent, new Vector2(900, 3), new Vector2(0, y - 36), Pal.Hex("7FA6CC").A(0.6f), Art.White);
        }

        string Tip()
        {
            int best = 0;
            foreach (var s in B.Slots) if (s.Unit != null) best = Mathf.Max(best, s.Unit.Star);
            if (best < 3) return "多把相同乡亲拖到一起合体升星\n三星、满星乡亲伤害成倍增长";
            int ults = 0;
            foreach (var h in B.Lineup) if (B.HasUlt(h)) ults++;
            if (ults < 2) return "点黑板「改装」解锁乡亲大招\n大招清群、打外星首领最有效";
            return "外星首领来之前多合高星\n狂暴波前记得升级村长装备加固防线";
        }

        // ---------------- 模拟广告 ----------------

        void FakeAd(string scene, Action done) => Ads.Show(scene, done);

        // ---------------- 新手引导 ----------------

        void UpdateGuide()
        {
            if (!_v.Tutorial || _v.Auto != null) return;
            if (_guideStep < 0) { _guideStep = 0; ShowGuide(); return; }
            if (Blocking) { if (_guide) _guide.gameObject.SetActive(false); return; }
            if (_guide) _guide.gameObject.SetActive(true);
            switch (_guideStep)
            {
                case 1:
                    if (_v.MergesDone > 0) NextGuide();
                    else if (_guide == null && _v.FindMergePair(out _, out _)) ShowGuide();
                    else if (_guide != null) MoveMergeGhost();
                    break;
                case 2:
                    if (_guide == null && B.SpendableCoins >= B.EnhanceCost && SummonedEnough()) ShowGuide();
                    break;
            }
            TickHand();
        }

        void NextGuide()
        {
            if (_guide) Destroy(_guide.gameObject);
            _guide = null;
            _guideStep++;
            if (_guideStep > 2)
            {
                _v.Tutorial = false;
                Profile.S.TutorialDone = 1;
                Profile.Save();
                return;
            }
            if (_guideStep == 1 && _v.FindMergePair(out _, out _)) ShowGuide();
        }

        Image _ghost;
        float _ghostT;
        RectTransform _hand;
        Image _handRipple;
        Vector2 _handAt;
        float _handT;
        bool _handDrag;

        static RectTransform BottomRect(Transform parent, Vector2 pos, Vector2 size, string name)
        {
            var rt = Ui.Rect(parent, name);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0);
            rt.sizeDelta = size;
            rt.anchoredPosition = pos;
            return rt;
        }

        static Vector2 WorldToBottomUi(Vector3 w) => new Vector2(w.x * 100f, Ui.FromBottom(w.y));

        void ShowGuide()
        {
            if (_guide) Destroy(_guide.gameObject);
            _guide = Ui.Rect(_root, "guide");
            _guide.anchorMin = Vector2.zero;
            _guide.anchorMax = Vector2.one;
            _guide.offsetMin = _guide.offsetMax = Vector2.zero;
            var cg = _guide.gameObject.AddComponent<CanvasGroup>();
            cg.blocksRaycasts = false;
            cg.alpha = 0;
            Tween.Run(_guide, 0.35f, k => cg.alpha = k);
            if (_guideStep == 0 || _guideStep == 2)
            {
                bool sum = _guideStep == 0;
                var prop = WorldToBottomUi((sum ? _v.Drum : _v.Book).position);
                Spotlight(new Vector2(prop.x, prop.y - 20), 460);
                Hand(prop + new Vector2(6, -6), false);
                GuideText(sum ? "敲大铜锣，喊乡亲上防线！" : "点黑板台改装，三选一\n解锁乡亲大招！", new Vector2(sum ? 70 : -70, prop.y + 330), !sum);
            }
            else
            {
                _ghost = Ui.Box(_guide, new Vector2(120, 120), Vector2.zero, Color.white.A(0.85f), Art.Img("hero_huarong"));
                _ghost.preserveAspect = true;
                _ghost.rectTransform.anchorMin = _ghost.rectTransform.anchorMax = new Vector2(0.5f, 0);
                Hand(Vector2.zero, true);
                _ghostT = 0;
                GuideText("按住乡亲，拖到相同乡亲上\n合体升星，火力翻倍！", new Vector2(0, Ui.FromBottom(-1.4f)), false);
            }
        }

        /// <summary>全屏压暗，只在 center 处留一个柔边圆洞。</summary>
        void Spotlight(Vector2 c, float d)
        {
            var dim = new Color(0.02f, 0.03f, 0.05f, 0.62f);
            float h = Ui.Height + 400f, r = d * 0.5f;
            var hole = BottomRect(_guide, c, Vector2.one * d, "hole").gameObject.AddComponent<Image>();
            hole.sprite = Art.Hole;
            hole.color = dim;
            hole.raycastTarget = false;
            void Block(Vector2 min, Vector2 max)
            {
                var img = BottomRect(_guide, (min + max) * 0.5f, max - min, "dim").gameObject.AddComponent<Image>();
                img.color = dim;
                img.raycastTarget = false;
            }
            Block(new Vector2(-1400, -200), new Vector2(c.x - r, h));
            Block(new Vector2(c.x + r, -200), new Vector2(1400, h));
            Block(new Vector2(c.x - r, c.y + r), new Vector2(c.x + r, h));
            Block(new Vector2(c.x - r, -200), new Vector2(c.x + r, c.y - r));
        }

        /// <summary>白手套：指尖对准 at。drag=true 时由合成引导每帧挪位置，不做点按动画。</summary>
        void Hand(Vector2 at, bool drag)
        {
            _handRipple = Ui.Box(_guide, new Vector2(170, 170), Vector2.zero, Color.white.A(0), Art.Ring, "ripple");
            _handRipple.rectTransform.anchorMin = _handRipple.rectTransform.anchorMax = new Vector2(0.5f, 0);
            var img = Ui.Icon(_guide, "ic_hand", 150, Vector2.zero, "hand");
            _hand = img.rectTransform;
            _hand.anchorMin = _hand.anchorMax = new Vector2(0.5f, 0);
            _hand.pivot = new Vector2(0.13f, 0.93f);
            _handAt = at;
            _handDrag = drag;
            _handT = 0;
            TickHand();
        }

        void TickHand()
        {
            if (_hand == null) return;
            _handT += Time.unscaledDeltaTime;
            if (_handDrag)
            {
                _hand.anchoredPosition = _handAt;
                _hand.localScale = Vector3.one * 0.92f;
                _handRipple.color = Color.white.A(0);
                return;
            }
            float t = Mathf.Repeat(_handT, 1.2f) / 1.2f;
            float press = t < 0.35f ? Tween.OutCubic(t / 0.35f) : t < 0.6f ? 1f : 1f - Tween.OutCubic((t - 0.6f) / 0.4f);
            _hand.anchoredPosition = _handAt + new Vector2(50, -50) * (1 - press);
            _hand.localScale = Vector3.one * (t > 0.35f && t < 0.6f ? 0.9f : 1f);
            float rr = t < 0.35f ? 0f : (t - 0.35f) / 0.65f;
            _handRipple.rectTransform.anchoredPosition = _handAt;
            _handRipple.rectTransform.localScale = Vector3.one * (0.25f + 0.9f * rr);
            _handRipple.color = Color.white.A(t < 0.35f ? 0 : (1 - rr) * 0.9f);
        }

        /// <summary>宋江头像 + 奶白对话框。</summary>
        void GuideText(string s, Vector2 bottomPos, bool portraitRight)
        {
            var box = BottomRect(_guide, bottomPos, new Vector2(620, 150), "tip");
            Ui.Box(box, new Vector2(620, 150), new Vector2(0, -6), Pal.Shadow, Art.Rounded);
            Ui.Box(box, new Vector2(620, 150), Vector2.zero, Pal.Edge, Art.Rounded);
            Ui.Box(box, new Vector2(606, 136), Vector2.zero, Pal.Cream, Art.Rounded);
            float side = portraitRight ? 1 : -1;
            var face = Ui.Icon(box, "lord_songjiang", 168, new Vector2(side * 270, 42));
            if (portraitRight) face.rectTransform.localScale = new Vector3(-1, 1, 1);
            var tag = Ui.Box(box, new Vector2(110, 40), new Vector2(side * 262, -58), Pal.Hex("B8432F"), Art.Pill);
            Ui.Outlined(tag.transform, "老村长", 26, Color.white, new Vector2(0, 1), new Vector2(110, 40), Pal.Hex("5A1A10"), 2f);
            Ui.Label(box, s, 36, Pal.Ink, new Vector2(-side * 60, 0), new Vector2(470, 130), TextAnchor.MiddleCenter, Fonts.Heavy);
            Tween.Pop(box, 0.3f);
        }

        void MoveMergeGhost()
        {
            if (_ghost == null || !_v.FindMergePair(out var a, out var b))
            {
                if (_ghost) _ghost.gameObject.SetActive(false);
                if (_hand) _hand.gameObject.SetActive(false);
                return;
            }
            bool show = !_v.Dragging;
            _ghost.gameObject.SetActive(show);
            _hand.gameObject.SetActive(show);
            var ua = B.Slots[0];
            foreach (var s in B.Slots) if (s.Pos.ToV() == a) ua = s;
            if (ua.Unit != null) _ghost.sprite = Art.Img(ua.Unit.Def.Art);
            _ghostT += Time.unscaledDeltaTime;
            float k = Mathf.Repeat(_ghostT, 1.8f);
            float move = Mathf.Clamp01((k - 0.35f) / 0.9f);
            var pa = new Vector2(a.x * 100f, Ui.FromBottom(a.y));
            var pb = new Vector2(b.x * 100f, Ui.FromBottom(b.y));
            var p = Vector2.Lerp(pa, pb, Tween.OutCubic(move)) + new Vector2(0, 30);
            _ghost.rectTransform.anchoredPosition = p;
            float alpha = k < 0.25f ? k / 0.25f : k > 1.45f ? 1 - (k - 1.45f) / 0.35f : 1f;
            _ghost.color = Color.white.A(0.8f * Mathf.Clamp01(alpha));
            _handAt = p + new Vector2(10, -40);
            _hand.GetComponent<Image>().color = Color.white.A(Mathf.Clamp01(alpha));
        }
    }
}
