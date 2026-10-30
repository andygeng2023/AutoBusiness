import { copyFile, access, readFile } from "node:fs/promises";
import { basename, join } from "node:path";

const distDir = join(process.cwd(), "dist");
const assetsDir = join(distDir, "assets");
const html = await readFile(join(distDir, "index.html"), "utf8");

const referencedAssets = [...html.matchAll(/(?:src|href)=["']([^"']+\/assets\/[^"']+)["']/g)]
  .map((match) => basename(match[1].split(/[?#]/, 1)[0]));

const currentJs = referencedAssets.find((file) => /^index-.*\.js$/i.test(file));
const currentCss = referencedAssets.find((file) => /^index-.*\.css$/i.test(file));

if (!currentJs || !currentCss) {
  throw new Error("Could not identify the generated JavaScript and CSS assets in dist/index.html.");
}

const compatibilityAssets = [
  { current: currentJs, aliases: ["index-BeS_oOYN.js", "index-oflcmJpG.js"] },
  { current: currentCss, aliases: ["index-CUVuVOLV.css", "index-CDXPJS2H.css"] },
];

for (const { current, aliases } of compatibilityAssets) {
  const sourcePath = join(assetsDir, current);
  await access(sourcePath);
  for (const alias of aliases) {
    if (alias === current) continue;
    await copyFile(sourcePath, join(assetsDir, alias));
    console.log(`Preserved cached Pages asset: ${alias} -> ${current}`);
  }
}
