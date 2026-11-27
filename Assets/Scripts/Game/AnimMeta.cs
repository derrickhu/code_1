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
            ["en_soldier"] = (0.8418f, 0.0215f, 0.4678f, 0.3200f),
            ["en_shield"] = (0.8184f, 0.0195f, 0.4502f, 0.2882f),
            ["en_cavalry"] = (0.8184f, 0.0195f, 0.5420f, 0.0988f),
            ["en_crossbow"] = (0.8184f, 0.0176f, 0.4083f, 0.3101f),
            ["en_elite"] = (0.7422f, 0.0117f, 0.5361f, 0.2088f),
            ["en_porter"] = (0.8242f, 0.0195f, 0.5312f, 0.3200f),
            ["en_boss"] = (0.7786f, 0.0169f, 0.5000f, 0.2200f),
            ["hero_huarong"] = (0.6800f, 0.0078f, 0.5322f, 0.2875f),
            ["hero_lingzhen"] = (0.6800f, 0.0098f, 0.5293f, 0.2809f),
            ["hero_gongsun"] = (0.6800f, 0.0098f, 0.4980f, 0.2313f),
            ["hero_wusong"] = (0.6800f, 0.0117f, 0.4941f, 0.3200f),
            ["hero_linchong"] = (0.6800f, 0.0040f, 0.5137f, 0.1818f),
            ["hero_luzhishen"] = (0.6800f, 0.0098f, 0.5273f, 0.3007f),
            ["hero_zhangqing"] = (0.6800f, 0.0117f, 0.5029f, 0.3007f),
            ["hero_wuyong"] = (0.6800f, 0.0078f, 0.4957f, 0.2545f),
            ["en_hawk"] = (0.8184f, 0.0195f, 0.5039f, 0.0933f),
            ["en_armored"] = (0.7812f, 0.0176f, 0.5205f, 0.3200f),
            ["en_firebomb"] = (0.6562f, 0.0176f, 0.5205f, 0.3200f),
            ["en_chainhorse"] = (0.8184f, 0.0176f, 0.5000f, 0.2200f),
            ["en_luan"] = (0.7005f, 0.0130f, 0.4753f, 0.3200f),
            ["en_shiwen"] = (0.5716f, 0.0117f, 0.4928f, 0.3200f),
            ["en_huyan"] = (0.8177f, 0.0156f, 0.5000f, 0.2200f),
            ["en_gaoqiu"] = (0.8568f, 0.0130f, 0.5000f, 0.2200f),
            ["hero_lujunyi"] = (0.6800f, 0.0098f, 0.4834f, 0.1784f),
            ["hero_guansheng"] = (0.6800f, 0.0078f, 0.5283f, 0.2280f),
            ["hero_yanqing"] = (0.6800f, 0.0040f, 0.4668f, 0.3200f),
            ["hero_fanrui"] = (0.6800f, 0.0098f, 0.5107f, 0.2776f),
            ["hero_husanniang"] = (0.6800f, 0.0078f, 0.5078f, 0.3200f),
            ["hero_andaoquan"] = (0.6800f, 0.0078f, 0.5166f, 0.2016f),
            ["hero_daizong"] = (0.6800f, 0.0098f, 0.4893f, 0.3172f),
            ["hero_qinming"] = (0.6800f, 0.0078f, 0.4863f, 0.2346f),
            ["hero_likui"] = (0.6500f, 0.0182f, 0.4928f, 0.2254f),
            ["hero_qiaodaoqing"] = (0.6500f, 0.0208f, 0.5078f, 0.1840f),
            ["hero_zhuwu"] = (0.6500f, 0.0182f, 0.5130f, 0.2392f),
            ["hero_xuning"] = (0.6500f, 0.0182f, 0.4635f, 0.3174f),
            ["hero_shantinggui"] = (0.6500f, 0.0182f, 0.5260f, 0.2898f),
            ["hero_weidingguo"] = (0.6500f, 0.0182f, 0.5306f, 0.1886f),
            ["hero_shixiu"] = (0.6500f, 0.0208f, 0.4870f, 0.1794f),
            ["hero_xiezhen"] = (0.6500f, 0.0234f, 0.5000f, 0.2944f),
            ["hero_xiebao"] = (0.6500f, 0.0156f, 0.4727f, 0.2852f),
            ["hero_maling"] = (0.6500f, 0.0182f, 0.5247f, 0.3200f),
            ["hero_kongliang"] = (0.6500f, 0.0156f, 0.5247f, 0.2852f),
            ["hero_tanglong"] = (0.6500f, 0.0156f, 0.5247f, 0.2990f),
            ["hero_sunerniang"] = (0.6500f, 0.0182f, 0.5000f, 0.2200f),
            ["hero_ruanxiaoqi"] = (0.6500f, 0.0156f, 0.3854f, 0.1150f),
            ["hero_shiqian"] = (0.6500f, 0.0182f, 0.5189f, 0.3128f),
            ["hero_jiangjing"] = (0.6500f, 0.0156f, 0.4714f, 0.3128f),
            ["en_diver"] = (0.7539f, 0.0195f, 0.4976f, 0.3200f),
            ["en_farmer"] = (0.8184f, 0.0176f, 0.4893f, 0.3184f),
            ["en_hound"] = (0.8184f, 0.0176f, 0.5000f, 0.2200f),
            ["en_rattan"] = (0.7520f, 0.0176f, 0.4805f, 0.3200f),
            ["en_taoist"] = (0.6875f, 0.0195f, 0.5519f, 0.3200f),
            ["en_berserker"] = (0.8398f, 0.0176f, 0.4873f, 0.3200f),
            ["en_catapult"] = (0.7676f, 0.0176f, 0.5000f, 0.2200f),
            ["en_lantern"] = (0.8691f, 0.0215f, 0.4087f, 0.1551f),
            ["en_scout"] = (0.6191f, 0.0156f, 0.5488f, 0.3200f),
            ["en_brute"] = (0.6523f, 0.0156f, 0.5000f, 0.2200f),
            ["en_hetao"] = (0.7148f, 0.0169f, 0.5000f, 0.2200f),
            ["en_zhucf"] = (0.5755f, 0.0104f, 0.5000f, 0.2200f),
            ["en_zengkui"] = (0.7734f, 0.0130f, 0.5000f, 0.2200f),
            ["en_hantao"] = (0.9089f, 0.0169f, 0.6025f, 0.1565f),
            ["en_liuml"] = (0.9049f, 0.0169f, 0.4251f, 0.1175f),
            ["en_waterchief"] = (0.9082f, 0.0156f, 0.5657f, 0.3200f),
            ["en_crossbowcapt"] = (0.8125f, 0.0176f, 0.5908f, 0.3200f),
            ["en_goldeneagle"] = (0.9062f, 0.0176f, 0.5000f, 0.2200f),
            ["en_ironpagoda"] = (0.7832f, 0.0137f, 0.5518f, 0.3200f),
            ["en_highpriest"] = (0.7559f, 0.0117f, 0.4782f, 0.1724f),
            ["en_giantbrute"] = (0.7285f, 0.0137f, 0.5000f, 0.2200f),
            ["en_firecart"] = (0.7227f, 0.0176f, 0.5000f, 0.2200f),
        };

        public const int Frames = 4;

        /// <summary>走路序列帧的基准帧率，和展示台 code_2 的 fps 相同。实际播放按移动速度对步；比它慢的（首领、精英）取对步帧率和它的几何平均。</summary>
        public const float WalkFps = 6f;

        /// <summary>再快 8 张图就糊了。当前最快的火药兵按步幅大约 20 帧/秒，上限留在这之上。</summary>
        public const float WalkFpsMax = 24f;
    }
}
