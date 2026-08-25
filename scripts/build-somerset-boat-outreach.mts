/**
 * Deploy Somerset Boat Centre outreach demo.
 * Run: npx tsx scripts/build-somerset-boat-outreach.mts
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, "..", "outreach", "somerset-boat-centre");
const projectName = "somerset-boat-centre";

console.log(`Deploying ${siteDir} as ${projectName}…`);
execSync(`npx vercel deploy --prod --yes`, { cwd: siteDir, stdio: "inherit" });

console.log(
  JSON.stringify(
    {
      demo_site: `https://${projectName}.vercel.app`,
      booking_embed:
        "https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=Somerset%20Boat%20Centre",
      whatsapp: null,
      phones: ["07508 959 996", "07946 580 050"],
      email: "info@somersetboatcentre.co.uk",
    },
    null,
    2,
  ),
);
