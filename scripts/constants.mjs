export const MODULE_ID = "feymounted";

export const FLAGS = {
  /** On the primary token: id of the companion token in the same scene. */
  COMPANION_TOKEN: "companionTokenId",
  /** On the primary token: uuid of the companion actor, used to rebuild the companion after copy/paste. */
  COMPANION_ACTOR: "companionActorUuid",
  /** On the companion token: id of the primary token it follows. */
  PARENT_TOKEN: "parentTokenId",
  /** On the primary's base actor: {mounted, unmounted} token image paths. */
  IMAGES: "images"
};

export const SETTINGS = {
  COMPANION_MODE: "companionMode",
  SHOW_BADGE: "showBadge"
};

/**
 * Token fields mirrored from the primary token onto its companion.
 * `depth` and `level` only exist from Foundry v14 (Scene Levels), so callers skip fields the schema lacks.
 */
export const SYNCED_FIELDS = ["x", "y", "elevation", "width", "height", "depth", "level"];

export function localize(key, data) {
  const full = `FEYMOUNTED.${key}`;
  return data ? game.i18n.format(full, data) : game.i18n.localize(full);
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

/** True on exactly one connected GM client, which performs all document writes. */
export function isResponsibleGM() {
  return game.users.activeGM?.isSelf ?? false;
}
