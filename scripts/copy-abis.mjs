import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const artifactsDir = path.join(root, "artifacts", "contracts");
const outDir = path.join(root, "frontend", "src", "contracts", "abis");

const contracts = [
  "MockStablecoin.sol",
  "IdentityRegistry.sol",
  "RiskEngine.sol",
  "ComplianceLog.sol",
  "BankVault.sol",
];

const nameFromPath = (p) => path.basename(p, ".sol");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

for (const rel of contracts) {
  const name = nameFromPath(rel);
  const artPath = path.join(artifactsDir, rel, `${name}.json`);
  if (!fs.existsSync(artPath)) {
    console.warn("Skip (not found):", artPath);
    continue;
  }
  const art = JSON.parse(fs.readFileSync(artPath, "utf-8"));
  fs.writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(art.abi, null, 2));
  console.log("Wrote", name);
}
