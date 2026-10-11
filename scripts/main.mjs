import { MODULE_ID, SETTINGS } from "./constants.mjs";
import {
  getCompanion, getMountImages, getParent, linkActor, registerLinkHooks, setMountImages, unlinkActor
} from "./links.mjs";
import { registerTargetingHooks } from "./targeting.mjs";
import { registerHUDHooks } from "./hud.mjs";
import { registerSocket } from "./socket.mjs";

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, SETTINGS.COMPANION_MODE, {
    name: "FEYMOUNTED.Settings.CompanionMode.Name",
    hint: "FEYMOUNTED.Settings.CompanionMode.Hint",
    scope: "world",
    config: true,
    type: String,
    choices: {
      transparent: "FEYMOUNTED.Settings.CompanionMode.Transparent",
      hidden: "FEYMOUNTED.Settings.CompanionMode.Hidden"
    },
    default: "transparent"
  });

  game.settings.register(MODULE_ID, SETTINGS.SHOW_BADGE, {
    name: "FEYMOUNTED.Settings.ShowBadge.Name",
    hint: "FEYMOUNTED.Settings.ShowBadge.Hint",
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => canvas.tokens?.placeables.forEach(t => t.renderFlags.set({ refreshState: true }))
  });

  registerLinkHooks();
  registerTargetingHooks();
  registerHUDHooks();
  registerSocket();

  // Macro-friendly API: game.modules.get("feymounted").api
  game.modules.get(MODULE_ID).api = {
    linkActor, unlinkActor, getCompanion, getParent, getMountImages, setMountImages
  };
});
