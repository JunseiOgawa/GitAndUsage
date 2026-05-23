import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock Tauri API — Tauri は実際のネイティブ環境でしか動かないため
// テスト環境ではすべての invoke をモックに置き換える
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: vi.fn(() => ({
    startDragging: vi.fn().mockResolvedValue(undefined),
    onMoved: vi.fn().mockResolvedValue(() => {}),
    outerPosition: vi.fn().mockResolvedValue({ x: 0, y: 0 }),
  })),
  currentMonitor: vi.fn().mockResolvedValue(null),
  primaryMonitor: vi.fn().mockResolvedValue(null),
}));

// i18n モック
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: "ja", changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));
