const Module = require("module");
const path = require("path");
const original = Module._resolveFilename;
Module._resolveFilename = function (request, parent, ...rest) {
  const mapped = request.startsWith("@/") ? path.resolve(process.cwd(), "src", request.slice(2)) : request;
  return original.call(this, mapped, parent, ...rest);
};
require("../../backend/node_modules/ts-node/register");
require(path.resolve(process.cwd(), process.argv[2]));
