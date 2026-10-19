import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

export const harmonyFonts = [
  {
    name: "HarmonyOS_Sans_SC_Regular.ttf",
    sha256: "297b088424be212207df2ce8b98e335468b782aa6b96832af0b8b773d711e2b1",
  },
  {
    name: "HarmonyOS_Sans_SC_Medium.ttf",
    sha256: "6ed1553edccddc48eb27ff25d134a4a715cf54211238d4840b3038576cba1944",
  },
  {
    name: "HarmonyOS_Sans_SC_Bold.ttf",
    sha256: "43a424b85e47fb53a17b3b32026a71801f86f8e022ca6798d186b47d39fa5f01",
  },
];
export const harmonyLicenseHash =
  "b2ffec0e6269ee41c3b5fc0345ab37600b46d66ebea6c9c58ff37f517bdfa164";
export const harmonySourceDirectory = new URL(
  "../src/assets/fonts/",
  import.meta.url,
);

export async function verifiedHarmonyFonts() {
  const fonts = await Promise.all(
    harmonyFonts.map(async (font) => {
      const bytes = await readFile(new URL(font.name, harmonySourceDirectory));
      if (createHash("sha256").update(bytes).digest("hex") !== font.sha256)
        throw new Error(
          `官方字体校验失败，请保留未经修改的原文件：${font.name}`,
        );
      return { ...font, bytes };
    }),
  );
  const license = await readFile(
    new URL("LICENSE.txt", harmonySourceDirectory),
  );
  if (createHash("sha256").update(license).digest("hex") !== harmonyLicenseHash)
    throw new Error("字体许可文件校验失败，请保留原始许可");
  return { fonts, license };
}
