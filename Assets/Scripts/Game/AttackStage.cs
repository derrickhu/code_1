using System;
using System.Collections.Generic;
using Liangshan.Sim;
using UnityEngine;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>
    /// 把战场上的那套出手（BattleView.ShotView）搬到主界面。
    /// 弹道画在远离主相机的世界坐标里，再贴回界面，这样箭、火雷、刀斧的飞行和拖尾跟局内是同一份代码。
    /// </summary>
    public sealed class AttackStage : MonoBehaviour
    {
        const float Ppu = 100f;
        static readonly Vector2 Origin = new Vector2(500f, 500f);

        Camera _cam;
        RenderTexture _rt;
        Transform _world;
        readonly List<Shot> _shots = new List<Shot>();
        readonly List<BattleView.ShotView> _views = new List<BattleView.ShotView>();
        int _seq;
        bool _open;

        public event Action Landed;

        public void Open(RectTransform layer)
        {
            Canvas.ForceUpdateCanvases();
            var rect = layer.rect.height >= 8f ? layer.rect : Ui.Root.rect;
            float w = Mathf.Max(8f, rect.width);
            float h = Mathf.Max(8f, rect.height);
            int rh = Mathf.Min(1280, Mathf.RoundToInt(h));
            int rw = Mathf.Max(8, Mathf.RoundToInt(rh * (w / h)));

            _world = new GameObject("atkWorld").transform;
            _cam = new GameObject("atkCam").AddComponent<Camera>();
            _cam.orthographic = true;
            _cam.orthographicSize = h / (2f * Ppu);
            _cam.transform.position = new Vector3(Origin.x, Origin.y, -10f);
            _cam.clearFlags = CameraClearFlags.SolidColor;
            _cam.backgroundColor = new Color(0f, 0f, 0f, 0f);
            _cam.nearClipPlane = 0.3f;
            _cam.farClipPlane = 40f;
            _cam.allowMSAA = false;
            _cam.depth = -50;
            _rt = new RenderTexture(rw, rh, 16, RenderTextureFormat.ARGB32);
            _rt.Create();
            _cam.targetTexture = _rt;

            var view = Ui.Rect(layer, "atkView");
            view.anchorMin = Vector2.zero;
            view.anchorMax = Vector2.one;
            view.offsetMin = view.offsetMax = Vector2.zero;
            var img = view.gameObject.AddComponent<RawImage>();
            img.texture = _rt;
            img.raycastTarget = false;

            var text = Ui.Rect(layer, "atkText");
            text.sizeDelta = Vector2.one;
            if (WorldFx.I == null) WorldFx.Create(_world, text, _cam.transform);
            _open = true;
        }

        /// <summary>uiFrom、uiTo 是界面层的本地坐标，和主界面量好汉、首领位置用的同一套。</summary>
        public void Fire(HeroId hero, ShotKind kind, Vector2 uiFrom, Vector2 uiTo, float delay)
        {
            if (!_open) return;
            var a = Origin + uiFrom / Ppu;
            var b = Origin + uiTo / Ppu;
            var s = new Shot
            {
                Id = ++_seq,
                Kind = kind,
                Hero = hero,
                From = new V2(a.x, a.y),
                To = new V2(b.x, b.y),
                T = -delay,
                Dur = Battle.ShotDur(kind, Vector2.Distance(a, b)),
            };
            _shots.Add(s);
            _views.Add(new BattleView.ShotView(s, _world));
        }

        void Update()
        {
            if (!_open) return;
            // 首帧和切后台会把 unscaledDeltaTime 撑到好几秒。不封顶的话这一下在同一帧里飞完，界面上只剩一个空挥。
            float dt = Mathf.Min(Time.unscaledDeltaTime, 0.05f);
            for (int i = _shots.Count - 1; i >= 0; i--)
            {
                var s = _shots[i];
                s.T += dt;
                _views[i].Tick();
                if (s.T < s.Dur) continue;
                var at = new Vector2(s.To.X, s.To.Y);
                _views[i].Destroy();
                _views.RemoveAt(i);
                _shots.RemoveAt(i);
                if (WorldFx.I != null) WorldFx.I.Flash(at, 1.4f, Color.white.A(0.75f), 0.16f, 9300);
                Landed?.Invoke();
            }
        }

        void OnDestroy()
        {
            _open = false;
            for (int i = 0; i < _views.Count; i++) _views[i].Destroy();
            _views.Clear();
            _shots.Clear();
            if (_cam != null) _cam.targetTexture = null;
            if (_world != null) Destroy(_world.gameObject);
            if (_cam != null) Destroy(_cam.gameObject);
            if (_rt != null)
            {
                _rt.Release();
                Destroy(_rt);
            }
        }
    }
}
