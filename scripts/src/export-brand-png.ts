/**
 * Gera favicons e tamanhos da marca a partir de public/image.png (fonte).
 * Uso: pnpm --filter @workspace/scripts run export-brand
 */
import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const publicDir = join(root, "artifacts/sinal-web/public");
const brandDir = join(publicDir, "brand");
const source = join(publicDir, "image.png");

const sizes = [
  { name: "favicon-32.png", size: 32 },
  { name: "favicon-48.png", size: 48 },
  { name: "favicon.png", size: 64 },
  { name: "apple-touch-icon.png", size: 180 },
  { name: "brand/logo-512.png", size: 512 },
] as const;

async function main(): Promise<void> {
  const sharp = (await import("sharp")).default;
  await mkdir(brandDir, { recursive: true });

  await copyFile(source, join(publicDir, "logo.png"));
  console.log("✓ logo.png");

  for (const item of sizes) {
    const out = join(publicDir, item.name);
    await sharp(source)
      .resize(item.size, item.size, { fit: "cover" })
      .png()
      .toFile(out);
    console.log(`✓ ${item.name} (${item.size}px)`);
  }

  await copyFile(join(publicDir, "logo.png"), join(brandDir, "logo.png"));
  await copyFile(join(publicDir, "brand/logo-512.png"), join(brandDir, "logo-mark-512.png"));
  console.log(`\nFonte: ${source}`);
}

void main().catch((e) => {
  console.error("export-brand failed:", (e as Error).message);
  process.exit(1);
});
