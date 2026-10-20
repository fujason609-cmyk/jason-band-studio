import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Plugin } from "vite";

/** Every file under `dir`, as forward-slash paths relative to `root`. */
function walk(dir: string, root: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, root) : [relative(root, path).split(sep).join("/")];
  });
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 12);

/**
 * Writes dist/sw.js from scripts/sw-template.js with this build's files: the app shell to
 * cache on install (everything but lazy chunks, source maps and the instrument samples)
 * and versions for the shell and the samples, so each deploy replaces only what changed.
 */
export function serviceWorker(): Plugin {
  let publicDir = "";
  return {
    name: "band-studio-service-worker",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const outputs = Object.values(bundle);
      // the score importer (alphaTab, ~1.2 MB) is cached when first used, not on install
      const lazy = new Set(outputs.filter((o) => o.type === "chunk" && o.isDynamicEntry).map((o) => o.fileName));
      const built = outputs.map((o) => o.fileName).filter((f) => !f.endsWith(".map") && !lazy.has(f));
      const publicFiles = walk(publicDir, publicDir);
      const samples = publicFiles.filter((f) => f.startsWith("instruments/"));
      const shell = [...built, ...publicFiles.filter((f) => !f.startsWith("instruments/"))].sort();

      const size = (f: string) => statSync(join(publicDir, f)).size;
      const sources = outputs.map((o) => (o.type === "chunk" ? o.code : String(o.source.length))).join("|");
      const build = {
        version: hash(shell.join("\n") + sources + shell.filter((f) => !built.includes(f)).map(size).join(",")),
        samplesVersion: hash(samples.map((f) => `${f}:${size(f)}`).join("\n")),
        shell,
      };
      const template = readFileSync(new URL("./sw-template.js", import.meta.url), "utf8");
      const slot = "const BUILD = self.__BUILD__;";
      if (!template.includes(slot)) throw new Error(`sw-template.js must contain "${slot}"`);
      this.emitFile({ type: "asset", fileName: "sw.js", source: template.replace(slot, `const BUILD = ${JSON.stringify(build)};`) });
    },
  };
}
