using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace Liangshan
{
    public enum Snd
    {
        Tap, Deny, Coin, Card, Reel, ReelStop, Jackpot, SlotAdd, Warn,
        Summon, Merge, Bow, ArrowHit, Bomb, Thunder, Fist, WallHit, Kill, Wave,
        UltArrow, UltBomb, UltThunder, UltFist,
        Tab, Open, Close, LevelUp, Unlock, Talent, Forge, Reward, Reveal, Flip, Drum, Swap, Tick,
        Dart, Staff, Dao, Sword, Whip, SpearHit, Hammer, Axe, Lasso, Water, Whirl, Poison, Magic, Heal, Horse,
        Crit, UltWind, UltWater,
        Chop, Thrust, Jab, Spell, GoldSlam, Gust,
        Crossbow, ArrowPierce, CannonFire, CannonBoom, OilJar, MeteorHit,
        FireBeam, IceShatter, NetCast, ArraySeal, GlaiveCleave, JadePing,
        LordSlash, SigTrigger, Awaken,
        ArrowBlast, ShieldBlock, FuseThrow, MaceCast, ThunderCast, Stun,
    }

    public enum Bgm { None, Menu, Battle, Boss, Victory, Defeat }

    /// <summary>
    /// 全游戏三总线混音系统（UI/庆典轨 · 高优大招奥义轨 · 动态密度抑制战斗轨）：
    /// 全部 75 枚音效读 Resources/Sfx 的物理模态母带录音（带程序暖音兜底）；
    /// 配乐编辑器和 Mac 包读 StreamingAssets/Music，微信包从 CDN 按需拉。
    /// </summary>
    public sealed class Sfx : MonoBehaviour
    {
        const int Rate = 22050;
        static Sfx _i;
        readonly Dictionary<Snd, AudioClip> _clips = new Dictionary<Snd, AudioClip>();
        readonly Dictionary<Snd, float> _last = new Dictionary<Snd, float>();
        readonly Dictionary<Bgm, AudioClip> _music = new Dictionary<Bgm, AudioClip>();
        readonly HashSet<Bgm> _fetching = new HashSet<Bgm>();
        AudioSource[] _uiSrc;
        AudioSource[] _prioSrc;
        AudioSource[] _combatSrc;
        AudioSource _bgm;
        Bgm _want, _playing;
        /// <summary>自己记配乐有没有在放。WebGL 上每帧查 isPlaying，FMOD 句柄作废后会刷 INVALID_HANDLE。</summary>
        bool _bgmOn;
        int _nextUi, _nextPrio, _nextCombat;
        float _density, _duck, _bgmDuck;
        bool _adMuted;

        public static bool On = true;
        public static bool Music = true;

        /// <summary>微信全屏广告播放期间静音游戏音源，回到前台后平滑恢复。</summary>
        public static void SetAdMute(bool muted)
        {
            if (_i == null) return;
            _i._adMuted = muted;
            AudioListener.pause = muted;
            if (muted && _i._bgm != null) _i._bgm.volume = 0f;
        }

        public static void Init(GameObject host)
        {
            if (_i != null) return;
            _i = host.AddComponent<Sfx>();
            _i.Build();
        }

        AudioSource[] MakePool(int count)
        {
            var arr = new AudioSource[count];
            for (int i = 0; i < count; i++)
            {
                arr[i] = gameObject.AddComponent<AudioSource>();
                arr[i].playOnAwake = false;
                arr[i].spatialBlend = 0f;
            }
            return arr;
        }

        void Build()
        {
            _uiSrc = MakePool(6);
            _prioSrc = MakePool(4);
            _combatSrc = MakePool(12);
            _bgm = gameObject.AddComponent<AudioSource>();
            _bgm.loop = true;
            _bgm.spatialBlend = 0f;
            _bgm.volume = 0f;

            // 温润兜底合成音（仅在 Resources 缺失时兜底）
            _clips[Snd.Tap] = Synth(0.065f, t => Tone(t, 780f, 0.055f) * 0.55f + Tone(t, 1560f, 0.03f) * 0.22f);
            _clips[Snd.Deny] = Synth(0.20f, t => Tone(t, 280f, 0.09f) * 0.45f + Tone(t - 0.08f, 210f, 0.11f) * 0.5f);
            _clips[Snd.Coin] = Synth(0.26f, t => (Tone(t, 2350f, 0.20f) + Tone(t - 0.05f, 3136f, 0.20f)) * 0.35f);
            _clips[Snd.Card] = Synth(0.14f, t => Tone(t, 520f, 0.08f) * 0.4f + SoftNoise(t, 0.10f) * 0.2f);
            _clips[Snd.Reel] = Synth(0.05f, t => Tone(t, 1080f, 0.045f) * 0.35f);
            _clips[Snd.ReelStop] = Synth(0.16f, t => Tone(t, 180f, 0.12f) * 0.55f + Tone(t, 1680f, 0.08f) * 0.28f);
            _clips[Snd.Jackpot] = Synth(0.95f, t => Arp(t, new[] { 392f, 523.25f, 587.33f, 659.25f, 784f, 1046.5f }, 0.06f, 0.95f) * 0.45f);
            _clips[Snd.SlotAdd] = Synth(0.45f, t => Arp(t, new[] { 523.25f, 659.25f, 784f, 1046.5f }, 0.055f, 0.45f) * 0.4f);
            _clips[Snd.Warn] = Synth(0.85f, t => (Tone(t, 130.8f, 0.85f) * 0.5f + Tone(t, 196f, 0.85f) * 0.35f) * Mathf.Clamp01(t * 10f));
            _clips[Snd.Kill] = Synth(0.08f, t => Tone(t, 160f - t * 900f, 0.08f) * 0.4f);

            // 核心战斗循环与号角（全部走母带级录音）
            Load(Snd.Card, "ui_card", Snd.Card);
            Load(Snd.Reel, "ui_reel", Snd.Reel);
            Load(Snd.ReelStop, "ui_reel_stop", Snd.ReelStop);
            Load(Snd.Jackpot, "ui_jackpot", Snd.Jackpot);
            Load(Snd.SlotAdd, "ui_slot_add", Snd.SlotAdd);
            Load(Snd.Warn, "warn_horn", Snd.Warn);
            Load(Snd.Kill, "kill_pop", Snd.Kill);
            Load(Snd.Summon, "join", Snd.Tap);
            Load(Snd.Merge, "rank_up", Snd.SlotAdd);

            // 兵器出手、受击与大招
            Load(Snd.Bow, "bow", Snd.Tap);
            Load(Snd.ArrowHit, "arrow_hit", Snd.Kill);
            Load(Snd.Bomb, "fire", Snd.Kill);
            Load(Snd.Thunder, "thunder_hit", Snd.Kill);
            Load(Snd.Fist, "fist", Snd.Kill);
            Load(Snd.WallHit, "stone", Snd.Kill);
            Load(Snd.Wave, "ult_drum", Snd.Warn);
            Load(Snd.UltArrow, "ult_arrow", Snd.Warn);
            Load(Snd.UltBomb, "ult_cannon", Snd.Warn);
            Load(Snd.UltThunder, "ult_thunder", Snd.Warn);
            Load(Snd.UltFist, "ult_smash", Snd.Warn);
            Load(Snd.Dart, "dart", Snd.Bow);
            Load(Snd.Staff, "staff", Snd.Fist);
            Load(Snd.Dao, "blade_hit", Snd.ArrowHit);
            Load(Snd.Sword, "blade_swing", Snd.Bow);
            Load(Snd.Whip, "whip", Snd.Bow);
            Load(Snd.SpearHit, "spear", Snd.ArrowHit);
            Load(Snd.Hammer, "hammer", Snd.WallHit);
            Load(Snd.Axe, "axe", Snd.Fist);
            Load(Snd.Lasso, "lasso", Snd.ArrowHit);
            Load(Snd.Water, "water", Snd.Kill);
            Load(Snd.Whirl, "ult_whirl", Snd.Kill);
            Load(Snd.Poison, "poison_puff", Snd.Kill);
            Load(Snd.Magic, "magic_soft", Snd.SlotAdd);
            Load(Snd.Heal, "ult_heal", Snd.SlotAdd);
            Load(Snd.Horse, "horse", Snd.Tap);
            Load(Snd.Crit, "crit", Snd.ArrowHit);
            Load(Snd.UltWind, "ult_wind", Snd.Wave);
            Load(Snd.UltWater, "ult_water", Snd.Wave);
            Load(Snd.Chop, "axe_chop", Snd.Axe);
            Load(Snd.Thrust, "spear_thrust", Snd.Sword);
            Load(Snd.Jab, "fist_swing", Snd.Sword);
            Load(Snd.Spell, "spell_cast", Snd.Magic);
            Load(Snd.GoldSlam, "gold_slam", Snd.Hammer);
            Load(Snd.Gust, "spell_wind", Snd.Whirl);

            // 三阶品级专属兵器与四技能新增音效
            Load(Snd.Crossbow, "crossbow", Snd.Bow);
            Load(Snd.ArrowPierce, "arrow_pierce", Snd.ArrowHit);
            Load(Snd.CannonFire, "cannon_fire", Snd.Jab);
            Load(Snd.CannonBoom, "cannon_boom", Snd.Bomb);
            Load(Snd.OilJar, "oil_jar", Snd.Bomb);
            Load(Snd.MeteorHit, "meteor_hit", Snd.CannonBoom);
            Load(Snd.FireBeam, "fire_beam", Snd.Spell);
            Load(Snd.IceShatter, "ice_shatter", Snd.UltWater);
            Load(Snd.NetCast, "net_cast", Snd.Whip);
            Load(Snd.ArraySeal, "array_seal", Snd.Magic);
            Load(Snd.GlaiveCleave, "glaive_cleave", Snd.Chop);
            Load(Snd.JadePing, "jade_ping", Snd.ArrowHit);
            Load(Snd.LordSlash, "lord_slash", Snd.UltFist);
            Load(Snd.SigTrigger, "sig_trigger", Snd.SlotAdd);
            Load(Snd.Awaken, "awaken", Snd.Reveal);
            Load(Snd.ArrowBlast, "arrow_blast", Snd.Bomb);
            Load(Snd.ShieldBlock, "shield_block", Snd.WallHit);
            Load(Snd.FuseThrow, "fuse_throw", Snd.Dart);
            Load(Snd.MaceCast, "mace_cast", Snd.Staff);
            Load(Snd.ThunderCast, "thunder_cast", Snd.Spell);
            Load(Snd.Stun, "stun_bonk", Snd.WallHit);

            // 局外与局内界面交互音效
            Load(Snd.Tap, "ui_tap", Snd.Tap);
            Load(Snd.Deny, "ui_deny", Snd.Deny);
            Load(Snd.Coin, "ui_coin", Snd.Coin);
            Load(Snd.Tab, "ui_tab", Snd.Tap);
            Load(Snd.Open, "ui_open", Snd.Tap);
            Load(Snd.Close, "ui_close", Snd.Tap);
            Load(Snd.LevelUp, "ui_levelup", Snd.Jackpot);
            Load(Snd.Unlock, "ui_unlock", Snd.SlotAdd);
            Load(Snd.Talent, "ui_talent", Snd.SlotAdd);
            Load(Snd.Forge, "ui_forge", Snd.WallHit);
            Load(Snd.Reward, "ui_reward", Snd.Jackpot);
            Load(Snd.Reveal, "ui_reveal", Snd.Jackpot);
            Load(Snd.Flip, "ui_flip", Snd.Card);
            Load(Snd.Drum, "ui_drum", Snd.Wave);
            Load(Snd.Swap, "ui_swap", Snd.Tap);
            Load(Snd.Tick, "ui_tick", Snd.Reel);
        }

        void Load(Snd s, string file, Snd fallback)
        {
            var c = Resources.Load<AudioClip>("Sfx/" + file);
            _clips[s] = c != null ? c : _clips[fallback];
        }

        static bool IsUi(Snd s)
        {
            switch (s)
            {
                case Snd.Tap:
                case Snd.Deny:
                case Snd.Coin:
                case Snd.Card:
                case Snd.Reel:
                case Snd.ReelStop:
                case Snd.Jackpot:
                case Snd.SlotAdd:
                case Snd.Summon:
                case Snd.Merge:
                case Snd.Tab:
                case Snd.Open:
                case Snd.Close:
                case Snd.LevelUp:
                case Snd.Unlock:
                case Snd.Talent:
                case Snd.Forge:
                case Snd.Reward:
                case Snd.Reveal:
                case Snd.Flip:
                case Snd.Swap:
                case Snd.Tick:
                    return true;
                default:
                    return false;
            }
        }

        static bool IsPriority(Snd s)
        {
            switch (s)
            {
                case Snd.Warn:
                case Snd.Wave:
                case Snd.Drum:
                case Snd.UltArrow:
                case Snd.UltBomb:
                case Snd.UltThunder:
                case Snd.UltFist:
                case Snd.UltWind:
                case Snd.UltWater:
                case Snd.IceShatter:
                case Snd.LordSlash:
                case Snd.Awaken:
                    return true;
                default:
                    return false;
            }
        }

        /// <summary>五声和弦与旋律庆典音效保持精准音高，避免随机跑调；物理打击与破风保留细微人性化音高微差。</summary>
        static float PitchJitter(Snd s)
        {
            switch (s)
            {
                case Snd.Merge:
                case Snd.SlotAdd:
                case Snd.Jackpot:
                case Snd.LevelUp:
                case Snd.Unlock:
                case Snd.Talent:
                case Snd.Reward:
                case Snd.Reveal:
                case Snd.Awaken:
                case Snd.SigTrigger:
                case Snd.Heal:
                case Snd.Magic:
                case Snd.ArraySeal:
                case Snd.Warn:
                case Snd.Coin:
                case Snd.Open:
                case Snd.Close:
                case Snd.Deny:
                    return 0f;
                default:
                    return IsUi(s) ? 0.008f : 0.032f;
            }
        }

        static float GapOf(Snd s)
        {
            switch (s)
            {
                case Snd.Tap:
                case Snd.Tab:
                case Snd.Open:
                case Snd.Close:
                case Snd.Swap:
                case Snd.Flip:
                case Snd.Card:
                case Snd.Reel:
                case Snd.Tick:
                    return 0.026f;
                case Snd.Coin:
                    return 0.042f;
                case Snd.Summon:
                case Snd.Merge:
                    return 0.045f;
                case Snd.Bow:
                case Snd.Crossbow:
                case Snd.Dart:
                case Snd.ArrowHit:
                case Snd.ArrowPierce:
                case Snd.JadePing:
                    return 0.048f;
                case Snd.Whirl:
                case Snd.FireBeam:
                case Snd.Magic:
                case Snd.Heal:
                case Snd.Water:
                case Snd.Poison:
                    return 0.20f;
                case Snd.SigTrigger:
                    return 0.16f;
                case Snd.Crit:
                    return 0.11f;
                case Snd.Kill:
                case Snd.Fist:
                case Snd.Bomb:
                case Snd.CannonBoom:
                case Snd.OilJar:
                case Snd.MeteorHit:
                case Snd.Thunder:
                case Snd.WallHit:
                case Snd.GlaiveCleave:
                case Snd.Chop:
                case Snd.Hammer:
                case Snd.ArrowBlast:
                case Snd.ShieldBlock:
                case Snd.Stun:
                    return 0.065f;
                default:
                    return 0.052f;
            }
        }

        public static void Play(Snd s, float vol = 1f, float pitch = 1f)
        {
            if (_i == null || !On || _i._adMuted) return;
            if (!_i._clips.TryGetValue(s, out var clip) || clip == null) return;

            float now = Time.unscaledTime;
            float gap = GapOf(s);
            if (_i._last.TryGetValue(s, out var prev) && now - prev < gap) return;
            _i._last[s] = now;

            AudioSource src;
            float gain = vol;
            if (IsUi(s))
            {
                src = _i._uiSrc[_i._nextUi];
                _i._nextUi = (_i._nextUi + 1) % _i._uiSrc.Length;
                if (s == Snd.Tap) gain *= 0.76f;
                else if (s == Snd.Tab) gain *= 0.78f;
                else if (s == Snd.Tick) gain *= 0.72f;
                if (s == Snd.Jackpot || s == Snd.LevelUp || s == Snd.Awaken)
                    _i._bgmDuck = Mathf.Max(_i._bgmDuck, 0.50f);
            }
            else if (IsPriority(s))
            {
                src = _i._prioSrc[_i._nextPrio];
                _i._nextPrio = (_i._nextPrio + 1) % _i._prioSrc.Length;
                _i._duck = Mathf.Max(_i._duck, 0.36f);
                _i._bgmDuck = Mathf.Max(_i._bgmDuck, 0.42f);
            }
            else
            {
                src = _i._combatSrc[_i._nextCombat];
                _i._nextCombat = (_i._nextCombat + 1) % _i._combatSrc.Length;
                _i._density = Mathf.Min(14f, _i._density + 1f);
                if (_i._density > 3.5f)
                {
                    float crowd = 1f / Mathf.Sqrt(1f + (_i._density - 3.5f) * 0.16f);
                    gain *= Mathf.Max(0.56f, crowd);
                }
                if (_i._duck > 0f)
                    gain *= Mathf.Lerp(1f, 0.56f, Mathf.Clamp01(_i._duck / 0.18f));
            }

            float jit = PitchJitter(s);
            src.pitch = jit > 0f ? pitch * Random.Range(1f - jit, 1f + jit) : pitch;
            src.PlayOneShot(clip, Mathf.Clamp(gain, 0f, 1.15f));
        }

        public static void PlayMusic(Bgm m)
        {
            if (_i == null) return;
            _i._want = Music ? m : Bgm.None;
        }

        void Update()
        {
            if (_adMuted) return;
            float dt = Time.unscaledDeltaTime;
            if (_density > 0f) _density = Mathf.Max(0f, _density - dt * 22f);
            if (_duck > 0f) _duck = Mathf.Max(0f, _duck - dt);
            if (_bgmDuck > 0f) _bgmDuck = Mathf.Max(0f, _bgmDuck - dt);

            if (_want != _playing)
            {
                if (_bgm.volume > 0.01f && _playing != Bgm.None)
                {
                    _bgm.volume = Mathf.MoveTowards(_bgm.volume, 0, dt * 1.2f);
                    return;
                }
                _playing = _want;
                StopBgm();
                if (_want == Bgm.None) return;
                if (_music.TryGetValue(_want, out var clip) && clip != null) StartBgm(clip, _want);
                else StartCoroutine(Fetch(_want));
            }
            float baseTarget = _playing == Bgm.Battle || _playing == Bgm.Boss ? 0.30f : 0.44f;
            float target = _bgmDuck > 0f ? baseTarget * 0.68f : baseTarget;
            if (_bgmOn) _bgm.volume = Mathf.MoveTowards(_bgm.volume, target, dt * (_bgmDuck > 0f ? 2.2f : 0.6f));
        }

        void StartBgm(AudioClip clip, Bgm m)
        {
            _bgm.clip = clip;
            _bgm.loop = m != Bgm.Victory && m != Bgm.Defeat;
            _bgm.volume = 0;
            _bgm.Play();
            _bgmOn = true;
        }

        void StopBgm()
        {
            if (!_bgmOn) return;
            _bgm.Stop();
            _bgmOn = false;
        }

        /// <summary>只拉正在用的这一首。微信包里地址含 StreamingAssets，插件按这个标识做本地缓存，下次不用再下。</summary>
        IEnumerator Fetch(Bgm m)
        {
            if (!_fetching.Add(m)) yield break;
            string name = m == Bgm.Menu ? "menu" : m == Bgm.Battle ? "battle" : m == Bgm.Boss ? "epic" : m == Bgm.Victory ? "victory" : "defeat";
            using (var req = UnityWebRequestMultimedia.GetAudioClip(TrackUrl(name), AudioType.MPEG))
            {
                yield return req.SendWebRequest();
                _fetching.Remove(m);
                if (req.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogWarning("[曲子] " + name + " 没拉下来：" + req.error);
                    yield break;
                }
                var clip = DownloadHandlerAudioClip.GetContent(req);
                if (clip == null) yield break;
                clip.name = name;
                _music[m] = clip;
            }
            if (_playing == m) StartBgm(_music[m], m);
        }

        static string TrackUrl(string name)
        {
#if UNITY_EDITOR || UNITY_STANDALONE
            string root = Application.streamingAssetsPath;
            if (!root.Contains("://")) root = "file://" + root;
            return root.TrimEnd('/') + "/Music/" + name + ".mp3";
#else
            return CloudConfig.AssetCdn.TrimEnd('/') + "/StreamingAssets/Music/" + name + ".mp3";
#endif
        }

        // ---------- 温润兜底合成 ----------

        static AudioClip Synth(float dur, System.Func<float, float> f)
        {
            int n = Mathf.CeilToInt(dur * Rate);
            var data = new float[n];
            for (int i = 0; i < n; i++) data[i] = Mathf.Clamp(f(i / (float)Rate), -1, 1);
            var c = AudioClip.Create("synth", n, 1, Rate, false);
            c.SetData(data, 0);
            return c;
        }

        static float Env(float t, float dur) => t < 0 ? 0 : Mathf.Pow(Mathf.Clamp01(1 - t / dur), 2f);
        static float Tone(float t, float hz, float dur) => t < 0 ? 0 : Mathf.Sin(t * hz * Mathf.PI * 2) * Env(t, dur);
        static float SoftNoise(float t, float dur) => t < 0 ? 0 : (Random.value - Random.value) * Env(t, dur);

        static float Arp(float t, float[] notes, float step, float dur)
        {
            float v = 0;
            for (int i = 0; i < notes.Length; i++)
            {
                float tt = t - i * step;
                if (tt < 0) continue;
                v += (Mathf.Sin(tt * notes[i] * Mathf.PI * 2) + 0.25f * Mathf.Sin(tt * notes[i] * 2 * Mathf.PI * 2)) * Env(tt, dur - i * step) * 0.55f;
            }
            return v;
        }
    }
}
