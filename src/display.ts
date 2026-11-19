export function needsLandscape(width: number, height: number, touch: boolean) {
  return touch && height > width;
}

export function needsPortrait(width: number, height: number, touch: boolean) {
  return touch && width > height;
}

export interface FullscreenActions {
  isFullscreen: () => boolean;
  requestFullscreen?: () => Promise<void> | void;
  lockLandscape?: () => Promise<void>;
}

/** Unsupported or denied browser APIs never prevent manual rotation and play. */
export async function enterLandscape(actions: FullscreenActions) {
  return enterFullscreenOrientation(actions);
}

export async function enterPortrait(actions: FullscreenActions) {
  return enterFullscreenOrientation(actions);
}

async function enterFullscreenOrientation(actions: FullscreenActions) {
  if (!actions.isFullscreen()) {
    if (!actions.requestFullscreen) return { fullscreen: false, locked: false };
    try {
      await actions.requestFullscreen();
    } catch {
      return { fullscreen: false, locked: false };
    }
  }
  let locked = false;
  if (actions.lockLandscape) {
    try {
      await actions.lockLandscape();
      locked = true;
    } catch {
      /* Manual rotation remains available. */
    }
  }
  return { fullscreen: actions.isFullscreen(), locked };
}
