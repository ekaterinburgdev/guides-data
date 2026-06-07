import fs from "node:fs/promises";
import path from "node:path";
import { buildTree, fetchAllPagesContent } from "./lib/notion.ts";

export const OUT_DIR = path.resolve(process.cwd(), "..", "data");
export const ASSETS_DIR = path.join(process.cwd(), "..", "assets");

try {
  if (!process.env.NOTION_TOKEN) {
    throw new Error("NOTION_TOKEN is not defined in .env file");
  }

  console.log("[1/5] Create directories");
  await createFolders();

  console.log("[2/5] Build tree & extract assets");
  const tree = await buildTree();

  await fs.writeFile(
    path.join(OUT_DIR, "guides.json"),
    JSON.stringify(tree, null, 2),
  );
  console.log("");
  console.log("[3/5] Create main entry `guides.json`");

  console.log("[4/5] Fetch Page Contents");
  await fetchAllPagesContent();

  console.log(`[5/5] All files exported to: ${OUT_DIR}`);
} catch (err) {
  console.error("[Error]", err);
}

export async function createFolders() {
  await fs.mkdir(ASSETS_DIR, { recursive: true });
  await fs.mkdir(path.join(OUT_DIR), { recursive: true });
}
