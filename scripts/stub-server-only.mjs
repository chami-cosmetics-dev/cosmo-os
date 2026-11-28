import Module from "node:module"

const orig = Module.prototype.require
Module.prototype.require = function patchedRequire(id) {
  if (id === "server-only") return {}
  return orig.apply(this, arguments)
}
