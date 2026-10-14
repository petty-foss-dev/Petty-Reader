import { cp, mkdir, rm } from "node:fs/promises";

const nm = new URL("../node_modules/", import.meta.url);
const vendor = new URL("../extension/vendor/", import.meta.url);

const copy = async (from, to) => {
  const dest = new URL(to, vendor);
  await mkdir(new URL(".", dest), { recursive: true });
  await cp(new URL(from, nm), dest, { recursive: true });
};

await rm(vendor, { recursive: true, force: true });

await copy("@mozilla/readability/Readability.js", "readability/Readability.js");
await copy("@mozilla/readability/LICENSE.md", "readability/LICENSE.md");

await copy("pdfjs-dist/build/pdf.min.mjs", "pdfjs/pdf.min.mjs");
await copy("pdfjs-dist/build/pdf.worker.min.mjs", "pdfjs/pdf.worker.min.mjs");
await copy("pdfjs-dist/cmaps/", "pdfjs/cmaps/");
await copy("pdfjs-dist/LICENSE", "pdfjs/LICENSE");

const fonts = {
  literata: "literata",
  "eb-garamond": "eb-garamond",
  lora: "lora",
  "atkinson-hyperlegible-next": "atkinson-hyperlegible-next",
};
for (const [pkg, name] of Object.entries(fonts)) {
  for (const subset of ["latin", "latin-ext"]) {
    for (const style of ["normal", "italic"]) {
      const file = `${name}-${subset}-wght-${style}.woff2`;
      await copy(`@fontsource-variable/${pkg}/files/${file}`, `fonts/${file}`);
    }
  }
  await copy(`@fontsource-variable/${pkg}/LICENSE`, `fonts/LICENSE-${name}.txt`);
}
