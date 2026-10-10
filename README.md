# Fey Mounted

A Foundry VTT v13 module that lets one token stand for two actors. A typical use is a rider on a mount.
When you target the token, a popup asks whether you mean the **mount**, the **rider**, or **both**.
Damage, effects and animations then land on the correct character sheet.

## How it works

Linking a second actor to a token creates an **invisible companion token** for that actor. The companion is
stacked under the main token at the same position and size, and it moves with it. When you choose the rider
in the popup, the module moves your target onto the companion token.

The rider has a real token at the same spot as the mount, so all of these keep working with no special
handling:

- dnd5e chat card damage and effect application ("Targeted" mode)
- Automated Animations / DnD5e Animations, which play on the target's location
- Range and distance checks, because both actors are measured from the same position

## Install (development)

Foundry needs the folder name to match the module id, which is `feymounted`. Link this repo into your data
folder (in an elevated PowerShell):

```powershell
New-Item -ItemType SymbolicLink -Path "$env:LOCALAPPDATA\FoundryVTT\Data\modules\feymounted" -Target "G:\Projects\Claude\FeyMounted\FeyMounted"
```

Then turn on **Fey Mounted** under *Manage Modules* in your world.

## Usage

1. **GM:** right-click the mount's token to open the Token HUD. Click the **horse** button and pick the
   rider's actor. You can also choose an **Image without rider** and an **Image with rider**. Linking switches
   the token to the rider image, and unlinking (or deleting the rider's token) switches it back. The images are
   saved on the mount's actor, so the dialog remembers them for that mount in every scene.
2. **Anyone:** target the mount as usual (T key or right-click > target). Choose *Mount*, *Rider*, or *Both*.
   Closing the popup keeps the mount targeted.
3. Target the mount again to clear a rider target, just like toggling a normal target.
4. While the rider is targeted, a label with their name appears above the mount.
5. **To dismount:** open the HUD again and click the horse-head button. This deletes the companion token.

Copy/pasting a linked token creates a fresh companion for the pasted copy. Deleting the main token
deletes its companion.

## Settings

- **Companion token visibility** (world): *Transparent* (the default) or *GM-hidden*. Choose Transparent if
  the rider is a player character: their vision still works and animations play for everyone.
- **Show rider target badge** (client): turns the label above the mount on or off.

## Macro API

```js
const api = game.modules.get("feymounted").api;
await api.linkActor(mountTokenDoc, riderActor);
await api.unlinkActor(mountTokenDoc);
api.getCompanion(mountTokenDoc); // -> rider TokenDocument | null
api.getParent(riderTokenDoc);    // -> mount TokenDocument | null
await api.setMountImages(mountTokenDoc, { unmounted: "path/horse.webp", mounted: "path/horse-rider.webp" });
```
