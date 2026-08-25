/**
 * Build + deploy Suds & Shine outreach demo to Vercel.
 * Run from repo root: npx tsx scripts/build-suds-shine-outreach.mts
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, "..", "outreach", "suds-and-shine-valeting");
const projectName = "suds-and-shine-valeting";

console.log(`Deploying ${siteDir} as ${projectName}…`);
execSync(`npx vercel deploy --prod --yes --name ${projectName}`, {
  cwd: siteDir,
  stdio: "inherit",
});

const url = `https://${projectName}.vercel.app`;
console.log(
  JSON.stringify(
    {
      demo_site: url,
      booking_embed:
        "https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=Suds%20%26%20Shine%20Valeting",
      whatsapp: null,
    },
    null,
    2,
  ),
);
