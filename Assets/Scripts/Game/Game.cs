using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using Liangshan.Sim;
using UnityEngine;

namespace Liangshan
{
    /// <summary>
    /// 入口：空场景启动后自动挂上。负责镜头、主界面 ↔ 战斗切换。
    /// 命令行带 -shots &lt;目录&gt; 时进入自检模式：机器人自动打一局，在关键节点截图后退出。
    /// </summary>
    public sealed class Game : MonoBehaviour
    {
        public static Game I { get; private set; }

        /// <summary>游戏自己的镜头。编辑器里打开的场景可能自带 Main Camera，不能用 Camera.main。</summary>
        public static Camera Cam { get; private set; }

        Camera _cam;
        RectTransform _floatLayer;
        BattleView _battle;
        HomeScreen _home;
        Vector2Int _screen;
        string _shots;
        /// <summary>只截局外界面（调界面布局时用，几十秒跑完）。</summary>
        bool _metaOnly;
        int _autoSkill = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Boot()
        {
            if (I != null) return;
            var go = new GameObject("Game");
            DontDestroyOnLoad(go);
            I = go.AddComponent<Game>();
        }

        void Awake()
        {
            Application.targetFrameRate = 60;
            Input.multiTouchEnabled = false;
            DouyinBridge.Init();
            ParseArgs();
            var camGo = new GameObject("Camera");
            camGo.transform.SetParent(transform, false);
            _cam = camGo.AddComponent<Camera>();
            camGo.tag = "MainCamera";
            _cam.orthographic = true;
            _cam.clearFlags = CameraClearFlags.SolidColor;
            _cam.backgroundColor = Pal.Hex("1C2128");
            _cam.nearClipPlane = -50;
            _cam.farClipPlane = 50;
            _cam.depth = 100;
            camGo.AddComponent<AudioListener>();
            Cam = _cam;
            MuteForeignCameras();
            FitCamera();

            Ui.Init(transform);
            Tween.Init(gameObject);
            Sfx.Init(gameObject);
            _floatLayer = Ui.Rect(Ui.Root, "FloatLayer");
            _floatLayer.anchorMin = Vector2.zero;
            _floatLayer.anchorMax = Vector2.one;
            _floatLayer.offsetMin = _floatLayer.offsetMax = Vector2.zero;
            WorldFx.Create(transform, _floatLayer, _cam.transform);

            Profile.Load();
            ArtPack.Init(gameObject);
            ArtPack.Ensure(HomeArt());
            Sfx.On = Profile.S.Sound == 1;
            Sfx.Music = Profile.S.Music == 1;
            if (_shots != null) StartCoroutine(SelfCheck());
            else if (Application.isBatchMode) ShowHome();
            else
            {
                CloudSync.Imported += OnCloudImported;
                // 微信上封面就是这张启动图。主界面画出来再揭，云存档最多再等 6 秒，到点也揭。
                if (LoadingScreen.InWeChat) LoadingScreen.SuppressAutoHide();
                var loading = LoadingScreen.InWeChat ? null : LoadingScreen.Open();
                if (DouyinBridge.IsDouyin) LoadingScreen.HideWeChatCover();
                CloudSync.Startup(() => _cloudReady = true);
                StartCoroutine(FinishBoot(loading));
            }
        }

        bool _cloudReady;

        IEnumerator FinishBoot(LoadingScreen loading)
        {
            float until = Time.realtimeSinceStartup + 6.5f;
            while (!_cloudReady && Time.realtimeSinceStartup < until) yield return null;
            if (!LoadingScreen.InWeChat && loading != null) yield return loading.WaitMin();
            try { ShowHome(); }
            catch (Exception e) { Debug.LogException(e); }
            if (LoadingScreen.InWeChat)
            {
                yield return null;
                yield return null;
                LoadingScreen.HideWeChatCover();
                yield break;
            }
            if (loading != null)
            {
                loading.SetFill(1f);
                loading.BringToFront();
                yield return new WaitForSecondsRealtime(0.12f);
                yield return loading.FadeOut();
            }
        }

        void OnDestroy() => CloudSync.Imported -= OnCloudImported;

        /// <summary>局中被云端覆盖不打断，回首页时自然用新档。</summary>
        void OnCloudImported()
        {
            Sfx.On = Profile.S.Sound == 1;
            Sfx.Music = Profile.S.Music == 1;
            if (_home) ShowHome(_home.Tab);
        }

        void ParseArgs()
        {
            var args = Environment.GetCommandLineArgs();
            for (int i = 0; i < args.Length - 1; i++)
            {
                if (args[i] == "-shots") _shots = args[i + 1];
                if (args[i] == "-safe-top" && float.TryParse(args[i + 1], out float st)) Ui.FakeSafeTopPx = st;
                if (args[i] == "-safe-bottom" && float.TryParse(args[i + 1], out float sb)) Ui.FakeSafeBottomPx = sb;
            }
            _metaOnly = Array.IndexOf(args, "-quickmeta") >= 0;
            if (_shots != null)
            {
                Directory.CreateDirectory(_shots);
                PlayerPrefs.DeleteAll();
                Profile.Volatile = true;
                Ads.Fast = true;
            }
        }

        void MuteForeignCameras()
        {
            foreach (var c in FindObjectsOfType<Camera>())
                if (c != _cam) c.enabled = false;
            foreach (var l in FindObjectsOfType<AudioListener>())
                if (l.gameObject != _cam.gameObject) l.enabled = false;
        }

        /// <summary>界面根节点让出底部横条后，战场跟着抬：世界 y = -9.6 对齐到横条上沿，横条里照常画战场。</summary>
        void FitCamera()
        {
            _screen = new Vector2Int(Screen.width, Screen.height);
            float lift = Ui.SafeBottomPixels;
            float area = Mathf.Max(1f, Screen.height - lift);
            float aspect = area / Mathf.Max(1f, Screen.width);
            float half = aspect > 16f / 9f ? 5.4f * aspect : 9.6f;
            float unitsPerPixel = 2f * half / area;
            _cam.orthographicSize = Screen.height * unitsPerPixel * 0.5f;
            var p = new Vector3(0, -9.6f - lift * unitsPerPixel + _cam.orthographicSize, -10);
            _cam.transform.localPosition = p;
            if (WorldFx.I) WorldFx.I.SetCamBase(p);
        }

        void Update()
        {
            if (_screen.x != Screen.width || _screen.y != Screen.height)
            {
                FitCamera();
                Ui.Fit();
                // 首页按 SafeTop 排版，屏幕一变（微信启动头几帧常见）就整页重搭。
                if (_home) ShowHome(_home.Tab);
            }
            if ((_tick -= Time.unscaledDeltaTime) <= 0)
            {
                _tick = 1f;
                int st = Profile.S.Stamina, day = Profile.S.Day;
                Profile.Tick();
                if (st != Profile.S.Stamina || day != Profile.S.Day) Profile.Save();
            }
        }

        float _tick;

        // ---------------- 流程 ----------------

        void Clear()
        {
            MuteForeignCameras();
            if (_battle) Destroy(_battle.gameObject);
            _battle = null;
            if (_home) Destroy(_home.gameObject);
            _home = null;
            Time.timeScale = 1f;
        }

        public HomeScreen Home => _home;

        /// <summary>首通解锁的新好汉：回到主页后全屏揭晓一次。</summary>
        HeroId? _pendingReveal;

        public void ShowHome(int tab = 2)
        {
            Clear();
            _home = HomeScreen.Create(tab);
            Sfx.PlayMusic(Bgm.Menu);
            RankService.TrySilentSyncWeChatProfile();
            RankService.SubmitIfChanged();
            if (_pendingReveal.HasValue && _autoSkill < 0)
            {
                var h = _pendingReveal.Value;
                var home = _home;
                Tween.Run(home, 0.35f, k => { }, () => MetaFx.HeroReveal(home.Layer, h));
            }
            _pendingReveal = null;
            if (Profile.S.Cleared < Defs.LevelCount)
            {
                var next = BattleArt(Defs.Level(Mathf.Min(Profile.S.Selected, Profile.S.Cleared + 1)), Meta.Lineup(Profile.S));
                // 编辑器和 Mac 包图在本地，停在主界面时先装进内存，点开始挑战就不用再盖加载层。
                // 微信只预拉到缓存，进战斗再解码，避免主界面把一局的帧全堆在显存里。
#if UNITY_EDITOR || UNITY_STANDALONE
                ArtPack.Ensure(next);
#endif
                ArtPack.Prefetch(next);
            }
        }

        static List<string> HomeArt()
        {
            var list = new List<string>();
            foreach (var h in Meta.Lineup(Profile.S)) list.Add(Defs.Hero(h).Art);
            return list;
        }

        /// <summary>一局可能用到的图包：上阵好汉、战场背景、这关会刷的兵和首领精英，外加首领召唤、力士背篓会带出来的兵。</summary>
        static List<string> BattleArt(LevelDef st, HeroId[] lineup)
        {
            var list = new List<string> { st.Bg };
            foreach (var h in lineup) list.Add(Defs.Hero(h).Art);
            void Add(EnemyKind k)
            {
                string a = Defs.Enemy(k).Art;
                if (!list.Contains(a)) list.Add(a);
            }
            Add(EnemyKind.Soldier);
            Add(EnemyKind.Cavalry);
            Add(EnemyKind.Diver);
            Add(EnemyKind.Berserker);
            if (st.BossWave > 0) Add(st.BossKind);
            foreach (var k in st.EliteKinds) Add(k);
            foreach (var t in st.Troops) Add(t.Kind);
            if (st.PorterWaves.Length > 0) Add(EnemyKind.Porter);
            return list;
        }

        /// <summary>图包齐了再开始。编辑器里读盘是同步的，当场齐了就直接进，不闪启动封面。
        /// 微信第一次进某章要等 CDN 时，只盖一块纯色进度，不再复用启动大图。</summary>
        void WithArt(List<string> need, Action go)
        {
            if (ArtPack.Ready(need)) { go(); return; }
            bool sync = false;
            ArtPack.Ensure(need, () => sync = true);
            if (sync) { go(); return; }
            var loading = LoadingScreen.Open(false);
            loading.Follow(need);
            ArtPack.Ensure(need, () => StartCoroutine(FinishArt(loading, go)));
        }

        IEnumerator FinishArt(LoadingScreen loading, Action go)
        {
            if (loading)
            {
                loading.SetFill(1f);
                loading.BringToFront();
                yield return new WaitForSecondsRealtime(0.12f);
                yield return loading.FadeOut();
            }
            go();
        }

        public void StartLevel(int no, bool bonus2Star = false)
        {
            _bonus2Star = bonus2Star;
            if (!Play(Defs.Level(Mathf.Min(no, Profile.S.Cleared + 1)))) _bonus2Star = false;
        }

        bool _bonus2Star;
        bool _spentStaminaThisRun;

        public void StartDaily() => Play(Defs.DailyStage(Profile.S.Cleared, Profile.Today));

        public void StartEscort() => Play(Defs.EscortStage(Profile.S.Cleared));

        /// <summary>出征检查体力和次数；不够时弹补给窗或提示，返回 false。</summary>
        public bool Play(LevelDef st)
        {
            var s = Profile.S;
            bool auto = _autoSkill >= 0;
            if (st.Mode == StageMode.Daily && s.DailyTries >= Meta.DailyTriesMax && !auto) { Ui.Toast("今日比武次数已用完", 200); return false; }
            if (st.Mode == StageMode.Escort && s.EscortTries >= Meta.EscortTriesMax && !auto) { Ui.Toast("今日拦截次数已用完", 200); return false; }
            if (!auto && !Meta.Spend(s, Cur.Stamina, Meta.BattleStamina))
            {
                if (_home) MetaUi.StaminaShop(_home.Layer);
                else
                {
                    Ui.Toast("体力不足", 200);
                    ShowHome();
                }
                return false;
            }
            _spentStaminaThisRun = !auto;
            if (st.Mode == StageMode.Daily) s.DailyTries++;
            if (st.Mode == StageMode.Escort) s.EscortTries++;
            if (st.Mode == StageMode.Main) s.Selected = st.No;
            Profile.Save();
            Launch(st);
            return true;
        }

        /// <summary>反痛点：前 2 波且寨墙满血时允许无损撤退，100% 返还本局消耗的 5 点体力（每日最多保护 10 次）。</summary>
        public bool CanRefundStamina()
        {
            if (!_spentStaminaThisRun || _settled || _battle == null || _battle.B == null) return false;
            var b = _battle.B;
            if (b.Stage.Mode != StageMode.Main) return false;
            return b.Wave <= 2 && b.Wall >= b.WallMax - 0.5f && Profile.S.FreeRetreats < 10;
        }

        public void QuitFromPause()
        {
            bool refund = CanRefundStamina();
            if (refund)
            {
                Profile.S.FreeRetreats++;
                Meta.Give(Profile.S, new Item(Cur.Stamina, Meta.BattleStamina));
                _spentStaminaThisRun = false;
                Profile.Save();
            }
            ShowHome();
            if (refund) Ui.Toast($"前2波无损撤退 · 已返还体力 +{Meta.BattleStamina}", 220);
        }

        /// <summary>重开本关：已经扣过体力，不再扣。</summary>
        public void Restart()
        {
            if (_battle != null && _battle.B != null)
                Analytics.LevelFail("restart", _battle.B.Wave, _battle.B.Kills);
            Launch(_stage);
        }

        LevelDef _stage;
        int _seed;
        bool _settled;
        Rewards _last;

        void Launch(LevelDef st)
        {
            Clear();
            _stage = st;
            _settled = false;
            var lo = Meta.BuildLoadout(Profile.S);
            var need = BattleArt(st, lo.Lineup);
            ArtPack.Keep(need);
            WithArt(need, () => Begin(st, lo));
        }

        void Begin(LevelDef st, Loadout lo)
        {
            var go = new GameObject("Battle");
            go.transform.SetParent(transform, false);
            _battle = go.AddComponent<BattleView>();
            bool tutorial = _autoSkill < 0 && Profile.S.TutorialDone == 0 && st.Mode == StageMode.Main && st.No == 1;
            _seed = _autoSkill >= 0 ? 20261031 + _autoSkill : Environment.TickCount;
            _battle.Begin(_seed, st, lo, tutorial);
            if (_bonus2Star)
            {
                _bonus2Star = false;
                Profile.S.AdStart2Star++;
                Profile.Save();
                _battle.B.Coins += 80;
                _battle.B.Summon(true, 2);
                // 面板数字只在花钱时往下走，直接加的银两要当场拨上去。
                _battle.Hud.QueueCoin(80);
                _battle.Hud.Banner("村委增援已到", "一位乡亲以2星入场，能量币 +80", Pal.Gold, "ic_star", true);
            }
            if (_autoSkill >= 0)
            {
                _battle.Auto = new Bot(_autoSkill);
                _battle.Speed = 2f;
            }
            else
            {
                var s = Profile.S;
                bool fresh = st.Mode == StageMode.Main && st.No > s.Cleared;
                bool can2 = !fresh && ((st.Mode == StageMode.Main && st.No <= s.Cleared) || s.Speed2Day == Profile.Today);
                int pref = PlayerPrefs.GetInt("battle_spd", s.Cleared >= 1 || s.Speed15 == 1 ? 1 : 0);
                _battle.Speed = fresh ? 1f : pref >= 2 && can2 ? 2f : pref >= 1 && (s.Cleared >= 1 || s.Speed15 == 1) ? 1.5f : 1f;
            }
            _floatLayer.SetAsFirstSibling();
            Sfx.PlayMusic(st.Mode == StageMode.Main && st.IsChapterBoss ? Bgm.Boss : Bgm.Battle);
            string mode = st.Mode == StageMode.Daily ? "daily" : st.Mode == StageMode.Escort ? "escort" : "main";
            Analytics.LevelStart(st.No, st.Title, mode);
        }

        Rewards Compute(Battle b, bool win) =>
            Meta.BattleRewards(Profile.S, b.Stage, win, b.Wave, b.WallMax > 0 ? b.Wall / b.WallMax : 0, b.PortersKilled, new Rng(_seed ^ 0x5A5A));

        public Rewards Preview(Battle b, bool win) => Compute(b, win);

        /// <summary>结算发奖：每局只发一次（失败后复活再赢，按赢算）。</summary>
        public Rewards Settle(Battle b, bool win)
        {
            if (_settled) return _last;
            _settled = true;
            if (win) Analytics.LevelClear(b.Wave, b.Kills);
            else Analytics.LevelFail("lose", b.Wave, b.Kills);
            var s = Profile.S;
            var r = Compute(b, win);
            Meta.Give(s, r);
            Meta.FinishMain(s, b.Stage, win, r);
            Meta.MarkSeen(s, b.Seen);
            Profile.Save();
            if (r.Unlock.HasValue && r.First) _pendingReveal = r.Unlock;
            _last = r;
            return r;
        }

        public void GiveAgain(Rewards r)
        {
            foreach (var it in r.Items) Meta.Give(Profile.S, it);
            Profile.Save();
        }

        // ---------------- 自检截图 ----------------

        bool _autoDone, _autoWon;

        public void OnAutoDone(bool won)
        {
            _autoDone = true;
            _autoWon = won;
        }

        void Shot(string name)
        {
            var path = Path.Combine(_shots, name + ".png");
            ScreenCapture.CaptureScreenshot(path);
            Debug.Log("[自检] 截图 " + path);
        }

        /// <summary>
        /// 走路自检：1 倍速，用一台特写相机跟住一个正在走的怪，每 3 帧拍一张共 16 张，
        /// 拼起来能直接看出两腿是否交替迈步、身体是不是在弹。
        /// </summary>
        IEnumerator WalkBurst(EnemyKind kind, string prefix)
        {
            Enemy target = null;
            foreach (var e in _battle.B.Enemies)
                if (e.Def.Kind == kind && !e.Attacking && e.Stun <= 0 && (target == null || e.Pos.Y > target.Pos.Y)) target = e;
            if (target == null) yield break;
            float keep = _battle.Speed;
            _battle.Speed = 1f;
            var cam = new GameObject("walkCam").AddComponent<Camera>();
            cam.CopyFrom(_cam);
            cam.depth = _cam.depth + 1;
            cam.orthographicSize = target.Def.Size * 1.6f;
            for (int i = 0; i < 16; i++)
            {
                for (int f = 0; f < 3; f++)
                {
                    var p = target.Pos.ToV();
                    cam.transform.position = new Vector3(p.x, p.y + target.Def.Size * 0.5f, -10);
                    yield return null;
                }
                Shot(prefix + i.ToString("00"));
            }
            yield return null;
            Destroy(cam.gameObject);
            _battle.Speed = keep;
        }

        IEnumerator WaitReal(float s)
        {
            float end = Time.realtimeSinceStartup + s;
            while (Time.realtimeSinceStartup < end) yield return null;
        }

        /// <summary>按真人路径操作一遍：点召唤、按引导拖拽合成、点强化选卡。指针走 BattleView 的输入代码。</summary>
        static PerkDef PerkNamed(HeroId hero, string name)
        {
            foreach (var p in Defs.Perks)
                if (p.Hero == hero && p.Name == name) return p;
            throw new System.InvalidOperationException(hero + " 没有强化「" + name + "」");
        }

        IEnumerator ManualPlay()
        {
            var v = _battle;
            v.B.Coins += 600;
            v.Hud.PressSummon();
            yield return WaitReal(0.5f);
            for (int i = 0; i < 8 && !v.FindMergePair(out _, out _); i++)
            {
                v.Hud.PressSummon();
                yield return WaitReal(0.25f);
            }
            yield return WaitReal(1.0f);
            Shot("02b_merge_guide");
            yield return WaitReal(0.3f);

            int a = -1, b = -1;
            for (int i = 0; i < v.B.Slots.Count && a < 0; i++)
                for (int j = 0; j < v.B.Slots.Count; j++)
                    if (v.B.CanMerge(i, j)) { a = i; b = j; break; }
            if (a < 0)
            {
                Debug.LogError("[自检] 没凑出可合成的一对");
                yield break;
            }
            var from = v.SlotWorld(a);
            var to = v.SlotWorld(b);
            var ptr = new BattleView.Pointer { Down = true, Held = true, World = from };
            v.FakePointer = () => ptr;
            yield return null;
            ptr.Down = false;
            float t0 = Time.realtimeSinceStartup;
            bool shot = false;
            while (Time.realtimeSinceStartup - t0 < 0.7f)
            {
                float k = (Time.realtimeSinceStartup - t0) / 0.7f;
                ptr.World = Vector2.Lerp(from, to, k) + new Vector2(0, Mathf.Sin(k * Mathf.PI) * 0.6f);
                if (!shot && k > 0.85f) { shot = true; Shot("02c_dragging"); }
                yield return null;
            }
            ptr.World = to;
            yield return null;
            int mergesBefore = v.MergesDone;
            ptr.Held = false;
            ptr.Up = true;
            yield return null;
            v.FakePointer = null;
            yield return WaitReal(0.35f);
            Shot("02d_merged");
            Debug.Log($"[自检] 拖拽合成 {(v.MergesDone > mergesBefore || v.B.Slots[b].Unit?.Star > 1 ? "成功" : "失败")}");
            yield return WaitReal(0.6f);
            Shot("02d2_book_guide");
            yield return WaitReal(0.3f);
            for (int i = 0; i < 8; i++)
            {
                if (v.B.Recruited >= Defs.EnhanceUnlockSummons || !v.B.HasEmptySlot()) break;
                v.Hud.PressSummon();
                yield return WaitReal(0.15f);
            }

            v.B.ShotChoices = new[]
            {
                PerkNamed(HeroId.ShiXiu, "快如闪电"),
                PerkNamed(HeroId.KongLiang, "千钧之力"),
                PerkNamed(HeroId.MaLing, "破冰追击"),
            };
            v.Hud.PressEnhance();
            yield return WaitReal(1.0f);
            Shot("02e_enhance_cards");
            v.Hud.ChooseCard(0);
            yield return WaitReal(1.2f);
            Shot("02f_after_pick");
            yield return WaitReal(0.3f);
            Slot info = null;
            foreach (var sl in v.B.Slots)
                if (sl.Unit != null && (info == null || sl.Unit.Star > info.Unit.Star)) info = sl;
            if (info != null)
            {
                v.Hud.SlotInfo(info);
                yield return WaitReal(0.5f);
                Shot("02i_unit_info");
                yield return WaitReal(0.2f);
                v.Hud.SlotInfo(info, 1);
                yield return WaitReal(0.3f);
                Shot("02j_unit_ult");
                yield return WaitReal(0.2f);
                v.Hud.CloseInfo();
            }
            v.Hud.LordInfo();
            yield return WaitReal(0.45f);
            Shot("02k_lord");
            yield return WaitReal(0.35f);
            v.Hud.CloseInfo();
            var who = v.B.Lineup[0];
            PerkDef plain = null, extra = null;
            foreach (var p in Defs.Perks)
            {
                if (p.Hero != who) continue;
                if (!p.Ult && !p.Star && plain == null) plain = p;
                else if (p.Ult) extra = p;
                else if (p.Star && extra == null) extra = p;
            }
            if (plain != null) v.B.Perks[plain.Id] = 1;
            if (extra != null) v.B.Perks[extra.Id] = 1;
            yield return null;
            v.Hud.OpenPerks(who);
            yield return WaitReal(0.45f);
            Shot("02l_perks");
            yield return WaitReal(0.35f);
            v.Hud.ClosePerk();
            yield return WaitReal(0.3f);
            v.Hud.OpenPanel("stats");
            yield return WaitReal(1.0f);
            Shot("02g_stats");
            v.Hud.ClosePanel();
            yield return WaitReal(0.3f);
            v.Hud.OpenPanel("pause");
            yield return WaitReal(0.6f);
            Shot("02h_pause");
            v.Hud.ClosePanel();
            yield return WaitReal(0.3f);
        }

        void CloseModals()
        {
            if (_home == null) return;
            for (int i = _home.Layer.childCount - 1; i >= 0; i--) DestroyImmediate(_home.Layer.GetChild(i).gameObject);
        }

        /// <summary>截图在帧末才落盘：截完等一下再动界面，免得拍到下一步的半成品。</summary>
        IEnumerator Snap(string name)
        {
            Shot(name);
            yield return WaitReal(0.15f);
        }

        IEnumerator ModalShot(Action open, string name)
        {
            CloseModals();
            open();
            yield return WaitReal(0.9f);
            yield return Snap(name);
        }

        /// <summary>局外各界面截图：先把存档推到“玩了一阵子”的样子。</summary>
        IEnumerator MetaShots()
        {
            _autoSkill = -1;
            var s = Meta.ExpectedSave(12);
            s.Cleared = 11;
            s.Selected = 12;
            for (int i = 0; i < 11; i++)
            {
                s.Stars[i] = i % 4 == 0 ? 2 : 3;
                s.LevelChest[i] = i % 4 == 0 ? 3 : 7;
            }
            s.Pages = 140;
            s.Tomes = 4;
            s.Silk = 2600;
            s.Meteor = 5;
            s.GearBoxes = 3;
            s.RefineStones = 16;
            s.Hammers = 9;
            s.CloakLv = 2;
            Meta.SetWish(s, HeroId.HuaRong);
            var tRng = new Rng(2026);
            s.Totems.Clear();
            var tEpic = Meta.RollTotem(s, 2, tRng, 1);
            tEpic.Beast = 1; tEpic.Kind = 2; // 玄熊图腾·凤翅盔：对前三波怪物增伤
            var tLeg = Meta.RollTotem(s, 3, tRng, 1);
            tLeg.Beast = 5; tLeg.Kind = 8; // 麒麟图腾·凤翅盔：战士职业伤害
            Meta.ToggleInlayTotem(s, tEpic.Id);
            Meta.ToggleInlayTotem(s, tLeg.Id);
            for (int ti = 0; ti < 11; ti++)
            {
                var td = Meta.RollTotem(s, ti < 2 ? 3 : ti < 7 ? 2 : 1, tRng, ti % 6);
                if (ti < 4) Meta.ToggleInlayTotem(s, td.Id);
            }
            s.PageLv = 4;
            s.TomeNodes = 1;
            s.FlagLv = 3;
            s.FlagAffix[0] = 0 * 4 + 2 + 1;
            s.FlagAffix[1] = 7 * 4 + 1 + 1;
            s.FlagLock = 1;
            s.EquipQ[0] = 2;
            s.EquipQ[3] = 1;
            s.EquipQ[5] = 3;
            s.Meals = 1;
            s.HeroLv[(int)HeroId.ZhangQing] = 3;
            s.HeroLv[(int)HeroId.WuYong] = 2;
            s.HeroLv[(int)HeroId.WuSong] = 4;
            s.Lineup[3] = (int)HeroId.WuSong;
            foreach (var h in new[] { HeroId.HuSanniang, HeroId.QinMing, HeroId.AnDaoquan, HeroId.ShiXiu, HeroId.ZhuWu, HeroId.SunErniang, HeroId.ShiQian, HeroId.XieZhen })
                s.HeroLv[(int)h] = Mathf.Max(1, s.HeroLv[(int)h]);
            s.Shards[(int)Meta.Starters[0]] = 30;
            s.Shards[(int)Meta.Starters[2]] = 5;
            s.Tokens = 14;
            s.Ingots = 860;
            s.Copper = 26000;
            s.Iron = 120;
            s.Stamina = 37;
            s.StaminaAt = Profile.Now - 100;
            s.IdleAt = Profile.Now - 3 * 3600 - 1200;
            s.Seen[(int)EnemyKind.Soldier] = 2;
            s.Seen[(int)EnemyKind.Shield] = 1;
            s.Seen[(int)EnemyKind.Cavalry] = 1;
            s.Seen[(int)EnemyKind.Porter] = 2;
            s.Seen[(int)EnemyKind.Hawk] = 1;
            s.Task[(int)Act.Login] = 1;
            s.Task[(int)Act.Battle] = 7;
            s.Task[(int)Act.Win] = 5;
            s.Task[(int)Act.Stamina] = 35;
            s.Task[(int)Act.Ad] = 1;
            s.TaskClaimed = 1 | 2 | 16;
            s.SignDays = 2;
            s.SignDay = Profile.Today - 1;
            s.Day = Profile.Today;
            s.Born = Profile.Today - 2 + 1;
            s.Life[(int)Act.Battle] = 30;
            s.Life[(int)Act.Win] = 22;
            s.Life[(int)Act.HeroUp] = 12;
            s.Life[(int)Act.Forge] = 14;
            s.Life[(int)Act.Stamina] = 160;
            s.Talent = Mathf.Max(s.Talent, 12);
            s.Pulls = 28;
            s.SevenGot = 1 | 2 | 4 | 8 | 32;
            s.SevenBox = 0;
            s.SprintRound = Meta.SprintRoundOf(s, Profile.Today) + 1;
            s.SprintAct[(int)Act.Recruit] = 24;
            s.SprintAct[(int)Act.Battle] = 17;
            s.SprintAct[(int)Act.Stamina] = 90;
            s.SprintTier = 1;
            Profile.Use(s);
            ShowHome(HomeScreen.TabBattle);
            yield return WaitReal(1.5f);
            yield return Snap("13_home_ch2");
            yield return ModalShot(() => MetaUi.SignIn(_home.Layer), "14_sign");
            yield return ModalShot(() => MetaUi.Tasks(_home.Layer), "15_tasks");
            yield return ModalShot(() => MetaUi.Seven(_home.Layer), "15b_seven");
            yield return ModalShot(() => MetaUi.Seven(_home.Layer, 5), "15c_seven_locked");
            yield return ModalShot(() => MetaUi.Sprint(_home.Layer), "15d_sprint");
            yield return ModalShot(() => MetaUi.Sprint(_home.Layer, 1), "15e_sprint_tasks");
            yield return ModalShot(() => MetaUi.Welfare(_home.Layer), "15f_welfare");
            yield return ModalShot(() => MetaUi.Idle(_home.Layer), "16_idle");
            yield return ModalShot(() => MetaUi.Codex(_home.Layer), "17_codex");
            yield return ModalShot(() => MetaUi.Daily(_home.Layer), "18_daily");
            yield return ModalShot(() => MetaUi.Escort(_home.Layer), "18b_escort");
            yield return ModalShot(() => MetaUi.StaminaShop(_home.Layer), "18c_stamina");
            yield return ModalShot(() => MetaUi.Chest(_home.Layer, 1, 2), "18d_chest");
            var chest2 = _home.transform.Find("page/body/chests/chest2");
            if (chest2)
            {
                yield return ModalShot(() => MetaUi.LevelChestCard(_home.Layer, 15, 2, chest2), "18e_chest_card");
                yield return ModalShot(() =>
                {
                    MetaUi.LevelChestCard(_home.Layer, 15, 2, chest2);
                    var tile = _home.Layer.Find("pop_chest/card/item");
                    MetaUi.ItemTip(_home.Layer, new Item(Cur.Tome, 3), tile ? tile : chest2);
                }, "18f_item_tip");
            }
            yield return ModalShot(() => MetaUi.LevelList(_home.Layer), "18g_levels");
            yield return ModalShot(() => MetaUi.Meals(_home.Layer), "18h_meals");
            yield return ModalShot(() => MetaUi.ChapterChests(_home.Layer, 2), "18i_chapter_chests");
            CloseModals();
            s.Selected = 11;
            Profile.Save();
            yield return WaitReal(0.8f);
            yield return Snap("13b_home_sweep");
            s.Selected = 12;
            Profile.Save();
            yield return WaitReal(0.5f);
            _home.SetTab(HomeScreen.TabHero);
            yield return WaitReal(1.0f);
            yield return Snap("19_heroes");
            yield return ModalShot(() => MetaUi.HeroDetail(_home.Layer, HeroId.HuaRong), "20_hero_detail");
            yield return ModalShot(() => MetaUi.HeroDetail(_home.Layer, HeroId.KongLiang), "20a_hero_kongliang");
            yield return ModalShot(() => MetaUi.HeroDetail(_home.Layer, HeroId.LinChong), "20b_hero_locked");
            yield return ModalShot(() => MetaUi.HeroDetail(_home.Layer, HeroId.HuSanniang), "20c_hero_control");
            yield return ModalShot(() => MetaUi.HeroDetail(_home.Layer, Meta.Starters[0]), "20d_hero_starter");
            yield return ModalShot(() => MetaUi.GetPaths(_home.Layer, Meta.Starters[1]), "20e_getpaths");
            CloseModals();
            _home.BeginSwap(HeroId.ZhangQing);
            yield return WaitReal(0.8f);
            yield return Snap("20f_swap");
            _home.SetTab(HomeScreen.TabBattle);
            _home.SetTab(HomeScreen.TabHero);
            var lh = Meta.Starters[0];
            MetaFx.LevelUp(_home.Layer, new MetaFx.LevelUpInfo { Hero = lh, NewLv = 5, OldPower = Meta.HeroPowerAt(lh, 4), NewPower = Meta.HeroPowerAt(lh, 5), OldCritDmg = 1.6f, NewCritDmg = 1.61f }, null);
            yield return WaitReal(1.4f);
            yield return Snap("20g_levelup");
            yield return WaitReal(2.2f);
            yield return Snap("20h_perma");
            CloseModals();
            MetaUi.HeroDetail(_home.Layer, HeroId.GongSun);
            MetaFx.Perma(_home.Layer, HeroId.GongSun, 1);
            yield return WaitReal(0.75f);
            yield return Snap("20h2_perma_gongsun");
            CloseModals();
            MetaFx.Perma(_home.Layer, HeroId.GongSun, 4);
            yield return WaitReal(0.75f);
            yield return Snap("20h3_perma_lv20");
            CloseModals();
            MetaFx.HeroReveal(_home.Layer, HeroId.HuaRong);
            yield return WaitReal(1.6f);
            yield return Snap("20i_reveal");
            CloseModals();
            _home.SetTab(HomeScreen.TabForge);
            yield return WaitReal(1.0f);
            yield return Snap("21_forge");
            if (s.Totems.Count > 0)
            {
                int firstId = s.Totems[0].Id;
                yield return ModalShot(() => MetaUi.TotemDetail(_home.Layer, firstId), "21b_totem_detail");
            }
            CloseModals();
            _home.SetForgeSubTab(2);
            yield return WaitReal(0.8f);
            yield return Snap("21c_forge_materials");
            var firstMat = _home.transform.Find("page/body/drawer/matView/content/item");
            yield return ModalShot(() => MetaUi.ItemTip(_home.Layer, new Item(Cur.Refine, s.RefineStones), firstMat), "21d_refine_tip");
            CloseModals();
            _home.SetForgeSubTab(1);
            yield return WaitReal(0.6f);
            yield return Snap("21f_forge_equips");
            yield return ModalShot(() => MetaUi.EquipSheet(_home.Layer, 0), "21g_equip_sheet");
            yield return ModalShot(() => MetaUi.Cloak(_home.Layer), "21e_cloak");
            yield return ModalShot(() => MetaUi.ForgeSlot(_home.Layer, 0), "22_forge_slot");
            yield return ModalShot(() => MetaUi.ForgeSlot(_home.Layer, 0, null, true), "22a_forge_wash");
            yield return ModalShot(() => MetaUi.TalentTree(_home.Layer), "22b_talent");
            yield return ModalShot(() => MetaUi.Tome(_home.Layer), "22c_tome");
            yield return ModalShot(() => MetaUi.Flag(_home.Layer), "22d_flag");
            yield return ModalShot(() => MetaUi.GearBox(_home.Layer), "22e_gearbox");
            CloseModals();
            _home.SetTab(HomeScreen.TabFort);
            yield return WaitReal(1.0f);
            yield return Snap("23_fort");
            _home.SetTab(HomeScreen.TabShop);
            yield return WaitReal(1.0f);
            yield return Snap("24_shop");
            yield return ModalShot(() => MetaUi.WishPicker(_home.Layer), "24a_wish_picker");
            CloseModals();
            _home.SetShopSubTab(1);
            yield return WaitReal(0.8f);
            yield return Snap("24c_shop_totem");
            _home.SetShopSubTab(0);
            s.SkipRecruitAnim = 0;
            s.Tokens = Mathf.Max(s.Tokens, 20);
            float tRec0 = Time.realtimeSinceStartup;
            _home.DoRecruit(10, false);
            yield return WaitReal(0.52f);
            yield return Snap("24a_recruit_omen");
            for (float t = 0f; t < 15f && !GameObject.Find("sealFlat") && !GameObject.Find("fx_recruit_sum"); t += 0.08f)
                yield return WaitReal(0.08f);
            yield return WaitReal(0.18f);
            yield return Snap("24b_recruit10");
            for (float t = 0f; t < 4f && GameObject.Find("sealFlat") && !GameObject.Find("fx_recruit_sum"); t += 0.08f)
                yield return WaitReal(0.08f);
            yield return WaitReal(0.28f);
            yield return Snap("24e_recruit_mid");
            // 不点屏、不跳过，完整自动跑完 10 连，限时内必须进入累计获得大屏
            for (float t = 0f; t < 25f && !GameObject.Find("fx_recruit_sum"); t += 0.25f)
                yield return WaitReal(0.25f);
            float recDur = Time.realtimeSinceStartup - tRec0;
            Debug.Log($"[selfcheck] recruit10 total duration = {recDur:F2}s");
            if (!GameObject.Find("fx_recruit_sum")) Debug.LogError("[selfcheck] recruit stage never reached summary");
            yield return WaitReal(1.5f);
            yield return Snap("24d_recruit_sum");
            CloseModals();

            // 验证单点招募抽出传说（即使勾选了「跳过动画」也必触发全屏天罡封神大戏！）
            s.SkipRecruitAnim = 1;
            s.Cleared = Mathf.Max(s.Cleared, Meta.OrangeOpen);
            s.Pity = Meta.OrangePity;
            s.Tokens = Mathf.Max(s.Tokens, 5);
            _home.DoRecruit(1, false);
            yield return WaitReal(0.55f);
            yield return Snap("24f_single_legend_omen");
            yield return WaitReal(1.65f);
            yield return Snap("24g_single_legend_reveal");
            s.SkipRecruitAnim = 0;
            CloseModals();
        }

        /// <summary>后期关卡：按标准养成让机器人打一局，看新敌人、新首领和章节战场。</summary>
        IEnumerator AutoBattle(int level, string prefix)
        {
            var s = Meta.ExpectedSave(level);
            s.HeroLv[(int)HeroId.ZhangQing] = Mathf.Max(1, s.HeroLv[(int)HeroId.ZhangQing]);
            s.Lineup = level >= 40 ? new[] { 2, 6, 5, 7 } : new[] { 0, 2, 4, 1 };
            for (int h = 0; h < Defs.HeroCount; h++) if (Array.IndexOf(s.Lineup, h) >= 0) s.HeroLv[h] = Mathf.Max(s.HeroLv[h], s.HeroLv[0]);
            Profile.Use(s);
            _autoSkill = 2;
            Play(Defs.Level(level));
            while (_battle == null) yield return null;
            _battle.Speed = 3f;
            bool boss = false, elite = false;
            float last = 0;
            int n = 0;
            while (true)
            {
                var b = _battle.B;
                var hud = _battle.Hud;
                if (!elite && hud.ModalKind == null)
                    foreach (var e in b.Enemies)
                        if (e.Def.Rank == EnemyRank.Elite && e.Pos.Y < 4f) { elite = true; Shot(prefix + "_elite"); break; }
                if (!boss && b.Wave == b.Stage.BossWave && b.WaveAge > 10f && hud.ModalKind == null) { boss = true; Shot(prefix + "_boss"); }
                if (b.Time - last > 40f && hud.ModalKind == null)
                {
                    last = b.Time;
                    Shot($"{prefix}_p{n++}");
                }
                if (b.Phase == Phase.Victory || b.Phase == Phase.Defeat)
                {
                    while (hud.ModalKind != "victory" && hud.ModalKind != "defeat") yield return null;
                    yield return WaitReal(1.4f);
                    Shot(prefix + "_" + (b.Phase == Phase.Victory ? "win" : "lose"));
                    Debug.Log($"[自检] 第{level}关 {b.Phase}，墙 {b.Wall:0}/{b.WallMax:0}，用时 {b.Time:0}s");
                    break;
                }
                yield return null;
            }
            _autoDone = false;
            yield return WaitReal(0.3f);
        }

        /// <summary>出招特效连拍：指定阵容 1 倍速打一会儿，连拍几十张看刀光、虚影、法阵、落砖。</summary>
        IEnumerator FxBurst(HeroId[] lineup, string prefix, bool meleeOnly = false)
        {
            var s = Meta.ExpectedSave(20);
            s.Lineup = Array.ConvertAll(lineup, h => (int)h);
            foreach (var h in lineup) s.HeroLv[(int)h] = Mathf.Max(s.HeroLv[(int)h], Mathf.Max(1, s.HeroLv[0]));
            Profile.Use(s);
            _autoSkill = 2;
            Play(Defs.Level(20));
            while (_battle == null) yield return null;
            _battle.B.Coins += 3000;
            _battle.Speed = 2f;
            while (_battle.B.Time < 55f) yield return null;
            _battle.Speed = 1f;
            if (meleeOnly)
                foreach (var sl in _battle.B.Slots)
                    if (sl.Unit != null && sl.Unit.Star < 3) sl.Unit.Star = 3;
            var cam = new GameObject("fxCam").AddComponent<Camera>();
            cam.CopyFrom(_cam);
            cam.depth = _cam.depth + 1;
            cam.orthographicSize = 2.6f;
            int n = 0;
            float end = Time.realtimeSinceStartup + 40f, next = 0f;
            while (n < 36 && Time.realtimeSinceStartup < end)
            {
                Sim.Shot pick = null;
                foreach (var sh in _battle.B.Shots)
                {
                    if (sh.T < 0 || sh.Kind == ShotKind.MiniBomb) continue;
                    if (meleeOnly && sh.Kind != ShotKind.Punch && sh.Kind != ShotKind.Spear && sh.Kind != ShotKind.Slam && sh.Kind != ShotKind.Qi) continue;
                    if (pick != null && pick.Kind == ShotKind.Qi && n % 2 == 0) continue;
                    if (pick == null || sh.Id % 7 == n % 7 || sh.Kind == ShotKind.Qi && n % 2 == 0) pick = sh;
                }
                if (_battle.Hud.ModalKind == null && pick != null && Time.realtimeSinceStartup >= next)
                {
                    var at = meleeOnly ? (pick.From.ToV() + pick.To.ToV()) * 0.5f + new Vector2(0, 0.5f)
                        : n % 3 == 2 ? pick.From.ToV() + new Vector2(0, 0.8f) : pick.To.ToV() + new Vector2(0, 0.5f);
                    cam.transform.position = new Vector3(at.x, at.y, -10);
                    for (int f = 0; f < (meleeOnly ? 3 : 1); f++)
                    {
                        yield return null;
                        yield return null;
                        Shot($"{prefix}_{n++:00}");
                    }
                    next = Time.realtimeSinceStartup + 0.12f;
                }
                yield return null;
            }
            Destroy(cam.gameObject);
        }

        IEnumerator SelfCheck()
        {
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-homeshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Profile.S;
                s.Cleared = 7;
                s.Selected = 7;
                if (s.LevelChest == null || s.LevelChest.Length < Defs.LevelCount)
                    s.LevelChest = new int[Defs.LevelCount];
                s.LevelChest[6] = 7;
                ShowHome();
                yield return WaitReal(1.2f);
                Shot("ui_home_chests");
                yield return WaitReal(0.35f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-heroshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                ShowHome(1);
                yield return WaitReal(1.2f);
                Shot("ui_heroes");
                yield return WaitReal(0.35f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-bossshots") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Profile.S;
                s.Cleared = 10;
                foreach (var n in new[] { 1, 2, 5, 10 })
                {
                    s.Selected = n;
                    ShowHome();
                    yield return WaitReal(1.2f);
                    Shot("ui_home_boss_" + n);
                    yield return WaitReal(0.2f);
                }
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-codexshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Meta.NewSave(20261117);
                s.Cleared = 12;
                s.Selected = 12;
                s.HeroLv[(int)HeroId.GongSun] = 5;
                s.HeroLv[(int)HeroId.QinMing] = 4;
                s.HeroLv[(int)HeroId.LingZhen] = 5;
                s.Seen[(int)EnemyKind.Soldier] = 2;
                s.Seen[(int)EnemyKind.Shield] = 2;
                s.Seen[(int)EnemyKind.Cavalry] = 1;
                s.Seen[(int)EnemyKind.Crossbow] = 2;
                s.Seen[(int)EnemyKind.Hawk] = 1;
                s.Seen[(int)EnemyKind.Armored] = 2;
                s.Seen[(int)EnemyKind.FireBomb] = 2;
                s.Seen[(int)EnemyKind.Diver] = 1;
                s.Seen[(int)EnemyKind.Farmer] = 2;
                s.Seen[(int)EnemyKind.Hound] = 2;
                s.Seen[(int)EnemyKind.Taoist] = 2;
                s.Seen[(int)EnemyKind.Elite] = 2;
                s.Seen[(int)EnemyKind.WaterChief] = 2;
                s.Seen[(int)EnemyKind.CrossbowCapt] = 2;
                s.Seen[(int)EnemyKind.GoldenEagle] = 1;
                s.Seen[(int)EnemyKind.IronPagoda] = 2;
                s.Seen[(int)EnemyKind.HighPriest] = 1;
                s.Seen[(int)EnemyKind.ChainHorse] = 2;
                s.Seen[(int)EnemyKind.GiantBrute] = 2;
                s.Seen[(int)EnemyKind.FireCart] = 0;
                s.Seen[(int)EnemyKind.Boss] = 2;
                s.Seen[(int)EnemyKind.Luan] = 1;
                Profile.Use(s);
                ShowHome(HomeScreen.TabFort);
                yield return WaitReal(0.6f);
                MetaUi.Codex(_home.Layer, 1);
                yield return WaitReal(0.75f);
                Shot("ui_codex_elites");
                yield return WaitReal(0.25f);
                MetaUi.CodexDetail(_home.Layer, EnemyKind.IronPagoda, 1);
                yield return WaitReal(0.75f);
                Shot("ui_codex_elite_detail");
                yield return WaitReal(0.25f);
                ShowHome(HomeScreen.TabBattle);
                yield return WaitReal(0.75f);
                Shot("ui_home_stage12_elite");
                yield return WaitReal(0.35f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-wuyongshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Meta.NewSave(20261117);
                s.HeroLv[(int)HeroId.WuYong] = 5;
                s.Lineup = new[] { (int)HeroId.HuaRong, (int)HeroId.WuYong, (int)HeroId.WuSong, (int)HeroId.LingZhen };
                Profile.Use(s);
                Play(Defs.Level(5));
                while (_battle == null) yield return null;
                var b = _battle.B;
                yield return WaitReal(0.55f); // 等第1波官兵走出城门，触发吴用出手施法
                b.Slots[0].Unit = new Unit { Id = 802, Hero = HeroId.WuYong, Star = 1, Cd = 0.05f };
                b.Slots[4].Unit = new Unit { Id = 801, Hero = HeroId.HuaRong, Star = 2, Cd = 6f };
                yield return WaitReal(0.32f);
                Shot("ui_wuyong_windup");
                yield return WaitReal(0.58f);
                Shot("ui_wuyong_midflight");
                yield return WaitReal(0.65f);
                Shot("ui_wuyong_receive");
                for (int i = 0; i < 8; i++)
                {
                    yield return WaitReal(0.12f);
                    Shot("ui_wuyong_land" + i);
                }
                Shot("ui_wuyong_landed");
                yield return WaitReal(0.7f);
                Shot("ui_wuyong_badge");
                yield return WaitReal(0.25f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-textshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Meta.NewSave(20261117);
                s.TutorialDone = 1;
                Profile.Use(s);
                Play(Defs.Level(1));
                while (_battle == null) yield return null;
                yield return WaitReal(0.4f);
                var fx = WorldFx.I;
                fx.Say(new Vector2(-2.6f, 4.6f), "386", WorldFx.Tx.Hit);
                fx.Say(new Vector2(0f, 4.6f), "1.2K", WorldFx.Tx.Crit);
                fx.Say(new Vector2(2.6f, 4.6f), "742", WorldFx.Tx.Slash);
                fx.Say(new Vector2(-2.6f, 2.6f), "+35", WorldFx.Tx.Gain);
                fx.Say(new Vector2(0f, 2.6f), "+120", WorldFx.Tx.Heal);
                fx.Say(new Vector2(2.6f, 2.6f), "-58", WorldFx.Tx.Wall);
                fx.Say(new Vector2(-2.2f, 0.6f), "攻速提升 ×3次", WorldFx.Tx.Buff, Pal.Hex("FFC83A"), 1.1f);
                fx.Say(new Vector2(2.4f, 0.6f), "冷却缩短", WorldFx.Tx.Buff, Pal.Hex("6CC4FF"));
                fx.Say(new Vector2(-2.4f, -1.2f), "晕眩", WorldFx.Tx.Status, Pal.Hex("B8C8FF"));
                fx.Say(new Vector2(0f, -1.2f), "格挡", WorldFx.Tx.Status, Pal.Hex("E8D8A0"));
                fx.Say(new Vector2(2.4f, -1.2f), "破绽 易伤+25%", WorldFx.Tx.Status, Pal.Hex("E496FF"), 1.1f);
                fx.Say(new Vector2(-1.6f, -3.0f), "运筹帷幄", WorldFx.Tx.Skill, Pal.Hex("FFD24A"), 0.85f);
                fx.Say(new Vector2(1.9f, -3.0f), "流星飞锤", WorldFx.Tx.Skill, Pal.Hex("FFB070"), 0.96f);
                yield return WaitReal(0.2f);
                Shot("ui_text_pop");
                yield return WaitReal(0.25f);
                Shot("ui_text_hold");
                yield return WaitReal(3.5f);
                Shot("ui_text_battle0");
                yield return WaitReal(1.2f);
                Shot("ui_text_battle1");
                yield return WaitReal(0.25f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-bookshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Meta.NewSave(20261117);
                s.TutorialDone = 1;
                Profile.Use(s);
                Play(Defs.Level(1));
                while (_battle == null) yield return null;
                var b = _battle.B;
                yield return WaitReal(0.35f);
                Shot("ui_book_idle");
                for (int i = 0; i < Defs.EnhanceUnlockSummons; i++) { b.Coins += b.SummonCost; b.Summon(); }
                b.Coins = 220;
                yield return WaitReal(0.55f);
                Shot("ui_book_lit_a");
                yield return WaitReal(0.95f);
                Shot("ui_book_lit_b");
                yield return WaitReal(0.25f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-weaponshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Meta.NewSave(20261117);
                s.TutorialDone = 1;
                s.HeroLv[(int)HeroId.LiKui] = 5;
                s.HeroLv[(int)HeroId.HuaRong] = 5;
                s.HeroLv[(int)HeroId.LinChong] = 5;
                s.HeroLv[(int)HeroId.XieZhen] = 5;
                s.Lineup = new[] { (int)HeroId.LiKui, (int)HeroId.HuaRong, (int)HeroId.LinChong, (int)HeroId.XieZhen };
                Profile.Use(s);
                Play(Defs.Level(1));
                while (_battle == null) yield return null;
                var b = _battle.B;
                var soldier = Defs.Enemy(EnemyKind.Soldier);
                b.Enemies.Add(new Enemy { Id = 901, Def = soldier, Hp = 5000, MaxHp = 5000, Pos = new V2(b.Slots[1].Pos.X, -0.4f) });
                b.Enemies.Add(new Enemy { Id = 902, Def = soldier, Hp = 5000, MaxHp = 5000, Pos = new V2(b.Slots[3].Pos.X, 1.4f) });
                b.Enemies.Add(new Enemy { Id = 903, Def = soldier, Hp = 5000, MaxHp = 5000, Pos = new V2(b.Slots[3].Pos.X + 0.08f, 3.2f) });
                b.Enemies.Add(new Enemy { Id = 904, Def = soldier, Hp = 5000, MaxHp = 5000, Pos = new V2(b.Slots[5].Pos.X, 0.4f) });
                b.Slots[1].Unit = new Unit { Id = 701, Hero = HeroId.LiKui, Star = 2, Cd = 0.05f };
                b.Slots[3].Unit = new Unit { Id = 702, Hero = HeroId.HuaRong, Star = 2, Cd = 0.05f };
                b.Slots[5].Unit = new Unit { Id = 703, Hero = HeroId.LinChong, Star = 2, Cd = 0.05f };
                yield return WaitReal(0.22f);
                Shot("ui_weapon_midflight");
                yield return WaitReal(0.18f);
                Shot("ui_weapon_impact");
                for (int i = 0; i < 3; i++)
                {
                    yield return WaitReal(0.07f);
                    Shot("ui_weapon_impact" + i);
                }
                yield return WaitReal(0.25f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-equipshot") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                var s = Profile.S;
                s.Cleared = 11;
                s.Iron = 40;
                s.Copper = 800;
                s.RefineStones = 6;
                if (s.EquipLv == null || s.EquipLv.Length < 6) s.EquipLv = new int[6];
                s.EquipLv[0] = 10;
                s.EquipLv[1] = 8;
                s.Totems.Clear();
                var rng = new Rng(7);
                var a = Meta.RollTotem(s, 2, rng, 0);
                a.Kind = 0;
                var b = Meta.RollTotem(s, 3, rng, 0);
                b.Kind = 8;
                Meta.ToggleInlayTotem(s, a.Id);
                Meta.ToggleInlayTotem(s, b.Id);
                ShowHome(HomeScreen.TabForge);
                yield return WaitReal(0.8f);
                MetaUi.EquipSheet(_home.Layer, 0);
                yield return WaitReal(0.7f);
                Shot("ui_equip_sheet");
                yield return WaitReal(0.2f);
                MetaUi.ForgeSlot(_home.Layer, 0);
                yield return WaitReal(0.7f);
                Shot("ui_equip_forge");
                yield return WaitReal(0.2f);
                MetaUi.ForgeSlot(_home.Layer, 0, null, true);
                yield return WaitReal(0.5f);
                Shot("ui_equip_wash");
                yield return WaitReal(0.3f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-uishots") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                Play(Defs.Level(5));
                while (_battle == null) yield return null;
                yield return WaitReal(0.6f);
                var b = _battle.B;
                for (int i = 0; i < b.Lineup.Length; i++)
                    b.DamageBy[(int)b.Lineup[i]] = new[] { 12840f, 6320f, 4100f, 860f }[i % 4];
                b.LordDamage = 1540f;
                _battle.Hud.OpenPanel("stats");
                yield return WaitReal(0.7f);
                Shot("ui_stats");
                yield return WaitReal(0.25f);
                _battle.Hud.ClosePanel();
                yield return WaitReal(0.25f);
                _battle.Hud.OpenRoster();
                yield return WaitReal(0.7f);
                Shot("ui_roster");
                yield return WaitReal(0.35f);
                Application.Quit(0);
                yield break;
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-fxshots") >= 0)
            {
                Sfx.On = false;
                Sfx.Music = false;
                if (Array.IndexOf(Environment.GetCommandLineArgs(), "-fxmelee") < 0)
                {
                    yield return FxBurst(new[] { HeroId.ShiXiu, HeroId.LiKui, HeroId.MaLing, HeroId.WuSong }, "fxa");
                    yield return FxBurst(new[] { HeroId.LinChong, HeroId.GuanSheng, HeroId.ZhuWu, HeroId.GongSun }, "fxb");
                }
                yield return FxBurst(new[] { HeroId.ShiXiu, HeroId.GuanSheng, HeroId.LiKui, HeroId.WuSong }, "fxc", true);
                Application.Quit(0);
                yield break;
            }
            if (_metaOnly)
            {
                Sfx.On = false;
                Sfx.Music = false;
                _autoSkill = 0;
                Play(Defs.Level(1));
                yield return WaitReal(2f);
                yield return MetaShots();
                Application.Quit(0);
                yield break;
            }
            Sfx.On = false;
            Sfx.Music = false;
            // 模拟编辑器场景里自带的 Main Camera，确认不会抢走画面。
            var decoy = new GameObject("Main Camera") { tag = "MainCamera" }.AddComponent<Camera>();
            decoy.orthographic = true;
            decoy.orthographicSize = 5;
            decoy.gameObject.AddComponent<AudioListener>();
            ShowHome();
            yield return WaitReal(1.5f);
            Shot("01_home");
            yield return WaitReal(0.5f);
            // 新手引导截一张：真人模式开局。
            StartLevel(1);
            yield return WaitReal(2.5f);
            Shot("02_tutorial");
            yield return WaitReal(0.4f);
            yield return ManualPlay();

            _autoSkill = 2;
            Play(Defs.Level(1));
            while (_battle == null) yield return null;
            bool cards = false, reels = false, boss = false, rage = false, mid = false, early = false, late = false, gate = false, walkBig = false;
            float lastPeriodic = 0;
            int periodic = 0, lordCasts = 0;
            _autoDone = false;
            while (!_autoDone)
            {
                var b = _battle.B;
                var hud = _battle.Hud;
                if (!early && b.Time > 6f)
                {
                    early = true;
                    Shot("03_early");
                    yield return WalkBurst(EnemyKind.Soldier, "03w");
                }
                if (!walkBig && b.Wave >= 3 && hud.ModalKind == null)
                {
                    foreach (var en in b.Enemies)
                        if (en.Def.Kind == EnemyKind.Shield && !en.Attacking && en.Pos.Y < 6f) { walkBig = true; break; }
                    if (walkBig) yield return WalkBurst(EnemyKind.Shield, "03s");
                }
                if (!gate && b.Wave == 2 && _battle.GateOpen > 0.95f && hud.ModalKind == null) { gate = true; Shot("03b_gate_open"); }
                if (lordCasts < 2 && b.LordCasts > lordCasts && hud.ModalKind == null)
                {
                    lordCasts = b.LordCasts;
                    for (int i = 0; i < 6; i++)
                    {
                        yield return WaitReal(0.1f);
                        Shot($"03c_lord{lordCasts}_{i}");
                    }
                }
                if (!cards && hud.ModalKind == "cards")
                {
                    cards = true;
                    yield return WaitReal(0.9f);
                    Shot("04_cards");
                }
                if (!reels && hud.ModalKind == "reels")
                {
                    reels = true;
                    yield return WaitReal(0.5f);
                    Shot("05_reels_open");
                    yield return WaitReal(2.8f);
                    Shot("06_reels_result");
                }
                if (!mid && b.Time > 45f && hud.ModalKind == null)
                {
                    mid = true;
                    Shot("07_mid");
                    for (int i = 0; i < 3; i++)
                    {
                        yield return WaitReal(0.12f);
                        Shot("07_fx" + i);
                    }
                    Enemy near = null;
                    foreach (var en in b.Enemies) if (!en.Dead && en.Pos.Y < 4f && (near == null || en.Def.Big)) near = en;
                    if (near != null)
                    {
                        hud.EnemyInfo(near);
                        yield return WaitReal(0.4f);
                        Shot("07e_enemy_info");
                        yield return WaitReal(0.2f);
                        hud.CloseInfo();
                    }
                    Slot top = null;
                    foreach (var sl in b.Slots) if (sl.Unit != null && (top == null || sl.Unit.Star > top.Unit.Star)) top = sl;
                    if (top != null)
                    {
                        hud.SlotInfo(top, 4);
                        yield return WaitReal(0.4f);
                        Shot("07s_star_tab");
                        yield return WaitReal(0.2f);
                        hud.CloseInfo();
                    }
                    hud.OpenRoster();
                    yield return WaitReal(0.5f);
                    Shot("07r_roster");
                    yield return WaitReal(0.2f);
                    hud.CloseRoster();
                }
                if (!boss && b.Wave == b.Stage.BossWave && b.WaveAge > 9f && hud.ModalKind == null) { boss = true; Shot("08_boss"); }
                if (!rage && b.Wave == b.Stage.RageWave && b.WaveAge > 4f && hud.ModalKind == null) { rage = true; Shot("09_rage"); }
                if (!late && b.Wave >= 10 && b.WaveAge > 8f && hud.ModalKind == null) { late = true; Shot("10_late"); }
                if (b.Time - lastPeriodic > 30f && hud.ModalKind == null)
                {
                    lastPeriodic = b.Time;
                    Shot($"p{periodic++:00}_t{Mathf.RoundToInt(b.Time)}");
                }
                if (b.Phase == Phase.Victory || b.Phase == Phase.Defeat)
                {
                    while (hud.ModalKind != "victory" && hud.ModalKind != "defeat") yield return null;
                    yield return WaitReal(1.4f);
                    Shot(b.Phase == Phase.Victory ? "11_victory" : "11_defeat_skill2");
                    Debug.Log($"[自检] 第一局结果 {b.Phase}，墙 {b.Wall:0}/{b.WallMax:0}，用时 {b.Time:0}s");
                    yield return WaitReal(0.4f);
                    break;
                }
                yield return null;
            }

            // 失败结算：只会召唤的机器人。
            _autoSkill = 0;
            Play(Defs.Level(1));
            while (_battle == null) yield return null;
            _battle.Speed = 3f;
            while (true)
            {
                var b = _battle.B;
                if (b.Phase == Phase.Defeat || b.Phase == Phase.Victory)
                {
                    while (_battle.Hud.ModalKind != "victory" && _battle.Hud.ModalKind != "defeat") yield return null;
                    yield return WaitReal(1.2f);
                    Shot("12_" + (b.Phase == Phase.Defeat ? "defeat" : "victory_skill0"));
                    break;
                }
                yield return null;
            }
            yield return WaitReal(0.5f);
            yield return MetaShots();
            yield return AutoBattle(35, "25_L35");
            yield return AutoBattle(50, "26_L50");
            Debug.Log("[自检] 完成");
            Application.Quit(0);
        }
    }
}
