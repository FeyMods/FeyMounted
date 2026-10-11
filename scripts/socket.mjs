import { MODULE_ID, isResponsibleGM, localize } from "./constants.mjs";
import { linkActor, setMountImages, unlinkActor } from "./links.mjs";

/**
 * Players usually can't create or delete tokens, so non-GM users ask the active GM to link and unlink for them.
 * The GM checks that the requesting user owns everything involved before doing anything.
 */

const SOCKET = `module.${MODULE_ID}`;

/** How long to wait for the GM to confirm it received a request. */
const RECEIPT_TIMEOUT_MS = 10000;

/** How long to wait for the GM to finish a request it has received. Linking can be slow if the GM's tab is busy. */
const RESULT_TIMEOUT_MS = 120000;

/** Requests this client sent and is waiting on, keyed by request id. */
const pending = new Map();

/** The GM handles requests one at a time, so a repeated request can't create a second companion. */
let queue = Promise.resolve();

/* -------------------------------------------- */
/*  Permissions                                 */
/* -------------------------------------------- */

/** Whether a user may link or unlink actors on this token. */
export function canManageLink(primary, user=game.user) {
  return user.isGM || primary.testUserPermission(user, "OWNER");
}

/** Whether a user may put this actor on a token. Only player characters can ride. */
export function canRide(actor, user=game.user) {
  return (actor?.type === "character") && (user.isGM || actor.testUserPermission(user, "OWNER"));
}

/* -------------------------------------------- */
/*  Requests                                    */
/* -------------------------------------------- */

/**
 * Link an actor to a token, as this user or through the GM.
 * @param {TokenDocument} primary
 * @param {Actor} actor
 * @param {{mounted?: string, unmounted?: string}} images
 */
export async function requestLink(primary, actor, images) {
  if ( game.user.isGM ) return performLink(primary, actor, images);
  return sendRequest("link", { sceneId: primary.parent.id, tokenId: primary.id, actorId: actor.id, images });
}

/**
 * Unlink a token's companion, as this user or through the GM.
 * @param {TokenDocument} primary
 */
export async function requestUnlink(primary) {
  if ( game.user.isGM ) return unlinkActor(primary);
  return sendRequest("unlink", { sceneId: primary.parent.id, tokenId: primary.id });
}

async function performLink(primary, actor, images) {
  await setMountImages(primary, images);
  await linkActor(primary, actor);
}

function sendRequest(action, data) {
  if ( !game.users.activeGM ) return Promise.reject(new Error(localize("Errors.NoGM")));
  const requestId = foundry.utils.randomID();
  return new Promise((resolve, reject) => {
    const request = { resolve, reject, timeout: null };
    request.restartTimer = (ms, key) => {
      clearTimeout(request.timeout);
      request.timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(localize(key)));
      }, ms);
    };
    request.restartTimer(RECEIPT_TIMEOUT_MS, "Errors.Timeout");
    pending.set(requestId, request);
    game.socket.emit(SOCKET, { action, requestId, ...data });
  });
}

/* -------------------------------------------- */
/*  Handling                                    */
/* -------------------------------------------- */

async function onMessage(message, senderId) {
  if ( message.action === "received" ) return onReceived(message);
  if ( message.action === "result" ) return onResult(message);
  if ( !isResponsibleGM() ) return;

  // Confirm receipt straight away, so the requester's short timeout doesn't include the time spent linking.
  game.socket.emit(SOCKET, { action: "received", requestId: message.requestId, userId: senderId });

  let error;
  const task = queue.then(() => handleRequest(message, game.users.get(senderId)));
  queue = task.catch(() => {});
  try {
    await task;
  } catch(err) {
    console.error(`${MODULE_ID} | ${message.action} request failed`, err);
    error = err.message;
  }
  game.socket.emit(SOCKET, { action: "result", requestId: message.requestId, userId: senderId, error });
}

async function handleRequest({ action, sceneId, tokenId, actorId, images }, user) {
  const primary = game.scenes.get(sceneId)?.tokens.get(tokenId);
  if ( !user || !primary || !canManageLink(primary, user) ) throw new Error(localize("Errors.Permission"));

  switch ( action ) {
    case "link": {
      const actor = game.actors.get(actorId);
      if ( !canRide(actor, user) ) throw new Error(localize("Errors.Permission"));
      const { mounted="", unmounted="" } = images ?? {};
      return performLink(primary, actor, { mounted: String(mounted), unmounted: String(unmounted) });
    }
    case "unlink":
      return unlinkActor(primary);
  }
}

function onReceived({ requestId, userId }) {
  if ( userId !== game.user.id ) return;
  pending.get(requestId)?.restartTimer(RESULT_TIMEOUT_MS, "Errors.SlowGM");
}

function onResult({ requestId, userId, error }) {
  if ( userId !== game.user.id ) return;
  const request = pending.get(requestId);
  if ( !request ) return;
  pending.delete(requestId);
  clearTimeout(request.timeout);
  if ( error ) request.reject(new Error(error));
  else request.resolve();
}

export function registerSocket() {
  game.socket.on(SOCKET, onMessage);

  // The server only relays module messages if it loaded a manifest with "socket": true. A server started
  // before updating from v0.1.0 still has the old manifest, so player requests never reach the GM.
  Hooks.once("ready", () => {
    if ( game.user.isGM && !game.modules.get(MODULE_ID).socket ) {
      ui.notifications.warn(localize("Errors.NoSocket"), { permanent: true });
    }
  });
}
