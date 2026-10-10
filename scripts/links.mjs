import { FLAGS, MODULE_ID, SETTINGS, SYNCED_FIELDS, isResponsibleGM } from "./constants.mjs";

/* -------------------------------------------- */
/*  Lookups                                     */
/* -------------------------------------------- */

/**
 * The companion TokenDocument linked to a primary token, if any.
 * @param {TokenDocument} tokenDoc
 * @returns {TokenDocument|null}
 */
export function getCompanion(tokenDoc) {
  const id = tokenDoc?.getFlag(MODULE_ID, FLAGS.COMPANION_TOKEN);
  if ( !id ) return null;
  const companion = tokenDoc.parent?.tokens.get(id);
  // Guard against stale flags, e.g. after the primary token was copy/pasted.
  if ( companion?.getFlag(MODULE_ID, FLAGS.PARENT_TOKEN) !== tokenDoc.id ) return null;
  return companion;
}

/**
 * The primary TokenDocument a companion token follows, if any.
 * @param {TokenDocument} tokenDoc
 * @returns {TokenDocument|null}
 */
export function getParent(tokenDoc) {
  const id = tokenDoc?.getFlag(MODULE_ID, FLAGS.PARENT_TOKEN);
  if ( !id ) return null;
  const parent = tokenDoc.parent?.tokens.get(id);
  if ( parent?.getFlag(MODULE_ID, FLAGS.COMPANION_TOKEN) !== tokenDoc.id ) return null;
  return parent;
}

export function isCompanion(tokenDoc) {
  return !!tokenDoc?.getFlag(MODULE_ID, FLAGS.PARENT_TOKEN);
}

/* -------------------------------------------- */
/*  Linking                                     */
/* -------------------------------------------- */

/**
 * Create an invisible companion token for an actor, stacked under the primary token.
 * @param {TokenDocument} primary
 * @param {Actor} actor
 * @returns {Promise<TokenDocument>}
 */
export async function linkActor(primary, actor) {
  if ( getCompanion(primary) ) await unlinkActor(primary);
  const mode = game.settings.get(MODULE_ID, SETTINGS.COMPANION_MODE);
  const { NONE } = CONST.TOKEN_DISPLAY_MODES;

  const overrides = {
    sort: primary.sort - 1,
    alpha: mode === "transparent" ? 0 : 1,
    hidden: mode === "hidden" ? true : primary.hidden,
    locked: false,
    displayName: NONE,
    displayBars: NONE,
    ring: { enabled: false },
    flags: { [MODULE_ID]: { [FLAGS.PARENT_TOKEN]: primary.id } }
  };
  for ( const field of SYNCED_FIELDS ) overrides[field] = primary[field];

  // Flag the primary before the companion exists, so the companion's createToken hook sees a valid link.
  const companionId = foundry.utils.randomID();
  const { mounted } = getMountImages(primary);
  await primary.update({
    [`flags.${MODULE_ID}.${FLAGS.COMPANION_TOKEN}`]: companionId,
    [`flags.${MODULE_ID}.${FLAGS.COMPANION_ACTOR}`]: actor.uuid,
    ...(mounted ? { "texture.src": mounted } : {})
  });

  const tokenData = (await actor.getTokenDocument(overrides)).toObject();
  tokenData._id = companionId;
  const [companion] = await primary.parent.createEmbeddedDocuments("Token", [tokenData], { keepId: true });
  return companion;
}

/**
 * Delete a primary token's companion and clear the link.
 * @param {TokenDocument} primary
 */
export async function unlinkActor(primary) {
  const companion = getCompanion(primary);
  await primary.update(getUnlinkUpdate(primary));
  if ( companion ) await companion.delete();
}

/**
 * Update data that clears a primary token's link and restores its unmounted image.
 * @param {TokenDocument} primary
 * @returns {object}
 */
function getUnlinkUpdate(primary) {
  const update = {
    [`flags.${MODULE_ID}.-=${FLAGS.COMPANION_TOKEN}`]: null,
    [`flags.${MODULE_ID}.-=${FLAGS.COMPANION_ACTOR}`]: null
  };
  const { mounted, unmounted } = getMountImages(primary);
  if ( mounted && unmounted ) update["texture.src"] = unmounted;
  return update;
}

/* -------------------------------------------- */
/*  Mounted / unmounted images                  */
/* -------------------------------------------- */

/**
 * The token images a primary uses with and without a linked actor. Stored on the primary's base actor so
 * every token of that actor, in every scene, shares them.
 * @param {TokenDocument} primary
 * @returns {{mounted: string, unmounted: string}}   Empty strings mean "don't change the image".
 */
export function getMountImages(primary) {
  const actor = primary.baseActor ?? primary.actor;
  const images = actor?.getFlag(MODULE_ID, FLAGS.IMAGES) ?? {};
  return { mounted: images.mounted ?? "", unmounted: images.unmounted ?? "" };
}

/**
 * Save the mounted and unmounted images for a primary token's actor.
 * @param {TokenDocument} primary
 * @param {{mounted?: string, unmounted?: string}} images
 */
export async function setMountImages(primary, { mounted="", unmounted="" }={}) {
  const actor = primary.baseActor ?? primary.actor;
  await actor?.setFlag(MODULE_ID, FLAGS.IMAGES, { mounted, unmounted });
}

/* -------------------------------------------- */
/*  Keeping companions in step                  */
/* -------------------------------------------- */

function onUpdateToken(doc, changes, options) {
  if ( !isResponsibleGM() || isCompanion(doc) ) return;
  const companion = getCompanion(doc);
  if ( !companion ) return;

  const update = {};
  for ( const field of SYNCED_FIELDS ) {
    if ( field in changes ) update[field] = changes[field];
  }
  if ( ("hidden" in changes) && (game.settings.get(MODULE_ID, SETTINGS.COMPANION_MODE) === "transparent") ) {
    update.hidden = changes.hidden;
  }
  // Keep the companion underneath so the primary token always receives clicks and hovers.
  if ( ("sort" in changes) && (companion.sort >= doc.sort) ) update.sort = doc.sort - 1;

  if ( foundry.utils.isEmpty(update) ) return;
  // Companions made by v0.1.0 were locked, which may stop them following the primary.
  if ( companion.locked ) update.locked = false;
  companion.update(update, { animate: options.animate ?? true });
}

function onDeleteToken(doc) {
  if ( !isResponsibleGM() ) return;
  const companion = getCompanion(doc);
  if ( companion ) return companion.delete();
  const parent = getParent(doc);
  if ( parent ) parent.update(getUnlinkUpdate(parent));
}

/**
 * Handle tokens created with link flags already on them (copy/paste, duplication):
 * pasted primaries get a fresh companion, and orphaned companions are removed.
 */
async function onCreateToken(doc) {
  if ( !isResponsibleGM() ) return;

  if ( isCompanion(doc) ) {
    if ( !getParent(doc) ) await doc.delete();
    return;
  }

  const companionId = doc.getFlag(MODULE_ID, FLAGS.COMPANION_TOKEN);
  if ( !companionId || getCompanion(doc) ) return;
  const actorUuid = doc.getFlag(MODULE_ID, FLAGS.COMPANION_ACTOR);
  const actor = actorUuid ? await fromUuid(actorUuid) : null;
  if ( actor ) await linkActor(doc, actor);
  else await unlinkActor(doc);
}

/** Companion tokens should never be dragged around or box-selected on their own. */
function onControlToken(token, controlled) {
  if ( controlled && isCompanion(token.document) ) token.release();
}

/**
 * Foundry picks the most recently created token among overlapping ones for pointer events, which would
 * be the companion. Make companions ignore the pointer entirely so clicks, drags and hovers reach the primary.
 */
function makeCompanionInert(token) {
  if ( !isCompanion(token.document) ) return;
  token.eventMode = "none";
  token.interactiveChildren = false;
}

/**
 * dnd5e blocks movement through spaces held by creatures of another disposition, and treats occupied spaces
 * as difficult terrain. A companion always shares its primary's space, so it would block the primary itself.
 * The primary token already represents that space, so companions are left out of these checks entirely.
 * @param {GridOffset3D} gridSpace
 * @param {Token} token
 * @param {object} options
 * @param {Set<Token>} found   Tokens affecting the move, mutated in place.
 */
function ignoreCompanionsInOccupiedSpace(gridSpace, token, options, found) {
  for ( const t of found ) {
    if ( isCompanion(t.document) ) found.delete(t);
  }
}

export function registerLinkHooks() {
  Hooks.on("dnd5e.determineOccupiedGridSpaceBlocking", ignoreCompanionsInOccupiedSpace);
  Hooks.on("dnd5e.determineOccupiedGridSpaceDifficult", ignoreCompanionsInOccupiedSpace);
  Hooks.on("updateToken", onUpdateToken);
  Hooks.on("deleteToken", onDeleteToken);
  Hooks.on("createToken", onCreateToken);
  Hooks.on("controlToken", onControlToken);
  Hooks.on("drawToken", makeCompanionInert);
  Hooks.on("refreshToken", makeCompanionInert);
}
