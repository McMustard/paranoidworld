import { PwUtility } from '../utility.js';

/**
 * Extends the basic Actor class for Dungeon World.
 * @extends {Actor}
 */
export class ActorPw extends Actor {

  /**
   * Augment the basic actor data with additional dynamic data.
   */
  prepareData() {
    super.prepareData();

    const actorData = this.data;
    const data = actorData.data;
    const flags = actorData.flags;

    if (actorData.type === 'character') this._prepareCharacterData(actorData);
  }

  /**
   * Prepare Character type specific data
   */
  _prepareCharacterData(actorData) {
    const data = actorData.data;

    // Ability Scores
    for (let [a, abl] of Object.entries(data.abilities)) {
      // TODO: This is a possible formula, but would require limits on the
      // upper and lower ends.
      // abl.mod = Math.floor(abl.value * 0.4 - (abl.value < 11 ? 3.4 : 4.2));

      // Ability modifiers.
      abl.mod = PwUtility.getAbilityMod(abl.value);
      // Add labels.
      abl.label = CONFIG.PW.abilities[a];
      abl.debilityLabel = CONFIG.PW.debilities[a];
      // Adjust mod based on debility.
      if (abl.debility) {
        abl.mod -= 1;
      }
    }

    // Calculate weight.
    let weight = 0;
    let items = actorData.items;
    if (items) {
      let equipment = items.filter(i => i.type == 'equipment');
      equipment.forEach(i => {
        // Add weight for each item.
        let itemQuantity = Number(i.data.data.quantity);
        let itemWeight = Number(i.data.data.weight);
        if (itemWeight > 0) {
          weight = weight + (itemQuantity * itemWeight);
        }
      });
    }
    // Update the value.
    data.attributes.weight.value = weight;

    // Add base flags.
    if (!actorData.flags.paranoidworld) actorData.flags.paranoidworld = {};
    if (!actorData.flags.paranoidworld.sheetDisplay) actorData.flags.paranoidworld.sheetDisplay = {};

    // Handle max XP.
    let rollData = this.getRollData();
    if (!rollData.attributes.level.value) rollData.attributes.level.value = 1;
    let xpRequiredFormula = game.settings.get('paranoidworld', 'xpFormula');
    // Evaluate the max XP roll.
    let xpRequiredRoll = new Roll(xpRequiredFormula, this.getRollData()).roll();
    let xpRequired = xpRequiredRoll?.total ?? Number(data.attributes.level.value) + 7;
    data.attributes.xp.max = xpRequired;

    // Handle roll mode flag.
    if (actorData?.flags?.paranoidworld) {
      if (!actorData.flags.paranoidworld.rollMode) actorData.flags.paranoidworld.rollMode = 'def';
    }
  }

  /**
   * Listen for click events on rollables.
   * @param {MouseEvent} event
   */
  async _onRoll(event, actor = null) {
    actor = !actor ? this.actor : actor;

    // Initialize variables.
    event.preventDefault();

    if (!actor.data) {
      return;
    }

    const a = event.currentTarget;
    const data = a.dataset;
    const actorData = actor.data.data;
    const itemId = $(a).parents('.item').attr('data-item-id');
    const item = actor.items.get(itemId);
    let formula = null;
    let titleText = null;
    let flavorText = null;
    let templateData = {};

    // Handle rolls coming directly from the ability score.
    if ($(a).hasClass('ability-rollable') && data.mod) {
      formula = `2d6+${data.mod}`;
      flavorText = data.label;
      if (data.debility) {
        flavorText += ` (${data.debility})`;
      }

      templateData = {
        title: flavorText
      };

      this.rollMove(formula, actor, data, templateData);
    }
    else if (itemId != undefined) {
      item.roll();
    }
  }

  /**
   * Roll a move and use the chat card template.
   * @param {Object} templateData
   */
  rollMove(roll, actor, dataset, templateData, form = null) {
    let actorData = actor.data.data;
    // Render the roll.
    let template = 'systems/paranoidworld/templates/chat/chat-move.html';
    // GM rolls.
    let chatData = {
      user: game.user.id,
      speaker: ChatMessage.getSpeaker({ actor: actor })
    };
    let rollMode = game.settings.get("core", "rollMode");
    if (["gmroll", "blindroll"].includes(rollMode)) chatData["whisper"] = ChatMessage.getWhisperRecipients("GM");
    if (rollMode === "selfroll") chatData["whisper"] = [game.user.id];
    if (rollMode === "blindroll") chatData["blind"] = true;
    // Handle dice rolls.
    if (roll) {
      // Roll can be either a formula like `2d6+3` or a raw stat like `man`.
      let formula = '';
      // Handle bond (user input).
      if (roll == 'BOND') {
        formula = form.bond.value ? `2d6+${form.bond.value}` : '2d6';
        if (dataset.mod && dataset.mod != 0) {
          formula += `+${dataset.mod}`;
        }
      }
      // Handle integer modifier (user input).
      else if (roll == 'ASKMOD') {
        formula = form.bond.value ? `2d6+${form.bond.value}` : '2d6';
        if (dataset.mod && dataset.mod != 0) {
          formula += `+${dataset.mod}`;
        }
      }
      // Handle ability scores (no input).
      else if (roll.match(/(\d*)d\d+/g)) {
        formula = roll;
      }
      // Handle moves.
      else {
        formula = `2d6+${actorData.abilities[roll].mod}`;
        if (dataset.mod && dataset.mod != 0) {
          formula += `+${dataset.mod}`;
        }
      }
      if (formula != null) {
        // Do the roll.
        let roll = new Roll(`${formula}`, actor.getRollData());
        roll.roll();
        // Add success notification.
        if (formula.includes('2d6')) {
          if (roll.total < 7) {
            templateData.result = 'failure';
          }
          else if (roll.total > 6 && roll.total < 10) {
            templateData.result = 'partial';
          }
          else {
            templateData.result = 'success';
          }
        }
        // Render it.
        roll.render().then(r => {
          templateData.rollPw = r;
          renderTemplate(template, templateData).then(content => {
            chatData.content = content;
            if (game.dice3d) {
              game.dice3d.showForRoll(roll, game.user, true, chatData.whisper, chatData.blind).then(displayed => ChatMessage.create(chatData));
            }
            else {
              chatData.sound = CONFIG.sounds.dice;
              ChatMessage.create(chatData);
            }
          });
        });
      }
    }
    else {
      renderTemplate(template, templateData).then(content => {
        chatData.content = content;
        ChatMessage.create(chatData);
      });
    }
  }

  /** @override */
  async _preUpdate(data, options, userId) {
    await super._preUpdate(data, options, userId);

    if (options?.pw) {
      options.pw.preUpdate = {data: foundry.utils.duplicate(this.data.data)};
    }
  }

  /** @override */
  async _onUpdate(data, options, userId) {
    await super._onUpdate(data, options, userId);
    const context = options?.pw?.preUpdate ?? false;

    if (!options.diff || !context || context.data === undefined || data.data === undefined) return; // Nothing to do.

    // Exit early if not owner.
    let displayText = this.isOwner;
    if (this.data.permission.default > 1) displayText = true;
    if (this.data.permission[game.userId] !== undefined && this.data.permission[game.userId] > 1) displayText = true;

    if (!displayText) return;

    // Prepare the scrolling text update.
    if (data.data?.attributes?.harm?.value !== undefined) {
      let harm = {
        original: context.data.attributes.harm.value ?? null,
        current: data.data.attributes.harm.value ?? null
      }
    }
  }
}
