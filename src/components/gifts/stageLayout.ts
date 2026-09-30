/**
 * Safe areas for gifts (docs/gift-render-spec.md, "Safe areas"), computed from the size of the
 * live viewport. Percentages are of the viewport; gutters are points.
 */
import { useMemo } from 'react';

export type Rect = { x: number; y: number; w: number; h: number };

export const GUARD = {
  /** Top guard: creator header, viewer count, close. */
  top: 0.14,
  /** Bottom guard starts here: chat, composer, gift button. */
  bottom: 0.72,
  gutter: 16,
  /** Stage box (Mode C). */
  boxTop: 0.18,
  boxBottom: 0.68,
  /** Takeover covers everything except the top 10% and bottom 12%. */
  takeoverTop: 0.1,
  takeoverBottom: 0.12,
  /** Max alpha for anything that bleeds into a guard. */
  guardAlpha: 0.4,
  maxBleed: 0.12,
} as const;

export type GiftStage = {
  size: { w: number; h: number };
  topGuard: Rect;
  bottomGuard: Rect;
  gutter: number;
  /** Where the recognizable subject of a Stage gift lives. */
  stageBox: Rect;
  /** Stage box plus the allowed bleed: particles and light may reach this far, never further. */
  bleedBox: Rect;
  /** Mode D. */
  takeover: Rect;
  /** Mode A: cards stack upward from the bottom of this rect, on the right. */
  rail: Rect;
  /** Alpha cap for a point at viewport y: 0.4 inside a guard, 1 elsewhere. */
  alphaCapAt: (y: number) => number;
};

export function computeGiftStage(w: number, h: number, bleedPct = 12): GiftStage {
  const topH = h * GUARD.top;
  const bottomY = h * GUARD.bottom;
  const stageBox: Rect = {
    x: GUARD.gutter,
    y: h * GUARD.boxTop,
    w: Math.max(0, w - GUARD.gutter * 2),
    h: h * (GUARD.boxBottom - GUARD.boxTop),
  };
  const bleed = Math.min(bleedPct, GUARD.maxBleed * 100) / 100;
  const bx = stageBox.w * bleed;
  const by = stageBox.h * bleed;
  const bleedBox: Rect = {
    x: Math.max(0, stageBox.x - bx),
    y: Math.max(0, stageBox.y - by),
    w: 0,
    h: 0,
  };
  bleedBox.w = Math.min(w, stageBox.x + stageBox.w + bx) - bleedBox.x;
  bleedBox.h = Math.min(h, stageBox.y + stageBox.h + by) - bleedBox.y;

  return {
    size: { w, h },
    topGuard: { x: 0, y: 0, w, h: topH },
    bottomGuard: { x: 0, y: bottomY, w, h: h - bottomY },
    gutter: GUARD.gutter,
    stageBox,
    bleedBox,
    takeover: {
      x: 0,
      y: h * GUARD.takeoverTop,
      w,
      h: h * (1 - GUARD.takeoverTop - GUARD.takeoverBottom),
    },
    rail: { x: GUARD.gutter, y: topH, w: Math.max(0, w - GUARD.gutter * 2), h: bottomY - topH },
    alphaCapAt: (y) => (y < topH || y > bottomY ? GUARD.guardAlpha : 1),
  };
}

export function useGiftStage(size: { w: number; h: number }, bleedPct = 12): GiftStage {
  return useMemo(() => computeGiftStage(size.w, size.h, bleedPct), [size.w, size.h, bleedPct]);
}
