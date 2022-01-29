/**
 * A simple and flexible system for world-building using an arbitrary collection of character and item attributes
 * Author: Atropos
 * Software License: GNU GPLv3
 */

// Import Modules
import { PW } from "./config.js";
import { PwClassList } from "./config.js";
import { ActorPw } from "./actor/actor.js";
import { ItemPw } from "./item/item.js";
import { PwItemSheet } from "./item/item-sheet.js";
import { PwActorSheet } from "./actor/actor-sheet.js";
import { PwActorNpcSheet } from "./actor/actor-npc-sheet.js";
import { PwClassItemSheet } from "./item/class-item-sheet.js";
import { PwRegisterHelpers } from "./handlebars.js";
import { preloadHandlebarsTemplates } from "./templates.js";
import { PwUtility } from "./utility.js";
import { MigratePw } from "./migrate/migrate.js";

import * as chat from "./chat.js";

/* -------------------------------------------- */
/*  Foundry VTT Initialization                  */
/* -------------------------------------------- */

Hooks.once("init", async function() {
  console.log(`Initializing Paranoid World!`);

  game.paranoidworld = {
    ActorPw,
    ItemPw,
    rollItemMacro,
    PwUtility,
    MigratePw,
  };

  // TODO: Extend the combat class.
  // CONFIG.Combat.entityClass = CombatPw;

  CONFIG.PW = PW;
  CONFIG.Actor.documentClass = ActorPw;
  CONFIG.Item.documentClass = ItemPw;

  // Register sheet application classes
  Actors.unregisterSheet("core", ActorSheet);
  Actors.registerSheet("paranoidworld", PwActorSheet, {
    types: ['character'],
    makeDefault: true
  });
  Actors.registerSheet("paranoidworld", PwActorNpcSheet, {
    types: ['npc'],
    makeDefault: true
  });
  Items.unregisterSheet("core", ItemSheet);
  Items.registerSheet("paranoidworld", PwItemSheet, { makeDefault: false });
  Items.registerSheet("paranoidworld", PwClassItemSheet, {
    types: ['class'],
    makeDefault: true
  });

  PwRegisterHelpers.init();

  /**
   * Track the system version upon which point a migration was last applied
   */
  game.settings.register("paranoidworld", "systemMigrationVersion", {
    name: "System Migration Version",
    scope: "world",
    config: false,
    type: Number,
    default: 0
  });

  // Configurable system settings.
  game.settings.register("paranoidworld", "xpFormula", {
    name: game.i18n.localize("PW.Settings.xpFormula.name"),
    hint: game.i18n.localize("PW.Settings.xpFormula.hint"),
    scope: "world",
    config: true,
    type: String,
    default: "@attributes.level.value + 7"
  });

  game.settings.register("paranoidworld", "advForward", {
    name: game.i18n.localize("PW.Settings.advForward.name"),
    hint: game.i18n.localize("PW.Settings.advForward.hint"),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false
  });

  // TODO: Remove this setting.
  game.settings.register("paranoidworld", "itemIcons", {
    name: game.i18n.localize("PW.Settings.itemIcons.name"),
    hint: game.i18n.localize("PW.Settings.itemIcons.hint"),
    scope: 'client',
    config: false,
    type: Boolean,
    default: true
  });

  game.settings.register("paranoidworld", "nightmode", {
    name: game.i18n.localize("PW.Settings.nightmode.name"),
    hint: game.i18n.localize("PW.Settings.nightmode.hint"),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register("paranoidworld", "driveSingle", {
    name: game.i18n.localize("PW.Settings.driveSingle.name"),
    hint: game.i18n.localize("PW.Settings.driveSingle.hint"),
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  game.settings.register("paranoidworld", "drivePlural", {
    name: game.i18n.localize("PW.Settings.drivePlural.name"),
    hint: game.i18n.localize("PW.Settings.drivePlural.hint"),
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  game.settings.register("paranoidworld", "bondSingle", {
    name: game.i18n.localize("PW.Settings.bondSingle.name"),
    hint: game.i18n.localize("PW.Settings.bondSingle.hint"),
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  game.settings.register("paranoidworld", "bondPlural", {
    name: game.i18n.localize("PW.Settings.bondPlural.name"),
    hint: game.i18n.localize("PW.Settings.bondPlural.hint"),
    scope: 'world',
    config: true,
    type: String,
    default: ''
  });

  PwUtility.replaceRollData();

  // Preload template partials.
  preloadHandlebarsTemplates();
});

Hooks.once("ready", async function() {
  // Wait to register hotbar drop hook on ready so that modules could register earlier if they want to
  Hooks.on("hotbarDrop", (bar, data, slot) => createPwMacro(data, slot));

  PW.classlist = await PwClassList.getClasses();
  CONFIG.PW = PW;

  // Add a lang class to the body.
  const lang = game.settings.get('core', 'language');
  $('html').addClass(`lang-${lang}`);

  // Run migrations.
  MigratePw.runMigration();

  // Update config.
  for (let [k,v] of Object.entries(CONFIG.PW.rollResults)) {
    CONFIG.PW.rollResults[k].label = game.i18n.localize(v.label);
  }

  // Add nightmode class.
  CONFIG.PW.nightmode = game.settings.get('paranoidworld', 'nightmode') ?? false;

  // Handle sockets.
  game.socket.on('system.paranoidworld', (data) => {
    if (!game.user.isGM) {
      return;
    }

    // Update chat cards.
    if (data?.message && data?.content) {
      let message = game.messages.get(data.message);
      message.update({'content': data.content});
    }

    // Update the move counter if a player made a move. Requires a GM account
    // to be logged in currently for the socket to work. If GM account is the
    // one that made the move, that happens directly in the actor update.
    if (data?.combatantUpdate) {
      game.combat.updateEmbeddedDocuments('Combatant', Array.isArray(data.combatantUpdate) ? data.combatantUpdate : [data.combatantUpdate]);
      ui.combat.render();
    }
  });
});

Hooks.on('createChatMessage', async (message, options, id) => {
  if (message?.data?.roll) {
    // Limit this to a single user.
    let firstGM = game.users.find(u => u.active && u.role == CONST.USER_ROLES.GAMEMASTER);
    if (!game.user.isGM || game.user.id !== firstGM.id) return;
    // Exit early if this is a rollable table.
    if (message?.data?.flags?.core?.RollTable) return;
    // Retrieve the roll.
    let r = Roll.fromJSON(message.data.roll);
    // Re-render the roll.
    r.render();
  }
});

Hooks.on('renderChatMessage', (app, html, data) => {
  // Determine visibility.
  let chatData = app.data;
  const whisper = chatData.whisper || [];
  const isBlind = whisper.length && chatData.blind;
  const isVisible = (whisper.length) ? game.user.isGM || whisper.includes(game.user.id) || (!isBlind) : true;
  if (!isVisible) {
    html.find('.dice-formula').text('???');
    html.find('.dice-total').text('?');
    html.find('.dice-tooltip').remove();
  }

  chat.displayChatActionButtons(app, html, data);
});

Hooks.on('renderChatLog', (app, html, data) => chat.activateChatListeners(html));
Hooks.on('renderChatPopout', (app, html, data) => chat.activateChatListeners(html));

/* -------------------------------------------- */
/*  Foundry VTT Setup                           */
/* -------------------------------------------- */

/**
 * This function runs after game data has been requested and loaded from the servers, so documents exist
 */
Hooks.once("setup", function() {

  // Localize CONFIG objects once up-front
  const toLocalize = [
    "abilities", "debilities"
  ];
  for (let o of toLocalize) {
    CONFIG.PW[o] = Object.entries(CONFIG.PW[o]).reduce((obj, e) => {
      obj[e[0]] = game.i18n.localize(e[1]);
      return obj;
    }, {});
  }
});

/* -------------------------------------------- */
/*  Actor Updates                               */
/* -------------------------------------------- */
Hooks.on('createActor', async (actor, options, id) => {
  // Prepare updates object.
  let updates = {};

  // Allow the character to levelup up when their level changes.
  if (actor.data.type == 'character') {
    await actor.setFlag('paranoidworld', 'levelup', true);


    // Get the item moves as the priority.
    let moves = game.items.filter(i => i.type == 'move' && (i.data.data.moveType == 'basic' || i.data.data.moveType == 'special'));
    let pack = game.packs.get(`paranoidworld.basic-moves`);
    let compendium = [];
    let actorMoves = [];
    compendium = pack ? await pack.getDocuments() : [];
    actorMoves = actor.items.filter(i => i.type == 'move');

    // Get the compendium moves next.
    let moves_compendium = compendium.filter(m => {
      const notTaken = actorMoves.filter(i => i.name == m.data.name);
      return notTaken.length < 1;
    });
    // Append compendium moves to the item moves.
    let moves_list = moves.map(m => {
      return m.data.name;
    })
    for (let move of moves_compendium) {
      if (!moves_list.includes(move.data.name)) {
        moves.push(move);
        moves_list.push(move.data.name);
      }
    }

    // Sort the moves and build our groups.
    moves.sort((a, b) => {
      const aSort = a.data.name.toLowerCase();
      const bSort = b.data.name.toLowerCase();
      if (aSort < bSort) {
        return -1;
      }
      if (aSort > bSort) {
        return 1;
      }
      return 0;
    });

    // Add default look.
    updates['data.details.look'] = game.i18n.localize('PW.DefaultLook');

    // Link the token.
    updates['token.actorLink'] = true;
    updates['token.bar1'] = { attribute: 'attributes.harm' };
    updates['token.bar2'] = { attribute: 'attributes.xp' };
    updates['token.displayBars'] = 20;
    updates['token.disposition'] = 1;

    // Add to the actor.
    const movesToAdd = moves.map(m => duplicate(m));
    await actor.createEmbeddedDocuments('Item', movesToAdd, {});
  }

  if (actor.data.type == 'npc') {
    updates['token.bar1'] = { attribute: 'attributes.harm' };
    updates['token.bar2'] = { attribute: null };
    updates['token.displayBars'] = 20;
    updates['token.disposition'] = -1;
  }

  if (updates && Object.keys(updates).length > 0) {
    await actor.update(updates);
  }
});

// Update the item list on new item creation.
Hooks.on('createItem', async (item, options, id) => {
  if (item.data.type == 'equipment') {
    PwUtility.getEquipment(true);
  }
})

Hooks.on('preUpdateActor', (actor, data, options, id) => {
  if (actor.data.type == 'character') {
    // Allow the character to levelup up when their level changes.
    if (data.data && data.data.attributes && data.data.attributes.level) {
      if (data.data.attributes.level.value > actor.data.data.attributes.level.value) {
        actor.setFlag('paranoidworld', 'levelup', true);
      }
    }
  }
});

/* -------------------------------------------- */
/*  Level Up Listeners                          */
/* -------------------------------------------- */
Hooks.on('renderDialog', (dialog, html, options) => {
  // If this is the levelup dialog, we need to add listeners to it.
  if (dialog.data.id && dialog.data.id == 'level-up') {
    // If an ability score is chosen, we need to update the available options.
    html.find('.cell--ability-scores select').on('change', () => {
      // Build the list of selected score values.
      let scores = [];
      html.find('.cell--ability-scores select').each((index, item) => {
        let $self = $(item);
        if ($self.val()) {
          scores.push($self.val());
        }
      });
      // Loop over the list again, disabling invalid options.
      html.find('.cell--ability-scores select').each((index, item) => {
        let $self = $(item);
        // Loop over the options in the select.
        $self.find('option').each((opt_index, opt_item) => {
          let $opt = $(opt_item);
          let val = $opt.attr('value');
          if (val) {
            if (scores.includes(val) && $self.val() != val) {
              $opt.attr('disabled', true);
            }
            else {
              $opt.attr('disabled', false);
            }
          }
        });
      });
    })
  }
});

/* -------------------------------------------- */
/*  Hotbar Macros                               */
/* -------------------------------------------- */

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {Object} data     The dropped data
 * @param {number} slot     The hotbar slot to use
 * @returns {Promise}
 */
async function createPwMacro(data, slot) {
  if (data.type !== "Item") return;
  if (!("data" in data)) return ui.notifications.warn("You can only create macro buttons for owned Items");
  const item = data.data;

  // Create the macro command
  const command = `game.paranoidworld.rollItemMacro("${item.name}");`;
  let macro = game.macros.find(m => (m.name === item.name) && (m.command === command));
  if (!macro) {
    macro = await Macro.create({
      name: item.name,
      type: "script",
      img: item.img,
      command: command,
      flags: { "paranoidworld.itemMacro": true }
    });
  }
  game.user.assignHotbarMacro(macro, slot);
  return false;
}

/**
 * Create a Macro from an Item drop.
 * Get an existing item macro if one exists, otherwise create a new one.
 * @param {string} itemName
 * @return {Promise}
 */
function rollItemMacro(itemName) {
  const speaker = ChatMessage.getSpeaker();
  let actor;
  if (speaker.token) actor = game.actors.tokens[speaker.token];
  if (!actor) actor = game.actors.get(speaker.actor);
  const item = actor ? actor.items.find(i => i.name === itemName) : null;
  if (!item) return ui.notifications.warn(`Your controlled Actor does not have an item named ${itemName}`);

  return item.roll();
}
