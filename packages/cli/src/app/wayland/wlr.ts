import {
  enterOutput,
  findGlobal,
  newToplevel,
  setTitle,
  STATE_FULLSCREEN,
  type ToplevelProtocol,
} from './protocols.ts';

/*
 * The wlr foreign toplevel management protocol, which wlroots compositors
 * like Sway have.
 * See https://wayland.app/protocols/wlr-foreign-toplevel-management-unstable-v1.
 */

const MANAGER = 'zwlr_foreign_toplevel_manager_v1';

/** Since which version the protocol has `set_fullscreen`. */
const MANAGER_VERSION = 2;

const MANAGER_TOPLEVEL = 0;

const TOPLEVEL_TITLE = 0;
const TOPLEVEL_OUTPUT_ENTER = 2;
const TOPLEVEL_OUTPUT_LEAVE = 3;
const TOPLEVEL_STATE = 4;
const TOPLEVEL_DONE = 5;
const TOPLEVEL_CLOSED = 6;
const TOPLEVEL_DESTROY = 7;
const TOPLEVEL_SET_FULLSCREEN = 8;

/** Lists windows, and puts them in full screen, with wlr. */
export const wlr: ToplevelProtocol = {
  supports: (globals) =>
    (globals.find((global) => global.interface === MANAGER)?.version ?? 0) >=
    MANAGER_VERSION,

  bind(globals, { connection, bind, add, remove, update }) {
    const manager = findGlobal(globals, MANAGER);
    bind(manager, Math.min(manager.version, 3), (opcode, args) => {
      if (opcode !== MANAGER_TOPLEVEL) {
        return;
      }
      const id = args.uint();
      const toplevel = newToplevel(id);
      add(toplevel, (output) => {
        connection.send(id, TOPLEVEL_SET_FULLSCREEN, [output]);
      });
      connection.listen(id, (event, eventArgs) => {
        switch (event) {
          case TOPLEVEL_TITLE:
            setTitle(toplevel, eventArgs.string() ?? '');
            break;
          case TOPLEVEL_OUTPUT_ENTER:
            enterOutput(toplevel, eventArgs.uint());
            break;
          case TOPLEVEL_OUTPUT_LEAVE:
            toplevel.outputs.delete(eventArgs.uint());
            break;
          case TOPLEVEL_STATE:
            toplevel.fullscreen = eventArgs.uints().includes(STATE_FULLSCREEN);
            break;
          case TOPLEVEL_DONE:
            update();
            break;
          case TOPLEVEL_CLOSED:
            remove(toplevel);
            connection.send(id, TOPLEVEL_DESTROY);
            connection.forget(id);
            break;
        }
      });
    });
    return { fullscreens: true };
  },
};
