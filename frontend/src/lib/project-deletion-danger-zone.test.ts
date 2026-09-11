import { readFileSync } from "fs";
import { join } from "path";

const assert = (condition: boolean, message: string): void => { if (!condition) throw new Error(message); };
const page = readFileSync(join(__dirname, "../app/projects/[id]/page.tsx"), "utf8");
const dialog = readFileSync(join(__dirname, "../components/projects/project-deletion-danger-zone.tsx"), "utf8");
const projectTypes = readFileSync(join(__dirname, "../types/project.ts"), "utf8");

assert(page.includes('user?.role === "SUPER_ADMIN" && <ProjectDeletionDangerZone'), "Danger Zone must render only for SUPER_ADMIN");
assert(dialog.includes('confirmation === project.name') && dialog.includes('disabled={!canDelete}'), "Exact project-name confirmation must be required");
assert(dialog.includes('router.push("/projects")') && dialog.includes('storage cleanup is pending'), "Successful deletion must redirect and safely represent cleanup warnings");
assert(
  projectTypes.includes("project_intake_attachment_count: number") &&
    dialog.includes("Project Intake files") &&
    dialog.includes("preview.data.project_intake_attachment_count"),
  "Deletion preview must declare and display the Project Intake attachment count"
);
console.log("Project deletion Danger Zone tests passed.");
