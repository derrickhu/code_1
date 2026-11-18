using System.Collections;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;

namespace Liangshan
{
    /// <summary>战场表现：寨墙格子上的好汉、官军、弹道、命中特效、拖拽合成。规则全在 Sim.Battle，这里只读状态、播事件。</summary>
    public sealed class BattleView : MonoBehaviour
    {
        public Battle B { get; private set; }
        public BattleHud Hud { get; private set; }
        public Bot Auto;
        public float Speed = 1f;
        public bool Paused;
        public bool Tutorial;

        /// <summary>屏幕底边的世界 y。9:16 时是 -9.6，更高的屏更低。</summary>
        public float Bottom { get; private set; }
        public float PropY => Bottom + 1.55f;
        public static readonly Vector2 CoinTarget = new Vector2(-4.95f, -7.22f);

        const float WallW = 11.4f;
        static readonly Vector2 TileSize = new Vector2(1.26f, 1.18f);

        Transform _world;
        SpriteRenderer _wall;
        static readonly Color WallTint = Color.white;
        Color _wallColor = WallTint;
        float _wallFlash;
        readonly List<SlotView> _slots = new List<SlotView>();
        readonly Dictionary<Enemy, EnemyView> _enemies = new Dictionary<Enemy, EnemyView>();
        readonly Dictionary<Shot, ShotView> _shots = new Dictionary<Shot, ShotView>();
        readonly List<Enemy> _gone = new List<Enemy>();
        readonly List<Shot> _goneShots = new List<Shot>();
        readonly HashSet<Shot> _liveShots = new HashSet<Shot>();
        public Transform Book, Leader, Drum;
        public SpriteRenderer BookLit, BookAura;
        int _coinsFlying;
        float _hitSfxGap, _bowGap;

        // 拖拽
        int _dragFrom = -1;
        bool _pressing;
        Vector2 _pressPos;
        float _pressTime;
        public float LastMergeTime = -99f;
        public int MergesDone;

        public void Begin(int seed, LevelDef stage, Loadout lo, bool tutorial)
        {
            Tutorial = tutorial;
            B = new Battle(seed, lo.Lineup, stage, lo);
            Bottom = -9.6f;
            _world = new GameObject("World").transform;
            _world.SetParent(transform, false);
            BuildGround();
            FitField();
            foreach (var s in B.Slots) AddSlotView(s, false);
            Hud = BattleHud.Create(this);
        }

        // ---------------- 场景搭建 ----------------

        const float BgSeam = -5.57f;
        const float StretchPivot = -2.6f;
        SpriteRenderer _bg;
        float _fitOrtho, _fitAspect;

        /// <summary>
        /// 背景按屏幕铺满（以墙脚接缝为锚等比放大）。高屏背景跟着变高，城门上移，
        /// 所以停止线以上的官军在渲染时同比例拉长，出生点始终对准城门。
        /// </summary>
        /// <summary>背景图的版式（1080×1920 像素坐标）：墙脚接缝、两个门洞的中心 x、门洞宽、门楣和门槛的 y。</summary>
        readonly struct BgLayout
        {
            public readonly float Seam, DoorL, DoorR, DoorW, DoorTop, DoorBottom;
            public BgLayout(float seam, float doorL, float doorR, float doorW, float doorTop, float doorBottom)
            { Seam = seam; DoorL = doorL; DoorR = doorR; DoorW = doorW; DoorTop = doorTop; DoorBottom = doorBottom; }
        }

        /// <summary>每章一张 9:16 背景，长屏、标准屏共用一套版式。门洞按图上暗色拱门量出。</summary>
        static readonly System.Collections.Generic.Dictionary<string, BgLayout> ChapterBg = new System.Collections.Generic.Dictionary<string, BgLayout>
        {
            ["battle_bg"] = new BgLayout(0.84f, 260, 819, 114, 176, 378),
            ["battle_bg_ch2"] = new BgLayout(0.84f, 220, 865, 102, 109, 368),
            ["battle_bg_ch3"] = new BgLayout(0.84f, 208, 872, 121, 135, 408),
            ["battle_bg_ch4"] = new BgLayout(0.84f, 242, 837, 98, 157, 358),
            ["battle_bg_ch5"] = new BgLayout(0.84f, 281, 799, 124, 195, 389),
        };

        readonly GateDoor[] _doors = new GateDoor[2];
        public float GateOpen => _doors[0] == null ? 0f : Mathf.Max(_doors[0].Openness, _doors[1].Openness);

        void FitField()
        {
            var cam = Game.Cam;
            _fitOrtho = cam.orthographicSize;
            _fitAspect = cam.aspect;
            float camTop = cam.transform.localPosition.y + cam.orthographicSize;
            float camW = cam.orthographicSize * 2f * cam.aspect;
            float HeightFor(BgLayout l) => Mathf.Max(19.2f, camW * 1920f / 1080f, (camTop - BgSeam) / l.Seam);
            var lay = ChapterBg.TryGetValue(B.Stage.Bg, out var chLay) ? chLay : ChapterBg["battle_bg"];
            float h = HeightFor(lay);
            float w = h * 1080f / 1920f;
            _bg.sprite = Art.Img(B.Stage.Bg);
            float cy = BgSeam + (lay.Seam - 0.5f) * h;
            _bg.transform.localPosition = new Vector2(0, cy);
            _bg.transform.localScale = Vector3.one * h;
            Vector2 Px(float x, float y) => new Vector2((x / 1080f - 0.5f) * w, cy + (0.5f - y / 1920f) * h);

            // 出生点（规则坐标 GateX, SpawnY）精准对准左右拱门门槛：纵向按 Stretch 拉，横向左右分别按门洞中心对齐。
            var sillL = Px(lay.DoorL, lay.DoorBottom);
            var sillR = Px(lay.DoorR, lay.DoorBottom);
            float gate = (sillL.y + sillR.y) * 0.5f + 0.08f;
            V2Ext.Pivot = StretchPivot;
            V2Ext.Stretch = (gate - StretchPivot) / (Layout.SpawnY - StretchPivot);
            V2Ext.XStretchL = sillL.x / Layout.GateX[0];
            V2Ext.XStretchR = sillR.x / Layout.GateX[1];

            float doorW = lay.DoorW / 1080f * w, doorH = (lay.DoorBottom - lay.DoorTop) / 1920f * h;
            for (int i = 0; i < 2; i++)
            {
                var bottom = i == 0 ? sillL : sillR;
                if (_doors[i] == null) _doors[i] = new GateDoor(_world);
                _doors[i].Place(bottom, doorW, doorH);
            }
        }

        /// <summary>城门暗拱：保持门洞幽深纵深，出兵时门槛亮起火把暖晕、收兵时落尘，不再糊两块平板木门遮住石拱。</summary>
        sealed class GateDoor
        {
            readonly Transform _root;
            readonly SpriteRenderer _void, _glow;
            float _open, _until = -99f, _w;
            Vector2 _bottom;

            public GateDoor(Transform parent)
            {
                _root = new GameObject("gate").transform;
                _root.SetParent(parent, false);
                _void = WorldFx.Spr(_root, Art.SoftDot, Vector2.zero, 1f, -92, new Color(0.03f, 0.04f, 0.07f, 0.65f), "void");
                _glow = WorldFx.Additive(WorldFx.Spr(_root, Art.SoftDot, Vector2.zero, 1f, -90, new Color(1f, 0.62f, 0.24f, 0f), "glow"));
            }

            public void Place(Vector2 bottom, float w, float h)
            {
                _bottom = bottom;
                _w = w;
                _root.localPosition = bottom;
                _void.transform.localPosition = new Vector2(0, h * 0.42f);
                _void.transform.localScale = new Vector3(w * 1.05f, h * 1.1f, 1f);
                _glow.transform.localPosition = new Vector2(0, 0.05f);
                _glow.transform.localScale = new Vector3(w * 1.45f, h * 0.65f, 1f);
            }

            public void Open(float secs) => _until = Mathf.Max(_until, Time.time + secs);
            public float Openness => _open;

            public void Tick()
            {
                bool want = Time.time < _until;
                float prev = _open;
                _open = Mathf.MoveTowards(_open, want ? 1f : 0f, Time.deltaTime * (want ? 3.4f : 1.8f));
                float pulse = 0.85f + 0.15f * Mathf.Sin(Time.time * 9f);
                _glow.color = new Color(0.38f, 0.86f, 1f, 0.28f * _open * pulse);
                if (prev > 0.02f && _open <= 0f)
                    WorldFx.I.Dust(_bottom + new Vector2(0, -0.05f), _w * 0.95f, DustCol.A(0.38f), 0.45f, 95);
            }
        }

        void BuildGround()
        {
            _bg = WorldFx.Spr(_world, Art.Img(B.Stage.Bg), Vector2.zero, 1, -100, null, "bg");
            const float camW = 22f;

            // 墙后玄青石板校场：与青灰石城墙、石垛底座材质浑然一体。
            float floorTop = -5.85f;
            float floorBottom = Bottom - 0.5f;
            WorldFx.Block(_world, Art.White, new Vector2(0, (floorTop + floorBottom) * 0.5f), new Vector2(camW + 1, floorTop - floorBottom), 40, Pal.Hex("34424F"), "floor");
            var rng = new System.Random(7);
            int row = 0;
            for (float y = floorTop - 0.45f; y > floorBottom - 0.6f; y -= 1.02f, row++)
            {
                float off = row % 2 == 0 ? 0 : 0.72f;
                for (float x = -camW * 0.5f - 1.4f + off; x < camW * 0.5f + 1.4f; x += 1.44f)
                {
                    float v = 0.93f + (float)rng.NextDouble() * 0.12f;
                    WorldFx.Block(_world, Art.RoundedSmall, new Vector2(x, y), new Vector2(1.36f, 0.94f), 41, Pal.Hex("4A5B6C").Mul(v), "stone");
                    WorldFx.Block(_world, Art.RoundedSmall, new Vector2(x, y + 0.39f), new Vector2(1.24f, 0.08f), 41, Pal.Hex("62768A").Mul(v), "stoneLit");
                }
            }
            var shade = WorldFx.Block(_world, Art.VGrad, new Vector2(0, floorTop - 0.65f), new Vector2(camW + 1, 1.3f), 42, new Color(0, 0, 0, 0.0f), "shade");
            shade.color = new Color(0.05f, 0.09f, 0.14f, 0.48f);
            shade.flipY = true;

            // 寨墙：玄青条石城垣 + 两侧角楼，走道对齐基础格那一行。
            float wallH = WallW * 169f / 1238f;
            _wall = WorldFx.Spr(_world, Art.Img("wall"), new Vector2(0, -5.22f), WallW, 100, null, "wall");
            WorldFx.Block(_world, Art.GroundShadow, new Vector2(0, -6.12f), new Vector2(WallW * 1.04f, 0.72f), 95, new Color(0.03f, 0.06f, 0.1f, 0.48f), "wallShadow");

            // 底座三件：左天书兵法坛、中青石凹槽点将碉台（宋江 Q 版坐镇台心，头顶严控在血条底线以下）、右聚义战鼓营寨。
            float py = PropY;
            WorldFx.Spr(_world, Art.GroundShadow, new Vector2(-3.04f, py - 0.88f), 1f, 58, new Color(0.02f, 0.05f, 0.09f, 0.50f), "bookShadow")
                .transform.localScale = new Vector3(2.35f, 0.82f, 1f);
            WorldFx.Spr(_world, Art.GroundShadow, new Vector2(3.04f, py - 0.88f), 1f, 58, new Color(0.02f, 0.05f, 0.09f, 0.50f), "drumShadow")
                .transform.localScale = new Vector3(2.45f, 0.85f, 1f);
            WorldFx.Spr(_world, Art.GroundShadow, new Vector2(0, py - 0.96f), 1f, 58, new Color(0.02f, 0.05f, 0.09f, 0.56f), "throneShadow")
                .transform.localScale = new Vector3(2.95f, 1.02f, 1f);
            WorldFx.Spr(_world, Art.Img("b_throne_base"), new Vector2(0, py - 0.34f), 2.56f, 62, null, "throneBase");
            const float feetY = -0.26f;
            WorldFx.Spr(_world, Art.GroundShadow, new Vector2(0, py + feetY + 0.03f), 1f, 298, new Color(0.06f, 0.10f, 0.16f, 0.42f), "leaderShadow")
                .transform.localScale = new Vector3(0.84f, 0.24f, 1f);
            Book = WorldFx.Spr(_world, Art.Img("prop_book"), new Vector2(-3.04f, py - 0.18f), 2.16f, 300, null, "book").transform;
            BookLit = WorldFx.Spr(Book, Art.Img("prop_book_lit"), Vector2.zero, 1f, 301, Color.white.A(0f), "bookLit");
            BookAura = WorldFx.Spr(Book, Art.SoftDot, new Vector2(0f, 0.24f), 0.72f, 302, Pal.Hex("68F4FF").A(0f), "bookAura");
            BookAura.sharedMaterial = WorldFx.AddMat;
            BookAura.transform.localScale = new Vector3(0.82f, 0.56f, 1f);
            Leader = WorldFx.Spr(_world, Art.Img("prop_songjiang"), new Vector2(0, py + feetY + 0.62f), 1.28f, 301, null, "songjiang").transform;
            Drum = WorldFx.Spr(_world, Art.Img("prop_drum"), new Vector2(3.04f, py - 0.14f), 2.26f, 300, null, "drum").transform;
        }

        SpriteRenderer _range;
        LineRenderer _rangeRim, _rangeGlow, _rangeHi;
        float _rangeT, _rangeShown;
        const int RangeSegs = 120;

        LineRenderer RangeLine(string name, float width, Color c, int order, bool add)
        {
            var go = new GameObject(name);
            go.transform.SetParent(_range.transform.parent, false);
            var lr = go.AddComponent<LineRenderer>();
            lr.sharedMaterial = add ? WorldFx.AddMat : new Material(Shader.Find("Sprites/Default"));
            lr.useWorldSpace = false;
            lr.loop = true;
            lr.positionCount = RangeSegs;
            lr.widthMultiplier = width;
            lr.startColor = lr.endColor = c;
            lr.sortingOrder = order;
            lr.numCornerVertices = 2;
            return lr;
        }

        static void SetCircle(LineRenderer lr, Vector2 c, float r)
        {
            lr.loop = true;
            lr.positionCount = RangeSegs;
            for (int i = 0; i < RangeSegs; i++)
            {
                float a = i * Mathf.PI * 2f / RangeSegs;
                lr.SetPosition(i, new Vector3(c.x + Mathf.Cos(a) * r, c.y + Mathf.Sin(a) * r, 0));
            }
        }

        /// <summary>选中好汉时在地面画攻击范围圈。远程好汉打到 EngageY，近战按 Range 从停止线算。</summary>
        public void ShowRange(Slot s, float secs)
        {
            if (s.Unit == null) return;
            var d = s.Unit.Def;
            var c = s.Pos.ToV();
            float reach = d.Melee ? Layout.StopY + B.HeroRange(d.Id) : Layout.EngageY;
            float r = new V2(0, reach).ToV().y - c.y;
            EnsureRange();
            _fanMode = false;
            _range.enabled = true;
            if (_fan != null) _fan.enabled = false;
            _range.transform.localPosition = c;
            _rangeC = c;
            _rangeR = r;
            _rangeT = secs;
            _rangeShown = 0;
        }

        /// <summary>主公技能范围，和 Layout.InLordRange 是同一块半圆。</summary>
        public void ShowLordRange(float secs)
        {
            EnsureRange();
            _fanMode = true;
            _range.enabled = false;
            _fan.enabled = true;
            _rangeC = new Vector2(0f, Layout.WallRowY);
            _rangeR = Layout.HalfW;
            _rangeT = secs;
            _rangeShown = 0;
        }

        public void HideRange() => _rangeT = Mathf.Min(_rangeT, 0.2f);

        /// <summary>信息面板选中的格子刷成蓝色；-1 取消。</summary>
        public void Select(int slot)
        {
            for (int i = 0; i < _slots.Count; i++) _slots[i].Selected = i == slot;
        }

        float _rangeR;
        Vector2 _rangeC;
        bool _fanMode;
        SpriteRenderer _fan;

        void EnsureRange()
        {
            if (_range != null) return;
            _range = WorldFx.Spr(_world, Art.RangeDisc, Vector2.zero, 1, 96, Color.white, "range");
            _rangeGlow = RangeLine("rangeGlow", 0.02f, new Color(1f, 0.75f, 0.3f, 0f), 97, false);
            _rangeRim = RangeLine("rangeRim", 0.038f, Pal.Hex("FFC14A"), 98, false);
            _rangeHi = RangeLine("rangeHi", 0.02f, new Color(1f, 1f, 1f, 0f), 99, false);
            _fan = WorldFx.Spr(_world, Art.RangeFan, Vector2.zero, 1, 150, Color.white, "lordFan");
            _fan.enabled = false;
        }

        void TickRange()
        {
            if (_range == null) return;
            float dt = Time.unscaledDeltaTime;
            _rangeT -= dt;
            _rangeShown += dt;
            float a = _rangeT > 0.2f ? Mathf.Clamp01(_rangeShown / 0.2f) : Mathf.Clamp01(_rangeT / 0.2f);
            bool on = a > 0.001f;
            _rangeGlow.enabled = _rangeHi.enabled = false;
            _rangeRim.enabled = on;
            _range.enabled = on && !_fanMode;
            if (_fan != null) _fan.enabled = on && _fanMode;
            if (!on) return;
            float pop = 0.9f + 0.1f * Tween.OutBack(Mathf.Clamp01(_rangeShown / 0.25f));
            float r = _rangeR * pop;
            _rangeRim.startColor = _rangeRim.endColor = Pal.Hex("FFC14A").A(0.95f * a);
            _rangeRim.widthMultiplier = 0.038f;
            if (_fanMode)
            {
                _fan.transform.localPosition = _rangeC;
                _fan.transform.localScale = new Vector3(r, r, 1f);
                _fan.color = new Color(1f, 1f, 1f, a);
                _rangeRim.sortingOrder = 152;
                SetArc(_rangeRim, _rangeC, r);
            }
            else
            {
                _range.color = Color.white.A(a);
                _range.transform.localScale = Vector3.one * r * 2f;
                _rangeRim.sortingOrder = 98;
                SetCircle(_rangeRim, _rangeC, r);
            }
        }

        static void SetArc(LineRenderer lr, Vector2 c, float r)
        {
            const int n = 48;
            lr.loop = false;
            lr.positionCount = n + 1;
            for (int i = 0; i <= n; i++)
            {
                float a = Mathf.PI - i * Mathf.PI / n;
                lr.SetPosition(i, new Vector3(c.x + Mathf.Cos(a) * r, c.y + Mathf.Sin(a) * r, 0));
            }
        }

        void Pedestal(Vector2 p, float w)
        {
            WorldFx.Spr(_world, Art.GroundShadow, p + new Vector2(0, -0.34f), 1f, 58, new Color(0.02f, 0.05f, 0.09f, 0.52f), "pedShadow")
                .transform.localScale = new Vector3(w * 1.12f, 0.85f, 1f);
            WorldFx.Spr(_world, Art.Img("b_pedestal"), p, w, 60, null, "pedestal");
        }

        SlotView AddSlotView(Slot s, bool animate)
        {
            var v = new SlotView(this, s, _world);
            _slots.Add(v);
            if (animate)
            {
                Tween.Pop(v.Root, 0.4f);
                WorldFx.I.Sparks(Art.SoftDot, s.Pos.ToV(), 10, 0.35f, 2.2f, Pal.Hex("D9C9A8").A(0.8f), 0.5f, 9000, 3f);
            }
            return v;
        }

        // ---------------- 主循环 ----------------

        void Update()
        {
            if (B == null) return;
            if (!Mathf.Approximately(_fitOrtho, Game.Cam.orthographicSize) || !Mathf.Approximately(_fitAspect, Game.Cam.aspect)) FitField();
            TickRange();
            TickMark();
            foreach (var d in _doors) d?.Tick();
            bool frozen = Paused || Hud.Blocking;
            bool running = B.Phase == Phase.Running && !frozen;
            Time.timeScale = frozen ? 0f : Speed * SlowMo();
            if (running)
            {
                float dt = Mathf.Min(Time.deltaTime, 0.05f);
                if (Auto != null) Auto.Step(B, dt);
                B.Update(dt);
            }

            PlayEvents();
            SyncSlots();
            SyncEnemies();
            SyncShots();
            HandleInput();
            if (_hitSfxGap > 0) _hitSfxGap -= Time.unscaledDeltaTime;
            if (_bowGap > 0) _bowGap -= Time.unscaledDeltaTime;
            if (_wallFlash > 0)
            {
                _wallFlash -= Time.deltaTime;
                _wall.color = Color.Lerp(_wallColor, new Color(1f, 0.55f, 0.5f), Mathf.Clamp01(_wallFlash / 0.12f));
            }
            else _wall.color = _wallColor;
        }

        float _slowT = -1f;
        const float SlowFloor = 0.3f, SlowHold = 0.32f, SlowBack = 0.4f;

        /// <summary>
        /// 剑气出手时的子弹时间：按真实时间压到 0.3 倍，停一下再缓回来。
        /// 模拟和特效一起放慢，伤害照旧和刃口同步，数值不受影响。
        /// </summary>
        float SlowMo()
        {
            if (_slowT < 0f) return 1f;
            if (!Paused && !Hud.Blocking) _slowT += Time.unscaledDeltaTime;
            if (_slowT < SlowHold) return SlowFloor;
            float k = (_slowT - SlowHold) / SlowBack;
            if (k >= 1f) { _slowT = -1f; return 1f; }
            return Mathf.Lerp(SlowFloor, 1f, Tween.InCubic(k));
        }

        void OnDestroy()
        {
            Time.timeScale = 1f;
            if (Hud) Destroy(Hud.gameObject);
        }

        // ---------------- 事件 ----------------

        void PlayEvents()
        {
            var fx = WorldFx.I;
            foreach (var e in B.Events)
            {
                var p = e.Pos.ToV();
                switch (e.Type)
                {
                    case Ev.Summon:
                    {
                        var sv = _slots[e.Slot];
                        sv.Sync(true);
                        var c = e.Value >= 2 ? Pal.Star[e.Value - 1] : Pal.Hex("B98CFF");
                        // 参考：召唤时格子上冲起一道紫色光柱，落地一圈光环。
                        fx.Rise(Art.Img("fx_pillar"), p + new Vector2(0, -0.45f), 1.9f, 0.6f, c, 9050, true, 0.35f);
                        fx.LightPool(p + new Vector2(0, -0.3f), 2.0f, c.A(0.8f), 0.5f, 159);
                        fx.GroundWave(p + new Vector2(0, -0.3f), 0.9f, c.A(0.9f), 0.4f, 159, 0.42f);
                        fx.Flash(p + new Vector2(0, 0.3f), 1.8f, c.A(0.45f), 0.25f);
                        fx.Sparks(Art.Img("fx_star"), p + new Vector2(0, 0.2f), 6, 0.28f, 2.6f, Color.white, 0.5f, 9100, 2f, true);
                        Tween.Punch(Drum, 0.2f, 0.12f);
                        Sfx.Play(Snd.Summon, 0.55f);
                        Hud.OnSummon();
                        break;
                    }
                    case Ev.Merge:
                    {
                        var sv = _slots[e.Slot];
                        sv.Sync(true);
                        var c = Pal.Star[e.Value - 1];
                        bool full = e.Value >= 4;
                        fx.Rise(Art.Img("fx_pillar"), p + new Vector2(0, -0.45f), full ? 3.2f : 2.3f, 0.7f, c, 9050, true, 0.35f);
                        fx.GroundWave(p + new Vector2(0, -0.3f), full ? 2.4f : 1.45f, c, 0.5f, 159, 0.42f);
                        fx.Ring(p + new Vector2(0, 0.6f), full ? 3.4f : 1.9f, c.A(0.85f), 0.42f, 9080);
                        fx.LightPool(p + new Vector2(0, -0.3f), full ? 3.2f : 2.4f, c.A(0.85f), 0.55f, 159);
                        fx.Sparks(Art.Img("fx_star"), p + new Vector2(0, 0.3f), full ? 14 : 8, 0.32f, 3.4f, Color.white, 0.6f, 9100, 2f, true);
                        Jolt(p + new Vector2(0, 1.2f), full ? 3.4f : 1.9f, full ? 1.5f : 0.9f, Vector2.up);
                        if (full) fx.Shake(0.12f, 0.25f);
                        fx.Say(p + new Vector2(0, 0.95f), StarText(e.Value), WorldFx.Tx.Buff, c, 1.3f);
                        var trait = StarTraits.At(Defs.Hero(e.Hero), e.Value);
                        if (trait != null) fx.Say(p + new Vector2(0, 1.55f), $"解锁「{trait.Name}」", WorldFx.Tx.Skill, Pal.Hex("FFC63A"), 0.85f);
                        Sfx.Play(Snd.Merge, 0.7f, 0.9f + e.Value * 0.06f);
                        LastMergeTime = Time.unscaledTime;
                        MergesDone++;
                        break;
                    }
                    case Ev.Move:
                        foreach (var s in _slots) s.Sync(false);
                        Sfx.Play(Snd.Card, 0.6f);
                        break;
                    case Ev.SlotAdded:
                    {
                        var sv = AddSlotView(B.Slots[e.Slot], true);
                        sv.Sync(false);
                        Sfx.Play(Snd.SlotAdd, 0.8f);
                        Hud.OnSlotAdded();
                        break;
                    }
                    case Ev.Fire:
                    {
                        var fs = Defs.Hero(e.Hero).Shot;
                        bool melee = fs == ShotKind.Punch || fs == ShotKind.Spear || fs == ShotKind.Slam;
                        _slots[e.Slot].Kick(p, melee ? 1.8f : 1f, melee ? 0.22f : 0f);
                    }
                        Muzzle(e);
                        if (_bowGap <= 0)
                        {
                            HeroSfx.Cast(Defs.Hero(e.Hero));
                            _bowGap = 0.05f;
                        }
                        break;
                    case Ev.Hit:
                        PlayHit(e, p);
                        break;
                    case Ev.Damage:
                        ShowDamage(e, p);
                        break;
                    case Ev.Kill:
                        OnKill(e, p);
                        break;
                    case Ev.WallHit:
                        _wallFlash = 0.12f;
                        if (e.Value >= 60) fx.Shake(0.06f, 0.15f);
                        if (e.Value > 0 && fx.LiveTexts < 30 && Random.value < 0.65f)
                            fx.Say(new Vector2(Mathf.Clamp(p.x, -4.1f, 4.1f) + Random.Range(-0.18f, 0.18f), -5.45f), "-" + Ui.Num(e.Value), WorldFx.Tx.Wall);
                        if (Random.value < 0.4f)
                        {
                            var wp = new Vector2(p.x + Random.Range(-0.2f, 0.2f), -4.55f);
                            fx.Burst(Art.Img("fx_hit"), wp + new Vector2(0, 0.25f), 0.55f, 0.14f, 9000, Pal.Hex("FFE0B0"), 0, 0.4f, true);
                            fx.Dust(wp, 0.8f, DustCol.A(0.6f), 0.5f, 8900);
                            if (e.Value >= 60) fx.Debris(wp, 2, 0.16f, 1.6f);
                        }
                        if (Random.value < 0.35f) Sfx.Play(Snd.WallHit, 0.35f);
                        Hud.OnWallHit();
                        break;
                    case Ev.Ult:
                        OnUlt(e, p);
                        break;
                    case Ev.Surge:
                    {
                        var c = Pal.Hex(Defs.Hero(e.Hero).Tint ?? "FFB040");
                        fx.Flash(p + new Vector2(0, 0.3f), 2.2f, c.A(0.7f), 0.25f);
                        fx.GroundWave(p + new Vector2(0, -0.3f), 1.1f, c, 0.4f, 159, 0.35f);
                        break;
                    }
                    case Ev.Buff:
                        OnBuff(e);
                        break;
                    case Ev.LordSkill:
                        OnLordSkill(e);
                        break;
                    case Ev.Rally:
                        Hud.Banner("流动红旗 · 村威", $"防线告急！全场外星军被震慑 {e.Radius:0.#} 秒", Pal.Hex("D89A1A"), "ic_flag", true);
                        fx.Ring(new Vector2(0, -4.5f), 9f, Pal.Gold, 0.8f);
                        fx.ScreenFlash(Pal.Hex("FFE2A0").A(0.3f), 0.35f);
                        fx.Shake(0.12f, 0.3f);
                        Sfx.Play(Snd.Drum, 0.9f);
                        break;
                    case Ev.WaveStart:
                        Hud.OnWave(e.Value);
                        foreach (var d in _doors) d?.Open(1.6f);
                        break;
                    case Ev.WaveClear:
                        Hud.OnWaveClear(e.Value);
                        break;
                    case Ev.BossComing:
                        Sfx.Play(Snd.Warn, 0.65f);
                        Sfx.PlayMusic(Bgm.Boss);
                        break;
                    case Ev.EliteComing:
                        Sfx.Play(Snd.Warn, 0.45f);
                        break;
                    case Ev.BossSkill:
                        OnBossSkill(e, p);
                        break;
                    case Ev.Explode when e.Value == 1:
                        // 爆裂箭：小团火光，不震屏，音效限频。
                        Explosion(p, e.Radius, 0.8f);
                        if (_hitSfxGap <= 0) { Sfx.Play(Snd.Bomb, 0.25f, 1.3f); _hitSfxGap = 0.08f; }
                        break;
                    case Ev.Explode:
                        Explosion(p, e.Radius, 1.3f);
                        fx.Shake(0.12f, 0.2f);
                        Sfx.Play(Snd.Bomb, 0.55f);
                        break;
                    case Ev.UnitStun:
                        fx.Say(p + new Vector2(0, 1.0f), "晕眩", WorldFx.Tx.Status, Pal.Hex("B8C8FF"));
                        fx.Sparks(Art.Img("fx_star"), p + new Vector2(0, 0.5f), 5, 0.22f, 2f, Color.white, 0.5f, 9450, 3f, true);
                        Sfx.Play(Snd.WallHit, 0.35f, 1.5f);
                        break;
                    case Ev.Coin:
                        if (e.Slot >= 0 && e.Slot < _slots.Count && e.Hero == HeroId.JiangJing)
                            _slots[e.Slot].Kick(p + new Vector2(0, 1.2f), 1.15f, 0.06f);
                        fx.Say(p + new Vector2(0, 1.0f), "+" + e.Value, WorldFx.Tx.Gain);
                        FlyCoin(p, e.Value);
                        break;
                    case Ev.Rage:
                        Hud.Rage();
                        Sfx.Play(Snd.Warn, 0.65f);
                        break;
                    case Ev.PorterKilled:
                        Hud.ChestDrop(p);
                        break;
                    case Ev.Treasure:
                        Hud.ChestDrop(p);
                        fx.Say(p + new Vector2(0, 1.4f), "飞碟盲盒", WorldFx.Tx.Skill, Pal.Hex("FFC63A"), 1.05f);
                        break;
                    case Ev.Heal:
                        fx.Say(new Vector2(p.x, -4.2f), "+" + e.Value, WorldFx.Tx.Heal);
                        fx.LightPool(new Vector2(p.x, -4.5f), 1.6f, Pal.Hex("7DE35A").A(0.5f), 0.4f);
                        Sfx.Play(Snd.Heal, 0.3f, 1.2f);
                        break;
                    case Ev.EnemyHeal:
                        fx.LightPool(p, e.Radius, Pal.Hex("7DE35A").A(0.4f), 0.5f);
                        fx.Ring(p + new Vector2(0, 0.3f), e.Radius, Pal.Hex("9CF07A"), 0.5f);
                        fx.Say(p + new Vector2(0, 1.6f), "纳米修复", WorldFx.Tx.Skill, Pal.Hex("7CE05A"), 0.75f);
                        Sfx.Play(Snd.Magic, 0.35f, 0.75f);
                        break;
                    case Ev.Guard:
                        fx.Say(p + new Vector2(0, 1.3f), e.Value > 0 ? "偏折" : "晶片碎", WorldFx.Tx.Status, Pal.Hex("E8D8A0"));
                        if (e.Value == 0) fx.Debris(p + new Vector2(0, 0.4f), 5, 0.2f, 2f);
                        if (e.Value == 0) Sfx.Play(Snd.WallHit, 0.5f, 1.2f);
                        else Sfx.Play(Snd.Hammer, 0.3f, 1.4f);
                        break;
                    case Ev.Blink:
                        fx.Smoke(p + new Vector2(0, 0.4f), 3, 0.5f, new Color(0.45f, 0.45f, 0.5f, 0.6f), 0.4f, 0.1f, 0.3f, 9150);
                        fx.Say(p + new Vector2(0, 1.3f), "闪现", WorldFx.Tx.Status, Pal.Hex("C8D0DA"));
                        Sfx.Play(Snd.Dart, 0.35f, 1.3f);
                        break;
                    case Ev.Berserk:
                        fx.Say(p + new Vector2(0, 1.4f), "红温过载", WorldFx.Tx.Skill, Pal.Hex("FF5040"), 0.9f);
                        fx.Ring(p + new Vector2(0, 0.5f), 1.1f, Pal.Hex("FF5040"), 0.4f);
                        Sfx.Play(Snd.Warn, 0.3f, 1.5f);
                        break;
                    case Ev.StarPick:
                        fx.Rise(Art.Img("fx_pillar"), p + new Vector2(0, -0.45f), 3.2f, 1f, Pal.Gold, 9050, true, 0.5f);
                        fx.Sparks(Art.Img("fx_star"), p + new Vector2(0, 0.6f), 10, 0.3f, 3f, Pal.Gold, 0.7f, 9450, 5f, true);
                        Sfx.Play(Snd.Reveal, 0.6f);
                        break;
                    case Ev.PorterEscaped:
                        Ui.Toast("外星样本箱溜走了", 300);
                        Sfx.Play(Snd.Deny, 0.6f);
                        break;
                    case Ev.Enhance:
                        Sfx.Play(Snd.Merge, 0.5f, 1.2f);
                        break;
                    case Ev.Awaken:
                    {
                        var hd = Defs.Hero(e.Hero);
                        fx.Rise(Art.Img("fx_pillar"), p + new Vector2(0, -0.45f), 2.8f, 0.9f, Pal.Gold, 9050, true, 0.45f);
                        fx.Sparks(Art.Img("fx_star"), p + new Vector2(0, 0.6f), 8, 0.26f, 2.8f, Pal.Gold, 0.65f, 9450, 5f, true);
                        Sfx.Play(Snd.Reveal, 0.7f);
                        string sub = hd.Buff.HasValue
                            ? "三词条奥义觉醒！技能效果 +40% · 攻速 +20%"
                            : "三词条奥义觉醒！终伤 +45% · 攻速 +20% · 每3轮迸发弹幕";
                        Hud.Banner($"{hd.Name} · {Defs.AwakenName(e.Hero)}", sub, Pal.Gold, hd.Art, true);
                        break;
                    }
                    case Ev.Revive:
                        fx.Ring(new Vector2(0, -4.5f), 6f, Pal.Gold, 0.7f);
                        fx.Shake(0.15f, 0.3f);
                        _wallColor = WallTint;
                        Sfx.Play(Snd.UltBomb, 0.8f);
                        break;
                    case Ev.Defeat:
                        _wallColor = new Color(0.55f, 0.5f, 0.5f);
                        fx.Shake(0.3f, 0.6f);
                        for (int i = 0; i < 6; i++)
                            fx.Burst(Art.Img("fx_explode"), new Vector2(Random.Range(-4.5f, 4.5f), Random.Range(-5.8f, -4.6f)), Random.Range(1.4f, 2.2f), 0.6f, 9500);
                        Sfx.Play(Snd.UltBomb);
                        break;
                    case Ev.Victory:
                        foreach (var s in _slots) s.Cheer();
                        break;
                }
            }
            B.Events.Clear();
        }

        /// <summary>出手瞬间在英雄身上的小闪光，让攻击有“发力点”。</summary>
        void Muzzle(BattleEvent e)
        {
            var fx = WorldFx.I;
            var sp = B.Slots[e.Slot].Pos.ToV();
            var dir = (e.Pos.ToV() - sp).normalized;
            var hand = sp + new Vector2(0, 0.25f) + dir * 0.32f;
            var d = Defs.Hero(e.Hero);
            var tint = d.Tint != null ? Pal.Hex(d.Tint) : Color.white;
            switch (d.Shot)
            {
                case ShotKind.Arrow:
                    break;
                case ShotKind.Bomb:
                case ShotKind.Fireball:
                    fx.Flash(hand, 0.55f, (d.Tint != null ? tint : Fire).A(0.45f), 0.1f);
                    break;
                case ShotKind.Lightning:
                    fx.Flash(sp + new Vector2(0, 0.6f), 0.95f, Pal.Hex("7FC4FF").A(0.5f), 0.2f);
                    fx.Burst(Art.Sparkle, sp + new Vector2(0, 0.75f), 1.0f, 0.28f, 9450, Pal.Hex("8FD4FF"), 90f, 0.3f, true);
                    break;
                case ShotKind.Stone:
                    if (!d.Physical) fx.Burst(Art.Sparkle, hand, 0.55f, 0.14f, 9450, tint, 60f, 0.3f, true);
                    break;
                case ShotKind.Spear:
                case ShotKind.Punch:
                case ShotKind.Slam:
                    // 物理出手：脚下踏起一缕实尘，手上一枚小星闪当发力点，不用大团光效糊住兵刃本体。
                    fx.Dust(sp + new Vector2(0, -0.32f), 0.65f, DustCol.A(0.35f), 0.3f, 158);
                    fx.Glint(hand + new Vector2(0, 0.1f), 1.0f, Pal.Hex("E8FCFF"), 0.16f, 9460);
                    break;
                case ShotKind.Wind:
                    if (!d.Physical) fx.Flash(sp + new Vector2(0, 0.6f), 0.85f, (d.Tint != null ? tint : Pal.Hex("8FF0D0")).A(0.45f), 0.2f);
                    break;
                case ShotKind.Beam:
                    fx.Flash(hand, 0.9f, tint.A(0.55f), 0.22f);
                    break;
            }
            if (d.Kind == Sim.Role.Mage || d.Chan > 0)
            {
                var c = d.Tint != null ? tint : d.Shot == ShotKind.Lightning ? Pal.Hex("8FD4FF") : Pal.Hex("B8A0FF");
                float hold = d.Chan > 0 ? d.Chan + 0.3f : 0.9f;
                fx.Rune(sp + new Vector2(0, -0.3f), 1.9f, c.A(0.85f), hold, 70f, 158, 0.42f);
                fx.LightPool(sp + new Vector2(0, -0.3f), 2.2f, c.A(0.55f), hold, 159);
                fx.GroundWave(sp + new Vector2(0, -0.3f), 1.3f, c, 0.5f, 159, 0.4f);
                fx.Flash(sp + new Vector2(0, 0.75f), 1.0f, c.A(0.5f), 0.28f);
                fx.Sparks(Art.Img("fx_star"), sp + new Vector2(0, 0.6f), 4, 0.16f, 1.4f, c, 0.5f, 9460, -1.5f, true);
            }
        }

        static string StarText(int star) => star >= 4 ? "满星!" : new string('★', star);

        void PlayHit(BattleEvent e, Vector2 p)
        {
            var fx = WorldFx.I;
            switch (e.Shot)
            {
                case ShotKind.Qi:
                    fx.Burst(Art.Sparkle, p + new Vector2(0, 0.5f), 1.0f, 0.2f, 9500, Pal.Hex("FFE8B8"), 90f, 0.35f, true);
                    fx.Glint(p + new Vector2(0, 0.5f), e.Crit ? 1.2f : 0.85f, Pal.Hex("FFF2C8"), 0.14f, 9516);
                    fx.SparkStreaks(p + new Vector2(0, 0.45f), 3, 0.26f, 3.6f, Pal.Hex("FFE29A"), 0.2f, 9515, 4f);
                    Jolt(p, 0.48f, e.Crit ? 0.65f : 0.40f, Away(p));
                    return;
                case ShotKind.Slash:
                {
                    // 剑气刃口横着划过敌人：斩痕垂直于飞行方向，碎光顺着剑气往前溅
                    var body = p + new Vector2(0, 0.45f);
                    var fly = body - Layout.LordOrigin.ToV();
                    fly = fly.sqrMagnitude < 1e-4f ? Vector2.up : fly.normalized;
                    float cut = Mathf.Atan2(fly.y, fly.x) * Mathf.Rad2Deg + 90f + Random.Range(-12f, 12f);
                    fx.CutLine(body, cut, e.Crit ? 1.9f : 1.45f, WorldFx.QiCyan, 0.22f, e.Crit ? 0.12f : 0.09f, 9560);
                    fx.Flash(body, e.Crit ? 1.9f : 1.4f, WorldFx.QiCyan.A(0.6f), 0.16f, 9555);
                    fx.Burst(Art.Sparkle, body, e.Crit ? 1.3f : 0.9f, 0.18f, 9561, WorldFx.QiIce, 90f, 0.4f, true);
                    fx.Glint(body, e.Crit ? 1.7f : 1.25f, Pal.Hex("E8FFFF"), 0.16f, 9563);
                    fx.SparkStreaks(body + fly * 0.2f, e.Crit ? 8 : 5, 0.4f, 5.6f, WorldFx.QiIce, 0.24f, 9562, 3f, fly, 50f);
                    Jolt(p, 0.65f, e.Crit ? 1.15f : 0.82f, fly);
                    if (_hitSfxGap <= 0) { Sfx.Play(Snd.ArrowHit, 0.3f, 0.8f); _hitSfxGap = 0.05f; }
                    return;
                }
                case ShotKind.Arrow:
                {
                    // 强化箭矢物理破甲打击感与穿透光束（仅作用于受击目标自身，绝不按范围把旁边无关小怪震红！）
                    var hp = p + new Vector2(0, 0.42f);
                    var rawDir = p - e.From.ToV();
                    var flyDir = rawDir.sqrMagnitude > 0.001f ? rawDir.normalized : Vector2.up;
                    float deg = Mathf.Atan2(flyDir.y, flyDir.x) * Mathf.Rad2Deg;

                    if (e.Value > 0)
                    {
                        // 穿透命中身后第 k 个目标：爆开锐利冰青破空贯通气环与顺向迸射火花！
                        fx.CutLine(hp, deg, e.Crit ? 1.65f : 1.32f, Pal.Hex("62EEFF"), 0.18f, 0.085f, 9535);
                        fx.Ring(hp, e.Crit ? 0.92f : 0.72f, Pal.Hex("72F2FF"), 0.22f, 9532);
                        fx.Glint(hp, e.Crit ? 1.3f : 1.0f, Pal.Hex("D8FCFF"), 0.15f, 9537);
                        fx.SparkStreaks(hp + flyDir * 0.18f, e.Crit ? 6 : 4, 0.34f, 5f, Pal.Hex("BFF8FF"), 0.22f, 9536, 4f, flyDir, 35f);
                    }
                    else
                    {
                        // 终末落点：若有穿透（e.Value < 0），在整条射线上拉出一瞬破风贯通气痕；单点箭（e.Value == 0）则在敌身爆出扎实穿甲铁花与插地残箭！
                        if (e.Value < 0)
                        {
                            var startP = e.From.ToV() + new Vector2(0, 0.42f) + flyDir * 0.6f;
                            fx.Streak(startP, hp + flyDir * 0.35f, Pal.Hex("5CE8FF").A(0.78f), e.Crit ? 0.20f : 0.14f, 0.16f, 9528);
                        }
                        Color impCol = e.Crit ? Pal.Hex("FFE27A") : Pal.Hex("B8F0FF");
                        fx.CutLine(hp, deg, e.Crit ? 1.55f : 1.18f, impCol, 0.16f, e.Crit ? 0.09f : 0.065f, 9535);
                        fx.Glint(hp, e.Crit ? 1.4f : 1.05f, e.Crit ? Pal.Hex("FFF0B0") : Color.white, 0.15f, 9537);
                        fx.SparkStreaks(hp + flyDir * 0.15f, e.Crit ? 6 : 4, 0.32f, 4.8f, Pal.Hex("FFF2C8"), 0.22f, 9536, 6f, flyDir, 45f);
                        if (e.Crit) fx.Shards(Art.Img("fx_shard_steel"), hp, 4, 0.48f, 3.6f, Pal.Hex("FFE7A0"), 0.36f, 9538, flyDir, 50f, 8f);
                        if (e.Value == 0 && Random.value < 0.55f)
                            fx.Linger(Art.Img("fx_arrow_stuck"), p + new Vector2(Random.Range(-0.12f, 0.12f), -0.05f), 0.78f, 1.35f, flyDir.x < 0f);
                    }
                    HitSfx(e, 0.05f);
                    break;
                }
                case ShotKind.Beam:
                {
                    var c = Pal.Hex(Defs.Hero(e.Hero).Tint ?? "FF8A2A");
                    fx.Burst(Art.Sparkle, p + new Vector2(Random.Range(-0.12f, 0.12f), 0.4f), e.Crit ? 0.95f : 0.62f, 0.16f, 9500, c, 60f, 0.3f, true);
                    if (Random.value < 0.5f) fx.SparkStreaks(p + new Vector2(0, 0.35f), 3, 0.3f, 4f, Color.Lerp(c, Color.white, 0.4f), 0.24f, 9520, 6f);
                    if (e.Crit) fx.Glint(p + new Vector2(0, 0.4f), 1.2f, Color.Lerp(c, Color.white, 0.6f), 0.15f, 9521);
                    Jolt(p, 0.32f, e.Crit ? 0.50f : 0.28f, Away(p));
                    HitSfx(e, 0.18f);
                    break;
                }
                case ShotKind.Bomb:
                    Explosion(p, e.Radius, 1f);
                    Jolt(p, e.Radius, 1.2f);
                    fx.Shake(0.06f, 0.12f);
                    HeroSfx.Hit(Defs.Hero(e.Hero), false);
                    break;
                case ShotKind.MiniBomb:
                    Explosion(p, 0.55f, 0.55f);
                    Jolt(p, 0.6f, 0.65f);
                    HitSfx(e, 0.08f);
                    break;
                case ShotKind.Lightning:
                    fx.Strike(p, e.Crit ? 3.4f : 1.5f, e.Crit ? 9650 : 9600);
                    fx.Glint(p + new Vector2(0, 0.35f), e.Crit ? 2.0f : 1.3f, Pal.Hex("E4F4FF"), 0.16f, 9612);
                    fx.SparkStreaks(p + new Vector2(0, 0.25f), e.Crit ? 9 : 5, 0.42f, 6f, Pal.Hex("B8E2FF"), 0.22f, 9610, 5f);
                    if (B.SlowOf(e.Hero) > 0)
                    {
                        fx.Rise(Art.Img("fx_icecrystal"), p + new Vector2(Random.Range(-0.1f, 0.1f), -0.15f), e.Crit ? 1.6f : 1.0f, 0.8f, Color.white, WorldFx.Order(p.y - 0.2f), true, 0.45f);
                        fx.Decal(Art.Img("fx_scorch"), p, e.Crit ? 1.8f : 1.2f, Pal.Hex("BFE6FF").A(0.55f), 1.8f, 0.5f, 92);
                        fx.LightPool(p, e.Crit ? 2.6f : 1.8f, Pal.Hex("6FC8FF").A(0.7f), 0.6f);
                    }
                    if (e.Crit) { fx.Shake(0.12f, 0.2f); fx.GroundWave(p, 1.2f, Pal.Hex("9AD4FF").A(0.8f), 0.4f); }
                    Jolt(p, 0.3f, e.Crit ? 0.8f : 0.45f, Away(p));
                    HitSfx(e, 0.05f);
                    break;
                case ShotKind.Punch when Defs.Hero(e.Hero).Proj != null:
                {
                    // 物理兵刃命中：干脆利落的一道寒铁切线 + 零星钢屑火点 + 扎实受击顿帧击退，不堆光雾。
                    var hp = p + new Vector2(0, 0.45f);
                    string pj = Defs.Hero(e.Hero).Proj;
                    bool axe = pj == "wp_axe";
                    bool fist = pj == "wp_ironfist";
                    if (fist)
                    {
                        fx.Dust(p, e.Radius * 1.45f, DustCol.A(0.48f), 0.42f);
                        if (e.Crit) fx.Debris(p, 3, 0.2f, 2.1f);
                        Jolt(p, e.Radius * 0.8f, e.Crit ? 1.8f : 1.35f, Away(p));
                        fx.Shake(e.Crit ? 0.07f : 0.03f, 0.1f);
                        HeroSfx.Hit(Defs.Hero(e.Hero), false);
                        break;
                    }
                    // 飞斧/飞刀命中：风壳“啪”地撑破，白钢十字斩口一闪，钢屑和暖色铁花顺着冲势往外崩，斧头斜插进地里留一会儿。
                    float tilt = Random.Range(-36f, 36f);
                    float big = e.Crit ? 1.25f : 1f;
                    var up = Away(p).normalized;
                    var steel = Pal.Hex("EAF6FF");
                    var ember = Pal.Hex("FFD27A");
                    fx.Burst(Art.Img("fx_wind_shell"), hp, (axe ? 1.7f : 1.5f) * big, 0.18f, 9518, Color.white.A(0.8f), 0, 0.8f);
                    fx.CutLine(hp, tilt, (axe ? 1.5f : 1.6f) * big, steel, 0.2f, e.Crit ? 0.12f : 0.095f, 9558);
                    fx.CutLine(hp, tilt + (axe ? 74f : 96f), (axe ? 1.0f : 1.15f) * big, Pal.Hex("BFE4FF"), 0.16f, 0.07f, 9557);
                    fx.Flash(hp, 1.2f * big, Pal.Hex("FFF4D8").A(0.55f), 0.12f, 9554);
                    fx.Glint(hp, 1.8f * big, Color.white, 0.2f, 9560);
                    fx.Shards(Art.Img("fx_shard_steel"), hp, e.Crit ? 7 : 4, 0.55f * big, 4.2f * big, Pal.Hex("F2F6FA"), 0.42f, 9550, up, 75f, 10f);
                    fx.SparkStreaks(hp, e.Crit ? 9 : 6, 0.42f, 6.2f, ember, 0.26f, 9548, 9f, up, 85f);
                    fx.SparkStreaks(hp, e.Crit ? 4 : 2, 0.55f, 7.5f, Color.white, 0.18f, 9549, 4f, up, 30f);
                    if (axe || e.Crit)
                    {
                        fx.Decal(Art.Img("fx_crack"), p, e.Crit ? 1.15f : 0.82f, new Color(0.12f, 0.09f, 0.07f, 0.5f), 1.1f, 0.5f, 91);
                        fx.Decal(Art.Img("fx_scorch"), p, e.Crit ? 1.2f : 0.9f, Pal.Hex("1A3A5A").A(0.35f), 1.3f, 0.5f, 92);
                        fx.Dust(p, 1.0f, DustCol.A(0.42f), 0.4f);
                    }
                    if (axe)
                    {
                        float lean = Random.Range(18f, 34f) * (Random.value < 0.5f ? 1f : -1f);
                        fx.Linger(Art.Img("wp_axe"), p + new Vector2(Random.Range(-0.15f, 0.15f), -0.12f), 0.92f, 1.2f, lean > 0, lean, true);
                    }
                    Jolt(p, e.Radius * 0.6f, (axe ? 1.35f : 1.05f) * (e.Crit ? 1.45f : 1f), Away(p));
                    if (e.Crit || axe) fx.Shake(e.Crit ? 0.06f : 0.025f, 0.09f);
                    HitSfx(e, 0.06f);
                    break;
                }
                case ShotKind.Punch:
                    fx.Dust(p, e.Radius * 1.7f, DustCol.A(0.45f), 0.45f);
                    Jolt(p, e.Radius, e.Crit ? 1.85f : 1.35f, Away(p));
                    fx.Shake(e.Crit ? 0.07f : 0.03f, 0.1f);
                    if (e.Crit)
                    {
                        fx.Decal(Art.Img("fx_crack"), p, e.Radius * 1.4f, new Color(0.12f, 0.09f, 0.07f, 0.58f), 2.0f, 0.5f, 91);
                        fx.Debris(p, 4, 0.22f, 2.2f);
                    }
                    HeroSfx.Hit(Defs.Hero(e.Hero), false);
                    break;
                case ShotKind.Slam:
                    // 偃月重刀、水磨禅杖重砸落地：真实碎石崩裂 + 地裂印记 + 贴地气浪，不糊整团光效。
                    fx.Decal(Art.Img("fx_crack"), p, e.Radius * (e.Crit ? 1.9f : 1.35f), new Color(0.12f, 0.09f, 0.07f, 0.62f), e.Crit ? 2.2f : 1.3f, 0.5f, 91);
                    fx.Dust(p, e.Radius * 2.0f, DustCol.A(0.58f), 0.55f);
                    fx.Debris(p, e.Crit ? 6 : 3, 0.22f, 2.4f);
                    Jolt(p, e.Radius, e.Crit ? 2.0f : 1.5f);
                    fx.Shake(e.Crit ? 0.11f : 0.05f, e.Crit ? 0.18f : 0.11f);
                    HeroSfx.Hit(Defs.Hero(e.Hero), false);
                    break;
                case ShotKind.Spear:
                {
                    // 一枪捅穿：利落细白破空寒芒贯穿整列，受击整列后仰顿帧。
                    var hp = p + new Vector2(0, 0.45f);
                    var dir = Away(p).normalized;
                    fx.Streak(hp - dir * 0.25f, hp + dir * 2.3f, Color.white.A(0.92f), e.Crit ? 0.22f : 0.15f, 0.15f, 9521);
                    fx.Glint(hp, e.Crit ? 1.5f : 1.1f, Color.white, 0.16f, 9537);
                    fx.SparkStreaks(hp + dir * 0.35f, e.Crit ? 6 : 4, 0.36f, 5f, Pal.Hex("FFF2CC"), 0.22f, 9520, 6f, dir, 40f);
                    fx.Shards(Art.Img("fx_shard_steel"), hp, e.Crit ? 5 : 3, 0.45f, 3.8f, Pal.Hex("F2F6FA"), 0.38f, 9550, dir, 55f, 9f);
                    if (B.SlowOf(e.Hero) > 0) fx.Decal(Art.Img("fx_scorch"), p, 0.9f, Pal.Hex("BFE6FF").A(0.45f), 1.2f, 0.5f, 92);
                    Jolt(p + new Vector2(0, 1f), 1.3f, e.Crit ? 1.5f : 1.15f, dir);
                    if (e.Crit) fx.Shake(0.05f, 0.09f);
                    HitSfx(e, 0.06f);
                    break;
                }
                case ShotKind.Stone when Defs.Hero(e.Hero).Kind == Sim.Role.Mage:
                {
                    // 金砖镇魔：砸地一圈金色冲击，金光往上冒，碎金星溅开。
                    var gold = Pal.Hex(Defs.Hero(e.Hero).Tint ?? "FFD24A");
                    float big = e.Crit ? 1.4f : 1f;
                    fx.Burst(Art.Img("fx_hit"), p + new Vector2(0, 0.35f), 1.1f * big, 0.2f, 9510, gold, 0, 0.4f, true);
                    fx.GroundWave(p, 0.9f * big, gold.A(0.9f), 0.4f);
                    fx.LightPool(p, 2.0f * big, gold.A(0.7f), 0.45f);
                    fx.Rise(Art.Img("fx_pillar"), p + new Vector2(0, -0.2f), 1.4f * big, 0.45f, gold, WorldFx.Order(p.y - 0.2f), true, 0.3f);
                    fx.Sparks(Art.Img("fx_star"), p + new Vector2(0, 0.4f), e.Crit ? 6 : 3, 0.18f, 2.6f, gold, 0.45f, 9520, 5f, true);
                    fx.Glint(p + new Vector2(0, 0.45f), 1.6f * big, Pal.Hex("FFF6D0"), 0.18f, 9522);
                    fx.SparkStreaks(p + new Vector2(0, 0.3f), e.Crit ? 8 : 5, 0.4f, 5.5f, Pal.Hex("FFE08A"), 0.26f, 9521, 9f, Vector2.up, 120f);
                    fx.Dust(p, 1.2f * big, DustCol.A(0.4f), 0.45f);
                    Jolt(p, 0.5f, e.Crit ? 1.4f : 0.9f, Vector2.down * 0.4f + Away(p) * 0.2f);
                    if (e.Crit) fx.Shake(0.08f, 0.14f);
                    HitSfx(e, 0.1f);
                    break;
                }
                case ShotKind.Stone:
                    fx.Burst(Art.Img("fx_hit"), p + new Vector2(0, 0.45f), e.Crit ? 1.15f : 0.72f, 0.16f, 9510, Pal.Hex("EDE4D2"), 0, 0.4f, true);
                    fx.Sparks(Art.Img("fx_rock2"), p + new Vector2(0, 0.4f), e.Crit ? 4 : 2, 0.12f, 2.4f, Color.white, 0.4f, 9520, 7f);
                    fx.SparkStreaks(p + new Vector2(0, 0.42f), e.Crit ? 5 : 3, 0.28f, 4.2f, Pal.Hex("FFF0D0"), 0.2f, 9521, 8f, Away(p), 90f);
                    Jolt(p, 0.38f, e.Crit ? 0.95f : 0.58f, Away(p));
                    HitSfx(e, 0.05f);
                    break;
                case ShotKind.Wind:
                    if (e.Hero == HeroId.ZhuWu) fx.Rune(p, e.Radius * 2.2f, Pal.Hex("7FB4FF").A(0.9f), 1.1f, -90f, 97);
                    fx.Burst(Art.Img("fx_wave"), p + new Vector2(0, 0.3f), e.Radius * 1.8f, 0.4f, 9480, Pal.Hex("9FF5D8").A(0.85f), 300f, 0.4f, true);
                    fx.GroundWave(p, e.Radius, Pal.Hex("B8FFE6").A(0.6f), 0.35f);
                    fx.SparkStreaks(p + new Vector2(0, 0.3f), 6, 0.5f, 4.5f, Pal.Hex("D8FFF0"), 0.3f, 9482, 0f);
                    if (e.Crit) fx.Smoke(p + new Vector2(0, 0.3f), 3, 1.0f, Pal.Hex("CFFFF0").A(0.4f), 0.8f, 1.2f, 0.5f);
                    Jolt(p, e.Radius, 0.4f);
                    HitSfx(e, 0.2f);
                    break;
                case ShotKind.Frost:
                    for (int i = 0; i < 9; i++)
                    {
                        var ip = p + Random.insideUnitCircle * e.Radius * 0.9f;
                        fx.Rise(Art.Img("fx_icecrystal"), ip, Random.Range(0.9f, 1.6f), 1.4f, Color.white, WorldFx.Order(ip.y), true, 0.6f);
                    }
                    fx.Shards(Art.Img("fx_shard_ice"), p + new Vector2(0, 0.3f), 10, 0.7f, 5f, Color.white, 0.55f, 9550, Vector2.up, 150f, 9f);
                    fx.Glint(p + new Vector2(0, 0.5f), 2.6f, Pal.Hex("EAF8FF"), 0.24f, 9560);
                    fx.Decal(Art.Img("fx_scorch"), p, e.Radius * 2.2f, Pal.Hex("CFEFFF").A(0.7f), 3f, 0.5f, 92);
                    fx.LightPool(p, e.Radius * 3f, Pal.Hex("8FD8FF").A(0.8f), 0.8f);
                    fx.ScreenFlash(Pal.Hex("D8F0FF").A(0.3f), 0.3f);
                    fx.Shake(0.15f, 0.3f);
                    Sfx.Play(Snd.UltThunder, 0.6f, 1.3f);
                    break;
                case ShotKind.Fireball:
                    Explosion(p, e.Radius, e.Crit ? 1.5f : 0.9f);
                    fx.Burst(Art.Img("fx_fireball"), p + new Vector2(0, 0.35f), e.Radius * 1.4f, 0.3f, 9510, null, 0, 0.3f, true);
                    fx.Decal(Art.Img("fx_scorch"), p, e.Radius * 1.2f, ScorchCol.A(0.45f), 1.4f);
                    Jolt(p, e.Radius, e.Crit ? 1.3f : 0.9f);
                    if (e.Crit) fx.Shake(0.1f, 0.16f);
                    HitSfx(e, 0.06f);
                    break;
                case ShotKind.Lasso:
                    fx.Burst(Art.Img("fx_hit"), p + new Vector2(0, 0.45f), 0.8f, 0.18f, 9510, Pal.Hex("FF8A8A"), 0, 0.4f, true);
                    fx.Ring(p + new Vector2(0, 0.3f), 0.9f, Pal.Hex("E04848"), 0.35f);
                    fx.Glint(p + new Vector2(0, 0.45f), 1.0f, Pal.Hex("FFD8D0"), 0.15f, 9512);
                    Jolt(p, 0.3f, 0.6f, Vector2.down);
                    HitSfx(e, 0.06f);
                    break;
                case ShotKind.Hammer:
                    fx.Burst(Art.Img("fx_hit"), p + new Vector2(0, 0.4f), 1.4f, 0.25f, 9510, Pal.Hex("FFD0A0"), 0, 0.4f, true);
                    fx.Debris(p, 4, 0.2f, 2.4f);
                    fx.Glint(p + new Vector2(0, 0.4f), 2.0f, Pal.Hex("FFF0D8"), 0.2f, 9512);
                    fx.SparkStreaks(p + new Vector2(0, 0.3f), 8, 0.45f, 6f, Pal.Hex("FFD27A"), 0.3f, 9511, 10f, Vector2.up, 140f);
                    fx.Shake(0.12f, 0.2f);
                    Sfx.Play(Snd.WallHit, 0.7f, 0.8f);
                    break;
            }
        }

        /// <summary>
        /// p 附近 r 内的敌人吃一下顿帧和击退。dir 不给就从 p 往外推（爆炸、砸地）；
        /// 好汉都在寨墙上往上打，单体命中一律往城门方向推。
        /// </summary>
        void Jolt(Vector2 p, float r, float pow, Vector2? dir = null)
        {
            foreach (var kv in _enemies)
            {
                var e = kv.Key;
                if (e.Dead) continue;
                var d = e.Pos.ToV() - p;
                float rr = r + e.Def.Size * 0.3f;
                if (d.sqrMagnitude > rr * rr) continue;
                kv.Value.Jolt(dir ?? (d.sqrMagnitude > 0.01f ? d : Vector2.up), pow);
            }
        }

        static Vector2 Away(Vector2 p) => new Vector2(p.x * 0.12f, 1f);

        /// <summary>连发、持续伤害一帧会来好几下，按间隔只响一声。</summary>
        void HitSfx(BattleEvent e, float gap)
        {
            if (_hitSfxGap > 0) return;
            HeroSfx.Hit(Defs.Hero(e.Hero), e.Crit);
            _hitSfxGap = gap;
        }

        void OnBossSkill(BattleEvent e, Vector2 p)
        {
            var fx = WorldFx.I;
            var top = p + new Vector2(0, 3.2f);
            switch ((BossSkill)e.Value)
            {
                case BossSkill.Hammer:
                    fx.Say(top, "电磁飞锤", WorldFx.Tx.Skill, Pal.Hex("FFB070"), 0.96f);
                    Sfx.Play(Snd.Whip, 0.5f, 0.7f);
                    Sfx.Play(Snd.Warn, 0.3f);
                    break;
                case BossSkill.Charge:
                    fx.Say(top, "超光速突袭", WorldFx.Tx.Skill, Pal.Hex("FF8A6A"), 1.04f);
                    fx.Dust(p, 3f, DustCol.A(0.7f), 0.8f, 95);
                    fx.GroundWave(p, 2.2f, Pal.Hex("FFC8A0").A(0.7f), 0.4f);
                    Sfx.Play(Snd.Horse, 0.7f, 0.85f);
                    Sfx.Play(Snd.Warn, 0.3f);
                    break;
                case BossSkill.Summon:
                {
                    bool water = B.Enemies.Find(x => x.Id == e.EnemyId)?.Def.Kind == EnemyKind.HeTao;
                    fx.Say(top, water ? "潜行怪出舱" : "飞艇编队折跃", WorldFx.Tx.Skill, Pal.Hex(water ? "8FD0FF" : "FFB070"), 0.92f);
                    if (water) fx.GroundWave(p, 2.6f, Pal.Hex("8FD0FF").A(0.7f), 0.5f);
                    else fx.Dust(p + new Vector2(0, 0.6f), 4f, DustCol.A(0.8f), 0.8f, 95);
                    Sfx.Play(water ? Snd.Water : Snd.Horse, 0.6f, water ? 0.8f : 1f);
                    Sfx.Play(Snd.Warn, 0.35f);
                    break;
                }
                case BossSkill.Drum:
                    fx.Say(top, "声波加速", WorldFx.Tx.Skill, Pal.Hex("FFC070"), 0.96f);
                    fx.GroundWave(p, e.Radius, Pal.Hex("FFC070").A(0.6f), 0.6f);
                    fx.Ring(p + new Vector2(0, 0.8f), 1.6f, Pal.Hex("FFC070"), 0.4f);
                    Sfx.Play(Snd.Drum, 0.7f, 0.9f);
                    break;
                case BossSkill.Leap:
                    fx.Say(top, "星兽猛扑", WorldFx.Tx.Skill, Pal.Hex("FF9A4A"), 1.00f);
                    fx.Dust(p, 3.2f, DustCol.A(0.8f), 0.8f, 95);
                    fx.GroundWave(p, 2.4f, Pal.Hex("FFC8A0").A(0.7f), 0.4f);
                    fx.Shake(0.12f, 0.2f);
                    Sfx.Play(Snd.UltFist, 0.6f, 1.1f);
                    break;
                case BossSkill.Ram:
                    fx.Say(top, "巨钻撞墙", WorldFx.Tx.Skill, Pal.Hex("FF8A6A"), 1.04f);
                    fx.Debris(p + new Vector2(0, -0.6f), 8, 0.3f, 3f);
                    fx.Shake(0.25f, 0.35f);
                    Sfx.Play(Snd.WallHit, 0.9f, 0.7f);
                    break;
                case BossSkill.Volley:
                    fx.Say(top, "母舰齐射", WorldFx.Tx.Skill, Pal.Hex("FFB070"), 0.96f);
                    Sfx.Play(Snd.Bow, 0.6f, 0.8f);
                    Sfx.Play(Snd.Warn, 0.3f);
                    break;
                case BossSkill.Ball:
                    fx.Say(top, "行星抽射", WorldFx.Tx.Skill, Pal.Hex("FFB070"), 0.96f);
                    Sfx.Play(Snd.Bomb, 0.4f, 1.3f);
                    break;
                case BossSkill.Shield:
                    bool coin = B.Enemies.Find(x => x.Id == e.EnemyId)?.Def.Kind == EnemyKind.ZhuChaofeng;
                    fx.Say(top, coin ? "星币充能" : "氪金护盾", WorldFx.Tx.Skill, Pal.Hex("FFC63A"), 1.00f);
                    if (coin) fx.Sparks(Art.Coin, p + new Vector2(0, 1.4f), 10, 0.3f, 3f, Color.white, 0.8f, 9450, 5f, true);
                    fx.Ring(p + new Vector2(0, 1.2f), 2.4f, Pal.Gold, 0.6f);
                    fx.Flash(p + new Vector2(0, 1.2f), 4f, Pal.Gold.A(0.5f), 0.3f);
                    Sfx.Play(Snd.Jackpot, 0.4f);
                    break;
            }
        }

        static readonly Color Fire = new Color(1f, 0.55f, 0.18f);
        static readonly Color SmokeCol = new Color(0.3f, 0.27f, 0.25f, 0.8f);
        static readonly Color ScorchCol = new Color(0.07f, 0.05f, 0.04f, 0.6f);
        static readonly Color DustCol = new Color(0.86f, 0.78f, 0.64f, 1f);

        /// <summary>炸弹爆炸：火球（叠加）+ 火焰 + 地面受光 + 冲击波 + 焦痕 + 烟 + 碎石。scale 1 = 普通炸弹。</summary>
        void Explosion(Vector2 p, float radius, float scale)
        {
            var fx = WorldFx.I;
            float r = radius;
            fx.Flash(p + new Vector2(0, 0.4f * scale), r * 3.2f, Pal.Hex("FFC070").A(0.55f), 0.2f);
            fx.Burst(Art.Img("fx_fireball"), p + new Vector2(0, 0.45f * scale), r * 2.3f, 0.36f + 0.1f * scale, 9520, null, 0, 0.25f, true);
            fx.Burst(Art.Img("fx_explode"), p + new Vector2(0, 0.35f * scale), r * 2.0f, 0.42f + 0.1f * scale, 9500);
            fx.LightPool(p, r * 3.6f, Fire.A(0.85f), 0.5f + 0.15f * scale);
            fx.GroundWave(p, r * 1.15f, Pal.Hex("FFD9A0").A(0.75f), 0.38f);
            fx.Decal(Art.Img("fx_scorch"), p, r * 1.9f, ScorchCol.A(0.42f), 1.2f + 0.8f * scale);
            if (scale >= 0.9f) fx.Dust(p, r * 2.4f, DustCol.A(0.35f), 0.6f);
            fx.Smoke(p + new Vector2(0, 0.35f * scale), scale >= 2f ? 3 : 1, 0.7f * r + 0.25f, SmokeCol.A(0.6f), 0.9f + 0.3f * scale, r * 0.4f, 0.7f * scale + 0.3f);
            fx.Sparks(Art.SoftDot, p + new Vector2(0, 0.3f), Mathf.RoundToInt(2 + 3 * scale), 0.14f, 3.2f * Mathf.Sqrt(scale), Fire, 0.45f, 9530, 7f, true);
            fx.SparkStreaks(p + new Vector2(0, 0.35f * scale), Mathf.RoundToInt(4 + 4 * scale), 0.38f * Mathf.Sqrt(scale), 6f * Mathf.Sqrt(scale), Pal.Hex("FFD890"), 0.32f, 9531, 8f, Vector2.up, 160f);
            fx.Glint(p + new Vector2(0, 0.45f * scale), r * 1.6f, Pal.Hex("FFF4D8"), 0.16f, 9532);
            if (scale >= 2f) fx.Debris(p, 5, 0.26f, 3f);
        }

        float _hitPopGap;

        void ShowDamage(BattleEvent e, Vector2 p)
        {
            var fx = WorldFx.I;
            // 直接把真实受击反馈钉在掉血的这名官军身上（连溅射、弹射、贯穿都不会漏掉白闪、形变与受击爆芒！）
            float unitScale = 1f;
            float hOff = 0.72f;
            if (e.EnemyId > 0)
            {
                foreach (var kv in _enemies)
                {
                    if (kv.Key.Id != e.EnemyId || kv.Key.Dead) continue;
                    kv.Value.OnDamaged(e.Crit, Away(p));
                    unitScale = kv.Key.Def.IsBoss ? 1.45f : kv.Key.Big ? 1.2f : 1f;
                    hOff = kv.Key.Def.Size * 0.42f + 0.08f;
                    break;
                }
            }
            if (e.Crit || Time.unscaledTime - _hitPopGap > 0.035f)
            {
                _hitPopGap = Time.unscaledTime;
                fx.HitPop(p + new Vector2(Random.Range(-0.14f, 0.14f), hOff * 0.55f), unitScale, e.Crit);
            }
            if (!e.Crit && fx.LiveTexts > 42) return;
            if (e.Crit && e.Hero >= 0) Sfx.Play(Snd.Crit, 0.3f);
            // 跳字锚在胸腹受击点并向两侧短弧弹开，上升高度严控在头顶血条下方，绝不挡脸或盖住血条
            var at = p + new Vector2(0f, hOff);
            if (e.Crit) fx.Say(at, Ui.Num(e.Value), WorldFx.Tx.Crit, null, e.Shot == ShotKind.Slash ? 1.1f : 1f);
            else if (e.Shot == ShotKind.Slash) fx.Say(at, Ui.Num(e.Value), WorldFx.Tx.Slash);
            else fx.Say(at, Ui.Num(e.Value), WorldFx.Tx.Hit);
        }

        void OnKill(BattleEvent e, Vector2 p)
        {
            FlyCoin(p, e.Value);
            Sfx.Play(Snd.Kill, 0.4f);
        }

        /// <summary>打死掉落的银币：飞到左下银币点才入账，路上保持大尺寸。</summary>
        void FlyCoin(Vector2 from, int amount)
        {
            if (amount <= 0 || Hud == null || WorldFx.I == null) return;
            if (_coinsFlying >= 18)
            {
                Hud.QueueCoin(amount);
                return;
            }
            _coinsFlying++;
            Hud.HoldCoin(amount);
            WorldFx.I.Fly(Art.Coin, from + new Vector2(0, 0.72f), CoinTarget, 0.72f, 0.58f, 1.5f, () =>
            {
                _coinsFlying--;
                if (Hud) Hud.ArriveCoin(amount);
                Sfx.Play(Snd.Coin, 0.32f);
            }, 9800, 0.05f);
        }

        /// <summary>宋江起身挥剑：半圆里的人都受伤，剑气只朝人群中心推过去。</summary>
        void OnLordSkill(BattleEvent e)
        {
            var origin = Layout.LordOrigin.ToV();
            var aim = e.From.ToV();
            if ((aim - origin).sqrMagnitude < 0.04f) aim = origin + Vector2.up * 2.2f;
            int hits = Mathf.Max(1, e.Slot);
            if (hits > 1) StartCoroutine(LordFollowUps(origin, aim, hits));
            _slowT = 0f;
            var fx = WorldFx.I;
            var lp = (Vector2)Leader.localPosition;
            var baseScale = Leader.localScale;
            Tween.Run(Leader, 0.55f, k =>
            {
                if (Leader == null) return;
                float rot, sc;
                if (k < 0.35f) { float a = Tween.OutCubic(k / 0.35f); rot = 10f * a; sc = 1f + 0.06f * a; }
                else { float a = (k - 0.35f) / 0.65f; rot = Mathf.Lerp(-14f, 0f, Tween.OutCubic(a)); sc = 1f + Mathf.Lerp(0.16f, 0f, Tween.OutCubic(a)); }
                Leader.localRotation = Quaternion.Euler(0, 0, rot);
                Leader.localScale = baseScale * sc;
            }, () => { if (Leader != null) { Leader.localRotation = Quaternion.identity; Leader.localScale = baseScale; } });
            fx.Flash(lp + new Vector2(0, 0.6f), 3.6f, Pal.Gold.A(0.6f), 0.35f);
            fx.Rise(Art.Img("fx_pillar"), lp + new Vector2(0, -0.3f), 2.6f, 0.6f, Pal.Hex("FFD27A"), 9050, true, 0.3f);
            fx.Sparks(Art.Img("fx_star"), lp + new Vector2(0, 0.8f), 8, 0.3f, 3f, Pal.Gold, 0.6f, 9700, 3f, true);
            fx.SwordWave(origin, aim);
            fx.ScreenFlash(Pal.Hex("FFE2A0").A(0.22f), 0.3f);
            fx.Shake(0.14f, 0.35f);
            fx.Say(lp + new Vector2(0, 2.1f), Defs.LordSkillName, WorldFx.Tx.Skill, Pal.Hex("FFC63A"), 1.15f);
            Sfx.Play(Snd.UltFist, 1f, 0.75f);
            Sfx.Play(Snd.Wave, 0.6f, 1.05f);
            Hud.OnLordSkill();
        }

        /// <summary>天书连斩的后续剑气。按战斗时间等，子弹时间里也和伤害对齐。</summary>
        IEnumerator LordFollowUps(Vector2 origin, Vector2 aim, int hits)
        {
            for (int k = 1; k < hits; k++)
            {
                yield return new WaitForSeconds(Battle.LordHitGap);
                if (WorldFx.I == null) yield break;
                WorldFx.I.SwordWave(origin, aim);
                Sfx.Play(Snd.Wave, 0.5f, 1.1f);
            }
        }

        void OnUlt(BattleEvent e, Vector2 p)
        {
            var fx = WorldFx.I;
            var sv = _slots[e.Slot];
            var sp = sv.Slot.Pos.ToV();
            var def = Defs.Hero(e.Hero);
            fx.Rise(Art.Img("fx_pillar"), sp + new Vector2(0, -0.45f), 2.8f, 0.8f, Pal.Hex("FFD27A"), 9050, true, 0.4f);
            fx.LightPool(sp + new Vector2(0, -0.3f), 3.2f, Pal.Gold.A(0.9f), 0.7f, 159);
            fx.GroundWave(sp + new Vector2(0, -0.3f), 1.8f, Pal.Hex("FFE7A0"), 0.55f, 159, 0.42f);
            fx.Flash(sp + new Vector2(0, 0.4f), 3.4f, Pal.Gold.A(0.55f), 0.35f);
            fx.ScreenFlash(Pal.Hex("FFE2A0").A(0.18f), 0.3f);
            fx.Say(sp + new Vector2(0, 1.25f), def.UltName, WorldFx.Tx.Skill, Pal.Hex("FFC63A"), 1.05f);
            sv.Kick(p, 1.6f);
            HeroSfx.Ult(def.Ult);
            switch (def.Ult)
            {
                case UltKind.Snipe:
                case UltKind.Meteor:
                case UltKind.Tornado:
                case UltKind.Bind:
                case UltKind.Frost:
                    break;
                case UltKind.Thunder:
                    fx.Shake(0.1f, 0.3f);
                    break;
                case UltKind.Sweep:
                    fx.Shake(0.2f, 0.4f);
                    break;
                default:
                    fx.ScreenFlash(Pal.Hex("B8FFE6").A(0.2f), 0.4f);
                    foreach (var s in _slots) if (s.Slot.Unit != null) fx.Rise(Art.Img("fx_pillar"), s.Slot.Pos.ToV() + new Vector2(0, -0.45f), 1.6f, 0.6f, Pal.Hex("8FF0D0"), 9050, true, 0.3f);
                    break;
            }
        }

        /// <summary>
        /// 辅助放技能（对标《永远的蔚蓝星球》雅典娜显性慢速法球仪式）：
        /// 1. 起手施法动作（0.30s 蓄力抬手 + 脚下展开符文法阵）；
        /// 2. 在胸前凝聚饱满璀璨的魔法祝福金球（fx_bless_orb），沿舒缓高拱弧线（约 0.85s）飘飞到目标队友头顶；
        /// 3. 队友接球瞬间身体欢跃一弹、爆开金色冲击环与通天光柱，再浮出增益飘字！
        /// </summary>
        void OnBuff(BattleEvent e)
        {
            var fx = WorldFx.I;
            var def = Defs.Hero(e.Hero);
            var sp = e.Slot >= 0 && e.Slot < _slots.Count ? _slots[e.Slot].Slot.Pos.ToV() : e.Pos.ToV();

            // 1) 时迁顺手牵羊：凝聚紫金破绽星轮慢弧线飞向场上最强敌军
            if (e.EnemyId == -2)
            {
                var mp = e.Pos.ToV();
                fx.SupportOrb(sp + new Vector2(0, 0.48f), mp + new Vector2(0, 0.58f), Pal.Hex("D678FF"), 0.90f, 0.28f, 0.86f, 1.35f, () =>
                {
                    fx.Ring(mp + new Vector2(0, 0.45f), 1.55f, Pal.Hex("E28CFF"), 0.50f, 9480);
                    fx.Burst(Art.Sparkle, mp + new Vector2(0, 0.55f), 1.35f, 0.32f, 9500, Pal.Hex("F2B8FF"), 80f, 0.35f, true);
                    fx.Say(mp + new Vector2(0, 1.38f), "破绽 易伤+25%", WorldFx.Tx.Status, Pal.Hex("E496FF"), 1.1f);
                }, 0f, false);
                return;
            }

            // 2) 吴用运筹帷幄（及辅助合成祝福）：凝聚暖金星阵法球，慢速高拱飘向输出队友并在接收瞬间点亮！
            if (e.EnemyId >= 0 && e.EnemyId < _slots.Count)
            {
                int targetSlot = e.EnemyId;
                int count = e.Value;
                var tp = _slots[targetSlot].Slot.Pos.ToV();
                Color orbGold = Pal.Hex("FFC438");
                if (e.Slot >= 0 && e.Slot != targetSlot)
                {
                    if (e.Slot < _slots.Count) _slots[e.Slot].CastSupport(tp);
                    float dist = Vector2.Distance(sp, tp);
                    float travel = Battle.BlessTravel(dist);
                    float arcH = Mathf.Clamp(1.35f + dist * 0.10f, 1.40f, 1.90f);
                    fx.SupportOrb(sp + new Vector2(0, 0.48f), tp + new Vector2(0, 0.48f), orbGold, 1.04f, Battle.BlessWindup, travel, arcH, () =>
                    {
                        if (targetSlot >= 0 && targetSlot < _slots.Count)
                            _slots[targetSlot].Kick(tp + new Vector2(0, 1.2f), 1.35f, 0.06f);
                        if (targetSlot >= 0 && targetSlot < _slots.Count) _slots[targetSlot].Glow(Pal.Hex("FFC83A"));
                        fx.Blessing(tp + new Vector2(0, -0.4f), Pal.Hex("FFC83A"), 1.1f);
                        fx.Say(tp + new Vector2(0, 1.20f), $"攻速提升 ×{count}次", WorldFx.Tx.Buff, Pal.Hex("FFC83A"), 1.1f);
                        Sfx.Play(Snd.Merge, 0.42f, 1.32f);
                    }, 0f, true);
                }
                else
                {
                    fx.Blessing(tp + new Vector2(0, -0.4f), Pal.Hex("FFC83A"), 1f);
                    fx.Say(tp + new Vector2(0, 1.12f), $"攻速提升 ×{count}次", WorldFx.Tx.Buff, Pal.Hex("FFC83A"), 1.1f);
                }
                return;
            }

            // 3) 所有 6 位辅助英雄自身起手施法动作（蓄力抬手 + 脚下金色/专属色旋转法阵 + 招式名飘字）
            if (e.Slot >= 0 && e.Slot < _slots.Count)
                _slots[e.Slot].CastSupport(sp + new Vector2(0, 1.5f));

            Color castCol = def.Buff == UltKind.Bless ? Pal.Hex("FFD24A")
                : def.Buff == UltKind.Rush ? Pal.Hex("68C8FF")
                : def.Buff == UltKind.Mend ? Pal.Hex("6EE888")
                : def.Buff == UltKind.Forge ? Pal.Hex("FF9E36")
                : Pal.Hex("FFD854");

            fx.Rune(sp + new Vector2(0, -0.28f), 1.95f, castCol.A(0.92f), 1.25f, 75f, 158, 0.42f);
            fx.GroundWave(sp + new Vector2(0, -0.3f), 1.60f, castCol, 0.58f, 159, 0.4f);
            fx.Flash(sp + new Vector2(0, 0.55f), 1.45f, castCol.A(0.55f), 0.32f);
            fx.Say(sp + new Vector2(0, 1.28f), def.AtkName, WorldFx.Tx.Skill, castCol, 0.85f);
            HeroSfx.Buff(def);

            // 其余群体辅助同样凝聚显性祝福法球逐一慢速飘向受益队友（或城墙），让每一次辅助出手都仪式感拉满！
            int stagger = 0;
            switch (def.Buff)
            {
                case UltKind.Rush:
                    foreach (var s in _slots)
                        if (s.Slot.Unit != null && s.Slot.Index != e.Slot)
                        {
                            var targetSv = s;
                            var up = targetSv.Slot.Pos.ToV();
                            float dly = stagger++ * 0.08f;
                            fx.SupportOrb(sp + new Vector2(0, 0.48f), up + new Vector2(0, 0.46f), castCol, 0.88f, 0.30f, 0.90f, 1.38f, () =>
                            {
                                targetSv.Kick(up + new Vector2(0, 1.0f), 1.25f, 0.05f);
                                targetSv.Glow(Pal.Hex("5CC4FF"));
                                fx.Blessing(up + new Vector2(0, -0.4f), Pal.Hex("5CC4FF"), 0.9f);
                                fx.Say(up + new Vector2(0, 1.05f), "冷却缩短", WorldFx.Tx.Buff, Pal.Hex("6CC4FF"));
                            }, dly, false);
                        }
                    break;
                case UltKind.Forge:
                    fx.ScreenFlash(Pal.Hex("FFD27A").A(0.14f), 0.32f);
                    foreach (var s in _slots)
                        if (s.Slot.Unit != null && s.Slot.Unit.Def.Carry)
                        {
                            var targetSv = s;
                            var up = targetSv.Slot.Pos.ToV();
                            float dly = stagger++ * 0.08f;
                            fx.SupportOrb(sp + new Vector2(0, 0.48f), up + new Vector2(0, 0.46f), castCol, 0.92f, 0.30f, 0.92f, 1.40f, () =>
                            {
                                targetSv.Kick(up + new Vector2(0, 1.0f), 1.28f, 0.05f);
                                targetSv.Glow(Pal.Hex("FF9E36"));
                                fx.Blessing(up + new Vector2(0, -0.4f), Pal.Hex("FF9E36"), 0.95f);
                                fx.Say(up + new Vector2(0, 1.08f), "改装增伤", WorldFx.Tx.Buff, Pal.Hex("FF9A36"));
                            }, dly, true);
                        }
                    break;
                case UltKind.Interest:
                    foreach (var s in _slots)
                        if (s.Slot.Unit != null && s.Slot.Unit.Def.Carry)
                        {
                            var targetSv = s;
                            var up = targetSv.Slot.Pos.ToV();
                            float dly = stagger++ * 0.07f;
                            fx.SupportOrb(sp + new Vector2(0, 0.48f), up + new Vector2(0, 0.46f), castCol, 0.88f, 0.28f, 0.88f, 1.32f, () =>
                            {
                                targetSv.Kick(up + new Vector2(0, 1.0f), 1.20f, 0.04f);
                                targetSv.Glow(Pal.Hex("FFD24A"));
                                fx.Blessing(up + new Vector2(0, -0.4f), Pal.Hex("FFD24A"), 0.85f);
                                fx.Say(up + new Vector2(0, 1.05f), "攻速+25%", WorldFx.Tx.Buff, Pal.Hex("FFC83A"));
                            }, dly, true);
                        }
                    break;
                case UltKind.Mend:
                    // 安道全：翠绿回春法球弧线落入城墙中央，化作满墙生机绿波
                    fx.SupportOrb(sp + new Vector2(0, 0.48f), new Vector2(0f, -4.65f), castCol, 0.96f, 0.30f, 0.88f, 1.35f, () =>
                    {
                        fx.Ring(new Vector2(0f, -4.55f), 2.4f, Pal.Hex("8FF09A"), 0.55f, 9480);
                        foreach (var s in _slots)
                            if (s.Slot.Unit != null)
                                fx.LightPool(s.Slot.Pos.ToV() + new Vector2(0, -0.3f), 1.55f, Pal.Hex("8FF09A").A(0.65f), 0.55f, 159);
                    }, 0f, false);
                    break;
            }
        }

        // ---------------- 同步 ----------------

        void SyncSlots()
        {
            for (int i = 0; i < _slots.Count; i++) _slots[i].Tick(i == _dragFrom);
        }

        void SyncEnemies()
        {
            foreach (var e in B.Enemies)
            {
                if (!_enemies.TryGetValue(e, out var v))
                {
                    v = new EnemyView(e, _world);
                    _enemies[e] = v;
                    if (e.Pos.Y > Layout.SpawnY - 0.6f)
                    {
                        if (e.Pos.X <= 0.5f) _doors[0]?.Open(1.4f);
                        if (e.Pos.X >= -0.5f) _doors[1]?.Open(1.4f);
                    }
                    if (e.Def.Kind != EnemyKind.Soldier && Profile.S != null && (int)e.Def.Kind < Profile.S.Seen.Length && Profile.S.Seen[(int)e.Def.Kind] == 0)
                        Hud?.NotifyNewEnemy(e.Def);
                }
                v.Tick(B.Rage);
            }
            _gone.Clear();
            foreach (var kv in _enemies)
                if (kv.Key.Dead || kv.Key.Escaped || !B.Enemies.Contains(kv.Key)) _gone.Add(kv.Key);
            foreach (var e in _gone)
            {
                var v = _enemies[e];
                _enemies.Remove(e);
                if (e.Escaped) v.Escape();
                else if (e.Dead) v.Die();
                else v.Destroy();
            }
            Hud.SyncBoss(BossEnemy());
        }

        Enemy BossEnemy()
        {
            foreach (var e in B.Enemies) if (e.Def.IsBoss && !e.Dead) return e;
            return null;
        }

        void SyncShots()
        {
            _liveShots.Clear();
            foreach (var s in B.Shots)
            {
                if (s.Kind == ShotKind.Slash) continue;
                _liveShots.Add(s);
                if (!_shots.TryGetValue(s, out var v))
                {
                    v = new ShotView(s, _world);
                    _shots[s] = v;
                }
                v.Tick();
            }
            _goneShots.Clear();
            foreach (var kv in _shots) if (!_liveShots.Contains(kv.Key)) _goneShots.Add(kv.Key);
            foreach (var s in _goneShots)
            {
                _shots[s].Destroy();
                _shots.Remove(s);
            }
        }

        // ---------------- 拖拽合成 ----------------

        /// <summary>自检用的假指针：按下/按住/抬起 + 世界坐标。为空时读真实鼠标、触摸。</summary>
        public struct Pointer
        {
            public bool Down, Held, Up;
            public Vector2 World;
        }

        public System.Func<Pointer> FakePointer;

        Pointer ReadPointer()
        {
            if (FakePointer != null) return FakePointer();
            var w = Game.Cam.ScreenToWorldPoint(Input.mousePosition);
            return new Pointer
            {
                Down = Input.GetMouseButtonDown(0) && !Ui.PointerOverUi(),
                Held = Input.GetMouseButton(0),
                Up = Input.GetMouseButtonUp(0),
                World = new Vector2(w.x, w.y),
            };
        }

        public Vector2 SlotWorld(int i) => B.Slots[i].Pos.ToV();

        /// <summary>点中的敌人：身体中心离手指最近、且在身形范围内的那个。飞行的身体悬在影子上方。</summary>
        public Enemy EnemyAt(Vector2 p)
        {
            Enemy best = null;
            float bd = float.MaxValue;
            foreach (var e in B.Enemies)
            {
                if (e.Dead || e.Pos.Y > Layout.SpawnY - 0.3f) continue;
                var c = e.Pos.ToV() + new Vector2(0, e.Def.Size * 0.45f + (e.Def.Flying ? 0.75f : 0f));
                float r = e.Def.Size * 0.55f + 0.3f;
                float d = (p - c).sqrMagnitude;
                if (d > r * r || d >= bd) continue;
                bd = d;
                best = e;
            }
            return best;
        }

        SpriteRenderer _mark, _focusRing;
        int _markId = -1;
        float _markT;

        /// <summary>信息卡打开时，脚下套一个红圈标出是哪一个。</summary>
        public void MarkEnemy(int id, float dur)
        {
            _markId = id;
            _markT = dur;
        }

        void TickMark()
        {
            // 持续显示玩家手动集火准星圈（直到该目标阵亡）
            Enemy focused = null;
            if (B.FocusEnemyId > 0)
                foreach (var x in B.Enemies) if (x.Id == B.FocusEnemyId && !x.Dead) { focused = x; break; }
            if (focused != null)
            {
                if (_focusRing == null) _focusRing = WorldFx.Spr(_world, Art.Ring, Vector2.zero, 1f, 147, Color.white, "focusRing");
                _focusRing.gameObject.SetActive(true);
                float fs = focused.Def.Size * 1.18f * (1f + 0.08f * Mathf.Sin(Time.unscaledTime * 9f));
                _focusRing.transform.localPosition = focused.Pos.ToV() + new Vector2(0, -0.02f);
                _focusRing.transform.localScale = new Vector3(fs, fs * 0.45f, 1f);
                _focusRing.color = Pal.Hex("FF3B30").A(0.88f);
                _focusRing.sortingOrder = WorldFx.Order(focused.Pos.Y) - 1;
            }
            else if (_focusRing) _focusRing.gameObject.SetActive(false);

            Enemy e = null;
            if (_markId >= 0 && (_markT -= Time.unscaledDeltaTime) > 0)
                foreach (var x in B.Enemies) if (x.Id == _markId && !x.Dead) { e = x; break; }
            if (e == null)
            {
                _markId = -1;
                if (_mark) _mark.gameObject.SetActive(false);
                return;
            }
            if (_mark == null) _mark = WorldFx.Spr(_world, Art.SoftDot, Vector2.zero, 1f, 145, Color.white, "enemyMark");
            _mark.gameObject.SetActive(true);
            float s = e.Def.Size * 1.25f;
            _mark.transform.localPosition = e.Pos.ToV() + new Vector2(0, -0.04f);
            _mark.transform.localScale = new Vector3(s, s * 0.42f, 1f);
            _mark.color = Pal.Hex("FF4A3A").A(0.55f + 0.25f * Mathf.Sin(Time.unscaledTime * 8f));
            _mark.sortingOrder = WorldFx.Order(e.Pos.Y) - 2;
        }

        int SlotAt(Vector2 p)
        {
            int best = -1;
            float bd = float.MaxValue;
            for (int i = 0; i < B.Slots.Count; i++)
            {
                var c = B.Slots[i].Pos.ToV() + new Vector2(0, 0.1f);
                var d = p - c;
                if (Mathf.Abs(d.x) > 0.7f || Mathf.Abs(d.y) > 0.72f) continue;
                if (d.sqrMagnitude < bd) { bd = d.sqrMagnitude; best = i; }
            }
            return best;
        }

        void HandleInput()
        {
            if (Auto != null) return;
            bool can = B.Phase == Phase.Running && !Paused && !Hud.Blocking;
            if (!can)
            {
                if (_dragFrom >= 0) CancelDrag();
                _pressing = false;
                return;
            }
            var ptr = ReadPointer();
            var p = ptr.World;
            if (ptr.Down)
            {
                int i = SlotAt(p);
                if (i >= 0 && B.Slots[i].Unit != null)
                {
                    _pressing = true;
                    _pressPos = p;
                    _pressTime = Time.unscaledTime;
                    _dragFrom = i;
                    Sfx.Play(Snd.Tap, 0.5f);
                }
                else
                {
                    var en = EnemyAt(p);
                    if (en != null)
                    {
                        Sfx.Play(Snd.Tap, 0.5f);
                        B.FocusEnemyId = en.Id;
                        Hud.EnemyInfo(en);
                    }
                    else Hud.CloseInfo();
                }
            }
            if (_pressing && ptr.Held && _dragFrom >= 0)
            {
                var sv = _slots[_dragFrom];
                bool moved = (p - _pressPos).magnitude > 0.18f;
                if (moved || sv.Dragging) sv.DragTo(p + new Vector2(0, 0.25f));
                int over = SlotAt(p);
                for (int i = 0; i < _slots.Count; i++)
                    _slots[i].Highlight(i == _dragFrom ? 0 : B.CanMerge(_dragFrom, i) ? (i == over ? 3 : 2) : (i == over && sv.Dragging ? 1 : 0));
                if (sv.Dragging && over >= 0 && over != _dragFrom && B.CanMerge(_dragFrom, over))
                    Hud.ShowMergePreview(B.Slots[_dragFrom], B.Slots[over]);
                else
                    Hud.HideMergePreview();
            }
            if (_pressing && ptr.Up)
            {
                _pressing = false;
                int from = _dragFrom;
                int to = SlotAt(p);
                bool wasDrag = _slots[from].Dragging;
                CancelDrag();
                Hud.HideMergePreview();
                if (!wasDrag && Time.unscaledTime - _pressTime < 0.4f)
                {
                    Hud.SlotInfo(B.Slots[from]);
                    return;
                }
                if (to >= 0 && to != from)
                {
                    bool merge = B.CanMerge(from, to);
                    B.Drop(from, to);
                    if (!merge) foreach (var s in _slots) s.Sync(false);
                }
            }
        }

        void CancelDrag()
        {
            if (_dragFrom >= 0 && _dragFrom < _slots.Count) _slots[_dragFrom].EndDrag();
            _dragFrom = -1;
            foreach (var s in _slots) s.Highlight(0);
            Hud?.HideMergePreview();
        }

        /// <summary>引导用：找一对能合成的格子。</summary>
        public bool FindMergePair(out Vector2 a, out Vector2 b)
        {
            for (int i = 0; i < B.Slots.Count; i++)
                for (int j = i + 1; j < B.Slots.Count; j++)
                    if (B.CanMerge(i, j))
                    {
                        a = B.Slots[i].Pos.ToV();
                        b = B.Slots[j].Pos.ToV();
                        return true;
                    }
            a = b = default;
            return false;
        }

        public bool Dragging => _dragFrom >= 0;
        public float TopUnitScore()
        {
            float s = 0;
            foreach (var x in B.Slots) if (x.Unit != null) s += x.Unit.Star;
            return s;
        }

        // ================= 子视图 =================

        sealed class SlotView
        {
            public readonly Slot Slot;
            public readonly Transform Root;
            readonly BattleView _v;
            readonly SpriteRenderer _frame, _inner, _ring, _glow, _selGlow;
            readonly Transform _figs;
            readonly List<SpriteRenderer> _bodies = new List<SpriteRenderer>();
            readonly List<Vector2> _home = new List<Vector2>();
            readonly List<float> _sizes = new List<float>();
            SpriteRenderer _crown, _stunStar;
            RectTransform _badge;
            UnityEngine.UI.Text _badgeText;
            int _badgeN;
            int _shownId = -1;
            float _kick, _kickPow = 1f, _kickDir, _cheer, _popUntil, _release, _lastFire = -99f, _lunge, _castPose, _glowT;
            Color _glowCol = Color.white;
            const float GlowDur = 0.55f;
            Vector2 _lungeDir;
            Sprite[] _anim;
            Bend.Info _bend = new Bend.Info(0f, 1f, 0.5f, 0.22f);
            int _hl;
            readonly float _phase;
            public bool Dragging { get; private set; }
            public bool Selected;

            static readonly Color FrameColor = Color.white;
            static readonly Color InnerColor = new Color(0.08f, 0.14f, 0.22f, 0f);
            static readonly Color SelColor = Pal.Hex("FFD45A");

            /// <summary>校正个别画布里人物重心偏左/偏右的视觉偏移，让好汉双脚正对石格中心。</summary>
            float HeroXBias(string art)
            {
                if (art == "hero_huarong") return 0.045f;
                if (art == "hero_shixiu") return 0.070f;
                if (art == "hero_husanniang") return 0.022f;
                if (art == "hero_qiaodaoqing") return -0.022f;
                if (_anim != null && _anim.Length > 1 && AnimMeta.Info.TryGetValue(art, out var m))
                    return Mathf.Clamp(0.5f - m.LegCx, -0.06f, 0.06f);
                return 0f;
            }

            public SlotView(BattleView v, Slot s, Transform parent)
            {
                _v = v;
                Slot = s;
                _phase = Random.Range(0f, 6f);
                Root = new GameObject("slot" + s.Index).transform;
                Root.SetParent(parent, false);
                Root.localPosition = s.Pos.ToV();
                bool front = s.Pos.Y > Layout.WallRowY + 0.5f;
                if (front) WorldFx.Block(Root, Art.GroundShadow, new Vector2(0, -0.52f), new Vector2(1.52f, 0.54f), 140, new Color(0.02f, 0.05f, 0.09f, 0.5f), "shadow");
                // 石垛几何锚点：b_slot 顶面蓝色凹槽中心在纹理 +0.115 高度处；将 frame 下沉到 -0.10，使好汉双脚稳稳踩在凹槽石面正中。
                _selGlow = WorldFx.Additive(WorldFx.Spr(Root, Art.SoftDot, new Vector2(0, -0.06f), 1f, 149, SelColor.A(0f), "selGlow"));
                _selGlow.transform.localScale = new Vector3(TileSize.x * 1.55f, TileSize.y * 1.45f, 1f);
                _frame = WorldFx.Spr(Root, Art.Img("b_slot"), new Vector2(0, -0.10f), 1.38f, 151, FrameColor, "frame");
                _inner = WorldFx.Block(Root, Art.RoundedSmall, new Vector2(0, 0.05f), TileSize - new Vector2(0.32f, 0.40f), 152, InnerColor, "inner");
                _glow = WorldFx.Spr(Root, Art.SoftDot, new Vector2(0, 0.04f), 1.3f, 157, new Color(1, 1, 1, 0), "glow");
                _glow.transform.localScale = new Vector3(0.98f, 0.44f, 1);
                _ring = WorldFx.Spr(Root, Art.SoftDot, new Vector2(0, 0.02f), 1f, 158, new Color(1, 1, 1, 0), "ring");
                _ring.transform.localScale = new Vector3(0.84f, 0.34f, 1);
                _figs = new GameObject("figs").transform;
                _figs.SetParent(Root, false);
            }

            public void Sync(bool pop)
            {
                var u = Slot.Unit;
                int id = u?.Id ?? -1;
                if (id == _shownId) return;
                _shownId = id;
                for (int i = _figs.childCount - 1; i >= 0; i--)
                {
                    var old = _figs.GetChild(i);
                    old.SetParent(null, false);
                    Object.Destroy(old.gameObject);
                }
                _bodies.Clear();
                _home.Clear();
                _sizes.Clear();
                _crown = null;
                if (u == null)
                {
                    _ring.color = new Color(1, 1, 1, 0);
                    return;
                }
                _anim = Art.Frames(u.Def.Art);
                if (!ArtPack.Ready(u.Def.Art))
                {
                    string art = u.Def.Art;
                    Art.Late(Root, art, () =>
                    {
                        if (_shownId != id) return;
                        _shownId = -1; // 4帧图包到达后重排一次，确保 FrameBox 从静态紧裁图平滑切到帧画布锚点
                        Sync(false);
                    });
                }
                var sprite = _anim[0];
                Vector2[] pos;
                float size;
                switch (u.Star)
                {
                    case 1: pos = new[] { new Vector2(0, 0) }; size = 1.02f; break;
                    case 2: pos = new[] { new Vector2(-0.22f, 0.02f), new Vector2(0.22f, -0.02f) }; size = 0.86f; break;
                    case 3: pos = new[] { new Vector2(0, 0.13f), new Vector2(-0.23f, -0.05f), new Vector2(0.23f, -0.07f) }; size = 0.76f; break;
                    default: pos = new[] { new Vector2(0, 0) }; size = 1.28f; break;
                }
                // 对齐石垛顶面凹槽正中（frame 在 -0.10 时顶面凹槽从 y=-0.22 到 y=+0.34，中心 +0.06；feet=-0.06 让鞋底稳踩在凹槽石心 y=1014，绝不压前沿蓝线）。
                float feet = -0.06f;
                for (int i = 0; i < pos.Length; i++)
                {
                    var box = Art.FrameBox(u.Def.Art, size);
                    // AnimMeta.Info 按 ArtCdn 4帧画布测算；若当前回退的是 Resources Tight 静态单图，按原图高计算避免偏北悬浮。
                    if (_anim.Length <= 1) box = (size, size * 0.5f);
                    float cx = pos[i].x + HeroXBias(u.Def.Art) * size;
                    var home = new Vector2(cx, feet + pos[i].y + box.CenterY);
                    var sh = WorldFx.Spr(_figs, Art.GroundShadow, new Vector2(pos[i].x, feet + pos[i].y + 0.01f), size * 0.7f, 0, new Color(0.06f, 0.09f, 0.14f, 0.46f), "sh");
                    sh.transform.localScale = new Vector3(size * 0.68f, size * 0.21f, 1);
                    var body = Bend.Use(WorldFx.Spr(_figs, sprite, home, box.Size, 0, null, "fig"));
                    _bend = Bend.Meta(u.Def.Art);
                    // 对标《永远的蔚蓝星球》实机：2星双人、3星三人保持同一朝向整齐列队，绝不镜像翻转导致兵器对撞糊成一团。
                    body.flipX = false;
                    _bodies.Add(body);
                    _home.Add(home);
                    _sizes.Add(box.Size);
                    if (pop)
                    {
                        body.transform.localScale = Vector3.zero;
                        float sz = box.Size;
                        _popUntil = Time.unscaledTime + 0.36f + i * 0.06f;
                        Tween.Run(body, 0.35f, t => body.transform.localScale = Vector3.one * sz * Tween.OutBack(t), null, i * 0.06f);
                    }
                }
                if (u.Star >= 4)
                {
                    _crown = WorldFx.Spr(_figs, Art.Img("ic_crown"), new Vector2(0, feet + size + 0.05f), 0.44f, 0, null, "crown");
                }
                var c = Pal.Star[u.Star - 1];
                _ring.color = c.A(u.Star == 1 ? 0.0f : 0.5f);
                ApplyOrder(false);
            }

            void ApplyOrder(bool lifted)
            {
                int baseOrder = lifted ? 9200 : WorldFx.Order(Slot.Pos.Y) + 10;
                int n = 0;
                foreach (Transform c in _figs)
                {
                    var sr = c.GetComponent<SpriteRenderer>();
                    float y = c.localPosition.y;
                    sr.sortingOrder = baseOrder + (c.name == "sh" ? 0 : 5) + Mathf.RoundToInt(-y * 20f) + (c.name == "crown" ? 40 : 0);
                    n++;
                }
            }

            public void Tick(bool source)
            {
                Sync(false);
                float t = Time.time + _phase;
                float dt = Time.deltaTime;
                if (_kick > 0) _kick -= dt * 6f;
                if (_cheer > 0) _cheer -= Time.unscaledDeltaTime;
                if (_release > 0) _release -= dt;
                if (_castPose > 0) _castPose -= dt;
                if (_glowT > 0) _glowT -= dt;
                // 帧：待机 0/1 呼吸交替；临出手（冷却快到且正在交战或辅助即将施法）蓄力帧 2；出手后释放帧 3。
                var unit = Slot.Unit;
                bool fighting = Time.time - _lastFire < 2.5f || (unit != null && unit.Def.Buff.HasValue && _v.B.Enemies.Count > 0);
                float windLead = unit != null && unit.Def.Buff.HasValue ? 0.55f : 0.22f;
                bool windup = (unit != null && fighting && unit.Cd > 0 && unit.Cd < Mathf.Min(windLead, unit.Def.Interval * 0.4f)) || _castPose > 0.22f;
                for (int i = 0; i < _bodies.Count; i++)
                {
                    var b = _bodies[i];
                    if (b == null) continue;
                    float size = _sizes[i];
                    int frame = HeroPose.Frame(t, i, windup, _release > 0 || _cheer > 0 || (_castPose > 0f && _castPose <= 0.22f));
                    var spr = _anim[frame % _anim.Length];
                    if (b.sprite != spr) b.sprite = spr;
                    float k = Mathf.Max(0, _kick);
                    float breathe = Mathf.Sin(t * 3.4f + i * 1.3f) * 0.022f;
                    float hop = _cheer > 0 ? Mathf.Abs(Mathf.Sin(Time.unscaledTime * 9f + i)) * 0.25f : 0f;
                    // 辅助起手施法动作：先微微下蹲蓄力，再轻盈腾起挥扇把法球推出去！
                    float castLift = _castPose > 0f ? 0.18f * Mathf.Sin(Mathf.Clamp01(1f - _castPose / 0.52f) * Mathf.PI) : 0f;
                    float castScale = _castPose > 0f ? 1f + 0.12f * Mathf.Sin(Mathf.Clamp01(1f - _castPose / 0.52f) * Mathf.PI) : 1f;
                    if (Time.unscaledTime > _popUntil) b.transform.localScale = Vector3.one * (size * castScale);
                    float step = _lunge * Mathf.Sin((1f - k) * Mathf.PI) * (k > 0 ? 1f : 0f);
                    b.transform.localPosition = _home[i] + new Vector2(0, hop + castLift) + _lungeDir * step;
                    b.transform.localRotation = Quaternion.identity;
                    float lean = _kickDir * 0.05f * k * (b.flipX ? -1f : 1f);
                    float glow = _glowT > 0 ? 0.5f * Mathf.Sin(Mathf.Clamp01(_glowT / GlowDur) * Mathf.PI) : 0f;
                    Bend.Set(b, _bend, breathe * 0.4f - k * 0.02f * _kickPow, lean,
                        1f + k * 0.05f * _kickPow - breathe * 0.4f, 1f - k * 0.05f * _kickPow + breathe, 0f, 0f, glow, _glowCol);
                }
                if (_crown) _crown.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(t * 3f) * 6f);
                var u = Slot.Unit;
                bool stunned = u != null && u.Stun > 0;
                foreach (var b in _bodies) if (b) b.color = stunned ? new Color(0.55f, 0.58f, 0.66f) : Color.white;
                if (stunned)
                {
                    if (_stunStar == null) _stunStar = WorldFx.Spr(Root, Art.Img("fx_star"), new Vector2(0, 0.75f), 0.34f, 9300, null, "stunStar");
                    _stunStar.transform.localPosition = new Vector2(Mathf.Cos(Time.time * 7f) * 0.25f, 0.78f + Mathf.Sin(Time.time * 7f) * 0.06f);
                    _stunStar.transform.localRotation = Quaternion.Euler(0, 0, Time.time * 300f);
                }
                else if (_stunStar != null)
                {
                    Object.Destroy(_stunStar.gameObject);
                    _stunStar = null;
                }
                bool canMergeIdle = u != null && _hl == 0 && !Dragging && _v._dragFrom < 0 && _v.B.HasMergePartner(Slot.Index);
                // 只用脚下一团柔光提示状态：满蓄力金色急闪、被吴用祝福翠青呼吸、打造神兵全军暖橙火光、4星金环、百搭冰青、可合成柔黄
                float glowA = 0;
                Color glowC = Color.white;
                if (u != null && u.Burst) { glowA = 0.55f + 0.25f * Mathf.Sin(Time.unscaledTime * 10f); glowC = Pal.Gold; }
                else if (u != null && u.BlessN > 0 && u.BlessWait <= 0) { glowA = 0.56f + 0.22f * Mathf.Sin(t * 6.0f); glowC = Pal.Hex("FFD44A"); }
                else if (u != null && u.Def.Carry && _v.B.ForgeT > 0) { glowA = 0.44f + 0.16f * Mathf.Sin(t * 5.5f); glowC = Pal.Hex("FFA83A"); }
                else if (u != null && u.Star >= 4) { glowA = 0.42f + 0.14f * Mathf.Sin(t * 3.5f); glowC = Pal.Gold; }
                else if (u != null && u.Wild && !Dragging) { glowA = 0.40f + 0.14f * Mathf.Sin(Time.unscaledTime * 5f + _phase); glowC = Pal.Hex("6FE8F0"); }
                else if (canMergeIdle) { glowA = 0.34f + 0.14f * Mathf.Sin(Time.unscaledTime * 4.2f + _phase); glowC = Pal.Hex("FFD84D"); }
                if (_hl >= 2) { glowA = _hl == 3 ? 0.95f : 0.55f + 0.3f * Mathf.Sin(Time.unscaledTime * 8f); glowC = Pal.Hex("7CFF6A"); }
                _glow.color = glowC.A(glowA);
                int bless = u != null && u.BlessWait <= 0 ? u.BlessN : 0;
                if (bless > 0)
                {
                    if (_badge == null) _badge = WorldFx.I.Badge(Pal.Hex("FFC83A"), out _badgeText);
                    if (!_badge.gameObject.activeSelf) _badge.gameObject.SetActive(true);
                    if (_badgeN != bless)
                    {
                        _badgeText.text = "×" + bless;
                        Tween.Punch(_badge, 0.18f, 0.25f);
                        _badgeN = bless;
                    }
                    WorldFx.Place(_badge, (Vector2)Root.position + new Vector2(0f, 1.22f + 0.03f * Mathf.Sin(t * 4f)));
                }
                else if (_badge != null && _badge.gameObject.activeSelf)
                {
                    _badge.gameObject.SetActive(false);
                    _badgeN = 0;
                }
                float selPulse = 0.85f + 0.15f * Mathf.Sin(Time.unscaledTime * 5f);
                _frame.color = _hl >= 2 ? Pal.Hex("FFF1B8") : _hl == 1 ? Pal.Hex("FFF8EC") : Selected ? Pal.Hex("FFE7A0") : FrameColor;
                _selGlow.color = SelColor.A(Selected ? 0.8f * selPulse : 0f);
                _inner.color = source && Dragging ? new Color(0.08f, 0.14f, 0.22f, 0.16f) : Selected ? SelColor.A(0.22f * selPulse) : InnerColor;
            }

            /// <summary>出手：身子一压一弹。lunge 大于 0 时还往目标方向扑出这么远再收回，近战挥刀、捅枪用。</summary>
            public void Kick(Vector2 target, float pow = 1f, float lunge = 0f)
            {
                _kick = 1f;
                _kickPow = pow;
                _release = 0.22f;
                _lastFire = Time.time;
                _kickDir = Mathf.Clamp(target.x - Slot.Pos.X, -1f, 1f);
                var d = target - Slot.Pos.ToV();
                _lungeDir = d.sqrMagnitude > 0.0001f ? d.normalized : Vector2.up;
                _lunge = lunge;
            }

            /// <summary>接到增益：整个人被染上增益色亮一下再退回去。</summary>
            public void Glow(Color c)
            {
                _glowT = GlowDur;
                _glowCol = c;
            }

            /// <summary>辅助专属完整起手施法动作（蓄力抬手 0.30s → 振扇推球 0.22s，肉眼清晰可见）。</summary>
            public void CastSupport(Vector2 toward)
            {
                _castPose = 0.52f;
                _kick = 1f;
                _kickPow = 1.45f;
                _lastFire = Time.time;
                _kickDir = Mathf.Clamp(toward.x - Slot.Pos.X, -1f, 1f);
                _lunge = 0f;
            }

            public void Cheer() => _cheer = 3f;

            public void Highlight(int level) => _hl = level;

            public void DragTo(Vector2 world)
            {
                if (!Dragging)
                {
                    Dragging = true;
                    ApplyOrder(true);
                    _figs.localScale = Vector3.one * 1.15f;
                }
                _figs.position = new Vector3(world.x, world.y, 0);
            }

            public void EndDrag()
            {
                if (!Dragging) return;
                Dragging = false;
                var from = (Vector2)_figs.localPosition;
                var figs = _figs;
                Tween.Run(figs, 0.12f, k =>
                {
                    figs.localPosition = Vector2.Lerp(from, Vector2.zero, Tween.OutCubic(k));
                    figs.localScale = Vector3.one * Mathf.Lerp(1.15f, 1f, k);
                });
                ApplyOrder(false);
            }
        }

        sealed class EnemyView
        {
            readonly Enemy _e;
            readonly Transform _root;
            readonly SpriteRenderer _body, _shadow, _aura;
            readonly SpriteRenderer _barBg, _bar;
            readonly Transform _barRoot;
            SpriteRenderer _stun, _tag, _shield;
            readonly float _h, _phase, _jit, _size, _cy;
            Sprite[] _frames, _walk, _fly;
            readonly SpriteRenderer _barGhost, _barHi, _barTrack;
            const int EliteLayers = 10;
            const int BossLayers = 25;
            const float WalkFpsMin = 3.2f;
            const float WalkFpsCap = 12.5f;
            readonly UnityEngine.UI.Text _layerText;
            int _layer;
            readonly float _bw, _bh, _barBaseY;
            readonly Bend.Info _bend;
            readonly bool _fromGate;
            float _redT, _step, _walkPhase, _walkW, _ghostFrac = 1f;
            Vector2 _lastWorld;
            float _lastSimY, _slideOffY;
            float _stopT, _knockT, _knockPow, _squashT, _barShakeT, _barPop = 1f;
            Vector2 _knockDir;

            const float BarK = 0.22f;
            const float KnockBack = 0.24f;

            /// <summary>
            /// 被实打实地揍了一下：身子染红、顿住再被打偏，然后回位。不闪白。
            /// pow 约 0.4 是箭，1 是刀斧，1.5 以上是重锤暴击。大个子受压稳重但不木桩。
            /// </summary>
            public void Jolt(Vector2 dir, float pow)
            {
                float p = _e.Def.IsBoss ? pow * 0.48f : _e.Big ? pow * 0.72f : pow;
                _squashT = Mathf.Max(_squashT, 0.20f);
                _barShakeT = Mathf.Max(_barShakeT, 0.18f);
                _redT = Mathf.Max(_redT, 0.34f);
                if ((_stopT > 0 || _knockT > KnockBack * 0.5f) && p < _knockPow) return;
                _knockDir = dir.sqrMagnitude > 0.0001f ? dir.normalized : Vector2.up;
                _knockPow = p;
                _stopT = 0.045f + 0.05f * Mathf.Min(1.5f, pow);
                _knockT = KnockBack;
            }

            /// <summary>掉血必触发反馈：身子染红再淡回去，不闪白。</summary>
            public void OnDamaged(bool crit, Vector2 dir)
            {
                _squashT = Mathf.Max(_squashT, crit ? 0.22f : 0.18f);
                _barShakeT = Mathf.Max(_barShakeT, crit ? 0.20f : 0.14f);
                _redT = Mathf.Max(_redT, crit ? 0.42f : 0.34f);
                if (_knockT <= 0.02f)
                {
                    _knockDir = dir.sqrMagnitude > 0.0001f ? dir.normalized : Vector2.up;
                    _knockPow = (_e.Def.IsBoss ? 0.30f : _e.Big ? 0.48f : 0.68f) * (crit ? 1.4f : 1f);
                    _stopT = Mathf.Max(_stopT, 0.035f);
                    _knockT = KnockBack * 0.92f;
                }
            }
            /// <summary>飞行单位离地高度：影子留在地上，身体悬空。</summary>
            const float FlyH = 0.75f;

            /// <summary>一只脚相对身体的高度（正 = 往上收）。phase 每走一步加 1，[0,1) 摆动、[1,2) 支撑。</summary>
            static float Foot(float phase, float reach, float raise)
            {
                float k = phase - 2f * Mathf.Floor(phase * 0.5f);
                if (k < 1f) return Mathf.Lerp(reach, -reach, k * k * (3f - 2f * k)) + raise * Mathf.Sin(k * Mathf.PI);
                return Mathf.Lerp(-reach, reach, k - 1f);
            }

            /// <summary>紧致微圆角扁框血条（对标参考图利落矩形黑边暖橙条，彻底告别臃肿长药丸）。</summary>
            SpriteRenderer BarPiece(string name, float w, float h, Color c)
            {
                var sr = WorldFx.Spr(_barRoot, Art.HpBarRect, Vector2.zero, 1, 0, c, name);
                sr.drawMode = SpriteDrawMode.Sliced;
                sr.transform.localScale = Vector3.one * BarK;
                sr.size = new Vector2(Mathf.Max(w, 0.008f) / BarK, h / BarK);
                return sr;
            }

            void SetBarWidth(SpriteRenderer sr, float frac, float w, float h)
            {
                float fw = frac <= 0.002f ? 0.004f : Mathf.Max(w * frac, h * 0.55f);
                sr.size = new Vector2(fw / BarK, h / BarK);
                sr.transform.localPosition = new Vector2(-(w - fw) * 0.5f, sr.transform.localPosition.y);
            }

            void TakeFrames()
            {
                _frames = Art.Frames(_e.Def.Art);
                _walk = _e.Def.Flying ? new Sprite[0] : Art.WalkFrames(_e.Def.Art);
                _fly = _e.Def.Flying ? Art.FlyFrames(_e.Def.Art) : new Sprite[0];
            }

            public EnemyView(Enemy e, Transform parent)
            {
                _e = e;
                _fromGate = e.Pos.Y >= Layout.SpawnY - 0.5f;
                _phase = Random.Range(0f, 10f);
                _jit = e.Big ? 0f : Random.Range(0f, 0.22f);
                _h = e.Def.Size * (e.Def.IsBoss ? 1.06f : e.Big ? 1.04f : 1.08f);
                _root = new GameObject(e.Def.Name).transform;
                _root.SetParent(parent, false);
                _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 0, new Color(0.03f, 0.05f, 0.09f, 0.54f), "shadow");
                _shadow.transform.localScale = new Vector3(_h * 0.72f, _h * 0.24f, 1);
                if (e.Def.Kind == EnemyKind.Porter || e.Big)
                {
                    var c = e.Def.Kind == EnemyKind.Porter ? Pal.Gold : e.Def.IsBoss ? Pal.Red : Pal.Purple;
                    _aura = WorldFx.Spr(_root, Art.SoftDot, Vector2.zero, 1, 0, c.A(0.5f), "aura");
                    _aura.transform.localScale = new Vector3(_h * 1.2f, _h * 0.45f, 1);
                }
                TakeFrames();
                if (!ArtPack.Ready(e.Def.Art)) Art.Late(_root, e.Def.Art, TakeFrames);
                (_size, _cy) = Art.FrameBox(e.Def.Art, _h);
                _body = WorldFx.Spr(_root, _frames[0], new Vector2(0, _cy), _size, 0, null, "body");
                _body.flipX = !e.Def.IsBoss && (Mathf.Abs(e.LaneX - e.Pos.X) > 0.25f ? e.LaneX > e.Pos.X : Random.value < 0.5f);
                Bend.Use(_body);
                _bend = Bend.Meta(e.Def.Art);
                if (e.Def.Kind == EnemyKind.Porter)
                    _tag = WorldFx.Spr(_root, Art.Img("ic_chest"), new Vector2(0, _h + 0.3f), 0.45f, 0, null, "tag");

                // 血条尺寸对标《蔚蓝星球》参考图：首领 1.08×0.118（窄于车身不越肩，正中嵌 xN），精英 0.78×0.088，小怪 0.44×0.058
                _barRoot = new GameObject("bar").transform;
                _barRoot.SetParent(_root, false);
                bool boss = e.Def.IsBoss;
                _bw = boss ? 1.08f : e.Big ? 0.78f : e.Def.Kind == EnemyKind.Porter ? 0.64f : 0.44f;
                _bh = boss ? 0.118f : e.Big ? 0.088f : 0.058f;
                _barBaseY = _h + (boss ? 0.28f : e.Big ? 0.24f : e.Def.Kind == EnemyKind.Porter ? 0.64f : 0.22f) + (e.Def.Flying ? FlyH : 0f);
                _barRoot.localPosition = new Vector2(0, _barBaseY);

                float pad = boss ? 0.052f : e.Big ? 0.040f : 0.030f;
                _barBg = BarPiece("bg", _bw + pad, _bh + pad, new Color(0.05f, 0.07f, 0.10f, 0.98f));
                if (boss)
                    BarPiece("rim", _bw + 0.020f, _bh + 0.020f, Pal.Hex("E8BA54"));
                _barTrack = BarPiece("track", _bw, _bh, new Color(0.18f, 0.12f, 0.11f, 1f));
                if (boss)
                    _layerText = WorldFx.I.Pinned(25, Color.white, UnityEngine.TextAnchor.MiddleCenter);
                else if (e.Big)
                    _layerText = WorldFx.I.Pinned(22, Pal.Hex("FFF2B0"), UnityEngine.TextAnchor.MiddleCenter);
                _barGhost = BarPiece("ghost", _bw, _bh, new Color(1f, 0.99f, 0.92f, 0.98f));
                Color baseFill = e.Def.Kind == EnemyKind.Porter ? Pal.Hex("F5B82E") : Pal.Hex("F59B23");
                _bar = BarPiece("fill", _bw, _bh, baseFill);
                _barHi = BarPiece("hi", _bw - 0.016f, _bh * 0.36f, new Color(1f, 1f, 1f, 0.40f));
                _barHi.transform.localPosition = new Vector2(0, _bh * 0.22f);
                if (boss || e.Big)
                {
                    int ticks = boss ? 4 : 3;
                    for (int k = 1; k < ticks; k++)
                    {
                        var tk = WorldFx.Spr(_barRoot, Art.White, new Vector2(-_bw * 0.5f + _bw * k / ticks, 0f), 1f, 0, new Color(0.05f, 0.06f, 0.09f, 0.48f), "tick");
                        tk.transform.localScale = new Vector3(0.016f, _bh, 1f);
                    }
                }
                _barRoot.gameObject.SetActive(false);
                _lastWorld = e.Pos.ToV();
                _lastSimY = _lastWorld.y;
                _step = Random.Range(0f, 2f);
                _walkPhase = Random.Range(0f, 8f);
                Tick(false);
            }

            public void Tick(bool rage)
            {
                var e = _e;
                var p = e.Pos.ToV();
                float simJump = p.y - _lastSimY;
                _lastSimY = p.y;
                if (simJump > 0.08f) _slideOffY -= simJump;
                bool sliding = _slideOffY < -0.02f;
                if (_slideOffY < -0.001f)
                {
                    _slideOffY = Mathf.Lerp(_slideOffY, 0f, 1f - Mathf.Exp(-12f * Time.deltaTime));
                    if (_slideOffY > -0.004f) _slideOffY = 0f;
                }
                float near = sliding ? 0f : Mathf.Clamp01((e.Def.StopY + 0.8f - p.y) / 0.8f);
                p.y += _slideOffY + _jit * near;
                _root.localPosition = p;
                if (sliding && !e.Def.Flying && Random.value < Time.deltaTime * 14f)
                    WorldFx.I.Dust(p + new Vector2(Random.Range(-0.12f, 0.12f), -0.02f), _h * 0.42f, DustCol.A(0.45f), 0.35f, 95);
                int order = WorldFx.Order(p.y);
                _shadow.sortingOrder = 120;
                if (_aura) { _aura.sortingOrder = 121; _aura.color = _aura.color.A(0.35f + 0.2f * Mathf.Sin(Time.time * 5f)); }
                _body.sortingOrder = order;
                if (_tag) { _tag.sortingOrder = order + 2; _tag.transform.localPosition = new Vector2(0, _h + 0.3f + Mathf.Sin(Time.time * 5f) * 0.06f); }
                int bo = order + 3;
                foreach (Transform piece in _barRoot) piece.GetComponent<SpriteRenderer>().sortingOrder = bo++;

                float t = Time.time + _phase;
                bool walking = !e.Attacking && e.Stun <= 0 && !sliding;
                bool cav = e.Def.Kind == EnemyKind.Cavalry;
                // 按屏幕实际世界位移推进步伐，杜绝透视拉伸区滑步或腿乱蹬。
                float moved = walking ? (p - _lastWorld).magnitude : 0f;
                _lastWorld = p;
                if (moved > 0.5f) moved = 0f;
                float stride = _h * (cav ? 0.50f : e.Big ? 0.36f : 0.30f);
                int stepBefore = (int)_step;
                _step += moved / stride;
                _walkW = Mathf.MoveTowards(_walkW, walking && moved > 0f ? 1f : 0f, Time.deltaTime * 6f);

                bool walkAnim = _walk.Length > 0 && walking && _walkW > 0.01f;
                if (e.Big && walking && (int)_step != stepBefore && !walkAnim)
                    WorldFx.I.Dust(p + new Vector2(0, -0.02f), _h * 0.5f, DustCol.A(0.28f), 0.4f, 95);
                int frame = 0;
                float lunge = 0f;
                bool fly = e.Def.Flying;
                if (fly) frame = (int)(t * 7f) % 2;
                if (e.Attacking && e.Stun <= 0)
                {
                    var ek = e.Def.Kind;
                    float period = ek == EnemyKind.Crossbow || ek == EnemyKind.LiuMenglong ? 1.6f : ek == EnemyKind.Catapult ? 3f : 1f;
                    float k = Mathf.Clamp01(e.AtkCd / period);
                    frame = k > 0.72f ? 3 : k < 0.32f ? 2 : 0;
                    lunge = k > 0.8f ? (k - 0.8f) / 0.2f : 0f;
                }
                frame %= _frames.Length;
                var sprite = _frames[frame];
                if (walkAnim)
                {
                    float dt = _stopT > 0 ? 0f : Time.deltaTime;
                    float plant = dt > 1e-4f ? _walk.Length * (moved / dt) / (2f * stride) : 0f;
                    float fps = plant >= AnimMeta.WalkFps
                        ? Mathf.Min(plant, WalkFpsCap)
                        : Mathf.Max(Mathf.Sqrt(plant * AnimMeta.WalkFps), WalkFpsMin);
                    float stepAt = _walkPhase * 2f / _walk.Length;
                    _walkPhase += fps * dt;
                    if (e.Big && (int)(_walkPhase * 2f / _walk.Length) != (int)stepAt)
                        WorldFx.I.Dust(p + new Vector2(0, -0.02f), _h * 0.5f, DustCol.A(0.28f), 0.4f, 95);
                    sprite = _walk[(int)_walkPhase % _walk.Length];
                }
                bool flyAnim = fly && _fly.Length > 0 && !(e.Attacking && e.Stun <= 0);
                if (flyAnim) sprite = _fly[(int)(t * 9f) % _fly.Length];
                if (_body.sprite != sprite) _body.sprite = sprite;

                // 从城门幽暗拱洞内踏出：刚进洞口时压暗微缩，跨过门槛自然受光放大，影子随落脚渐实。
                float emerge = _fromGate ? Mathf.Clamp01((Layout.SpawnY + 0.32f - e.Pos.Y) / 0.82f) : 1f;
                float emergeScale = Mathf.Lerp(0.86f, 1f, Tween.OutCubic(emerge));

                float bendW = walkAnim ? 0f : _walkW;
                float s = Mathf.Sin(_step * Mathf.PI) * bendW;
                float reach = (cav ? 0.05f : e.Big ? 0.045f : 0.055f) * bendW;
                float raise = (cav ? 0.06f : e.Big ? 0.075f : 0.1f) * bendW;
                float legL = Foot(_step, reach, raise);
                float legR = Foot(_step + 1f, reach, raise);
                float pass = Mathf.Abs(s);
                float bob = (pass - 0.5f) * (cav ? 0.03f : 0.018f) * bendW;
                float shear = s * (e.Big ? 0.018f : 0.028f);
                float landing = (1f - pass) * bendW;
                float breathe = _walkW < 0.5f ? Mathf.Sin(t * 3.2f) * 0.018f * (1f - _walkW) : 0f;
                if (e.HitT > 0.09f && _redT < 0.16f)
                {
                    _redT = 0.32f;
                    _squashT = Mathf.Max(_squashT, 0.15f);
                    _barShakeT = Mathf.Max(_barShakeT, 0.11f);
                }
                float hit = 0f;
                if (_redT > 0)
                {
                    _redT -= Time.deltaTime;
                    hit = Mathf.Clamp01(_redT / 0.16f);
                }

                // Q 弹受击挤压回弹曲线：先横向受压变扁，再纵向微拉回弹，扎实有肉感
                float sqX = 0f, sqY = 0f;
                if (_squashT > 0)
                {
                    _squashT -= Time.deltaTime;
                    float sk = 1f - Mathf.Clamp01(_squashT / 0.20f);
                    float wave = Mathf.Sin(sk * Mathf.PI * 1.65f) * (1f - sk * 0.38f);
                    float amp = e.Def.IsBoss ? 0.095f : e.Big ? 0.14f : 0.21f;
                    sqX = wave * amp;
                    sqY = -wave * amp * 0.88f;
                }

                shear += hit * hit * (_body.flipX ? 0.11f : -0.11f) * (e.Big ? 0.6f : 1f);
                float sx = 1f + sqX + landing * 0.012f + lunge * 0.05f - breathe * 0.4f;
                float sy = 1f + sqY - landing * 0.015f - lunge * 0.07f + breathe;
                if (e.Attacking) bob = -lunge * 0.04f;
                float lift = fly ? FlyH + Mathf.Sin(t * 4f) * 0.08f : 0f;
                if (fly) { legL = legR = 0f; bob = 0f; }
                var jolt = Vector2.zero;
                if (_stopT > 0)
                {
                    _stopT -= Time.deltaTime;
                    jolt = _knockDir * (_knockPow * 0.135f);
                    shear += _knockDir.x * 0.13f * _knockPow;
                }
                else if (_knockT > 0)
                {
                    _knockT -= Time.deltaTime;
                    float back = Mathf.Clamp01(_knockT / KnockBack);
                    jolt = _knockDir * (_knockPow * 0.135f * back * back);
                }
                _body.transform.localPosition = new Vector2(0, _cy * emergeScale + lift) + jolt;
                _body.transform.localRotation = e.Def.Kind == EnemyKind.Lantern ? Quaternion.Euler(0, 0, Mathf.Sin(t * 3.5f) * 6f) : Quaternion.identity;
                _body.transform.localScale = Vector3.one * (_size * emergeScale);
                float footPulse = fly ? 1f : 1f + 0.05f * Mathf.Cos((walkAnim ? _walkPhase * 2f / _walk.Length : _step) * Mathf.PI * 2f) * _walkW;
                if (fly) _shadow.transform.localScale = new Vector3(_h * 0.56f, _h * 0.18f, 1f) * emergeScale;
                else _shadow.transform.localScale = new Vector3(_h * 0.72f * footPulse, _h * 0.24f * footPulse, 1f) * emergeScale;
                _shadow.color = new Color(0.03f, 0.05f, 0.09f, (e.Diving ? 0.16f : 0.54f) * Mathf.Clamp01(emerge * 1.2f));

                // 受击染红：前段稳住，后段平滑褪回原色，不闪、不跳白。
                Bend.Set(_body, _bend, bob, shear, sx, sy, legL, legR, hit, new Color(1f, 0.26f, 0.22f, 1f));
                if (e.ChargeT > 0 && Random.value < 0.5f) WorldFx.I.Dust(p, _h * 0.8f, DustCol.A(0.5f), 0.5f, 95);
                if (e.Shield > 0)
                {
                    if (_shield == null) _shield = WorldFx.Additive(WorldFx.Spr(_root, Art.Ring, new Vector2(0, _h * 0.5f), _h * 1.25f, 0, Pal.Gold.A(0.6f), "shield"));
                    _shield.sortingOrder = order + 4;
                    _shield.color = Pal.Gold.A(0.35f + 0.2f * Mathf.Sin(t * 6f));
                    _shield.transform.localScale = Vector3.one * _h * (1.25f + 0.04f * Mathf.Sin(t * 4f));
                }
                else if (_shield != null)
                {
                    WorldFx.I.Ring(p + new Vector2(0, _h * 0.5f), _h * 0.8f, Pal.Gold, 0.4f);
                    Object.Destroy(_shield.gameObject);
                    _shield = null;
                }
                Color c = Color.white;
                if (e.SlowT > 0) c = Pal.Hex("A8D8FF");
                if (rage) c = Color.Lerp(c, Pal.Hex("FF9C8C"), 0.35f);
                if (e.HasteT > 0) c = Color.Lerp(c, Pal.Hex("FFC070"), 0.3f);
                if (e.RageT > 0) c = Color.Lerp(c, Pal.Hex("FF5040"), 0.45f + 0.25f * Mathf.Sin(t * 18f));
                if (e.VulnT > 0) c = Color.Lerp(c, Pal.Hex("C890FF"), 0.4f + 0.15f * Mathf.Sin(t * 10f));
                if (e.BurnT > 0)
                {
                    bool poison = Defs.Hero(e.BurnBy).Shot == ShotKind.Wind;
                    var bc = poison ? Pal.Hex("8FE05A") : Pal.Hex("FF8A3A");
                    c = Color.Lerp(c, bc, 0.35f + 0.15f * Mathf.Sin(t * 14f));
                    if (Random.value < Time.deltaTime * 7f)
                        WorldFx.I.Dust(p + new Vector2(Random.Range(-0.25f, 0.25f), _h * 0.35f), _h * 0.35f, bc.A(0.6f), 0.45f, order + 2);
                }
                if (emerge < 1f) c = Color.Lerp(new Color(0.14f, 0.17f, 0.24f), c, emerge);
                float baseA = e.Diving ? 0.28f : 1f;
                float alpha = emerge < 0.99f ? baseA * Mathf.Clamp01(emerge * 1.45f) : Mathf.MoveTowards(_body.color.a, baseA, Time.deltaTime * 6f);
                if (e.Diving && Random.value < Time.deltaTime * 4f) WorldFx.I.Ring(p + new Vector2(0, 0.1f), _h * 0.45f, Pal.Hex("8FD0FF"), 0.4f);
                if (e.RageT > 0 && Random.value < 0.4f) WorldFx.I.Dust(p, _h * 0.6f, Pal.Hex("FF7050").A(0.5f), 0.4f, 95);
                _body.color = c.A(alpha);

                // 全员统一精悍头顶血条（首领、精英、运宝官常驻，小怪受伤才亮出，满血干净无噪点）
                bool showBar = e.Def.IsBoss || e.Big || e.Def.Kind == EnemyKind.Porter || e.Hp < e.MaxHp;
                if (!showBar) _barPop = 0f;
                if (_barRoot.gameObject.activeSelf != showBar) { _barRoot.gameObject.SetActive(showBar); if (showBar) _barPop = 0.01f; }
                if (_layerText) _layerText.gameObject.SetActive(showBar);
                if (showBar)
                {
                    // 受击时血条微震 + 醒目脉冲弹跳，初显时顺滑弹出
                    if (_barPop < 1f) _barPop = Mathf.MoveTowards(_barPop, 1f, Time.deltaTime * 9f);
                    var barJit = Vector2.zero;
                    float barPulse = Tween.OutBack(_barPop);
                    if (_barShakeT > 0)
                    {
                        _barShakeT -= Time.deltaTime;
                        float bk = Mathf.Clamp01(_barShakeT / 0.18f);
                        barJit = new Vector2(Mathf.Sin(_barShakeT * 95f) * 0.042f * bk, 0.022f * bk);
                        barPulse *= 1f + 0.14f * bk;
                    }
                    // 首领在靠近城门顶栏时自动将头顶血条钳在波次栏下方，任何位置都清晰可见
                    float maxWorldY = Game.Cam != null ? Game.Cam.transform.localPosition.y + Game.Cam.orthographicSize - 1.55f : 99f;
                    float worldBarY = Mathf.Min(p.y + _barBaseY, maxWorldY);
                    _barRoot.localPosition = new Vector2(barJit.x, worldBarY - p.y + barJit.y);
                    _barRoot.localScale = new Vector3(1f + (barPulse - 1f) * 0.45f, barPulse, 1f);

                    float frac = Mathf.Clamp01(e.Hp / e.MaxHp);
                    if (_layerText)
                    {
                        int totalLayers = e.Def.IsBoss ? BossLayers : EliteLayers;
                        var (layer, f, cur, next) = Pal.Layers(Mathf.Max(0, e.Hp), e.MaxHp, totalLayers);
                        if (layer != _layer)
                        {
                            if (_layer > 0)
                            {
                                _ghostFrac = 1f;
                                Tween.Pop(_layerText.rectTransform, 0.16f);
                            }
                            _layer = layer;
                            _bar.color = cur;
                            _barTrack.color = next;
                            _layerText.text = "x" + layer;
                        }
                        frac = f;
                        WorldFx.Place(_layerText, (Vector2)_barRoot.position + new Vector2(0f, 0.005f));
                    }
                    _ghostFrac = _ghostFrac < frac ? frac : Mathf.MoveTowards(_ghostFrac, frac, Time.deltaTime * 1.15f);
                    SetBarWidth(_bar, frac, _bw, _bh);
                    SetBarWidth(_barGhost, _ghostFrac, _bw, _bh);
                    SetBarWidth(_barHi, frac, _bw - 0.016f, _bh * 0.34f);
                    _barHi.color = _barHi.color.A(frac > 0.02f ? 0.34f : 0f);
                }

                if (e.Stun > 0)
                {
                    if (_stun == null) _stun = WorldFx.Spr(_root, Art.Img("fx_star"), new Vector2(0, _h + 0.1f), 0.32f, 0, null, "stun");
                    _stun.sortingOrder = order + 5;
                    _stun.transform.localPosition = new Vector2(Mathf.Cos(t * 8f) * 0.2f, _h + 0.08f + Mathf.Sin(t * 8f) * 0.05f);
                    _stun.transform.localRotation = Quaternion.Euler(0, 0, t * 300f);
                }
                else if (_stun != null)
                {
                    Object.Destroy(_stun.gameObject);
                    _stun = null;
                }
            }

            public void Die()
            {
                var fx = WorldFx.I;
                var p = _e.Pos.ToV();
                bool boss = _e.Def.IsBoss;
                bool big = _e.Big && !boss;
                _barRoot.gameObject.SetActive(false);
                DropLayerText();
                if (_stun) _stun.gameObject.SetActive(false);
                if (_tag) _tag.gameObject.SetActive(false);
                if (_aura) _aura.enabled = false;
                if (_shield) _shield.enabled = false;

                // 小怪以前只扬一点土、歪一下就淡掉。现在先弹起再旋开，脚下尘烟和头顶金星一起散开。
                var chest = p + new Vector2(0, _h * 0.48f);
                int ord = WorldFx.Order(p.y);
                float scale = boss ? 1.7f : big ? 1.35f : 1f;
                fx.Flash(chest, _h * 1.45f * scale, new Color(1f, 0.97f, 0.84f, 0.75f), 0.18f, 9540);
                fx.Burst(Art.Img("fx_star"), chest, _h * 0.95f * scale, 0.28f, 9560, Color.white, 0f, 0.35f, true);
                fx.Ring(p + new Vector2(0, 0.04f), _h * 0.82f * scale, Pal.Hex("FFE7B0").A(0.9f), 0.36f, ord + 6);
                fx.Dust(p, _h * 1.7f * scale, DustCol.A(0.92f), 0.5f, ord + 8);
                fx.Smoke(p + new Vector2(0, _h * 0.22f), big || boss ? 4 : 3, _h * 0.5f * scale, SmokeCol.A(0.8f), 0.72f, _h * 0.22f, _h * 0.7f, ord + 18);
                fx.Sparks(Art.Img("fx_star"), chest, big || boss ? 8 : 6, 0.2f * scale, 2.8f * scale, Pal.Hex("FFE9A2"), 0.46f, 9620, 2.4f, true);
                if (big)
                {
                    fx.Burst(Art.Img("fx_shock"), chest, _h * 1.65f, 0.34f, 9550, Pal.Hex("FFD27A"), 60f, 0.42f, true);
                    fx.GroundWave(p, _h * 1.05f, Pal.Hex("FFE3B0").A(0.8f), 0.38f, ord + 4);
                    fx.Debris(p, 5, 0.2f, 2.5f);
                }
                if (boss)
                {
                    for (int i = 0; i < 5; i++)
                    {
                        var bp = p + new Vector2(Random.Range(-1.2f, 1.2f), Random.Range(0.2f, 2.2f));
                        fx.Burst(Art.Img("fx_fireball"), bp, Random.Range(1.6f, 2.4f), 0.5f, 9610, null, 0, 0.3f, true);
                        fx.Burst(Art.Img("fx_explode"), bp, Random.Range(1.6f, 2.6f), 0.6f, 9600);
                    }
                    fx.LightPool(p, 6f, Fire.A(0.9f), 0.9f);
                    fx.Decal(Art.Img("fx_crack"), p, 3.4f, new Color(0.1f, 0.07f, 0.05f, 0.7f), 4f, 0.5f, 91);
                    fx.Decal(Art.Img("fx_scorch"), p, 3.6f, ScorchCol, 4f);
                    fx.Smoke(p + new Vector2(0, 0.8f), 7, 1.6f, SmokeCol, 1.6f, 1.4f, 1.4f);
                    fx.Debris(p, 10, 0.3f, 3.5f, 1.3f);
                    fx.GroundWave(p, 3.5f, Pal.Hex("FFD9A0"), 0.8f);
                    fx.ScreenFlash(Color.white.A(0.5f), 0.4f);
                    fx.Shake(0.35f, 0.6f);
                    Sfx.Play(Snd.UltBomb);
                }
                var body = _body;
                var bend = _bend;
                var root = _root;
                float side = body.flipX ? 1 : -1;
                var sh = _shadow;
                float hop = boss ? 0.7f : big ? 0.55f : 0.4f;
                float spin = boss ? 240f : big ? 200f : 150f;
                Tween.Run(root, 0.46f, k =>
                {
                    if (!body) return;
                    float pop = k < 0.16f ? Mathf.Lerp(1f, 1.34f, k / 0.16f) : Mathf.Lerp(1.34f, 0.06f, Tween.InCubic((k - 0.16f) / 0.84f));
                    float up = Mathf.Sin(Mathf.Clamp01(k / 0.4f) * Mathf.PI) * hop;
                    Bend.Set(body, bend, 0f, 0f, pop, pop, 0f, 0f, Mathf.Clamp01(1.15f - k * 2.4f), new Color(1f, 0.62f, 0.28f, 1f));
                    body.transform.localRotation = Quaternion.Euler(0, 0, side * spin * Tween.OutCubic(k));
                    body.transform.localPosition = new Vector2(side * -0.46f * k, _cy + up);
                    float a = k < 0.22f ? 1f : 1f - (k - 0.22f) / 0.78f;
                    body.color = Color.white.A(a);
                    if (sh) sh.color = new Color(0.03f, 0.05f, 0.09f, 0.5f * (1f - k));
                }, () => { if (root) Object.Destroy(root.gameObject); });
            }

            public void Escape()
            {
                DropLayerText();
                var body = _body;
                var root = _root;
                Tween.Run(root, 0.5f, k =>
                {
                    if (!body) return;
                    body.color = body.color.A(1 - k);
                    root.localScale = Vector3.one * (1 - 0.3f * k);
                }, () => { if (root) Object.Destroy(root.gameObject); });
            }

            public void Destroy()
            {
                DropLayerText();
                Object.Destroy(_root.gameObject);
            }

            void DropLayerText()
            {
                if (_layerText) Object.Destroy(_layerText.gameObject);
            }
        }

        internal sealed class ShotView
        {
            readonly Shot _s;
            readonly Transform _root;
            SpriteRenderer _sr, _shadow, _fuse, _aura;
            TrailRenderer _trail;
            float _puffAt;
            bool _started, _weapon, _spin, _melee, _drop;
            float _len;
            MeleeStyle _style;
            int _cut;
            float _side;
            SpriteRenderer _ghostA, _ghostB, _lance, _vortex;
            TrailRenderer[] _trails;
            float _shellSize;

            enum MeleeStyle { Blade, Axe, Spear, Fist }

            static Material _trailMat;

            public ShotView(Shot s, Transform parent)
            {
                _s = s;
                _root = new GameObject("shot").transform;
                _root.SetParent(parent, false);
                var hd = Defs.Hero(s.Hero);
                // 近战：兵器从好汉手上一路挥到敌人身上，刀边走边抡、斧打着旋、枪直捅、拳带风。法师的“石头”是法术从天上砸下来。
                _melee = !s.Ult && (s.Kind == ShotKind.Punch || s.Kind == ShotKind.Spear);
                _drop = s.Kind == ShotKind.Stone && hd.Kind == Sim.Role.Mage;
                _weapon = !_melee && !_drop && hd.Proj != null && s.Kind == hd.Shot && s.Kind != ShotKind.Slam;
                if (_melee)
                {
                    BuildMelee(hd);
                    Tick();
                    return;
                }
                if (_drop)
                {
                    var gold = Pal.Hex(hd.Tint ?? "FFD24A");
                    float size = s.Ult ? 0.96f : 0.72f;
                    _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.45f), "shadow");
                    _fuse = WorldFx.Additive(WorldFx.Spr(_root, Art.SoftDot, Vector2.zero, size * 2.1f, 9199, gold.A(0.75f), "aura"));
                    _sr = WorldFx.Spr(_root, Art.Img(hd.Proj ?? "wp_goldbrick"), Vector2.zero, size, 9200);
                    _trail = AddTrail(0.14f, size * 0.55f, gold);
                    if (s.Scale > 1f) _root.localScale = Vector3.one * s.Scale;
                    Tick();
                    return;
                }
                if (_weapon)
                {
                    _spin = hd.ProjSpin;
                    float len = _len = WeaponLen(s.Kind) * hd.ProjSize * (s.Ult ? 1.5f : 1f) * (s.Crit ? 1.15f : 1f);
                    _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.40f), "shadow");
                    _sr = WorldFx.Spr(_root, Art.Img(hd.Proj), Vector2.zero, len, 9205);
                    var tc = hd.Tint != null ? Pal.Hex(hd.Tint) : Pal.Hex("8CE870");
                    if (hd.Proj == "wp_slash") _sr.color = tc;
                    if (s.Kind == ShotKind.Arrow)
                    {
                        bool piercing = s.Pierce > 0 || s.Ult;
                        Color coneCol = piercing ? Pal.Hex("68F8BA") : Color.white;
                        _aura = WorldFx.Spr(_sr.transform, Art.Img("fx_arrow_cone"), new Vector2(0f, 0.12f),
                            piercing ? 1.32f : 1.04f, 9204, coneCol.A(piercing ? 0.94f : 0.78f), "cone");
                    }
                    else
                    {
                        if (_spin && hd.Physical)
                        {
                            _aura = WorldFx.Spr(_sr.transform, Art.Img("fx_spin_vortex"), Vector2.zero, 1.48f, 9204, Color.white.A(0.92f), "vortex");
                            Wisp(_sr.transform, 0.2f, len * 0.5f, s.Crit ? Pal.Hex("FFC24A") : Pal.Hex("1A9BE8"), false, 0.75f);
                        }
                        else _trail = AddTrail(0.14f, len * 0.28f, s.Crit ? Pal.Hex("FFE29A") : Pal.Hex("18B8F0").A(0.62f), false);
                    }
                    if (s.Scale > 1f) _root.localScale = Vector3.one * s.Scale;
                    Tick();
                    return;
                }
                switch (s.Kind)
                {
                    case ShotKind.Arrow:
                    {
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.38f), "shadow");
                        bool piercing = s.Pierce > 0 || s.Ult;
                        float arrSz = s.Ult ? 1.82f : s.Crit ? 1.56f : piercing ? 1.50f : 1.40f;
                        _sr = WorldFx.Spr(_root, Art.Img(s.Ult ? "fx_goldarrow" : "fx_arrow"), Vector2.zero, arrSz, 9205);
                        Color coneCol = s.Ult ? Pal.Hex("FFD84A") : Color.white;
                        _aura = WorldFx.Spr(_sr.transform, Art.Img("fx_arrow_cone"), new Vector2(0f, 0.12f),
                            s.Ult ? 1.42f : piercing ? 1.28f : 1.02f, 9204, coneCol.A(s.Ult ? 0.98f : piercing ? 0.95f : 0.76f), "cone");
                        break;
                    }
                    case ShotKind.Beam:
                    {
                        var c = Pal.Hex(Defs.Hero(s.Hero).Tint ?? "FF8A2A");
                        _sr = WorldFx.Additive(WorldFx.Spr(_root, Art.Beam, Vector2.zero, 1f, 9200, c));
                        _fuse = WorldFx.Additive(WorldFx.Spr(_root, Art.SoftDot, Vector2.zero, 0.7f, 9201, c.A(0.8f), "tip"));
                        break;
                    }
                    case ShotKind.Bomb:
                    case ShotKind.MiniBomb:
                    {
                        float size = s.Kind == ShotKind.MiniBomb ? 0.38f : 0.62f;
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, size, 130, new Color(0.02f, 0.05f, 0.1f, 0.45f));
                        _sr = WorldFx.Spr(_root, Art.Img("ic_bomb"), Vector2.zero, size, 9200);
                        _fuse = WorldFx.Additive(WorldFx.Spr(_sr.transform, Art.Sparkle, new Vector2(0.2f, 0.45f), 0.75f, 9201, Fire.A(0.95f), "fuse"));
                        _trail = AddTrail(0.14f, size * 0.24f, new Color(0.75f, 0.72f, 0.68f, 0.42f), false);
                        break;
                    }
                    case ShotKind.Bolt:
                        _sr = WorldFx.Spr(_root, Art.Img("ic_arrow"), Vector2.zero, 0.38f, 9200, Pal.Hex("5A5048"));
                        break;
                    case ShotKind.Punch:
                        _sr = WorldFx.Spr(_root, Art.Img("wp_ironfist"), Vector2.zero, s.Ult ? 1.05f : 0.74f, 9200);
                        if (!s.Ult) _trail = AddTrail(0.11f, 0.22f, Pal.Hex("E8EEF6").A(0.42f), false);
                        break;
                    case ShotKind.Slam:
                    {
                        // 关胜青龙偃月刀 / 鲁智深水磨禅杖：高抛旋转劈砸 + 周身环绕浓郁深海冰青破风旋涡（标准Alpha混合，亮石板上极度醒目）！
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.45f), "shadow");
                        string wArt = hd.Proj ?? "wp_broadsword";
                        float wSz = s.Ult ? 1.78f : 1.54f;
                        _sr = WorldFx.Spr(_root, Art.Img(wArt), Vector2.zero, wSz, 9208);
                        _aura = WorldFx.Spr(_sr.transform, Art.Img("fx_spin_vortex"), Vector2.zero, 1.42f, 9207, Color.white.A(0.92f), "vortex");
                        _ghostA = WorldFx.Spr(_root, Art.Img(wArt), Vector2.zero, wSz, 9206, Color.white.A(0.24f), "ghost");
                        Wisp(_sr.transform, 0.22f, 0.62f, Pal.Hex("1A9BE8"), false, 0.75f);
                        break;
                    }
                    case ShotKind.Stone:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.40f), "shadow");
                        _sr = WorldFx.Spr(_root, Art.Img("fx_rock" + Random.Range(0, 3)), Vector2.zero, s.Ult ? 0.60f : 0.46f, 9200);
                        _trail = AddTrail(0.10f, s.Ult ? 0.16f : 0.11f, Pal.Hex("E4DFD4").A(0.48f), false);
                        break;
                    case ShotKind.Spear:
                        _sr = WorldFx.Spr(_root, Art.Img("ic_sword"), Vector2.zero, 0.95f, 9200, Pal.Hex("E8F2FF"));
                        _trail = AddTrail(0.12f, 0.22f, Pal.Hex("CFE8FF"));
                        break;
                    case ShotKind.Wind:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.28f), "shadow");
                        _sr = WorldFx.Additive(WorldFx.Spr(_root, Art.Img("fx_wave"), Vector2.zero, s.Ult ? 1.5f : 0.78f, 9200, Pal.Hex("9FF5D8").A(0.88f)));
                        _trail = AddTrail(0.16f, s.Ult ? 0.52f : 0.28f, Pal.Hex("B8FFE6"));
                        break;
                    case ShotKind.Hammer:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.42f), "shadow");
                        _sr = WorldFx.Spr(_root, Art.Img("fx_rock1"), Vector2.zero, 0.68f, 9200, Pal.Hex("8C8C96"));
                        _trail = AddTrail(0.2f, 0.28f, Pal.Hex("FFB070"));
                        break;
                    case ShotKind.Boulder:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.42f), "shadow");
                        _sr = WorldFx.Spr(_root, Art.Img("fx_rock" + Random.Range(0, 3)), Vector2.zero, 0.78f, 9200, Pal.Hex("B09A80"));
                        _trail = AddTrail(0.16f, 0.25f, Pal.Hex("D8C8B0"), false);
                        break;
                    case ShotKind.Ball:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.42f), "shadow");
                        _sr = WorldFx.Additive(WorldFx.Spr(_root, Art.Img("fx_fireball"), Vector2.zero, 0.96f, 9200));
                        _trail = AddTrail(0.3f, 0.5f, Fire);
                        break;
                    case ShotKind.Fireball:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.42f), "shadow");
                        _sr = WorldFx.Additive(WorldFx.Spr(_root, Art.Img("fx_fireball"), Vector2.zero, s.Ult ? 1.38f : 0.84f, 9200));
                        _trail = AddTrail(s.Ult ? 0.3f : 0.2f, s.Ult ? 0.6f : 0.36f, Fire);
                        break;
                    case ShotKind.Lasso:
                        _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.32f), "shadow");
                        _sr = WorldFx.Spr(_root, Art.Img("wp_lasso"), Vector2.zero, s.Ult ? 0.96f : 0.78f, 9200);
                        _trail = AddTrail(0.18f, 0.14f, Pal.Hex("E8483A"));
                        break;
                    case ShotKind.Qi:
                    {
                        var c = hd.Tint != null ? Pal.Hex(hd.Tint) : Pal.Hex("C8E2FA");
                        _sr = WorldFx.Spr(_root, Art.Crescent, Vector2.zero, 1.38f, 9200, c.A(0.78f));
                        _fuse = WorldFx.Spr(_root, Art.Crescent, Vector2.zero, 1.02f, 9201, Color.white.A(0.92f), "core");
                        _trail = AddTrail(0.10f, 0.20f, c.A(0.45f), false);
                        break;
                    }
                    case ShotKind.Lightning:
                    case ShotKind.Frost:
                        break;
                }
                var tint = Defs.Hero(s.Hero).Tint;
                if (tint != null && _sr && (s.Kind == ShotKind.Wind || s.Kind == ShotKind.Stone || s.Kind == ShotKind.Spear))
                    _sr.color = Pal.Hex(tint).A(_sr.color.a);
                if (s.Scale > 1f && s.Kind != ShotKind.Beam) _root.localScale = Vector3.one * s.Scale;
                Tick();
            }

            static Material _plainMat;

            TrailRenderer AddTrail(float time, float width, Color c, bool add = true, Transform host = null)
            {
                if (_trailMat == null) _trailMat = WorldFx.AddMat;
                if (_plainMat == null) _plainMat = new Material(Shader.Find("Sprites/Default"));
                var tr = (host != null ? host.gameObject : _sr != null ? _sr.gameObject : _root.gameObject).AddComponent<TrailRenderer>();
                tr.sharedMaterial = add ? _trailMat : _plainMat;
                tr.time = time;
                tr.startWidth = width;
                tr.endWidth = 0f;
                tr.startColor = c.A(0.75f);
                tr.endColor = c.A(0);
                tr.sortingOrder = 9150;
                tr.minVertexDistance = 0.05f;
                tr.emitting = false;
                return tr;
            }

            /// <summary>丝缕拖尾：贴图里几股风丝往尾部散开、断开，头实尾透。</summary>
            TrailRenderer Wisp(Transform host, float time, float width, Color c, bool add, float a)
            {
                var tr = host.gameObject.AddComponent<TrailRenderer>();
                tr.sharedMaterial = WorldFx.WispTrail(add);
                tr.time = time;
                tr.startWidth = width;
                tr.endWidth = width * 0.25f;
                tr.colorGradient = WorldFx.Fade(c, a);
                tr.sortingOrder = add ? 9151 : 9150;
                tr.minVertexDistance = 0.04f;
                tr.emitting = false;
                if (_trail == null) _trail = tr;
                return tr;
            }

            public void Tick()
            {
                var s = _s;
                bool visible = s.T >= 0;
                if (!visible)
                {
                    _root.gameObject.SetActive(false);
                    return;
                }
                if (!_started)
                {
                    _started = true;
                    _root.gameObject.SetActive(true);
                    if (_sr) _sr.enabled = true;
                    if (_shadow) _shadow.enabled = true;
                    if (s.Kind == ShotKind.Lightning)
                    {
                        var from = s.From.ToV() + (s.Ult ? Vector2.zero : new Vector2(0, 0.4f));
                        if (!s.Ult) WorldFx.I.Arc(from, s.To.ToV() + new Vector2(0, 0.35f), Pal.Hex("8FD0FF"), 0.14f, 0.18f);
                    }
                    if (_drop)
                    {
                        var hd = Defs.Hero(s.Hero);
                        WorldFx.I.Rune(s.To.ToV(), s.Ult ? 2.2f : 1.5f, Pal.Hex(hd.Tint ?? "FFD24A").A(0.9f), s.Dur + 0.35f, 120f, 97);
                    }
                }
                if (_melee)
                {
                    TickMelee();
                    return;
                }
                float k = Mathf.Clamp01(s.T / Mathf.Max(0.0001f, s.Dur));
                var a = s.From.ToV();
                var b = s.To.ToV();
                if (_drop)
                {
                    // 金砖从目标头顶正上方加速砸下，越近越大，脚下影子越来越实。
                    float fall = Tween.InCubic(k);
                    var land = b + new Vector2(0, 0.4f);
                    _root.localPosition = Vector2.zero;
                    _sr.transform.localPosition = land + new Vector2(0, 3.2f * (1f - fall));
                    _sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Sin(k * 9f) * 8f);
                    _fuse.transform.localPosition = _sr.transform.localPosition;
                    _fuse.color = _fuse.color.A(0.55f + 0.3f * Mathf.Sin(Time.time * 30f));
                    _shadow.transform.localPosition = b - new Vector2(0, 0.05f);
                    _shadow.transform.localScale = new Vector3(0.6f, 0.16f, 1f) * (0.4f + 0.6f * fall);
                    _shadow.color = new Color(0, 0, 0, 0.1f + 0.3f * fall);
                    if (_trail && !_trail.emitting) _trail.emitting = true;
                    return;
                }
                switch (s.Kind)
                {
                    case ShotKind.Arrow:
                    {
                        _root.localPosition = Vector2.zero;
                        // 落点已经收到直线上最后一个人。箭贴着这条直线飞，不抬高、不画抛物线。
                        float through = 0.22f;
                        var flyEnd = b + (b - a).normalized * through;
                        var p = Vector2.Lerp(a, flyEnd, k);
                        var dir = flyEnd - a;
                        _sr.transform.localPosition = p;
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg - 90f);
                        if (_shadow) _shadow.enabled = false;
                        break;
                    }
                    case ShotKind.Slam:
                    {
                        // 偃月重刀、水磨禅杖腾空重劈：实体重兵高高扬起再迎头劈落，后跟半透残影，地面实影收紧。
                        var from = a + new Vector2(0, 0.68f);
                        var to = b + new Vector2(0, 0.45f);
                        var g = Vector2.Lerp(a, b, k);
                        float arc = 1.28f * 4f * k * (1f - k);
                        var d = to - from;
                        float face = d.sqrMagnitude > 0.001f ? Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg - 90f : 0f;
                        float side = a.x <= b.x ? 1f : -1f;
                        _root.localPosition = Vector2.zero;
                        Vector2 PosAt(float t)
                        {
                            t = Mathf.Clamp01(t);
                            return Vector2.Lerp(from, to, Tween.InCubic(t) * 0.35f + t * 0.65f) + new Vector2(0, 1.28f * 4f * t * (1f - t));
                        }
                        float AngAt(float t)
                        {
                            t = Mathf.Clamp01(t);
                            return face + side * Mathf.Lerp(95f, -55f, t * t * (3f - 2f * t));
                        }
                        _sr.transform.localPosition = PosAt(k);
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, AngAt(k));
                        if (_ghostA)
                        {
                            _ghostA.enabled = k > 0.07f;
                            _ghostA.transform.localPosition = PosAt(k - 0.08f);
                            _ghostA.transform.localRotation = Quaternion.Euler(0, 0, AngAt(k - 0.08f));
                        }
                        if (_shadow)
                        {
                            _shadow.transform.localPosition = g - new Vector2(0, 0.06f);
                            _shadow.transform.localScale = new Vector3(0.78f, 0.22f, 1f) * (0.45f + 0.55f * k);
                        }
                        if (_trail && !_trail.emitting && k > 0.03f) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Bolt:
                    case ShotKind.Punch:
                    {
                        a += new Vector2(0, s.Kind == ShotKind.Bolt ? 0.5f : 0.35f);
                        b += new Vector2(0, s.Kind == ShotKind.Bolt ? 0.2f : 0.4f);
                        if (s.Kind == ShotKind.Punch && s.Ult) a = b + new Vector2(0, 1.2f);
                        var p = Vector2.Lerp(a, b, k);
                        _root.localPosition = p;
                        var d = b - a;
                        float ang = Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg;
                        if (s.Kind == ShotKind.Bolt) _sr.transform.localRotation = Quaternion.Euler(0, 0, ang - 45f);
                        else _sr.transform.localRotation = Quaternion.Euler(0, 0, ang - 90f);
                        if (_trail && !_trail.emitting && k > 0.05f) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Beam:
                    {
                        // 射线从施法者手上直通目标，宽度轻微抖动；尾端一团亮光。
                        var from = a + new Vector2(0, 0.55f);
                        var to = b + new Vector2(0, 0.4f);
                        var d = to - from;
                        _root.localPosition = Vector2.zero;
                        _sr.transform.localPosition = (from + to) * 0.5f;
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
                        float thick = (s.Radius * 2.2f + 0.25f) * (0.85f + 0.15f * Mathf.Sin(Time.time * 47f));
                        _sr.transform.localScale = new Vector3(d.magnitude, thick * 4f, 1f);
                        _fuse.transform.localPosition = to;
                        _fuse.transform.localScale = Vector3.one * thick * (1.6f + 0.3f * Mathf.Sin(Time.time * 31f));
                        break;
                    }
                    case ShotKind.Bomb:
                    case ShotKind.MiniBomb:
                    {
                        float h = s.Kind == ShotKind.MiniBomb ? 0.8f : 1.8f;
                        if (s.Kind != ShotKind.MiniBomb) a += new Vector2(0, 0.5f);
                        var ground = Vector2.Lerp(a, b, k);
                        _root.localPosition = ground;
                        float z = h * 4f * k * (1 - k);
                        _sr.transform.localPosition = new Vector2(0, z + 0.15f);
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, -k * 400f);
                        // 参考：越高越大（离镜头近），引信火星闪烁，身后拖一串灰烟。
                        float baseSize = s.Kind == ShotKind.MiniBomb ? 0.38f : 0.62f;
                        float sz = baseSize * (1f + z * 0.14f);
                        _sr.transform.localScale = Vector3.one * sz;
                        if (_fuse)
                        {
                            _fuse.color = Pal.Hex("FFD27A").A(0.6f + 0.4f * Mathf.Abs(Mathf.Sin(Time.time * 40f)));
                            _fuse.transform.localScale = Vector3.one * (0.8f + 0.3f * Mathf.Abs(Mathf.Sin(Time.time * 33f)));
                        }
                        _shadow.transform.localScale = new Vector3(1.05f, 0.38f, 1f) * baseSize * (0.5f + 0.5f / (1f + z * 0.4f));
                        _shadow.color = new Color(0.02f, 0.05f, 0.1f, 0.46f / (1f + z * 0.28f));
                        if (_trail && !_trail.emitting) _trail.emitting = true;
                        if (s.Kind != ShotKind.MiniBomb && Time.time >= _puffAt)
                        {
                            _puffAt = Time.time + 0.09f;
                            var at = (Vector2)_root.localPosition + new Vector2(0, z + 0.15f);
                            WorldFx.I.Smoke(at, 1, sz * 0.6f, new Color(0.62f, 0.6f, 0.58f, 0.4f), 0.45f, 0.04f, 0.15f, 9150);
                        }
                        break;
                    }
                    case ShotKind.Stone:
                    case ShotKind.Hammer:
                    case ShotKind.Ball:
                    case ShotKind.Boulder:
                    {
                        float h = s.Kind == ShotKind.Stone ? 0.5f + (b - a).magnitude * 0.06f : 2.4f;
                        a += new Vector2(0, s.Kind == ShotKind.Stone ? 0.5f : 1.6f);
                        b += new Vector2(0, s.Kind == ShotKind.Stone ? 0.4f : 0.2f);
                        _root.localPosition = Vector2.zero;
                        var g = Vector2.Lerp(a, b, k);
                        float z = h * 4f * k * (1 - k);
                        _sr.transform.localPosition = g + new Vector2(0, z);
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, -Time.time * 720f);
                        if (_shadow)
                        {
                            _shadow.transform.localPosition = g - new Vector2(0, 0.3f);
                            _shadow.transform.localScale = new Vector3(0.4f, 0.1f, 1f) * (s.Kind == ShotKind.Stone ? 0.8f : 2f);
                        }
                        if (_trail && !_trail.emitting && k > 0.05f) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Spear:
                    {
                        a += new Vector2(0, 0.45f);
                        b += new Vector2(0, 0.45f);
                        var d = b - a;
                        _root.localPosition = Vector2.Lerp(a, b, Tween.OutCubic(k));
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg - 45f);
                        if (_trail && !_trail.emitting) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Wind:
                    {
                        var g = Vector2.Lerp(a, b, k);
                        _root.localPosition = g + new Vector2(Mathf.Sin(k * 9f) * 0.15f, 0.42f);
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, Time.time * 680f);
                        if (_shadow)
                        {
                            _shadow.transform.localPosition = new Vector2(0, -0.42f);
                            _shadow.transform.localScale = new Vector3(0.55f, 0.16f, 1f);
                        }
                        if (_trail && !_trail.emitting) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Fireball:
                    {
                        _root.localPosition = Vector2.zero;
                        Vector2 g, p;
                        if (s.Ult)
                        {
                            g = b;
                            p = Vector2.Lerp(a, b, Tween.InCubic(k) * 0.5f + k * 0.5f);
                        }
                        else
                        {
                            a += new Vector2(0, 0.5f);
                            g = Vector2.Lerp(a, b, k);
                            p = g + new Vector2(0, 1.35f * 4f * k * (1 - k) + 0.2f);
                        }
                        _sr.transform.localPosition = p;
                        _sr.transform.localScale = Vector3.one * (s.Ult ? 1.38f : 0.84f) * (0.92f + 0.08f * Mathf.Sin(Time.time * 30f));
                        _shadow.transform.localPosition = g - new Vector2(0, 0.2f);
                        _shadow.transform.localScale = new Vector3(0.62f, 0.18f, 1f) * (s.Ult ? 2f : 1f) * (0.5f + 0.5f * k);
                        if (_trail && !_trail.emitting) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Lasso:
                    {
                        var g = Vector2.Lerp(a, b, k);
                        float arc = 0.72f * 4f * k * (1 - k);
                        _root.localPosition = g + new Vector2(0, 0.45f + arc);
                        _sr.transform.localRotation = Quaternion.Euler(0, 0, -Time.time * 780f);
                        if (_shadow)
                        {
                            _shadow.transform.localPosition = new Vector2(0, -0.45f - arc);
                            _shadow.transform.localScale = new Vector3(0.48f, 0.14f, 1f);
                        }
                        if (_trail && !_trail.emitting) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Qi:
                    {
                        // 刀气贴地往敌阵推，越飞越宽，最后两成路程淡掉。
                        _root.localPosition = Vector2.Lerp(a, b, k) + new Vector2(0, 0.45f);
                        float w = 1f + 0.35f * k;
                        _sr.transform.localScale = new Vector3(1.72f * w, 1.72f, 1f);
                        _fuse.transform.localScale = new Vector3(1.24f * w, 1.24f, 1f);
                        float fade = k > 0.8f ? (1f - k) / 0.2f : 1f;
                        _sr.color = _sr.color.A(0.92f * fade);
                        _fuse.color = Color.white.A(fade);
                        if (_trail && !_trail.emitting) _trail.emitting = true;
                        break;
                    }
                    case ShotKind.Lightning:
                    case ShotKind.Frost:
                        _root.localPosition = b;
                        break;
                }
                if (_weapon) TickWeapon(a, b, k);
            }

            /// <summary>
            /// 对标《永远的蔚蓝星球》骑士飞斧与物理重兵表现：
            /// 1) 清晰鲜明的精钢兵器本体（绝不糊白）高速旋转或突刺飞向敌军；
            /// 2) 武器周边环绕饱满的冰青亮蓝旋风刀环（fx_spin_vortex）或螺旋破阵风锥（fx_spear_cone）；
            /// 3) 身后拉出连接出手好汉与飞行兵器的冰青气流尾带，打击力量感拉满！
            /// </summary>
            void BuildMelee(HeroDef hd)
            {
                var s = _s;
                float sc = Mathf.Max(1f, s.Scale) * (s.Crit ? 1.15f : 1f);
                _cut = (int)(s.Id % 3);
                _side = (s.Id & 1) == 0 ? 1f : -1f;
                _shadow = WorldFx.Spr(_root, Art.GroundShadow, Vector2.zero, 1, 125, new Color(0.02f, 0.05f, 0.1f, 0.44f), "shadow");
                Sprite weapon;
                Color auraTint = s.Crit ? Pal.Hex("7AF4FF") : Pal.Hex("38D8FF");
                if (s.Kind == ShotKind.Spear)
                {
                    _style = MeleeStyle.Spear;
                    weapon = Art.Img(hd.Proj ?? "wp_spear");
                    _len = 1.52f * hd.ProjSize * sc;
                    _lance = WorldFx.Additive(WorldFx.Spr(_root, Art.Beam, Vector2.zero, 1f, 9206, Color.white.A(0), "lance"));
                }
                else if (hd.Proj == "wp_axe")
                {
                    _style = MeleeStyle.Axe;
                    weapon = Art.Img("wp_axe");
                    _len = 1.12f * hd.ProjSize * sc;
                }
                else if (hd.Proj == "wp_ironfist" || hd.Proj == null)
                {
                    _style = MeleeStyle.Fist;
                    weapon = Art.Img(hd.Proj ?? "wp_ironfist");
                    _len = 0.94f * hd.ProjSize * sc;
                }
                else
                {
                    _style = MeleeStyle.Blade;
                    weapon = Art.Img(hd.Proj);
                    _len = 1.24f * hd.ProjSize * sc;
                }
                bool spin = _style == MeleeStyle.Blade || _style == MeleeStyle.Axe;
                if (spin)
                {
                    float gLen = _len * 0.94f;
                    _ghostB = WorldFx.Spr(_root, weapon, Vector2.zero, gLen, 9207, Color.white.A(0.16f), "ghostB");
                    _ghostA = WorldFx.Spr(_root, weapon, Vector2.zero, gLen, 9208, Color.white.A(0.30f), "ghostA");
                }
                _sr = WorldFx.Spr(_root, weapon, Vector2.zero, _len, 9210);
                if (spin)
                {
                    // 蔚蓝星球飞斧：兵器包在一颗半透明风球里，亮月牙始终朝飞行方向，球里的风带自己转；身后拖几股会散开的风丝。
                    _shellSize = _len * (_style == MeleeStyle.Axe ? 1.62f : 1.5f);
                    _aura = WorldFx.Spr(_root, Art.Img("fx_wind_shell"), Vector2.zero, _shellSize, 9206, Color.white.A(0.9f), "shell");
                    _vortex = WorldFx.Additive(WorldFx.Spr(_aura.transform, Art.Img("fx_spin_vortex"), Vector2.zero, 0.92f, 9211,
                        Pal.Hex("8FEFFF").A(0.32f), "vortex"));
                    var wakeHost = new GameObject("wake").transform;
                    wakeHost.SetParent(_root, false);
                    _fuse = WorldFx.Spr(wakeHost, Art.Clear, Vector2.zero, 0.01f, 9205, Color.clear, "wakeAnchor");
                    Wisp(wakeHost, 0.3f, _shellSize * 0.85f, Pal.Hex("168EE0"), false, 1f);
                    var coreHost = new GameObject("wakeCore").transform;
                    coreHost.SetParent(wakeHost, false);
                    Wisp(coreHost, 0.18f, _shellSize * 0.4f, Pal.Hex("A8F4FF"), true, 0.75f);
                }
                else if (_style == MeleeStyle.Spear)
                {
                    _aura = WorldFx.Spr(_sr.transform, Art.Img("fx_spear_cone"), new Vector2(0f, 0.08f),
                        1.24f, 9209, Color.white.A(0.94f), "spearCone");
                    Wisp(_sr.transform, 0.17f, 0.46f * sc, Pal.Hex("1A9BE8"), false, 0.75f);
                }
                else
                {
                    // 武松打虎铁拳：破空音爆锥包裹铁拳呼啸轰出
                    _aura = WorldFx.Spr(_sr.transform, Art.Img("fx_spear_cone"), new Vector2(0f, 0.06f),
                        1.48f, 9209, Pal.Hex("FFCE66").A(0.94f), "fistCone");
                    _trail = AddTrail(0.16f, 0.48f * sc, Pal.Hex("F29E28").A(0.52f), false);
                }
                _trails = _root.GetComponentsInChildren<TrailRenderer>();
            }

            void TickMelee()
            {
                var s = _s;
                float k = Mathf.Clamp01(s.T / Mathf.Max(0.0001f, s.Dur));
                var a = s.From.ToV() + new Vector2(0, 0.5f);
                var b = s.To.ToV() + new Vector2(0, 0.45f);
                var d = b - a;
                if (d.sqrMagnitude < 0.0001f) d = Vector2.up;
                var dir = d.normalized;
                a += dir * 0.28f;
                var perp = new Vector2(-dir.y, dir.x);
                float face = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg - 90f;
                float pop = Mathf.Lerp(0.65f, 1f, Tween.OutCubic(Mathf.Min(1f, k / 0.16f)));
                float apex = _style == MeleeStyle.Axe ? 1f + 0.12f * Mathf.Sin(k * Mathf.PI) : 1f;
                _root.localPosition = Vector2.zero;
                var groundBase = Vector2.Lerp(s.From.ToV(), s.To.ToV(), k);
                var curveOff = _style == MeleeStyle.Axe ? perp * (_side * 0.42f * Mathf.Sin(k * Mathf.PI)) : Vector2.zero;
                _shadow.transform.localPosition = groundBase + curveOff * 0.7f - new Vector2(0, 0.05f);
                _shadow.transform.localScale = new Vector3(_style == MeleeStyle.Axe ? 0.64f : 0.48f, _style == MeleeStyle.Axe ? 0.20f : 0.13f, 1f) * pop;

                (Vector2 pos, float ang) Pose(float t)
                {
                    t = Mathf.Clamp01(t);
                    var p = Vector2.Lerp(a, b, t);
                    switch (_style)
                    {
                        case MeleeStyle.Blade:
                        {
                            // 石秀拼命快刀也像飞刃旋斩一样高速旋转破风飞出，极具视觉冲击！
                            float arcLift = 0.22f * 4f * t * (1f - t);
                            float dirSign = _cut == 1 ? -_side : _side;
                            return (p + perp * (dirSign * 0.30f * Mathf.Sin(t * Mathf.PI)) + new Vector2(0, arcLift), face + 25f * dirSign - t * 660f * dirSign);
                        }
                        case MeleeStyle.Axe:
                        {
                            float arcLift = 0.34f * 4f * t * (1f - t);
                            return (p + perp * (_side * 0.42f * Mathf.Sin(t * Mathf.PI)) + new Vector2(0, arcLift), face + 35f * _side - t * 720f * _side);
                        }
                        case MeleeStyle.Spear:
                        {
                            float thrust = Tween.OutCubic(t);
                            return (Vector2.Lerp(a - dir * 0.22f, b + dir * 0.36f, thrust), face);
                        }
                        default:
                            return (p + perp * (_side * 0.08f), face);
                    }
                }

                var (pos, ang) = Pose(k);
                if (_style == MeleeStyle.Spear)
                {
                    var tail = pos - dir * _len;
                    _sr.transform.localPosition = pos - dir * (_len * 0.5f);
                    var span = tail - a;
                    float len = Mathf.Max(0.05f, Vector2.Dot(span, dir));
                    _lance.transform.localPosition = a + dir * (len * 0.5f);
                    _lance.transform.localRotation = Quaternion.Euler(0, 0, face + 90f);
                    _lance.transform.localScale = new Vector3(len, 0.38f * pop, 1f);
                    _lance.color = Pal.Hex("4AD8FF").A(0.62f * (1f - 0.35f * k));
                }
                else _sr.transform.localPosition = pos;
                _sr.transform.localRotation = Quaternion.Euler(0, 0, ang);
                float size = _len * pop * apex * (_style == MeleeStyle.Fist ? 1f + 0.14f * Mathf.Sin(k * 40f) : 1f);
                _sr.transform.localScale = Vector3.one * size;
                if (_fuse) _fuse.transform.parent.localPosition = pos;
                if (_vortex)
                {
                    var (prev, _) = Pose(k - 0.04f);
                    var vel = pos - prev;
                    float head = vel.sqrMagnitude > 1e-6f ? Mathf.Atan2(vel.y, vel.x) * Mathf.Rad2Deg - 90f : face;
                    float breathe = 1f + 0.05f * Mathf.Sin(Time.time * 38f);
                    _aura.transform.localPosition = pos;
                    _aura.transform.localRotation = Quaternion.Euler(0, 0, head);
                    _aura.transform.localScale = Vector3.one * (_shellSize * pop * breathe);
                    _vortex.transform.localRotation = Quaternion.Euler(0, 0, -_side * Time.time * 640f);
                }
                if (_ghostA)
                {
                    float gSize = _style == MeleeStyle.Axe ? size * 0.78f : size;
                    var (pa, aa) = Pose(k - 0.08f);
                    var (pb, ab) = Pose(k - 0.16f);
                    _ghostA.transform.localPosition = pa;
                    _ghostA.transform.localRotation = Quaternion.Euler(0, 0, aa);
                    _ghostA.transform.localScale = Vector3.one * gSize;
                    _ghostB.transform.localPosition = pb;
                    _ghostB.transform.localRotation = Quaternion.Euler(0, 0, ab);
                    _ghostB.transform.localScale = Vector3.one * gSize;
                    _ghostA.enabled = k > 0.06f;
                    _ghostB.enabled = k > 0.12f;
                }
                if (_fuse && !_melee) _fuse.transform.localRotation = Quaternion.Euler(0, 0, Time.time * 360f);
                foreach (var tr in _trails)
                    if (!tr.emitting && k > 0.02f) tr.emitting = true;
            }

            /// <summary>好汉兵器弹道：尖朝飞行方向，飞斧、金砖、渔网、套索打着旋，脚下带实影。</summary>
            void TickWeapon(Vector2 a, Vector2 b, float k)
            {
                var d = b - a;
                if (_spin)
                {
                    float rate = _s.Kind == ShotKind.Wind ? 380f : _s.Kind == ShotKind.Lasso ? 560f : 720f;
                    _sr.transform.localRotation = Quaternion.Euler(0, 0, -Time.time * rate);
                    if (_lance) _lance.transform.localRotation = Quaternion.Euler(0, 0, -Time.time * rate * 1.25f);
                }
                else if (_s.Kind != ShotKind.Arrow)
                    _sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg - 90f);
                if (_s.Kind == ShotKind.Wind) _sr.transform.localScale = Vector3.one * _len * (0.75f + 0.65f * k);
                if (_s.Kind == ShotKind.Arrow)
                {
                    if (_shadow) _shadow.enabled = false;
                    return;
                }
                var ground = Vector2.Lerp(a, b, k) - new Vector2(0, 0.35f);
                _shadow.transform.localPosition = ground - (Vector2)_root.localPosition;
                _shadow.transform.localScale = new Vector3(0.48f, 0.14f, 1f);
            }

            static float WeaponLen(ShotKind k)
            {
                switch (k)
                {
                    case ShotKind.Spear: return 1.28f;
                    case ShotKind.Arrow: return 1.38f;
                    case ShotKind.Punch: return 0.78f;
                    case ShotKind.Stone: return 0.56f;
                    case ShotKind.Wind: return 0.88f;
                    case ShotKind.Lasso: return 0.80f;
                    default: return 0.72f;
                }
            }

            public void Destroy() => Object.Destroy(_root.gameObject);
        }
    }

    static class V2Ext
    {
        public static float Pivot = -2.6f;
        public static float Stretch = 1f;
        public static float XStretchL = 1f;
        public static float XStretchR = 1f;

        /// <summary>
        /// 规则坐标转世界坐标；Pivot 以上纵向按 Stretch 拉长（高屏战场更长），
        /// 横向越靠近出生线越按左右门洞各自的 XStretch 对齐到拱门中心。
        /// </summary>
        public static Vector2 ToV(this V2 v)
        {
            if (v.Y <= Pivot) return new Vector2(v.X, v.Y);
            float f = Mathf.Clamp01((v.Y - Pivot) / (Layout.SpawnY - Pivot));
            float xs = v.X < 0f ? XStretchL : XStretchR;
            return new Vector2(v.X * (1f + (xs - 1f) * f * f), Pivot + (v.Y - Pivot) * Stretch);
        }
    }
}
