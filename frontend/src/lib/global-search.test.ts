import { strict as assert } from "assert";
import {
  flattenGlobalSearchResults,
  globalSearchResultHref,
  isGlobalSearchEligible,
  moveGlobalSearchSelection,
} from "./global-search";

const results = {
  projects: [{ type: "PROJECT" as const, id: "project-1", projectId: "project-1", title: "Alpha", subtitle: "Acme" }],
  documents: [{ type: "DOCUMENT" as const, id: "document-1", projectId: "project-1", title: "Evidence", subtitle: "OTHER" }],
  milestones: [{ type: "MILESTONE" as const, id: "milestone-1", projectId: "project-1", title: "Assessment", subtitle: "Step 1", status: "ACTIVE" }],
};

const flattened = flattenGlobalSearchResults(results);
assert.deepEqual(flattened.map((result) => result.type), ["PROJECT", "DOCUMENT", "MILESTONE"], "Test 1: result groups flatten in rendered order");
console.log("Test 1 - Global search result ordering: passed");

assert.equal(moveGlobalSearchSelection(-1, 1, 3), 0, "Test 2: down from no selection selects first result");
assert.equal(moveGlobalSearchSelection(0, -1, 3), 0, "Test 2: selection cannot move above first result");
assert.equal(moveGlobalSearchSelection(2, 1, 3), 2, "Test 2: selection cannot move below final result");
assert.equal(moveGlobalSearchSelection(-1, -1, 3), 2, "Test 2: up from no selection selects final result");
assert.equal(moveGlobalSearchSelection(0, 1, 0), -1, "Test 2: empty results have no selection");
console.log("Test 2 - Keyboard selection bounds: passed");

assert(!isGlobalSearchEligible(" a "), "Test 3: one character is not eligible");
assert(isGlobalSearchEligible(" ab "), "Test 3: trimmed two-character query is eligible");
assert.equal(globalSearchResultHref(flattened[1]), "/projects/project-1", "Test 4: every result maps to its project route");
console.log("Test 3 - Query eligibility and route mapping: passed");
