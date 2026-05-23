import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { UsagePanel } from "../UsagePanel";
import type { AppConfig } from "../types";

// Helper
function createConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    repoPath: "",
    heightRatio: 0.2,
    usageJsonPath: "",
    enabledProviders: [],
    usageOnly: false,
    dockPosition: "right", // Coin default
    normalDockPosition: "floating", // Normal default
    ...overrides,
  };
}

describe("UsagePanel Dock Separation", () => {
  it("renders with normalDockPosition when usageOnly is false", () => {
    const config = createConfig({
      usageOnly: false,
      dockPosition: "right", // Should be ignored
      normalDockPosition: "bottom", // Should be used
    });

    const { container } = render(
      <UsagePanel
        snapshots={[]}
        loading={false}
        error={null}
        config={config}
        isUsageOnly={false}
        isPositionLocked={false}
        onToggleLock={vi.fn()}
        onDockChange={vi.fn()}
        onMoveMonitor={vi.fn()}
      />
    );

    // Should have dock-bottom class
    const rightPanel = container.querySelector(".right-panel");
    expect(rightPanel).toHaveClass("dock-bottom");
    expect(rightPanel).toHaveClass("normal-dock-bottom");

    // The 'bottom' button should be active
    const bottomBtn = screen.getByLabelText("Dock Bottom");
    expect(bottomBtn).toHaveClass("active");

    // The 'right' button should NOT be active
    const rightBtn = screen.getByLabelText("Dock Right");
    expect(rightBtn).not.toHaveClass("active");
  });

  it("renders with dockPosition when usageOnly is true (Coin Mode)", () => {
    const config = createConfig({
      usageOnly: true,
      dockPosition: "left", // Should be used
      normalDockPosition: "top", // Should be ignored
    });

    const { container } = render(
      <UsagePanel
        snapshots={[]}
        loading={false}
        error={null}
        config={config}
        isUsageOnly={true}
        isPositionLocked={false}
        onToggleLock={vi.fn()}
        onDockChange={vi.fn()}
        onMoveMonitor={vi.fn()}
      />
    );

    // Should have dock-left class, but NOT normal-dock-left (since it's usageOnly)
    const rightPanel = container.querySelector(".right-panel");
    expect(rightPanel).toHaveClass("dock-left");
    expect(rightPanel).not.toHaveClass("normal-dock-left");

    // The controller buttons are ONLY rendered in Normal Mode (!isUsageOnly)
    // So we don't expect them to exist here.
    const leftBtn = screen.queryByLabelText("Dock Left");
    expect(leftBtn).toBeNull();
  });

  it("horizontal layout is applied correctly based on mode", () => {
    // In Coin mode, top/bottom should trigger horizontal-dock-layout
    const coinConfig = createConfig({ usageOnly: true, dockPosition: "top" });
    const { container: coinContainer, unmount } = render(
      <UsagePanel
        snapshots={[]}
        loading={false}
        error={null}
        config={coinConfig}
        isUsageOnly={true}
        isPositionLocked={false}
      />
    );
    expect(coinContainer.querySelector(".right-panel")).toHaveClass("horizontal-dock-layout");
    unmount();

    // In Normal mode, top/bottom do NOT trigger horizontal-dock-layout (handled by normal-dock-*)
    const normalConfig = createConfig({ usageOnly: false, normalDockPosition: "top" });
    const { container: normalContainer } = render(
      <UsagePanel
        snapshots={[]}
        loading={false}
        error={null}
        config={normalConfig}
        isUsageOnly={false}
        isPositionLocked={false}
      />
    );
    expect(normalContainer.querySelector(".right-panel")).not.toHaveClass("horizontal-dock-layout");
  });
});
