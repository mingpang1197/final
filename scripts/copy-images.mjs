import { cpSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const src = "images";
const dest = join("frontend", "dist", "images");

if (!existsSync(src)) {
  console.warn("images/ not found, skip copy");
  process.exit(0);
}

mkdirSync(join("frontend", "dist"), { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Copied ${src} -> ${dest}`);
