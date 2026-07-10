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
if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
  throw new Error("Refusing to run: this verifier is restricted to local Supabase URLs.");
}

const admin = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const createdUsers = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createSignedInUser(label) {
  const id = randomUUID();
  const email = `aptly-security-${label}-${id}@example.test`;
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

try {
  const userA = await createSignedInUser("a");
  const userB = await createSignedInUser("b");

  const directAttempt = await userA.client.from("attempts").insert(minimalAttempt);
  assert(directAttempt.error, "authenticated browser insert into attempts unexpectedly succeeded");
  const directPractice = await userA.client.from("practice_questions").insert({
    question: "Forged practice [10 marks]",
    source_material: null,
    framework: "generic_practice",
    mark_total: 10,
    topic_code: "1.1",
    topic_label: "Forged",
    skill: "knowledge_understanding",
    why: "Forged",
    authority_version: 1,
  });
  assert(directPractice.error, "authenticated browser insert into practice unexpectedly succeeded");

  const validEvidence = {
    version: 1,
    status: "reviewed_clearly",
    graphTypeObserved: "demand and supply",
    relevanceToQuestion: "appears_relevant",
    elements: [{ element: "axes_labels", observed: "visible" }],
    consistencyWithAnswer: "supports",
    improvements: ["Label the new equilibrium."],
  };
  const inserted = await admin
    .from("attempts")
    .insert({
      ...minimalAttempt,
      user_id: userA.id,
      idempotency_key: randomUUID(),
      diagram_evidence: validEvidence,
    })
    .select("id")
    .single();
  if (inserted.error) throw inserted.error;
  const attemptId = inserted.data.id;
  const directAttemptUpdate = await userA.client
    .from("attempts")
    .update({ score: 7 })
    .eq("id", attemptId);
  assert(directAttemptUpdate.error, "authenticated browser update of attempts unexpectedly succeeded");

  const trustedPractice = await admin
    .from("practice_questions")
    .insert({
      user_id: userA.id,
      idempotency_key: randomUUID(),
      authority_version: 1,
      question: "Explain a price ceiling. [4 marks]",
      source_material: null,
      framework: "generic_practice",
      mark_total: 4,
      topic_code: "2.1",
      topic_label: "Demand and supply",
      skill: "economic_analysis",
      why: "Local verification",
    })
    .select("id")
    .single();
  if (trustedPractice.error) throw trustedPractice.error;
  const directPracticeUpdate = await userA.client
    .from("practice_questions")
    .update({ question: "Forged replacement [45 marks]" })
    .eq("id", trustedPractice.data.id);
  assert(
    directPracticeUpdate.error,
    "authenticated browser update of practice unexpectedly succeeded"
  );

  const invalidEvidence = await admin.from("attempts").insert({
    ...minimalAttempt,
    user_id: userA.id,
    idempotency_key: randomUUID(),
    diagram_evidence: { ...validEvidence, rawImage: "data:image/jpeg;base64,AAAA" },
  });
  assert(invalidEvidence.error, "raw image payload bypassed the diagram evidence constraint");

  const crossRead = await userB.client.from("attempts").select("id").eq("id", attemptId);
  if (crossRead.error) throw crossRead.error;
  assert(crossRead.data.length === 0, "user B could read user A's attempt");
  const crossDelete = await userB.client.from("attempts").delete().eq("id", attemptId);
  if (crossDelete.error) throw crossDelete.error;
  const stillThere = await admin.from("attempts").select("id").eq("id", attemptId).maybeSingle();
  if (stillThere.error) throw stillThere.error;
  assert(stillThere.data?.id === attemptId, "user B deleted user A's attempt");
  const ownDelete = await userA.client.from("attempts").delete().eq("id", attemptId);
  if (ownDelete.error) throw ownDelete.error;

  const fingerprint = "a".repeat(64);
  const distinctReservations = await Promise.all(
    Array.from({ length: 5 }, () =>
      admin.rpc("reserve_ai_usage", {
        p_user_id: userA.id,
        p_capability: "scan",
        p_idempotency_key: randomUUID(),
        p_request_fingerprint: fingerprint,
        p_operation_group_key: null,
        p_daily_limit: 3,
      })
    )
  );
  distinctReservations.forEach(({ error }) => {
    if (error) throw error;
  });
  const outcomes = distinctReservations.map(({ data }) => data[0].outcome).sort();
  assert(
    outcomes.filter((outcome) => outcome === "reserved").length === 3 &&
      outcomes.filter((outcome) => outcome === "limited").length === 2,
    `atomic daily cap failed: ${outcomes.join(",")}`
  );

  const duplicateKey = randomUUID();
  const duplicateGroupKey = randomUUID();
  const duplicates = await Promise.all(
    Array.from({ length: 2 }, () =>
      admin.rpc("reserve_ai_usage", {
        p_user_id: userA.id,
        p_capability: "diagram",
        p_idempotency_key: duplicateKey,
        p_request_fingerprint: fingerprint,
        p_operation_group_key: duplicateGroupKey,
        p_daily_limit: 10,
      })
    )
  );
  // Exactly one same-payload reservation is created; the concurrent duplicate
  // observes it in progress and never receives provider-dispatch authority.
  duplicates.forEach(({ error }) => {
    if (error) throw error;
  });
  const duplicateOutcomes = duplicates.map(({ data }) => data[0].outcome).sort();
  assert(
    duplicateOutcomes.join(",") === "in_progress,reserved",
    `same-key idempotency failed: ${duplicateOutcomes.join(",")}`
  );

  console.log("PASS local RLS, direct-write denial, diagram constraint, quota race, idempotency");
} finally {
  await Promise.all(createdUsers.map((id) => admin.auth.admin.deleteUser(id)));
}
