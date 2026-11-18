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
    }

    public enum Bgm { None, Menu, Battle, Boss, Victory, Defeat }

    /// <summary>界面音程序合成；兵器、招式读 Resources/Sfx 的录音；配乐编辑器和 Mac 包读 StreamingAssets/Music，微信包从 CDN 按需拉。</summary>
    public sealed class Sfx : MonoBehaviour
    {
        const int Rate = 22050;
        static Sfx _i;
        readonly Dictionary<Snd, AudioClip> _clips = new Dictionary<Snd, AudioClip>();
        readonly Dictionary<Snd, float> _last = new Dictionary<Snd, float>();
        readonly Dictionary<Bgm, AudioClip> _music = new Dictionary<Bgm, AudioClip>();
        readonly HashSet<Bgm> _fetching = new HashSet<Bgm>();
        AudioSource[] _src;
        AudioSource _bgm;
        Bgm _want, _playing;
        /// <summary>自己记配乐有没有在放。WebGL 上每帧查 isPlaying，FMOD 句柄作废后会刷 INVALID_HANDLE。</summary>
        bool _bgmOn;
        int _next;

        public static bool On = true;
        public static bool Music = true;

        public static void Init(GameObject host)
        {
            if (_i != null) return;
            _i = host.AddComponent<Sfx>();
            _i.Build();
        }

        void Build()
        {
            _src = new AudioSource[14];
            for (int i = 0; i < _src.Length; i++)
            {
                _src[i] = gameObject.AddComponent<AudioSource>();
                _src[i].playOnAwake = false;
            }
            _bgm = gameObject.AddComponent<AudioSource>();
            _bgm.loop = true;
            _bgm.volume = 0f;

            _clips[Snd.Tap] = Synth(0.07f, t => Tone(t, 880, 0.07f) * 0.5f + Tone(t, 1320, 0.04f) * 0.25f);
            _clips[Snd.Deny] = Synth(0.18f, t => Square(t, 140) * Env(t, 0.18f) * 0.25f);
            _clips[Snd.Coin] = Synth(0.25f, t => (Tone(t, 1900, 0.25f) + Tone(t - 0.06f, 2530, 0.19f)) * 0.35f);
            _clips[Snd.Card] = Synth(0.22f, t => Noise() * Env(t, 0.22f) * 0.25f * Mathf.Sin(Mathf.Clamp01(t / 0.22f) * Mathf.PI));
            _clips[Snd.Reel] = Synth(0.04f, t => Tone(t, 1600, 0.04f) * 0.3f);
            _clips[Snd.ReelStop] = Synth(0.14f, t => (Tone(t, 520, 0.14f) + Noise() * Env(t, 0.03f) * 0.4f) * 0.5f);
            _clips[Snd.Jackpot] = Synth(1.1f, t => Arp(t, new[] { 523f, 659f, 784f, 1046f, 1318f }, 0.09f, 1.1f) * 0.45f);
            _clips[Snd.SlotAdd] = Synth(0.5f, t => Arp(t, new[] { 392f, 523f, 659f, 784f }, 0.07f, 0.5f) * 0.4f);
            _clips[Snd.Warn] = Synth(1.0f, t => (Saw(t, 110) * 0.5f + Saw(t, 165) * 0.3f) * Env(t, 1f) * Mathf.Clamp01(t * 12) * 0.35f);
            _clips[Snd.Kill] = Synth(0.06f, t => Noise() * Env(t, 0.06f) * 0.25f);

            Load(Snd.Summon, "join", Snd.Tap);
            Load(Snd.Merge, "rank_up", Snd.SlotAdd);
            Load(Snd.Bow, "bow", Snd.Tap);
            Load(Snd.ArrowHit, "arrow_hit", Snd.Kill);
            Load(Snd.Bomb, "fire", Snd.Kill);
            Load(Snd.Thunder, "staff", Snd.Kill);
            Load(Snd.Fist, "fist", Snd.Kill);
            Load(Snd.WallHit, "stone", Snd.Kill);
            Load(Snd.Wave, "ult_drum", Snd.Warn);
            Load(Snd.UltArrow, "ult_fire", Snd.Warn);
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

        public static void Play(Snd s, float vol = 1f, float pitch = 1f)
        {
            if (_i == null || !On) return;
            float gap = s == Snd.Kill || s == Snd.ArrowHit || s == Snd.Bow || s == Snd.Fist || s == Snd.Bomb || s == Snd.Thunder || s == Snd.WallHit ? 0.07f
                : s == Snd.Whirl || s == Snd.Magic || s == Snd.Heal || s == Snd.Water || s == Snd.Poison ? 0.25f
                : s == Snd.Crit ? 0.12f
                : s >= Snd.Dart ? 0.06f : 0.03f;
            if (_i._last.TryGetValue(s, out var t) && Time.unscaledTime - t < gap) return;
            _i._last[s] = Time.unscaledTime;
            var src = _i._src[_i._next];
            _i._next = (_i._next + 1) % _i._src.Length;
            src.pitch = pitch * Random.Range(0.96f, 1.04f);
            src.PlayOneShot(_i._clips[s], vol);
        }

        public static void PlayMusic(Bgm m)
        {
            if (_i == null) return;
            _i._want = Music ? m : Bgm.None;
        }

        void Update()
        {
            if (_want != _playing)
            {
                if (_bgm.volume > 0.01f && _playing != Bgm.None)
                {
                    _bgm.volume = Mathf.MoveTowards(_bgm.volume, 0, Time.unscaledDeltaTime * 1.2f);
                    return;
                }
                _playing = _want;
                StopBgm();
                if (_want == Bgm.None) return;
                if (_music.TryGetValue(_want, out var clip) && clip != null) StartBgm(clip, _want);
                else StartCoroutine(Fetch(_want));
            }
            float target = _playing == Bgm.Battle || _playing == Bgm.Boss ? 0.32f : 0.45f;
            if (_bgmOn) _bgm.volume = Mathf.MoveTowards(_bgm.volume, target, Time.unscaledDeltaTime * 0.6f);
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

        // ---------- 合成 ----------

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
        static float Square(float t, float hz) => Mathf.Sign(Mathf.Sin(t * hz * Mathf.PI * 2));
        static float Saw(float t, float hz) => (t * hz % 1f) * 2 - 1;
        static float Noise() => Random.value * 2 - 1;

        static float Arp(float t, float[] notes, float step, float dur)
        {
            float v = 0;
            for (int i = 0; i < notes.Length; i++)
            {
                float tt = t - i * step;
                if (tt < 0) continue;
                v += (Mathf.Sin(tt * notes[i] * Mathf.PI * 2) + 0.3f * Mathf.Sin(tt * notes[i] * 2 * Mathf.PI * 2)) * Env(tt, dur - i * step) * 0.6f;
            }
            return v;
        }
    }
}
