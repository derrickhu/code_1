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
            float sz = (crit ? 0.95f : 0.68f) * scale;
            Color glowCol = crit ? Pal.Hex("FF8A24") : Pal.Hex("FFC24A");
            var flash = Take(Art.SoftDot, pos, sz * 0.55f, 9543, glowCol.A(crit ? 0.35f : 0.22f), true);
            Anim(flash.gameObject, 0.11f, k =>
            {
                flash.transform.localScale = Vector3.one * sz * Mathf.Lerp(0.45f, 0.85f, Tween.OutCubic(k));
                flash.color = glowCol.A((crit ? 0.35f : 0.22f) * (1f - k) * (1f - k));
            });
            Glint(pos, sz * (crit ? 0.92f : 0.68f), crit ? Pal.Hex("FFF0B0") : Color.white, crit ? 0.17f : 0.13f, 9546);
            SparkStreaks(pos, crit ? 5 : 3, crit ? 0.28f : 0.22f, crit ? 4.4f : 3.6f,
                crit ? Pal.Hex("FFD45A") : Pal.Hex("FFF2C8"), 0.20f, 9548, 6f);
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
            var scroll = new Vector4(0.35f, -2.4f, -0.45f, -1.7f);
            var nScale = new Vector2(1.4f, 2.2f);
            void Beam(float w, float h, Color col, Color coreCol, int order, bool add, float dur)
            {
                var sr = Take(beamSpr, feet, h, order, Color.white, add);
                sr.sharedMaterial = UberMat(add);
                Anim(sr.gameObject, dur, k =>
                {
                    float up = Tween.OutCubic(Mathf.Min(1f, k / 0.20f));
                    float thin = k < 0.45f ? 1f : Mathf.Lerp(1f, 0.35f, (k - 0.45f) / 0.55f);
                    float hh = h * up;
                    sr.transform.localScale = new Vector3(w * thin / 0.25f, hh, 1f);
                    sr.transform.localPosition = feet + new Vector2(0, hh * 0.5f - 0.05f);
                    float a = k < 0.08f ? k / 0.08f : 1f - Tween.InCubic((k - 0.08f) / 0.92f);
                    float dis = Mathf.Pow(Mathf.Clamp01((k - 0.25f) / 0.75f), 1.2f) * 0.85f;
                    SetUber(sr, col.A(col.a * a), coreCol, dis, 0.075f, 1f, 0f, scroll, nScale, 1.8f);
                });
            }
            Beam(0.95f * scale, 3.0f * scale, deep.A(0.45f), c, 9040, false, 0.82f);
            Beam(0.95f * scale, 3.2f * scale, c.A(0.95f), Color.white, 9050, true, 0.82f);
            Beam(0.42f * scale, 2.6f * scale, Color.white.A(0.88f), Color.white, 9051, true, 0.56f);

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

        /// <summary>切换关卡/回主界面时清掉上一局挂在世界特效与 FloatLayer 上的全部残留节点。</summary>
        public void ClearAll()
        {
            _add.Clear();
            for (int i = _jobs.Count - 1; i >= 0; i--)
            {
                var go = _jobs[i].Go;
                if (go != null) Release(go);
            }
            _jobs.Clear();
            _numCells.Clear();
            _shake = _shakeT = 0f;
            if (_cam) _cam.localPosition = _camBase;
            if (_textLayer != null)
            {
                for (int i = _textLayer.childCount - 1; i >= 0; i--)
                {
                    var ch = _textLayer.GetChild(i).gameObject;
                    if (ch.TryGetComponent<Tag>(out _)) ch.SetActive(false);
                    else Destroy(ch);
                }
            }
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

        static Material _addMat, _defMat, _uberAddMat, _uberAlphaMat, _slashAddMat, _slashAlphaMat, _ropeMat;
        static Texture2D _noiseTile, _slashLut, _beamLut;
        static readonly Dictionary<string, Sprite[]> _sheets = new Dictionary<string, Sprite[]>();
        static MaterialPropertyBlock _mpb;

        public static Material ChainRopeMat
        {
            get
            {
                if (_ropeMat == null)
                {
                    _ropeMat = new Material(Shader.Find("Sprites/Default"));
                    var tex = Resources.Load<Texture2D>("Art/fx_chain_rope");
                    if (tex != null) tex.wrapMode = TextureWrapMode.Repeat;
                    _ropeMat.mainTexture = tex;
                }
                return _ropeMat;
            }
        }

        static Texture2D NoiseTile
        {
            get
            {
                if (_noiseTile == null)
                {
                    _noiseTile = Resources.Load<Texture2D>("Art/fx_noise_tile");
                    if (_noiseTile != null) _noiseTile.wrapMode = TextureWrapMode.Repeat;
                }
                return _noiseTile;
            }
        }

        public static Material UberMat(bool add)
        {
            ref Material m = ref (add ? ref _uberAddMat : ref _uberAlphaMat);
            if (m == null)
            {
                var sh = Resources.Load<Shader>("Shaders/FxUber");
                m = new Material(sh != null ? sh : Shader.Find("Sprites/Default"));
                m.SetTexture("_NoiseTex", NoiseTile);
                // Blend SrcAlpha One (add) vs SrcAlpha OneMinusSrcAlpha (alpha)
                m.SetFloat("_SrcBlend", 5f);
                m.SetFloat("_DstBlend", add ? 1f : 10f);
            }
            return m;
        }

        static Material SlashMeshMat(bool add)
        {
            ref Material m = ref (add ? ref _slashAddMat : ref _slashAlphaMat);
            if (m == null)
            {
                var sh = Resources.Load<Shader>("Shaders/FxUber");
                m = new Material(sh != null ? sh : Shader.Find("Sprites/Default"));
                if (_slashLut == null) _slashLut = Resources.Load<Texture2D>("Art/fx_slash_lut");
                m.SetTexture("_MainTex", _slashLut);
                m.SetTexture("_NoiseTex", NoiseTile);
                m.SetFloat("_SrcBlend", 5f);
                m.SetFloat("_DstBlend", add ? 1f : 10f);
            }
            return m;
        }

        public static void SetUber(Renderer r, Color outer, Color core, float dissolve, float distort = 0.08f,
            float reveal = 1f, float tail = 0f, Vector4? scroll = null, Vector2? noiseScale = null, float edgeBoost = 1.6f)
        {
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(_mpb);
            _mpb.SetColor("_Color", outer);
            _mpb.SetColor("_CoreColor", core);
            _mpb.SetFloat("_Dissolve", dissolve);
            _mpb.SetFloat("_Distort", distort);
            _mpb.SetFloat("_Reveal", reveal);
            _mpb.SetFloat("_Tail", tail);
            _mpb.SetFloat("_CorePower", 2.0f);
            _mpb.SetFloat("_EdgeBoost", edgeBoost);
            _mpb.SetVector("_Scroll", scroll ?? new Vector4(1.4f, 0.45f, -0.85f, 1.2f));
            var ns = noiseScale ?? new Vector2(1.5f, 1.5f);
            _mpb.SetVector("_NoiseScale", new Vector4(ns.x, ns.y, 0f, 0f));
            r.SetPropertyBlock(_mpb);
        }

        public static void SetUberRaw(Renderer r, Color tint, float dissolve, float distort, Vector4 scroll, Vector2 noiseScale, float edgeBoost = 1.4f)
        {
            if (_mpb == null) _mpb = new MaterialPropertyBlock();
            r.GetPropertyBlock(_mpb);
            _mpb.SetColor("_Color", tint);
            _mpb.SetFloat("_CorePower", -1.0f);
            _mpb.SetFloat("_Dissolve", dissolve);
            _mpb.SetFloat("_Distort", distort);
            _mpb.SetFloat("_Reveal", 2f);
            _mpb.SetFloat("_Tail", -1f);
            _mpb.SetFloat("_EdgeBoost", edgeBoost);
            _mpb.SetVector("_Scroll", scroll);
            _mpb.SetVector("_NoiseScale", new Vector4(noiseScale.x, noiseScale.y, 0f, 0f));
            r.SetPropertyBlock(_mpb);
        }

        /// <summary>切 4x4 序列帧图集并缓存（第 0 帧在左上，按行从上到下）。</summary>
        public static Sprite[] Sheet(string art, int cols = 4, int rows = 4, Vector2? pivot = null)
        {
            if (_sheets.TryGetValue(art, out var frames)) return frames;
            var s0 = Art.Img(art);
            var tex = s0 != null ? s0.texture : Resources.Load<Texture2D>("Art/" + art);
            if (tex == null) return Array.Empty<Sprite>();
            int cw = tex.width / cols, ch = tex.height / rows;
            float ppu = Mathf.Max(cw, ch);
            var pv = pivot ?? new Vector2(0.5f, 0.5f);
            frames = new Sprite[cols * rows];
            int idx = 0;
            for (int ry = 0; ry < rows; ry++)
                for (int cx = 0; cx < cols; cx++)
                    frames[idx++] = Sprite.Create(tex, new Rect(cx * cw, ry * ch, cw, ch), pv, ppu, 0, SpriteMeshType.FullRect);
            _sheets[art] = frames;
            return frames;
        }

        /// <summary>播放高精度体积序列帧动画（爆炸、落雷等）。</summary>
        public void Flipbook(string art, Vector2 pos, float size, float dur, int order, Color? tint = null,
            bool add = false, Vector2? pivot = null, bool flipX = false, Vector2? scaleXY = null)
        {
            var frames = Sheet(art, 4, 4, pivot);
            if (frames.Length == 0) return;
            var col = tint ?? Color.white;
            var sr = Take(frames[0], pos, size, order, col, add);
            sr.flipX = flipX;
            var xy = scaleXY ?? Vector2.one;
            sr.transform.localScale = new Vector3(size * xy.x, size * xy.y, 1f);
            dur *= Mathf.Max(0.35f, 1f);
            Anim(sr.gameObject, dur, k =>
            {
                int fi = Mathf.Clamp(Mathf.FloorToInt(k * frames.Length), 0, frames.Length - 1);
                sr.sprite = frames[fi];
                float fade = k < 0.82f ? 1f : 1f - (k - 0.82f) / 0.18f;
                sr.color = col.A(col.a * fade);
            });
        }

        /// <summary>
        /// 商业级弧形刀光网格（Arc Slash Ribbon Mesh + FxUber 流光噪波溶解）：
        /// 动态生成扇环弧面网格，下层深色半透明气刃压住浅色砂岩地面，上层叠加亮色锋刃+白芯，
        /// 刀尖沿圆弧高速刷开（_Reveal），刀尾被滚动噪波啃噬碎散（_Tail + _Dissolve）。
        /// </summary>
        public void ArcSlash(Vector2 center, float radius, float width, float startDeg, float sweepDeg,
            Color outer, Color core, float dur = 0.24f, int order = 9556, float tiltY = 0.78f)
        {
            const int segs = 28;
            var mesh = new Mesh();
            var verts = new Vector3[(segs + 1) * 2];
            var uvs = new Vector2[(segs + 1) * 2];
            var cols = new Color[(segs + 1) * 2];
            var tris = new int[segs * 6];
            float rIn = Mathf.Max(0.05f, radius - width);
            for (int i = 0; i <= segs; i++)
            {
                float u = (float)i / segs; // 0 = 刀尾, 1 = 刀尖
                float ang = (startDeg + sweepDeg * u) * Mathf.Deg2Rad;
                float cs = Mathf.Cos(ang), sn = Mathf.Sin(ang);
                // 两头收尖成柳叶弯月形，中前段最饱满
                float taper = Mathf.Sin(Mathf.Pow(u, 0.72f) * Mathf.PI);
                float curIn = Mathf.Lerp(radius * 0.94f, rIn, taper);
                float curOut = Mathf.Lerp(radius * 0.98f, radius, taper);
                verts[i * 2] = new Vector3(cs * curIn, sn * curIn * tiltY, 0f);
                verts[i * 2 + 1] = new Vector3(cs * curOut, sn * curOut * tiltY, 0f);
                uvs[i * 2] = new Vector2(u, 0f);
                uvs[i * 2 + 1] = new Vector2(u, 1f);
                cols[i * 2] = cols[i * 2 + 1] = Color.white;
                if (i < segs)
                {
                    int b = i * 2, t = i * 6;
                    tris[t] = b; tris[t + 1] = b + 1; tris[t + 2] = b + 3;
                    tris[t + 3] = b; tris[t + 4] = b + 3; tris[t + 5] = b + 2;
                }
            }
            mesh.vertices = verts;
            mesh.uv = uvs;
            mesh.colors = cols;
            mesh.triangles = tris;

            var root = new GameObject("arcSlash");
            root.transform.SetParent(transform, false);
            root.transform.localPosition = center;

            MeshRenderer MakeLayer(string nm, bool add, int ord)
            {
                var g = new GameObject(nm);
                g.transform.SetParent(root.transform, false);
                g.AddComponent<MeshFilter>().sharedMesh = mesh;
                var mr = g.AddComponent<MeshRenderer>();
                mr.sharedMaterial = SlashMeshMat(add);
                mr.sortingOrder = ord;
                return mr;
            }

            var under = MakeLayer("under", false, order - 1);
            var over = MakeLayer("over", true, order);
            var darkOuter = Color.Lerp(outer, new Color(0.03f, 0.06f, 0.14f, 1f), 0.65f);
            var scroll = new Vector4(sweepDeg >= 0 ? -2.6f : 2.6f, 0.5f, sweepDeg >= 0 ? -1.4f : 1.4f, -0.9f);
            var nScale = new Vector2(2.2f, 1.2f);

            float dScaled = dur * Mathf.Max(0.35f, 1f);
            Anim(root, dScaled, k =>
            {
                float rev = Tween.OutCubic(Mathf.Clamp01(k / 0.42f));
                float tail = Mathf.Pow(Mathf.Clamp01((k - 0.18f) / 0.82f), 1.35f) * 0.92f;
                float dis = Mathf.Pow(Mathf.Clamp01((k - 0.26f) / 0.74f), 1.25f) * 0.88f;
                float sc = Mathf.Lerp(0.90f, 1.08f, Tween.OutCubic(k));
                root.transform.localScale = Vector3.one * sc;
                SetUber(under, darkOuter.A(0.68f * (1f - k * 0.5f)), outer.A(0.85f), dis * 0.9f, 0.06f, rev, tail, scroll, nScale, 1.3f);
                SetUber(over, outer.A(0.95f), core, dis, 0.085f, rev, tail, scroll, nScale, 2.2f);
                if (k >= 1f) Destroy(mesh);
            });
        }

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
            sr.SetPropertyBlock(null);
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

        /// <summary>放大再噪波侵蚀消散的一次性彩色特效图（保留贴图自身丰富红橙黑烟色彩，边缘噪波碎散，绝不刷白！）。</summary>
        public void DissolveBurst(Sprite s, Vector2 pos, float size, float dur, int order, Color? tint = null,
            bool add = false, float from = 0.50f, float spin = 0f, float distort = 0.04f)
        {
            dur *= Mathf.Max(0.35f, 1f);
            var col = tint ?? Color.white;
            var sr = Take(s, pos, size * from, order, col, add);
            sr.sharedMaterial = UberMat(add);
            float rot0 = UnityEngine.Random.Range(0f, 360f);
            var scroll = new Vector4(1.0f, 0.6f, -0.7f, 0.8f);
            var nScale = new Vector2(1.6f, 1.6f);
            Anim(sr.gameObject, dur, k =>
            {
                float sc = Mathf.Lerp(from, 1.04f, Tween.OutCubic(Mathf.Min(1f, k * 2.1f)));
                sr.transform.localScale = Vector3.one * size * sc;
                sr.transform.localRotation = Quaternion.Euler(0, 0, rot0 + spin * k);
                float dis = Mathf.Pow(Mathf.Clamp01((k - 0.22f) / 0.78f), 1.25f) * 0.90f;
                float a = k < 0.55f ? 1f : 1f - (k - 0.55f) / 0.45f;
                // _Color = _CoreColor = Clear marker? No: pass negative _CorePower (-1) to tell FxUber to preserve mainSample.rgb!
                SetUberRaw(sr, col.A(col.a * a), dis, distort, scroll, nScale);
            });
        }

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
        public void Swing(Vector2 pos, float size, float fromDeg, float toDeg, Color c, float dur = 0.24f, bool flip = false, int order = 9515)
        {
            dur *= Mathf.Max(0.35f, 1f);
            var spr = Art.Img("fx_swing");
            var tip = Color.Lerp(Color.white, c, 0.35f);
            var glow = Take(spr, pos, size, order - 1, c.A(0), true);
            var core = Take(spr, pos, size, order, tip.A(0), true);
            glow.flipX = core.flipX = flip;
            void Step(SpriteRenderer sr, float k, Color col, float a, float sc)
            {
                float sweep = Tween.OutCubic(Mathf.Min(1f, k * 1.5f));
                sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Lerp(fromDeg, toDeg, sweep));
                sr.transform.localScale = Vector3.one * size * sc * Mathf.Lerp(0.75f, 1.05f, sweep);
                float alpha = k < 0.14f ? k / 0.14f : 1f - Mathf.Pow((k - 0.14f) / 0.86f, 1.4f);
                sr.color = col.A(a * alpha);
            }
            Anim(glow.gameObject, dur, k => Step(glow, k, c, 0.5f, 1.1f));
            Anim(core.gameObject, dur, k => Step(core, k, tip, 0.7f, 0.92f));
        }

        /// <summary>斩痕：一道细亮线从中间往两头瞬间拉开横过敌人身上，白芯外裹兵器色，随后变细消失。</summary>
        public void CutLine(Vector2 pos, float deg, float len, Color c, float dur = 0.24f, float thick = 0.09f, int order = 9530)
        {
            dur *= Mathf.Max(0.35f, 1f);
            var glow = Take(Art.Beam, pos, 1f, order - 1, c.A(0), true);
            var core = Take(Art.Beam, pos, 1f, order, Color.white.A(0), true);
            var rot = Quaternion.Euler(0, 0, deg);
            glow.transform.localRotation = core.transform.localRotation = rot;
            void Step(SpriteRenderer sr, float k, Color col, float w)
            {
                float open = Tween.OutCubic(Mathf.Min(1f, k * 3.2f));
                float thin = 1f - Tween.InCubic(k);
                sr.transform.localScale = new Vector3(len * Mathf.Lerp(0.2f, 1f, open), w * thin, 1f);
                sr.color = col.A(col.a * (k < 0.6f ? 1f : (1f - k) / 0.4f));
            }
            Anim(glow.gameObject, dur, k => Step(glow, k, c.A(0.8f), thick * 6f));
            Anim(core.gameObject, dur, k => Step(core, k, Color.white, thick * 2.2f));
        }

        /// <summary>两点之间的光束：从 a 一头亮起扫到 b，再从 a 那头收掉，像枪芒捅穿过去。</summary>
        public void Streak(Vector2 a, Vector2 b, Color c, float width, float dur = 0.22f, int order = 9520)
        {
            dur *= Mathf.Max(0.35f, 1f);
            var d = b - a;
            float len = d.magnitude;
            if (len < 0.01f) return;
            var dir = d / len;
            var sr = Take(Art.Beam, a, 1f, order, c.A(0), true);
            sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
            Anim(sr.gameObject, dur, k =>
            {
                float head = Tween.OutCubic(Mathf.Min(1f, k * 2.0f)) * len;
                float tail = Tween.InCubic(k) * len;
                float span = Mathf.Max(0.02f, head - tail);
                sr.transform.localPosition = a + dir * (tail + span * 0.5f);
                sr.transform.localScale = new Vector3(span, width * (1f - k * 0.6f), 1f);
                sr.color = c.A(c.a);
            });
        }

        /// <summary>
        /// 商业级长枪贯阵流场枪罡（fx_spear_thrust_lut + FxUber 双层刷光与噪波碎散）：
        /// 下层深色压住浅砂石面，上层高亮螺旋盘龙气带从枪尾疾刷向枪尖，再化作寒星/金焰消散。
        /// </summary>
        public void SpearThrust(Vector2 a, Vector2 b, Color outer, Color core, float width = 0.72f, float dur = 0.30f, int order = 9524)
        {
            dur *= Mathf.Max(0.35f, 1f);
            var d = b - a;
            float len = d.magnitude;
            if (len < 0.05f) return;
            var mid = (a + b) * 0.5f;
            var rot = Quaternion.Euler(0, 0, Mathf.Atan2(d.y, d.x) * Mathf.Rad2Deg);
            var spr = Art.Img("fx_spear_thrust_lut");
            var deep = Color.Lerp(outer, new Color(0.03f, 0.06f, 0.14f, 1f), 0.62f);
            var scroll = new Vector4(-3.2f, 0.35f, -2.0f, -0.45f);
            var nScale = new Vector2(Mathf.Max(1.4f, len * 0.65f), 1.35f);
            // fx_spear_thrust_lut 高宽比 192/512 = 0.375
            float sy = width / 0.375f;

            void Pass(Color col, Color hi, int ord, bool add, float wMul, float boost)
            {
                var sr = Take(spr, mid, 1f, ord, Color.white, add);
                sr.sharedMaterial = UberMat(add);
                sr.transform.localRotation = rot;
                Anim(sr.gameObject, dur, k =>
                {
                    float rev = Tween.OutCubic(Mathf.Clamp01(k / 0.38f));
                    float tail = Mathf.Pow(Mathf.Clamp01((k - 0.16f) / 0.84f), 1.25f) * 0.90f;
                    float dis = Mathf.Pow(Mathf.Clamp01((k - 0.24f) / 0.76f), 1.2f) * 0.88f;
                    float thin = Mathf.Lerp(1.06f, 0.68f, Tween.InCubic(k));
                    sr.transform.localScale = new Vector3(len, sy * wMul * thin, 1f);
                    SetUber(sr, col.A(col.a * (1f - k * 0.35f)), hi, dis, 0.065f, rev, tail, scroll, nScale, boost);
                });
            }
            Pass(deep.A(0.68f), outer, order - 1, false, 1.08f, 1.35f);
            Pass(outer.A(0.96f), core, order, true, 0.94f, 2.25f);
        }

        /// <summary>魏定国猛火油海 / 秦明熔岩火潭：贴地铺开 FxUber 动态翻腾燃烧火池，边缘噪波侵蚀收干。</summary>
        public void FirePool(Vector2 pos, float radius, Color outer, Color core, float dur = 2.1f, int order = 93)
        {
            if (_decals >= 36) return;
            _decals += 2;
            var spr = Art.Img("fx_fire_pool_lut");
            var soot = new Color(0.16f, 0.05f, 0.03f, 0.72f);
            var scroll = new Vector4(0.75f, -1.45f, -0.95f, -1.05f);
            var nScale = new Vector2(1.8f, 1.8f);
            float d = radius * 2.15f;
            const float flat = 0.52f;

            var under = Take(spr, pos, 1f, order, Color.white, false);
            under.sharedMaterial = UberMat(false);
            var over = Take(spr, pos, 1f, order + 1, Color.white, true);
            over.sharedMaterial = UberMat(true);
            float rot0 = UnityEngine.Random.Range(0f, 360f);
            under.transform.localRotation = over.transform.localRotation = Quaternion.Euler(0, 0, rot0);

            Anim(under.gameObject, dur, k =>
            {
                float open = Tween.OutCubic(Mathf.Clamp01(k * dur / 0.22f));
                float sc = d * Mathf.Lerp(0.45f, 1.02f, open);
                under.transform.localScale = new Vector3(sc * 1.06f, sc * flat * 1.06f, 1f);
                float dis = Mathf.Pow(Mathf.Clamp01((k - 0.45f) / 0.55f), 1.3f) * 0.92f;
                SetUber(under, soot.A(soot.a * (1f - k * 0.4f)), outer.A(0.85f), dis * 0.9f, 0.08f, 1f, 0f, scroll, nScale, 1.4f);
                if (k >= 1f) _decals--;
            });
            Anim(over.gameObject, dur, k =>
            {
                float open = Tween.OutCubic(Mathf.Clamp01(k * dur / 0.20f));
                float pulse = 0.96f + 0.05f * Mathf.Sin(k * dur * 18f);
                float sc = d * Mathf.Lerp(0.42f, 1f, open) * pulse;
                over.transform.localScale = new Vector3(sc, sc * flat, 1f);
                float dis = Mathf.Pow(Mathf.Clamp01((k - 0.38f) / 0.62f), 1.25f) * 0.94f;
                SetUber(over, outer.A(0.92f), core, dis, 0.10f, 1f, 0f, scroll, nScale, 2.35f);
                if (k >= 1f) _decals--;
            });
        }

        /// <summary>传说樊瑞立体螺旋龙卷风柱（对标《蔚蓝星球》暴风）：双层 FxUber 螺旋卷动风柱 + 环绕风流，速度沉稳清晰。</summary>
        public void Tornado(Vector2 pos, float radius, Color outer, Color core, float dur = 0.62f)
        {
            float vp = Mathf.Max(0.35f, 1f);
            float dScaled = dur * vp;
            var spr = Art.Img("fx_tornado_lut");
            var deep = Color.Lerp(outer, new Color(0.04f, 0.14f, 0.16f, 1f), 0.58f);
            var scroll = new Vector4(2.1f / vp, -0.85f / vp, -1.5f / vp, -0.65f / vp);
            var nScale = new Vector2(1.6f, 1.5f);
            float h = Mathf.Clamp(radius * 1.65f, 1.55f, 2.45f);
            float w = h * 0.92f;
            int ord = Order(pos.y) + 25;

            void Funnel(Color col, Color hi, int o, bool add, float wMul, float boost)
            {
                var sr = Take(spr, pos, 1f, o, Color.white, add);
                sr.sharedMaterial = UberMat(add);
                Anim(sr.gameObject, dScaled, k =>
                {
                    float pop = k < 0.22f ? Tween.OutCubic(k / 0.22f) : 1f;
                    float sway = Mathf.Sin(Time.time * 10f) * 0.05f;
                    float hh = h * Mathf.Lerp(0.65f, 1.04f, pop);
                    // fx_tornado_lut 宽 320 / 高 448 = 0.714
                    sr.transform.localScale = new Vector3((w * wMul / 0.714f) * Mathf.Lerp(0.75f, 1.05f, pop), hh, 1f);
                    sr.transform.localPosition = pos + new Vector2(sway, hh * 0.46f - 0.06f);
                    float dis = Mathf.Pow(Mathf.Clamp01((k - 0.45f) / 0.55f), 1.25f) * 0.88f;
                    float fade = k < 0.14f ? k / 0.14f : 1f - Mathf.Pow(Mathf.Clamp01((k - 0.58f) / 0.42f), 1.4f);
                    SetUber(sr, col.A(col.a * fade), hi, dis, 0.09f, 1f, 0f, scroll, nScale, boost);
                });
            }
            Funnel(deep.A(0.62f), outer, ord - 1, false, 1.08f, 1.35f);
            Funnel(outer.A(0.92f), core, ord, true, 0.96f, 2.15f);

            float dir = UnityEngine.Random.value < 0.5f ? 1f : -1f;
            float startAng = UnityEngine.Random.Range(0f, 360f);
            ArcSlash(pos + new Vector2(0f, h * 0.36f), radius * 0.72f, radius * 0.20f,
                startAng, dir * 195f, outer, core, dur * 0.72f, 9545, 0.46f);
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
        /// 寨主剑气（1:1 像素级对标《永远的蔚蓝星球》动态圆拱三叉皇冠水幕剑气）：
        /// 1) 顶冠：象牙白渐变浅柠香槟金三叉皇冠浪冠 + 正中镂空天青菱形纹章（◇），首帧同步初始化零跳变，1倍速沉稳顺滑推进；
        /// 2) 剑身：天蔚蓝咬合口 -> 清透亮青绿松石 -> 孔雀深海青蓝宽幅水瀑笔触（纵向层流滚动，零果冻扭曲，中腹微透石砖）；
        /// 3) 4帧逐帧倾泻拉丝流带 + 暖杏香槟破空肩纱 + 底部紫晶横裂隙；
        /// 4) 层级压在 9480..9494，让 9620+ 的敌军受击绯红弯月斩痕与横向白炽镜头十字闪清脆绽放在剑气正上方！
        /// </summary>
        public void SwordWave(Vector2 from, Vector2 to)
        {
            var d = to - from;
            var dir = d.sqrMagnitude < 1e-4f ? Vector2.up : d.normalized;
            var side = new Vector2(dir.y, -dir.x);
            float speed = Defs.LordWaveSpeed;
            float reach = Layout.HalfW;
            float fly = Layout.LordFlightTime;
            const float tail = 0.48f, domeW = 3.82f, domeH = 4.65f;
            float dur = fly + tail;
            float deg = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;
            var rot = Quaternion.Euler(0, 0, deg - 90f);

            var crestFrames = Sheet("fx_qi_crest_sheet", 4, 1);
            var crestSpr0 = crestFrames.Length > 0 ? crestFrames[0] : Art.Img("fx_qi_edge");
            var streakFrames = Sheet("fx_qi_dome_streaks", 4, 1);
            var streakSpr0 = streakFrames.Length > 0 ? streakFrames[0] : Art.Img("fx_qi_dome_streaks");

            var underGlow = Take(Art.Img("fx_qi_glow"), from, 1f, 9480, QiCyan.A(0), true);
            var sonic = Take(Art.Img("fx_qi_dome_sonic"), from, 1f, 9484, Color.white.A(0));
            // 注意：FxUber 片元输出 alpha = mask * alive * _Color.a * i.color.a，顶点色 sr.color 必须保持 Color.white(alpha=1)，透明度统一由 SetUberRaw 的 _Color.a 控制！
            var body = Take(Art.Img("fx_qi_dome_body"), from, 1f, 9486, Color.white);
            body.sharedMaterial = UberMat(false);
            var streaks = Take(streakSpr0, from, 1f, 9488, Color.white);
            streaks.sharedMaterial = UberMat(true);
            var crest = Take(crestSpr0, from, 1f, 9490, Color.white.A(0));
            var crestGlow = Take(crestSpr0, from, 1f, 9491, Color.white.A(0), true);

            sonic.transform.localRotation = body.transform.localRotation = streaks.transform.localRotation = rot;
            crest.transform.localRotation = crestGlow.transform.localRotation = underGlow.transform.localRotation = rot;

            float lastGlint = 0.04f, lastGhost = 0.06f;
            int winds = 0;

            float Scale(float t) =>
                Mathf.Lerp(0.78f, 1f, Tween.OutCubic(Mathf.Clamp01(t / 0.16f)))
                * Mathf.Lerp(1f, 1.08f, Mathf.Clamp01(t / fly))
                * (t > fly ? 1f + 0.08f * Tween.OutCubic((t - fly) / tail) : 1f);

            // 前缘无跳变顺滑起手，fly 阶段匀速推进与 StepLordSlash 波前严格对齐，越阵后保持约 70% 惯性继续前掠并丝滑消散
            float Lead(float t)
            {
                if (t <= fly) return 0.16f + speed * t;
                float tk = Mathf.Clamp01((t - fly) / tail);
                return 0.16f + reach + speed * 0.72f * tail * (tk * (2f - tk) * 0.65f + tk * 0.35f);
            }

            void StepWave(float k, bool allowSpawn)
            {
                float t = k * dur;
                float s = Scale(t);
                float w = domeW * s;
                float h = domeH * s * Mathf.Lerp(0.84f, 1f, Tween.OutCubic(Mathf.Clamp01(t / 0.16f)));
                var lead = from + dir * Lead(t);
                // 贴图中圆拱冠顶点位于 y_top=0.105（精灵中心往上 +0.395 * h），将中心反推使冠顶严格落在 lead 上
                var c = lead - dir * (0.395f * h);

                float fadeIn = Tween.OutCubic(Mathf.Clamp01(t / 0.08f));
                float tailK = t > fly ? Mathf.Clamp01((t - fly) / tail) : 0f;
                float fadeOut = tailK < 0.22f ? 1f : 1f - Tween.InCubic((tailK - 0.22f) / 0.78f);
                float a = fadeIn * fadeOut;
                float dissolve = tailK < 0.18f ? 0f : Mathf.SmoothStep(0f, 0.76f, (tailK - 0.18f) / 0.82f);

                // 1) 主体圆拱水瀑幕（保持 body.color = Color.white 以防顶点 alpha 归零导致整层隐身！）
                body.color = Color.white;
                body.transform.localPosition = c;
                body.transform.localScale = new Vector3(w, h, 1f);
                SetUberRaw(body, Color.white.A(a * 0.96f), dissolve, 0.008f,
                    new Vector4(0.02f, 2.8f, -0.03f, 4.2f), new Vector2(4.6f, 0.72f), 1.45f);

                // 2) 20FPS 四帧逐帧倾泻拉丝流带 + 纵向层流高光冲刷（同样保持 streaks.color = Color.white）
                streaks.color = Color.white;
                if (streakFrames.Length > 0)
                    streaks.sprite = streakFrames[(int)(t * 20f) % streakFrames.Length];
                streaks.transform.localPosition = c;
                streaks.transform.localScale = new Vector3(w * 0.99f, h, 1f);
                SetUberRaw(streaks, Color.white.A(a * 0.65f), dissolve * 1.08f, 0.010f,
                    new Vector4(-0.03f, 4.5f, 0.04f, 6.6f), new Vector2(5.2f, 0.65f), 1.75f);

                // 3) 轻盈暖杏香槟破空气浪肩纱
                float sonicBreath = 1.02f + 0.016f * Mathf.Sin(t * 36f);
                sonic.transform.localPosition = c;
                sonic.transform.localScale = new Vector3(w * sonicBreath, h * 1.01f, 1f);
                sonic.color = Color.white.A(a * 0.92f);

                // 4) 18FPS 四帧象牙白+浅柠香槟皇冠浪冠 + 正中镂空天青菱形纹章
                if (crestFrames.Length > 0)
                {
                    var cf = crestFrames[(int)(t * 18f) % crestFrames.Length];
                    crest.sprite = cf;
                    crestGlow.sprite = cf;
                }
                float crestBreath = 1f + 0.014f * Mathf.Sin(t * 42f);
                crest.transform.localPosition = c;
                crest.transform.localScale = new Vector3(w * crestBreath, h, 1f);
                crest.color = Color.white.A(a * 0.99f);

                crestGlow.transform.localPosition = c + dir * (0.005f * h);
                crestGlow.transform.localScale = new Vector3(w * crestBreath * 1.02f, h * 1.015f, 1f);
                crestGlow.color = Pal.Hex("FFF9D2").A(a * (0.20f + 0.06f * Mathf.Sin(t * 48f)));

                underGlow.transform.localPosition = c + dir * (0.05f * h);
                underGlow.transform.localScale = new Vector3(w * 1.12f, h * 0.90f, 1f);
                underGlow.color = QiCyan.A(a * 0.18f);

                if (!allowSpawn) return;

                // 5) 水幕尾摆内的纤细竖向电青针芒星（✦）+ 柔和冠弧余影
                if (t - lastGlint >= 0.075f && tailK < 0.58f && t > 0.10f)
                {
                    lastGlint = t;
                    float sideBias = UnityEngine.Random.value < 0.68f ? -1f : 1f;
                    float lat = (sideBias * UnityEngine.Random.Range(0.16f, 0.30f) + UnityEngine.Random.Range(-0.04f, 0.04f)) * w;
                    float back = UnityEngine.Random.Range(0.08f, 0.36f) * h;
                    WakeStarGlint(c - dir * back + side * lat, dir, UnityEngine.Random.Range(0.46f, 0.78f) * s);
                }
                if (t - lastGhost >= 0.08f && t < fly)
                {
                    lastGhost = t;
                    Ghost(c, w, h, rot, crest.sprite);
                }
                if (winds < 7 && t >= (winds + 1) * fly / 8f)
                {
                    winds++;
                    float off = UnityEngine.Random.Range(-0.35f, 0.35f) * w;
                    WindStreak(lead - dir * 0.32f + side * off, dir, UnityEngine.Random.Range(1.0f, 1.7f));
                }
            }

            // 创建当帧立刻完成第 0 帧坐标、缩放与 FxUber 属性块写入，彻底根除首帧位置/缩放跳闪！
            StepWave(0f, false);

            Anim(body.gameObject, dur, k => StepWave(k, true));
            Anim(streaks.gameObject, dur, _ => { });
            Anim(sonic.gameObject, dur, _ => { });
            Anim(crest.gameObject, dur, _ => { });
            Anim(crestGlow.gameObject, dur, _ => { });
            Anim(underGlow.gameObject, dur, _ => { });

            // 干净起手柔光与贴地气浪（彻底移除旧版全屏白半圆环 HalfShock 与直线蓝杆 Scar 杂乱干扰！）
            Flash(from + dir * 0.35f, 2.2f, QiCyan.A(0.42f), 0.24f, 9478);
            LightPool(from + dir * 0.45f, 3.2f, QiCyan.A(0.42f), 0.45f, 94);
            GroundWave(from, 1.5f, Pal.Hex("F5F2B8"), 0.38f, 95, 0.45f);
        }

        /// <summary>顶冠残影：沿推进轨迹留下一掠即逝的青金冠弧。</summary>
        void Ghost(Vector2 pos, float w, float h, Quaternion rot, Sprite spr)
        {
            var g = Take(spr, pos, 1f, 9482, QiCyan.A(0.26f), true);
            g.transform.localRotation = rot;
            g.transform.localScale = new Vector3(w, h, 1f);
            Anim(g.gameObject, 0.18f, k =>
            {
                g.transform.localScale = new Vector3(w * (1f + 0.03f * k), h * (1f - 0.08f * k), 1f);
                g.color = QiCyan.A(0.26f * (1f - k) * (1f - k));
            });
        }

        /// <summary>剑气尾流中的竖向修长针芒四芒星（✦），闪烁拉伸后消散。</summary>
        void WakeStarGlint(Vector2 pos, Vector2 dir, float size)
        {
            var sr = Take(Art.Img("fx_qi_flare_v"), pos, 1f, 9494, Color.white.A(0), true);
            sr.transform.localRotation = Quaternion.Euler(0, 0, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg - 90f);
            sr.transform.localScale = Vector3.zero;
            var start = pos;
            Anim(sr.gameObject, 0.32f, k =>
            {
                float pop = k < 0.26f ? Tween.OutCubic(k / 0.26f) : 1f - (k - 0.26f) / 0.74f;
                sr.transform.localPosition = start + dir * (Defs.LordWaveSpeed * 0.22f * k);
                sr.transform.localScale = new Vector3(size * 0.62f * pop, size * 1.38f * (0.65f + 0.45f * pop), 1f);
                sr.color = Color.Lerp(Color.white, Pal.Hex("5CD8FF"), k * 0.65f).A(0.95f * pop);
            });
        }

        /// <summary>剑气命中敌军时的横向白炽镜头十字闪（层级 9632 置于剑气正上方，绝不被剑气遮挡！）。</summary>
        public void SlashHitFlare(Vector2 pos, bool crit)
        {
            var sr = Take(Art.Img("fx_qi_flare_v"), pos, 1f, 9632, Color.white, true);
            sr.transform.localRotation = Quaternion.Euler(0, 0, 90f);
            float w = crit ? 2.45f : 1.92f;
            float h = crit ? 1.32f : 1.04f;
            sr.transform.localScale = new Vector3(h * 0.65f, w * 0.75f, 1f);
            Anim(sr.gameObject, 0.28f, k =>
            {
                float pop = k < 0.20f ? Tween.OutCubic(k / 0.20f) : 1f;
                float fade = k < 0.30f ? 1f : 1f - Tween.InCubic((k - 0.30f) / 0.70f);
                sr.transform.localScale = new Vector3(h * (0.68f + 0.42f * pop) * Mathf.Lerp(1f, 0.45f, k), w * (0.78f + 0.42f * k), 1f);
                sr.color = Color.white.A(0.99f * fade);
            });
        }

        /// <summary>剑气命中敌军时的绯红弯月破甲斩痕（层级 9626 置于剑气正上方，凌厉挥砍可见！）。</summary>
        public void CrimsonCrescent(Vector2 pos, Vector2 flyDir, bool crit)
        {
            float baseDeg = Mathf.Atan2(flyDir.y, flyDir.x) * Mathf.Rad2Deg - 90f + UnityEngine.Random.Range(-26f, 26f);
            var sr = Take(Art.Img("fx_qi_slash_red"), pos - flyDir * 0.05f, 1f, 9626, Color.white);
            float sz = crit ? 1.72f : 1.38f;
            float flip = UnityEngine.Random.value < 0.5f ? -1f : 1f;
            sr.transform.localRotation = Quaternion.Euler(0, 0, baseDeg);
            sr.transform.localScale = new Vector3(sz * flip * 0.82f, sz * 0.85f, 1f);
            Anim(sr.gameObject, 0.30f, k =>
            {
                float sweep = Tween.OutCubic(k);
                float fade = k < 0.48f ? 1f : 1f - Tween.InCubic((k - 0.48f) / 0.52f);
                sr.transform.localPosition = pos + flyDir * (0.22f * sweep);
                sr.transform.localRotation = Quaternion.Euler(0, 0, baseDeg + flip * 22f * sweep);
                sr.transform.localScale = new Vector3(sz * flip * (0.82f + 0.32f * sweep), sz * (0.85f + 0.25f * sweep), 1f);
                sr.color = Color.white.A(0.98f * fade);
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

        /// <summary>天雷：16帧狂暴分叉雷霆图集（fx_sheet_lightning）配地面电弧球与焦痕，底端锚在 pos。</summary>
        public void Strike(Vector2 pos, float height, int order = 9600, bool legendary = false)
        {
            float vp = Mathf.Max(0.35f, 1f);
            float h = Mathf.Clamp(height, 1.35f, 2.55f);
            bool flip = UnityEngine.Random.value < 0.5f;
            var sheet = Sheet("fx_sheet_lightning", 4, 4, new Vector2(0.5f, 0.12f));
            if (sheet.Length > 0)
            {
                Color boltTint = legendary ? Pal.Hex("DCE6FF") : Color.white;
                Flipbook("fx_sheet_lightning", pos, h * 1.12f, 0.40f, order, boltTint, true, new Vector2(0.5f, 0.12f), flip);
            }
            else
            {
                var sr = Take(Art.Img("fx_lightning"), pos + new Vector2(0, h * 0.48f), h, order, Color.white, true);
                sr.flipX = flip;
                Anim(sr.gameObject, 0.36f * vp, k =>
                {
                    float a = k < 0.22f ? 1f : (0.55f + 0.45f * Mathf.Abs(Mathf.Sin(k * 20f))) * (1f - k);
                    sr.color = new Color(1f, 1f, 1f, a);
                    sr.transform.localScale = new Vector3(0.58f + 0.10f * k, 1f, 1f) * h;
                });
            }
            var zap = Take(Art.Img("fx_zap"), pos + new Vector2(0, h * 0.10f), h * 0.44f, order + 1, legendary ? Pal.Hex("FFE698") : Color.white, true);
            zap.flipX = !flip;
            Anim(zap.gameObject, 0.36f * vp, k =>
            {
                zap.transform.localScale = new Vector3(0.88f, 0.68f, 1f) * h * Mathf.Lerp(0.28f, 0.52f, Tween.OutCubic(k));
                zap.color = zap.color.A(k < 0.24f ? 1f : 1f - (k - 0.24f) / 0.76f);
            });
            if (legendary)
                Rune(pos, Art.Img("fx_sigil"), h * 0.78f, Pal.Hex("FFD86B").A(0.85f), 0.46f * vp, 110f, 95, 0.48f, true);
            LightPool(pos, h * 0.92f, legendary ? new Color(0.55f, 0.68f, 1f, 0.88f) : new Color(0.45f, 0.75f, 1f, 0.82f), 0.40f * vp);
            Flash(pos + new Vector2(0, 0.32f), h * 0.68f, new Color(0.62f, 0.82f, 1f, 0.48f), 0.18f * vp);
            Decal(Art.Img("fx_scorch"), pos, h * 0.32f, new Color(0.10f, 0.12f, 0.20f, 0.48f), 1.4f);
        }

        /// <summary>传说雷链双层折线电弧：外层紫蓝电晕 + 内芯炽白金跳电 + 首尾爆星。</summary>
        public void ThunderChain(Vector2 a, Vector2 b, Color outer, Color core, float width = 0.22f, float dur = 0.30f, int order = 9555)
        {
            float vp = Mathf.Max(0.35f, 1f);
            Arc(a, b, outer, width, dur * vp, order);
            Arc(a, b, core, width * 0.46f, dur * 0.88f * vp, order + 1);
            Glint(b, 0.85f, core, 0.18f * vp, order + 2);
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

        /// <summary>贴地冲击波：压扁的不规则光环向外扩 + FxUber 噪波侵蚀消散。</summary>
        public void GroundWave(Vector2 pos, float radius, Color c, float dur = 0.4f, int order = 94, float flat = 0.5f)
        {
            var sr = Take(Art.Img("fx_wave"), pos, 0.1f, order, Color.white, true);
            sr.sharedMaterial = UberMat(true);
            var scroll = new Vector4(0.9f, 0.9f, -0.7f, 0.8f);
            var nScale = new Vector2(1.8f, 1.8f);
            Anim(sr.gameObject, dur, k =>
            {
                float r = radius * 2f * Mathf.Lerp(0.22f, 1.06f, Tween.OutCubic(k));
                sr.transform.localScale = new Vector3(r, r * flat, 1f);
                float dis = Mathf.Pow(k, 1.15f) * 0.92f;
                SetUber(sr, c.A(c.a * (1f - k * 0.65f)), Color.white, dis, 0.06f, 1f, 0f, scroll, nScale, 1.7f);
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
                var spr = Art.Img("fx_rock" + UnityEngine.Random.Range(1, 6));
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

        /// <summary>好汉头顶精致小增益Buff条：斜切鎏金立体胶囊底 + 双翼疾风金徽 + 层数渐变字。切关由 ClearAll 统一清场。</summary>

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
            return rt;
        }

        public RectTransform BuffBar(out Text label)
        {
            var rt = Ui.Rect(_textLayer, "buffBar");
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
            rt.sizeDelta = new Vector2(96, 36);
            var bg = Ui.Box(rt, new Vector2(96, 36), Vector2.zero, Color.white, Art.Img("ui_buff_pill"), "bg");
            bg.type = Image.Type.Simple;
            bg.preserveAspect = true;
            var ic = Ui.Box(rt, new Vector2(25, 25), new Vector2(-21, 1.5f), Color.white, Art.Img("ui_buff_wing"), "wing");
            ic.type = Image.Type.Simple;
            ic.preserveAspect = true;
            label = Ui.Label(rt, "", 24, Color.white, new Vector2(13, 1.5f), new Vector2(68, 36), TextAnchor.MiddleCenter, Fonts.Number, "n");
            label.fontSize = 24; // 不走小字放大补偿，保持精致克制的小Buff条比例
            label.horizontalOverflow = HorizontalWrapMode.Overflow;
            var cs = label.gameObject.AddComponent<CrispStroke>();
            cs.UseGradient = true;
            cs.TopColor = Pal.Hex("FFFBE2");
            cs.BottomColor = Pal.Hex("FFC23A");
            cs.Color = Pal.Hex("381A04");
            cs.Radius = 2.0f;
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
