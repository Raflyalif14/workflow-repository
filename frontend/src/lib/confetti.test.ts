import assert from "node:assert/strict";
import { triggerWonConfetti } from "./confetti";

// In SSR/Node, window is undefined; must not throw
assert.doesNotThrow(() => {
  triggerWonConfetti();
});

console.log("Confetti SSR safety test passed.");

