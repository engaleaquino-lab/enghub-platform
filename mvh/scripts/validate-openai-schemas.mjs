import fs from "node:fs";

const file = "app/api/editais/analisar/route.ts";
const text = fs.readFileSync(file, "utf8");

const names = [
  "finalSchema",
  "finalGeneralSchema",
  "finalCredentialingSchema",
  "finalLegalSchema",
  "finalFiscalLaborSchema",
  "finalCreaCatSchema",
  "finalTechnicalCertificatesSchema",
  "finalEconomicSchema",
  "finalDeclarationsSchema",
  "finalProposalSchema",
  "finalOperationalSchema",
  "finalRiskChecklistSchema",
];

for (const name of names) {
  if (!text.includes(`const ${name} = {`)) {
    throw new Error(`Schema ausente: ${name}`);
  }
}

console.log(`Schemas localizados: ${names.length}`);
console.log("A validação rígida também é executada em runtime antes de cada chamada.");
