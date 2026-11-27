using UnityEditor;

namespace Liangshan.EditorTools
{
    /// <summary>
    /// Resources/Art（首包）和 ArtCdn（按需图包）下的图一律按 Sprite 导入：
    /// 不缩放到 2 的幂，1 个世界单位 = 图片长边。
    /// </summary>
    public sealed class ArtImporter : AssetPostprocessor
    {
        public override uint GetVersion() => 8;

        void OnPreprocessAudio()
        {
            if (!assetPath.Contains("/Resources/Sfx/")) return;
            var ai = (AudioImporter)assetImporter;
            ai.forceToMono = true;
            ai.ambisonic = false;
            ai.loadInBackground = false;
            var so = new SerializedObject(ai);
            var norm = so.FindProperty("m_Normalize");
            if (norm != null) norm.boolValue = false;
            var td = so.FindProperty("m_3D");
            if (td != null) td.boolValue = false;
            so.ApplyModifiedPropertiesWithoutUndo();

            var def = ai.defaultSampleSettings;
            def.loadType = UnityEngine.AudioClipLoadType.DecompressOnLoad;
            def.compressionFormat = UnityEngine.AudioCompressionFormat.Vorbis;
            def.quality = 0.85f;
            def.sampleRateSetting = AudioSampleRateSetting.PreserveSampleRate;
            def.preloadAudioData = true;
            ai.defaultSampleSettings = def;
        }

        void OnPreprocessTexture()
        {
            if (!assetPath.Contains("/Resources/Art/") && !assetPath.StartsWith(ArtPacks.Src + "/")) return;
            var ti = (TextureImporter)assetImporter;
            ti.textureType = TextureImporterType.Sprite;
            ti.spriteImportMode = SpriteImportMode.Single;
            ti.mipmapEnabled = false;
            ti.alphaIsTransparency = true;
            ti.npotScale = TextureImporterNPOTScale.None;
            ti.textureCompression = TextureImporterCompression.Uncompressed;
            ti.wrapMode = assetPath.EndsWith("fx_noise_tile.png") || assetPath.EndsWith("fx_chain_rope.png")
                ? UnityEngine.TextureWrapMode.Repeat
                : UnityEngine.TextureWrapMode.Clamp;
            ti.maxTextureSize = 2048;
            var s = new TextureImporterSettings();
            ti.ReadTextureSettings(s);
            s.spriteMeshType = UnityEngine.SpriteMeshType.FullRect;
            ti.SetTextureSettings(s);
            ti.GetSourceTextureWidthAndHeight(out int w, out int h);
            if (w > 0) ti.spritePixelsPerUnit = System.Math.Max(w, h);
            ti.SetPlatformTextureSettings(MiniGame());
        }

        /// <summary>
        /// 微信：全部 ASTC 4x4（每像素 8 bit，ASTC 里最清楚的一档）、按原尺寸、编码器最高质量。
        /// 不为包体或显存降分辨率、加大块：大图走 CDN 图包按需加载，一局只装这一局要用的角色。
        /// </summary>
        static TextureImporterPlatformSettings MiniGame() => new TextureImporterPlatformSettings
        {
            name = "WeixinMiniGame",
            overridden = true,
            maxTextureSize = 2048,
            format = TextureImporterFormat.ASTC_4x4,
            textureCompression = TextureImporterCompression.CompressedHQ,
            compressionQuality = 100,
        };
    }
}
