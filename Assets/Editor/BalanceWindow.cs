using System;
using System.IO;
using System.Text;
using Liangshan.Sim;
using UnityEditor;
using UnityEngine;

namespace Liangshan.EditorTools
{
    /// <summary>
    /// 可视化局内数值管理中心（菜单：宋江别慌张 / 数值管理中心）。
    /// 支持可视化修改全局经济、外星补给、战斗乘区、波次难度、32 位乡亲与 29 种外星军数值，
    /// 一键保存到 Assets/Resources/BalanceConfig.json 并热更新内存，内置 10 波能量币账本推演与对局模拟器。
    /// </summary>
    public sealed class BalanceWindow : EditorWindow
    {
        static readonly string[] Tabs =
        {
            "0. 难度总控与快调",
            "1. 经济与外星补给",
            "2. 战斗与合成乘区",
            "3. 波次与关卡曲线",
            "4. 乡亲数值表 (32)",
            "5. 外星军与首领表 (29)",
            "6. 对局模拟验算",
        };

        BalanceConfig _cfg;
        int _tab;
        Vector2 _scroll;
        string _heroSearch = "";
        int _roleFilter = -1; // -1 全部，0..5 对应 Role
        int _rarityFilter = 0; // 0 全部，2/3/4
        int _enemyRankFilter = -1; // -1 全部，0 小兵，1 精英，2 首领
        bool _previewBossStage = true;
        int _previewBossKillWave = 7;

        // 模拟器参数
        int _simStage = 5;
        int _simSaveMode = 0; // 0 标准养成 ExpectedSave(n)，1 纯白板新档，2 落后4关养成
        int _simBotSkill = 2; // 2 完整策略，1 只合人不买词条，0 纯召唤挂机
        int _simTrials = 8;
        string _simReport = "点击上方「运行对局模拟」，1 秒内实测当前数值下的胜率、能量币构成与召唤/强化节奏。";
        string _auditReport = "点击上方「一键运行全线梯度体检」，2 秒内自动验算第 1~50 关在【纯白板 / 落后养成 / 标准养成】下的通关率，直观检查「不太难、不太水、局外带动局内」是否达标。";

        [MenuItem("村口大战外星人/数值管理中心", false, 20)]
        public static void Open()
        {
            var w = GetWindow<BalanceWindow>("数值管理中心");
            w.minSize = new Vector2(920, 640);
            w.EnsureLoaded();
            w.Show();
        }

        /// <summary>命令行同步生成默认 JSON：-executeMethod Liangshan.EditorTools.BalanceWindow.SyncDefaultJson</summary>
        public static void SyncDefaultJson()
        {
            var cfg = Balance.CreateDefault();
            WriteJsonFile(cfg);
            Balance.Apply(cfg);
            Debug.Log("[数值中心] 已导出最新默认数值至 " + BalanceLoader.AssetFilePath);
        }

        void OnEnable() => EnsureLoaded();

        void EnsureLoaded()
        {
            if (_cfg != null) return;
            ReloadFromDiskOrMemory();
        }

        void ReloadFromDiskOrMemory()
        {
            if (File.Exists(BalanceLoader.AssetFilePath))
            {
                string txt = File.ReadAllText(BalanceLoader.AssetFilePath, Encoding.UTF8);
                if (BalanceLoader.TryApplyJson(txt, out _))
                {
                    _cfg = Balance.ExportCurrent();
                    return;
                }
            }
            _cfg = Balance.ExportCurrent();
        }

        static void WriteJsonFile(BalanceConfig cfg)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(BalanceLoader.AssetFilePath) ?? "Assets/Resources");
            string json = BalanceLoader.ToJson(cfg);
            File.WriteAllText(BalanceLoader.AssetFilePath, json + "\n", new UTF8Encoding(false));
            AssetDatabase.ImportAsset(BalanceLoader.AssetFilePath);
        }

        void ApplyAndSave()
        {
            Balance.Apply(_cfg);
            _cfg = Balance.ExportCurrent();
            WriteJsonFile(_cfg);
            ShowNotification(new GUIContent("已保存至 BalanceConfig.json 并立即生效"));
        }

        void ApplyMemoryOnly()
        {
            Balance.Apply(_cfg);
            _cfg = Balance.ExportCurrent();
        }

        void OnGUI()
        {
            EnsureLoaded();
            DrawTopToolbar();
            EditorGUILayout.Space(4);
            _tab = GUILayout.Toolbar(_tab, Tabs, GUILayout.Height(28));
            EditorGUILayout.Space(6);

            _scroll = EditorGUILayout.BeginScrollView(_scroll);
            switch (_tab)
            {
                case 0: DrawQuickMasterTab(); break;
                case 1: DrawEconomyTab(); break;
                case 2: DrawCombatTab(); break;
                case 3: DrawWaveStageTab(); break;
                case 4: DrawHeroesTab(); break;
                case 5: DrawEnemiesTab(); break;
                case 6: DrawSimulatorTab(); break;
            }
            EditorGUILayout.EndScrollView();
        }

        void DrawTopToolbar()
        {
            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
            GUI.backgroundColor = new Color(0.35f, 0.82f, 0.45f);
            if (GUILayout.Button("保存 JSON 并立即生效", EditorStyles.toolbarButton, GUILayout.Width(160)))
                ApplyAndSave();
            GUI.backgroundColor = Color.white;

            if (GUILayout.Button("仅热应用到内存(不写盘)", EditorStyles.toolbarButton, GUILayout.Width(150)))
            {
                ApplyMemoryOnly();
                ShowNotification(new GUIContent("已热应用到当前编辑器内存"));
            }

            if (GUILayout.Button("重新读取 JSON", EditorStyles.toolbarButton, GUILayout.Width(110)))
            {
                _cfg = null;
                ReloadFromDiskOrMemory();
                GUI.FocusControl(null);
            }

            if (GUILayout.Button("恢复代码默认数值", EditorStyles.toolbarButton, GUILayout.Width(125)))
            {
                if (EditorUtility.DisplayDialog("恢复默认数值", "确定将所有数值恢复为代码内置默认值吗？（需再点保存才会覆盖 JSON）", "恢复默认", "取消"))
                {
                    Balance.ResetToDefault();
                    _cfg = Balance.ExportCurrent();
                    GUI.FocusControl(null);
                }
            }

            if (GUILayout.Button("定位 JSON 文件", EditorStyles.toolbarButton, GUILayout.Width(105)))
            {
                var asset = AssetDatabase.LoadAssetAtPath<TextAsset>(BalanceLoader.AssetFilePath);
                if (asset != null) EditorGUIUtility.PingObject(asset);
            }

            GUILayout.FlexibleSpace();
            GUILayout.Label("配置文件: " + BalanceLoader.AssetFilePath, EditorStyles.miniLabel);
            EditorGUILayout.EndHorizontal();
        }

        // ---------------- 0. 难度总控与快调 ----------------

        void DrawQuickMasterTab()
        {
            var w = _cfg.WaveStage;
            var e = _cfg.Economy;
            Balance.Apply(_cfg);
            var est = Balance.EstimateTenWaveEconomy(true, 7);

            EditorGUILayout.HelpBox(
                "日常调难度只需动本页的【四大总推杆】，无需逐格改底层数组：\n" +
                "• 觉得全盘偏难 → 调低「全局敌军血量总倍率 GlobalHpMul」（如 0.90 = 全 50 关怪血同步 -10%，不破坏关间斜率与局外养成挂钩）。\n" +
                "• 觉得漏两只怪寨墙就碎 → 调低「全局拆墙伤害总倍率 GlobalAtkMul」或调高「基础寨墙血量」。\n" +
                "• 觉得局内合成/买词条手头紧 → 调高「小怪基础赏银倍率」或「每波击退军饷递增」。\n" +
                "改完点左上角绿色【保存 JSON 并立即生效】，编辑器与真机导出包即刻同步。",
                MessageType.Info);

            Section("一键难度档位预设（只改全局倍率，随时可切回 1.00 标准）", () =>
            {
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("轻松爽玩 (血×0.85 伤×0.85)", GUILayout.Height(28))) { w.GlobalHpMul = 0.85f; w.GlobalAtkMul = 0.85f; }
                if (GUILayout.Button("温和适中 (血×0.92 伤×0.92)", GUILayout.Height(28))) { w.GlobalHpMul = 0.92f; w.GlobalAtkMul = 0.92f; }
                GUI.backgroundColor = new Color(0.85f, 0.95f, 1.0f);
                if (GUILayout.Button("推荐标准 (血×1.00 伤×1.00)", GUILayout.Height(28))) { w.GlobalHpMul = 1.00f; w.GlobalAtkMul = 1.00f; }
                GUI.backgroundColor = Color.white;
                if (GUILayout.Button("进阶微难 (血×1.08 伤×1.06)", GUILayout.Height(28))) { w.GlobalHpMul = 1.08f; w.GlobalAtkMul = 1.06f; }
                if (GUILayout.Button("硬核抗压 (血×1.18 伤×1.15)", GUILayout.Height(28))) { w.GlobalHpMul = 1.18f; w.GlobalAtkMul = 1.15f; }
                EditorGUILayout.EndHorizontal();
            });

            Section("四大核心微调总推杆（最常用）", () =>
            {
                w.GlobalHpMul = EditorGUILayout.Slider("① 全局敌军血量总倍率 (GlobalHpMul)", w.GlobalHpMul, 0.65f, 1.45f);
                w.GlobalAtkMul = EditorGUILayout.Slider("② 全局敌军拆墙伤害总倍率 (GlobalAtkMul)", w.GlobalAtkMul, 0.60f, 1.50f);
                EditorGUILayout.Space(4);
                e.KillCoinMul = EditorGUILayout.Slider("③ 局内小怪赏银倍率 (KillCoinMul)", e.KillCoinMul, 0.70f, 1.80f);
                e.WaveBonusPerWave = EditorGUILayout.IntSlider("    每波守城军饷递增 (WaveBonusPerWave)", e.WaveBonusPerWave, 20, 100);
                EditorGUILayout.Space(4);
                w.HpScaleSlope = EditorGUILayout.Slider("④ 单局 10 波后期血量斜率 (HpScaleSlope)", w.HpScaleSlope, 0.60f, 1.40f);
                w.WallBaseHp = EditorGUILayout.Slider("    基础寨墙血量 (WallBaseHp)", w.WallBaseHp, 3500f, 12000f);

                Balance.Apply(_cfg);
                var sb = new StringBuilder();
                sb.Append($"实时预览  |  单局10波期望总能量币: {est.GrandTotalExpected} 银  |  第1关第1波官兵血量: {Defs.Enemy(EnemyKind.Soldier).Hp * Defs.Tough(1) * Defs.StageHp(1):F0}  |  ");
                foreach (int lv in new[] { 1, 4, 5, 10, 25, 50 })
                    sb.Append($"第{lv}关倍率={Defs.StageHp(lv):F2}x  ");
                EditorGUILayout.HelpBox(sb.ToString(), MessageType.None);
            });

            Section("局外带动局内 · 全线关键关梯度体检（防太难劝退 & 防太水白板平推）", () =>
            {
                EditorGUILayout.BeginHorizontal();
                if (GUILayout.Button("一键运行全线梯度体检（第 1~50 关三档养成对比）", GUILayout.Height(32)))
                    RunFullCurveAudit();
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.Space(4);
                EditorGUILayout.TextArea(_auditReport, GUILayout.MinHeight(240));
            });
        }

        static int SimWinsAt(int stage, SaveData save, int trials)
        {
            var lo = Meta.BuildLoadout(save);
            var st = Defs.Level(stage);
            int wins = 0;
            for (int seed = 1; seed <= trials; seed++)
            {
                var b = new Battle(seed, lo.Lineup, st, lo);
                var bot = new Bot(2);
                while (b.Phase != Phase.Victory && b.Phase != Phase.Defeat && b.Time < 600f)
                {
                    bot.Step(b, 1f / 30f);
                    b.Update(1f / 30f);
                    b.Events.Clear();
                }
                if (b.Phase == Phase.Victory) wins++;
            }
            return wins;
        }

        void RunFullCurveAudit()
        {
            ApplyMemoryOnly();
            var ws = _cfg.WaveStage;
            var sb = new StringBuilder();
            sb.AppendLine($"=== 全线梯度体检报告 (GlobalHpMul={ws.GlobalHpMul:F2}x, GlobalAtkMul={ws.GlobalAtkMul:F2}x) ===");
            sb.AppendLine("设计红线：第1~2关白板稳过建立信心 → 第4~5关白板受阻催促养成 → 后续标准养成≥75%顺畅过、落后4关养成≤38%有卡点！");
            sb.AppendLine();
            sb.AppendLine("[前期破冰与首个局外卡点 (10局/关)]");
            var fresh = Meta.NewSave(0);
            for (int lv = 1; lv <= 5; lv++)
            {
                int wFresh = SimWinsAt(lv, fresh, 10);
                int wExp = SimWinsAt(lv, Meta.ExpectedSave(lv), 10);
                string tag = lv <= 2
                    ? (wFresh >= 8 ? "✓ 新手顺畅" : "⚠ 开局偏难")
                    : lv >= 4
                        ? (wFresh <= 2 && wExp >= 7 ? "✓ 完美卡白板·养成稳过" : wFresh > 2 ? "⚠ 偏水(白板能混过)" : "⚠ 养成后仍偏难")
                        : "✓ 过渡关";
                sb.AppendLine($"  第 {lv} 关 ({Defs.Level(lv).Name,-4}) | 怪血倍率 {Defs.StageHp(lv),5:F2}x | 纯1级白板胜率: {wFresh,2}/10 | 标准养成胜率: {wExp,2}/10  --> {tag}");
            }

            sb.AppendLine();
            sb.AppendLine("[中后期长线局外牵引检视 (8局/关)]");
            foreach (int lv in new[] { 5, 8, 10, 15, 25, 40, 50 })
            {
                int wExp = SimWinsAt(lv, Meta.ExpectedSave(lv), 8);
                int wLag = lv > 4 ? SimWinsAt(lv, Meta.ExpectedSave(lv - 4), 8) : -1;
                string tag = wExp >= 6 && (wLag < 0 || wLag <= 3)
                    ? "✓ 理想 (养成顺畅 / 欠账受阻)"
                    : wExp < 6 ? "⚠ 偏难 (标准养成胜率偏低)" : "⚠ 偏水 (落后4关养成也能平推)";
                sb.AppendLine($"  第 {lv,2} 关 ({Defs.Level(lv).Name,-4}) | 怪血倍率 {Defs.StageHp(lv),8:F2}x | 落后4关养成: {wLag}/8 | 标准同步养成: {wExp}/8  --> {tag}");
            }
            _auditReport = sb.ToString();
        }

        // ---------------- 1. 经济与外星补给 ----------------

        void DrawEconomyTab()
        {
            var e = _cfg.Economy;
            Balance.Apply(_cfg);
            var est = Balance.EstimateTenWaveEconomy(_previewBossStage, _previewBossKillWave);

            EditorGUILayout.BeginVertical("box");
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField("实时 10 波能量币账本推演", EditorStyles.boldLabel);
            _previewBossStage = EditorGUILayout.ToggleLeft("首领关(5格转盘)", _previewBossStage, GUILayout.Width(125));
            _previewBossKillWave = EditorGUILayout.IntSlider("首领击杀波次", _previewBossKillWave, 5, 9, GUILayout.Width(260));
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.HelpBox(
                $"前 5 波小怪产出: {est.First5MinionCoins} 银   |   10 波小怪总计: {est.TotalMinionCoins} 银   |   波次守城犒赏总计: {est.WaveBonusCoins} 银   |   首领压血钱袋: {est.BossPhaseCoins} 银\n" +
                $"常规稳定总流入(含开局 {est.StartCoins}): {est.TotalRoutineCoins} 银 ({100f * (1f - est.TreasureShare):0.0}%)   |   " +
                $"首领唯一外星补给(全能量币): {est.BossReelAllSilverCoins} 银   |   外星补给+首领精英总期望: {est.TotalTreasureExpectedCoins} 银 ({100f * est.TreasureShare:0.0}%)\n" +
                $"单局 10 波总可用能量币期望: {est.GrandTotalExpected} 银",
                MessageType.Info);
            EditorGUILayout.EndVertical();

            EditorGUILayout.Space(6);
            Section("开局、扩格与强化门槛", () =>
            {
                e.StartCoins = EditorGUILayout.IntField("开局初始能量币 (100=固定3抽)", e.StartCoins);
                e.SummonsPerSlot = EditorGUILayout.IntSlider("每招募几次扩充 1 格", e.SummonsPerSlot, 2, 8);
                e.EnhanceUnlockSummons = EditorGUILayout.IntSlider("召唤几次解锁强化按钮", e.EnhanceUnlockSummons, 0, 10);
            });

            Section("常规能量币流速（杀怪赏银 + 波次守城军饷 + 首领分段爆币）", () =>
            {
                e.KillCoinMul = EditorGUILayout.Slider("小怪基础赏银倍率 (1=按表直掉)", e.KillCoinMul, 0.5f, 6.0f);
                e.KillCoinWaveSlope = EditorGUILayout.Slider("小怪每波赏银涨幅 (0=全波次恒定)", e.KillCoinWaveSlope, 0f, 0.60f);
                e.BigKillCoinMul = EditorGUILayout.Slider("首领/精英直接赏银倍率 (1=按表直掉)", e.BigKillCoinMul, 0.2f, 3.0f);
                EditorGUILayout.Space(4);
                e.WaveBonusBase = EditorGUILayout.IntField("每波击退军饷基数 (WaveBonusBase)", e.WaveBonusBase);
                e.WaveBonusPerWave = EditorGUILayout.IntField("每波击退军饷递增 (×波次)", e.WaveBonusPerWave);
                EditorGUILayout.Space(4);
                e.BossDropHp1 = EditorGUILayout.Slider("首领第 1 次爆钱血线", e.BossDropHp1, 0f, 0.95f);
                e.BossDropHp2 = EditorGUILayout.Slider("首领第 2 次爆钱血线", e.BossDropHp2, 0f, 0.80f);
                e.BossDropCoinBase = EditorGUILayout.IntField("首领阶段钱袋基数", e.BossDropCoinBase);
                e.BossDropCoinPerWave = EditorGUILayout.IntField("首领阶段钱袋每波递增", e.BossDropCoinPerWave);
            });

            Section("外星补给老虎机参数（去泡沫核心）", () =>
            {
                e.ReelSilverBase = EditorGUILayout.IntField("单格基础能量币 (ReelSilverBase)", e.ReelSilverBase);
                e.ReelSilverPerWave = EditorGUILayout.IntField("单格每波递增能量币 (×当前波次)", e.ReelSilverPerWave);
                e.ReelJackpotMul = EditorGUILayout.Slider("全部同色能量币翻倍倍率", e.ReelJackpotMul, 1.0f, 3.0f);
                e.ReelNaturalJackpotChance = EditorGUILayout.Slider("精英外星补给自然同色大奖率", e.ReelNaturalJackpotChance, 0f, 1f);
                e.ReelPerkCellChance = EditorGUILayout.Slider("单格摇出强化词条概率", e.ReelPerkCellChance, 0f, 0.8f);
                EditorGUILayout.BeginHorizontal();
                e.ReelNormalCells = EditorGUILayout.IntSlider("常规关转盘格数", e.ReelNormalCells, 3, 5);
                e.ReelBossCells = EditorGUILayout.IntSlider("首领关转盘格数", e.ReelBossCells, 3, 6);
                EditorGUILayout.EndHorizontal();
            });

            Section("召唤价格表 & 强化价格表（纯查表定价，超出长度维持最后一格）", () =>
            {
                e.SummonTable = DrawIntArray("召唤价格表 (SummonTable)", e.SummonTable);
                e.SummonOverflowLinear = 0;
                e.SummonOverflowQuad = 0;
                int sumS = SumInt(e.SummonTable, e.SummonTable.Length);
                int sumS18 = SumInt(e.SummonTable, 18);
                int sumS25 = SumInt(e.SummonTable, 25);
                EditorGUILayout.LabelField($"    → 召唤满表({e.SummonTable.Length}次)共需 {sumS} 银  |  前18次 {sumS18} 银  |  前25次(开满12槽) {sumS25} 银", EditorStyles.miniLabel);

                EditorGUILayout.Space(6);
                e.EnhanceTable = DrawIntArray("强化价格表 (EnhanceTable)", e.EnhanceTable);
                e.EnhanceOverflowStep = 0;
                int sumE = SumInt(e.EnhanceTable, e.EnhanceTable.Length);
                int sumE5 = SumInt(e.EnhanceTable, 5);
                int sumE7 = SumInt(e.EnhanceTable, 7);
                EditorGUILayout.LabelField($"    → 强化满表({e.EnhanceTable.Length}次)共需 {sumE} 银  |  前5次 {sumE5} 银  |  前7次 {sumE7} 银", EditorStyles.miniLabel);

                EditorGUILayout.Space(4);
                int fullBoth = sumS + sumE;
                float cover = fullBoth > 0 ? 100f * est.GrandTotalExpected / fullBoth : 0f;
                EditorGUILayout.HelpBox(
                    $"两表全部拉满合计: {fullBoth} 银（25次召唤+8次强化约需 {sumS25 + SumInt(e.EnhanceTable, 8)} 银）\n" +
                    $"当前 10 波预计总产出: {est.GrandTotalExpected} 银  →  占两表满额的 {cover:0.1}%（差额 {est.GrandTotalExpected - fullBoth:+#;-#;0} 银）",
                    cover >= 75f ? MessageType.Info : MessageType.Warning);
            });
        }

        // ---------------- 2. 战斗与合成乘区 ----------------

        void DrawCombatTab()
        {
            var c = _cfg.Combat;
            Section("合成升星倍率与防卡手保护", () =>
            {
                c.StarMul = DrawFloatArray("1~4 星伤害倍率 (StarMul)", c.StarMul);
                c.StarSpeed = DrawFloatArray("1~4 星攻速倍率 (StarSpeed)", c.StarSpeed);
                c.EarlyCarryMergeProtectCount = EditorGUILayout.IntSlider("前几次合 2 星启用防变辅助保护", c.EarlyCarryMergeProtectCount, 0, 6);
                c.EarlyCarryMinOnField = EditorGUILayout.IntSlider("触发保护所需的场上最少输出人数", c.EarlyCarryMinOnField, 1, 6);
            });

            Section("强化词条收益乘区与取舍卡带宽", () =>
            {
                c.PerkDmgBoost = EditorGUILayout.Slider("常规伤害卡放大倍率", c.PerkDmgBoost, 0.8f, 3.0f);
                c.PerkAreaBoost = EditorGUILayout.Slider("常规范围卡放大倍率", c.PerkAreaBoost, 0.8f, 3.0f);
                c.PerkSpeedBoost = EditorGUILayout.Slider("常规攻速卡放大倍率", c.PerkSpeedBoost, 0.8f, 3.0f);
                c.PerkCritBoost = EditorGUILayout.Slider("常规暴击卡放大倍率", c.PerkCritBoost, 0.8f, 2.5f);
                EditorGUILayout.Space(4);
                c.WideMultiDmgPenalty = EditorGUILayout.Slider("取舍卡【齐射+2发】单发减伤", c.WideMultiDmgPenalty, -0.50f, 0f);
                c.WideAreaBonus = EditorGUILayout.Slider("取舍卡【大开大合】范围加成", c.WideAreaBonus, 0.20f, 1.50f);
                c.WideAreaSpeedPenalty = EditorGUILayout.Slider("取舍卡【大开大合】攻速折减", c.WideAreaSpeedPenalty, -0.40f, 0f);
            });

            Section("爆发、最强一击、三合一奥义觉醒与大招继承", () =>
            {
                c.SurgeChance = EditorGUILayout.Slider("Lv.5 爆发触发几率", c.SurgeChance, 0.05f, 0.80f);
                c.SurgeDmg = EditorGUILayout.Slider("Lv.5 爆发伤害倍率", c.SurgeDmg, 1.5f, 6.0f);
                c.SurgePlusChance = EditorGUILayout.Slider("Lv.15 爆发额外几率", c.SurgePlusChance, 0f, 0.40f);
                c.TopDmg = EditorGUILayout.Slider("Lv.20 最强一击增伤", c.TopDmg, 0.30f, 3.0f);
                EditorGUILayout.Space(4);
                c.AwakenDmgBonus = EditorGUILayout.Slider("三合一觉醒独立终伤加成", c.AwakenDmgBonus, 0.10f, 1.50f);
                c.AwakenSpeedBonus = EditorGUILayout.Slider("三合一觉醒攻速加成", c.AwakenSpeedBonus, 0f, 0.80f);
                c.AwakenAuraBonus = EditorGUILayout.Slider("三合一觉醒辅助加成", c.AwakenAuraBonus, 0f, 1.20f);
                c.UltPerkStackBonus = EditorGUILayout.Slider("传说大招每层词条继承增伤", c.UltPerkStackBonus, 0f, 0.30f);
            });

            Section("统帅宋江「替天行道」参数", () =>
            {
                c.LordPctBase = EditorGUILayout.Slider("基础剑气伤害倍率 (×统帅攻击)", c.LordPctBase, 0.5f, 5.0f);
                c.LordCdBase = EditorGUILayout.Slider("基础冷却秒数", c.LordCdBase, 10f, 80f);
                c.LordFirstCast = EditorGUILayout.Slider("开战首次拔剑秒数", c.LordFirstCast, 5f, 45f);
                c.LordWaveSpeed = EditorGUILayout.Slider("统帅剑气推进速度 (格/秒)", c.LordWaveSpeed, 4.0f, 24.0f);
            });

            Section("全职业弹道飞行速度与法术/刀剑特效节奏（×1 第一档速度基准）", () =>
            {
                const float refDist = 4.5f;
                float pace = Mathf.Max(0.25f, c.ProjPace);
                float arrowT = (c.ArrowBase + refDist / Mathf.Max(1f, c.ArrowSpeed)) * pace;
                float spearT = (c.SpearBase + refDist / Mathf.Max(1f, c.SpearSpeed)) * pace;
                float meleeT = (c.MeleeBase + refDist / Mathf.Max(1f, c.MeleeSpeed)) * pace;
                float slamT = (c.SlamBase + refDist / Mathf.Max(1f, c.SlamSpeed)) * pace;
                float stoneT = (c.StoneBase + refDist / Mathf.Max(1f, c.StoneSpeed)) * pace;
                float qiT = c.QiDur * pace;
                float lordT = 9.0f / Mathf.Max(1f, c.LordWaveSpeed);

                float lightT = c.LightningDur * pace;
                float hopT = c.LightningChainGap * pace;
                float dropT = (c.MageDropDur + refDist / Mathf.Max(1f, c.StoneSpeed)) * pace;
                float windT = (c.WindBase + refDist / Mathf.Max(1f, c.WindSpeed)) * pace;
                float bombT = (c.BombBase + refDist / Mathf.Max(1f, c.BombSpeed)) * pace;
                float fireT = (c.FireballBase + refDist / Mathf.Max(1f, c.FireballSpeed)) * pace;
                float lassoT = (c.LassoBase + refDist / Mathf.Max(1f, c.LassoSpeed)) * pace;
                EditorGUILayout.HelpBox(
                    $"第 1 档(×1) 中场 {refDist:0.0} 格实测耗时预览：\n" +
                    $"【物理】 箭矢={arrowT:0.00}s  |  长枪={spearT:0.00}s  |  刀剑斧拳={meleeT:0.00}s  |  重刀禅杖={slamT:0.00}s  |  飞石={stoneT:0.00}s  |  刀气波={qiT:0.00}s  |  统帅剑气全场={lordT:0.00}s\n" +
                    $"【法术/火器/控制】 天雷落劈={lightT:0.00}s(弹跳{hopT:0.00}s)  |  法师金砖天降={dropT:0.00}s  |  风法/八阵图={windT:0.00}s  |  射线流速={c.BeamFlowSpeed:0.0}x  |  重炮={bombT:0.00}s  |  火陨={fireT:0.00}s  |  套索={lassoT:0.00}s",
                    spearT < arrowT * 0.72f ? MessageType.Warning : MessageType.Info);

                c.ProjPace = EditorGUILayout.Slider("全局弹道耗时总倍率 (ProjPace, 越大越慢)", c.ProjPace, 0.50f, 2.00f);
                c.VfxPace = EditorGUILayout.Slider("全局特效时长总倍率 (VfxPace, 越大越慢)", c.VfxPace, 0.50f, 2.00f);
                EditorGUILayout.Space(4);

                EditorGUILayout.LabelField("物理兵刃弹道参数（耗时 = 起手秒数 + 距离 / 飞行格速）", EditorStyles.boldLabel);
                EditorGUILayout.BeginHorizontal();
                c.ArrowBase = EditorGUILayout.Slider("箭矢·起手秒数", c.ArrowBase, 0.08f, 0.60f);
                c.ArrowSpeed = EditorGUILayout.Slider("箭矢·飞行速度(格/秒)", c.ArrowSpeed, 6f, 30f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.SpearBase = EditorGUILayout.Slider("长枪·起手秒数", c.SpearBase, 0.08f, 0.60f);
                c.SpearSpeed = EditorGUILayout.Slider("长枪·突刺速度(格/秒)", c.SpearSpeed, 6f, 30f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.MeleeBase = EditorGUILayout.Slider("刀剑斧拳·起手秒数", c.MeleeBase, 0.10f, 0.60f);
                c.MeleeSpeed = EditorGUILayout.Slider("刀剑斧拳·飞掷速度(格/秒)", c.MeleeSpeed, 6f, 30f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.SlamBase = EditorGUILayout.Slider("重刀禅杖·起手秒数", c.SlamBase, 0.15f, 0.75f);
                c.SlamSpeed = EditorGUILayout.Slider("重刀禅杖·劈落速度(格/秒)", c.SlamSpeed, 6f, 28f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.StoneBase = EditorGUILayout.Slider("飞石·起手秒数", c.StoneBase, 0.08f, 0.60f);
                c.StoneSpeed = EditorGUILayout.Slider("飞石·飞行速度(格/秒)", c.StoneSpeed, 6f, 30f);
                EditorGUILayout.EndHorizontal();

                c.QiDur = EditorGUILayout.Slider("刀气/剑气波推进耗时(秒)", c.QiDur, 0.20f, 1.00f);

                EditorGUILayout.Space(4);
                EditorGUILayout.LabelField("法师、火器与控制弹道参数", EditorStyles.boldLabel);
                EditorGUILayout.BeginHorizontal();
                c.LightningDur = EditorGUILayout.Slider("法师天雷·引落耗时(秒)", c.LightningDur, 0.10f, 0.70f);
                c.LightningChainGap = EditorGUILayout.Slider("法师雷链·弹跳间隔(秒)", c.LightningChainGap, 0.05f, 0.40f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.MageDropDur = EditorGUILayout.Slider("法师金砖·天降耗时(秒)", c.MageDropDur, 0.25f, 1.10f);
                c.BeamFlowSpeed = EditorGUILayout.Slider("法术射线·流光流速", c.BeamFlowSpeed, 0.6f, 4.5f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.WindBase = EditorGUILayout.Slider("风法/阵法·起手秒数", c.WindBase, 0.12f, 0.70f);
                c.WindSpeed = EditorGUILayout.Slider("风法/阵法·飞行速度", c.WindSpeed, 6f, 26f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.BombBase = EditorGUILayout.Slider("重炮·起手秒数", c.BombBase, 0.20f, 0.90f);
                c.BombSpeed = EditorGUILayout.Slider("重炮·飞行速度", c.BombSpeed, 8f, 28f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.FireballBase = EditorGUILayout.Slider("火陨·起手秒数", c.FireballBase, 0.20f, 0.85f);
                c.FireballSpeed = EditorGUILayout.Slider("火陨·坠落速度", c.FireballSpeed, 8f, 28f);
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                c.LassoBase = EditorGUILayout.Slider("缚龙索·起手秒数", c.LassoBase, 0.12f, 0.65f);
                c.LassoSpeed = EditorGUILayout.Slider("缚龙索·抛投速度", c.LassoSpeed, 8f, 28f);
                EditorGUILayout.EndHorizontal();
            });
        }

        // ---------------- 3. 波次与关卡曲线 ----------------

        void DrawWaveStageTab()
        {
            var w = _cfg.WaveStage;
            Balance.Apply(_cfg);

            Section("单局 10 波刷怪与血量厚度节奏", () =>
            {
                w.WaveCounts = DrawIntArray("第 1~10 波基础刷怪数", w.WaveCounts);
                w.HpScaleSlope = EditorGUILayout.Slider("每波血量线性斜率 (HpScaleSlope)", w.HpScaleSlope, 0.05f, 2.0f);
                w.Bulk = EditorGUILayout.Slider("全局小怪基础厚度 (Bulk)", w.Bulk, 0.8f, 3.0f);
                w.EarlyWaveTough = DrawFloatArray("前 N 波耐打修正倍率 (EarlyWaveTough)", w.EarlyWaveTough);
                EditorGUILayout.BeginHorizontal();
                w.WaveTime = EditorGUILayout.FloatField("单波最长秒数", w.WaveTime);
                w.WaveMinTime = EditorGUILayout.FloatField("清场最短波间隔", w.WaveMinTime);
                w.ClearBreath = EditorGUILayout.FloatField("清场喘息秒数", w.ClearBreath);
                EditorGUILayout.EndHorizontal();
            });

            Section("首领进场、狂暴波与寨墙", () =>
            {
                w.BossPace = EditorGUILayout.Slider("首领行军速度倍率 (BossPace)", w.BossPace, 0.15f, 1.0f);
                EditorGUILayout.BeginHorizontal();
                w.MainBossWave = EditorGUILayout.IntSlider("主线首领登场波次", w.MainBossWave, 1, 9);
                w.MainRageWave = EditorGUILayout.IntSlider("主线敌军狂暴波次", w.MainRageWave, 5, 10);
                EditorGUILayout.EndHorizontal();
                EditorGUILayout.BeginHorizontal();
                w.RageAtkMul = EditorGUILayout.Slider("狂暴拆墙伤害倍率", w.RageAtkMul, 1.0f, 3.0f);
                w.RageSpeedMul = EditorGUILayout.Slider("狂暴移速倍率", w.RageSpeedMul, 1.0f, 2.5f);
                EditorGUILayout.EndHorizontal();
                w.WallBaseHp = EditorGUILayout.FloatField("基础寨墙血量", w.WallBaseHp);
                EditorGUILayout.BeginHorizontal();
                w.StageBuffNormal = EditorGUILayout.Slider("常规关推荐职业增伤", w.StageBuffNormal, 0f, 1f);
                w.StageBuffBoss = EditorGUILayout.Slider("首领关推荐职业增伤", w.StageBuffBoss, 0f, 1f);
                EditorGUILayout.EndHorizontal();
            });

            Section("50 关难度曲线锚点与保底斜率", () =>
            {
                EditorGUILayout.BeginHorizontal();
                w.GlobalHpMul = EditorGUILayout.Slider("全局敌军血量总倍率", w.GlobalHpMul, 0.65f, 1.45f);
                w.GlobalAtkMul = EditorGUILayout.Slider("全局拆墙伤害总倍率", w.GlobalAtkMul, 0.60f, 1.50f);
                EditorGUILayout.EndHorizontal();
                w.HpTuneStages = DrawFloatArray("曲线关卡节点 (HpTuneStages)", w.HpTuneStages);
                w.HpTuneValues = DrawFloatArray("对应难度系数 (HpTuneValues)", w.HpTuneValues);
                EditorGUILayout.BeginHorizontal();
                w.StageMinStep1To5 = EditorGUILayout.FloatField("1~5关最小环比倍率", w.StageMinStep1To5);
                w.StageMinStep6To15 = EditorGUILayout.FloatField("6~15关最小环比倍率", w.StageMinStep6To15);
                w.StageMinStep16Plus = EditorGUILayout.FloatField("16~50关最小环比倍率", w.StageMinStep16Plus);
                EditorGUILayout.EndHorizontal();

                var sb = new StringBuilder("关键关卡血量倍率预览： ");
                foreach (int lv in new[] { 1, 3, 5, 10, 15, 20, 30, 40, 50 })
                    sb.Append($"第{lv}关={Defs.StageHp(lv):F2}x   ");
                EditorGUILayout.HelpBox(sb.ToString(), MessageType.None);
            });
        }

        // ---------------- 4. 乡亲数值表 ----------------

        void DrawHeroesTab()
        {
            EditorGUILayout.BeginHorizontal("box");
            _heroSearch = EditorGUILayout.TextField("搜索乡亲", _heroSearch, GUILayout.Width(240));
            GUILayout.Space(12);
            GUILayout.Label("职业:", GUILayout.Width(36));
            string[] roleLabels = { "全部", "射手", "炮手", "法师", "战士", "辅助", "控制" };
            _roleFilter = GUILayout.Toolbar(_roleFilter + 1, roleLabels, GUILayout.Width(340)) - 1;
            GUILayout.Space(12);
            GUILayout.Label("品质:", GUILayout.Width(36));
            int rIdx = _rarityFilter == 0 ? 0 : _rarityFilter - 1;
            rIdx = GUILayout.Toolbar(rIdx, new[] { "全部", "稀有(蓝)", "史诗(紫)", "传说(橙)" }, GUILayout.Width(250));
            _rarityFilter = rIdx == 0 ? 0 : rIdx + 1;
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.HelpBox("四技能数值写在每行下面：特性、绝技（次数 / 主值 / 副值）、15 级专属卡的两个数。保存后说明文字跟着变。旧表没有这几列时，沿用代码里的出厂数值。", MessageType.None);

            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
            GUILayout.Label("乡亲", GUILayout.Width(92));
            GUILayout.Label("职业/品阶", GUILayout.Width(76));
            GUILayout.Label("系数Coef", GUILayout.Width(66));
            GUILayout.Label("冷却CD", GUILayout.Width(58));
            GUILayout.Label("弹数", GUILayout.Width(42));
            GUILayout.Label("穿/弹Chain", GUILayout.Width(70));
            GUILayout.Label("半径Rad", GUILayout.Width(60));
            GUILayout.Label("击退Knk", GUILayout.Width(60));
            GUILayout.Label("大招Coef", GUILayout.Width(66));
            GUILayout.Label("被动V", GUILayout.Width(56));
            GUILayout.Label("1星真实秒伤", GUILayout.Width(95));
            EditorGUILayout.EndHorizontal();

            for (int i = 0; i < _cfg.Heroes.Length && i < Defs.Heroes.Length; i++)
            {
                var r = _cfg.Heroes[i];
                var def = Defs.Heroes[i];
                if (_roleFilter >= 0 && (int)def.Kind != _roleFilter) continue;
                if (_rarityFilter > 0 && r.Rarity != _rarityFilter) continue;
                if (!string.IsNullOrEmpty(_heroSearch) && !def.Name.Contains(_heroSearch) && !r.Id.IndexOf(_heroSearch, StringComparison.OrdinalIgnoreCase).Equals(0) && def.Nick.IndexOf(_heroSearch, StringComparison.OrdinalIgnoreCase) < 0)
                    continue;

                EditorGUILayout.BeginHorizontal("box");
                GUILayout.Label($"{def.Name} ({def.Nick})", EditorStyles.boldLabel, GUILayout.Width(92));
                GUILayout.Label($"{def.Role}·{(r.Rarity >= 4 ? "橙" : r.Rarity == 3 ? "紫" : "蓝")}", GUILayout.Width(76));
                if (def.Kind == Role.Support)
                {
                    r.BuffV = EditorGUILayout.FloatField(r.BuffV, GUILayout.Width(66));
                    r.Interval = EditorGUILayout.FloatField(r.Interval, GUILayout.Width(58));
                    GUILayout.Label("光环:" + r.AuraV.ToString("0.##"), GUILayout.Width(114));
                    r.AuraV = EditorGUILayout.FloatField(r.AuraV, GUILayout.Width(60));
                    GUILayout.Label("-", GUILayout.Width(60));
                }
                else
                {
                    r.Coef = EditorGUILayout.FloatField(r.Coef, GUILayout.Width(66));
                    r.Interval = EditorGUILayout.FloatField(r.Interval, GUILayout.Width(58));
                    r.Count = EditorGUILayout.IntField(r.Count, GUILayout.Width(42));
                    r.Chain = EditorGUILayout.IntField(r.Chain, GUILayout.Width(70));
                    r.Radius = EditorGUILayout.FloatField(r.Radius, GUILayout.Width(60));
                    r.Knock = EditorGUILayout.FloatField(r.Knock, GUILayout.Width(60));
                }
                if (r.Rarity >= 4) r.UltCoef = EditorGUILayout.FloatField(r.UltCoef, GUILayout.Width(66));
                else GUILayout.Label("-", GUILayout.Width(66));
                r.PassiveV = EditorGUILayout.FloatField(r.PassiveV, GUILayout.Width(56));

                float ticks = r.Chan > 0 && r.Tick > 0.01f ? r.Chan / r.Tick : 1f;
                float cycle = Math.Max(0.1f, r.Interval + r.Chan);
                float dps = def.Kind == Role.Support ? 0f : (r.Coef * r.Count * ticks + (r.Chan <= 0 ? r.Coef * r.Dot : 0f)) / cycle;
                GUILayout.Label(def.Kind == Role.Support ? $"辅助({r.Interval:0.#}s)" : $"{dps:F2} ×攻/s", GUILayout.Width(95));
                EditorGUILayout.EndHorizontal();

                EditorGUILayout.BeginHorizontal();
                GUILayout.Space(104);
                GUILayout.Label("特性", GUILayout.Width(36));
                r.TraitV = EditorGUILayout.FloatField(r.TraitV, GUILayout.Width(52));
                r.TraitN = EditorGUILayout.IntField(r.TraitN, GUILayout.Width(32));
                GUILayout.Label("绝技", GUILayout.Width(36));
                r.SigN = EditorGUILayout.IntField(r.SigN, GUILayout.Width(32));
                r.SigV = EditorGUILayout.FloatField(r.SigV, GUILayout.Width(52));
                r.SigV2 = EditorGUILayout.FloatField(r.SigV2, GUILayout.Width(52));
                GUILayout.Label("15级", GUILayout.Width(36));
                r.Opt15V = EditorGUILayout.FloatField(r.Opt15V, GUILayout.Width(52));
                r.Opt15V2 = EditorGUILayout.FloatField(r.Opt15V2, GUILayout.Width(52));
                r.HasKit = true;
                EditorGUILayout.EndHorizontal();
            }
        }

        // ---------------- 5. 外星军与首领表 ----------------

        void DrawEnemiesTab()
        {
            EditorGUILayout.BeginHorizontal("box");
            GUILayout.Label("筛选兵阶:", GUILayout.Width(65));
            _enemyRankFilter = GUILayout.Toolbar(_enemyRankFilter + 1, new[] { "全部 (29)", "普通小兵", "精英怪", "首领 Boss" }, GUILayout.Width(360)) - 1;
            GUILayout.FlexibleSpace();
            GUILayout.Label("提示：物理抗性受 P-8 红线保护封顶 0.50；全兵种局内赏银与面板完全一致（不做波次加成）。", EditorStyles.miniLabel);
            EditorGUILayout.EndHorizontal();

            EditorGUILayout.BeginHorizontal(EditorStyles.toolbar);
            GUILayout.Label("名称", GUILayout.Width(100));
            GUILayout.Label("品阶", GUILayout.Width(56));
            GUILayout.Label("基础血量Hp", GUILayout.Width(82));
            GUILayout.Label("移速Spd", GUILayout.Width(66));
            GUILayout.Label("拆墙Dps", GUILayout.Width(66));
            GUILayout.Label("赏银Coin", GUILayout.Width(68));
            GUILayout.Label("物抗PhysR", GUILayout.Width(72));
            GUILayout.Label("法易伤MagW", GUILayout.Width(78));
            GUILayout.Label("射易伤ArcW", GUILayout.Width(78));
            GUILayout.Label("局内实掉能量币", GUILayout.Width(95));
            EditorGUILayout.EndHorizontal();

            for (int i = 0; i < _cfg.Enemies.Length && i < Defs.Enemies.Length; i++)
            {
                var r = _cfg.Enemies[i];
                var def = Defs.Enemies[i];
                if (_enemyRankFilter >= 0 && (int)def.Rank != _enemyRankFilter) continue;

                EditorGUILayout.BeginHorizontal("box");
                GUILayout.Label(def.Name, EditorStyles.boldLabel, GUILayout.Width(100));
                GUILayout.Label(def.IsBoss ? "首领" : def.Big ? "精英" : "小兵", GUILayout.Width(56));
                r.Hp = EditorGUILayout.FloatField(r.Hp, GUILayout.Width(82));
                r.Speed = EditorGUILayout.FloatField(r.Speed, GUILayout.Width(66));
                r.WallDps = EditorGUILayout.FloatField(r.WallDps, GUILayout.Width(66));
                r.Coin = EditorGUILayout.IntField(r.Coin, GUILayout.Width(68));
                r.PhysResist = Mathf.Clamp(EditorGUILayout.FloatField(r.PhysResist, GUILayout.Width(72)), 0f, 0.50f);
                r.MagicWeak = Mathf.Max(0f, EditorGUILayout.FloatField(r.MagicWeak, GUILayout.Width(78)));
                r.ArcherWeak = Mathf.Max(0f, EditorGUILayout.FloatField(r.ArcherWeak, GUILayout.Width(78)));

                int w1Drop = def.Big
                    ? Mathf.RoundToInt(r.Coin * _cfg.Economy.BigKillCoinMul)
                    : Mathf.RoundToInt(r.Coin * _cfg.Economy.KillCoinMul);
                GUILayout.Label($"{w1Drop} 银", GUILayout.Width(95));
                EditorGUILayout.EndHorizontal();
            }
        }

        // ---------------- 6. 对局模拟验算 ----------------

        void DrawSimulatorTab()
        {
            Section("Sim.Bot 自动化对局沙盘（直接用当前面板数值实跑完整战斗）", () =>
            {
                _simStage = EditorGUILayout.IntSlider("测试关卡 (1~50)", _simStage, 1, Defs.LevelCount);
                _simSaveMode = EditorGUILayout.Popup("局外养成档位", _simSaveMode, new[]
                {
                    "标准同步养成 ExpectedSave(n)",
                    "纯 1 级白板新档 NewSave",
                    "落后 4 关养成 ExpectedSave(n-4)",
                });
                _simBotSkill = EditorGUILayout.Popup("AI 操作水平", _simBotSkill, new[]
                {
                    "Skill 0 - 纯召唤不合成不买强化（挂机测试）",
                    "Skill 1 - 只召唤+合成，绝不买强化词条",
                    "Skill 2 - 标准策略玩家（铺场+合成+买关键强化词条）",
                });
                _simTrials = EditorGUILayout.IntSlider("连续模拟局数（不同随机种子）", _simTrials, 1, 20);

                EditorGUILayout.Space(6);
                if (GUILayout.Button("运行对局模拟", GUILayout.Height(32)))
                    RunSimulation();
            });

            EditorGUILayout.LabelField("模拟验算报告", EditorStyles.boldLabel);
            EditorGUILayout.TextArea(_simReport, GUILayout.MinHeight(260));
        }

        void RunSimulation()
        {
            ApplyMemoryOnly();
            SaveData save = _simSaveMode == 1
                ? Meta.NewSave(0)
                : Meta.ExpectedSave(_simSaveMode == 2 ? Math.Max(1, _simStage - 4) : _simStage);
            var lo = Meta.BuildLoadout(save);
            var st = Defs.Level(_simStage);

            int wins = 0;
            float sumWaves = 0, sumTime = 0, sumSummons = 0, sumEnhances = 0;
            float sumKillCoins = 0, sumWaveCoins = 0, sumBossPhaseCoins = 0, sumReelCoins = 0;

            for (int seed = 1; seed <= _simTrials; seed++)
            {
                var b = new Battle(seed, lo.Lineup, st, lo);
                var bot = new Bot(_simBotSkill);
                while (b.Phase != Phase.Victory && b.Phase != Phase.Defeat && b.Time < 600f)
                {
                    bot.Step(b, 1f / 30f);
                    b.Update(1f / 30f);
                    b.Events.Clear();
                }
                if (b.Phase == Phase.Victory) wins++;
                sumWaves += b.Wave;
                sumTime += b.Time;
                sumSummons += b.Summons;
                sumEnhances += b.Enhances;
                sumKillCoins += b.CoinsFromKills;
                sumWaveCoins += b.CoinsFromWaves;
                sumBossPhaseCoins += b.CoinsFromBossPhase;
                sumReelCoins += b.CoinsFromReels;
            }

            float k = 1f / _simTrials;
            float routine = st.StartCoins + lo.StartCoins + (sumKillCoins + sumWaveCoins + sumBossPhaseCoins) * k;
            float reels = sumReelCoins * k;
            float total = Math.Max(1f, routine + reels);

            var sb = new StringBuilder();
            sb.AppendLine($"=== 第 {_simStage} 关 ({st.Name}) · 模拟 {_simTrials} 局汇总 ===");
            sb.AppendLine($"出战阵容: {string.Join(" / ", Array.ConvertAll(lo.Lineup, h => Defs.Hero(h).Name))}   |   关卡血量倍率: {st.HpMul:F2}x");
            sb.AppendLine($"通关胜率: {wins} / {_simTrials} ({100f * wins * k:0.0}%)   |   平均推进波次: {sumWaves * k:F1} 波   |   平均战斗时长: {sumTime * k:F0} 秒");
            sb.AppendLine($"平均付费召唤: {sumSummons * k:F1} 次   |   平均购买强化: {sumEnhances * k:F1} 次");
            sb.AppendLine();
            sb.AppendLine("--- 局均能量币产出渠道拆解 ---");
            sb.AppendLine($"  • 开局能量币:       {st.StartCoins + lo.StartCoins} 银");
            sb.AppendLine($"  • 击杀赏银(含首领): {sumKillCoins * k:F0} 银");
            sb.AppendLine($"  • 波次击退军饷:   {sumWaveCoins * k:F0} 银");
            sb.AppendLine($"  • 首领压血钱袋:   {sumBossPhaseCoins * k:F0} 银");
            sb.AppendLine($"  • 外星补给老虎机:   {reels:F0} 银  (占总局内获取 {100f * reels / total:0.0}%)");
            sb.AppendLine($"  • 单局累计总能量币: {total:F0} 银  (日常稳定占比 {100f * routine / total:0.0}%)");
            _simReport = sb.ToString();
        }

        // ---------------- UI 辅助 ----------------

        static void Section(string title, Action body)
        {
            EditorGUILayout.BeginVertical("box");
            EditorGUILayout.LabelField(title, EditorStyles.boldLabel);
            EditorGUILayout.Space(2);
            body();
            EditorGUILayout.EndVertical();
            EditorGUILayout.Space(4);
        }

        static int SumInt(int[] arr, int take)
        {
            if (arr == null || arr.Length == 0 || take <= 0) return 0;
            int n = Mathf.Min(arr.Length, take), s = 0;
            for (int i = 0; i < n; i++) s += arr[i];
            return s;
        }

        static int[] DrawIntArray(string label, int[] arr)
        {
            if (arr == null) arr = new int[0];
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField(label, GUILayout.Width(210));
            int len = Mathf.Clamp(EditorGUILayout.IntField("长度", arr.Length, GUILayout.Width(170)), 1, 60);
            if (len != arr.Length) Array.Resize(ref arr, len);
            EditorGUILayout.EndHorizontal();

            int cols = 9;
            for (int i = 0; i < arr.Length; i += cols)
            {
                EditorGUILayout.BeginHorizontal();
                GUILayout.Space(16);
                for (int j = i; j < Mathf.Min(arr.Length, i + cols); j++)
                    arr[j] = EditorGUILayout.IntField(arr[j], GUILayout.Width(56));
                EditorGUILayout.EndHorizontal();
            }
            return arr;
        }

        static float[] DrawFloatArray(string label, float[] arr)
        {
            if (arr == null) arr = new float[0];
            EditorGUILayout.BeginHorizontal();
            EditorGUILayout.LabelField(label, GUILayout.Width(210));
            int len = Mathf.Clamp(EditorGUILayout.IntField("长度", arr.Length, GUILayout.Width(170)), 1, 20);
            if (len != arr.Length) Array.Resize(ref arr, len);
            EditorGUILayout.EndHorizontal();

            int cols = 8;
            for (int i = 0; i < arr.Length; i += cols)
            {
                EditorGUILayout.BeginHorizontal();
                GUILayout.Space(16);
                for (int j = i; j < Mathf.Min(arr.Length, i + cols); j++)
                    arr[j] = EditorGUILayout.FloatField(arr[j], GUILayout.Width(64));
                EditorGUILayout.EndHorizontal();
            }
            return arr;
        }
    }
}
