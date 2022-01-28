export const PW = {};

PW.abilities = {
  "man": "PW.AbilityMan",
  "stl": "PW.AbilityStl",
  "vio": "PW.AbilityVio",
  "hwr": "PW.AbilityHwr",
  "swr": "PW.AbilitySwr",
  "wwr": "PW.AbilityWwr"
};

PW.debilities = {
  "man": "PW.DebilityMan",
  "stl": "PW.DebilityStl",
  "vio": "PW.DebilityVio",
  "hwr": "PW.DebilityHwr",
  "swr": "PW.DebilitySwr",
  "wwr": "PW.DebilityWwr"
};

PW.rollResults = {
  failure: {
    start: null,
    end: 6,
    label: 'PW.failure'
  },
  partial: {
    start: 7,
    end: 9,
    label: 'PW.partial'
  },
  success: {
    start: 10,
    end: null,
    label: 'PW.success'
  }
};

export class PwClassList {
  static async getClasses(labels_only = true) {
    // First, retrieve any custom or overridden classes so that we can
    // prioritize those.
    let classes = game.items.filter(item => item.type == 'class');
    // Next, retrieve compendium classes and merge them in.
    for (let c of game.packs) {
      if (c.metadata.type && c.metadata.type == 'Item' && c.metadata.name == 'classes') {
        let items = c ? await c.getDocuments() : [];
        classes = classes.concat(items);
      }
    }
    // Reduce duplicates. Because item classes happen first, this will prevent
    // duplicate compendium entries from overriding the items.
    let charClassNames = [];
    for (let charClass of classes) {
      let charClassName = charClass.data.name;
      if (charClassNames.includes(charClassName) !== false) {
        classes = classes.filter(item => item.id != charClass.id);
      }
      else {
        charClassNames.push(charClassName);
      }
    }

    // Sort the charClassNames list.
    if (labels_only) {
      charClassNames.sort((a, b) => {
        const aSort = a.toLowerCase();
        const bSort = b.toLowerCase();
        if (aSort < bSort) {
          return -1;
        }
        if (aSort > bSort) {
          return 1;
        }
        return 0;
      });

      return charClassNames;
    }
    // Sort the class objects list.
    else {
      classes.sort((a, b) => {
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

      return classes;
    }
  }
}
