using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
#if UNITY_WEIXINMINIGAME && !UNITY_EDITOR
using WeChatWASM;
#endif

namespace Liangshan
{
    /// <summary>
    /// 启动页：和微信封面同一张图（tools/build_loading_art.py 合成，标题、进度槽、健康忠告、适龄标都在图上）。
    /// 这里只往槽里画金色进度和一行状态字。云存档回来并且最短展示时间到了才进主界面。
    /// </summary>
    public sealed class LoadingScreen : MonoBehaviour
    {
        public const float MinSeconds = 2.6f;

        /// <summary>图是 1080x1920。槽的位置是 720 设计尺寸 ×1.5，和 build_loading_art.py 一致。</summary>
        const float ArtW = 1080f, ArtH = 1920f;
        const float BarW = 600f, BarH = 15f, BarBottom = 321f;
        const float TextBottom = 348f;

        RectTransform _root, _frame, _stage;
        CanvasGroup _group;
        RectTransform _fill, _head;
        Text _status;
        float _born;
        bool _hold, _boot;
        List<string> _packs;

        public static bool InWeChat
        {
            get
            {
#if (UNITY_WEIXINMINIGAME || TUANJIE_WEIXINMINIGAME || UNITY_MINIGAME || WEIXINMINIGAME || MINIGAME_SUBPLATFORM_WEIXIN) && !UNITY_EDITOR
                return true;
#else
                return false;
#endif
            }
        }

        /// <summary>boot 才铺启动大图，进度走满写「开始游戏」。进战斗等图包用纯色进度，不复用这张封面。</summary>
        public static LoadingScreen Open(bool boot = true)
        {
            var go = new GameObject("Loading");
            var s = go.AddComponent<LoadingScreen>();
            s._boot = boot;
            s.Build();
            return s;
        }

        /// <summary>微信封面留到主界面画出来再揭。插件默认第二帧就揭，会闪一下空场景。</summary>
        public static void SuppressAutoHide()
        {
            var auto = GameObject.Find("HideLoadingPage");
            if (auto != null) Destroy(auto);
        }

        public static void HideWeChatCover()
        {
#if UNITY_WEIXINMINIGAME && !UNITY_EDITOR
            try { WX.HideLoadingPage(); }
            catch (Exception e) { Debug.LogWarning("[微信] 揭封面失败 " + e.Message); }
#endif
        }

        void Build()
        {
            _born = Time.realtimeSinceStartup;
            _root = Ui.Rect(Ui.Root, "Loading");
            _root.anchorMin = Vector2.zero;
            _root.anchorMax = Vector2.one;
            _root.offsetMin = _root.offsetMax = Vector2.zero;
            _group = _root.gameObject.AddComponent<CanvasGroup>();
            _group.blocksRaycasts = true;

            var night = Ui.Rect(_root, "night");
            night.anchorMin = Vector2.zero;
            night.anchorMax = Vector2.one;
            night.offsetMin = night.offsetMax = Vector2.zero;
            var nightImg = night.gameObject.AddComponent<Image>();
            nightImg.color = Pal.Hex("140D09");
            nightImg.raycastTarget = true;

            // 整张图等比铺满屏幕。长屏裁掉左右一点边，不再上下留黑边。
            _frame = Ui.Rect(_root, "frame");
            _frame.anchorMin = Vector2.zero;
            _frame.anchorMax = Vector2.one;
            _frame.offsetMin = _frame.offsetMax = Vector2.zero;
            _stage = Ui.Rect(_frame, "art");
            _stage.anchorMin = _stage.anchorMax = new Vector2(0.5f, 0.5f);
            _stage.sizeDelta = new Vector2(ArtW, ArtH);
            var img = _stage.gameObject.AddComponent<Image>();
            img.sprite = _boot ? Splash() : null;
            img.raycastTarget = false;
            img.color = img.sprite == null ? Pal.Hex("140D09") : Color.white;

            BuildBar();
            Canvas.ForceUpdateCanvases();
            Fit();
            _root.SetAsLastSibling();
        }

        /// <summary>金色进度落在图上画好的黑漆槽里，前端一颗亮点；上面一行状态字。</summary>
        void BuildBar()
        {
            var track = Ui.Box(_stage, new Vector2(BarW, BarH), Vector2.zero, Pal.Hex("000000").A(0.45f), Art.Rounded, "barTrack");
            DockBottom(track.rectTransform, BarBottom, BarH);
            var fill = Ui.Box(track.transform, new Vector2(BarH, BarH), Vector2.zero, Pal.Hex("E6B54A"), Art.Rounded, "barFill");
            _fill = fill.rectTransform;
            _fill.anchorMin = _fill.anchorMax = new Vector2(0f, 0.5f);
            _fill.pivot = new Vector2(0f, 0.5f);
            _fill.anchoredPosition = Vector2.zero;
            var shine = Ui.Box(_fill, new Vector2(10, BarH * 0.32f), Vector2.zero, Color.white.A(0.35f), Art.Rounded, "shine");
            shine.rectTransform.anchorMin = new Vector2(0f, 0.5f);
            shine.rectTransform.anchorMax = new Vector2(1f, 0.5f);
            shine.rectTransform.sizeDelta = new Vector2(-BarH * 0.6f, BarH * 0.32f);
            shine.rectTransform.anchoredPosition = new Vector2(0f, BarH * 0.16f);
            var head = Ui.Box(_fill, new Vector2(BarH * 3.2f, BarH * 3.2f), Vector2.zero, Pal.Hex("FFE7A8").A(0.85f), Art.SoftDot, "head");
            _head = head.rectTransform;
            _head.anchorMin = _head.anchorMax = new Vector2(1f, 0.5f);
            _head.anchoredPosition = new Vector2(-BarH * 0.4f, 0f);
            _status = Ui.Label(_stage, "正在加载资源", 26, Pal.Hex("EBDDBE"), Vector2.zero, new Vector2(BarW, 34), TextAnchor.MiddleCenter, Fonts.Heavy, "status");
            DockBottom(_status.rectTransform, TextBottom, 34);
            foreach (var bar in new[] { track, fill, shine }) bar.pixelsPerUnitMultiplier = 18f / (BarH * 0.5f);
            shine.pixelsPerUnitMultiplier *= 2f;
            ApplyFill(0f);
        }

        void Fit()
        {
            if (_frame == null || _stage == null) return;
            var size = _frame.rect.size;
            if (size.x < 1f || size.y < 1f) return;
            float k = Mathf.Max(size.x / ArtW, size.y / ArtH);
            _stage.localScale = new Vector3(k, k, 1f);
        }

        /// <summary>进战斗等图包时，进度跟着下载走。</summary>
        public void Follow(List<string> packs)
        {
            _hold = true;
            _packs = packs;
            ApplyFill(0.06f);
        }

        public void SetFill(float p)
        {
            _hold = true;
            _packs = null;
            ApplyFill(p);
        }

        void ApplyFill(float p)
        {
            if (_fill == null) return;
            p = Mathf.Clamp01(p);
            _fill.sizeDelta = new Vector2(Mathf.Lerp(BarH, BarW, p), BarH);
            if (_status != null)
                _status.text = _boot && p >= 0.999f ? "开始游戏" : $"正在加载资源  {Mathf.RoundToInt(p * 100)}%";
        }

        static Sprite Splash()
        {
            var sprite = Resources.Load<Sprite>("Art/loading");
            if (sprite != null && sprite.texture != null && sprite.texture.width > 128) return sprite;
            var tex = Resources.Load<Texture2D>("Art/loading");
            if (tex == null || tex.width < 128) return null;
            return Sprite.Create(tex, new Rect(0, 0, tex.width, tex.height), new Vector2(0.5f, 0.5f), 100f, 0, SpriteMeshType.FullRect);
        }

        static void DockBottom(RectTransform rt, float y, float h)
        {
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0f);
            rt.pivot = new Vector2(0.5f, 0f);
            rt.sizeDelta = new Vector2(rt.sizeDelta.x, h);
            rt.anchoredPosition = new Vector2(0f, y);
        }

        void Update()
        {
            Fit();
            if (_head != null)
            {
                float pulse = 0.85f + 0.15f * Mathf.Sin(Time.realtimeSinceStartup * 9f);
                _head.localScale = new Vector3(pulse, pulse, 1f);
            }
            if (_packs != null)
            {
                ApplyFill(Mathf.Lerp(0.08f, 0.92f, ArtPack.Progress(_packs)));
                return;
            }
            if (_hold || _fill == null) return;
            float p = Mathf.Clamp01((Time.realtimeSinceStartup - _born) / MinSeconds);
            ApplyFill(Mathf.Lerp(0.06f, 0.9f, p));
        }

        public void BringToFront()
        {
            if (_root) _root.SetAsLastSibling();
        }

        public IEnumerator WaitMin()
        {
            while (Time.realtimeSinceStartup - _born < MinSeconds) yield return null;
        }

        public IEnumerator FadeOut()
        {
            float t = 0f;
            const float dur = 0.4f;
            while (t < dur)
            {
                t += Time.unscaledDeltaTime;
                if (_group) _group.alpha = 1f - Mathf.Clamp01(t / dur);
                yield return null;
            }
            Destroy(gameObject);
        }

        void OnDestroy()
        {
            if (_root) Destroy(_root.gameObject);
        }
    }
}
