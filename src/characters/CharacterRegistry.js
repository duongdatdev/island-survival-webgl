import { CharacterDefinition } from './CharacterDefinition.js';

const CHARACTER_FILES = [
    'BaseCharacter.obj', 'BlueSoldier_Female.obj', 'BlueSoldier_Male.obj',
    'Casual_Bald.obj', 'Casual_Female.obj', 'Casual_Male.obj',
    'Casual2_Female.obj', 'Casual2_Male.obj', 'Casual3_Female.obj', 'Casual3_Male.obj',
    'Chef_Female.obj', 'Chef_Hat.obj', 'Chef_Male.obj',
    'Cow.obj', 'Cowboy_Female.obj', 'Cowboy_Hair.obj', 'Cowboy_Male.obj',
    'Doctor_Female_Old.obj', 'Doctor_Female_Young.obj',
    'Doctor_Male_Old.obj', 'Doctor_Male_Young.obj',
    'Elf.obj', 'Goblin_Female.obj', 'Goblin_Male.obj',
    'Kimono_Female.obj', 'Kimono_Male.obj',
    'Knight_Golden_Female.obj', 'Knight_Golden_Male.obj', 'Knight_Male.obj',
    'Ninja_Female.obj', 'Ninja_Male.obj', 'Ninja_Male_Hair.obj',
    'Ninja_Sand.obj', 'Ninja_Sand_Female.obj',
    'OBJ.obj', 'OldClassy_Female.obj', 'OldClassy_Male.obj',
    'Pirate_Female.obj', 'Pirate_Male.obj',
    'Pug.obj', 'Soldier_Female.obj', 'Soldier_Male.obj',
    'Suit_Female.obj', 'Suit_Male.obj',
    'Viking_Female.obj', 'Viking_Male.obj', 'VikingHelmet.obj',
    'Witch.obj', 'Wizard.obj', 'Worker_Female.obj', 'Worker_Male.obj',
    'Zombie_Female.obj', 'Zombie_Male.obj',
];

export class CharacterRegistry {
    static BASE_PATH = 'assets/Ultimate Animated Character Pack - Nov 2019/OBJ/';

    static createAll() {
        return CHARACTER_FILES.map(filename => {
            const id = filename.replace('.obj', '').toLowerCase();
            const displayName = filename.replace('.obj', '').replace(/_/g, ' ');
            return new CharacterDefinition({
                id,
                displayName,
                obj: filename,
                mtl: filename.replace('.obj', '.mtl'),
                scale: 0.32,
                rotation: [0, 0, 0],
                offset: [0, 0, 0],
            });
        });
    }

    static get(id) {
        const map = CharacterRegistry._getMap();
        return map[id] || null;
    }

    static getAll() {
        return [...CharacterRegistry._getAll()];
    }

    static getObjPath(characterDef) {
        return CharacterRegistry.BASE_PATH + characterDef.obj;
    }

    static getMtlPath(characterDef) {
        return CharacterRegistry.BASE_PATH + characterDef.mtl;
    }

    static _map = null;
    static _all = null;

    static _getMap() {
        if (!CharacterRegistry._map) {
            CharacterRegistry._map = {};
            CharacterRegistry._all = CharacterRegistry.createAll();
            for (const def of CharacterRegistry._all) {
                CharacterRegistry._map[def.id] = def;
            }
        }
        return CharacterRegistry._map;
    }

    static _getAll() {
        if (!CharacterRegistry._all) {
            CharacterRegistry._getMap();
        }
        return CharacterRegistry._all;
    }
}
