import type { VFile } from 'vfile';

export interface RemarkSeminarConfigOptions {
  /** Configs loaded by the MDX integration, in increasing precedence. */
  configs?: readonly LoadedSeminarConfigEntry[] | undefined;
}

/** A config loaded for the deck, in increasing order of precedence. */
export interface LoadedSeminarConfigEntry {
  source: string;
  config: unknown;
  base: string;
}

interface SeminarFileData {
  seminarConfigs?: LoadedSeminarConfigEntry[] | undefined;
}

/** Returns configs loaded for the deck, in increasing order of precedence. */
export function getSeminarConfigs(
  file: VFile,
): readonly LoadedSeminarConfigEntry[] | undefined {
  return (file.data as SeminarFileData).seminarConfigs;
}

/**
 * Stores the configs of the plugins and the theme of the deck for the other
 * plugins, which read them with {@link getSeminarConfigs}. Integrations load
 * them before compiling the deck, with `loadDeckSetup`.
 */
export function remarkSeminarConfig({
  configs = [],
}: RemarkSeminarConfigOptions = {}): (tree: unknown, file: VFile) => void {
  return (_tree, file) => {
    (file.data as SeminarFileData).seminarConfigs = [...configs];
  };
}
