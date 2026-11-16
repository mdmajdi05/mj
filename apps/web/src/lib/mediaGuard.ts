/**
 * Temporary shield for the chat privacy guard.
 *
 * Opening a native file picker, the camera or a permission sheet makes the
 * document `hidden`. The privacy guard would otherwise treat that as the user
 * leaving the chat and send them back to the home screen. This module lets a
 * media interaction declare itself before the browser hides the tab and keeps
 * the chat alive until the picker/camera/upload finishes.
 */
let active = 0;
let quietUntil = 0;

const DEFAULT_QUIET_MS = 90_000;

export function beginMediaInteraction() {
  active += 1;
  quietUntil = Date.now() + DEFAULT_QUIET_MS;
}

export function endMediaInteraction() {
  active = Math.max(0, active - 1);
  // Some browsers fire `visibilitychange` slightly after `change`; keep a
  // short grace window so the returning page does not get redirected.
  quietUntil = Date.now() + 5_000;
}

/** Keeps the guard quiet while a long upload is running. */
export function holdMediaInteraction(ms = DEFAULT_QUIET_MS) {
  quietUntil = Math.max(quietUntil, Date.now() + ms);
}

export function mediaInteractionActive() {
  return active > 0 || Date.now() < quietUntil;
}
