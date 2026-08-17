import type { Scope } from "./Scope.js";

export class ScopeRegistry {
  private readonly scopes = new Map<string, Scope>();

  register(scope: Scope): void {
    if (this.scopes.has(scope.name)) {
      return;
    }

    this.scopes.set(scope.name, scope);
  }

  get(name: string): Scope {
    const scope = this.scopes.get(name);

    if (!scope) {
      throw new Error(
        `Unknown scope '${name}'. Available scopes: ${this.list().join(", ")}`,
      );
    }

    return scope;
  }

  list(): string[] {
    return [...this.scopes.keys()].sort();
  }
}

export const scopeRegistry = new ScopeRegistry();
