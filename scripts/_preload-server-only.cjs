const Module = require("module");
const path = require("path");

const stub = path.join(__dirname, "_server-only-stub.cjs");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "server-only") return stub;
  return resolveFilename.call(this, request, parent, isMain, options);
};
