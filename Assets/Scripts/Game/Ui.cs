using System;
using System.Collections.Generic;
using System.Reflection;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Liangshan
{
    /// <summary>
    /// 界面全部用代码搭：设计稿 1080×1920。比 9:16 更高的屏幕宽度锁 1080、高度拉长；更宽的窗口居中缩放、左右留边。
    /// 战场世界坐标 1 单位 = 100 设计像素，顶边对齐，所以贴着世界物件的界面用 FromTop 换算。
    /// </summary>
    public static class Ui
    {
        public const float W = 1080f;
        public const float H = 1920f;

        public static Canvas Canvas { get; private set; }
        public static RectTransform Root { get; private set; }
        static RectTransform _canvasRt;
        static CanvasScaler _scaler;
        static int _safeKey = int.MinValue;
        static float _topPx, _bottomPx;

        public static bool Tall => Screen.height / Mathf.Max(1f, Screen.width) > H / W + 0.01f;

        public static void Init(Transform host)
        {
            var go = new GameObject("UiCanvas");
            go.transform.SetParent(host, false);
            Canvas = go.AddComponent<Canvas>();
            Canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            Canvas.sortingOrder = 100;
            _scaler = go.AddComponent<CanvasScaler>();
            _scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            _scaler.referenceResolution = new Vector2(W, H);
            _scaler.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            go.AddComponent<GraphicRaycaster>();
            _canvasRt = (RectTransform)go.transform;
            Root = Rect(_canvasRt, "Phone");
            Fit();
            if (UnityEngine.Object.FindObjectOfType<EventSystem>() == null)
            {
                var es = new GameObject("EventSystem");
                es.transform.SetParent(host, false);
                es.AddComponent<EventSystem>();
                es.AddComponent<StandaloneInputModule>();
            }
        }

        public static void Fit()
        {
            float match = Tall ? 0f : 1f;
            if (!Mathf.Approximately(_scaler.matchWidthOrHeight, match))
                _scaler.matchWidthOrHeight = match;
            typeof(CanvasScaler).GetMethod("Handle", BindingFlags.Instance | BindingFlags.NonPublic)?.Invoke(_scaler, null);
            if (Tall)
            {
                Root.anchorMin = Vector2.zero;
                Root.anchorMax = Vector2.one;
                Root.offsetMin = new Vector2(0, SafeBottom);
                Root.offsetMax = Vector2.zero;
            }
            else
            {
                Root.anchorMin = Root.anchorMax = new Vector2(0.5f, 0.5f);
                Root.sizeDelta = new Vector2(W, H);
                Root.anchoredPosition = Vector2.zero;
            }
            // 同一帧里就要读到真实高度，否则首页会按 1920 排，高屏多出来的路全空在中间。
            Canvas.ForceUpdateCanvases();
        }

        /// <summary>界面高度（设计像素）。宽窗口恒为 1920。</summary>
        public static float Height => Root.rect.height;

        /// <summary>扣掉刘海和胶囊后比 1920 设计稿多出来的高度。局外页按比例分给各段间距，不全堆在一处。</summary>
        public static float Spare => Mathf.Max(0f, Height - SafeTop - H);

        /// <summary>桌面自检用：命令行 -safe-top / -safe-bottom（屏幕像素）模拟微信胶囊和底部横条。</summary>
        public static float FakeSafeTopPx = -1f, FakeSafeBottomPx = -1f;

        // ---------- 搭建 ----------

        public static RectTransform Rect(Transform parent, string name = "rect")
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            return (RectTransform)go.transform;
        }

        /// <summary>锚在父节点底边中点，y 为离底距离。</summary>
        public static RectTransform Bottom(Transform parent, float x, float y, Vector2 size, string name = "b")
        {
            var rt = Rect(parent, name);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0f);
            rt.sizeDelta = size;
            rt.anchoredPosition = new Vector2(x, y);
            return rt;
        }

        /// <summary>锚在父节点顶边中点，y 为离顶距离（向下为正）。</summary>
        public static RectTransform Top(Transform parent, float x, float y, Vector2 size, string name = "t")
        {
            var rt = Rect(parent, name);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 1f);
            rt.sizeDelta = size;
            rt.anchoredPosition = new Vector2(x, -y);
            return rt;
        }

        /// <summary>世界坐标 y 换成离屏幕底边的设计像素。镜头底边固定在 y = -9.6，高屏多出来的都在上面（战场变长）。</summary>
        public static float FromBottom(float worldY) => (worldY + 9.6f) * 100f;

        /// <summary>世界坐标 y 换成离屏幕顶边的设计像素。随屏高变化，常驻界面要用 FromBottom + Bottom 锚点。</summary>
        public static float FromTop(float worldY) => Height - FromBottom(worldY);

        /// <summary>顶部刘海、状态栏和微信右上角胶囊占掉的设计像素。</summary>
        public static float SafeTop
        {
            get
            {
                MeasureSafe();
                return _topPx * DesignPerPixel;
            }
        }

        /// <summary>高屏底部横条让出的设计像素。界面根节点抬高这么多，宽窗口不让。</summary>
        public static float SafeBottom => SafeBottomPixels * DesignPerPixel;

        /// <summary>同 SafeBottom，单位是屏幕像素，给战场镜头用。</summary>
        public static float SafeBottomPixels
        {
            get
            {
                if (!Tall) return 0f;
                MeasureSafe();
                return _bottomPx;
            }
        }

        /// <summary>高屏按宽匹配，宽窗口按高匹配，和 Fit 里 CanvasScaler 的设置一致。</summary>
        static float DesignPerPixel => Tall ? W / Mathf.Max(1f, Screen.width) : H / Mathf.Max(1f, Screen.height);

        static void MeasureSafe()
        {
            int key = Screen.width * 73856093 ^ Screen.height * 19349663;
            if (key == _safeKey) return;
            _safeKey = key;
            if (FakeSafeTopPx >= 0f)
            {
                _topPx = FakeSafeTopPx;
                _bottomPx = Mathf.Max(0f, FakeSafeBottomPx);
            }
            else if (!WxSafe(out _topPx, out _bottomPx))
            {
                var sa = Screen.safeArea;
                _topPx = Mathf.Max(0f, Screen.height - sa.yMax);
                _bottomPx = Mathf.Max(0f, sa.y);
            }
            // 安全区太夸张就别吃掉画面
            _topPx = Mathf.Clamp(_topPx, 0f, Screen.height * 0.2f);
            // 底部横条区（iPhone 34pt）只让一半：横条贴着屏幕最底下，按钮压到上半截也碰不到。
            _bottomPx = Mathf.Clamp(_bottomPx * 0.5f, 0f, Screen.height * 0.04f);
        }

        /// <summary>微信小游戏里 Screen.safeArea 是整屏，要从微信接口拿安全区和胶囊，换成 Screen 像素。桌面端没有这个接口。</summary>
        static bool WxSafe(out float top, out float bottom)
        {
            top = bottom = 0f;
            var wx = Type.GetType("WeChatWASM.WX, Wx") ?? Type.GetType("WeChatWASM.WX");
            if (wx == null) return false;
            var get = wx.GetMethod("GetWindowInfo", BindingFlags.Public | BindingFlags.Static, null, Type.EmptyTypes, null);
            if (get == null) return false;
            object info;
            try { info = get.Invoke(null, null); }
            catch (Exception) { return false; }
            if (info == null) return false;
            float wxW = Number(info, "screenWidth"), wxH = Number(info, "screenHeight");
            if (wxW < 1f) wxW = Number(info, "windowWidth");
            if (wxH < 1f) wxH = Number(info, "windowHeight");
            if (wxW < 1f || wxH < 1f) return false;
            object area = Member(info, "safeArea");
            if (area == null) return false;
            float sy = Screen.height / wxH;
            top = Number(area, "top") * sy;
            bottom = Mathf.Max(0f, wxH - Number(area, "bottom")) * sy;

            var menu = wx.GetMethod("GetMenuButtonBoundingClientRect", BindingFlags.Public | BindingFlags.Static, null, Type.EmptyTypes, null);
            if (menu != null)
            {
                try
                {
                    float menuBottom = Number(menu.Invoke(null, null), "bottom");
                    if (menuBottom > 0f) top = Mathf.Max(top, (menuBottom + 6f) * sy);
                }
                catch (Exception) { }
            }
            return top > 0.5f || bottom > 0.5f;
        }

        static object Member(object o, string name)
        {
            if (o == null) return null;
            var f = o.GetType().GetField(name);
            if (f != null) return f.GetValue(o);
            var p = o.GetType().GetProperty(name);
            return p != null ? p.GetValue(o) : null;
        }

        static float Number(object o, string name)
        {
            object v = Member(o, name);
            if (v == null) return 0f;
            try { return Convert.ToSingle(v); }
            catch (Exception) { return 0f; }
        }

        public static RectTransform Fill(Transform parent, Color c, bool block = true, string name = "fill")
        {
            var rt = Rect(parent, name);
            rt.anchorMin = Vector2.zero;
            rt.anchorMax = Vector2.one;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            var img = rt.gameObject.AddComponent<Image>();
            img.color = c;
            img.raycastTarget = block;
            return rt;
        }

        public static Image Box(Transform parent, Vector2 size, Vector2 pos, Color c, Sprite sprite = null, string name = "box")
        {
            var rt = Rect(parent, name);
            rt.sizeDelta = size;
            rt.anchoredPosition = pos;
            var img = rt.gameObject.AddComponent<Image>();
            img.sprite = sprite ?? Art.Rounded;
            img.type = img.sprite.border != Vector4.zero ? Image.Type.Sliced : Image.Type.Simple;
            img.color = c;
            img.raycastTarget = false;
            return img;
        }

        public static Image Icon(Transform parent, string art, float size, Vector2 pos, string name = "icon")
        {
            var img = Box(parent, Vector2.one * size, pos, Color.white, Art.Img(art), name);
            img.type = Image.Type.Simple;
            img.preserveAspect = true;
            return img;
        }

        public static Text Label(Transform parent, string s, int size, Color c, Vector2 pos, Vector2 box,
            TextAnchor align = TextAnchor.MiddleCenter, Font font = null, string name = "label")
        {
            var rt = Rect(parent, name);
            rt.sizeDelta = box;
            rt.anchoredPosition = pos;
            var t = rt.gameObject.AddComponent<Text>();
            t.font = font ?? Fonts.Bold;
            // 手机上 1080 设计稿约缩到 0.38 倍，24 以下的字只剩 9 像素；小字统一往上抬，大字不动
            t.fontSize = size < 30 ? Mathf.RoundToInt(size + (30 - size) * 0.35f) : size;
            t.color = c;
            t.alignment = align;
            t.text = s;
            t.raycastTarget = false;
            t.supportRichText = true;
            t.horizontalOverflow = HorizontalWrapMode.Wrap;
            t.verticalOverflow = VerticalWrapMode.Overflow;
            t.lineSpacing = 1.05f;
            return t;
        }

        /// <summary>卡通描边字：八向圆滑描边 + 紧致底边立体投影，笔画通透不糊团。</summary>
        public static Text Outlined(Transform parent, string s, int size, Color c, Vector2 pos, Vector2 box, Color edge,
            float thick = 2.4f, TextAnchor align = TextAnchor.MiddleCenter, string name = "olabel")
        {
            var t = Label(parent, s, size, c, pos, box, align, Fonts.Heavy, name);
            Stroke(t, edge, thick);
            return t;
        }

        /// <summary>八向等距真圆描边（替代 Unity 四角对角线 Outline 的重影分叉）；字号越小描边自动收细。</summary>
        public static Text Stroke(Text t, Color c, float d)
        {
            float eff = Mathf.Clamp(d * 0.64f, 1.05f, Mathf.Min(3.4f, t.fontSize * 0.068f));
            var cs = t.gameObject.GetComponent<CrispStroke>();
            if (!cs) cs = t.gameObject.AddComponent<CrispStroke>();
            cs.Color = c;
            cs.Radius = eff;
            return t;
        }

        /// <summary>上下双色金属/琥珀立体渐变描边大字（参考图名次大字、牌匾主标题同款）。</summary>
        public static Text GradOutlined(Transform parent, string s, int size, Color topCol, Color botCol, Vector2 pos, Vector2 box,
            Color edge, float thick = 3.2f, TextAnchor align = TextAnchor.MiddleCenter, string name = "glabel")
        {
            var t = Label(parent, s, size, Color.white, pos, box, align, Fonts.Heavy, name);
            var cs = t.gameObject.AddComponent<CrispStroke>();
            cs.Color = edge;
            cs.Radius = Mathf.Clamp(thick * 0.68f, 1.2f, Mathf.Min(3.6f, t.fontSize * 0.072f));
            cs.UseGradient = true;
            cs.TopColor = topCol;
            cs.BottomColor = botCol;
            return t;
        }

        public static void Tap(Graphic g, Action onClick, Transform punch = null, bool sound = true, float sink = 0f)
        {
            g.raycastTarget = true;
            var b = g.gameObject.GetComponent<Button>();
            if (!b) b = g.gameObject.AddComponent<Button>();
            b.transition = Selectable.Transition.None;
            var t = punch ? punch : g.transform;
            var fx = g.gameObject.GetComponent<PressFx>();
            if (!fx) fx = g.gameObject.AddComponent<PressFx>();
            fx.Setup(t, sink);
            b.onClick.AddListener(() =>
            {
                if (sound) Sfx.Play(Snd.Tap);
                onClick?.Invoke();
            });
        }

        /// <summary>手绘九宫格皮肤（Art/ui）。scale 是边框显示倍数，≤0 时按高度贴合，横条和按钮用。</summary>
        public static Image Skin(Transform parent, string skin, Vector2 size, Vector2 pos, float scale = 1f, Color? c = null, string name = "skin")
        {
            var sp = Art.Skin(skin);
            var img = Box(parent, size, pos, c ?? Color.white, sp, name);
            if (scale <= 0f) scale = size.y / sp.rect.height;
            img.pixelsPerUnitMultiplier = 1f / Mathf.Max(0.05f, scale);
            return img;
        }

        /// <summary>按面色挑最匹配的高清 3D 亮泽圆角按钮皮肤（含金/天蓝/青玉/翠绿/星愿紫/暖橙/朱红/石板灰 8 色）。</summary>
        public static string BtnSkin(Color c)
        {
            Color.RGBToHSV(c, out float h, out float s, out _);
            if (s < 0.35f) return "btn_grey";
            if (h < 0.03f || h > 0.90f) return "btn_red";
            if (h < 0.10f) return "btn_orange";
            if (h < 0.18f) return "btn_gold";
            if (h < 0.43f) return "btn_green";
            if (h < 0.53f) return "btn_teal";
            if (h < 0.68f) return "btn_blue";
            return "btn_purple";
        }

        static Color BtnStroke(string skin)
        {
            switch (skin)
            {
                case "btn_gold": return Pal.Hex("5E3606");
                case "btn_green": return Pal.Hex("124422");
                case "btn_teal": return Pal.Hex("0E4246");
                case "btn_blue": return Pal.Hex("143B5E");
                case "btn_purple": return Pal.Hex("3D1666");
                case "btn_orange": return Pal.Hex("5C2406");
                case "btn_red": return Pal.Hex("561016");
                default: return Pal.Hex("2C3C4C");
            }
        }

        /// <summary>高清 4x 抗锯齿 3D 亮泽圆角按钮（对标《永远的蔚蓝星球》同曲率立体底沿 + 左上玻璃高光点）。</summary>
        public static RectTransform Btn(Transform parent, string text, Vector2 size, Vector2 pos, Color face, Action onClick,
            int fontSize = 52, string icon = null, Color? fg = null)
        {
            var holder = Rect(parent, "btn");
            holder.sizeDelta = size;
            holder.anchoredPosition = pos;
            string skin = BtnSkin(face);
            Color stroke = BtnStroke(skin);
            float sink = Mathf.Clamp(size.y * 0.068f, 5f, 8.5f);
            float bScale = Mathf.Min(1f, size.y / 100f);

            // 同曲率 3D 立体底沿 + 柔和自然环境投影（四周外扩 8*bScale 承接羽化投影，圆角与上表面 100% 严丝合缝）
            float lipPad = 8f * bScale;
            var lip = Skin(holder, skin + "_lip", size + new Vector2(lipPad * 2f, lipPad * 2f), new Vector2(0, -sink), bScale, null, "lip");
            lip.raycastTarget = false;

            var body = Rect(holder, "body");
            body.sizeDelta = size;
            var faceImg = Skin(body, skin, size, Vector2.zero, bScale, null, "face");
            faceImg.raycastTarget = false;

            float iconW = icon != null ? Mathf.Min(size.y * 0.62f, 64f) : 0f;
            Color textCol = fg ?? (skin == "btn_gold" ? Pal.Hex("542F06") : Color.white);
            float lum = textCol.r * 0.299f + textCol.g * 0.587f + textCol.b * 0.114f;
            float textOffX = icon != null ? iconW * 0.44f : 0f;
            Text label;
            if (lum < 0.45f)
            {
                label = Label(body, text, fontSize, textCol, new Vector2(textOffX, 2), new Vector2(size.x - iconW - 16f, size.y),
                    TextAnchor.MiddleCenter, Fonts.Heavy, "text");
                var sheen = label.gameObject.AddComponent<Shadow>();
                sheen.effectColor = new Color(1f, 0.98f, 0.88f, 0.65f);
                sheen.effectDistance = new Vector2(0f, -1.4f);
            }
            else
            {
                label = Outlined(body, text, fontSize, textCol, new Vector2(textOffX, 2), new Vector2(size.x - iconW - 16f, size.y),
                    stroke, 2.3f, TextAnchor.MiddleCenter, "text");
            }
            label.resizeTextForBestFit = false;
            if (icon != null)
            {
                float tw = Mathf.Min(size.x - iconW - 24f, label.preferredWidth);
                Icon(body, icon, iconW, new Vector2(textOffX - tw * 0.5f - iconW * 0.54f, 2), "btnIcon");
            }
            var hit = Box(holder, size, Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            Tap(hit, onClick, body, true, sink);
            return holder;
        }

        /// <summary>双行主行动按钮（对标《永远的蔚蓝星球》开始挑战/招募/寻宝：上层大字标题，下层同色系干净内嵌消耗槽 + 图标数值，彻底根除脏黑半透明阴影）。</summary>
        public static RectTransform SubBtn(Transform parent, string title, string subIcon, string subText, Vector2 size, Vector2 pos,
            Color face, Action onClick, int titleSize = 42, int subSize = 25, bool ornateStart = false)
        {
            var holder = Rect(parent, ornateStart ? "start" : "subBtn");
            holder.sizeDelta = size;
            holder.anchoredPosition = pos;
            string skin = ornateStart ? "h_start" : BtnSkin(face);
            string baseSkin = ornateStart ? "btn_gold" : skin;
            Color stroke = BtnStroke(baseSkin);
            float sink = ornateStart ? 8.5f : Mathf.Clamp(size.y * 0.068f, 5.5f, 8f);
            float bScale = ornateStart ? 1f : Mathf.Min(1f, size.y / 112f);
            float lipPad = 8f * bScale;

            var lip = Skin(holder, skin + "_lip", size + new Vector2(lipPad * 2f, lipPad * 2f), new Vector2(0, -sink), bScale, null, "lip");
            lip.raycastTarget = false;

            var body = Rect(holder, "body");
            body.sizeDelta = size;
            var faceImg = Skin(body, skin, size, Vector2.zero, bScale, null, "face");
            faceImg.raycastTarget = false;

            bool goldFace = baseSkin == "btn_gold";
            float titleY = size.y * 0.20f;
            Text lbl;
            if (goldFace)
            {
                lbl = Label(body, title, titleSize, Pal.Hex("542F06"), new Vector2(0, titleY), new Vector2(size.x - 40f, size.y * 0.54f),
                    TextAnchor.MiddleCenter, Fonts.Heavy, "text");
                var sheen = lbl.gameObject.AddComponent<Shadow>();
                sheen.effectColor = new Color(1f, 0.98f, 0.88f, 0.68f);
                sheen.effectDistance = new Vector2(0f, -1.5f);
            }
            else
            {
                lbl = Outlined(body, title, titleSize, Color.white, new Vector2(0, titleY), new Vector2(size.x - 40f, size.y * 0.54f),
                    stroke, 2.5f, TextAnchor.MiddleCenter, "text");
            }
            lbl.resizeTextForBestFit = false;

            // 下半部干净同色系内嵌凹槽（0% 脏黑阴影）
            float wellH = Mathf.Clamp(size.y * 0.31f, 34f, 44f);
            float wellY = -size.y * 0.24f;
            var dummy = Outlined(body, subText, subSize, Color.white, Vector2.zero, new Vector2(size.x - 32f, wellH), stroke, 2.0f, TextAnchor.MiddleCenter, "costText");
            dummy.resizeTextForBestFit = false;
            float tw = dummy.preferredWidth;
            float icSz = subIcon != null ? wellH * 0.92f : 0f;
            float contentW = tw + (subIcon != null ? icSz + 8f : 0f);
            float wellW = Mathf.Clamp(contentW + 44f, 128f, size.x - 36f);

            var well = Skin(body, baseSkin + "_well", new Vector2(wellW, wellH), new Vector2(0, wellY), Mathf.Min(1f, wellH / 46f), null, "well");
            well.raycastTarget = false;
            dummy.transform.SetAsLastSibling();
            if (subIcon != null)
            {
                float startX = -contentW * 0.5f;
                Icon(body, subIcon, icSz, new Vector2(startX + icSz * 0.5f, wellY + 1f), "costIcon");
                dummy.rectTransform.anchoredPosition = new Vector2(startX + icSz + 8f + tw * 0.5f, wellY + 1f);
            }
            else
            {
                dummy.rectTransform.anchoredPosition = new Vector2(0, wellY + 1f);
            }

            var hit = Box(holder, size, Vector2.zero, new Color(0, 0, 0, 0), Art.White, "hit");
            Tap(hit, onClick, body, true, sink);
            return holder;
        }

        public static void SetBtnText(RectTransform btn, string s)
        {
            var t = btn.Find("body/text") ?? btn.Find("text");
            t.GetComponent<Text>().text = s;
        }

        /// <summary>弹窗面板：双层立体石青蓝厚框 + 温润奶油白内页纸面（panel.png 自带立体唇边与柔和环境投影）。</summary>
        public static RectTransform Panel(Transform parent, Vector2 size, Vector2 pos, string name = "panel")
        {
            var holder = Rect(parent, name);
            holder.sizeDelta = size;
            holder.anchoredPosition = pos;
            var frame = Skin(holder, "panel", size + new Vector2(44, 48), new Vector2(0, -2), 1f, null, "frame");
            frame.raycastTarget = true;
            return holder;
        }

        /// <summary>双折耳立体卷轴标题：支持石青霁蓝（默认）、皇室暖金（传入橙金调）、冷灰蓝（失败等）。</summary>
        public static RectTransform Ribbon(Transform parent, string s, Vector2 pos, float width = 520, Color? color = null)
        {
            bool grey = false, warm = false;
            if (color.HasValue)
            {
                Color.RGBToHSV(color.Value, out float h, out float sat, out _);
                grey = sat < 0.25f;
                warm = !grey && h >= 0.04f && h <= 0.17f;
            }
            string skin = grey ? "banner_grey" : warm ? "banner_warm" : "banner";
            Color stroke = grey ? Pal.Hex("2C3A48") : warm ? Pal.Hex("5E3408") : Pal.Hex("1D3C56");
            Color botCol = grey ? Pal.Hex("E8F0F8") : warm ? Pal.Hex("FFEFA8") : Pal.Hex("E6F6FF");

            float rw = Mathf.Clamp(width, 380f, 640f);
            var holder = Rect(parent, "ribbon");
            holder.anchoredPosition = pos;
            holder.sizeDelta = new Vector2(rw, 118);
            Skin(holder, skin, new Vector2(rw + 136f, 128f), new Vector2(0, -4f), -1f, null, "face");
            int fsz = s != null && s.Length >= 8 ? 42 : s != null && s.Length >= 6 ? 46 : 50;
            GradOutlined(holder, s, fsz, Color.white, botCol, new Vector2(0, 7f), new Vector2(rw - 24f, 88f), stroke, 3.0f);
            return holder;
        }

        /// <summary>说明卡片：标题居中，细线隔开，正文居中。数字用橙色突出。全游戏的短说明都走这里。</summary>
        public static void Hint(Transform anchor, string text) => Hint(anchor, null, text);

        public static void Hint(Transform anchor, string title, string body)
        {
            var old = Root.Find("hint");
            if (old) UnityEngine.Object.DestroyImmediate(old.gameObject);
            var root = Rect(Root, "hint");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var hit = Fill(root, new Color(0, 0, 0, 0.001f), true, "hit");
            var keep = root;
            Tap(hit.GetComponent<Image>(), () => { if (keep) UnityEngine.Object.Destroy(keep.gameObject); }, null, false);

            bool titled = !string.IsNullOrEmpty(title);
            string shown = TintNums(body ?? "");
            float widest = 40f;
            if (titled)
            {
                var tp = Label(root, title, 40, Color.white, Vector2.zero, new Vector2(640, 56), TextAnchor.MiddleCenter, Fonts.Heavy, "probe");
                Canvas.ForceUpdateCanvases();
                widest = Mathf.Max(widest, tp.preferredWidth);
                UnityEngine.Object.DestroyImmediate(tp.gameObject);
            }
            foreach (var line in shown.Split('\n'))
            {
                var lp = Label(root, line, 32, Color.white, Vector2.zero, new Vector2(640, 48), TextAnchor.MiddleCenter, Fonts.Heavy, "probe");
                Canvas.ForceUpdateCanvases();
                widest = Mathf.Max(widest, lp.preferredWidth);
                UnityEngine.Object.DestroyImmediate(lp.gameObject);
            }
            float tw = Mathf.Clamp(widest + 128f, 520f, 680f);
            float inner = tw - 88f;
            var probe = Label(root, shown, 32, Color.white, Vector2.zero, new Vector2(inner, 220), TextAnchor.MiddleCenter, Fonts.Heavy, "probe");
            probe.lineSpacing = 1.15f;
            Canvas.ForceUpdateCanvases();
            float bodyH = Mathf.Max(48f, probe.preferredHeight);
            UnityEngine.Object.DestroyImmediate(probe.gameObject);

            const float padT = 36f, padB = 42f, titleH = 54f;
            float th = padT + (titled ? titleH + 18f + 2f + 26f : 0f) + bodyH + padB;

            var layer = (RectTransform)Root;
            Vector2 at = layer.InverseTransformPoint(anchor.position);
            float limit = layer.rect.width * 0.5f - 24f;
            float cx = Mathf.Clamp(at.x, -limit + tw * 0.5f, limit - tw * 0.5f);
            float floor = -layer.rect.height * 0.5f + 36f;
            const float gapY = 16f;
            bool flip = at.y - gapY - th < floor;
            float cy = flip ? at.y + gapY + th * 0.5f : at.y - gapY - th * 0.5f;

            var card = Rect(root, "card");
            card.sizeDelta = new Vector2(tw, th);
            card.anchoredPosition = new Vector2(cx, cy);
            Box(card, new Vector2(tw - 8f, th - 8f), new Vector2(0, -8f), new Color(0.02f, 0.05f, 0.1f, 0.28f), Art.Rounded, "shadow");
            Skin(card, "hint", new Vector2(tw, th), Vector2.zero, 1f, null, "face");
            float bodyTop = th * 0.5f - padT;
            if (titled)
            {
                float titleY = th * 0.5f - padT - titleH * 0.5f;
                Label(card, title, 40, Color.white, new Vector2(0, titleY), new Vector2(inner, titleH), TextAnchor.MiddleCenter, Fonts.Heavy, "title");
                float ruleY = titleY - titleH * 0.5f - 16f;
                var rule = Box(card, new Vector2(tw - 64f, 2f), new Vector2(0, ruleY), Pal.Hex("D7E6F4"), Art.White, "rule");
                rule.color = Pal.Hex("D7E6F4").A(0.72f);
                bodyTop = ruleY - 26f;
            }
            var bodyText = Label(card, shown, 32, Pal.Hex("E7F1FA"), new Vector2(0, bodyTop - bodyH * 0.5f), new Vector2(inner, bodyH),
                TextAnchor.MiddleCenter, Fonts.Heavy, "text");
            bodyText.lineSpacing = 1.15f;
            root.SetAsLastSibling();
            card.localScale = Vector3.one * 0.94f;
            var c = card;
            Tween.Run(c, 0.16f, k => { if (c) c.localScale = Vector3.one * Mathf.Lerp(0.94f, 1f, Tween.OutBack(k)); });
        }

        /// <summary>单行排版宽度，用来决定说明卡要多宽才刚好盛下这段字。</summary>
        static float TextWidth(Transform host, string s, int size, Font font)
        {
            if (string.IsNullOrEmpty(s)) return 0f;
            var t = Label(host, s, size, Color.white, Vector2.zero, new Vector2(4000f, 800f), TextAnchor.MiddleLeft, font, "probe");
            t.horizontalOverflow = HorizontalWrapMode.Overflow;
            Canvas.ForceUpdateCanvases();
            float w = t.preferredWidth;
            UnityEngine.Object.DestroyImmediate(t.gameObject);
            return w;
        }

        /// <summary>技能说明：屏幕居中。正文按整段排，顶到卡片内宽才换行；短句把卡片收窄，不留大块空白。</summary>
        public static void SkillCard(Transform anchor, string icon, int rarity, bool locked, string name, string tag, Color tagColor, string cd, string body, string foot)
        {
            var old = Root.Find("hint");
            if (old) UnityEngine.Object.DestroyImmediate(old.gameObject);
            var root = Rect(Root, "hint");
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;
            var hit = Fill(root, new Color(0, 0, 0, 0.001f), true, "hit");
            var keep = root;
            Tap(hit.GetComponent<Image>(), () => { if (keep) UnityEngine.Object.Destroy(keep.gameObject); }, null, false);

            const float maxW = 760f;
            const float minW = 420f;
            const float padX = 36f;
            const float iconSize = 108f;
            const float headH = 118f;
            const float padT = 22f, padB = 22f, gap = 14f, footH = 36f;
            const int bodySize = 28;
            string shown = TintNums((body ?? "").Replace("\r", ""));
            bool hasCd = !string.IsNullOrEmpty(cd);
            bool footed = !string.IsNullOrEmpty(foot);
            bool hasIcon = !string.IsNullOrEmpty(icon);
            string cdPlain = hasCd ? "冷却：" + cd : "";

            float nameRaw = TextWidth(root, name ?? "", 32, Fonts.Heavy);
            float cdRaw = TextWidth(root, cdPlain, 22, Fonts.Heavy);
            float bodyRaw = TextWidth(root, shown, bodySize, Fonts.Bold);
            float headerNeed = padX + (hasIcon ? iconSize + 18f : 0f) + nameRaw + 24f + (hasCd ? cdRaw + 28f : 0f) + padX;
            float cap = Mathf.Min(maxW, Mathf.Max(minW, ((RectTransform)Root).rect.width - 48f));
            float tw = Mathf.Clamp(Mathf.Max(headerNeed, bodyRaw + padX * 2f + 16f), minW, cap);
            float inner = tw - padX * 2f;

            var probe = Label(root, shown, bodySize, Color.white, Vector2.zero, new Vector2(inner, 640f), TextAnchor.UpperLeft, Fonts.Bold, "probe");
            probe.lineSpacing = 1.15f;
            Canvas.ForceUpdateCanvases();
            float bodyH = Mathf.Max(44f, probe.preferredHeight);
            UnityEngine.Object.DestroyImmediate(probe.gameObject);

            float th = padT + headH + gap + bodyH + (footed ? gap + footH : 0f) + padB;
            var card = Rect(root, "card");
            card.sizeDelta = new Vector2(tw, th);
            card.anchoredPosition = Vector2.zero;
            Box(card, new Vector2(tw - 6f, th - 6f), new Vector2(0, -6f), new Color(0.02f, 0.04f, 0.08f, 0.35f), Art.Rounded, "shadow");
            Skin(card, "dark", new Vector2(tw, th), Vector2.zero, 1f, null, "face");

            float headerY = th * 0.5f - padT - headH * 0.5f;
            float iconX = -tw * 0.5f + padX + iconSize * 0.5f;
            if (hasIcon)
                MetaFx.Hex(card, icon, iconSize, new Vector2(iconX, headerY), locked, rarity);

            float textLeft = hasIcon ? iconX + iconSize * 0.5f + 16f : -tw * 0.5f + padX;
            float textRight = tw * 0.5f - padX - (hasCd ? cdRaw + 16f : 0f);
            float nameW = Mathf.Max(96f, textRight - textLeft);
            Label(card, name ?? "", 32, Color.white, new Vector2(textLeft + nameW * 0.5f, headerY + 24f), new Vector2(nameW, 44),
                TextAnchor.MiddleLeft, Fonts.Heavy, "name");
            if (!string.IsNullOrEmpty(tag))
            {
                float tagW = Mathf.Max(72f, 22f * tag.Length + 28f);
                var pill = Box(card, new Vector2(tagW, 32f), new Vector2(textLeft + tagW * 0.5f, headerY - 22f), tagColor, Art.Pill, "tag");
                pill.raycastTarget = false;
                var tagText = Label(pill.transform, tag, 18, Color.white, Vector2.zero, new Vector2(tagW, 32f), TextAnchor.MiddleCenter, Fonts.Heavy, "tagText");
                tagText.raycastTarget = false;
            }
            if (hasCd)
            {
                var cdText = Label(card, "冷却：<color=#FF9A2E>" + cd + "</color>", 22, Pal.Hex("C5D4E4"),
                    new Vector2(tw * 0.5f - padX - cdRaw * 0.5f, headerY + 22f), new Vector2(cdRaw + 8f, 36f), TextAnchor.MiddleRight, Fonts.Heavy, "cd");
                cdText.raycastTarget = false;
            }

            float bodyTop = headerY - headH * 0.5f - gap;
            var bodyText = Label(card, shown, bodySize, Pal.Hex("E7F1FA"), new Vector2(0, bodyTop - bodyH * 0.5f), new Vector2(inner, bodyH),
                TextAnchor.UpperLeft, Fonts.Bold, "text");
            bodyText.lineSpacing = 1.15f;
            if (footed)
            {
                float footY = bodyTop - bodyH - gap - footH * 0.5f;
                Label(card, foot, 20, Pal.Hex("A9BDD0"), new Vector2(0, footY), new Vector2(inner, footH),
                    TextAnchor.MiddleCenter, Fonts.Heavy, "foot");
            }

            root.SetAsLastSibling();
            card.localScale = Vector3.one * 0.94f;
            var c = card;
            Tween.Run(c, 0.16f, k => { if (c) c.localScale = Vector3.one * Mathf.Lerp(0.94f, 1f, Tween.OutBack(k)); });
        }

        static string TintNums(string s) =>
            System.Text.RegularExpressions.Regex.Replace(s ?? "", @"[+\-]?\d+(?:\.\d+)?%?", m => "<color=#FF9A2E>" + m.Value + "</color>");

        /// <summary>可升级角标原地上下轻轻呼吸，所有升级箭头共用这一下。</summary>
        public static void Breathe(Graphic g, float amp = 5f)
        {
            var rt = g.rectTransform;
            var origin = rt.anchoredPosition;
            Tween.Run(g, 999f, k => rt.anchoredPosition = origin + new Vector2(0f, amp * Mathf.Sin(k * 999f * 4.2f)));
        }

        public static void Toast(string s, float y = 0, Color? bg = null)
        {
            int len = Mathf.Max(6, s.Length);
            var size = new Vector2(Mathf.Min(980, len * 44 + 120), 100);
            Image plate;
            Color ink;
            if (bg.HasValue)
            {
                plate = Box(Root, size, new Vector2(0, y), bg.Value, Art.Pill, "toast");
                ink = Pal.Hex("543006");
            }
            else
            {
                plate = Skin(Root, "pill", size, new Vector2(0, y), -1f, null, "toast");
                ink = Pal.Cream;
            }
            Label(plate.transform, s, 42, ink, Vector2.zero, new Vector2(960, 96));
            plate.transform.SetAsLastSibling();
            Tween.Pop(plate.transform, 0.22f);
            Tween.Run(plate, 1.5f, k => { }, () => UnityEngine.Object.Destroy(plate.gameObject));
        }

        public static bool PointerOverUi()
        {
            var es = EventSystem.current;
            if (es == null) return false;
            var data = new PointerEventData(es) { position = Input.mousePosition };
            var hits = new List<RaycastResult>();
            es.RaycastAll(data, hits);
            return hits.Count > 0;
        }

        public static string Num(float v)
        {
            if (v >= 1000000) return (v / 1000000f).ToString(v >= 10000000 ? "0" : "0.#") + "M";
            if (v >= 1000) return (v / 1000f).ToString(v >= 10000 ? "0" : "0.#") + "K";
            return ((int)v).ToString();
        }
    }

    /// <summary>极简补间：不受 timeScale 影响，宿主销毁即停。</summary>
    public sealed class Tween : MonoBehaviour
    {
        sealed class Job
        {
            public Action<float> Step;
            public float T, Dur, Delay;
            public Action Done;
            public UnityEngine.Object Owner;
        }

        static Tween _i;
        readonly List<Job> _jobs = new List<Job>();
        readonly List<Job> _add = new List<Job>();

        public static void Init(GameObject host) { if (_i == null) _i = host.AddComponent<Tween>(); }

        public static void Run(UnityEngine.Object owner, float dur, Action<float> step, Action done = null, float delay = 0)
            => _i._add.Add(new Job { Owner = owner, Dur = Mathf.Max(0.0001f, dur), Delay = delay, Done = done, Step = step });

        void Update()
        {
            if (_add.Count > 0) { _jobs.AddRange(_add); _add.Clear(); }
            float dt = Time.unscaledDeltaTime;
            for (int i = _jobs.Count - 1; i >= 0; i--)
            {
                var j = _jobs[i];
                if (j.Owner == null) { _jobs.RemoveAt(i); continue; }
                if (j.Delay > 0) { j.Delay -= dt; continue; }
                j.T += dt;
                float k = Mathf.Clamp01(j.T / j.Dur);
                try
                {
                    j.Step(k);
                }
                catch (Exception e)
                {
                    _jobs.RemoveAt(i);
                    Debug.LogException(e);
                    continue;
                }
                if (k < 1f) continue;
                _jobs.RemoveAt(i);
                try { j.Done?.Invoke(); }
                catch (Exception e) { Debug.LogException(e); }
            }
        }

        public static float OutBack(float k) { const float s = 1.9f; k -= 1; return k * k * ((s + 1) * k + s) + 1; }
        public static float OutCubic(float k) { k -= 1; return k * k * k + 1; }
        public static float InCubic(float k) => k * k * k;

        public static void Pop(Transform t, float dur = 0.3f, float delay = 0)
        {
            var target = t.localScale == Vector3.zero ? Vector3.one : t.localScale;
            t.localScale = Vector3.zero;
            Run(t, dur, k => t.localScale = target * OutBack(k), null, delay);
        }

        static readonly HashSet<Transform> Punching = new HashSet<Transform>();

        public static bool IsPunching(Transform t) => t != null && Punching.Contains(t);

        /// <summary>同一个节点正在弹时不叠加，免得基准缩放被带偏。</summary>
        public static void Punch(Transform t, float dur = 0.2f, float amount = 0.15f)
        {
            if (t == null || !Punching.Add(t)) return;
            var baseScale = t.localScale;
            Run(t, dur, k => t.localScale = baseScale * (1f + Mathf.Sin(k * Mathf.PI) * amount), () =>
            {
                Punching.Remove(t);
                if (t) t.localScale = baseScale;
            });
        }

        public static void Fade(CanvasGroup g, float from, float to, float dur, Action done = null, float delay = 0)
        {
            g.alpha = from;
            Run(g, dur, k => g.alpha = Mathf.Lerp(from, to, k), done, delay);
        }
    }

    /// <summary>按下时盖子下沉、颜色变暗，松手弹回。点在热区上，移动的是另一层，手指不会因为按钮挪走而丢失。</summary>
    public sealed class PressFx : MonoBehaviour, IPointerDownHandler, IPointerUpHandler, IPointerExitHandler, IPointerEnterHandler
    {
        struct Tint { public Graphic G; public Color C; }

        Transform _t;
        RectTransform _rt;
        float _sink;
        Vector3 _scale;
        Vector2 _pos;
        readonly List<Tint> _tints = new List<Tint>();
        bool _have, _down, _over, _sunk, _restLocked;
        int _gen;

        public void Setup(Transform target, float sink)
        {
            _t = target;
            _rt = target as RectTransform;
            _sink = sink;
        }

        bool TooBig => _rt != null && _rt.rect.width > 800f && _rt.rect.height > 800f;

        public void OnPointerDown(PointerEventData e)
        {
            _down = _over = true;
            _gen++;
            if (TooBig || _t == null) return;
            if (!_sunk)
            {
                _have = true;
                // 静息尺寸只在第一次按下时记下。召唤成功还会再弹一下按钮，若每次都重采样，会把按下时的缩小记成新基准，越点越小。
                if (!_restLocked)
                {
                    _scale = _t.localScale.sqrMagnitude < 0.0001f ? Vector3.one : _t.localScale;
                    if (_rt != null) _pos = _rt.anchoredPosition;
                    _restLocked = true;
                }
                _tints.Clear();
                foreach (var g in _t.GetComponentsInChildren<Graphic>(false))
                {
                    if (g.color.a < 0.2f) continue;
                    var n = g.gameObject.name;
                    if (n == "glow" || n == "hit" || n == "lip" || n == "lipRim") continue;
                    _tints.Add(new Tint { G = g, C = g.color });
                }
            }
            Apply(true);
        }

        public void OnPointerEnter(PointerEventData e)
        {
            _over = true;
            if (_down) Apply(true);
        }

        public void OnPointerExit(PointerEventData e)
        {
            _over = false;
            if (_sunk) Release(false);
        }

        public void OnPointerUp(PointerEventData e)
        {
            bool back = _down && _over;
            _down = false;
            if (_sunk) Release(back);
        }

        void LateUpdate()
        {
            if (!_down) return;
            if (Input.GetMouseButton(0) || Input.touchCount > 0) return;
            _down = false;
            if (_sunk) Release(false);
        }

        void OnDisable()
        {
            _down = false;
            if (_sunk && _t != null) Restore();
            _sunk = false;
        }

        void Apply(bool sunk)
        {
            if (_t == null || TooBig || !_have) return;
            _sunk = sunk;
            float k = sunk ? (_sink > 0f ? 0.985f : 0.93f) : 1f;
            _t.localScale = new Vector3(_scale.x * k, _scale.y * k, _scale.z);
            if (_rt != null && _sink > 0f)
                _rt.anchoredPosition = _pos + (sunk ? new Vector2(0f, -_sink) : Vector2.zero);
            foreach (var tn in _tints)
                if (tn.G) tn.G.color = sunk ? tn.C * 0.82f : tn.C;
        }

        void Release(bool spring)
        {
            _sunk = false;
            if (_t == null || !spring)
            {
                Restore();
                return;
            }
            int gen = _gen;
            var fromS = _t.localScale;
            var fromP = _rt != null ? _rt.anchoredPosition : Vector2.zero;
            foreach (var tn in _tints)
                if (tn.G) tn.G.color = tn.C;
            Tween.Run(_t, 0.14f, k =>
            {
                if (gen != _gen || _t == null) return;
                float e = Tween.OutBack(Mathf.Clamp01(k));
                _t.localScale = Vector3.LerpUnclamped(fromS, _scale, e);
                if (_rt != null) _rt.anchoredPosition = Vector2.LerpUnclamped(fromP, _pos, e);
            }, () =>
            {
                if (gen != _gen || _t == null) return;
                Restore();
            });
        }

        void Restore()
        {
            if (_t == null || !_have) return;
            _t.localScale = _scale;
            if (_rt != null) _rt.anchoredPosition = _pos;
            foreach (var tn in _tints)
                if (tn.G) tn.G.color = tn.C;
            _sunk = false;
        }
    }

    /// <summary>
    /// 八向等距圆滑描边 + 微底边立体感：
    /// 彻底解决 Unity 原生四角对角线 Outline 在横竖笔画处拉出双线重影、导致小字“糊成一团”的问题。
    /// </summary>
    public sealed class CrispStroke : BaseMeshEffect
    {
        public Color Color = new Color(0.08f, 0.14f, 0.22f, 1f);
        public float Radius = 1.4f;
        /// <summary>同色扩边，用来加粗。富文本每个字保持自己的颜色。</summary>
        public bool KeepColor;
        public bool UseGradient;
        public Color TopColor = Color.white;
        public Color BottomColor = new Color(1f, 0.78f, 0.22f, 1f);

        static readonly Vector2[] Dirs8 =
        {
            new Vector2(1f, 0f), new Vector2(-1f, 0f), new Vector2(0f, 1f), new Vector2(0f, -1f),
            new Vector2(0.7071068f, 0.7071068f), new Vector2(-0.7071068f, 0.7071068f),
            new Vector2(0.7071068f, -0.7071068f), new Vector2(-0.7071068f, -0.7071068f),
        };

        static readonly List<UIVertex> Src = new List<UIVertex>(512);
        static readonly List<UIVertex> Dst = new List<UIVertex>(4096);

        public override void ModifyMesh(VertexHelper vh)
        {
            if (!IsActive() || Radius <= 0.05f) return;
            Src.Clear();
            vh.GetUIVertexStream(Src);
            int n = Src.Count;
            if (n == 0) return;

            int dirs = n > 3600 ? 4 : 8;
            Dst.Clear();
            int need = n * (dirs + 2);
            if (Dst.Capacity < need) Dst.Capacity = need;

            Color32 c32 = Color;
            // 1. 紧致微下沉底边（增强立体感而不拖泥带水）
            AppendOffset(Src, n, c32, 0f, -Radius * 1.05f, KeepColor);
            // 2. 八向圆周描边
            for (int d = 0; d < dirs; d++)
            {
                var dir = Dirs8[d];
                AppendOffset(Src, n, c32, dir.x * Radius, dir.y * Radius, KeepColor);
            }
            // 3. 最上层原字面（可选逐字形上下双色金属高光渐变）
            if (UseGradient)
            {
                for (int i = 0; i + 5 < n; i += 6)
                {
                    float minY = Src[i].position.y, maxY = minY;
                    for (int k = 1; k < 6; k++)
                    {
                        float py = Src[i + k].position.y;
                        if (py < minY) minY = py;
                        if (py > maxY) maxY = py;
                    }
                    float span = Mathf.Max(0.01f, maxY - minY);
                    for (int k = 0; k < 6; k++)
                    {
                        var v = Src[i + k];
                        float t = Mathf.Clamp01((v.position.y - minY) / span);
                        Color gc = Color.Lerp(BottomColor, TopColor, t);
                        gc.a *= v.color.a / 255f;
                        v.color = (Color32)gc;
                        Dst.Add(v);
                    }
                }
            }
            else
            {
                for (int i = 0; i < n; i++) Dst.Add(Src[i]);
            }

            vh.Clear();
            vh.AddUIVertexTriangleStream(Dst);
        }

        static void AppendOffset(List<UIVertex> src, int count, Color32 col, float dx, float dy, bool keepColor)
        {
            for (int i = 0; i < count; i++)
            {
                var v = src[i];
                var p = v.position;
                p.x += dx;
                p.y += dy;
                v.position = p;
                if (!keepColor)
                {
                    var c = col;
                    c.a = (byte)((c.a * v.color.a) / 255);
                    v.color = c;
                }
                Dst.Add(v);
            }
        }
    }
}
