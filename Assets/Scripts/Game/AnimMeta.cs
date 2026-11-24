// 由 tools/anim_frames.py 生成，勿手改。
using System.Collections.Generic;

namespace Liangshan
{
    public static class AnimMeta
    {
        /// <summary>
        /// 角色画布中身体（第 0 帧脚底到头顶）占画布边长的比例、脚底离底边的比例、
        /// 两腿分界线的 x（画布比例）、胯部高度（占身体高）。
        /// </summary>
        public static readonly Dictionary<string, (float Body, float Foot, float LegCx, float LegTop)> Info =
            new Dictionary<string, (float, float, float, float)>
        {
            ["en_soldier"] = (0.8475f, 0.0203f, 0.5078f, 0.1600f),
            ["en_shield"] = (0.8407f, 0.0203f, 0.4326f, 0.1600f),
            ["en_cavalry"] = (0.8434f, 0.0181f, 0.5000f, 0.2200f),
            ["en_crossbow"] = (0.8487f, 0.0178f, 0.5059f, 0.1600f),
            ["en_elite"] = (0.7439f, 0.0123f, 0.5947f, 0.1600f),
            ["en_porter"] = (0.8258f, 0.0194f, 0.5000f, 0.2200f),
            ["en_boss"] = (0.7221f, 0.0137f, 0.5000f, 0.2200f),
            ["hero_huarong"] = (0.6397f, 0.0223f, 0.5000f, 0.2200f),
            ["hero_lingzhen"] = (0.6398f, 0.0179f, 0.5835f, 0.2794f),
            ["hero_gongsun"] = (0.5914f, 0.0203f, 0.3896f, 0.1825f),
            ["hero_wusong"] = (0.6398f, 0.0179f, 0.4834f, 0.3200f),
            ["hero_linchong"] = (0.5444f, 0.0229f, 0.5000f, 0.2200f),
            ["hero_luzhishen"] = (0.6396f, 0.0191f, 0.4170f, 0.3200f),
            ["hero_zhangqing"] = (0.6404f, 0.0143f, 0.5000f, 0.2200f),
            ["hero_wuyong"] = (0.6407f, 0.0189f, 0.5000f, 0.2200f),
            ["en_hawk"] = (0.7677f, 0.0194f, 0.5000f, 0.2200f),
            ["en_armored"] = (0.7835f, 0.0183f, 0.4912f, 0.1600f),
            ["en_firebomb"] = (0.6163f, 0.0149f, 0.5762f, 0.1600f),
            ["en_chainhorse"] = (0.8022f, 0.0167f, 0.5000f, 0.2200f),
            ["en_luan"] = (0.6031f, 0.0132f, 0.5592f, 0.2833f),
            ["en_shiwen"] = (0.5694f, 0.0119f, 0.5000f, 0.2200f),
            ["en_huyan"] = (0.8605f, 0.0158f, 0.5000f, 0.2200f),
            ["en_gaoqiu"] = (0.8592f, 0.0121f, 0.5000f, 0.2200f),
            ["hero_lujunyi"] = (0.6093f, 0.0186f, 0.4092f, 0.3200f),
            ["hero_guansheng"] = (0.5896f, 0.0231f, 0.5000f, 0.2200f),
            ["hero_yanqing"] = (0.6396f, 0.0120f, 0.5000f, 0.2200f),
            ["hero_fanrui"] = (0.6361f, 0.0237f, 0.5000f, 0.2200f),
            ["hero_husanniang"] = (0.6397f, 0.0209f, 0.5000f, 0.2200f),
            ["hero_andaoquan"] = (0.5551f, 0.0304f, 0.5000f, 0.2200f),
            ["hero_daizong"] = (0.6260f, 0.0212f, 0.5000f, 0.2200f),
            ["hero_qinming"] = (0.5102f, 0.0181f, 0.5000f, 0.2200f),
            ["hero_likui"] = (0.6407f, 0.0201f, 0.5156f, 0.1600f),
            ["hero_qiaodaoqing"] = (0.6397f, 0.0209f, 0.5000f, 0.2200f),
            ["hero_zhuwu"] = (0.6401f, 0.0193f, 0.5000f, 0.2200f),
            ["hero_xuning"] = (0.4963f, 0.0294f, 0.4160f, 0.3200f),
            ["hero_shantinggui"] = (0.6406f, 0.0208f, 0.5000f, 0.2200f),
            ["hero_weidingguo"] = (0.6392f, 0.0206f, 0.5000f, 0.2200f),
            ["hero_shixiu"] = (0.6395f, 0.0172f, 0.5000f, 0.2200f),
            ["hero_xiezhen"] = (0.6400f, 0.0188f, 0.5635f, 0.3200f),
            ["hero_xiebao"] = (0.6244f, 0.0195f, 0.4932f, 0.1600f),
            ["hero_maling"] = (0.6402f, 0.0177f, 0.5000f, 0.2200f),
            ["hero_kongliang"] = (0.6399f, 0.0222f, 0.5000f, 0.2200f),
            ["hero_tanglong"] = (0.6408f, 0.0194f, 0.5000f, 0.2200f),
            ["hero_sunerniang"] = (0.6395f, 0.0163f, 0.5000f, 0.2200f),
            ["hero_ruanxiaoqi"] = (0.6406f, 0.0196f, 0.5781f, 0.3099f),
            ["hero_shiqian"] = (0.6407f, 0.0240f, 0.5356f, 0.2756f),
            ["hero_jiangjing"] = (0.6397f, 0.0185f, 0.5000f, 0.2200f),
            ["en_diver"] = (0.6950f, 0.0176f, 0.5518f, 0.1600f),
            ["en_farmer"] = (0.8445f, 0.0183f, 0.4961f, 0.1600f),
            ["en_hound"] = (0.7428f, 0.0173f, 0.4043f, 0.1600f),
            ["en_rattan"] = (0.7184f, 0.0172f, 0.4756f, 0.1600f),
            ["en_taoist"] = (0.6911f, 0.0191f, 0.5015f, 0.1600f),
            ["en_berserker"] = (0.8436f, 0.0184f, 0.5479f, 0.2983f),
            ["en_catapult"] = (0.6879f, 0.0173f, 0.5410f, 0.1600f),
            ["en_lantern"] = (0.8388f, 0.0220f, 0.5000f, 0.2200f),
            ["en_scout"] = (0.6209f, 0.0153f, 0.5117f, 0.1793f),
            ["en_brute"] = (0.6536f, 0.0156f, 0.5000f, 0.2200f),
            ["en_hetao"] = (0.7159f, 0.0167f, 0.5000f, 0.2200f),
            ["en_zhucf"] = (0.5761f, 0.0109f, 0.5000f, 0.2200f),
            ["en_zengkui"] = (0.7738f, 0.0133f, 0.5000f, 0.2200f),
            ["en_hantao"] = (0.8496f, 0.0167f, 0.4443f, 0.1600f),
            ["en_liuml"] = (0.6522f, 0.0163f, 0.5788f, 0.1700f),
            ["en_waterchief"] = (0.8605f, 0.0158f, 0.4639f, 0.1600f),
            ["en_crossbowcapt"] = (0.8153f, 0.0158f, 0.4443f, 0.1603f),
            ["en_goldeneagle"] = (0.7311f, 0.0168f, 0.5000f, 0.2200f),
            ["en_ironpagoda"] = (0.7839f, 0.0138f, 0.5381f, 0.1600f),
            ["en_highpriest"] = (0.7579f, 0.0118f, 0.5000f, 0.2200f),
            ["en_giantbrute"] = (0.7295f, 0.0133f, 0.5020f, 0.1600f),
            ["en_firecart"] = (0.7256f, 0.0183f, 0.4287f, 0.1600f),
        };

        public const int Frames = 4;

        /// <summary>走路序列帧的基准帧率，和展示台 code_2 的 fps 相同。实际播放按移动速度对步；比它慢的（首领、精英）取对步帧率和它的几何平均。</summary>
        public const float WalkFps = 6f;

        /// <summary>再快 8 张图就糊了。当前最快的火药兵按步幅大约 20 帧/秒，上限留在这之上。</summary>
        public const float WalkFpsMax = 24f;
    }
}
