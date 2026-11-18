using UnityEngine;

namespace Liangshan
{
    /// <summary>角色形变材质（SpriteBend）：脚底不动，胯部以上起伏、侧倾、压扁，左右腿可分别抬起。参数逐个渲染器走 PropertyBlock。</summary>
    public static class Bend
    {
        public readonly struct Info
        {
            public readonly float Foot, Body, LegCx, LegTop;
            public Info(float foot, float body, float legCx, float legTop) { Foot = foot; Body = body; LegCx = legCx; LegTop = legTop; }
        }

        static Material _mat, _add;
        static MaterialPropertyBlock _mpb;
        static readonly int FootId = Shader.PropertyToID("_Foot");
        static readonly int BodyId = Shader.PropertyToID("_Body");
        static readonly int BobId = Shader.PropertyToID("_Bob");
        static readonly int ShearId = Shader.PropertyToID("_Shear");
        static readonly int SxId = Shader.PropertyToID("_Sx");
        static readonly int SyId = Shader.PropertyToID("_Sy");
        static readonly int LegLId = Shader.PropertyToID("_LegL");
        static readonly int LegRId = Shader.PropertyToID("_LegR");
        static readonly int LegTopId = Shader.PropertyToID("_LegTop");
        static readonly int LegCxId = Shader.PropertyToID("_LegCx");
        static readonly int FlashId = Shader.PropertyToID("_Flash");
        static readonly int FlashColorId = Shader.PropertyToID("_FlashColor");

        static Material Make(bool add)
        {
            var m = new Material(Resources.Load<Shader>("Shaders/SpriteBend"));
            m.SetFloat("_SrcBlend", (float)UnityEngine.Rendering.BlendMode.One);
            m.SetFloat("_DstBlend", (float)(add ? UnityEngine.Rendering.BlendMode.One : UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha));
            return m;
        }

        public static SpriteRenderer Use(SpriteRenderer sr, bool add = false)
        {
            if (add) sr.sharedMaterial = _add ? _add : (_add = Make(true));
            else sr.sharedMaterial = _mat ? _mat : (_mat = Make(false));
            return sr;
        }

        /// <summary>
        /// bob：胯部以上抬起多少（占身体高）；shear：头顶横移多少（占身体高）；sx/sy：以脚底为锚的缩放；
        /// legL/legR：左右靴子抬起多少（占身体高，按贴图左右算）；flash：受击染色强度 0..1，按 flashColor 乘到原图上。
        /// </summary>
        public static void Set(SpriteRenderer sr, in Info m, float bob, float shear, float sx, float sy,
            float legL = 0f, float legR = 0f, float flash = 0f, Color? flashColor = null)
        {
            _mpb ??= new MaterialPropertyBlock();
            sr.GetPropertyBlock(_mpb);
            _mpb.SetFloat(FootId, m.Foot);
            _mpb.SetFloat(BodyId, m.Body);
            _mpb.SetFloat(BobId, bob * m.Body);
            _mpb.SetFloat(ShearId, shear * m.Body);
            _mpb.SetFloat(SxId, sx);
            _mpb.SetFloat(SyId, sy);
            _mpb.SetFloat(LegLId, legL * m.Body);
            _mpb.SetFloat(LegRId, legR * m.Body);
            _mpb.SetFloat(LegTopId, m.LegTop);
            _mpb.SetFloat(LegCxId, m.LegCx);
            _mpb.SetFloat(FlashId, flash);
            _mpb.SetColor(FlashColorId, flashColor ?? Color.white);
            sr.SetPropertyBlock(_mpb);
        }

        /// <summary>该角色图在画布里的脚底、身体、两腿分界和胯高；没有逐帧图的按整张图算。</summary>
        public static Info Meta(string art)
        {
            if (Art.Animated(art) && AnimMeta.Info.TryGetValue(art, out var m)) return new Info(m.Foot, m.Body, m.LegCx, m.LegTop);
            return new Info(0f, 1f, 0.5f, 0.22f);
        }
    }
}
