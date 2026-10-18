import type { VFile } from 'vfile';

export interface RemarkSliderConfigOptions {
  /** Configs loaded by the MDX integration, in increasing precedence. */
  configs?: readonly LoadedSliderConfigEntry[] | undefined;
}

/** A config loaded for the deck, in increasing order of precedence. */
export interface LoadedSliderConfigEntry {
  source: string;
  config: unknown;
  base: string;
}

interface SliderFileData {
  sliderConfigs?: LoadedSliderConfigEntry[] | undefined;
}

/** Returns configs loaded for the deck, in increasing order of precedence. */
export function getSliderConfigs(
  file: VFile,
): readonly LoadedSliderConfigEntry[] | undefined {
  return (file.data as SliderFileData).sliderConfigs;
}

/**
 * Stores the configs of the plugins and the theme of the deck for the other
 * plugins, which read them with {@link getSliderConfigs}. Integrations load
 * them before compiling the deck, with `loadDeckSetup`.
 */
export function remarkSliderConfig({
  configs = [],
}: RemarkSliderConfigOptions = {}): (tree: unknown, file: VFile) => void {
  return (_tree, file) => {
    (file.data as SliderFileData).sliderConfigs = [...configs];
  };
}
