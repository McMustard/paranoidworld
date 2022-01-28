import { PwActorSheet } from './actor-sheet.js';

/**
 * Extend the basic ActorSheet with some very simple modifications
 * @extends {ActorSheet}
 */
export class PwActorNpcSheet extends PwActorSheet {

  /** @override */
  static get defaultOptions() {
    let options = mergeObject(super.defaultOptions, {
      classes: ["paranoidworld", "sheet", "actor", "npc"],
      width: 560,
      height: 640,
      tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "moves" }]
    });

    if (CONFIG.PW.nightmode) {
      options.classes.push('nightmode');
    }

    return options;
  }

}
