import { describe,it,expect } from "vitest";
import { calculateMetrics,parseRange,filterAttempts,type Facts,type AttemptFact,type EventFact } from "./metrics";
const now=new Date("2026-09-16T12:00:00Z");
export function emptyFacts():Facts {return {users:[],attempts:[],practice:[],events:[],ratings:[],reportedMarks:[],operations:[]};}
function attempt(id:string,created_at:string,extra:Partial<AttemptFact>={}):AttemptFact {
  return {id,user_id:"u1",created_at,topic:"Supply",syllabus_topic:"2.3",assessment_format:"extended_response",paper:"paper_1",framework:"paper1a_10_mark",
    marks_earned:5,marks_available:10,marks_assessable:10,legacy_score:4,legacy_max_score:7,scoring_state:"marked",parent_attempt_id:null,practice_question_id:null,
    grading_model_id:"model",grading_contract_version:"v1",rubric_version:"econ-v4",assessment_version:4,diagram_state:null,diagram_role:null,diagram_mode:null,diagram_present:false,diagram_assessed:false,...extra};
}
function event(name:string,date:string,attemptId:string|null=null):EventFact {return {id:name,user_id:"u1",created_at:date,event_name:name,attempt_id:attemptId,practice_question_id:null,properties:{}};}
describe("UTC analytics ranges",()=>{
  it("uses exclusive boundaries and seven calendar days including today",()=>{
    expect(parseRange(new URLSearchParams(),now).start).toBe("2026-09-10T00:00:00.000Z");
    const r=parseRange(new URLSearchParams("range=custom&from=2026-03-28&to=2026-03-29"),now);
    expect(r.start).toBe("2026-03-28T00:00:00.000Z");expect(r.end).toBe("2026-03-30T00:00:00.000Z");
    const f=emptyFacts();f.attempts=[attempt("before","2026-03-27T23:59:59Z"),attempt("start",r.start),attempt("end",r.end)];
    expect(calculateMetrics(f,r,now).attempts).toBe(1);
  });
  it("rejects impossible, reversed and future ranges",()=>{
    for(const q of ["from=2026-02-30&to=2026-03-01","from=2026-09-15&to=2026-09-01","from=2027-01-01&to=2027-02-01"])expect(()=>parseRange(new URLSearchParams(`range=custom&${q}`),now)).toThrow();
  });
});
describe("product aggregates",()=>{
  it("handles empty data without fabricated percentages",()=>{
    const m=calculateMetrics(emptyFacts(),parseRange(new URLSearchParams(),now),now);
    expect(m.active).toBe(0);expect(m.feedback.average).toBeNull();expect(m.revision.rate).toBeNull();expect(m.ai.failureRate).toBeNull();expect(m.trend).toHaveLength(7);
  });
  it("counts meaningfully active users once, excluding History and authentication",()=>{
    const f=emptyFacts();f.users=[{id:"u1",created_at:"2026-08-01Z"},{id:"u2",created_at:"2026-09-16Z"}];
    f.attempts=[attempt("a","2026-09-15T12:00:00Z"),attempt("b","2026-09-15T13:00:00Z")];
    f.events=[event("feedback_viewed","2026-09-16T10:00:00Z","a"),{...event("history_viewed","2026-09-16T10:00:00Z"),user_id:"u2"}];
    const m=calculateMetrics(f,parseRange(new URLSearchParams(),now),now);
    expect(m.active).toBe(1);expect(m.returning).toBe(1);expect(m.windows[0].activeUsers).toBe(1);expect(m.attemptsPerActive).toBe(2);
    expect(m.retention.twoPlus).toBe(1);
  });
  it("counts a multi-generation chain once and checks chronology in funnels",()=>{
    const f=emptyFacts();f.attempts=[attempt("a","2026-09-10T12:00:00Z"),attempt("b","2026-09-11T12:00:00Z",{parent_attempt_id:"a",marks_earned:6}),
      attempt("c","2026-09-12T12:00:00Z",{parent_attempt_id:"b",marks_earned:8}),attempt("d","2026-09-13T12:00:00Z")];
    f.events=[event("feedback_viewed","2026-09-10T13:00:00Z","a"),event("next_step_clicked","2026-09-12T13:00:00Z","a")];
    const m=calculateMetrics(f,parseRange(new URLSearchParams(),now),now);
    expect(m.revision).toMatchObject({originals:2,revisions:2,rate:50,chains:1,repeatRevisions:1,medianHours:24,averageDelta:3,compared:1,improving:100});
    expect(m.funnels[0].converted).toBe(1);expect(m.funnels[1].converted).toBe(0);
  });
  it("does not compare different marking contracts, partial marks, missing roots or cycles",()=>{
    const f=emptyFacts();f.attempts=[attempt("a","2026-09-10Z"),attempt("b","2026-09-11Z",{parent_attempt_id:"a",grading_contract_version:"v2"}),
      attempt("orphan","2026-09-12Z",{parent_attempt_id:"missing"}),attempt("cycle","2026-09-12Z",{parent_attempt_id:"cycle"})];
    const m=calculateMetrics(f,parseRange(new URLSearchParams(),now),now);expect(m.revision.compared).toBe(0);expect(m.revision.chains).toBe(1);
  });
  it("uses a matured observation window for retention",()=>{
    const f=emptyFacts();f.users=[{id:"u1",created_at:"2026-08-01Z"},{id:"u2",created_at:"2026-09-14Z"}];
    f.attempts=[attempt("a","2026-08-02Z"),attempt("b","2026-08-04Z"),attempt("c","2026-09-15Z",{user_id:"u2"})];
    const m=calculateMetrics(f,parseRange(new URLSearchParams("range=all"),now),now);
    expect(m.retention).toMatchObject({eligible7:1,returned7:1,eligible30:1,returned30:1});
  });
  it("compares only matching reported totals and filters on rating update time",()=>{
    const f=emptyFacts();f.attempts=[attempt("a","2026-08-01Z"),attempt("b","2026-08-02Z")];
    f.ratings=[{id:"r",user_id:"u1",attempt_id:"a",rating:5,created_at:"2026-08-01Z",updated_at:"2026-09-16T10:00:00Z"}];
    f.reportedMarks=[{id:"m",user_id:"u1",attempt_id:"a",marks_earned:6,marks_available:10,created_at:"2026-08-01Z",updated_at:"2026-09-16T10:00:00Z",source:"student_reported"},
      {id:"n",user_id:"u1",attempt_id:"b",marks_earned:6,marks_available:15,created_at:"2026-08-01Z",updated_at:"2026-09-16T10:00:00Z",source:"student_reported"}];
    const m=calculateMetrics(f,parseRange(new URLSearchParams(),now),now);
    expect(m.feedback.count).toBe(1);expect(m.feedback.positive).toBe(100);expect(m.comparisons).toHaveLength(1);expect(m.comparisons[0].difference).toBe(-1);
  });
  it("uses completed operations as failure denominator and only stored times",()=>{
    const f=emptyFacts();f.operations=["reserved","processing","succeeded","failed"].map((status,i)=>({id:String(i),user_id:"u1",created_at:"2026-09-15Z",capability:"grade",status,failure_category:status==="failed"?"provider":null,processing_started_at:null,completed_at:null}));
    const m=calculateMetrics(f,parseRange(new URLSearchParams(),now),now);
    expect(m.ai.failureRate).toBe(50);expect(m.ai.capabilities[0].averageDuration).toBeNull();
  });
  it("preserves unknown historical formats and implements compound attempt filters",()=>{
    const f=emptyFacts();f.attempts=[attempt("a","2026-09-15Z"),attempt("b","2026-09-15Z",{marks_available:null,marks_earned:null,framework:null,scoring_state:null})];
    const range=parseRange(new URLSearchParams(),now),m=calculateMetrics(f,range,now);
    expect(m.formats.find(x=>x.label==="Unknown / legacy")?.value).toBe(1);
    expect(filterAttempts(f,range,new URLSearchParams("origin=manual&marks=10&framework=paper1a_10_mark&diagram=no&kind=original&state=marked"))).toHaveLength(1);
  });
});
