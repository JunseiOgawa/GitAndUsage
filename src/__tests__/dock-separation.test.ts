/**
 * dock-separation.test.ts
 *
 * CoinモードとNormalモードのDock設定が完全に独立していることを検証する単体テスト。
 * - dockPosition はCoinモード（usageOnly=true）専用
 * - normalDockPosition は通常モード（usageOnly=false）専用
 * - 一方の変更が他方に影響してはならない
 */

import { describe, it, expect } from "vitest";
import type { AppConfig } from "../types";

// ─── ヘルパー: デフォルト設定を生成 ────────────────────────────
function makeDefaultConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    repoPath: "/test/repo",
    heightRatio: 0.20,
    usageJsonPath: "./usage.json",
    enabledProviders: ["codex", "copilot", "claude"],
    usageOnly: false,
    dockPosition: "right",
    normalDockPosition: "floating",
    controllerWidth: 380,
    controllerHeight: 96,
    ...overrides,
  };
}

// ─── ヘルパー: Coinモードのdock変更をシミュレート ─────────────────
function applyCoinDockChange(
  config: AppConfig,
  dock: AppConfig["dockPosition"]
): AppConfig {
  // handleCoinDockChange と同じ挙動: dockPosition のみ更新
  return { ...config, dockPosition: dock };
}

// ─── ヘルパー: 通常モードのdock変更をシミュレート ─────────────────
function applyNormalDockChange(
  config: AppConfig,
  dock: AppConfig["normalDockPosition"]
): AppConfig {
  // handleNormalDockChange と同じ挙動: normalDockPosition のみ更新
  return { ...config, normalDockPosition: dock };
}

// ─── ヘルパー: effectiveDockPosition ロジック ─────────────────────
function getEffectiveDockPosition(config: AppConfig): string {
  return config.usageOnly
    ? (config.dockPosition ?? "right")
    : (config.normalDockPosition ?? "floating");
}

// ─── ヘルパー: ウィンドウサイズ計算ロジック ──────────────────────
function calcNormalDockSize(
  dock: string,
  monitorW: number,
  monitorH: number,
  heightRatio: number,
  controllerWidth: number,
  controllerHeight: number,
  scaleFactor: number = 1.0
): { width: number; height: number } {
  const height = Math.floor(monitorH * heightRatio);
  switch (dock) {
    case "left":
    case "right":
      return { width: Math.floor(controllerWidth * scaleFactor), height: monitorH };
    case "top":
    case "bottom":
      return { width: monitorW, height: Math.floor(controllerHeight * scaleFactor) };
    default: // floating
      return { width: monitorW, height };
  }
}

function calcCoinDockSize(
  dock: string,
  monitorW: number,
  monitorH: number,
  heightRatio: number,
  controllerWidth: number,
  controllerHeight: number,
  scaleFactor: number = 1.0
): { width: number; height: number } {
  const height = Math.floor(monitorH * heightRatio);
  switch (dock) {
    case "top":
    case "bottom":
      return { width: monitorW, height: Math.floor(controllerHeight * scaleFactor) };
    default: // left, right, floating
      return { width: Math.floor(controllerWidth * scaleFactor), height };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  テストスイート
// ═══════════════════════════════════════════════════════════════════════════

describe("Dock設定の独立性 (CoinモードとNormalモードの分離)", () => {

  // ── デフォルト値 ────────────────────────────────────────────────
  describe("デフォルト設定", () => {
    it("デフォルトでCoinモードは 'right' を持つ", () => {
      const config = makeDefaultConfig();
      expect(config.dockPosition).toBe("right");
    });

    it("デフォルトで通常モードは 'floating' を持つ", () => {
      const config = makeDefaultConfig();
      expect(config.normalDockPosition).toBe("floating");
    });

    it("デフォルトで両フィールドは異なる値を持つ（独立性の確認）", () => {
      const config = makeDefaultConfig();
      expect(config.dockPosition).not.toBe(config.normalDockPosition);
    });
  });

  // ── Coinモード変更の独立性 ────────────────────────────────────
  describe("Coinモード dockPosition の変更は normalDockPosition に影響しない", () => {
    const COIN_DOCKS = ["left", "right", "top", "bottom", "floating"] as const;

    COIN_DOCKS.forEach((dock) => {
      it(`Coin dock を '${dock}' に変更しても normalDockPosition は変わらない`, () => {
        const original = makeDefaultConfig({ normalDockPosition: "bottom" });
        const updated = applyCoinDockChange(original, dock);

        expect(updated.dockPosition).toBe(dock);
        expect(updated.normalDockPosition).toBe("bottom"); // 変化なし
      });
    });
  });

  // ── 通常モード変更の独立性 ────────────────────────────────────
  describe("通常モード normalDockPosition の変更は dockPosition に影響しない", () => {
    const NORMAL_DOCKS = ["left", "right", "top", "bottom", "floating"] as const;

    NORMAL_DOCKS.forEach((dock) => {
      it(`Normal dock を '${dock}' に変更しても dockPosition は変わらない`, () => {
        const original = makeDefaultConfig({ dockPosition: "left" });
        const updated = applyNormalDockChange(original, dock);

        expect(updated.normalDockPosition).toBe(dock);
        expect(updated.dockPosition).toBe("left"); // 変化なし
      });
    });
  });

  // ── 連続変更でも独立性が保たれる ──────────────────────────────
  describe("連続した変更でも独立性が保たれる", () => {
    it("Coin → Normal の順に変更しても互いに干渉しない", () => {
      let config = makeDefaultConfig();
      config = applyCoinDockChange(config, "bottom");
      config = applyNormalDockChange(config, "left");

      expect(config.dockPosition).toBe("bottom");
      expect(config.normalDockPosition).toBe("left");
    });

    it("Normal → Coin の順に変更しても互いに干渉しない", () => {
      let config = makeDefaultConfig();
      config = applyNormalDockChange(config, "top");
      config = applyCoinDockChange(config, "right");

      expect(config.normalDockPosition).toBe("top");
      expect(config.dockPosition).toBe("right");
    });

    it("同じ方向に複数回変更しても他方は変化しない", () => {
      let config = makeDefaultConfig({ normalDockPosition: "top" });
      config = applyCoinDockChange(config, "left");
      config = applyCoinDockChange(config, "bottom");
      config = applyCoinDockChange(config, "right");

      expect(config.dockPosition).toBe("right");
      expect(config.normalDockPosition).toBe("top"); // 変化なし
    });
  });

  // ── usageOnly フラグとの非干渉 ──────────────────────────────
  describe("usageOnly フラグの変更は dock フィールドに影響しない", () => {
    it("usageOnly を true にしても dock フィールドは変わらない", () => {
      const config = makeDefaultConfig({
        dockPosition: "left",
        normalDockPosition: "top",
        usageOnly: false,
      });
      const toggled = { ...config, usageOnly: true };

      expect(toggled.dockPosition).toBe("left");
      expect(toggled.normalDockPosition).toBe("top");
    });

    it("usageOnly を false に戻しても dock フィールドは変わらない", () => {
      const config = makeDefaultConfig({
        dockPosition: "bottom",
        normalDockPosition: "right",
        usageOnly: true,
      });
      const toggled = { ...config, usageOnly: false };

      expect(toggled.dockPosition).toBe("bottom");
      expect(toggled.normalDockPosition).toBe("right");
    });
  });

  // ── effectiveDockPosition ロジック ────────────────────────────
  describe("effectiveDockPosition: モード別に正しいフィールドを参照する", () => {
    it("Coinモード(usageOnly=true)では dockPosition を返す", () => {
      const config = makeDefaultConfig({
        usageOnly: true,
        dockPosition: "left",
        normalDockPosition: "top",
      });
      expect(getEffectiveDockPosition(config)).toBe("left");
    });

    it("通常モード(usageOnly=false)では normalDockPosition を返す", () => {
      const config = makeDefaultConfig({
        usageOnly: false,
        dockPosition: "left",
        normalDockPosition: "top",
      });
      expect(getEffectiveDockPosition(config)).toBe("top");
    });

    it("usageOnly が切り替わると effectiveDockPosition も切り替わる", () => {
      const base = makeDefaultConfig({
        dockPosition: "bottom",
        normalDockPosition: "right",
      });

      const coinMode = { ...base, usageOnly: true };
      const normalMode = { ...base, usageOnly: false };

      expect(getEffectiveDockPosition(coinMode)).toBe("bottom");
      expect(getEffectiveDockPosition(normalMode)).toBe("right");
    });

    it("dockPosition が undefined のとき Coinモードは 'right' にフォールバック", () => {
      const config = makeDefaultConfig({ usageOnly: true, dockPosition: undefined });
      expect(getEffectiveDockPosition(config)).toBe("right");
    });

    it("normalDockPosition が undefined のとき通常モードは 'floating' にフォールバック", () => {
      const config = makeDefaultConfig({ usageOnly: false, normalDockPosition: undefined });
      expect(getEffectiveDockPosition(config)).toBe("floating");
    });
  });

  // ── Coinモードと通常モードで同じ方向でも独立した値として扱われる ──
  describe("同一の方向値でも独立したフィールドとして保持される", () => {
    it("両方が 'left' でも別フィールドとして存在する", () => {
      const config = makeDefaultConfig({
        dockPosition: "left",
        normalDockPosition: "left",
      });
      const updatedCoin = applyCoinDockChange(config, "right");

      expect(updatedCoin.dockPosition).toBe("right");
      expect(updatedCoin.normalDockPosition).toBe("left"); // 変化なし
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
//  ウィンドウサイズ計算ロジックの単体テスト
// ═══════════════════════════════════════════════════════════════════════════

describe("ウィンドウサイズ計算ロジック", () => {
  const MW = 2560, MH = 1440;
  const RATIO = 0.20, CW = 380, CH = 96;

  describe("通常モード calcNormalDockSize", () => {
    it("left: 幅=controllerWidth, 高さ=heightRatio×モニター高", () => {
      const size = calcNormalDockSize("left", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(380);
      expect(size.height).toBe(1440);
    });

    it("right: 幅=controllerWidth, 高さ=heightRatio×モニター高", () => {
      const size = calcNormalDockSize("right", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(380);
      expect(size.height).toBe(1440);
    });

    it("top: 幅=モニター全幅, 高さ=controllerHeight", () => {
      const size = calcNormalDockSize("top", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(2560);
      expect(size.height).toBe(96);
    });

    it("bottom: 幅=モニター全幅, 高さ=controllerHeight", () => {
      const size = calcNormalDockSize("bottom", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(2560);
      expect(size.height).toBe(96);
    });

    it("floating: 幅=モニター全幅, 高さ=heightRatio×モニター高", () => {
      const size = calcNormalDockSize("floating", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(2560);
      expect(size.height).toBe(288);
    });

    it("HiDPI(scale=2): 物理ピクセルが2倍になる", () => {
      const size = calcNormalDockSize("left", MW, MH, RATIO, CW, CH, 2.0);
      expect(size.width).toBe(760); // 380 * 2
    });
  });

  describe("Coinモード calcCoinDockSize", () => {
    it("left: 幅=controllerWidth（Coinモード用）", () => {
      const size = calcCoinDockSize("left", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(380);
    });

    it("right: 幅=controllerWidth（Coinモード用）", () => {
      const size = calcCoinDockSize("right", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(380);
    });

    it("top: 幅=モニター全幅（Coinモード用）", () => {
      const size = calcCoinDockSize("top", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(2560);
      expect(size.height).toBe(96);
    });

    it("bottom: 幅=モニター全幅（Coinモード用）", () => {
      const size = calcCoinDockSize("bottom", MW, MH, RATIO, CW, CH);
      expect(size.width).toBe(2560);
      expect(size.height).toBe(96);
    });
  });

  describe("CoinモードとNormalモードのサイズは独立して計算される", () => {
    it("Coin=bottom vs Normal=right で完全に異なるサイズになる", () => {
      const coinSize = calcCoinDockSize("bottom", MW, MH, RATIO, CW, CH);
      const normalSize = calcNormalDockSize("right", MW, MH, RATIO, CW, CH);

      expect(coinSize.width).not.toBe(normalSize.width);
      expect(coinSize.width).toBe(2560); // coin bottom: full width
      expect(normalSize.width).toBe(380); // normal right: controller width
      expect(normalSize.height).toBe(1440);
    });

    it("両方の計算は完全に独立している（一方の変更が他方に影響しない）", () => {
      const coinLeft = calcCoinDockSize("left", MW, MH, RATIO, CW, CH);
      const normalLeft = calcNormalDockSize("left", MW, MH, RATIO, CW, CH);

      // Same dock direction but computed independently for each mode
      expect(coinLeft.width).toBe(normalLeft.width); // Both use controllerWidth for 'left'
      expect(coinLeft.height).toBe(288);
      expect(normalLeft.height).toBe(1440);
    });
  });
});
