/**
 * Deploy MS Beauty Salon (Luton) outreach demo.
 * Run: npx tsx scripts/build-ms-beauty-outreach.mts
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, "..", "outreach", "ms-beauty-salon-luton");
const projectName = "ms-beauty-salon-luton";

console.log(`Deploying ${siteDir} as ${projectName}…`);
execSync(`npx vercel deploy --prod --yes`, { cwd: siteDir, stdio: "inherit" });

const url = `https://${projectName}.vercel.app`;
console.log(
  JSON.stringify(
    {
      demo_site: url,
      booking_embed:
        "https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=MS%20Beauty%20Salon&wa=447397111110",
      whatsapp: "+44 7397 111110",
      existing_site: "https://msbeautysalon.co.uk/",
    },
    null,
    2,
  ),
);
