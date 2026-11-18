using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>战场上的一次性特效：爆炸、光圈、落雷、飞金币、漂字、震屏。全部走对象池，随 timeScale 暂停。</summary>
    public sealed class WorldFx : MonoBehaviour
    {
        public static WorldFx I { get; private set; }

        sealed class Job
        {
            public GameObject Go;
            public float T, Dur, Delay;
            public Action<float> Step;
            public bool Release;
        }

        readonly List<Job> _jobs = new List<Job>();
        readonly List<Job> _add = new List<Job>();
        readonly Stack<SpriteRenderer> _pool = new Stack<SpriteRenderer>();
        readonly Stack<LineRenderer> _lines = new Stack<LineRenderer>();
        readonly Stack<Tag> _tags = new Stack<Tag>();
        int _liveTexts;
        Material _lineMat;
        RectTransform _textLayer;
        CanvasGroup _numbers;
        Transform _cam;
        Vector3 _camBase;
        float _shake, _shakeT;

        public int LiveTexts => _liveTexts;

        /// <summary>选卡等弹层打开时藏起飘字，免得数字穿进按钮和说明。</summary>
        public void ShowNumbers(bool on)
        {
            var g = Numbers();
            if (g == null) return;
            g.alpha = on ? 1f : 0f;
        }

        /// <summary>
        /// 任何命中掉血统一附赠打击爆芒：一枚锐利四芒星闪 + 沿速度拉长的火花。
        /// 柔光团压得很小，亮石板上叠加的大光团只会糊成一片白雾。
        /// </summary>
        public void HitPop(Vector2 pos, float scale, bool crit)
        {
            float sz = (crit ? 1.45f : 1.05f) * scale;
            Color glowCol = crit ? Pal.Hex("FF8A24") : Pal.Hex("FFC24A");
            var flash = Take(Art.SoftDot, pos, sz * 0.8f, 9543, glowCol.A(crit ? 0.5f : 0.32f), true);
            Anim(flash.gameObject, 0.12f, k =>
            {
                flash.transform.localScale = Vector3.one * sz * Mathf.Lerp(0.6f, 1.1f, Tween.OutCubic(k));
                flash.color = glowCol.A((crit ? 0.5f : 0.32f) * (1f - k) * (1f - k));
            });
            Glint(pos, sz * (crit ? 1.25f : 0.95f), crit ? Pal.Hex("FFF0B0") : Color.white, crit ? 0.2f : 0.15f, 9546);
            SparkStreaks(pos, crit ? 7 : 4, crit ? 0.34f : 0.26f, crit ? 5.2f : 4.2f,
                crit ? Pal.Hex("FFD45A") : Pal.Hex("FFF2C8"), 0.22f, 9548, 6f);
        }

        /// <summary>四芒星闪：瞬间弹到最大再收成一个点，略带转动。命中、出手、法球起飞都用它当“发力点”。</summary>
        public void Glint(Vector2 pos, float size, Color c, float dur = 0.16f, int order = 9560, float delay = 0f)
        {
            var sr = Take(Art.Img("fx_glint"), pos, size * 0.2f, order, c, true);
            float rot = UnityEngine.Random.Range(-12f, 12f);
            Anim(sr.gameObject, dur, k =>
            {
                float s = k < 0.3f ? Tween.OutBack(k / 0.3f) : Mathf.Lerp(1f, 0.25f, Tween.InCubic((k - 0.3f) / 0.7f));
                sr.transform.localScale = new Vector3(1.15f, 1f, 1f) * size * s;
                sr.transform.localRotation = Quaternion.Euler(0, 0, rot + 18f * k);
                sr.color = c.A(c.a * (k < 0.55f ? 1f : 1f - (k - 0.55f) / 0.45f));
            }, true, delay);
        }

        /// <summary>
        /// 火花条：每颗沿自身速度方向拉长（越快越长），受重力下坠时慢慢转向。dir 给了就朝那边喷成扇形。
        /// </summary>
        public void SparkStreaks(Vector2 pos, int n, float len, float speed, Color c, float dur = 0.24f, int order = 9548,
            float gravity = 6f, Vector2? dir = null, float spread = 180f)
        {
            var spr = Art.Img("fx_spark");
            float baseAng = dir.HasValue ? Mathf.Atan2(dir.Value.y, dir.Value.x) * Mathf.Rad2Deg : 90f;
            for (int i = 0; i < n; i++)
            {
                float ang = (baseAng + UnityEngine.Random.Range(-spread, spread)) * Mathf.Deg2Rad;
                var v = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang)) * speed * UnityEngine.Random.Range(0.55f, 1f);
                float l = len * UnityEngine.Random.Range(0.7f, 1.1f);
                float d = dur * UnityEngine.Random.Range(0.8f, 1.2f);
                var sr = Take(spr, pos, l, order, c, true);
                Anim(sr.gameObject, d, k =>
                {
                    float t = k * d;
                    var vel = v + new Vector2(0, -gravity * t);
                    sr.transform.localPosition = pos + v * t + new Vector2(0, -gravity * t * t * 0.5f);
                    sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(vel.y, vel.x) * Mathf.Rad2Deg - 90f);
                    float stretch = Mathf.Clamp(vel.magnitude / Mathf.Max(0.01f, speed), 0.35f, 1.2f);
                    sr.transform.localScale = new Vector3(l * 0.6f, l * stretch, 1f) * (1f - 0.5f * k);
                    sr.color = c.A(c.a * (1f - k * k));
                });
            }
        }

        /// <summary>
        /// 实体碎片（冰晶、钢片）：普通混合、带描边，从命中点往外崩飞并翻转，落地前淡掉。
        /// 有体积的碎片在亮地面上看得清，这是和“贴一张光圈”最大的区别。
        /// </summary>
        public void Shards(Sprite s, Vector2 pos, int n, float size, float speed, Color c, float dur = 0.42f, int order = 9550,
            Vector2? dir = null, float spread = 75f, float gravity = 7f)
        {
            float baseAng = dir.HasValue ? Mathf.Atan2(dir.Value.y, dir.Value.x) * Mathf.Rad2Deg : 90f;
            for (int i = 0; i < n; i++)
            {
                float ang = (baseAng + UnityEngine.Random.Range(-spread, spread)) * Mathf.Deg2Rad;
                var v = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang)) * speed * UnityEngine.Random.Range(0.5f, 1f);
                float sz = size * UnityEngine.Random.Range(0.55f, 1f);
                float d = dur * UnityEngine.Random.Range(0.8f, 1.15f);
                float spin = UnityEngine.Random.Range(-540f, 540f);
                float rot0 = Mathf.Atan2(v.y, v.x) * Mathf.Rad2Deg - 90f;
                var sr = Take(s, pos, sz * 0.3f, order + i % 3, c);
                Anim(sr.gameObject, d, k =>
                {
                    float t = k * d;
                    sr.transform.localPosition = pos + v * t + new Vector2(0, -gravity * t * t * 0.5f);
                    sr.transform.localRotation = Quaternion.Euler(0, 0, rot0 + spin * t * t);
                    float grow = k < 0.15f ? Tween.OutBack(k / 0.15f) : 1f - 0.35f * (k - 0.15f);
                    sr.transform.localScale = Vector3.one * sz * grow;
                    sr.color = c.A(c.a * (k < 0.6f ? 1f : 1f - (k - 0.6f) / 0.4f));
                });
            }
        }

        /// <summary>
        /// 增益落到队友身上：贴地法阵（压扁、转着张开）+ 冲天光柱（深色底衬 + 亮色叠加，亮地面上也有层次）
        /// + 一串往上飘的光点 + 胸口一闪。所有辅助的“接收”都走这里，保证同一种仪式感。
        /// </summary>
        public void Blessing(Vector2 feet, Color c, float scale = 1f)
        {
            var deep = Color.Lerp(c, Color.black, 0.45f);
            var sigilSpr = Art.Img("fx_sigil");
            Rune(feet, sigilSpr, 1.9f * scale, deep.A(0.55f), 0.95f, 50f, 156, 0.40f, false);
            Rune(feet, sigilSpr, 1.9f * scale, c.A(0.95f), 0.95f, 50f, 158, 0.40f, true);

            var beamSpr = Art.Img("fx_light_beam");
            void Beam(float w, float h, Color col, int order, bool add, float dur)
            {
                var sr = Take(beamSpr, feet, h, order, col.A(0), add);
                Anim(sr.gameObject, dur, k =>
                {
                    float up = Tween.OutCubic(Mathf.Min(1f, k / 0.22f));
                    float thin = k < 0.5f ? 1f : Mathf.Lerp(1f, 0.25f, (k - 0.5f) / 0.5f);
                    float hh = h * up;
                    sr.transform.localScale = new Vector3(w * thin / 0.25f, hh, 1f);
                    sr.transform.localPosition = feet + new Vector2(0, hh * 0.5f - 0.05f);
                    sr.color = col.A(col.a * (k < 0.08f ? k / 0.08f : 1f - Tween.InCubic((k - 0.08f) / 0.92f)));
                });
            }
            Beam(0.95f * scale, 3.0f * scale, deep.A(0.35f), 9040, false, 0.8f);
            Beam(0.95f * scale, 3.2f * scale, c.A(0.95f), 9050, true, 0.8f);
            Beam(0.42f * scale, 2.6f * scale, Color.white.A(0.85f), 9051, true, 0.55f);

            LightPool(feet + new Vector2(0, 0.05f), 2.3f * scale, c.A(0.8f), 0.7f, 159);
            Glint(feet + new Vector2(0, 0.85f * scale), 1.5f * scale, Color.Lerp(c, Color.white, 0.6f), 0.26f, 9560);
            Motes(feet, 10, 0.75f * scale, c, 1.0f);
        }

        /// <summary>从脚下一圈往上飘的光点：慢慢升、左右轻摆、闪两下再灭。</summary>
        public void Motes(Vector2 feet, int n, float radius, Color c, float dur = 1f, int order = 9470)
        {
            var spr = Art.Img("fx_glint");
            var hot = Color.Lerp(c, Color.white, 0.55f);
            for (int i = 0; i < n; i++)
            {
                float a = UnityEngine.Random.Range(0f, Mathf.PI * 2f);
                var p0 = feet + new Vector2(Mathf.Cos(a) * radius, Mathf.Sin(a) * radius * 0.4f + 0.1f);
                float sz = UnityEngine.Random.Range(0.16f, 0.30f);
                float rise = UnityEngine.Random.Range(1.2f, 2.3f);
                float d = dur * UnityEngine.Random.Range(0.75f, 1.2f);
                float ph = UnityEngine.Random.Range(0f, 6.28f);
                var sr = Take(spr, p0, sz, order, hot.A(0), true);
                Anim(sr.gameObject, d, k =>
                {
                    sr.transform.localPosition = p0 + new Vector2(Mathf.Sin(k * 6f + ph) * 0.08f, rise * Tween.OutCubic(k));
                    float tw = 0.75f + 0.25f * Mathf.Sin(k * 30f + ph);
                    sr.transform.localScale = Vector3.one * sz * tw * (1f - 0.4f * k);
                    sr.color = hot.A((k < 0.15f ? k / 0.15f : 1f - (k - 0.15f) / 0.85f) * tw);
                }, true, i * 0.035f);
            }
        }

        /// <summary>Unity 的空对象用 == 判断。缺失组件直接拿去改 alpha，会报 FloatLayer 上没有 CanvasGroup。</summary>
        CanvasGroup Numbers()
        {
            if (_numbers != null) return _numbers;
            if (_textLayer == null) return null;
            _numbers = _textLayer.GetComponent<CanvasGroup>();
            if (_numbers == null) _numbers = _textLayer.gameObject.AddComponent<CanvasGroup>();
            if (_numbers == null) return null;
            _numbers.blocksRaycasts = false;
            _numbers.interactable = false;
            return _numbers;
        }

        public static WorldFx Create(Transform parent, RectTransform textLayer, Transform cam)
        {
            var go = new GameObject("WorldFx");
            go.transform.SetParent(parent, false);
            I = go.AddComponent<WorldFx>();
            I._textLayer = textLayer;
            I._cam = cam;
            I._camBase = cam.localPosition;
            I._lineMat = AddMat;
            return I;
        }

        void OnDestroy()
        {
            if (I == this) I = null;
            if (_cam) _cam.localPosition = _camBase;
        }

        // ---------- 基础件 ----------

        /// <summary>sprite 长边 = 1 单位，所以 size 就是长边的世界长度。</summary>
        public static SpriteRenderer Spr(Transform parent, Sprite s, Vector2 pos, float size, int order, Color? c = null, string name = "spr")
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = pos;
            go.transform.localScale = Vector3.one * size;
            var sr = go.AddComponent<SpriteRenderer>();
            sr.sprite = s;
            sr.sortingOrder = order;
            sr.color = c ?? Color.white;
            return sr;
        }

        /// <summary>九宫格块，size 为世界尺寸。</summary>
        public static SpriteRenderer Block(Transform parent, Sprite s, Vector2 pos, Vector2 size, int order, Color c, string name = "block")
        {
            var sr = Spr(parent, s, pos, 1f, order, c, name);
            sr.drawMode = SpriteDrawMode.Sliced;
            sr.size = size;
            return sr;
        }

        public static int Order(float y) => 5000 - Mathf.RoundToInt(y * 100f);

        static Material _addMat, _defMat;

        /// <summary>叠加发光材质：亮的地方把底下的地面、人物一起照亮，不再像贴纸浮在上面。</summary>
        public static Material AddMat
        {
            get
            {
                if (_addMat == null)
                {
                    var sh = Resources.Load<Shader>("Shaders/FxAdd");
                    _addMat = new Material(sh != null ? sh : Shader.Find("Sprites/Default"));
                }
                return _addMat;
            }
        }

        public static SpriteRenderer Additive(SpriteRenderer sr)
        {
            sr.sharedMaterial = AddMat;
            return sr;
        }

        SpriteRenderer Take(Sprite s, Vector2 pos, float size, int order, Color c, bool add = false)
        {
            SpriteRenderer sr;
            if (_pool.Count > 0)
            {
                sr = _pool.Pop();
                sr.gameObject.SetActive(true);
            }
            else
            {
                var go = new GameObject("fx");
                go.transform.SetParent(transform, false);
                sr = go.AddComponent<SpriteRenderer>();
                if (_defMat == null) _defMat = sr.sharedMaterial;
            }
            sr.sharedMaterial = add ? AddMat : _defMat;
            sr.sprite = s;
            sr.drawMode = SpriteDrawMode.Simple;
            sr.sortingOrder = order;
            sr.color = c;
            sr.flipX = false;
            sr.flipY = false;
            var t = sr.transform;
            t.localPosition = pos;
            t.localRotation = Quaternion.identity;
            t.localScale = Vector3.one * size;
            return sr;
        }

        public void Anim(GameObject go, float dur, Action<float> step, bool release = true, float delay = 0)
        {
            if (delay > 0) go.SetActive(false);
            _add.Add(new Job { Go = go, Dur = Mathf.Max(0.0001f, dur), Step = step, Release = release, Delay = delay });
        }

        void Update()
        {
            if (_add.Count > 0) { _jobs.AddRange(_add); _add.Clear(); }
            float dt = Time.deltaTime;
            for (int i = _jobs.Count - 1; i >= 0; i--)
            {
                var j = _jobs[i];
                if (j.Go == null) { _jobs.RemoveAt(i); continue; }
                if (j.Delay > 0)
                {
                    j.Delay -= dt;
                    if (j.Delay > 0) continue;
                    j.Go.SetActive(true);
                }
                j.T += dt;
                float k = Mathf.Clamp01(j.T / j.Dur);
                j.Step(k);
                if (k < 1f) continue;
                _jobs.RemoveAt(i);
                if (j.Release) Release(j.Go);
            }
            UpdateShake(dt);
        }

        void Release(GameObject go)
        {
            if (go.TryGetComponent<SpriteRenderer>(out var sr) && go.transform.parent == transform)
            {
                go.SetActive(false);
                _pool.Push(sr);
            }
            else if (go.TryGetComponent<LineRenderer>(out var lr))
            {
                go.SetActive(false);
                _lines.Push(lr);
            }
            else if (go.TryGetComponent<Tag>(out var tag))
            {
                go.SetActive(false);
                _tags.Push(tag);
                _liveTexts--;
            }
            else Destroy(go);
        }

        // ---------- 预设 ----------

        /// <summary>放大再淡出的一次性图。</summary>
        public void Burst(Sprite s, Vector2 pos, float size, float dur = 0.35f, int order = 9500, Color? c = null, float spin = 0, float from = 0.55f, bool add = false)
        {
            var col = c ?? Color.white;
            var sr = Take(s, pos, size * from, order, col, add);
            float rot0 = UnityEngine.Random.Range(0f, 360f) * (spin != 0 ? 1 : 0);
            Anim(sr.gameObject, dur, k =>
            {
                float sc = Mathf.Lerp(from, 1.08f, Tween.OutCubic(Mathf.Min(1, k * 1.8f)));
                sr.transform.localScale = Vector3.one * size * sc;
                if (spin != 0) sr.transform.localRotation = Quaternion.Euler(0, 0, rot0 + spin * k);
                sr.color = col.A(col.a * (k < 0.45f ? 1f : 1f - (k - 0.45f) / 0.55f));
            });
        }

        /// <summary>刀光：月牙从 fromDeg 扫到 toDeg，先亮后散。外圈一层兵器色的光，内芯是白的。</summary>
        public void Swing(Vector2 pos, float size, float fromDeg, float toDeg, Color c, float dur = 0.18f, bool flip = false, int order = 9515)
        {
            var spr = Art.Img("fx_swing");
            var tip = Color.Lerp(Color.white, c, 0.35f);
            var glow = Take(spr, pos, size, order - 1, c.A(0), true);
            var core = Take(spr, pos, size, order, tip.A(0), true);
            glow.flipX = core.flipX = flip;
            void Step(SpriteRenderer sr, float k, Color col, float a, float sc)
            {
                float sweep = Tween.OutCubic(Mathf.Min(1f, k * 1.7f));
                sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Lerp(fromDeg, toDeg, sweep));
                sr.transform.localScale = Vector3.one * size * sc * Mathf.Lerp(0.75f, 1.05f, sweep);
                float alpha = k < 0.12f ? k / 0.12f : 1f - Mathf.Pow((k - 0.12f) / 0.88f, 1.4f);
                sr.color = col.A(a * alpha);
            }
            Anim(glow.gameObject, dur, k => Step(glow, k, c, 0.5f, 1.1f));
            Anim(core.gameObject, dur, k => Step(core, k, tip, 0.7f, 0.92f));
        }

        /// <summary>斩痕：一道细亮线从中间往两头瞬间拉开横过敌人身上，白芯外裹兵器色，随后变细消失。</summary>
        public void CutLine(Vector2 pos, float deg, float len, Color c, float dur = 0.2f, float thick = 0.09f, int order = 9530)
        {
            var glow = Take(Art.Beam, pos, 1f, order - 1, c.A(0), true);
            var core = Take(Art.Beam, pos, 1f, order, Color.white.A(0), true);
            var rot = Quaternion.Euler(0, 0, deg);
            glow.transform.localRotation = core.transform.localRotation = rot;
            void Step(SpriteRenderer sr, float k, Color col, float w)
            {
                float open = Tween.OutCubic(Mathf.Min(1f, k * 4f));
                float thin = 1f - Tween.InCubic(k);
                sr.transform.localScale = new Vector3(len * Mathf.Lerp(0.2f, 1f, open), w * thin, 1f);
                sr.color = col.A(col.a * (k < 0.6f ? 1f : (1f - k) / 0.4f));
            }
            Anim(glow.gameObject, dur, k => Step(glow, k, c.A(0.8f), thick * 6f));
            Anim(core.gameObject, dur, k => Step(core, k, Color.white, thick * 2.2f));
        }

        /// <summary>两点之间的光束：从 a 一头亮起扫到 b，再从 a 那头收掉，像枪芒捅穿过去。</summary>
        public void Streak(Vector2 a, Vector2 b, Color c, float width, float dur = 0.18f, int order = 9520)
        {
            var d = b - a;
            float len = d.magnitude;
            if (len < 0.01f) return;
            var dir = d / len;
            var sr = Take(Art.Beam, a, 1f, order, c.A(0), true);
            sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
            Anim(sr.gameObject, dur, k =>
            {
                float head = Tween.OutCubic(Mathf.Min(1f, k * 2.2f)) * len;
                float tail = Tween.InCubic(k) * len;
                float span = Mathf.Max(0.02f, head - tail);
                sr.transform.localPosition = a + dir * (tail + span * 0.5f);
                sr.transform.localScale = new Vector3(span, width * (1f - k * 0.6f), 1f);
                sr.color = c.A(c.a);
            });
        }

        /// <summary>地上的法阵：压扁贴地慢慢转，先张开再淡掉。</summary>
        public void Rune(Vector2 pos, float size, Color c, float dur, float spin = 60f, int order = 96, float flat = 0.5f) =>
            Rune(pos, Art.Img("fx_rune"), size, c, dur, spin, order, flat, true);

        public void Rune(Vector2 pos, Sprite s, float size, Color c, float dur, float spin, int order, float flat, bool add)
        {
            var holder = new GameObject("rune").transform;
            holder.SetParent(transform, false);
            holder.localPosition = pos;
            holder.localScale = new Vector3(1f, flat, 1f);
            var sr = Spr(holder, s, Vector2.zero, size, order, c.A(0));
            if (add) Additive(sr);
            float rot0 = UnityEngine.Random.Range(0f, 360f);
            Anim(holder.gameObject, dur, k =>
            {
                float open = Tween.OutCubic(Mathf.Min(1f, k * dur / 0.25f));
                sr.transform.localScale = Vector3.one * size * Mathf.Lerp(0.55f, 1f, open);
                sr.transform.localRotation = Quaternion.Euler(0, 0, rot0 + spin * k * dur);
                float fadeIn = Mathf.Min(1f, k * dur / 0.1f);
                float fadeOut = Mathf.Clamp01((1f - k) * dur / 0.3f);
                sr.color = c.A(c.a * fadeIn * fadeOut);
            });
        }

        public static readonly Color QiIce = new Color(0.78f, 0.97f, 1f), QiCyan = new Color(0.30f, 0.80f, 1f), QiDeep = new Color(0.08f, 0.36f, 0.95f), QiShade = new Color(0.03f, 0.10f, 0.36f);

        /// <summary>
        /// 寨主剑气：月牙刃口朝人群飞到半圆边上，同一刻一道贴地半圆余波扫满整个范围。
        /// 刃口到某点的时刻和伤害一致（Layout.LordHitDelay）。
        /// 剑身普通混合保证亮地面上看得见，刃口和柔光叠加发亮；身后有残影、风痕、地面剑痕和刃尖碎屑。
        /// </summary>
        public void SwordWave(Vector2 from, Vector2 to)
        {
            var d = to - from;
            var dir = d.sqrMagnitude < 1e-4f ? Vector2.up : d.normalized;
            var side = new Vector2(dir.y, -dir.x);
            float speed = Defs.LordWaveSpeed;
            float reach = Layout.HalfW;
            float fly = Layout.LordFlightTime;
            const float tail = 0.2f, bladeW = 5f;
            float dur = fly + tail;
            float deg = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;
            var rot = Quaternion.Euler(0, 0, deg - 90f);

            var glow = Take(Art.Img("fx_qi_glow"), from, bladeW, 9588, QiDeep.A(0));
            var blade = Take(Art.Img("fx_qi_blade"), from, bladeW, 9590, Color.white.A(0));
            var edge = Take(Art.Img("fx_qi_edge"), from, bladeW, 9592, Color.white.A(0), true);
            var shade = Take(Art.Img("fx_qi_blade"), from, bladeW, 9589, QiShade.A(0));
            var echo = Take(Art.Img("fx_qi_blade"), from, bladeW, 9587, Color.white.A(0));
            var wake = Take(Art.Img("fx_qi_streak"), from, 1f, 9584, QiCyan.A(0), true);
            wake.transform.localRotation = Quaternion.Euler(0, 0, deg);
            glow.transform.localRotation = blade.transform.localRotation = edge.transform.localRotation = rot;
            shade.transform.localRotation = echo.transform.localRotation = rot;

            float lastGhost = 0f, lastChip = 0f;
            int winds = 0;
            float Scale(float t) =>
                Mathf.Lerp(0.42f, 1f, Tween.OutCubic(Mathf.Clamp01(t / 0.1f))) * Mathf.Lerp(1f, 1.22f, Mathf.Clamp01(t / fly))
                * (t > fly ? 1f + 0.5f * Tween.OutCubic((t - fly) / tail) : 1f);
            float Lead(float t) => Mathf.Min(speed * t, reach) + (t > fly ? speed * 0.35f * (t - fly) : 0f);

            Anim(blade.gameObject, dur, k =>
            {
                float t = k * dur;
                float s = Scale(t);
                float w = bladeW * s;
                var lead = from + dir * Lead(t);
                var c = lead - dir * (0.2f * w);
                float a = t < 0.04f ? t / 0.04f : t > fly ? 1f - Tween.InCubic((t - fly) / tail) : 1f;
                float glowW = w * 1.4f;

                blade.transform.localPosition = c;
                blade.transform.localScale = Vector3.one * w;
                blade.color = Color.white.A(a * 0.95f);
                edge.transform.localPosition = c;
                edge.transform.localScale = Vector3.one * w;
                edge.color = Color.white.A(a * (0.8f + 0.2f * Mathf.Sin(t * 95f)));
                shade.transform.localPosition = c - dir * (0.05f * w);
                shade.transform.localScale = new Vector3(w * 1.06f, w * 1.12f, 1f);
                shade.color = QiShade.A(a * 0.42f);
                float ew = w * 0.8f;
                echo.transform.localPosition = lead - dir * (0.16f * w + 0.2f * ew);
                echo.transform.localScale = Vector3.one * ew;
                echo.color = Color.white.A(a * 0.62f * Mathf.Clamp01((t - 0.03f) / 0.05f));
                glow.transform.localPosition = lead - dir * (0.17f * glowW);
                glow.transform.localScale = Vector3.one * glowW;
                glow.color = QiDeep.A(a * 0.3f);

                float run = Mathf.Max(0.05f, Lead(t) - 0.15f * w);
                wake.transform.localPosition = from + dir * (run * 0.5f);
                wake.transform.localScale = new Vector3(run, 0.55f * s / 0.09375f, 1f);
                wake.color = QiCyan.A(0.35f * a * Mathf.Clamp01(1.2f - t / dur));

                if (t - lastGhost >= 0.035f && t < fly)
                {
                    lastGhost = t;
                    Ghost(c, w, rot);
                }
                if (t - lastChip >= 0.05f && t < fly)
                {
                    lastChip = t;
                    var tipBack = c + dir * (0.015f * w);
                    Sparks(Art.SoftDot, tipBack + side * (0.47f * w), 2, 0.07f, 2.6f, QiIce, 0.28f, 9593, 2f, true);
                    Sparks(Art.SoftDot, tipBack - side * (0.47f * w), 2, 0.07f, 2.6f, QiIce, 0.28f, 9593, 2f, true);
                }
                if (winds < 7 && t >= winds * fly / 7f)
                {
                    winds++;
                    float off = UnityEngine.Random.Range(-0.55f, 0.55f) * w;
                    WindStreak(lead - dir * 0.2f + side * off, dir, UnityEngine.Random.Range(1.1f, 2f));
                }
            });
            Anim(edge.gameObject, dur, _ => { });
            Anim(shade.gameObject, dur, _ => { });
            Anim(echo.gameObject, dur, _ => { });
            Anim(glow.gameObject, dur, _ => { });
            Anim(wake.gameObject, dur, _ => { });

            Scar(from, dir, reach);
            HalfShock(from, reach, fly);

            CutLine(from + dir * 0.7f, deg + 90f, 3.4f, QiCyan, 0.24f, 0.13f, 9594);
            Flash(from + dir * 0.5f, 3.2f, QiCyan.A(0.75f), 0.28f, 9585);
            LightPool(from + dir * 0.6f, 4.2f, QiCyan.A(0.7f), 0.45f, 94);
            GroundWave(from, 1.8f, QiIce, 0.4f, 95, 0.45f);
            Sparks(Art.Img("fx_star"), from + dir * 0.6f, 8, 0.2f, 4.5f, QiIce, 0.4f, 9595, 1f, true);

            var end = from + dir * reach;
            var pop = Take(Art.SoftDot, end, 2.4f, 9585, QiCyan.A(0), true);
            Anim(pop.gameObject, 0.26f, k =>
            {
                pop.transform.localScale = new Vector3(1f, 0.6f, 1f) * 2.4f * Mathf.Lerp(0.6f, 1.3f, Tween.OutCubic(k));
                pop.color = QiCyan.A(0.55f * (1f - k) * (1f - k));
            }, true, fly);
        }

        /// <summary>剑身残影：叠加青光，原地一放就淡、略拉长。</summary>
        void Ghost(Vector2 pos, float w, Quaternion rot)
        {
            var g = Take(Art.Img("fx_qi_blade"), pos, w, 9586, QiCyan.A(0.32f), true);
            g.transform.localRotation = rot;
            Anim(g.gameObject, 0.15f, k =>
            {
                g.transform.localScale = new Vector3(w * (1f + 0.05f * k), w * (1f - 0.15f * k), 1f);
                g.color = QiCyan.A(0.32f * (1f - k) * (1f - k));
            });
        }

        /// <summary>剑气两侧刮过的风痕：亮头在前，随刃口一起往前冲，很快散掉。</summary>
        void WindStreak(Vector2 pos, Vector2 dir, float len)
        {
            var sr = Take(Art.Img("fx_qi_streak"), pos, 1f, 9587, QiIce.A(0), true);
            sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg);
            var start = pos;
            Anim(sr.gameObject, 0.2f, k =>
            {
                float l = len * Mathf.Lerp(0.4f, 1f, Tween.OutCubic(k));
                sr.transform.localPosition = start + dir * (Defs.LordWaveSpeed * 0.2f * k - l * 0.5f);
                sr.transform.localScale = new Vector3(l, 0.16f / 0.09375f * (1f - 0.5f * k), 1f);
                sr.color = QiIce.A(0.75f * (1f - k));
            });
        }

        /// <summary>地上被剑气犁开的一道痕：随刃口往前长，暗槽打底、青光描芯，留一会儿再淡。</summary>
        void Scar(Vector2 from, Vector2 dir, float reach)
        {
            float deg = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;
            float grow = reach / Defs.LordWaveSpeed;
            const float hold = 0.45f, fade = 0.5f;
            float dur = grow + hold + fade;
            var spr = Art.Img("fx_qi_scar");
            var groove = Take(spr, from, 1f, 91, new Color(0.06f, 0.10f, 0.20f, 0f));
            var shine = Take(spr, from, 1f, 92, QiCyan.A(0), true);
            groove.transform.localRotation = shine.transform.localRotation = Quaternion.Euler(0, 0, deg);
            float Len(float t) => Mathf.Max(0.05f, reach * Mathf.Clamp01(t / grow));
            float Fade(float t) => t < grow + hold ? 1f : 1f - (t - grow - hold) / fade;
            Anim(groove.gameObject, dur, k =>
            {
                float t = k * dur, len = Len(t);
                groove.transform.localPosition = from + dir * (len * 0.5f);
                groove.transform.localScale = new Vector3(len, 0.42f / 0.09375f, 1f);
                groove.color = new Color(0.06f, 0.10f, 0.20f, 0.32f * Fade(t));
            });
            Anim(shine.gameObject, dur, k =>
            {
                float t = k * dur, len = Len(t);
                float cool = t < grow ? 0f : Mathf.Clamp01((t - grow) / hold);
                shine.transform.localPosition = from + dir * (len * 0.5f);
                shine.transform.localScale = new Vector3(len, 0.36f / 0.09375f * Mathf.Lerp(1f, 0.45f, cool), 1f);
                shine.color = QiCyan.A(0.85f * Fade(t) * Mathf.Lerp(1f, 0.3f, cool));
            });
        }

        /// <summary>贴地半圆余波：和刃口同速扫到半圆边，告诉玩家整个黄圈里的人都挨了这一剑。</summary>
        void HalfShock(Vector2 from, float reach, float fly)
        {
            var sr = Take(Art.Img("fx_qi_ring"), from, 0.1f, 9583, QiCyan.A(0), true);
            float dur = fly + 0.12f;
            Anim(sr.gameObject, dur, k =>
            {
                float t = k * dur;
                float r = Mathf.Clamp(Defs.LordWaveSpeed * t, 0.1f, reach * 1.04f);
                float size = r / 0.48f;
                sr.transform.localPosition = from + new Vector2(0, size * 0.25f);
                sr.transform.localScale = Vector3.one * size;
                float a = 0.24f * (t < fly ? 1f : 1f - (t - fly) / 0.12f);
                sr.color = QiCyan.A(a);
            });
        }

        public void Ring(Vector2 pos, float radius, Color c, float dur = 0.4f, int order = 9400)
        {
            var sr = Take(Art.Ring, pos, 0.1f, order, c, true);
            Anim(sr.gameObject, dur, k =>
            {
                sr.transform.localScale = new Vector3(1f, 0.62f, 1f) * radius * 2f * Tween.OutCubic(k);
                sr.color = c.A(c.a * (1 - k));
            });
        }

        /// <summary>地面光晕：柔光点压扁成椭圆。</summary>
        public void Glow(Vector2 pos, float size, Color c, float dur = 0.4f, int order = 140)
        {
            var sr = Take(Art.SoftDot, pos, size, order, c);
            Anim(sr.gameObject, dur, k =>
            {
                sr.transform.localScale = new Vector3(1f, 0.6f, 1f) * size * (0.7f + 0.5f * k);
                sr.color = c.A(c.a * (1 - k));
            });
        }

        /// <summary>天雷：底端落在 pos。</summary>
        public void Strike(Vector2 pos, float height, int order = 9600)
        {
            var sr = Take(Art.Img("fx_lightning"), pos + new Vector2(0, height * 0.5f), height, order, Color.white, true);
            sr.flipX = UnityEngine.Random.value < 0.5f;
            Anim(sr.gameObject, 0.28f, k =>
            {
                float a = k < 0.15f ? 1f : Mathf.Abs(Mathf.Sin(k * 26f)) * (1 - k);
                sr.color = new Color(1, 1, 1, a);
                sr.transform.localScale = new Vector3(0.9f + 0.2f * k, 1f, 1f) * height;
            });
            var zap = Take(Art.Img("fx_zap"), pos + new Vector2(0, height * 0.12f), height * 0.5f, order + 1, Color.white, true);
            zap.flipX = UnityEngine.Random.value < 0.5f;
            Anim(zap.gameObject, 0.3f, k =>
            {
                zap.transform.localScale = new Vector3(1f, 0.75f, 1f) * height * Mathf.Lerp(0.35f, 0.6f, Tween.OutCubic(k));
                zap.color = Color.white.A(k < 0.2f ? 1f : 1f - (k - 0.2f) / 0.8f);
            });
            LightPool(pos, height * 1.1f, new Color(0.45f, 0.7f, 1f, 0.9f), 0.35f);
            Flash(pos + new Vector2(0, 0.4f), height * 0.9f, new Color(0.5f, 0.75f, 1f, 0.5f), 0.18f);
            Decal(Art.Img("fx_scorch"), pos, height * 0.32f, new Color(0.12f, 0.12f, 0.2f, 0.55f), 1.6f);
        }

        // ---------- 贴地：让特效“落”在地面上 ----------

        int _decals;

        /// <summary>地面印记（焦痕、裂缝、冰霜），压扁贴地，缓慢淡出。</summary>
        public void Decal(Sprite s, Vector2 pos, float size, Color c, float life = 2.5f, float flat = 0.5f, int order = 90, bool add = false)
        {
            if (_decals >= 40) return;
            _decals++;
            var sr = Take(s, pos, size, order, c.A(0), add);
            sr.flipX = UnityEngine.Random.value < 0.5f;
            float sx = size * UnityEngine.Random.Range(0.9f, 1.1f);
            sr.transform.localScale = new Vector3(sx, size * flat, 1f);
            Anim(sr.gameObject, life, k =>
            {
                float a = k < 0.05f ? k / 0.05f : k > 0.55f ? 1f - (k - 0.55f) / 0.45f : 1f;
                sr.color = c.A(c.a * a);
                if (k >= 1f) _decals--;
            });
        }

        /// <summary>贴地冲击波：压扁的不规则光环向外扩。</summary>
        public void GroundWave(Vector2 pos, float radius, Color c, float dur = 0.4f, int order = 94, float flat = 0.5f)
        {
            var sr = Take(Art.Img("fx_wave"), pos, 0.1f, order, c, true);
            Anim(sr.gameObject, dur, k =>
            {
                float r = radius * 2f * Mathf.Lerp(0.2f, 1f, Tween.OutCubic(k));
                sr.transform.localScale = new Vector3(r, r * flat, 1f);
                sr.color = c.A(c.a * (1 - k) * (1 - k));
            });
        }

        /// <summary>地面受光：叠加的扁圆光斑，爆炸、落雷照亮地面。</summary>
        public void LightPool(Vector2 pos, float size, Color c, float dur = 0.4f, int order = 93)
        {
            var sr = Take(Art.SoftDot, pos, size, order, c, true);
            Anim(sr.gameObject, dur, k =>
            {
                sr.transform.localScale = new Vector3(1f, 0.55f, 1f) * size * (0.8f + 0.35f * Tween.OutCubic(k));
                sr.color = c.A(c.a * (k < 0.1f ? k / 0.1f : 1f - (k - 0.1f) / 0.9f));
            });
        }

        /// <summary>局部闪光：压在人物之上，连周围的兵一起照亮一下。</summary>
        public void Flash(Vector2 pos, float size, Color c, float dur = 0.16f, int order = 9450)
        {
            var sr = Take(Art.SoftDot, pos, size, order, c, true);
            Anim(sr.gameObject, dur, k =>
            {
                sr.transform.localScale = Vector3.one * size * (0.85f + 0.3f * k);
                sr.color = c.A(c.a * (1 - k) * (1 - k));
            });
        }

        /// <summary>烟团：普通混合，边升边胀边淡，给爆炸“分量”。</summary>
        public void Smoke(Vector2 pos, int n, float size, Color c, float dur = 1.1f, float spread = 0.6f, float rise = 0.9f, int order = 9420)
        {
            var spr = Art.Img("fx_smoke");
            for (int i = 0; i < n; i++)
            {
                var off = new Vector2(UnityEngine.Random.Range(-spread, spread), UnityEngine.Random.Range(-spread, spread) * 0.4f);
                var p0 = pos + off;
                float sz = size * UnityEngine.Random.Range(0.7f, 1.15f);
                float rot = UnityEngine.Random.Range(0f, 360f);
                float spin = UnityEngine.Random.Range(-40f, 40f);
                float d = dur * UnityEngine.Random.Range(0.8f, 1.15f);
                var drift = new Vector2(off.x * 0.6f, rise * UnityEngine.Random.Range(0.7f, 1.2f));
                var sr = Take(spr, p0, sz * 0.4f, order + i, c.A(0));
                Anim(sr.gameObject, d, k =>
                {
                    float e = Tween.OutCubic(k);
                    sr.transform.localPosition = p0 + drift * e;
                    sr.transform.localScale = Vector3.one * sz * Mathf.Lerp(0.45f, 1.25f, e);
                    sr.transform.localRotation = Quaternion.Euler(0, 0, rot + spin * k);
                    float a = k < 0.12f ? k / 0.12f : 1f - (k - 0.12f) / 0.88f;
                    sr.color = c.A(c.a * a * a);
                }, true, i * 0.04f);
            }
        }

        /// <summary>贴地扬尘：横向铺开的低矮尘土。</summary>
        public void Dust(Vector2 pos, float width, Color c, float dur = 0.6f, int order = 9300)
        {
            var sr = Take(Art.Img("fx_dust"), pos, width * 0.5f, order, c);
            sr.flipX = UnityEngine.Random.value < 0.5f;
            Anim(sr.gameObject, dur, k =>
            {
                float e = Tween.OutCubic(k);
                float w = width * Mathf.Lerp(0.5f, 1.15f, e);
                sr.transform.localScale = new Vector3(w, w * 0.8f, 1f);
                sr.transform.localPosition = pos + new Vector2(0, w * 0.18f + 0.1f * e);
                sr.color = c.A(c.a * (1 - k));
            });
        }

        /// <summary>碎石：抛起、落地弹一下、停住后淡出。地面高度就是 pos.y 附近。</summary>
        public void Debris(Vector2 pos, int n, float size, float speed, float dur = 0.9f)
        {
            for (int i = 0; i < n; i++)
            {
                var spr = Art.Img("fx_rock" + UnityEngine.Random.Range(0, 6));
                float ang = UnityEngine.Random.Range(0f, Mathf.PI * 2);
                var vx = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang) * 0.45f) * speed * UnityEngine.Random.Range(0.4f, 1f);
                float vz = speed * UnityEngine.Random.Range(0.9f, 1.6f);
                float g = 14f;
                float t1 = 2f * vz / g;
                float sz = size * UnityEngine.Random.Range(0.55f, 1f);
                var ground = pos + new Vector2(0, UnityEngine.Random.Range(-0.25f, 0.15f));
                float spin = UnityEngine.Random.Range(-720f, 720f);
                var sr = Take(spr, ground, sz, 9350, Pal.Hex("8A7A68"));
                var sh = Take(Art.GroundShadow, ground, sz, 125, new Color(0, 0, 0, 0.38f));
                float d = Mathf.Max(dur, t1 * 1.5f + 0.3f);
                Anim(sr.gameObject, d, k =>
                {
                    float t = k * d;
                    float z;
                    Vector2 xy;
                    if (t < t1) { z = vz * t - g * t * t * 0.5f; xy = vx * t; }
                    else
                    {
                        float t2 = t - t1, v2 = vz * 0.3f, tb = 2f * v2 / g;
                        z = t2 < tb ? v2 * t2 - g * t2 * t2 * 0.5f : 0f;
                        xy = vx * t1 + vx * 0.3f * Mathf.Min(t2, tb);
                    }
                    var gp = ground + xy;
                    sr.transform.localPosition = gp + new Vector2(0, z + sz * 0.3f);
                    sr.transform.localRotation = Quaternion.Euler(0, 0, spin * Mathf.Min(t, t1 * 1.4f));
                    sr.sortingOrder = Order(gp.y) + 30;
                    sh.transform.localPosition = gp;
                    sh.transform.localScale = new Vector3(sz * 0.9f, sz * 0.3f, 1f) / (1f + z * 0.5f);
                    float fade = k > 0.75f ? 1f - (k - 0.75f) / 0.25f : 1f;
                    sr.color = Pal.Hex("8A7A68").A(fade);
                    sh.color = new Color(0, 0, 0, 0.3f * fade);
                    if (k >= 1f) Release(sh.gameObject);
                });
            }
        }

        /// <summary>从地面长出来的特效（冰晶、光柱）：底边钉在 pos，纵向拉起再收回。</summary>
        public void Rise(Sprite s, Vector2 pos, float size, float dur, Color c, int order, bool add = true, float hold = 0.5f)
        {
            var sr = Take(s, pos, size, order, c, add);
            sr.flipX = UnityEngine.Random.value < 0.5f;
            float aspect = s.bounds.size.y / Mathf.Max(s.bounds.size.x, s.bounds.size.y);
            Anim(sr.gameObject, dur, k =>
            {
                float up = k < 0.18f ? Tween.OutBack(k / 0.18f) : 1f;
                float fade = k > hold ? 1f - (k - hold) / (1f - hold) : 1f;
                float sy = size * up;
                sr.transform.localScale = new Vector3(size * (0.85f + 0.15f * up), sy, 1f);
                sr.transform.localPosition = pos + new Vector2(0, sy * aspect * 0.5f);
                sr.color = c.A(c.a * fade);
            });
        }

        /// <summary>落地残留物（插地的箭、斜插的飞斧）：底边钉在 pos，停留后淡出。headDown 时把图上下翻转，让刃口那头扎进地里。</summary>
        public void Linger(Sprite s, Vector2 pos, float size, float life, bool flip = false, float rot = 0f, bool headDown = false)
        {
            if (_decals >= 40) return;
            _decals++;
            float aspect = s.bounds.size.y / Mathf.Max(s.bounds.size.x, s.bounds.size.y);
            var q = Quaternion.Euler(0, 0, rot);
            var sr = Take(s, pos + (Vector2)(q * new Vector2(0, size * aspect * 0.5f)), size, Order(pos.y), Color.white);
            sr.transform.localRotation = q;
            sr.flipX = flip;
            sr.flipY = headDown;
            Anim(sr.gameObject, life, k =>
            {
                float sq = k < 0.08f ? 1f + 0.15f * Mathf.Sin(k / 0.08f * Mathf.PI) : 1f;
                sr.transform.localScale = new Vector3(size / sq, size * sq, 1f);
                sr.color = Color.white.A(k > 0.6f ? 1f - (k - 0.6f) / 0.4f : 1f);
                if (k >= 1f) _decals--;
            });
        }

        /// <summary>全屏闪白/闪色，大招、首领落地用。</summary>
        public void ScreenFlash(Color c, float dur = 0.25f)
        {
            if (_cam == null) return;
            var sr = Take(Art.White, Vector2.zero, 1f, 9900, c, true);
            sr.transform.position = new Vector3(_cam.position.x, _cam.position.y, 0f);
            sr.transform.localScale = new Vector3(40f, 60f, 1f);
            Anim(sr.gameObject, dur, k => sr.color = c.A(c.a * (1 - k) * (1 - k)));
        }

        /// <summary>折线电弧。</summary>
        public void Arc(Vector2 a, Vector2 b, Color c, float width = 0.12f, float dur = 0.2f, int order = 9550)
        {
            LineRenderer lr;
            if (_lines.Count > 0)
            {
                lr = _lines.Pop();
                lr.gameObject.SetActive(true);
            }
            else
            {
                var go = new GameObject("arc");
                go.transform.SetParent(transform, false);
                lr = go.AddComponent<LineRenderer>();
                lr.sharedMaterial = _lineMat;
                lr.useWorldSpace = true;
                lr.numCapVertices = 2;
                lr.positionCount = 8;
            }
            lr.sortingOrder = order;
            var d = b - a;
            var n = new Vector2(-d.y, d.x).normalized;
            float jag = Mathf.Min(0.35f, d.magnitude * 0.12f);
            for (int i = 0; i < 8; i++)
            {
                float t = i / 7f;
                float off = i == 0 || i == 7 ? 0 : UnityEngine.Random.Range(-jag, jag);
                lr.SetPosition(i, (Vector3)(a + d * t + n * off) + new Vector3(0, 0, -0.1f));
            }
            Anim(lr.gameObject, dur, k =>
            {
                float w = width * (1 - k * 0.6f);
                lr.startWidth = w;
                lr.endWidth = w * 0.7f;
                var cc = c.A(c.a * (1 - k));
                lr.startColor = cc;
                lr.endColor = Color.white.A(1 - k);
            });
        }

        /// <summary>从 a 飞到 b 的小图（金币、宝箱），带弧线。shrink 是飞到终点时收掉的比例，银币要留得大。</summary>
        public void Fly(Sprite s, Vector2 a, Vector2 b, float size, float dur, float arc, Action done = null, int order = 9800, float shrink = 0.3f)
        {
            var sr = Take(s, a, size, order, Color.white);
            var side = new Vector2(UnityEngine.Random.Range(-0.8f, 0.8f), arc);
            Anim(sr.gameObject, dur, k =>
            {
                float e = Tween.InCubic(k) * 0.65f + k * 0.35f;
                var p = Vector2.Lerp(a, b, e) + side * Mathf.Sin(k * Mathf.PI) * (1 - k * 0.3f);
                sr.transform.localPosition = p;
                float settle = k < 0.16f ? Tween.OutBack(k / 0.16f) : Mathf.Lerp(1f, 1f - shrink, (k - 0.16f) / 0.84f);
                sr.transform.localScale = Vector3.one * size * settle;
                if (k >= 1f) done?.Invoke();
            });
        }

        /// <summary>
        /// 对标《永远的蔚蓝星球》辅助显性祝福法球：
        /// 1) 起手凝珠（windup 秒）：在施法者胸前从 0 弹性聚拢张开、悬停自转蓄势，配合人物抬手；
        /// 2) 舒缓弧线飘飞（travelDur 秒）：带着高拱弧度与星尘拖尾，肉眼清晰地飘向目标队友头顶；
        /// 3) 接收沐浴（arrive 回调）：落入队友身体爆开环形光晕、通天光柱与增益飘字！
        /// </summary>
        public void SupportOrb(Vector2 from, Vector2 to, Color tint, float size = 0.96f, float windup = 0.34f,
            float travelDur = 0.92f, float arc = 1.45f, Action arrive = null, float delay = 0f, bool nativeGold = true)
        {
            const float trailTime = 0.38f;
            size *= 1.3f;
            var root = new GameObject("orb").transform;
            root.SetParent(transform, false);
            root.localPosition = from;
            var bodyCol = nativeGold ? Color.white : Color.Lerp(tint, Color.white, 0.35f);
            var hot = Color.Lerp(tint, Color.white, 0.55f);
            var halo = Additive(Spr(root, Art.SoftDot, Vector2.zero, size * 2.1f, 9646, tint.A(0), "halo"));
            var body = Spr(root, Art.Img("fx_orb_core"), Vector2.zero, size, 9650, bodyCol.A(0), "body");
            var swirl = Additive(Spr(root, Art.Img("fx_orb_swirl"), Vector2.zero, size * 0.72f, 9651, hot.A(0), "swirl"));
            var orbit = new SpriteRenderer[2];
            for (int i = 0; i < 2; i++) orbit[i] = Additive(Spr(root, Art.Img("fx_glint"), Vector2.zero, size * 0.34f, 9652, hot.A(0), "orbit"));

            var trail = root.gameObject.AddComponent<TrailRenderer>();
            trail.sharedMaterial = WispTrail(true);
            trail.time = trailTime;
            trail.startWidth = size * 0.62f;
            trail.endWidth = 0f;
            trail.colorGradient = Fade(tint, 0.85f);
            trail.sortingOrder = 9645;
            trail.minVertexDistance = 0.04f;
            trail.emitting = false;
            var underGo = new GameObject("trailUnder");
            underGo.transform.SetParent(root, false);
            var under = underGo.AddComponent<TrailRenderer>();
            under.sharedMaterial = WispTrail(false);
            under.time = trailTime * 0.85f;
            under.startWidth = size * 0.5f;
            under.endWidth = 0f;
            under.colorGradient = Fade(Color.Lerp(tint, new Color(0.55f, 0.2f, 0f), 0.45f), 0.7f);
            under.sortingOrder = 9643;
            under.minVertexDistance = 0.04f;
            under.emitting = false;
            if (delay > 0f) root.gameObject.SetActive(false);

            float total = windup + travelDur;
            float spinDir = to.x >= from.x ? -1f : 1f;
            var startP = from + new Vector2(0f, 0.38f);
            bool launched = false, landed = false;

            Converge(startP, tint, size, windup, delay);

            Anim(root.gameObject, total + trailTime, k =>
            {
                float t = k * (total + trailTime);
                if (landed) return;
                Vector2 pos;
                float sc, alpha;
                if (t < windup)
                {
                    float kw = t / Mathf.Max(0.001f, windup);
                    pos = from + new Vector2(0f, 0.38f * Tween.OutCubic(kw));
                    sc = size * Tween.OutBack(kw);
                    alpha = Mathf.Clamp01(kw * 2.4f);
                }
                else if (t < total)
                {
                    if (!launched)
                    {
                        launched = true;
                        trail.emitting = under.emitting = true;
                        Glint(startP, size * 1.7f, hot, 0.22f, 9655);
                    }
                    float kt = (t - windup) / Mathf.Max(0.001f, travelDur);
                    float ease = kt < 0.5f ? 2f * kt * kt : 1f - Mathf.Pow(-2f * kt + 2f, 2f) * 0.5f;
                    pos = Vector2.Lerp(startP, to, ease) + new Vector2(0f, Mathf.Sin(kt * Mathf.PI) * arc);
                    sc = size * (1f + 0.06f * Mathf.Sin(kt * Mathf.PI * 4f)) * (kt > 0.9f ? Mathf.Lerp(1f, 0.7f, (kt - 0.9f) / 0.1f) : 1f);
                    alpha = 1f;
                }
                else
                {
                    landed = true;
                    trail.emitting = under.emitting = false;
                    body.enabled = swirl.enabled = halo.enabled = false;
                    foreach (var o in orbit) o.enabled = false;
                    arrive?.Invoke();
                    return;
                }

                root.localPosition = pos;
                body.transform.localScale = Vector3.one * sc;
                body.color = bodyCol.A(alpha);
                swirl.transform.localScale = Vector3.one * sc * 0.72f;
                swirl.transform.localRotation = Quaternion.Euler(0, 0, spinDir * t * 260f);
                swirl.color = hot.A(alpha * (0.55f + 0.2f * Mathf.Sin(t * 17f)));
                halo.transform.localScale = Vector3.one * sc * (2.0f + 0.15f * Mathf.Sin(t * 11f));
                halo.color = tint.A(alpha * 0.34f);
                for (int i = 0; i < 2; i++)
                {
                    float a = t * 7.5f + i * Mathf.PI;
                    float z = Mathf.Sin(a);
                    var o = orbit[i];
                    o.transform.localPosition = new Vector2(Mathf.Cos(a) * sc * 0.62f, z * sc * 0.16f + Mathf.Cos(a) * sc * 0.1f);
                    o.transform.localScale = Vector3.one * sc * (0.26f + 0.1f * z);
                    o.sortingOrder = z < 0 ? 9653 : 9644;
                    o.color = hot.A(alpha * (z < 0 ? 1f : 0.45f));
                }
            }, true, delay);
        }

        /// <summary>起手凝珠：一圈光点从四周吸进施法者胸前，到点时正好法球起飞。</summary>
        void Converge(Vector2 at, Color c, float size, float dur, float delay)
        {
            var spr = Art.Img("fx_spark");
            var hot = Color.Lerp(c, Color.white, 0.5f);
            for (int i = 0; i < 7; i++)
            {
                float a = i / 7f * Mathf.PI * 2f + UnityEngine.Random.Range(-0.3f, 0.3f);
                var off = new Vector2(Mathf.Cos(a), Mathf.Sin(a)) * size * UnityEngine.Random.Range(0.9f, 1.3f);
                float l = size * UnityEngine.Random.Range(0.3f, 0.45f);
                var sr = Take(spr, at + off, l, 9647, hot.A(0), true);
                sr.transform.localRotation = Quaternion.Euler(0, 0, a * Mathf.Rad2Deg + 90f);
                Anim(sr.gameObject, dur, k =>
                {
                    float e = Tween.InCubic(k);
                    sr.transform.localPosition = at + off * (1f - e);
                    sr.transform.localScale = new Vector3(l * 0.5f, l * (0.6f + 0.8f * e), 1f);
                    sr.color = hot.A(Mathf.Min(1f, k * 3f) * (1f - e * 0.6f));
                }, true, delay);
            }
        }

        static Material _wispAdd, _wispAlpha;

        /// <summary>丝缕拖尾材质：几股风丝会散开断开，比一条纯色带子自然得多。</summary>
        public static Material WispTrail(bool add)
        {
            ref var m = ref add ? ref _wispAdd : ref _wispAlpha;
            if (m == null)
            {
                m = new Material(add ? AddMat.shader : Shader.Find("Sprites/Default"));
                m.mainTexture = Resources.Load<Texture2D>("Art/fx_wisp_trail");
            }
            return m;
        }

        /// <summary>头部实、尾部透明的拖尾渐变。</summary>
        public static Gradient Fade(Color c, float a)
        {
            var g = new Gradient();
            g.SetKeys(new[] { new GradientColorKey(Color.Lerp(c, Color.white, 0.3f), 0f), new GradientColorKey(c, 1f) },
                new[] { new GradientAlphaKey(a, 0f), new GradientAlphaKey(a * 0.55f, 0.4f), new GradientAlphaKey(0f, 1f) });
            return g;
        }

        /// <summary>小碎片四散：命中火花、合成星星。</summary>
        public void Sparks(Sprite s, Vector2 pos, int n, float size, float speed, Color c, float dur = 0.45f, int order = 9700, float gravity = 4f, bool add = false)
        {
            for (int i = 0; i < n; i++)
            {
                float ang = UnityEngine.Random.Range(0f, Mathf.PI * 2);
                var v = new Vector2(Mathf.Cos(ang), Mathf.Sin(ang) * 0.7f + 0.6f) * speed * UnityEngine.Random.Range(0.55f, 1f);
                float sz = size * UnityEngine.Random.Range(0.6f, 1f);
                var sr = Take(s, pos, sz, order, c, add);
                Anim(sr.gameObject, dur, k =>
                {
                    float t = k * dur;
                    sr.transform.localPosition = pos + v * t + new Vector2(0, -gravity * t * t * 0.5f);
                    sr.transform.localScale = Vector3.one * sz * (1 - k * 0.7f);
                    sr.transform.localRotation = Quaternion.Euler(0, 0, k * 240f);
                    sr.color = c.A(c.a * (1 - k * k));
                });
            }
        }

        // ---------- 漂字（大网格防撞散列：保证密集怪堆跳字颗颗分明，绝不左右紧贴或上下叠字） ----------

        readonly Dictionary<int, (float time, int seq)> _numCells = new Dictionary<int, (float, int)>();
        static readonly Vector2[] CellSpread =
        {
            new Vector2(0f, 0f),
            new Vector2(-0.82f, 0.32f),
            new Vector2(0.82f, 0.32f),
            new Vector2(0f, 0.62f),
            new Vector2(-1.18f, 0.58f),
            new Vector2(1.18f, 0.58f),
            new Vector2(-0.56f, 0.92f),
            new Vector2(0.56f, 0.92f),
        };

        /// <summary>
        /// 跳字种类。每类有自己的字体、上下渐变、描边和动作：
        /// 普攻白字小跳，暴击大号橙红渐变配爆裂底猛砸，宋江剑气冰蓝，治疗绿、银两金、掉血红，
        /// 增益带上升箭头慢慢升，状态字灰白小字，招式名毛笔字压水墨笔触。
        /// </summary>
        public enum Tx { Hit, Crit, Slash, Wall, Heal, Gain, Buff, Status, Skill }

        sealed class Tag : MonoBehaviour
        {
            public RectTransform Rt;
            public Text T;
            public CrispStroke S;
            public Image Back, Icon;
        }

        Tag TakeTag()
        {
            Tag g;
            if (_tags.Count > 0)
            {
                g = _tags.Pop();
                g.gameObject.SetActive(true);
                g.Rt.SetAsLastSibling();
            }
            else
            {
                var rt = Ui.Rect(_textLayer, "say");
                rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
                rt.sizeDelta = new Vector2(10, 10);
                g = rt.gameObject.AddComponent<Tag>();
                g.Rt = rt;
                g.Back = Ui.Box(rt, Vector2.one * 100, Vector2.zero, Color.white, Art.White, "back");
                g.Icon = Ui.Box(rt, Vector2.one * 40, Vector2.zero, Color.white, Art.UpArrow, "icon");
                g.Icon.type = Image.Type.Simple;
                g.Icon.preserveAspect = true;
                g.T = Ui.Label(rt, "", 40, Color.white, Vector2.zero, new Vector2(900, 160), TextAnchor.MiddleCenter, Fonts.Number, "t");
                g.T.horizontalOverflow = HorizontalWrapMode.Overflow;
                g.T.verticalOverflow = VerticalWrapMode.Overflow;
                g.S = g.T.gameObject.AddComponent<CrispStroke>();
            }
            _liveTexts++;
            return g;
        }

        public void Say(Vector2 world, string s, Tx kind, Color? tint = null, float scale = 1f)
        {
            if (_textLayer == null) return;
            var tc = tint ?? (kind == Tx.Skill ? Pal.Hex("FFC63A") : kind == Tx.Buff ? Pal.Hex("8CF060") : Color.white);
            Font font = Fonts.Number;
            int size = 40;
            Color top = Color.white, bot = Color.white, edge = Pal.Hex("16202E");
            float stroke = 3.2f, rise = 0.55f, dur = 0.62f;
            Sprite back = null, icon = null;
            bool spread = false;
            switch (kind)
            {
                case Tx.Hit:
                    size = 42; bot = Pal.Hex("D0DCE8"); spread = true; rise = 0.26f; dur = 0.55f;
                    break;
                case Tx.Crit:
                    size = 68; top = Pal.Hex("FFF6A0"); bot = Pal.Hex("FF5E16"); edge = Pal.Hex("4A0804");
                    stroke = 4.2f; rise = 0.38f; dur = 0.9f; back = Art.Img("ui_crit_burst"); spread = true;
                    break;
                case Tx.Slash:
                    size = 48; top = Pal.Hex("F4FFFF"); bot = Pal.Hex("44C4FF"); edge = Pal.Hex("06284E");
                    stroke = 3.6f; rise = 0.36f; dur = 0.66f; spread = true;
                    break;
                case Tx.Wall:
                    size = 46; top = Pal.Hex("FFC4B6"); bot = Pal.Hex("F0281A"); edge = Pal.Hex("3A0602");
                    stroke = 3.6f; rise = 0.45f; dur = 0.7f;
                    break;
                case Tx.Heal:
                    size = 44; top = Pal.Hex("F0FFD6"); bot = Pal.Hex("44CC38"); edge = Pal.Hex("0C3010"); rise = 0.7f; dur = 0.85f;
                    break;
                case Tx.Gain:
                    size = 44; top = Pal.Hex("FFF8C4"); bot = Pal.Hex("FFAE1A"); edge = Pal.Hex("542A00"); rise = 0.7f; dur = 0.85f;
                    break;
                case Tx.Buff:
                    font = Fonts.Heavy; size = 38; top = Color.Lerp(tc, Color.white, 0.72f); bot = tc;
                    edge = Color.Lerp(tc, Pal.Hex("080A10"), 0.84f); stroke = 3f; rise = 0.8f; dur = 1.25f; icon = Art.UpArrow;
                    break;
                case Tx.Status:
                    font = Fonts.Heavy; size = 36; bot = Color.Lerp(tc, Color.white, 0.2f); edge = Pal.Hex("15181F");
                    stroke = 2.8f; rise = 0.45f; dur = 0.7f;
                    break;
                case Tx.Skill:
                    font = Fonts.Fits(Fonts.Brush, s) ? Fonts.Brush : Fonts.Heavy; size = 60;
                    top = Color.Lerp(tc, Color.white, 0.8f); bot = tc; edge = Pal.Hex("2A1206");
                    stroke = 3.2f; rise = 0.36f; dur = 1.25f; back = Art.Img("ui_ink_strip");
                    break;
            }
            if (font == Fonts.Number && !Fonts.Fits(font, s)) font = Fonts.Heavy;
            size = Mathf.RoundToInt(size * scale);

            var g = TakeTag();
            var t = g.T;
            t.font = font;
            t.fontSize = size;
            t.text = s;
            t.color = Color.white;
            var cs = g.S;
            cs.Color = edge;
            cs.Radius = stroke * size / 42f;
            cs.KeepColor = false;
            cs.UseGradient = true;
            cs.TopColor = top;
            cs.BottomColor = bot;
            t.SetVerticesDirty();
            float w = t.preferredWidth;

            var bk = g.Back;
            var bkRt = bk.rectTransform;
            bk.enabled = back != null;
            float tilt = kind == Tx.Crit ? UnityEngine.Random.Range(-8f, 8f) : 0f;
            float backSpin = UnityEngine.Random.Range(-25f, 25f);
            if (back != null)
            {
                bk.sprite = back;
                bk.type = Image.Type.Simple;
                bk.color = Color.white;
                if (kind == Tx.Crit)
                {
                    float d = Mathf.Max(w * 1.35f, size * 2.35f);
                    bkRt.sizeDelta = new Vector2(d, d * 0.88f);
                    bkRt.anchoredPosition = new Vector2(0, -size * 0.04f);
                }
                else
                {
                    bkRt.sizeDelta = new Vector2(w * 1.3f + size * 1.3f, size * 1.7f);
                    bkRt.anchoredPosition = new Vector2(size * 0.18f, -size * 0.06f);
                }
                bkRt.localRotation = Quaternion.Euler(0, 0, kind == Tx.Crit ? backSpin : 0f);
                bkRt.localScale = Vector3.one;
            }

            var ic = g.Icon;
            ic.enabled = icon != null;
            t.rectTransform.anchoredPosition = Vector2.zero;
            if (icon != null)
            {
                ic.sprite = icon;
                ic.color = Color.white;
                float isz = size * 0.92f, gap = size * 0.08f;
                float total = isz + gap + w;
                ic.rectTransform.sizeDelta = Vector2.one * isz;
                ic.rectTransform.anchoredPosition = new Vector2(-total * 0.5f + isz * 0.5f, size * 0.04f);
                t.rectTransform.anchoredPosition = new Vector2(-total * 0.5f + isz + gap + w * 0.5f, 0);
            }

            float driftX = 0f;
            if (spread)
            {
                // 按 2.4x1.8 大号世界扇区合并计数，0.50 秒内同一团怪群的跳字摊开到不同列与阶梯
                float now = Time.time;
                int cellKey = (Mathf.RoundToInt(world.x / 2.4f) * 73856093) ^ (Mathf.RoundToInt(world.y / 1.8f) * 19349663);
                int seq = 0;
                if (_numCells.TryGetValue(cellKey, out var prev) && now - prev.time < 0.50f)
                    seq = (prev.seq + 1) % CellSpread.Length;
                _numCells[cellKey] = (now, seq);
                var sp = CellSpread[seq];
                driftX = Mathf.Clamp(world.x + sp.x, -4.6f, 4.6f) - world.x;
                world.y += sp.y;
            }

            var rt = g.Rt;
            var p0 = new Vector2((world.x + driftX) * 100f, -Ui.FromTop(world.y));
            float arcX = driftX * 26f;
            float peakY = rise * 100f;
            rt.anchoredPosition = p0;
            rt.localScale = Vector3.one;
            rt.localRotation = Quaternion.identity;
            float fadeAt = kind == Tx.Skill || kind == Tx.Buff ? 0.72f : 0.66f;

            Anim(g.gameObject, dur, k =>
            {
                float a = k < fadeAt ? 1f : 1f - (k - fadeAt) / (1f - fadeAt);
                float sc, y, x = arcX * Tween.OutCubic(k);
                switch (kind)
                {
                    case Tx.Crit:
                    {
                        // 先砸大、回弹、原地顿一下再升，爆裂底比字早一步散
                        sc = k < 0.09f ? Mathf.Lerp(2.5f, 0.88f, Tween.OutCubic(k / 0.09f))
                            : k < 0.18f ? Mathf.Lerp(0.88f, 1.1f, (k - 0.09f) / 0.09f)
                            : Mathf.Lerp(1.1f, 1f, Mathf.Clamp01((k - 0.18f) / 0.2f));
                        y = k < 0.3f ? peakY * 0.12f * Tween.OutCubic(k / 0.3f) : peakY * (0.12f + 0.88f * Tween.OutCubic((k - 0.3f) / 0.7f));
                        if (k < 0.16f) x += Mathf.Sin(k * 150f) * 5f * (1f - k / 0.16f);
                        float bs = k < 0.1f ? Mathf.Lerp(0.25f, 1.18f, Tween.OutCubic(k / 0.1f)) : Mathf.Lerp(1.18f, 1.0f, Mathf.Clamp01((k - 0.1f) / 0.3f));
                        bkRt.localScale = Vector3.one * bs;
                        bkRt.localRotation = Quaternion.Euler(0, 0, backSpin + k * 30f);
                        bk.color = Color.white.A(k < 0.42f ? 1f : Mathf.Clamp01(1f - (k - 0.42f) / 0.3f));
                        break;
                    }
                    case Tx.Skill:
                    {
                        // 墨条先横向刷开，毛笔字随后落下
                        float reveal = Tween.OutCubic(Mathf.Clamp01(k / 0.14f));
                        bkRt.localScale = new Vector3(reveal, 0.7f + 0.3f * reveal, 1f);
                        float tk = Mathf.Clamp01((k - 0.05f) / 0.12f);
                        sc = Mathf.Lerp(1.55f, 1f, Tween.OutCubic(tk));
                        t.color = Color.white.A(a * Mathf.Clamp01(tk * 2f));
                        bk.color = Color.white.A(a);
                        y = peakY * Tween.OutCubic(k);
                        x = 0f;
                        rt.anchoredPosition = p0 + new Vector2(x, y);
                        rt.localScale = Vector3.one * (k < 0.17f ? 1f : 1f + 0.04f * (k - 0.17f));
                        t.rectTransform.localScale = Vector3.one * sc;
                        return;
                    }
                    case Tx.Buff:
                        sc = k < 0.1f ? Mathf.Lerp(0.5f, 1.14f, Tween.OutCubic(k / 0.1f)) : k < 0.2f ? Mathf.Lerp(1.14f, 1f, (k - 0.1f) / 0.1f) : 1f;
                        y = peakY * Tween.OutCubic(k);
                        ic.color = Color.white.A(a);
                        break;
                    case Tx.Hit:
                        sc = k < 0.1f ? Mathf.Lerp(0.6f, 1.2f, Tween.OutCubic(k / 0.1f)) : k < 0.22f ? Mathf.Lerp(1.2f, 1f, (k - 0.1f) / 0.12f) : 1f;
                        y = peakY * (k < 0.55f ? Tween.OutCubic(k / 0.55f) : 1f - 0.12f * Tween.InCubic((k - 0.55f) / 0.45f));
                        break;
                    default:
                        sc = k < 0.12f ? Mathf.Lerp(1.7f, 0.95f, Tween.OutCubic(k / 0.12f)) : k < 0.24f ? Mathf.Lerp(0.95f, 1.05f, (k - 0.12f) / 0.12f) : 1f;
                        y = peakY * (k < 0.55f ? Tween.OutCubic(k / 0.55f) : 1f - 0.1f * Tween.InCubic((k - 0.55f) / 0.45f));
                        break;
                }
                rt.anchoredPosition = p0 + new Vector2(x, y);
                rt.localScale = Vector3.one * sc;
                rt.localRotation = Quaternion.Euler(0, 0, tilt * Mathf.Clamp01(1f - k * 1.5f) + tilt * 0.35f);
                t.color = Color.white.A(a);
            });
            t.rectTransform.localScale = Vector3.one;
            if (kind == Tx.Skill) bkRt.localScale = new Vector3(0f, 0.7f, 1f);
        }

        /// <summary>跟随世界坐标的常驻小字（精英/首领头顶血条层数），调用方每帧 Place、用完自己 Destroy。</summary>
        public Text Pinned(int size, Color c, TextAnchor align = TextAnchor.MiddleLeft)
        {
            var t = Ui.Label(_textLayer, "", size, c, Vector2.zero, new Vector2(180, 56), align, Fonts.Heavy, "pin");
            Ui.Stroke(t, Pal.Hex("121010"), 2.8f);
            var rt = t.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
            rt.pivot = align == TextAnchor.MiddleCenter ? new Vector2(0.5f, 0.5f) : new Vector2(0f, 0.5f);
            return t;
        }

        /// <summary>英雄头顶的增益角标：深色胶囊 + 上升箭头 + 层数。调用方每帧 Place、自己管显隐。</summary>
        public RectTransform Badge(Color c, out Text label)
        {
            var rt = Ui.Rect(_textLayer, "badge");
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
            rt.sizeDelta = new Vector2(118, 50);
            Ui.Box(rt, new Vector2(118, 50), Vector2.zero, new Color(0.10f, 0.06f, 0.03f, 0.8f), Art.Pill, "bg");
            var ic = Ui.Box(rt, new Vector2(38, 38), new Vector2(-33, 1), Color.white, Art.UpArrow, "ic");
            ic.type = Image.Type.Simple;
            ic.preserveAspect = true;
            label = Ui.Label(rt, "", 40, Color.white, new Vector2(16, 0), new Vector2(100, 60), TextAnchor.MiddleCenter, Fonts.Number, "n");
            label.horizontalOverflow = HorizontalWrapMode.Overflow;
            var cs = label.gameObject.AddComponent<CrispStroke>();
            cs.UseGradient = true;
            cs.TopColor = Color.Lerp(c, Color.white, 0.72f);
            cs.BottomColor = c;
            cs.Color = Pal.Hex("3A2200");
            cs.Radius = 2.4f;
            rt.SetAsFirstSibling();
            return rt;
        }

        public static void Place(RectTransform rt, Vector2 world) =>
            rt.anchoredPosition = new Vector2(world.x * 100f, -Ui.FromTop(world.y));

        public static void Place(Text t, Vector2 world) =>
            t.rectTransform.anchoredPosition = new Vector2(world.x * 100f, -Ui.FromTop(world.y));

        // ---------- 震屏 ----------

        public void Shake(float amp, float dur = 0.25f)
        {
            if (amp < _shake * (_shakeT > 0 ? 1 : 0)) return;
            _shake = amp;
            _shakeT = dur;
        }

        void UpdateShake(float dt)
        {
            if (_cam == null) return;
            if (_shakeT <= 0)
            {
                _cam.localPosition = _camBase;
                return;
            }
            _shakeT -= dt;
            float a = _shake * Mathf.Clamp01(_shakeT / 0.25f);
            _cam.localPosition = _camBase + new Vector3(UnityEngine.Random.Range(-a, a), UnityEngine.Random.Range(-a, a), 0);
        }

        public void SetCamBase(Vector3 p) => _camBase = p;
    }
}
