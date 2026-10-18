export type ComposerTargetProbe = {
  height: number;
  width: number;
  windowHeight: number;
  description?: string;
  role?: string;
};

export const MAX_COMPOSER_HEIGHT_RATIO = 0.45;
export const MIN_COMPOSER_HEIGHT = 24;
export const MIN_COMPOSER_WIDTH = 80;

export function isComposerLikeTarget(target: ComposerTargetProbe): boolean {
  const label = `${target.role ?? ""} ${target.description ?? ""}`.toLowerCase();
  if (/(?:monaco|terminal|debug console|\boutput\b)/.test(label) && !/(?:composer|chat input|prompt)/.test(label)) {
    return false;
  }
  if (target.height < MIN_COMPOSER_HEIGHT) {
    return false;
  }
  if (target.height > target.windowHeight * MAX_COMPOSER_HEIGHT_RATIO) {
    return false;
  }
  if (target.width < MIN_COMPOSER_WIDTH) {
    return false;
  }
  return true;
}

export function composerClickYOffsets(windowHeight: number): number[] {
  return [
    110,
    150,
    190,
    230,
    Math.max(80, windowHeight - 56),
    Math.max(80, windowHeight - 96),
    Math.max(80, windowHeight - 72),
    Math.max(80, windowHeight - 140),
  ];
}

export function composerClickXRatios(): number[] {
  return [0.52, 0.72, 0.85];
}
