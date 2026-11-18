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
        Image[] _heroes;
        HeroId[] _ids;
        AttackStage _stage;
        float _wait = 0.6f, _flinch, _castAt = -1f;
        int _who;
        HeroDef _def;
        float[] _atk, _hold;
        Sprite[][] _clip;

        /// <summary>best：阵上出手的那一位（战力最高的输出）。其余人只站着呼吸。</summary>
        public void Begin(Image boss, Image[] heroes, HeroId[] ids, int best)
        {
            _layer = (RectTransform)transform;
            _boss = boss;
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
                _flinch = 0.12f;
                if (_def != null && _def.Coef > 0f) HeroSfx.Hit(_def, false, Volume);
                if (_boss == null) return;
                _boss.color = new Color(1f, 0.7f, 0.66f);
                _boss.rectTransform.localScale = Vector3.one * 0.9f;
            };
        }

        void Update()
        {
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            if (_ids == null || _ids.Length == 0 || _boss == null) return;
            Recover(dt);
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

        void Recover(float dt)
        {
            if (_flinch <= 0 || _boss == null) return;
            _flinch -= dt;
            float k = Mathf.Clamp01(_flinch / 0.12f);
            _boss.color = Color.Lerp(Color.white, new Color(1f, 0.7f, 0.66f), k);
            _boss.rectTransform.localScale = Vector3.one * Mathf.Lerp(1f, 0.9f, k);
        }

        Vector2 Point(RectTransform rt, Vector2 nudge)
        {
            return (Vector2)_layer.InverseTransformPoint(rt.TransformPoint(rt.rect.center)) + nudge;
        }
    }
}
