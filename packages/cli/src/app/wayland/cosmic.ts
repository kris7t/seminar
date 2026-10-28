import {
  enterOutput,
  findGlobal,
  newToplevel,
  setTitle,
  STATE_FULLSCREEN,
  type ToplevelProtocol,
} from './protocols.ts';

/*
 * The COSMIC toplevel info and management protocols, which extend the
 * windows that the ext foreign toplevel list protocol lists.
 * See https://wayland.app/protocols/cosmic-toplevel-info-unstable-v1,
 * https://wayland.app/protocols/cosmic-toplevel-management-unstable-v1,
 * and https://wayland.app/protocols/ext-foreign-toplevel-list-v1.
 */

const LIST = 'ext_foreign_toplevel_list_v1';
const INFO = 'zcosmic_toplevel_info_v1';
const MANAGER = 'zcosmic_toplevel_manager_v1';

/** Since which version COSMIC extends the ext foreign toplevels. */
const INFO_VERSION = 2;

const LIST_TOPLEVEL = 0;

const FOREIGN_TOPLEVEL_CLOSED = 0;
const FOREIGN_TOPLEVEL_DONE = 1;
const FOREIGN_TOPLEVEL_TITLE = 2;
const FOREIGN_TOPLEVEL_DESTROY = 0;

const INFO_GET_COSMIC_TOPLEVEL = 1;
const INFO_DONE = 2;

const COSMIC_TOPLEVEL_OUTPUT_ENTER = 4;
const COSMIC_TOPLEVEL_OUTPUT_LEAVE = 5;
const COSMIC_TOPLEVEL_STATE = 8;
const COSMIC_TOPLEVEL_DESTROY = 0;

const MANAGER_CAPABILITIES = 0;
const MANAGER_SET_FULLSCREEN = 7;
const CAPABILITY_FULLSCREEN = 5;

/**
 * Lists windows with the ext foreign toplevel list, and tells their outputs
 * and puts them in full screen with COSMIC.
 */
export const cosmic: ToplevelProtocol = {
  supports: (globals) => {
    const version = (name: string) =>
      globals.find((global) => global.interface === name)?.version ?? 0;
    return (
      version(LIST) > 0 && version(INFO) >= INFO_VERSION && version(MANAGER) > 0
    );
  },

  bind(globals, { connection, bind, add, remove, update }) {
    const infoGlobal = findGlobal(globals, INFO);
    const info = bind(infoGlobal, Math.min(infoGlobal.version, 3), (opcode) => {
      if (opcode === INFO_DONE) {
        update();
      }
    });
    const managerGlobal = findGlobal(globals, MANAGER);
    let capabilities: number[] | undefined;
    const manager = bind(
      managerGlobal,
      Math.min(managerGlobal.version, 4),
      (opcode, args) => {
        if (opcode === MANAGER_CAPABILITIES) {
          capabilities = args.uints();
        }
      },
    );
    // After the COSMIC objects, to extend the windows that it lists.
    bind(findGlobal(globals, LIST), 1, (opcode, args) => {
      if (opcode !== LIST_TOPLEVEL) {
        return;
      }
      const id = args.uint();
      const toplevel = newToplevel(id);
      // Tells the outputs and the state of the window.
      const extension = connection.newId((event, eventArgs) => {
        switch (event) {
          case COSMIC_TOPLEVEL_OUTPUT_ENTER:
            enterOutput(toplevel, eventArgs.uint());
            break;
          case COSMIC_TOPLEVEL_OUTPUT_LEAVE:
            toplevel.outputs.delete(eventArgs.uint());
            break;
          case COSMIC_TOPLEVEL_STATE:
            toplevel.fullscreen = eventArgs.uints().includes(STATE_FULLSCREEN);
            break;
        }
      });
      connection.send(info, INFO_GET_COSMIC_TOPLEVEL, [extension, id]);
      add(toplevel, (output) => {
        connection.send(manager, MANAGER_SET_FULLSCREEN, [extension, output]);
      });
      connection.listen(id, (event, eventArgs) => {
        switch (event) {
          case FOREIGN_TOPLEVEL_TITLE:
            setTitle(toplevel, eventArgs.string() ?? '');
            break;
          case FOREIGN_TOPLEVEL_DONE:
            update();
            break;
          case FOREIGN_TOPLEVEL_CLOSED:
            remove(toplevel);
            connection.send(extension, COSMIC_TOPLEVEL_DESTROY);
            connection.send(id, FOREIGN_TOPLEVEL_DESTROY);
            connection.forget(extension);
            connection.forget(id);
            break;
        }
      });
    });
    return {
      get fullscreens() {
        return capabilities?.includes(CAPABILITY_FULLSCREEN) ?? true;
      },
    };
  },
};
