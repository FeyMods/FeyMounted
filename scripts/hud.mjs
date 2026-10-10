import { MODULE_ID, escapeHTML, localize } from "./constants.mjs";
import { getCompanion, getMountImages, isCompanion, linkActor, setMountImages, unlinkActor } from "./links.mjs";

const { DialogV2 } = foundry.applications.api;

async function promptLink(primary) {
  // Only player characters can ride.
  const actors = game.actors
    .filter(a => (a.type === "character") && (a !== primary.actor) && (a !== primary.baseActor))
    .sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
  if ( !actors.length ) return ui.notifications.warn(localize("Link.NoActors"));

  const options = actors.map(a => `<option value="${a.id}">${escapeHTML(a.name)}</option>`).join("");
  const images = getMountImages(primary);
  const imageField = (name, value) => `<div class="form-group">
      <label>${localize(`Link.Image.${name}`)}</label>
      <div class="form-fields">
        <file-picker name="${name}" type="image" value="${escapeHTML(value)}"></file-picker>
      </div>
    </div>`;

  const data = await DialogV2.prompt({
    window: { title: localize("Link.Title"), icon: "fa-solid fa-horse-head" },
    position: { width: 480 },
    content: `<div class="form-group">
        <label>${localize("Link.Label")}</label>
        <div class="form-fields"><select name="actorId">${options}</select></div>
      </div>
      <p class="hint">${localize("Link.Hint")}</p>
      <fieldset>
        <legend>${localize("Link.Image.Legend")}</legend>
        ${imageField("unmounted", images.unmounted || primary.texture.src)}
        ${imageField("mounted", images.mounted)}
        <p class="hint">${localize("Link.Image.Hint")}</p>
      </fieldset>`,
    ok: {
      label: localize("Link.Confirm"),
      icon: "fa-solid fa-link",
      callback: (event, button) => new foundry.applications.ux.FormDataExtended(button.form).object
    },
    rejectClose: false
  });
  const actor = game.actors.get(data?.actorId);
  if ( !actor ) return;

  await setMountImages(primary, { mounted: data.mounted, unmounted: data.unmounted });
  await linkActor(primary, actor);
  ui.notifications.info(localize("Link.Linked", { companion: actor.name, primary: primary.name }));
}

async function promptUnlink(primary) {
  const companion = getCompanion(primary);
  const names = { companion: escapeHTML(companion?.name), primary: escapeHTML(primary.name) };
  const confirmed = await DialogV2.confirm({
    window: { title: localize("Unlink.Title"), icon: "fa-solid fa-link-slash" },
    content: `<p>${localize("Unlink.Content", names)}</p>`,
    rejectClose: false
  });
  if ( !confirmed ) return;

  await unlinkActor(primary);
  ui.notifications.info(localize("Unlink.Unlinked", { companion: companion?.name, primary: primary.name }));
}

function onRenderTokenHUD(hud, html) {
  if ( !game.user.isGM ) return;
  const primary = hud.object?.document;
  if ( !primary || isCompanion(primary) ) return;

  const linked = !!getCompanion(primary);
  const button = document.createElement("button");
  button.type = "button";
  button.classList.add("control-icon", "feymounted-hud");
  button.classList.toggle("active", linked);
  button.dataset.tooltip = localize(linked ? "HUD.Unlink" : "HUD.Link");
  button.innerHTML = `<i class="fa-solid ${linked ? "fa-horse-head" : "fa-horse"}" inert></i>`;
  button.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    hud.close();
    if ( linked ) promptUnlink(primary);
    else promptLink(primary);
  });
  html.querySelector(".col.left")?.append(button);
}

export function registerHUDHooks() {
  Hooks.on("renderTokenHUD", onRenderTokenHUD);
}
