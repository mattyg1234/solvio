/**
 * Deploy Somewhere in Queens Park outreach demo.
 * Run: npx tsx scripts/build-somewhere-qp-outreach.mts
 */
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteDir = join(__dirname, "..", "outreach", "somewhere-in-queens-park");
const projectName = "somewhere-in-queens-park";

console.log(`Deploying ${siteDir} as ${projectName}…`);
execSync(`npx vercel deploy --prod --yes`, { cwd: siteDir, stdio: "inherit" });

console.log(
  JSON.stringify(
    {
      demo_site: `https://${projectName}.vercel.app`,
      booking_embed:
        "https://www.solviosystems.com/book/preview?lang=en&mode=appointment&name=Somewhere%20in%20Queens%20Park&wa=447784156801",
      whatsapp: "+44 7784 156801",
      existing_site: "https://www.somewhereinqp.com/",
    },
    null,
    2,
  ),
);
