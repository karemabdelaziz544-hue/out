/**
 * Real-Session PostgreSQL RLS, DB Trigger, RPC, and Storage Policy Test Suite
 *
 * Target: Separate empty Supabase TEST project ONLY (configured via `.env.test.local`
 * or `TEST_SUPABASE_*` environment variables). Refuses to execute against `.env.local`.
 *
 * Roles tested via real Supabase Auth (`auth.signInWithPassword`) JWT sessions:
 *   1. anon (unauthenticated)
 *   2. admin
 *   3. manager (strictly read-only across all tables & buckets)
 *   4. data_entry
 *   5. scout
 *   6. inspector
 *   7. customerA (shipment owner in Company A)
 *   8. customerA_colleague (same Company A, NOT owner of Shipment A)
 *   9. customerB (different Company B)
 *
 * NOTE: Reports all policy/storage failures accurately as found — never suppresses failures.
 */

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ─── 0. Isolated Test Environment Loader & Safety Guard ───────────────────────

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

const repoRoot = process.cwd();
const testEnvFile = parseEnvFile(path.join(repoRoot, ".env.test.local"));
const localEnvFile = parseEnvFile(path.join(repoRoot, ".env.local"));

const TEST_URL =
  process.env.TEST_SUPABASE_URL || testEnvFile.TEST_SUPABASE_URL || "";
const TEST_ANON_KEY =
  process.env.TEST_SUPABASE_ANON_KEY || testEnvFile.TEST_SUPABASE_ANON_KEY || "";
const TEST_SERVICE_KEY =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  testEnvFile.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  "";

function assertSafeIsolatedTestConfig(): void {
  if (!TEST_URL || !TEST_ANON_KEY || !TEST_SERVICE_KEY) {
    throw new Error(
      "Missing TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY / TEST_SUPABASE_SERVICE_ROLE_KEY. Copy .env.test.local.example to .env.test.local using ONLY a separate empty Supabase TEST project.",
    );
  }
  if (
    TEST_URL.includes("YOUR_EMPTY_TEST_PROJECT_REF") ||
    TEST_ANON_KEY.includes("YOUR_TEST_PROJECT") ||
    TEST_SERVICE_KEY.includes("YOUR_TEST_PROJECT")
  ) {
    throw new Error(
      ".env.test.local still contains placeholder values. Replace with real TEST project credentials.",
    );
  }
  const prodUrl = localEnvFile.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (prodUrl && TEST_URL.trim().replace(/\/+$/, "") === prodUrl.replace(/\/+$/, "")) {
    throw new Error(
      "SAFETY BLOCK: TEST_SUPABASE_URL matches .env.local NEXT_PUBLIC_SUPABASE_URL! Never run RLS tests against the production Supabase project.",
    );
  }
}

assertSafeIsolatedTestConfig();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, "public", any>;

function makeAnonClient(): AnySupabaseClient {
  return createClient(TEST_URL, TEST_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function makeAdminClient(): AnySupabaseClient {
  return createClient(TEST_URL, TEST_SERVICE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function signInAs(email: string, password: string): Promise<AnySupabaseClient> {
  const client = makeAnonClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    throw new Error(`Failed to sign in test user ${email}: ${error?.message || "no session"}`);
  }
  return client;
}

// ─── 1. Helper Assertions ─────────────────────────────────────────────────────

function expectBlocked(
  result: { data: unknown; error: { message: string; code?: string } | null },
  context: string,
): void {
  if (result.error) return;
  if (Array.isArray(result.data) && result.data.length === 0) return;
  if (result.data === null) return;
  assert.fail(
    `Expected RLS/permission denial for [${context}], but succeeded with data: ${JSON.stringify(result.data)}`,
  );
}

function expectWriteAllowed(
  result: { data: unknown; error: { message: string; code?: string } | null },
  context: string,
): void {
  assert.equal(
    result.error,
    null,
    `Expected write allowed for [${context}], got error: ${result.error?.code || ""} ${result.error?.message || ""}`,
  );
}

// ─── 2. Suite State & Deterministic Provisioning/Cleanup ──────────────────────

const runId = crypto.randomBytes(4).toString("hex");
const TEST_PASSWORD = `OutRls!${runId}2026#`;

const createdUserIds: string[] = [];
const createdCompanyIds: string[] = [];
const createdShipmentIds: string[] = [];
const storageCleanup: Array<{ bucket: "documents" | "company-documents"; paths: string[] }> = [];

interface RoleClients {
  anon: AnySupabaseClient;
  admin: AnySupabaseClient;
  manager: AnySupabaseClient;
  data_entry: AnySupabaseClient;
  scout: AnySupabaseClient;
  inspector: AnySupabaseClient;
  customerA: AnySupabaseClient;
  customerA_colleague: AnySupabaseClient;
  customerB: AnySupabaseClient;
}

const actorIds: Record<keyof Omit<RoleClients, "anon">, string> = {
  admin: "",
  manager: "",
  data_entry: "",
  scout: "",
  inspector: "",
  customerA: "",
  customerA_colleague: "",
  customerB: "",
};

let clients: RoleClients;
let serviceClient: AnySupabaseClient;

let companyAId = "";
let companyBId = "";
let shipmentAId = "";
let shipmentBId = "";
let shipmentCId = "";
let pricingAId = "";
let documentAPendingId = "";
let documentAApprovedId = "";
let documentBId = "";
let companyDocAId = "";
let companyDocBId = "";
let acidAId = "";
let obligationAId = "";
let txABillableId = "";
let txANonBillableId = "";
let txAPendingId = "";
let txARejectedId = "";
let internalNoteAId = "";
let regProcAId = "";
let trackingCacheId = "";
let notificationAId = "";
let docStoragePathA = "";
let docStoragePathB = "";
let compStoragePathA = "";
let compStoragePathB = "";

describe(`Real-Session RLS & Storage Matrix (run=${runId})`, () => {
  before(async () => {
    serviceClient = makeAdminClient();

    // 1. Verify schema tables & buckets exist from migrations 0001-0020
    const requiredTables = [
      "profiles",
      "companies",
      "company_documents",
      "shipments",
      "documents",
      "shipment_pricing",
      "shipment_pricing_history",
      "shipment_invoice_reviews",
      "shipment_acids",
      "shipment_acid_history",
      "shipment_document_reviews",
      "shipment_stage_history",
      "shipment_external_operations",
      "shipment_customs_stages",
      "shipment_customs_stage_history",
      "shipment_regulatory_procedures",
      "shipment_customs_obligations",
      "shipment_financial_transactions",
      "shipment_financial_internal_notes",
      "notifications",
      "shipment_tracking_cache",
      "shipment_financial_migration_audit_v",
    ];
    for (const tbl of requiredTables) {
      const { error } = await serviceClient.from(tbl).select("*").limit(0);
      assert.equal(
        error,
        null,
        `Schema preflight failed on [${tbl}] (migrations 0001-0020 incomplete?): ${error?.message}`,
      );
    }

    const { data: buckets, error: bucketsErr } = await serviceClient.storage.listBuckets();
    assert.equal(bucketsErr, null, `Failed to list storage buckets: ${bucketsErr?.message}`);
    const bucketNames = new Set((buckets || []).map((b) => b.name));
    assert.ok(bucketNames.has("documents"), "Missing Storage bucket 'documents' (0002)");
    assert.ok(bucketNames.has("company-documents"), "Missing Storage bucket 'company-documents' (0006)");

    // 2. Seed two companies
    const { data: compA, error: compAErr } = await serviceClient
      .from("companies")
      .insert({ name: `OUT RLS Company A ${runId}`, email: `compa-${runId}@test.out.local` })
      .select("id")
      .single();
    assert.equal(compAErr, null, compAErr?.message);
    companyAId = compA.id;
    createdCompanyIds.push(companyAId);

    const { data: compB, error: compBErr } = await serviceClient
      .from("companies")
      .insert({ name: `OUT RLS Company B ${runId}`, email: `compb-${runId}@test.out.local` })
      .select("id")
      .single();
    assert.equal(compBErr, null, compBErr?.message);
    companyBId = compB.id;
    createdCompanyIds.push(companyBId);

    // 3. Provision 8 real auth users across all 6 roles
    const userSpecs: Array<{
      key: keyof typeof actorIds;
      role: "admin" | "manager" | "data_entry" | "scout" | "inspector" | "customer";
      companyId: string | null;
      fullName: string;
    }> = [
      { key: "admin", role: "admin", companyId: null, fullName: "RLS Admin" },
      { key: "manager", role: "manager", companyId: null, fullName: "RLS Manager" },
      { key: "data_entry", role: "data_entry", companyId: null, fullName: "RLS Data Entry" },
      { key: "scout", role: "scout", companyId: null, fullName: "RLS Scout" },
      { key: "inspector", role: "inspector", companyId: null, fullName: "RLS Inspector" },
      { key: "customerA", role: "customer", companyId: companyAId, fullName: "RLS Customer A" },
      {
        key: "customerA_colleague",
        role: "customer",
        companyId: companyAId,
        fullName: "RLS Customer A Colleague",
      },
      { key: "customerB", role: "customer", companyId: companyBId, fullName: "RLS Customer B" },
    ];

    const emailsByRole = new Map<keyof typeof actorIds, string>();

    for (const spec of userSpecs) {
      const email = `rls-${runId}-${spec.key}@test.out.local`;
      const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
        email,
        password: TEST_PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: spec.fullName },
      });
      assert.equal(createErr, null, `createUser ${spec.key}: ${createErr?.message}`);
      const uid = created.user.id;
      actorIds[spec.key] = uid;
      createdUserIds.push(uid);
      emailsByRole.set(spec.key, email);

      const { error: profErr } = await serviceClient
        .from("profiles")
        .update({
          role: spec.role,
          company_id: spec.companyId,
          full_name: spec.fullName,
          is_active: true,
          provisioning_status: "active",
        })
        .eq("id", uid);
      assert.equal(profErr, null, `update profile ${spec.key}: ${profErr?.message}`);
    }

    // 4. Sign into real JWT sessions
    clients = {
      anon: makeAnonClient(),
      admin: await signInAs(emailsByRole.get("admin")!, TEST_PASSWORD),
      manager: await signInAs(emailsByRole.get("manager")!, TEST_PASSWORD),
      data_entry: await signInAs(emailsByRole.get("data_entry")!, TEST_PASSWORD),
      scout: await signInAs(emailsByRole.get("scout")!, TEST_PASSWORD),
      inspector: await signInAs(emailsByRole.get("inspector")!, TEST_PASSWORD),
      customerA: await signInAs(emailsByRole.get("customerA")!, TEST_PASSWORD),
      customerA_colleague: await signInAs(
        emailsByRole.get("customerA_colleague")!,
        TEST_PASSWORD,
      ),
      customerB: await signInAs(emailsByRole.get("customerB")!, TEST_PASSWORD),
    };

    // 5. Seed Shipments A, B, and C
    const { data: shipA, error: shipAErr } = await serviceClient
      .from("shipments")
      .insert({
        company_id: companyAId,
        customer_id: actorIds.customerA,
        created_by: actorIds.customerA,
        reference_number: `OUT-RLSA-${runId}`,
        status: "customs_in_progress",
        goods_category: "industrial",
      })
      .select("id")
      .single();
    assert.equal(shipAErr, null, shipAErr?.message);
    shipmentAId = shipA.id;
    createdShipmentIds.push(shipmentAId);

    const { data: shipB, error: shipBErr } = await serviceClient
      .from("shipments")
      .insert({
        company_id: companyBId,
        customer_id: actorIds.customerB,
        created_by: actorIds.customerB,
        reference_number: `OUT-RLSB-${runId}`,
        status: "price_proposed",
        goods_category: "other",
      })
      .select("id")
      .single();
    assert.equal(shipBErr, null, shipBErr?.message);
    shipmentBId = shipB.id;
    createdShipmentIds.push(shipmentBId);

    const { data: shipC, error: shipCErr } = await serviceClient
      .from("shipments")
      .insert({
        company_id: companyAId,
        customer_id: actorIds.customerA,
        created_by: actorIds.customerA,
        reference_number: `OUT-RLSC-${runId}`,
        status: "draft",
      })
      .select("id")
      .single();
    assert.equal(shipCErr, null, shipCErr?.message);
    shipmentCId = shipC.id;
    createdShipmentIds.push(shipmentCId);

    // 6. Seed Pricing + History
    const { data: prA, error: prAErr } = await serviceClient
      .from("shipment_pricing")
      .insert({
        shipment_id: shipmentAId,
        estimated_min_price: 6000,
        estimated_max_price: 9000,
        final_price: 8000,
        currency: "EGP",
        status: "customer_approved",
        approval_type: "final_fixed",
        approval_source: "customer_direct",
        customer_approved_at: new Date().toISOString(),
        customer_approved_by: actorIds.customerA,
        created_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(prAErr, null, prAErr?.message);
    pricingAId = prA.id;

    await serviceClient.from("shipment_pricing_history").insert({
      shipment_id: shipmentAId,
      pricing_id: pricingAId,
      action: "final_price_set",
      final_price: 8000,
      currency: "EGP",
      performed_by: actorIds.admin,
    });

    // 7. Seed Storage files + Documents + Company Documents + Reviews
    const samplePdf = Buffer.from("%PDF-1.4\n1 0 obj <<>> endobj\ntrailer <<>>\n%%EOF\n", "utf8");
    docStoragePathA = `${actorIds.customerA}/rls-${runId}/receipt-a.pdf`;
    docStoragePathB = `${actorIds.customerB}/rls-${runId}/receipt-b.pdf`;
    compStoragePathA = `${companyAId}/rls-${runId}/tax-a.pdf`;
    compStoragePathB = `${companyBId}/rls-${runId}/tax-b.pdf`;

    await serviceClient.storage
      .from("documents")
      .upload(docStoragePathA, samplePdf, { contentType: "application/pdf", upsert: true });
    await serviceClient.storage
      .from("documents")
      .upload(docStoragePathB, samplePdf, { contentType: "application/pdf", upsert: true });
    storageCleanup.push({ bucket: "documents", paths: [docStoragePathA, docStoragePathB] });

    await serviceClient.storage
      .from("company-documents")
      .upload(compStoragePathA, samplePdf, { contentType: "application/pdf", upsert: true });
    await serviceClient.storage
      .from("company-documents")
      .upload(compStoragePathB, samplePdf, { contentType: "application/pdf", upsert: true });
    storageCleanup.push({ bucket: "company-documents", paths: [compStoragePathA, compStoragePathB] });

    const { data: dAPend, error: dAPendErr } = await serviceClient
      .from("documents")
      .insert({
        customer_id: actorIds.customerA,
        company_id: companyAId,
        shipment_id: shipmentAId,
        title: "فاتورة مبدئية قيد المراجعة",
        file_name: "invoice-pending.pdf",
        file_path: docStoragePathA,
        file_size: samplePdf.length,
        mime_type: "application/pdf",
        document_type: "proforma_invoice",
        status: "pending",
      })
      .select("id")
      .single();
    assert.equal(dAPendErr, null, dAPendErr?.message);
    documentAPendingId = dAPend.id;

    const { data: dAAppr, error: dAApprErr } = await serviceClient
      .from("documents")
      .insert({
        customer_id: actorIds.customerA,
        company_id: companyAId,
        shipment_id: shipmentAId,
        title: "بوليصة شحن معتمدة",
        file_name: "bol-approved.pdf",
        file_path: docStoragePathA,
        file_size: samplePdf.length,
        mime_type: "application/pdf",
        document_type: "bill_of_lading",
        status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(dAApprErr, null, dAApprErr?.message);
    documentAApprovedId = dAAppr.id;

    const { data: dB, error: dBErr } = await serviceClient
      .from("documents")
      .insert({
        customer_id: actorIds.customerB,
        company_id: companyBId,
        shipment_id: shipmentBId,
        title: "مستند شحنة ب",
        file_name: "doc-b.pdf",
        file_path: docStoragePathB,
        file_size: samplePdf.length,
        mime_type: "application/pdf",
        document_type: "commercial_invoice",
        status: "pending",
      })
      .select("id")
      .single();
    assert.equal(dBErr, null, dBErr?.message);
    documentBId = dB.id;

    await serviceClient.from("shipment_invoice_reviews").insert({
      shipment_id: shipmentAId,
      document_id: documentAPendingId,
      action: "approved",
      note: "seeded",
      performed_by: actorIds.admin,
    });
    await serviceClient.from("shipment_document_reviews").insert({
      document_id: documentAApprovedId,
      shipment_id: shipmentAId,
      document_type: "bill_of_lading",
      action: "approved",
      note: "seeded",
      performed_by: actorIds.admin,
    });

    const { data: cdA, error: cdAErr } = await serviceClient
      .from("company_documents")
      .insert({
        company_id: companyAId,
        document_type: "tax_card",
        file_name: "tax-a.pdf",
        file_path: compStoragePathA,
        mime_type: "application/pdf",
        file_size: samplePdf.length,
        status: "pending",
      })
      .select("id")
      .single();
    assert.equal(cdAErr, null, cdAErr?.message);
    companyDocAId = cdA.id;

    const { data: cdB, error: cdBErr } = await serviceClient
      .from("company_documents")
      .insert({
        company_id: companyBId,
        document_type: "tax_card",
        file_name: "tax-b.pdf",
        file_path: compStoragePathB,
        mime_type: "application/pdf",
        file_size: samplePdf.length,
        status: "pending",
      })
      .select("id")
      .single();
    assert.equal(cdBErr, null, cdBErr?.message);
    companyDocBId = cdB.id;

    // 8. Seed ACID, Stage History, External Ops, Customs Stages, Regulatory Procedures
    const { data: acidA, error: acidAErr } = await serviceClient
      .from("shipment_acids")
      .insert({
        shipment_id: shipmentAId,
        acid_number: `1234567890${runId}`.slice(0, 19),
        status: "issued",
        issued_at: new Date().toISOString(),
        created_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(acidAErr, null, acidAErr?.message);
    acidAId = acidA.id;

    await serviceClient.from("shipment_acid_history").insert({
      shipment_acid_id: acidAId,
      shipment_id: shipmentAId,
      action: "issued",
      new_status: "issued",
      performed_by: actorIds.admin,
    });

    await serviceClient.from("shipment_stage_history").insert({
      shipment_id: shipmentAId,
      action: "ready_for_external_stage",
      performed_by: actorIds.admin,
    });

    await serviceClient.from("shipment_external_operations").insert({
      shipment_id: shipmentAId,
      platform: "nafeza",
      operation_type: "customs_declaration",
      title: "Seeded External Op",
      operation_date: new Date().toISOString(),
      created_by: actorIds.admin,
      outcome: "pending",
    });

    await serviceClient.from("shipment_customs_stages").insert([
      {
        shipment_id: shipmentAId,
        stage_key: "stage_2_pricing",
        stage_order: 2,
        status: "completed",
        expected_role: "admin",
        completed_by: actorIds.admin,
        completed_at: new Date().toISOString(),
      },
      {
        shipment_id: shipmentAId,
        stage_key: "stage_5_scouting",
        stage_order: 5,
        status: "in_progress",
        expected_role: "scout",
        assigned_to: actorIds.scout,
      },
      {
        shipment_id: shipmentAId,
        stage_key: "stage_6_inspection",
        stage_order: 6,
        status: "in_progress",
        expected_role: "inspector",
        assigned_to: actorIds.inspector,
      },
      {
        shipment_id: shipmentAId,
        stage_key: "stage_7_data_entry",
        stage_order: 8,
        status: "in_progress",
        expected_role: "data_entry",
        assigned_to: actorIds.data_entry,
      },
      {
        shipment_id: shipmentAId,
        stage_key: "stage_9_fees_payments",
        stage_order: 10,
        status: "in_progress",
        expected_role: "admin",
      },
    ]);

    await serviceClient.from("shipment_customs_stage_history").insert({
      shipment_id: shipmentAId,
      stage_key: "stage_5_scouting",
      action: "status_updated",
      from_status: "pending",
      to_status: "in_progress",
      performed_by: actorIds.admin,
    });

    const { data: rpA, error: rpAErr } = await serviceClient
      .from("shipment_regulatory_procedures")
      .insert({
        shipment_id: shipmentAId,
        procedure_code: "goeic",
        authority_name_ar: "الهيئة العامة للرقابة على الصادرات والواردات",
        status: "pending",
        assigned_to: actorIds.inspector,
        created_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(rpAErr, null, rpAErr?.message);
    regProcAId = rpA.id;

    // 9. Seed Financial Ledger (Obligation, Transactions, Internal Note)
    const { data: obA, error: obAErr } = await serviceClient
      .from("shipment_customs_obligations")
      .insert({
        shipment_id: shipmentAId,
        claim_type: "primary_assessment",
        customs_claim_number: `CLM-${runId}`,
        assessed_amount: 50000,
        currency: "EGP",
        status: "assessed",
        created_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(obAErr, null, obAErr?.message);
    obligationAId = obA.id;

    const nowIso = new Date().toISOString();
    const { data: txBill, error: txBillErr } = await serviceClient
      .from("shipment_financial_transactions")
      .insert({
        shipment_id: shipmentAId,
        customs_obligation_id: obligationAId,
        entry_category: "out_disbursement",
        entry_type: "customs_duties",
        entry_status: "posted",
        direction: 1,
        amount: 20000,
        allocated_customs_amount: 20000,
        currency: "EGP",
        is_billable_to_customer: true,
        customer_visible: true,
        payment_method: "bank_transfer",
        reference_number: `BNK-BILL-${runId}`,
        idempotency_key: `idem-bill-${runId}`,
        created_by: actorIds.admin,
        verified_by: actorIds.admin,
        verified_at: nowIso,
      })
      .select("id")
      .single();
    assert.equal(txBillErr, null, txBillErr?.message);
    txABillableId = txBill.id;

    const { data: txNonBill, error: txNonBillErr } = await serviceClient
      .from("shipment_financial_transactions")
      .insert({
        shipment_id: shipmentAId,
        customs_obligation_id: null,
        entry_category: "out_disbursement",
        entry_type: "other_expense",
        entry_status: "posted",
        direction: 1,
        amount: 450,
        allocated_customs_amount: 0,
        currency: "EGP",
        is_billable_to_customer: false,
        customer_visible: false,
        payment_method: "cash",
        reference_number: `INT-EXP-${runId}`,
        description: "INTERNAL ONLY NON-BILLABLE EXPENSE",
        idempotency_key: `idem-nonbill-${runId}`,
        created_by: actorIds.admin,
        verified_by: actorIds.admin,
        verified_at: nowIso,
      })
      .select("id")
      .single();
    assert.equal(txNonBillErr, null, txNonBillErr?.message);
    txANonBillableId = txNonBill.id;

    const { data: txPend, error: txPendErr } = await serviceClient
      .from("shipment_financial_transactions")
      .insert({
        shipment_id: shipmentAId,
        customs_obligation_id: obligationAId,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "pending_verification",
        direction: 1,
        amount: 10000,
        allocated_customs_amount: 10000,
        currency: "EGP",
        is_billable_to_customer: false,
        customer_visible: false,
        payment_method: "nafeza_epay",
        reference_number: `PEND-${runId}`,
        idempotency_key: `idem-pend-${runId}`,
        created_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(txPendErr, null, txPendErr?.message);
    txAPendingId = txPend.id;

    const { data: txRej, error: txRejErr } = await serviceClient
      .from("shipment_financial_transactions")
      .insert({
        shipment_id: shipmentAId,
        customs_obligation_id: obligationAId,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "rejected",
        direction: 1,
        amount: 5000,
        allocated_customs_amount: 5000,
        currency: "EGP",
        is_billable_to_customer: false,
        customer_visible: false,
        payment_method: "nafeza_epay",
        reference_number: `REJ-${runId}`,
        rejection_reason: "إيصال غير واضح",
        idempotency_key: `idem-rej-${runId}`,
        created_by: actorIds.admin,
        verified_by: actorIds.admin,
        verified_at: nowIso,
      })
      .select("id")
      .single();
    assert.equal(txRejErr, null, txRejErr?.message);
    txARejectedId = txRej.id;

    const { data: noteA, error: noteAErr } = await serviceClient
      .from("shipment_financial_internal_notes")
      .insert({
        shipment_id: shipmentAId,
        transaction_id: txABillableId,
        note: `SECRET ADMIN/MANAGER MARGIN NOTE ${runId}`,
        created_by: actorIds.admin,
      })
      .select("id")
      .single();
    assert.equal(noteAErr, null, noteAErr?.message);
    internalNoteAId = noteA.id;

    // 10. Seed Notifications & Tracking Cache
    const { data: notifA, error: notifAErr } = await serviceClient
      .from("notifications")
      .insert({
        user_id: actorIds.customerA,
        shipment_id: shipmentAId,
        title: "RLS Notification A",
        message: "Test notification",
        type: "info",
      })
      .select("id")
      .single();
    assert.equal(notifAErr, null, notifAErr?.message);
    notificationAId = notifA.id;

    const { data: tc, error: tcErr } = await serviceClient
      .from("shipment_tracking_cache")
      .insert({
        tracking_number: `TRK-${runId}`,
        identifier_type: "container",
        status: "in_transit",
        payload: { rlsTest: true },
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    assert.equal(tcErr, null, tcErr?.message);
    trackingCacheId = tc.id;
  });

  after(async () => {
    if (!serviceClient) return;
    // Remove financial ledger rows first (triggers prevent DELETE on posted tx/obligations via trigger! Wait — service_role STILL fires triggers unless cleaned via shipments ON DELETE CASCADE? Careful: shipment_customs_obligations uses ON DELETE RESTRICT on shipments!).
    // So clean up non-restricted test data cleanly; note trigger `IMMUTABLE_FINANCIAL_LEDGER` blocks DELETE even for service_role — we clean auth users + storage + test rows where deletable!
    for (const item of storageCleanup) {
      await serviceClient.storage.from(item.bucket).remove(item.paths).catch(() => undefined);
    }
    if (trackingCacheId) {
      await serviceClient.from("shipment_tracking_cache").delete().eq("id", trackingCacheId);
    }
    if (createdShipmentIds.length > 0) {
      await serviceClient.from("shipments").delete().in("id", createdShipmentIds);
    }
    if (createdCompanyIds.length > 0) {
      await serviceClient.from("companies").delete().in("id", createdCompanyIds);
    }
    for (const uid of createdUserIds) {
      await serviceClient.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  });

  // ─── Section A: Unauthenticated (anon) ─────────────────────────────────────
  it("A. Unauthenticated anon client is denied across all tables, RPCs, and Storage buckets", async () => {
    for (const tbl of [
      "profiles",
      "companies",
      "company_documents",
      "shipments",
      "documents",
      "shipment_pricing",
      "shipment_pricing_history",
      "shipment_invoice_reviews",
      "shipment_acids",
      "shipment_acid_history",
      "shipment_document_reviews",
      "shipment_stage_history",
      "shipment_external_operations",
      "shipment_customs_stages",
      "shipment_customs_stage_history",
      "shipment_regulatory_procedures",
      "shipment_customs_obligations",
      "shipment_financial_transactions",
      "shipment_financial_internal_notes",
      "notifications",
      "shipment_tracking_cache",
      "shipment_financial_migration_audit_v",
    ]) {
      const res = await clients.anon.from(tbl).select("*").limit(5);
      expectBlocked(res, `anon SELECT ${tbl}`);
    }

    const rpcSum = await clients.anon.rpc("get_shipment_financial_summary", {
      p_shipment_id: shipmentAId,
    });
    assert.ok(rpcSum.error, "anon should be denied get_shipment_financial_summary");

    const rpcStmt = await clients.anon.rpc("get_customer_shipment_financial_statement", {
      p_shipment_id: shipmentAId,
    });
    assert.ok(rpcStmt.error, "anon should be denied get_customer_shipment_financial_statement");

    const stDownDoc = await clients.anon.storage.from("documents").download(docStoragePathA);
    assert.ok(stDownDoc.error, "anon should not download from documents bucket");

    const stDownComp = await clients.anon.storage
      .from("company-documents")
      .download(compStoragePathA);
    assert.ok(stDownComp.error, "anon should not download from company-documents bucket");
  });

  // ─── Section B: Manager Strict Read-Only on EVERY Table & Storage Bucket ───
  describe("B. Manager role is strictly read-only on all tables, RPCs, and Storage", () => {
    it("allows manager SELECT on operational, pricing, ledger tables, audit view, and financial RPCs", async () => {
      for (const tbl of [
        "profiles",
        "companies",
        "company_documents",
        "shipments",
        "documents",
        "shipment_pricing",
        "shipment_pricing_history",
        "shipment_invoice_reviews",
        "shipment_acids",
        "shipment_acid_history",
        "shipment_document_reviews",
        "shipment_stage_history",
        "shipment_external_operations",
        "shipment_customs_stages",
        "shipment_customs_stage_history",
        "shipment_regulatory_procedures",
        "shipment_customs_obligations",
        "shipment_financial_transactions",
        "shipment_financial_internal_notes",
        "shipment_financial_migration_audit_v",
      ]) {
        const res = await clients.manager.from(tbl).select("*").limit(1);
        assert.equal(res.error, null, `manager SELECT ${tbl} error: ${res.error?.message}`);
        assert.ok((res.data?.length ?? 0) >= 1, `manager should see seeded rows in ${tbl}`);
      }

      const rpcSum = await clients.manager.rpc("get_shipment_financial_summary", {
        p_shipment_id: shipmentAId,
      });
      assert.equal(rpcSum.error, null, `manager RPC summary error: ${rpcSum.error?.message}`);

      const rpcStmt = await clients.manager.rpc("get_customer_shipment_financial_statement", {
        p_shipment_id: shipmentAId,
      });
      assert.equal(rpcStmt.error, null, `manager RPC statement error: ${rpcStmt.error?.message}`);
    });

    it("blocks manager INSERT, UPDATE, and DELETE on shipment_pricing & shipment_pricing_history", async () => {
      expectBlocked(
        await clients.manager.from("shipment_pricing").insert({
          shipment_id: shipmentCId,
          estimated_min_price: 1000,
          estimated_max_price: 2000,
          status: "proposed",
        }),
        "manager INSERT shipment_pricing",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_pricing")
          .update({ final_price: 9999 })
          .eq("id", pricingAId)
          .select("*"),
        "manager UPDATE shipment_pricing",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_pricing")
          .delete()
          .eq("id", pricingAId)
          .select("*"),
        "manager DELETE shipment_pricing",
      );
      expectBlocked(
        await clients.manager.from("shipment_pricing_history").insert({
          shipment_id: shipmentAId,
          pricing_id: pricingAId,
          action: "final_price_set",
          performed_by: actorIds.manager,
        }),
        "manager INSERT shipment_pricing_history",
      );
    });

    it("blocks manager writes on financial ledger tables (obligations, transactions, internal_notes)", async () => {
      expectBlocked(
        await clients.manager.from("shipment_customs_obligations").insert({
          shipment_id: shipmentAId,
          claim_type: "supplementary_assessment",
          assessed_amount: 500,
        }),
        "manager INSERT shipment_customs_obligations",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_customs_obligations")
          .update({ assessed_amount: 99999 })
          .eq("id", obligationAId)
          .select("*"),
        "manager UPDATE shipment_customs_obligations",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_customs_obligations")
          .delete()
          .eq("id", obligationAId)
          .select("*"),
        "manager DELETE shipment_customs_obligations",
      );

      expectBlocked(
        await clients.manager.from("shipment_financial_transactions").insert({
          shipment_id: shipmentAId,
          entry_category: "customer_charge",
          entry_type: "other_charge",
          entry_status: "posted",
          direction: 1,
          amount: 100,
          allocated_customs_amount: 0,
          is_billable_to_customer: true,
          customer_visible: true,
          description: "Manager rogue charge",
          idempotency_key: `mgr-tx-${runId}`,
          created_by: actorIds.manager,
          verified_by: actorIds.manager,
          verified_at: new Date().toISOString(),
        }),
        "manager INSERT shipment_financial_transactions",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_financial_transactions")
          .update({ entry_status: "posted", customer_visible: true })
          .eq("id", txAPendingId)
          .select("*"),
        "manager UPDATE shipment_financial_transactions",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_financial_transactions")
          .delete()
          .eq("id", txABillableId)
          .select("*"),
        "manager DELETE shipment_financial_transactions",
      );

      expectBlocked(
        await clients.manager.from("shipment_financial_internal_notes").insert({
          shipment_id: shipmentAId,
          note: "Manager rogue note",
          created_by: actorIds.manager,
        }),
        "manager INSERT shipment_financial_internal_notes",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_financial_internal_notes")
          .delete()
          .eq("id", internalNoteAId)
          .select("*"),
        "manager DELETE shipment_financial_internal_notes",
      );
    });

    it("blocks manager writes on documents, shipments, ACIDs, reviews, stages, procedures, profiles, and companies", async () => {
      expectBlocked(
        await clients.manager
          .from("documents")
          .update({ status: "approved" })
          .eq("id", documentAPendingId)
          .select("*"),
        "manager UPDATE documents",
      );
      expectBlocked(
        await clients.manager.from("documents").insert({
          customer_id: actorIds.customerA,
          shipment_id: shipmentAId,
          company_id: companyAId,
          title: "Mgr doc",
          file_name: "mgr.pdf",
          file_path: "mgr/mgr.pdf",
          file_size: 10,
          mime_type: "application/pdf",
        }),
        "manager INSERT documents",
      );
      expectBlocked(
        await clients.manager
          .from("shipments")
          .update({ status: "customs_cleared" })
          .eq("id", shipmentAId)
          .select("*"),
        "manager UPDATE shipments",
      );
      expectBlocked(
        await clients.manager.from("shipments").insert({
          company_id: companyAId,
          customer_id: actorIds.customerA,
          status: "draft",
        }),
        "manager INSERT shipments",
      );
      expectBlocked(
        await clients.manager.from("shipment_invoice_reviews").insert({
          shipment_id: shipmentAId,
          document_id: documentAPendingId,
          action: "approved",
          performed_by: actorIds.manager,
        }),
        "manager INSERT shipment_invoice_reviews",
      );
      expectBlocked(
        await clients.manager.from("shipment_acids").insert({
          shipment_id: shipmentCId,
          status: "pending",
        }),
        "manager INSERT shipment_acids",
      );
      expectBlocked(
        await clients.manager.from("shipment_acid_history").insert({
          shipment_acid_id: acidAId,
          shipment_id: shipmentAId,
          action: "processing_started",
          new_status: "processing",
          performed_by: actorIds.manager,
        }),
        "manager INSERT shipment_acid_history",
      );
      expectBlocked(
        await clients.manager.from("shipment_document_reviews").insert({
          document_id: documentAPendingId,
          shipment_id: shipmentAId,
          document_type: "proforma_invoice",
          action: "approved",
          performed_by: actorIds.manager,
        }),
        "manager INSERT shipment_document_reviews",
      );
      expectBlocked(
        await clients.manager.from("shipment_stage_history").insert({
          shipment_id: shipmentAId,
          action: "mgr_test",
          performed_by: actorIds.manager,
        }),
        "manager INSERT shipment_stage_history",
      );
      expectBlocked(
        await clients.manager.from("shipment_external_operations").insert({
          shipment_id: shipmentAId,
          platform: "nafeza",
          operation_type: "test",
          title: "Mgr op",
          operation_date: new Date().toISOString(),
          created_by: actorIds.manager,
          outcome: "pending",
        }),
        "manager INSERT shipment_external_operations",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_customs_stages")
          .update({ status: "completed", notes: "mgr write attempt" })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_5_scouting")
          .select("*"),
        "manager UPDATE non-financial shipment_customs_stages",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_customs_stages")
          .update({ status: "completed" })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_9_fees_payments")
          .select("*"),
        "manager UPDATE financial stage_9 shipment_customs_stages",
      );
      expectBlocked(
        await clients.manager.from("shipment_customs_stage_history").insert({
          shipment_id: shipmentAId,
          stage_key: "stage_5_scouting",
          action: "status_updated",
          performed_by: actorIds.manager,
        }),
        "manager INSERT shipment_customs_stage_history",
      );
      expectBlocked(
        await clients.manager
          .from("shipment_regulatory_procedures")
          .update({ status: "approved" })
          .eq("id", regProcAId)
          .select("*"),
        "manager UPDATE shipment_regulatory_procedures",
      );
      expectBlocked(
        await clients.manager.from("companies").insert({ name: "Mgr Comp" }),
        "manager INSERT companies",
      );
      expectBlocked(
        await clients.manager
          .from("company_documents")
          .update({ status: "approved" })
          .eq("id", companyDocAId)
          .select("*"),
        "manager UPDATE company_documents",
      );
      expectBlocked(
        await clients.manager
          .from("profiles")
          .update({ role: "admin" })
          .eq("id", actorIds.manager)
          .select("*"),
        "manager UPDATE own role in profiles",
      );
    });
  });

  // ─── Section C: Admin Permissions & Database Triggers ──────────────────────
  it("C. Admin succeeds on permitted writes while immutable DB triggers block deletions/stage bypasses", async () => {
    expectWriteAllowed(
      await clients.admin.from("shipment_financial_internal_notes").insert({
        shipment_id: shipmentAId,
        note: `Admin verified note ${runId}`,
        created_by: actorIds.admin,
      }),
      "admin INSERT shipment_financial_internal_notes",
    );

    expectWriteAllowed(
      await clients.admin
        .from("shipment_customs_stages")
        .update({ notes: "Admin stage note" })
        .eq("shipment_id", shipmentAId)
        .eq("stage_key", "stage_5_scouting")
        .select("*"),
      "admin UPDATE shipment_customs_stages",
    );

    // Trigger check: even admin cannot DELETE posted ledger transaction
    const delTx = await clients.admin
      .from("shipment_financial_transactions")
      .delete()
      .eq("id", txABillableId);
    assert.ok(delTx.error, "DB trigger must block DELETE on shipment_financial_transactions");

    // Trigger check: even admin cannot mutate amount on existing tx
    const mutTx = await clients.admin
      .from("shipment_financial_transactions")
      .update({ amount: 1 })
      .eq("id", txABillableId);
    assert.ok(mutTx.error, "DB trigger must block amount mutation on shipment_financial_transactions");

    // Trigger check: even admin cannot complete stage_9 before settlement or stage_10 before stage_9
    const badSt9 = await clients.admin
      .from("shipment_customs_stages")
      .update({ status: "completed" })
      .eq("shipment_id", shipmentAId)
      .eq("stage_key", "stage_9_fees_payments");
    assert.ok(badSt9.error, "DB trigger must block completing Stage 9 before settlement");

    const badSt10 = await clients.admin.from("shipment_customs_stages").insert({
      shipment_id: shipmentAId,
      stage_key: "stage_10_clearance_release",
      stage_order: 11,
      status: "completed",
      expected_role: "admin",
    });
    assert.ok(badSt10.error, "DB trigger must block completing Stage 10 before Stage 9");

    // Trigger check: even admin cannot alter issued ACID number
    const badAcid = await clients.admin
      .from("shipment_acids")
      .update({ acid_number: "999999999999" })
      .eq("id", acidAId);
    assert.ok(badAcid.error, "DB trigger must block mutating issued ACID number");
  });

  // ─── Section D: Operational Staff (data_entry, scout, inspector) ───────────
  describe("D. data_entry, scout, and inspector least-privilege isolation", () => {
    it("blocks data_entry, scout, and inspector from pricing, ledger tables, financial RPCs, and internal notes", async () => {
      for (const roleName of ["data_entry", "scout", "inspector"] as const) {
        const c = clients[roleName];
        for (const tbl of [
          "shipment_pricing",
          "shipment_pricing_history",
          "shipment_customs_obligations",
          "shipment_financial_transactions",
          "shipment_financial_internal_notes",
          "shipment_financial_migration_audit_v",
          "shipment_tracking_cache",
        ]) {
          expectBlocked(await c.from(tbl).select("*"), `${roleName} SELECT ${tbl}`);
        }

        expectBlocked(
          await c.rpc("get_shipment_financial_summary", { p_shipment_id: shipmentAId }),
          `${roleName} RPC get_shipment_financial_summary`,
        );
        expectBlocked(
          await c.rpc("get_customer_shipment_financial_statement", {
            p_shipment_id: shipmentAId,
          }),
          `${roleName} RPC get_customer_shipment_financial_statement`,
        );

        // Cannot read stage_2_pricing or stage_9_fees_payments
        expectBlocked(
          await c
            .from("shipment_customs_stages")
            .select("*")
            .eq("shipment_id", shipmentAId)
            .in("stage_key", ["stage_2_pricing", "stage_9_fees_payments"]),
          `${roleName} SELECT financial customs stages`,
        );

        // Cannot write shipments or documents
        expectBlocked(
          await c
            .from("shipments")
            .update({ status: "customs_cleared" })
            .eq("id", shipmentAId)
            .select("*"),
          `${roleName} UPDATE shipments`,
        );
        expectBlocked(
          await c
            .from("documents")
            .update({ status: "approved" })
            .eq("id", documentAPendingId)
            .select("*"),
          `${roleName} UPDATE documents`,
        );
      }
    });

    it("enforces role-specific operational writes (assigned stage & external ops/procedures) and blocks unassigned/structural writes", async () => {
      // Scout can update assigned stage_5_scouting & log history, NOT stage_6_inspection or structural fields
      expectWriteAllowed(
        await clients.scout
          .from("shipment_customs_stages")
          .update({ notes: "Scout inspection field note" })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_5_scouting")
          .select("*"),
        "scout UPDATE own assigned stage_5_scouting",
      );
      expectWriteAllowed(
        await clients.scout.from("shipment_customs_stage_history").insert({
          shipment_id: shipmentAId,
          stage_key: "stage_5_scouting",
          action: "status_updated",
          notes: "scout history",
          performed_by: actorIds.scout,
        }),
        "scout INSERT stage_5_scouting history",
      );
      expectBlocked(
        await clients.scout
          .from("shipment_customs_stages")
          .update({ notes: "Scout hijack stage 6" })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_6_inspection")
          .select("*"),
        "scout UPDATE inspector stage_6_inspection",
      );
      expectBlocked(
        await clients.scout
          .from("shipment_customs_stages")
          .update({ assigned_to: actorIds.data_entry })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_5_scouting")
          .select("*"),
        "scout structural mutation on stage_5_scouting",
      );
      expectBlocked(
        await clients.scout
          .from("shipment_regulatory_procedures")
          .update({ status: "approved" })
          .eq("id", regProcAId)
          .select("*"),
        "scout UPDATE shipment_regulatory_procedures",
      );
      expectBlocked(
        await clients.scout.from("shipment_external_operations").insert({
          shipment_id: shipmentAId,
          platform: "nafeza",
          operation_type: "test",
          title: "Scout ext op",
          operation_date: new Date().toISOString(),
          created_by: actorIds.scout,
          outcome: "pending",
        }),
        "scout INSERT shipment_external_operations",
      );

      // Inspector can update assigned stage_6_inspection and assigned regulatory procedures
      expectWriteAllowed(
        await clients.inspector
          .from("shipment_customs_stages")
          .update({ notes: "Inspector update" })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_6_inspection")
          .select("*"),
        "inspector UPDATE stage_6_inspection",
      );
      expectWriteAllowed(
        await clients.inspector
          .from("shipment_regulatory_procedures")
          .update({ status: "in_progress" })
          .eq("id", regProcAId)
          .select("*"),
        "inspector UPDATE assigned regulatory procedure",
      );
      expectWriteAllowed(
        await clients.inspector.from("shipment_external_operations").insert({
          shipment_id: shipmentAId,
          platform: "nafeza",
          operation_type: "inspection",
          title: "Inspector op",
          operation_date: new Date().toISOString(),
          created_by: actorIds.inspector,
          outcome: "pending",
        }),
        "inspector INSERT shipment_external_operations",
      );

      // Data entry can update assigned stage_7_data_entry and insert external operations, NOT regulatory procedures
      expectWriteAllowed(
        await clients.data_entry
          .from("shipment_customs_stages")
          .update({ notes: "Data entry MT46 draft" })
          .eq("shipment_id", shipmentAId)
          .eq("stage_key", "stage_7_data_entry")
          .select("*"),
        "data_entry UPDATE stage_7_data_entry",
      );
      expectWriteAllowed(
        await clients.data_entry.from("shipment_external_operations").insert({
          shipment_id: shipmentAId,
          platform: "nafeza",
          operation_type: "mt46",
          title: "Data entry op",
          operation_date: new Date().toISOString(),
          created_by: actorIds.data_entry,
          outcome: "pending",
        }),
        "data_entry INSERT shipment_external_operations",
      );
      expectBlocked(
        await clients.data_entry
          .from("shipment_regulatory_procedures")
          .update({ status: "approved" })
          .eq("id", regProcAId)
          .select("*"),
        "data_entry UPDATE shipment_regulatory_procedures",
      );
      expectBlocked(
        await clients.data_entry.from("shipments").select("*").eq("id", shipmentBId),
        "data_entry SELECT unassigned Shipment B",
      );
    });
  });

  // ─── Section E: Customer Ownership, Financial Privacy & Escalation ─────────
  describe("E. Customer ownership, company colleague isolation, ledger privacy & escalation checks", () => {
    it("allows customerA to see only Shipment A visible rows, hiding internal notes, non-billable, pending & rejected rows, and all Shipment B data", async () => {
      // Customer A sees billable posted tx, NEVER sees non-billable, pending, rejected, internal notes, or Shipment B
      const txRes = await clients.customerA
        .from("shipment_financial_transactions")
        .select("id, entry_status, is_billable_to_customer, customer_visible, shipment_id");
      assert.equal(txRes.error, null, txRes.error?.message);
      const visibleIds = new Set((txRes.data || []).map((r: { id: string }) => r.id));
      assert.ok(visibleIds.has(txABillableId), "customerA should see visible posted billable tx");
      assert.ok(!visibleIds.has(txANonBillableId), "customerA must NOT see non-billable expense");
      assert.ok(!visibleIds.has(txAPendingId), "customerA must NOT see pending_verification tx");
      assert.ok(!visibleIds.has(txARejectedId), "customerA must NOT see rejected tx");

      expectBlocked(
        await clients.customerA.from("shipment_financial_internal_notes").select("*"),
        "customerA SELECT shipment_financial_internal_notes",
      );
      expectBlocked(
        await clients.customerA
          .from("shipments")
          .select("*")
          .eq("id", shipmentBId),
        "customerA SELECT Shipment B",
      );
      expectBlocked(
        await clients.customerA.rpc("get_shipment_financial_summary", {
          p_shipment_id: shipmentBId,
        }),
        "customerA RPC summary on Shipment B",
      );

      // Customer A summary RPC returns non_billable_out_disbursements = 0
      const sumA = await clients.customerA.rpc("get_shipment_financial_summary", {
        p_shipment_id: shipmentAId,
      });
      assert.equal(sumA.error, null, sumA.error?.message);
      const sumRow = Array.isArray(sumA.data) ? sumA.data[0] : sumA.data;
      assert.equal(
        Number(sumRow?.non_billable_out_disbursements ?? -1),
        0,
        "customerA summary must mask non_billable_out_disbursements to 0",
      );
    });

    it("enforces is_authorized_customer_for_shipment against same-company colleague on ledger & RPCs and checks customerB isolation", async () => {
      // Same-company colleague (different customer_id) must NOT access Shipment A financial obligations/tx/summary
      expectBlocked(
        await clients.customerA_colleague
          .from("shipment_customs_obligations")
          .select("*")
          .eq("shipment_id", shipmentAId),
        "customerA_colleague SELECT Shipment A obligations",
      );
      expectBlocked(
        await clients.customerA_colleague
          .from("shipment_financial_transactions")
          .select("*")
          .eq("shipment_id", shipmentAId),
        "customerA_colleague SELECT Shipment A transactions",
      );
      expectBlocked(
        await clients.customerA_colleague.rpc("get_shipment_financial_summary", {
          p_shipment_id: shipmentAId,
        }),
        "customerA_colleague RPC summary on Shipment A",
      );
      expectBlocked(
        await clients.customerA_colleague.rpc("get_customer_shipment_financial_statement", {
          p_shipment_id: shipmentAId,
        }),
        "customerA_colleague RPC statement on Shipment A",
      );

      // CustomerB sees zero of Company A / Shipment A, and CustomerA sees zero of Company B docs
      expectBlocked(
        await clients.customerB.from("shipments").select("*").eq("id", shipmentAId),
        "customerB SELECT Shipment A",
      );
      expectBlocked(
        await clients.customerB
          .from("notifications")
          .select("*")
          .eq("id", notificationAId),
        "customerB SELECT customerA notification",
      );
      expectBlocked(
        await clients.customerA.from("documents").select("*").eq("id", documentBId),
        "customerA SELECT Shipment B document",
      );
      expectBlocked(
        await clients.customerA
          .from("company_documents")
          .select("*")
          .eq("id", companyDocBId),
        "customerA SELECT Company B company_document",
      );
    });

    it("blocks customer writes to protected financial, customs, and approval records", async () => {
      expectBlocked(
        await clients.customerA.from("shipment_customs_obligations").insert({
          shipment_id: shipmentAId,
          claim_type: "supplementary_assessment",
          assessed_amount: 100,
        }),
        "customerA INSERT obligation",
      );
      expectBlocked(
        await clients.customerA.from("shipment_financial_transactions").insert({
          shipment_id: shipmentAId,
          entry_category: "customer_payment_to_out",
          entry_type: "final_settlement",
          entry_status: "posted",
          direction: 1,
          amount: 8000,
          allocated_customs_amount: 0,
          is_billable_to_customer: true,
          customer_visible: true,
          idempotency_key: `cust-rogue-${runId}`,
          created_by: actorIds.customerA,
          verified_by: actorIds.customerA,
          verified_at: new Date().toISOString(),
        }),
        "customerA INSERT financial transaction",
      );
      expectBlocked(
        await clients.customerA
          .from("documents")
          .update({ status: "approved" })
          .eq("id", documentAPendingId)
          .select("*"),
        "customerA self-approve pending document",
      );
      expectBlocked(
        await clients.customerA
          .from("documents")
          .delete()
          .eq("id", documentAApprovedId)
          .select("*"),
        "customerA delete approved document",
      );
      expectBlocked(
        await clients.customerA
          .from("shipments")
          .update({ status: "customs_cleared" })
          .eq("id", shipmentAId)
          .select("*"),
        "customerA set shipment status to customs_cleared",
      );
      expectBlocked(
        await clients.customerA
          .from("profiles")
          .update({ role: "admin" })
          .eq("id", actorIds.customerA)
          .select("*"),
        "customerA escalate own role in profiles",
      );
      expectBlocked(
        await clients.customerA
          .from("profiles")
          .update({ provisioning_status: "disabled" })
          .eq("id", actorIds.customerA)
          .select("*"),
        "customerA mutate own provisioning_status in profiles (checks profiles_update_own guard)",
      );
    });
  });

  // ─── Section F: Storage Bucket Policies (`documents` & `company-documents`) ─
  describe("F. Storage bucket RLS policies (documents & company-documents)", () => {
    const dummyBytes = Buffer.from("rls-storage-probe", "utf8");

    it("tests 'documents' bucket across customerA, customerB, colleague, admin, manager, and staff", async () => {
      // Customer A can download & upload to own folder {customerA.id}/*
      const ownDown = await clients.customerA.storage.from("documents").download(docStoragePathA);
      assert.equal(ownDown.error, null, `customerA download own doc: ${ownDown.error?.message}`);

      const custAUploadPath = `${actorIds.customerA}/rls-${runId}/probe.txt`;
      const ownUp = await clients.customerA.storage
        .from("documents")
        .upload(custAUploadPath, dummyBytes, { upsert: false });
      assert.equal(ownUp.error, null, `customerA upload own folder: ${ownUp.error?.message}`);
      storageCleanup.push({ bucket: "documents", paths: [custAUploadPath] });

      // Customer A CANNOT download or upload to Customer B's folder
      const crossDown = await clients.customerA.storage.from("documents").download(docStoragePathB);
      assert.ok(crossDown.error, "customerA must NOT download customerB file");

      const crossUp = await clients.customerA.storage
        .from("documents")
        .upload(`${actorIds.customerB}/rls-${runId}/rogue.txt`, dummyBytes);
      assert.ok(crossUp.error, "customerA must NOT upload into customerB folder");

      // Admin can download all documents
      const adminDown = await clients.admin.storage.from("documents").download(docStoragePathA);
      assert.equal(adminDown.error, null, `admin download documents: ${adminDown.error?.message}`);

      // Manager read-only check on documents bucket: CANNOT upload or delete; check SELECT access accurately
      const mgrDown = await clients.manager.storage.from("documents").download(docStoragePathA);
      assert.equal(
        mgrDown.error,
        null,
        `manager read access to 'documents' storage bucket failed (documents_storage_select_admin uses is_admin() instead of is_admin_or_manager()): ${mgrDown.error?.message}`,
      );

      const mgrUp = await clients.manager.storage
        .from("documents")
        .upload(`${actorIds.customerA}/rls-${runId}/mgr-rogue.txt`, dummyBytes);
      assert.ok(mgrUp.error, "manager must NOT upload to 'documents' bucket");

      const mgrDel = await clients.manager.storage.from("documents").remove([docStoragePathA]);
      assert.ok(
        mgrDel.error || (mgrDel.data?.length ?? 0) === 0,
        "manager must NOT delete from 'documents' bucket",
      );

      // Field staff (scout, inspector, data_entry) cannot download or upload arbitrary customer documents
      for (const staffRole of ["scout", "inspector", "data_entry"] as const) {
        const sDown = await clients[staffRole].storage.from("documents").download(docStoragePathA);
        assert.ok(sDown.error, `${staffRole} should NOT download from 'documents' bucket`);
        const sUp = await clients[staffRole].storage
          .from("documents")
          .upload(`${actorIds.customerA}/rls-${runId}/${staffRole}-rogue.txt`, dummyBytes);
        assert.ok(sUp.error, `${staffRole} should NOT upload to 'documents' bucket`);
      }
    });

    it("tests 'company-documents' bucket across companyA, companyB, admin, manager, and staff", async () => {
      // Customer A & colleague can download from Company A's folder, NOT Company B's folder
      const compDownA = await clients.customerA.storage
        .from("company-documents")
        .download(compStoragePathA);
      assert.equal(
        compDownA.error,
        null,
        `customerA download Company A doc: ${compDownA.error?.message}`,
      );

      const colDownA = await clients.customerA_colleague.storage
        .from("company-documents")
        .download(compStoragePathA);
      assert.equal(
        colDownA.error,
        null,
        `customerA_colleague download Company A doc: ${colDownA.error?.message}`,
      );

      const crossCompDown = await clients.customerA.storage
        .from("company-documents")
        .download(compStoragePathB);
      assert.ok(crossCompDown.error, "customerA must NOT download Company B doc");

      const crossCompUp = await clients.customerA.storage
        .from("company-documents")
        .upload(`${companyBId}/rls-${runId}/rogue.txt`, dummyBytes);
      assert.ok(crossCompUp.error, "customerA must NOT upload to Company B folder");

      // Admin can upload, download, and manage company-documents
      const adminCompDown = await clients.admin.storage
        .from("company-documents")
        .download(compStoragePathA);
      assert.equal(
        adminCompDown.error,
        null,
        `admin download company-documents: ${adminCompDown.error?.message}`,
      );

      // Manager CAN download company-documents (read-only) and CANNOT upload/delete
      const mgrCompDown = await clients.manager.storage
        .from("company-documents")
        .download(compStoragePathA);
      assert.equal(
        mgrCompDown.error,
        null,
        `manager download company-documents: ${mgrCompDown.error?.message}`,
      );

      const mgrCompUp = await clients.manager.storage
        .from("company-documents")
        .upload(`${companyAId}/rls-${runId}/mgr-comp-rogue.txt`, dummyBytes);
      assert.ok(mgrCompUp.error, "manager must NOT upload to 'company-documents' bucket");

      const mgrCompDel = await clients.manager.storage
        .from("company-documents")
        .remove([compStoragePathA]);
      assert.ok(
        mgrCompDel.error || (mgrCompDel.data?.length ?? 0) === 0,
        "manager must NOT delete from 'company-documents' bucket",
      );

      // Staff cannot read/upload company-documents
      for (const staffRole of ["scout", "inspector", "data_entry"] as const) {
        const sCompDown = await clients[staffRole].storage
          .from("company-documents")
          .download(compStoragePathA);
        assert.ok(sCompDown.error, `${staffRole} must NOT download company-documents`);
      }
    });
  });
});
