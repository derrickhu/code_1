export declare const PLATFORMS: string[];
export declare function assemble(
  platform: string,
  opts?: { quiet?: boolean; bundleDir?: string; full?: boolean },
): { copied: number; skipped: number; pruned: number; repaired: number };
export declare function assembleAll(
  target?: string,
  opts?: { quiet?: boolean; bundleDir?: string; full?: boolean },
): { copied: number; skipped: number; pruned: number; repaired: number };
export declare function watchContentTrees(
  onChange: () => void,
  opts?: { debounceMs?: number },
): () => void;
