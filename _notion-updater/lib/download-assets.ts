import * as fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { ASSETS_DIR } from "../index.ts";

export async function downloadMedia(
  url: string,
  prefix: string,
  isPdf = false,
): Promise<string> {
  const ext = isPdf ? ".pdf" : (url.includes(".svg") || url.includes("image/svg+xml") ? ".svg" : ".webp");
  const filename = `${prefix}${ext}`;
  const filePath = path.join(ASSETS_DIR, filename);

  if (process.env.BUILD_MODE !== 'full') {
    try {
      await fs.access(filePath);
      return filename;
    } catch {
    }
  }

  const buffer = await downloadBuffer(url);

  if (isPdf || ext === '.svg') {
    await fs.writeFile(filePath, buffer);
    return filename;
  }

  await sharp(buffer)
    .webp({ quality: 80 })
    .toFile(filePath);
    
  return filename;
}

async function downloadBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
