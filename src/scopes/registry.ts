import { scopeRegistry } from "../core/scope/ScopeRegistry.js";
import { framingScope } from "./framing/index.js";
import { concreteScope } from "./concrete/index.js";

export function registerScopes(): void {
  scopeRegistry.register(framingScope);
  scopeRegistry.register(concreteScope);
}

export { scopeRegistry };
