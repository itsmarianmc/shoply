
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const EMPTY_MODULE_URL = pathToFileURL(
  new URL("./empty-module.cjs", import.meta.url).pathname
).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return {
        url: EMPTY_MODULE_URL,
        shortCircuit: true,
        format: "commonjs",
      };
    }
    return nextResolve(specifier, context);
  },
});
