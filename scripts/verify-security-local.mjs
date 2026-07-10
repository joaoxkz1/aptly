import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceRoleKey) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SERVICE_ROLE_KEY."
  );
}

const hostname = new URL(url).hostname;
if (!["localhost", "127.0.0.1", "::1"].includes(hostname)) {
  throw new Error("Refusing to run: this verifier is restricted to local Supabase URLs.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const createdUsers = [];
const results = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function safeError(error) {
  const message = error instanceof Error ? error.message : "unknown verification error";
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, "<local-id>")
    .replace(/eyJ[A-Za-z0-9._-]+/g, "<local-token>")
    .slice(0, 240);
}

async function run(number, label, verification) {
  try {
    const evidence = await verification();
    results.push({ number, label, status: "PASS", evidence });
    console.log(`PASS ${String(number).padStart(2, "0")} ${label} — ${evidence}`);
  } catch (error) {
    const evidence = safeError(error);
    results.push({ number, label, status: "FAIL", evidence });
    console.error(`FAIL ${String(number).padStart(2, "0")} ${label} — ${evidence}`);
  }
}

async function createSignedInUser(label) {
  const email = `aptly-security-${label}-${randomUUID()}@example.test`;
  const password = `${randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error("test user creation failed");
  createdUsers.push(data.user.id);
  const client = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  return { id: data.user.id, client };
}

const minimalAttempt = {
  subject: "Economics",
  topic: "Local security test",
  question: "Explain a price ceiling. [4 marks]",
  answer: "A local-only test answer.",
  score: 4,
  max_score: 7,
  feedback: {
    score: 4,
    band: "Test",
    strengths: ["Test"],
    improvements: ["Test"],
    mistakes: [],
    examinerComment: "Test",
    studyNext: "Test",
  },
};

const minimalPractice = {
  authority_version: 1,
  question: "Explain a price ceiling. [4 marks]",
  source_material: null,
  framework: "generic_practice",
  mark_total: 4,
  topic_code: "2.1",
  topic_label: "Demand and supply",
  skill: "economic_analysis",
  why: "Local verification",
};

const validEvidence = {
  version: 1,
  status: "reviewed_clearly",
  graphTypeObserved: "demand and supply",
  relevanceToQuestion: "appears_relevant",
  elements: [{ element: "axes_labels", observed: "visible" }],
  consistencyWithAnswer: "supports",
  improvements: ["Label the new equilibrium."],
};

async function insertAttempt(userId, values = {}) {
  const inserted = await admin
    .from("attempts")
    .insert({
      ...minimalAttempt,
      user_id: userId,
      idempotency_key: randomUUID(),
      ...values,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function insertPractice(userId, values = {}) {
  const inserted = await admin
    .from("practice_questions")
    .insert({
      ...minimalPractice,
      user_id: userId,
      idempotency_key: randomUUID(),
      ...values,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data.id;
}

async function verifyOwnedRelationships(user, parentAttemptId, practiceQuestionId) {
  if (parentAttemptId !== null) {
    const parent = await user.client
      .from("attempts")
      .select("id")
      .eq("id", parentAttemptId)
      .maybeSingle();
    if (parent.error) throw parent.error;
    if (parent.data === null) throw new Error("cross-user parent relationship rejected");
  }
  if (practiceQuestionId !== null) {
    const practice = await user.client
      .from("practice_questions")
      .select("id")
      .eq("id", practiceQuestionId)
      .eq("authority_version", 1)
      .maybeSingle();
    if (practice.error) throw practice.error;
    if (practice.data === null) throw new Error("cross-user practice relationship rejected");
  }
}

async function reserve({
  userId,
  capability,
  idempotencyKey = randomUUID(),
  fingerprint = "a".repeat(64),
  operationGroupKey = null,
  dailyLimit,
}) {
  const response = await admin.rpc("reserve_ai_usage", {
    p_user_id: userId,
    p_capability: capability,
    p_idempotency_key: idempotencyKey,
    p_request_fingerprint: fingerprint,
    p_operation_group_key: operationGroupKey,
    p_daily_limit: dailyLimit,
  });
  if (response.error) throw response.error;
  const row = Array.isArray(response.data) ? response.data[0] : response.data;
  if (!row || typeof row.outcome !== "string") {
    throw new Error("reservation RPC returned no outcome");
  }
  return row;
}

async function expectEvidenceRejected(userId, evidence) {
  const response = await admin.from("attempts").insert({
    ...minimalAttempt,
    user_id: userId,
    idempotency_key: randomUUID(),
    diagram_evidence: evidence,
  });
  assert(response.error, "invalid Diagram Evidence unexpectedly persisted");
}

async function saveAttemptWithReplay(userId, idempotencyKey) {
  const inserted = await admin
    .from("attempts")
    .insert({ ...minimalAttempt, user_id: userId, idempotency_key: idempotencyKey })
    .select("id")
    .single();
  if (!inserted.error) return inserted.data.id;
  const existing = await admin
    .from("attempts")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing.error || existing.data === null) {
    throw existing.error ?? new Error("grade replay row unavailable");
  }
  return existing.data.id;
}

async function savePracticeWithReplay(userId, idempotencyKey) {
  const inserted = await admin
    .from("practice_questions")
    .insert({
      ...minimalPractice,
      user_id: userId,
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();
  if (!inserted.error) return inserted.data.id;
  const existing = await admin
    .from("practice_questions")
    .select("id")
    .eq("user_id", userId)
    .eq("idempotency_key", idempotencyKey)
    .eq("authority_version", 1)
    .maybeSingle();
  if (existing.error || existing.data === null) {
    throw existing.error ?? new Error("practice replay row unavailable");
  }
  return existing.data.id;
}

let userA;
let userB;
let userBAttemptId;
let userBPracticeId;
let userAAttemptId;
let userAPracticeId;

try {
  await run(1, "two authenticated users", async () => {
    userA = await createSignedInUser("a");
    userB = await createSignedInUser("b");
    assert(userA.id !== userB.id, "created sessions did not belong to separate users");
    return "two independent password sessions established through local Auth";
  });

  if (!userA || !userB) {
    for (let number = 2; number <= 19; number += 1) {
      results.push({
        number,
        label: "dependent verification",
        status: "FAIL",
        evidence: "authenticated-user setup failed",
      });
      console.error(
        `FAIL ${String(number).padStart(2, "0")} dependent verification — authenticated-user setup failed`
      );
    }
  } else {
    userBAttemptId = await insertAttempt(userB.id);
    userBPracticeId = await insertPractice(userB.id);

    await run(2, "cross-user isolation", async () => {
      const read = await userA.client
        .from("attempts")
        .select("id")
        .eq("id", userBAttemptId);
      if (read.error) throw read.error;
      assert(read.data.length === 0, "user A read user B's attempt");

      const changed = await userA.client
        .from("attempts")
        .update({ score: 7 })
        .eq("id", userBAttemptId);
      assert(changed.error, "user A changed user B's attempt");

      const deleted = await userA.client
        .from("attempts")
        .delete()
        .eq("id", userBAttemptId);
      if (deleted.error) throw deleted.error;
      const remains = await admin
        .from("attempts")
        .select("id")
        .eq("id", userBAttemptId)
        .maybeSingle();
      if (remains.error) throw remains.error;
      assert(remains.data !== null, "user A deleted user B's attempt");
      return "foreign SELECT returned 0 rows, UPDATE was denied, DELETE affected 0 rows";
    });

    await run(3, "browser attempt INSERT denied", async () => {
      const response = await userA.client.from("attempts").insert(minimalAttempt);
      assert(response.error, "authenticated browser attempt INSERT succeeded");
      return "authenticated role received a database permission error";
    });

    userAAttemptId = await insertAttempt(userA.id);
    await run(4, "browser authoritative attempt UPDATE denied", async () => {
      const response = await userA.client
        .from("attempts")
        .update({ score: 7, feedback: { forged: true }, parent_attempt_id: userBAttemptId })
        .eq("id", userAAttemptId);
      assert(response.error, "authenticated browser authoritative UPDATE succeeded");
      return "score, feedback, and relationship mutation was denied";
    });

    userAPracticeId = await insertPractice(userA.id);
    await run(5, "browser practice INSERT and UPDATE denied", async () => {
      const inserted = await userA.client.from("practice_questions").insert({
        ...minimalPractice,
        question: "Forged practice [45 marks]",
      });
      const updated = await userA.client
        .from("practice_questions")
        .update({ question: "Forged replacement [45 marks]" })
        .eq("id", userAPracticeId);
      assert(inserted.error, "authenticated browser practice INSERT succeeded");
      assert(updated.error, "authenticated browser practice UPDATE succeeded");
      return "both write methods returned database permission errors";
    });

    await run(6, "server-authority persistence", async () => {
      const idempotencyKey = randomUUID();
      const savedId = await insertAttempt(userA.id, { idempotency_key: idempotencyKey });
      const ownRead = await userA.client
        .from("attempts")
        .select("id")
        .eq("id", savedId)
        .maybeSingle();
      if (ownRead.error) throw ownRead.error;
      assert(ownRead.data !== null, "server-created attempt was not visible to its owner");
      return "service-role insert succeeded and owner-scoped read returned exactly one row";
    });

    await run(7, "cross-user parent_attempt_id rejected", async () => {
      let rejected = false;
      try {
        await verifyOwnedRelationships(userA, userBAttemptId, null);
      } catch {
        rejected = true;
      }
      assert(rejected, "foreign parent relationship passed owner verification");
      return "owner-scoped relationship lookup returned no parent row";
    });

    await run(8, "cross-user practice_question_id rejected", async () => {
      let rejected = false;
      try {
        await verifyOwnedRelationships(userA, null, userBPracticeId);
      } catch {
        rejected = true;
      }
      assert(rejected, "foreign practice relationship passed owner verification");
      return "owner-scoped trusted-practice lookup returned no row";
    });

    await run(9, "invalid Diagram Evidence JSON rejected", async () => {
      await expectEvidenceRejected(userA.id, { version: 1, status: "forged" });
      return "PostgreSQL rejected an invalid shape and enum at INSERT";
    });

    await run(10, "Diagram Evidence privacy payloads rejected", async () => {
      const variants = [
        { ...validEvidence, improvements: ["Q".repeat(88)] },
        { ...validEvidence, improvements: ["data:image/png;base64,AAAA"] },
        { ...validEvidence, improvements: ["https://local.invalid/diagram.png"] },
        { ...validEvidence, improvements: ["diagram-final.png"] },
        { ...validEvidence, improvements: ["storage_key/diagram-object"] },
        { ...validEvidence, rawImage: "transient image bytes" },
        { ...validEvidence, improvements: ["x".repeat(17_000)] },
      ];
      for (const variant of variants) await expectEvidenceRejected(userA.id, variant);
      return "7/7 base64, data URL, URL, filename, storage, extra-key, and oversized variants rejected";
    });

    await run(11, "valid current Diagram Evidence accepted", async () => {
      const savedId = await insertAttempt(userA.id, { diagram_evidence: validEvidence });
      const saved = await admin
        .from("attempts")
        .select("diagram_evidence")
        .eq("id", savedId)
        .single();
      if (saved.error) throw saved.error;
      assert(saved.data.diagram_evidence?.version === 1, "valid evidence did not round-trip");
      return "exact seven-key V1 evidence persisted and round-tripped";
    });

    let quotaOutcomes = [];
    await run(12, "atomic synchronized quota reservations", async () => {
      const requests = Array.from({ length: 5 }, () =>
        reserve({ userId: userA.id, capability: "scan", dailyLimit: 3 })
      );
      quotaOutcomes = (await Promise.all(requests)).map((row) => row.outcome).sort();
      assert(
        quotaOutcomes.filter((outcome) => outcome === "reserved").length === 3,
        `expected 3 reservations, received ${quotaOutcomes.join(",")}`
      );
      return "5 concurrent distinct keys serialized to 3 reserved and 2 limited";
    });

    await run(13, "exact quota limit enforced", async () => {
      assert(
        quotaOutcomes.filter((outcome) => outcome === "reserved").length === 3,
        "exact daily limit was not three"
      );
      const count = await admin
        .from("ai_usage_reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA.id)
        .eq("capability", "scan");
      if (count.error) throw count.error;
      assert(count.count === 3, `ledger contains ${count.count} scan reservations`);
      return "ledger count is exactly the configured limit of 3";
    });

    await run(14, "over-limit requests rejected", async () => {
      assert(
        quotaOutcomes.filter((outcome) => outcome === "limited").length === 2,
        "concurrent overflow did not receive two limited outcomes"
      );
      const later = await reserve({ userId: userA.id, capability: "scan", dailyLimit: 3 });
      assert(later.outcome === "limited", `later overflow outcome was ${later.outcome}`);
      return "both synchronized overflow and a later request returned limited";
    });

    await run(15, "same idempotency key creates one reservation", async () => {
      const key = randomUUID();
      const group = randomUUID();
      const responses = await Promise.all(
        Array.from({ length: 2 }, () =>
          reserve({
            userId: userA.id,
            capability: "diagram",
            idempotencyKey: key,
            operationGroupKey: group,
            dailyLimit: 10,
          })
        )
      );
      const outcomes = responses.map((row) => row.outcome).sort();
      assert(outcomes.join(",") === "in_progress,reserved", outcomes.join(","));
      const count = await admin
        .from("ai_usage_reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA.id)
        .eq("capability", "diagram")
        .eq("idempotency_key", key);
      if (count.error) throw count.error;
      assert(count.count === 1, "duplicate key created multiple ledger rows");
      return "concurrent outcomes were reserved/in_progress and ledger count was 1";
    });

    await run(16, "same Grade key cannot duplicate provider work or attempts", async () => {
      const key = randomUUID();
      const reservations = await Promise.all(
        Array.from({ length: 2 }, () =>
          reserve({
            userId: userA.id,
            capability: "grade",
            idempotencyKey: key,
            dailyLimit: 100,
          })
        )
      );
      const providerAuthorities = reservations.filter((row) => row.outcome === "reserved");
      assert(providerAuthorities.length === 1, "duplicate Grade key authorized two provider calls");
      const savedIds = await Promise.all([
        saveAttemptWithReplay(userA.id, key),
        saveAttemptWithReplay(userA.id, key),
      ]);
      assert(savedIds[0] === savedIds[1], "Grade replay returned different attempts");
      const count = await admin
        .from("attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA.id)
        .eq("idempotency_key", key);
      if (count.error) throw count.error;
      assert(count.count === 1, "Grade key created multiple attempts");
      const reservationId = providerAuthorities[0].reservation_id;
      const completed = await admin
        .from("ai_usage_reservations")
        .update({ status: "succeeded", related_attempt_id: savedIds[0] })
        .eq("id", reservationId);
      if (completed.error) throw completed.error;
      const replay = await reserve({
        userId: userA.id,
        capability: "grade",
        idempotencyKey: key,
        dailyLimit: 100,
      });
      assert(replay.outcome === "replay", `durable replay outcome was ${replay.outcome}`);
      return "1 provider authority, 1 durable attempt, and subsequent outcome replay";
    });

    await run(17, "same Practice key cannot duplicate generated rows", async () => {
      const key = randomUUID();
      const reservations = await Promise.all(
        Array.from({ length: 2 }, () =>
          reserve({
            userId: userA.id,
            capability: "practice",
            idempotencyKey: key,
            dailyLimit: 100,
          })
        )
      );
      assert(
        reservations.filter((row) => row.outcome === "reserved").length === 1,
        "duplicate Practice key authorized multiple generations"
      );
      const savedIds = await Promise.all([
        savePracticeWithReplay(userA.id, key),
        savePracticeWithReplay(userA.id, key),
      ]);
      assert(savedIds[0] === savedIds[1], "Practice replay returned different rows");
      const count = await admin
        .from("practice_questions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userA.id)
        .eq("idempotency_key", key);
      if (count.error) throw count.error;
      assert(count.count === 1, "Practice key created multiple generated rows");
      return "1 generation authority and 1 trusted generated row";
    });

    await run(18, "discarded Grade response still consumes quota", async () => {
      const discarded = await reserve({
        userId: userB.id,
        capability: "grade",
        dailyLimit: 1,
      });
      assert(discarded.outcome === "reserved", "discard simulation was not reserved");
      const next = await reserve({
        userId: userB.id,
        capability: "grade",
        dailyLimit: 1,
      });
      assert(next.outcome === "limited", "discarded dispatch did not consume capacity");
      const count = await admin
        .from("ai_usage_reservations")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userB.id)
        .eq("capability", "grade");
      if (count.error) throw count.error;
      assert(count.count === 1, "discarded reservation was not durable");
      return "no result was persisted; the next distinct request was limited and ledger count remained 1";
    });

    await run(19, "ordinary clients cannot access reservation ledger", async () => {
      const selected = await userA.client.from("ai_usage_reservations").select("id");
      const inserted = await userA.client.from("ai_usage_reservations").insert({
        user_id: userA.id,
        capability: "scan",
        idempotency_key: randomUUID(),
        request_fingerprint: "b".repeat(64),
        status: "reserved",
      });
      const updated = await userA.client
        .from("ai_usage_reservations")
        .update({ status: "failed" })
        .eq("user_id", userA.id);
      const deleted = await userA.client
        .from("ai_usage_reservations")
        .delete()
        .eq("user_id", userA.id);
      const rpc = await userA.client.rpc("reserve_ai_usage", {
        p_user_id: userA.id,
        p_capability: "scan",
        p_idempotency_key: randomUUID(),
        p_request_fingerprint: "b".repeat(64),
        p_operation_group_key: null,
        p_daily_limit: 100,
      });
      for (const response of [selected, inserted, updated, deleted, rpc]) {
        assert(response.error, "ordinary client reached private reservation surface");
      }
      return "SELECT, INSERT, UPDATE, DELETE, and reservation RPC all returned permission errors";
    });
  }
} finally {
  await Promise.all(createdUsers.map((id) => admin.auth.admin.deleteUser(id)));
}

const failed = results.filter((result) => result.status === "FAIL");
console.log(`SUMMARY ${results.length - failed.length}/${results.length} mandatory checks passed`);
if (failed.length > 0) process.exitCode = 1;
