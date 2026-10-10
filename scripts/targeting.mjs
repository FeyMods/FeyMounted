import { MODULE_ID, SETTINGS, escapeHTML, localize } from "./constants.mjs";
import { getCompanion, getParent } from "./links.mjs";

const { DialogV2 } = foundry.applications.api;

/** Primary token ids whose companion was released earlier in the current call stack. */
const recentlyReleased = new Set();

/** Primary token ids with a target prompt queued or open. */
const pending = new Set();

/* -------------------------------------------- */
/*  Target hook                                 */
/* -------------------------------------------- */

function onTargetToken(user, token, targeted) {
  const parent = getParent(token.document);
  if ( parent ) {
    parent.object?.renderFlags.set({ refreshState: true });
    if ( (user === game.user) && !targeted ) {
      // Foundry releases old targets before adding the new one, all synchronously. Remembering the
      // release until the microtask queue runs lets us spot "target the mount again" as a toggle-off.
      recentlyReleased.add(parent.id);
      queueMicrotask(() => recentlyReleased.delete(parent.id));
    }
    return;
  }

  if ( (user !== game.user) || !targeted ) return;
  const companion = getCompanion(token.document)?.object;
  if ( !companion ) return;

  // The user re-targeted a mount whose rider they were already targeting: clear it, like toggling a normal target.
  if ( recentlyReleased.has(token.id) ) {
    token.setTarget(false, { releaseOthers: false });
    return;
  }

  // Defer so area templates that target the mount and its companion in one pass can finish first.
  if ( pending.has(token.id) ) return;
  pending.add(token.id);
  setTimeout(() => promptForTarget(token, companion).finally(() => pending.delete(token.id)), 0);
}

/* -------------------------------------------- */
/*  Prompt                                      */
/* -------------------------------------------- */

function portrait(tokenDoc) {
  return `<figure>
    <img src="${escapeHTML(tokenDoc.texture.src)}" alt="">
    <figcaption>${escapeHTML(tokenDoc.name)}</figcaption>
  </figure>`;
}

/**
 * Ask which actor the user meant, then move the target onto the right token(s).
 * @param {Token} token       The primary token that was targeted
 * @param {Token} companion   Its companion token
 */
async function promptForTarget(token, companion) {
  const targets = game.user.targets;
  if ( !targets.has(token) ) return;
  // Both already targeted (e.g. by an area template): nothing to ask.
  if ( targets.has(companion) ) return;

  const primaryDoc = token.document;
  const companionDoc = companion.document;
  const choice = await DialogV2.wait({
    window: { title: localize("Target.Title"), icon: "fa-solid fa-crosshairs" },
    classes: [MODULE_ID],
    content: `<p>${localize("Target.Content", { name: escapeHTML(primaryDoc.name) })}</p>
      <div class="feymounted-choice">${portrait(primaryDoc)}${portrait(companionDoc)}</div>`,
    buttons: [
      { action: "primary", label: primaryDoc.name, icon: "fa-solid fa-horse", default: true },
      { action: "companion", label: companionDoc.name, icon: "fa-solid fa-user" },
      { action: "both", label: localize("Target.Both"), icon: "fa-solid fa-users" }
    ],
    rejectClose: false
  });

  // Closing the dialog keeps the default behaviour: the primary token stays targeted.
  if ( !choice || (choice === "primary") ) return;
  // Either token may have been removed or untargeted while the dialog was open.
  if ( token.destroyed || companion.destroyed || !game.user.targets.has(token) ) return;

  if ( choice === "companion" ) token.setTarget(false, { releaseOthers: false });
  companion.setTarget(true, { releaseOthers: false });
}

/* -------------------------------------------- */
/*  Badge                                       */
/* -------------------------------------------- */

const BADGE_KEY = Symbol(MODULE_ID);

/**
 * The companion token is invisible, so its target reticle may be too. Draw a label on the
 * primary token while anyone is targeting the companion.
 */
function onRefreshToken(token) {
  const companion = getCompanion(token.document)?.object;
  const users = companion ? Array.from(companion.targeted) : [];
  let badge = token[BADGE_KEY];

  if ( !users.length || !game.settings.get(MODULE_ID, SETTINGS.SHOW_BADGE) ) {
    if ( badge ) badge.visible = false;
    return;
  }

  if ( !badge || badge.destroyed ) {
    const style = foundry.canvas.containers.PreciseText.getTextStyle({ fontSize: 18 });
    badge = token[BADGE_KEY] = token.addChild(new foundry.canvas.containers.PreciseText("", style));
    badge.anchor.set(0.5, 1);
  }
  badge.text = `◎ ${companion.document.name}`;
  badge.style.fill = users[0].color.css;
  badge.position.set(token.w / 2, -4);
  badge.visible = true;
}

export function registerTargetingHooks() {
  Hooks.on("targetToken", onTargetToken);
  Hooks.on("refreshToken", onRefreshToken);
}
