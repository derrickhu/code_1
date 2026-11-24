using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>首页出征：阵上最强的输出用战场同一套攻击帧和同一套弹道，打台阶上的怪物。换阵容就换人。</summary>
    public sealed class HomeVolley : MonoBehaviour
    {
        RectTransform _layer;
        Image _boss;
        BossBreathing _bossAnim;
        Image[] _heroes;
        HeroId[] _ids;
        AttackStage _stage;
        float _wait = 0.6f, _castAt = -1f;
        int _who;
        HeroDef _def;
        float[] _atk, _hold;
        Sprite[][] _clip;

        /// <summary>best：阵上出手的那一位（战力最高的输出）。其余人只站着呼吸。</summary>
        public void Begin(Image boss, Image[] heroes, HeroId[] ids, int best)
        {
            _layer = (RectTransform)transform;
            _boss = boss;
            _bossAnim = boss != null ? boss.GetComponent<BossBreathing>() : null;
            _heroes = heroes;
            _ids = ids;
            _who = Mathf.Clamp(best, 0, Mathf.Max(0, ids.Length - 1));
            _def = ids.Length > 0 ? Defs.Hero(ids[_who]) : null;
            _atk = new float[heroes.Length];
            _hold = new float[heroes.Length];
            _clip = new Sprite[heroes.Length][];
            for (int i = 0; i < heroes.Length; i++)
            {
                _atk[i] = -1f;
                int k = i;
                string art = Defs.Hero(ids[i]).Art;
                Art.Late(this, art, () =>
                {
                    var fr = Art.Frames(art);
                    _clip[k] = fr.Length >= 4 ? fr : null;
                });
            }
            _stage = gameObject.AddComponent<AttackStage>();
            _stage.Open(_layer);
            _stage.Landed += () =>
            {
                if (_def != null && _def.Coef > 0f) HeroSfx.Hit(_def, false, Volume);
                if (_bossAnim != null)
                {
                    float fromX = _heroes != null && _who < _heroes.Length && _heroes[_who] != null
                        ? Point(_heroes[_who].rectTransform, Vector2.zero).x
                        : 0f;
                    _bossAnim.TriggerHit(fromX < 0f ? 1f : -1f);
                }
            };
        }

        void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            if (_ids == null || _ids.Length == 0 || _boss == null) return;
            Pose(dt);
            if (_castAt >= 0f)
            {
                _castAt -= dt;
                if (_castAt < 0f)
                {
                    if (_def.Coef > 0f) HeroSfx.Cast(_def, Volume);
                    else HeroSfx.Buff(_def, Volume);
                }
            }
            _wait -= dt;
            if (_wait > 0) return;
            int n = Launch(_who);
            _castAt = 0.14f;
            _wait = 1.3f + n * 0.12f;
        }

        /// <summary>首页是循环演示，比局里轻一点，不盖过配乐和按钮声。</summary>
        const float Volume = 0.7f;

        int Launch(int i)
        {
            var d = Defs.Hero(_ids[i]);
            int n = Mathf.Clamp(Mathf.Max(1, d.Count), 1, 5);
            if (d.Chan > 0f && d.Tick > 0f) n = Mathf.Clamp(Mathf.RoundToInt(d.Chan / d.Tick), 1, 5);
            if (d.Coef <= 0f) n = 1;
            var from = Point(_heroes[i].rectTransform, new Vector2(0, 36));
            var to = Point(_boss.rectTransform, new Vector2(0, 8));
            var dir = to - from;
            var perp = dir.sqrMagnitude > 1f ? new Vector2(-dir.y, dir.x).normalized : Vector2.right;
            for (int k = 0; k < n; k++)
            {
                float spread = (k - (n - 1) * 0.5f) * 26f;
                _stage.Fire(d.Id, d.Shot, from + perp * spread * 0.25f, to + perp * spread, 0.14f + k * 0.08f);
            }
            if (_clip[i] != null)
            {
                _atk[i] = 0f;
                _hold[i] = 0.44f + Mathf.Max(0, n - 1) * 0.08f;
            }
            return n;
        }

        /// <summary>出手时先蓄力帧再攻击帧，打完回到待机呼吸。节拍和战场格子同一套。</summary>
        void Pose(float dt)
        {
            for (int i = 0; i < _heroes.Length; i++)
            {
                var img = _heroes[i];
                var clip = _clip[i];
                if (img == null || clip == null) continue;
                float age = _atk[i];
                if (age >= 0f)
                {
                    age += dt;
                    _atk[i] = age >= _hold[i] ? -1f : age;
                }
                bool on = age >= 0f && age < _hold[i];
                int frame = HeroPose.Frame(Time.unscaledTime, i, on && age < 0.22f, on && age >= 0.22f);
                var spr = clip[frame % clip.Length];
                if (img.sprite != spr) img.sprite = spr;
            }
        }

        Vector2 Point(RectTransform rt, Vector2 nudge)
        {
            return (Vector2)_layer.InverseTransformPoint(rt.TransformPoint(rt.rect.center)) + nudge;
        }
    }

    /// <summary>
    /// 首页路尽头统领/首领专属 2D 网格骨骼呼吸与受击形变（对标《永远的蔚蓝星球》Spine 呼吸感）：
    /// 14×18 细分网格：双靴牢牢钉死在古道尽头石面上（零滑步悬浮），膝胯沉稳蓄势，胸甲随吸气自然起伏扩张，
    /// 两侧手臂与兵刃带 0.82rad 相位滞后弧线摆动，冠羽随山风微颤；受击时脚底不动、上身弹性后仰挤压并泛亮红受创光。
    /// </summary>
    public sealed class BossBreathing : BaseMeshEffect
    {
        const int Cols = 14, Rows = 18;

        bool _flying;
        RectTransform _contactShadow, _castShadow, _mist;
        Vector2 _contactSize, _castSize, _mistPos;
        float _time;
        float _hitT, _hitDir = 1f;

        public void Setup(bool flying, RectTransform contactShadow, RectTransform castShadow, RectTransform mist)
        {
            _flying = flying;
            _contactShadow = contactShadow;
            _castShadow = castShadow;
            _mist = mist;
            if (_contactShadow) _contactSize = _contactShadow.sizeDelta;
            if (_castShadow) _castSize = _castShadow.sizeDelta;
            if (_mist) _mistPos = _mist.anchoredPosition;
            _time = Random.Range(0f, 3.14f);
        }

        public void TriggerHit(float dir)
        {
            _hitT = 0.24f;
            _hitDir = dir >= 0f ? 1f : -1f;
            if (graphic != null) graphic.SetVerticesDirty();
        }

        void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            _time += dt;
            if (_hitT > 0f) _hitT = Mathf.Max(0f, _hitT - dt);

            float ph = _time * (_flying ? 5.2f : 2.45f);
            float breath = Mathf.Sin(ph) + 0.18f * Mathf.Sin(ph * 2f - 0.55f);
            if (_castShadow)
            {
                float k = _flying ? 1f - 0.10f * Mathf.Sin(ph - 0.5f) : 1f + 0.035f * breath;
                _castShadow.sizeDelta = new Vector2(_castSize.x * k, _castSize.y * Mathf.Lerp(1f, k, 0.5f));
            }
            if (_contactShadow)
            {
                float k = _flying ? 1f - 0.14f * Mathf.Sin(ph - 0.5f) : 1f - 0.018f * breath;
                _contactShadow.sizeDelta = new Vector2(_contactSize.x * k, _contactSize.y);
            }
            if (_mist)
            {
                _mist.anchoredPosition = _mistPos + new Vector2(Mathf.Sin(_time * 0.75f) * 14f, Mathf.Cos(_time * 1.1f) * 3f);
            }

            if (graphic != null) graphic.SetVerticesDirty();
        }

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || vh.currentVertCount < 4) return;

            UIVertex v0 = default, v1 = default, v2 = default, v3 = default;
            vh.PopulateUIVertex(ref v0, 0);
            vh.PopulateUIVertex(ref v1, 1);
            vh.PopulateUIVertex(ref v2, 2);
            vh.PopulateUIVertex(ref v3, 3);

            float xMin = Mathf.Min(Mathf.Min(v0.position.x, v1.position.x), Mathf.Min(v2.position.x, v3.position.x));
            float xMax = Mathf.Max(Mathf.Max(v0.position.x, v1.position.x), Mathf.Max(v2.position.x, v3.position.x));
            float yMin = Mathf.Min(Mathf.Min(v0.position.y, v1.position.y), Mathf.Min(v2.position.y, v3.position.y));
            float yMax = Mathf.Max(Mathf.Max(v0.position.y, v1.position.y), Mathf.Max(v2.position.y, v3.position.y));

            float uMin = Mathf.Min(Mathf.Min(v0.uv0.x, v1.uv0.x), Mathf.Min(v2.uv0.x, v3.uv0.x));
            float uMax = Mathf.Max(Mathf.Max(v0.uv0.x, v1.uv0.x), Mathf.Max(v2.uv0.x, v3.uv0.x));
            float vMin = Mathf.Min(Mathf.Min(v0.uv0.y, v1.uv0.y), Mathf.Min(v2.uv0.y, v3.uv0.y));
            float vMax = Mathf.Max(Mathf.Max(v0.uv0.y, v1.uv0.y), Mathf.Max(v2.uv0.y, v3.uv0.y));

            float w = xMax - xMin;
            float h = yMax - yMin;
            if (w < 1f || h < 1f) return;

            Color baseCol = v0.color;
            float flash = _hitT > 0f ? Mathf.Clamp01(_hitT / 0.14f) : 0f;
            float hk = _hitT > 0f ? 1f - Mathf.Clamp01(_hitT / 0.24f) : 1f;
            float hitSquash = _hitT > 0f ? Mathf.Sin(hk * Mathf.PI * 1.75f) * (1f - hk * 0.65f) : 0f;
            float hitLean = _hitT > 0f ? Mathf.Sin(hk * Mathf.PI) * (1f - hk * 0.38f) : 0f;

            float ph = _time * (_flying ? 5.2f : 2.45f);
            float breath = Mathf.Sin(ph) + 0.18f * Mathf.Sin(ph * 2f - 0.55f);
            float armWave = Mathf.Sin(ph - 0.82f);
            float sway = Mathf.Sin(ph * 0.5f + 0.35f);

            vh.Clear();
            int stride = Cols + 1;
            UIVertex vert = v0;

            for (int iy = 0; iy <= Rows; iy++)
            {
                float v = iy / (float)Rows;
                float footLock = _flying ? 1f : Mathf.SmoothStep(0.012f, 0.17f, v);
                float spineLift = Mathf.SmoothStep(0.08f, 0.64f, v);
                float dv = (v - 0.56f) / 0.25f;
                float chestBell = Mathf.Exp(-dv * dv);
                float crownMask = Mathf.SmoothStep(0.76f, 0.98f, v);
                float armV = Mathf.SmoothStep(0.15f, 0.42f, v);

                // 靴底微压接触暗部（AO），与石面接触影自然融合；受击时叠加亮珊瑚红受创高光
                float bootAo = _flying ? 1f : Mathf.Lerp(0.89f, 1f, Mathf.SmoothStep(0f, 0.12f, v));
                Color rowCol = new Color(baseCol.r * bootAo, baseCol.g * bootAo, baseCol.b * bootAo, baseCol.a);
                if (flash > 0f)
                {
                    var hitTint = new Color(1f, 0.58f, 0.52f, rowCol.a);
                    rowCol = Color.Lerp(rowCol, hitTint, flash * 0.72f);
                }
                Color32 c32 = rowCol;

                for (int ix = 0; ix <= Cols; ix++)
                {
                    float u = ix / (float)Cols;
                    float px = Mathf.Lerp(xMin, xMax, u);
                    float py = Mathf.Lerp(yMin, yMax, v);
                    float dx = 0f, dy = 0f;

                    if (_flying)
                    {
                        float wingMask = Mathf.SmoothStep(0.08f, 0.38f, Mathf.Abs(u - 0.5f));
                        dy += Mathf.Sin(ph - 0.5f) * (h * 0.030f);
                        dy += Mathf.Sin(ph) * (h * 0.052f) * wingMask * Mathf.SmoothStep(0.18f, 0.72f, v);
                        dx += (u - 0.5f) * Mathf.Cos(ph) * (w * 0.042f) * wingMask;
                    }
                    else
                    {
                        // 1) 胸腹吸气起伏 + 胸肩甲横向扩张（双脚在 v<=0.012 处严格锁零）
                        dy += breath * (h * 0.024f) * spineLift;
                        dx += (u - 0.5f) * breath * (w * 0.048f) * chestBell * footLock;

                        // 2) 武人站桩重心微移 + 头冠翎羽随山风轻摆
                        dx += sway * (w * 0.012f) * Mathf.SmoothStep(0.10f, 0.74f, v);
                        dx += Mathf.Sin(ph * 2f - 1.15f) * (w * 0.009f) * crownMask;

                        // 3) 左右双臂与所持兵刃滞后跟随（模拟 Spine 肩-肘-兵刃二级骨骼相位差）
                        float armMask = Mathf.SmoothStep(0.11f, 0.34f, Mathf.Abs(u - 0.5f)) * armV;
                        if (armMask > 0.001f)
                        {
                            dy += armWave * (h * 0.018f) * armMask;
                            float sx = (xMin + xMax) * 0.5f + (u < 0.5f ? -w * 0.15f : w * 0.15f);
                            float sy = yMin + h * 0.58f;
                            float ang = (u < 0.5f ? 1f : -1f) * armWave * 0.036f * armMask;
                            float cos = Mathf.Cos(ang), sin = Mathf.Sin(ang);
                            float rx = px - sx, ry = py - sy;
                            dx += rx * cos - ry * sin - rx;
                            dy += rx * sin + ry * cos - ry;
                        }
                    }

                    // 4) 受击弹性后仰与挤压回弹（脚底同样锁死不离地）
                    if (_hitT > 0f)
                    {
                        dx += _hitDir * hitLean * (w * 0.040f) * Mathf.SmoothStep(0.06f, 0.82f, v);
                        dx += (u - 0.5f) * hitSquash * (w * 0.092f) * footLock;
                        dy -= hitSquash * (h * 0.048f) * footLock;
                    }

                    vert.position = new Vector3(px + dx, py + dy, 0f);
                    vert.uv0 = new Vector4(Mathf.Lerp(uMin, uMax, u), Mathf.Lerp(vMin, vMax, v), 0f, 0f);
                    vert.color = c32;
                    vh.AddVert(vert);
                }
            }

            for (int iy = 0; iy < Rows; iy++)
            {
                int row0 = iy * stride;
                int row1 = (iy + 1) * stride;
                for (int ix = 0; ix < Cols; ix++)
                {
                    int a = row0 + ix;
                    int b = row1 + ix;
                    int c = row1 + ix + 1;
                    int d = row0 + ix + 1;
                    vh.AddTriangle(a, b, c);
                    vh.AddTriangle(a, c, d);
                }
            }
        }
    }
}
