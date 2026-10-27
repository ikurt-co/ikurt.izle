// Node-only loader for isolated tests and the loopback synthetic development server.
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function loadWorker(dev = false, entry = "index.ts") {
  if (!/^[a-z-]+\.ts$/.test(entry)) throw new Error("Invalid worker entry");
  const cache = new Map();
  async function moduleUrl(url) {
    if (cache.has(url.href)) return cache.get(url.href);
    const source = (await readFile(url, "utf8")).replaceAll("import.meta.env.DEV", String(dev));
    let js = ts.transpile(source, { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext });
    const imports = [...js.matchAll(/from\s+["']([^"']+)["']/g)];
    for (const match of imports) {
      const name = match[1];
      let resolved;
      if (name.startsWith(".")) {
        const target = new URL(name.endsWith(".js") ? name.slice(0, -3) + ".ts" : name + (name.endsWith(".ts") ? "" : ".ts"), url);
        if (!fileURLToPath(target).startsWith(fileURLToPath(new URL("../worker/", import.meta.url)))) throw new Error("Invalid worker module");
        resolved = await moduleUrl(target);
      } else {
        if (name !== "jose") throw new Error("Unexpected worker dependency");
        resolved = import.meta.resolve(name);
      }
      js = js.replace(match[0], "from " + JSON.stringify(resolved));
    }
    const result = "data:text/javascript;base64," + Buffer.from(js).toString("base64");
    cache.set(url.href, result);
    return result;
  }
  return import(await moduleUrl(new URL("../worker/" + entry, import.meta.url)));
}
