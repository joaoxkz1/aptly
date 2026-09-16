import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestFingerprint } from "@/lib/ai/request-integrity";
import { completedEssayReplay } from "./completed-essay-replay";

const mock = vi.hoisted(() => ({ rows: [] as unknown[], eq: vi.fn(), find: vi.fn() }));
vi.mock("./admin", () => ({ getAdminClient: () => ({ from: () => {
  const query = { select: () => query, eq: (...args: unknown[]) => { mock.eq(...args); return query; },
    maybeSingle: async () => ({ data: mock.rows.shift(), error: null }) };
  return query;
} }) }));
vi.mock("./server-authority", () => ({ findAttemptById: mock.find }));
const request = { question: "Explain production pollution and market failure. [10]", answer: "Unchanged prose", diagramOmitted: false };
const historical = { id: "saved", assessment: { marksEarned: 10, gradingProvenance: { gradingContractVersion: "ib-econ-2026-v3" } } };
function setup(image = false) {
  const snapshot = { userId: "owner", operationIdentity: "key", contract: { mode: "holistic_diagram", diagramRole: "optional_appropriate" },
    attachments: image ? [{ contentHash: "image-original" }] : [], observations: image ? { state: "usable", summary: "Frozen actual observations" } : null };
  mock.rows.push({ snapshot, attempt_id: "saved" },
    { request_fingerprint: requestFingerprint({ request, snapshot: { ...snapshot, observations: null } }) });
  return snapshot;
}
beforeEach(() => { mock.rows = []; vi.clearAllMocks(); mock.find.mockResolvedValue(historical); });

describe("completed manual essay replay across contract versions", () => {
  it("returns the untouched historical mark with owner-scoped reads", async () => {
    const snapshot = setup(); const before = structuredClone(snapshot);
    expect(await completedEssayReplay("owner", "key", request, null)).toEqual({ kind: "replay", attempt: historical });
    expect(snapshot).toEqual(before);
    expect(mock.eq.mock.calls.filter(([field]) => field === "user_id")).toEqual([["user_id", "owner"], ["user_id", "owner"]]);
    expect(mock.find).toHaveBeenCalledWith("owner", "saved");
  });
  it("reconstructs the original pre-observer fingerprint without discarding saved evidence", async () => {
    const snapshot = setup(true);
    expect((await completedEssayReplay("owner", "key", request, "image-original")).kind).toBe("replay");
    expect(snapshot.observations?.summary).toBe("Frozen actual observations");
  });
  it("preserves pre-workflow four-mark replay as well as essays", async () => {
    const snapshot = setup(); snapshot.contract.mode = "four_mark_diagram";
    mock.rows[1] = { request_fingerprint: requestFingerprint({ request, snapshot }) };
    expect((await completedEssayReplay("owner", "key", request, null)).kind).toBe("replay");
  });
  it.each([null, "different-image"])("rejects changed image bytes/presence %s", async image => {
    setup(true);
    expect(await completedEssayReplay("owner", "key", request, image)).toEqual({ kind: "conflict" });
    expect(mock.find).not.toHaveBeenCalled();
  });
  it.each([{ answer: "changed" }, { diagramOmitted: true }, { requestedFramework: "generic_practice" }, { sourceMaterial: "changed" }, { parentAttemptId: "other" }])("rejects changed request data %j", async change => {
    setup();
    expect(await completedEssayReplay("owner", "key", { ...request, ...change }, null)).toEqual({ kind: "conflict" });
    expect(mock.find).not.toHaveBeenCalled();
  });
  it("leaves new submissions to the normal resolver", async () => {
    mock.rows.push(null);
    expect(await completedEssayReplay("owner", "key", request, null)).toEqual({ kind: "none" });
    expect(mock.find).not.toHaveBeenCalled();
  });
  it("replays a semantic v5 contract using the original reservation binding without rerunning interpretation", async () => {
    const initialContract = { mode: "holistic_diagram", diagramRole: "unresolved" };
    const initial = { userId: "owner", operationIdentity: "key", contract: initialContract, contractHash: requestFingerprint(initialContract), attachments: [], observations: null, examinerWorkflowVersion: "examiner-workflow-2026-v1" };
    const resolvedContract = { ...initialContract, diagramRole: "appropriate_support" };
    const snapshot = { ...initial, contract: resolvedContract, contractHash: requestFingerprint(resolvedContract), resolutionInputContract: initialContract, examinerJudgment: { summary: "Frozen judgment" } };
    const before = structuredClone(snapshot);
    mock.rows.push({ snapshot, attempt_id: "saved" }, { request_fingerprint: requestFingerprint({ request, snapshot: initial }) });
    expect((await completedEssayReplay("owner", "key", request, null)).kind).toBe("replay");
    expect(snapshot).toEqual(before);
  });
});
