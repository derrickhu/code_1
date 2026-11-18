#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
微信启动封面：直接用 Assets/Resources/Art/loading.jpg（tools/build_loading_art.py 合成）。
标题、进度槽、健康忠告、适龄标都在图上。插件只在槽里画金色填充和一行状态字。
坐标和合成脚本同一套 720x1280 设计尺寸，等比铺满，不拉伸。
"""

import shutil
import sys
from pathlib import Path

# 720x1280 设计坐标（和 build_loading_art.py / LoadingScreen.cs 保持一致，不依赖 PIL 即可直接运行）
DW, DH = 720, 1280
BAR_W, BAR_H, BAR_BOTTOM = 400, 10, 214
TEXT_BOTTOM, TEXT_H = 232, 20

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "Assets/Resources/Art/loading.jpg"
OUT = ROOT / "wechat-minigame/minigame/images/background.jpg"
GAME_JS = ROOT / "wechat-minigame/minigame/game.js"

W, H = DW, DH
BAR_FILL = "#E6B54A"
TEXT_COLOR = "#EBDDBE"


def compose():
    if not SRC.exists():
        raise SystemExit(f"缺少 {SRC}，先跑 tools/build_loading_art.py")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(SRC, OUT)
    print(f"封面 {OUT}  {OUT.stat().st_size // 1024}KB")


def patch_game_js():
    if not GAME_JS.exists():
        print("没有 game.js，跳过加载页配置")
        return
    js = GAME_JS.read_text(encoding="utf-8")
    start = js.find("loadingPageConfig:")
    if start < 0:
        raise SystemExit("game.js 里没有 loadingPageConfig")
    brace = js.find("{", start)
    depth = 0
    end = None
    for i in range(brace, len(js)):
        if js[i] == "{":
            depth += 1
        elif js[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                break
    if end is None:
        raise SystemExit("loadingPageConfig 括号不配对")
    block = f"""loadingPageConfig: {{
                totalLaunchTime: 7000,
                animationDuration: 100,
                // 720x1280 等比铺满不拉伸。长屏裁掉左右一点边，不再上下留黑边。
                designWidth: {W},
                designHeight: {H},
                scaleMode: scaleMode.noBorder,
                textConfig: {{
                    firstStartText: '首次加载请耐心等待',
                    downloadingText: ['正在加载资源'],
                    compilingText: '编译中',
                    initText: '初始化中',
                    completeText: '开始游戏',
                    textDuration: 1500,
                    style: {{
                        bottom: {TEXT_BOTTOM},
                        height: {TEXT_H},
                        width: {BAR_W},
                        lineHeight: {TEXT_H},
                        color: '{TEXT_COLOR}',
                        fontSize: 13,
                    }},
                }},
                barConfig: {{
                    style: {{
                        width: {BAR_W},
                        height: {BAR_H},
                        padding: 0,
                        bottom: {BAR_BOTTOM},
                        backgroundColor: '{BAR_FILL}',
                        borderRadius: {BAR_H // 2},
                    }},
                }},
                iconConfig: {{
                    visible: false,
                    style: {{
                        width: 64,
                        height: 23,
                        bottom: 20,
                    }},
                }},
                materialConfig: {{
                    backgroundImage: 'images/background.jpg',
                    backgroundVideo: '',
                    iconImage: 'images/unity_logo.png',
                }},
            }}"""
    js = js[:start] + block + js[end:]
    js = js.replace("hideAfterCallmain: true", "hideAfterCallmain: false")
    js = js.replace("callmain结束后立即隐藏封面视频", "封面留到主界面画出来再揭")
    # 引擎起来之后 C# 会揭封面。这里再兜一层，避免停在「初始化中」。
    needle = "if (e.type === launchEventType.prepareGame) {\n            }"
    guard = """if (e.type === launchEventType.prepareGame) {
                setTimeout(() => {
                    if (gameManager && gameManager.hideLoadingPage) gameManager.hideLoadingPage();
                }, 8000);
            }"""
    if needle in js and "hideLoadingPage" not in js[js.find("onLaunchProgress"):js.find("onLaunchProgress") + 1200]:
        js = js.replace(needle, guard, 1)
    GAME_JS.write_text(js, encoding="utf-8")
    print("已改 game.js：封面铺满屏幕，金色进度条落在槽里，主界面出来后揭开")


def drop_data_subpackage():
    """首包改走 CDN 后，代码包里不能再留 data-package，否则空目录声明也会让微信去数那 26MB。"""
    import json
    import shutil

    game_json = ROOT / "wechat-minigame/minigame/game.json"
    if not game_json.exists():
        raise SystemExit(f"缺少 {game_json}")
    data = json.loads(game_json.read_text(encoding="utf-8"))
    data["subpackages"] = [x for x in data.get("subpackages") or [] if x.get("name") != "data-package"]
    preload = data.get("parallelPreloadSubpackages")
    if isinstance(preload, list):
        data["parallelPreloadSubpackages"] = [x for x in preload if x.get("name") != "data-package"]
    game_json.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    pack = ROOT / "wechat-minigame/minigame/data-package"
    if pack.exists():
        shutil.rmtree(pack)
    print("已从代码包去掉 data-package，首包只留在 webgl 目录等上传 CDN")


def main():
    if not SRC.exists():
        raise SystemExit(f"缺少 {SRC}")
    drop_data_subpackage()
    compose()
    patch_game_js()


if __name__ == "__main__":
    main()
