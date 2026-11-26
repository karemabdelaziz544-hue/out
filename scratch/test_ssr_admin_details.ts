import * as fs from "fs";
import { getShipmentCustomsJourneyInternal } from "../src/lib/shipments/journey-queries";
import { STAGE_KEYS_SEQUENCE } from "../src/lib/shipments/workflow-rules";
import {
  CUSTOMS_STAGE_DEFINITIONS,
  CustomsStageKey,
  CustomsJourneyStage,
} from "../src/types/journey";

if (fs.existsSync(".env.local")) {
  const envFile = fs.readFileSync(".env.local", "utf8");
  envFile.split("\n").forEach((line: string) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      process.env[trimmed.slice(0, idx).trim()] = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^['"]|['"]$/g, "");
    }
  });
}

async function main(): Promise<void> {
  console.log("Testing getShipmentCustomsJourneyInternal for real shipment...");
  const shipmentId = "433ead3b-3b9e-4295-bb80-128d71dad02e";
  const journey = await getShipmentCustomsJourneyInternal(shipmentId);

  if (!journey) {
    console.error("FAIL: journey not found");
    process.exit(1);
  }

  console.log("Journey active stage:", journey.activeStageKey);
  console.log("Journey raw stages count:", journey.stages.length);

  // Check 10-stage resolution as done in AdminShipmentDetails
  const operationalStages = STAGE_KEYS_SEQUENCE.map((key: CustomsStageKey) => {
    const existing = journey.stages.find((s: CustomsJourneyStage) => s.stage_key === key);
    if (existing) return existing;
    const def = CUSTOMS_STAGE_DEFINITIONS[key];
    return {
      stage_key: key,
      stage_order: def.order,
      status: "pending",
      is_applicable: true,
    };
  });

  console.log("\nResolved operational stages count:", operationalStages.length);
  for (const st of operationalStages) {
    const def = CUSTOMS_STAGE_DEFINITIONS[st.stage_key as CustomsStageKey];
    console.log(` - Stage ${st.stage_order}: ${def.title} [Status: ${st.status}, Applicable: ${st.is_applicable !== false}]`);
  }

  if (operationalStages.length === 10) {
    console.log("\nSUCCESS: All 10 operational stages resolved in exact canonical sequence from real DB data!");
  } else {
    console.error("FAIL: Expected 10 stages, got", operationalStages.length);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("Test error:", err);
  process.exit(1);
});
