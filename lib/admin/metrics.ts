/** Deterministic analytics over minimized authoritative facts; no content or credentials. */
export type Dated = { id: string; user_id: string; created_at: string };
export type AttemptFact = Dated & {
  topic: string; syllabus_topic: string | null; assessment_format: string | null; paper: string | null;
  framework: string | null; marks_earned: number | null; marks_available: number | null; marks_assessable: number | null;
  legacy_score: number | null; legacy_max_score: number; scoring_state: string | null;
  parent_attempt_id: string | null; practice_question_id: string | null;
  grading_model_id: string | null; grading_contract_version: string | null; rubric_version: string | null; assessment_version: number | null;
  diagram_state: string | null; diagram_role: string | null; diagram_mode: string | null;
  diagram_present: boolean; diagram_assessed: boolean;
};
export type PracticeFact = Dated & { framework: string; mark_total: number; topic_code: string; topic_label: string;
  skill: string; question_origin: string | null; bank_question_id: string | null; from_current_focus: boolean;
  focus_source: string | null; model_id: string | null; grading_blueprint_version: string | null };
export type EventFact = Dated & { event_name: string; attempt_id: string | null; practice_question_id: string | null;
  properties: { source?: string; action?: string } };
export type RatingFact = Dated & { attempt_id: string; rating: number; updated_at: string };
export type ReportedMarkFact = Dated & { attempt_id: string; marks_earned: number; marks_available: number; updated_at: string; source: "student_reported" };
export type OperationFact = Dated & { capability: string; status: string; failure_category: string | null;
  processing_started_at: string | null; completed_at: string | null };
export type Facts = { users: { id: string; created_at: string }[]; attempts: AttemptFact[]; practice: PracticeFact[];
  events: EventFact[]; ratings: RatingFact[]; reportedMarks: ReportedMarkFact[]; operations: OperationFact[] };
export type Range = { start: string; end: string; label: string; preset: string };
export type Count = { label: string; value: number };
const DAY = 86_400_000;
export const dateOnly = (date: string | number) => new Date(date).toISOString().slice(0, 10);
const dayStart = (date: Date) => Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
export const average = (n: number[]) => n.length ? n.reduce((a,b)=>a+b,0)/n.length : null;
export const percent = (n: number,d: number) => d ? 100*n/d : null;
const median = (n: number[]) => { const s=[...n].sort((a,b)=>a-b); return s.length ? (s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2 : null; };
export function counts<T>(rows: T[], key: (row:T)=>string|null|undefined): Count[] {
  const map = new Map<string,number>();
  for (const row of rows) { const label=key(row)||"Unknown / legacy"; map.set(label,(map.get(label)??0)+1); }
  return [...map].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
}
export function parseRange(params: URLSearchParams, now = new Date()): Range {
  const preset = params.get("range") ?? "7d", end=now.toISOString(), today=dayStart(now);
  if (preset === "custom") {
    const start=params.get("from")??"", last=params.get("to")??"";
    const valid=(s:string)=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&dateOnly(s)===s;
    if (!valid(start)||!valid(last)||start>last||Date.parse(start)>now.getTime()) throw new Error("Choose valid UTC dates, with the start on or before the end.");
    return {start:new Date(start).toISOString(),end:new Date(Math.min(Date.parse(last)+DAY,now.getTime())).toISOString(),label:`${start} – ${last} (UTC)`,preset};
  }
  const days=preset==="today"?1:preset==="30d"?30:7;
  return preset==="all" ? {start:"1970-01-01T00:00:00.000Z",end,label:"All retained history",preset} :
    {start:new Date(today-(days-1)*DAY).toISOString(),end,label:days===1?"Today (UTC)":`Last ${days} calendar days (UTC)`,preset:["today","7d","30d"].includes(preset)?preset:"7d"};
}
export const inRange = (date:string, range:Range) => Date.parse(date)>=Date.parse(range.start)&&Date.parse(date)<Date.parse(range.end);
export const topicOf = (a:AttemptFact) => a.syllabus_topic && a.syllabus_topic!=="unknown" ? a.syllabus_topic : a.topic||"Unknown / legacy";
export const formatOf = (a:AttemptFact) => a.marks_available ? `${a.marks_available} marks` : "Unknown / legacy";
export const paperOf = (a:AttemptFact) => a.framework==="paper1a_10_mark"?"Paper 1(a)":a.framework==="paper1b_15_mark"?"Paper 1(b)":a.paper&&a.paper!=="unknown"?a.paper:"Generic / manual / legacy";
export function comparable(a:AttemptFact,b:AttemptFact) {
  return a.scoring_state==="marked"&&b.scoring_state==="marked"&&a.framework!==null&&a.framework===b.framework&&
    a.marks_earned!==null&&b.marks_earned!==null&&a.marks_available!==null&&a.marks_available===b.marks_available&&
    a.marks_assessable===a.marks_available&&b.marks_assessable===b.marks_available&&
    a.grading_contract_version===b.grading_contract_version;
}
const MEANINGFUL = new Set(["feedback_viewed","next_step_clicked","current_focus_viewed","targeted_practice_started","practice_started","revision_started"]);
export function activityOf(f:Facts) {
  return [...f.attempts,...f.practice,...f.events.filter(e=>MEANINGFUL.has(e.event_name))]
    .map(r=>({user_id:r.user_id,created_at:r.created_at})).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
}
export function calculateMetrics(f:Facts, range:Range, now=new Date()) {
  const through=(d:string)=>Date.parse(d)<Date.parse(range.end);
  const attempts=f.attempts.filter(a=>inRange(a.created_at,range)), practice=f.practice.filter(q=>inRange(q.created_at,range));
  const events=f.events.filter(e=>inRange(e.created_at,range)), ratings=f.ratings.filter(r=>inRange(r.updated_at,range));
  const operations=f.operations.filter(o=>inRange(o.created_at,range));
  const activity=activityOf(f).filter(a=>through(a.created_at));
  const selectedActivity=activity.filter(a=>inRange(a.created_at,range));
  const activeIds=new Set(selectedActivity.map(a=>a.user_id));
  const allByUser=new Map<string,typeof activity>();
  const byUser=new Map<string,typeof activity>();
  for (const a of activity) { const list=allByUser.get(a.user_id)??[];list.push(a);allByUser.set(a.user_id,list); }
  for (const a of selectedActivity) { const list=byUser.get(a.user_id)??[];list.push(a);byUser.set(a.user_id,list); }
  const dayCount=(rows:typeof activity)=>new Set(rows.map(a=>dateOnly(a.created_at))).size;
  const today=dayStart(now), windowRange=(days:number):Range=>({start:new Date(today-(days-1)*DAY).toISOString(),end:now.toISOString(),label:"",preset:""});
  const liveActivity=activityOf(f);
  const windows=[1,7,30].map(days=>({days,newUsers:f.users.filter(u=>inRange(u.created_at,windowRange(days))).length,
    activeUsers:new Set(liveActivity.filter(a=>inRange(a.created_at,windowRange(days))).map(a=>a.user_id)).size,
    attempts:f.attempts.filter(a=>inRange(a.created_at,windowRange(days))).length}));

  const allAttempts=f.attempts.filter(a=>through(a.created_at));
  const attemptMap=new Map(allAttempts.map(a=>[a.id,a]));
  const rootOf=(a:AttemptFact):AttemptFact|null=>{
    const seen=new Set<string>();let root=a;
    while(root.parent_attempt_id) {
      if (seen.has(root.id)) return null;seen.add(root.id);
      const parent=attemptMap.get(root.parent_attempt_id);
      if (!parent||parent.user_id!==a.user_id||Date.parse(parent.created_at)>Date.parse(root.created_at)) return null;
      root=parent;
    }
    return root;
  };
  const originals=attempts.filter(a=>!a.parent_attempt_id), revisions=attempts.filter(a=>a.parent_attempt_id);
  const chains=new Map<string,AttemptFact[]>();
  for(const a of allAttempts.filter(a=>a.parent_attempt_id)) { const root=rootOf(a);if(!root)continue;const chain=chains.get(root.id)??[];chain.push(a);chains.set(root.id,chain); }
  for(const chain of chains.values())chain.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
  const revisedOriginals=originals.filter(a=>chains.has(a.id));
  const changes=revisedOriginals.flatMap(root=>{const chain=chains.get(root.id)!,last=chain[chain.length-1];
    return comparable(root,last)?[{rootId:root.id,delta:last.marks_earned!-root.marks_earned!,revisions:chain.length}]:[];});
  const revision={originals:originals.length,revisions:revisions.length,rate:percent(revisedOriginals.length,originals.length),
    chains:revisedOriginals.length,users:new Set(revisions.map(a=>a.user_id)).size,
    perOriginal:originals.length?revisedOriginals.reduce((n,a)=>n+chains.get(a.id)!.length,0)/originals.length:null,
    repeatRevisions:revisedOriginals.reduce((n,a)=>n+Math.max(0,chains.get(a.id)!.length-1),0),
    medianHours:median(revisedOriginals.map(a=>(Date.parse(chains.get(a.id)![0].created_at)-Date.parse(a.created_at))/3600000)),
    compared:changes.length,averageDelta:average(changes.map(c=>c.delta)),
    improving:percent(changes.filter(c=>c.delta>0).length,changes.length),unchanged:percent(changes.filter(c=>c.delta===0).length,changes.length),falling:percent(changes.filter(c=>c.delta<0).length,changes.length)};
  const eventFunnel=(name:string)=>{
    const earliest=new Map<string,EventFact>();
    for(const e of events.filter(e=>e.event_name===name&&e.attempt_id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at))) if(!earliest.has(e.attempt_id!))earliest.set(e.attempt_id!,e);
    const converted=[...earliest.values()].filter(e=>allAttempts.some(a=>a.parent_attempt_id===e.attempt_id&&a.user_id===e.user_id&&Date.parse(a.created_at)>Date.parse(e.created_at)));
    return {label:name,started:earliest.size,converted:converted.length,rate:percent(converted.length,earliest.size)};
  };

  const users=f.users.filter(u=>through(u.created_at)).map(u=>{
    const history=allByUser.get(u.id)??[],selected=byUser.get(u.id)??[];
    const all=allAttempts.filter(a=>a.user_id===u.id).sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
    const period=attempts.filter(a=>a.user_id===u.id);
    const first=history[0]?.created_at??null;
    const returned=(days:number)=>first!==null&&history.some(a=>dateOnly(a.created_at)>dateOnly(first)&&Date.parse(a.created_at)<=Date.parse(first)+days*DAY);
    return {id:u.id,created_at:u.created_at,lastActivity:history.at(-1)?.created_at??null,attempts:period.length,
      revisions:period.filter(a=>a.parent_attempt_id).length,practice:practice.filter(q=>q.user_id===u.id).length,
      diagrams:period.filter(a=>a.diagram_present).length,ratings:ratings.filter(r=>r.user_id===u.id).length,activeDays:dayCount(selected),
      lifetimeActiveDays:dayCount(history),firstAttempt:all[0]?.created_at??null,lastAttempt:all.at(-1)?.created_at??null,
      firstAction:first,submitted:all.length,firstRevision:all.find(a=>a.parent_attempt_id)?.created_at??null,
      returned7:returned(7),returned30:returned(30),eligible7:first!==null&&Date.parse(first)+7*DAY<=Date.parse(range.end),
      eligible30:first!==null&&Date.parse(first)+30*DAY<=Date.parse(range.end)};
  });
  const cohort=users.filter(u=>inRange(u.created_at,range));
  const activated=cohort.filter(u=>u.firstAction),submitted=activated.filter(u=>u.submitted>0),second=submitted.filter(u=>u.submitted>1),revised=second.filter(u=>u.firstRevision);
  const laterThanRevision=(u:typeof users[number])=>(allByUser.get(u.id)??[]).some(a=>dateOnly(a.created_at)>dateOnly(u.firstRevision!));
  const retention={oneDay:users.filter(u=>u.activeDays===1).length,twoPlus:users.filter(u=>u.activeDays>=2).length,threePlus:users.filter(u=>u.activeDays>=3).length,
    returned7:users.filter(u=>u.eligible7&&u.returned7).length,eligible7:users.filter(u=>u.eligible7).length,
    returned30:users.filter(u=>u.eligible30&&u.returned30).length,eligible30:users.filter(u=>u.eligible30).length,
    funnel:[{label:"Registered",value:cohort.length},{label:"First meaningful action",value:activated.length},{label:"First submission",value:submitted.length},
      {label:"Second submission",value:second.length},{label:"First revision",value:revised.length},{label:"Active on a day after revision",value:revised.filter(laterThanRevision).length}]};
  const comparisons=f.reportedMarks.filter(m=>inRange(m.updated_at,range)).flatMap(m=>{
    const a=attemptMap.get(m.attempt_id);
    if(!a||a.scoring_state!=="marked"||a.marks_earned===null||a.marks_available!==m.marks_available||a.marks_assessable!==a.marks_available)return [];
    return [{attemptId:a.id,userId:a.user_id,format:formatOf(a),reported:Number(m.marks_earned),estimated:a.marks_earned,total:m.marks_available,
      difference:a.marks_earned-Number(m.marks_earned),absoluteDifference:Math.abs(a.marks_earned-Number(m.marks_earned))}];
  });
  const terminal=operations.filter(o=>["succeeded","failed"].includes(o.status)), failures=operations.filter(o=>o.status==="failed");
  const aiCapabilities=["grade","diagram","scan","practice"].map(capability=>{
    const rows=operations.filter(o=>o.capability===capability),finished=rows.filter(o=>["succeeded","failed"].includes(o.status));
    const durations=rows.filter(o=>o.processing_started_at&&o.completed_at&&Date.parse(o.completed_at)>=Date.parse(o.processing_started_at))
      .map(o=>(Date.parse(o.completed_at!)-Date.parse(o.processing_started_at!))/1000);
    return {capability,total:rows.length,succeeded:rows.filter(o=>o.status==="succeeded").length,failed:rows.filter(o=>o.status==="failed").length,
      reserved:rows.filter(o=>o.status==="reserved").length,processing:rows.filter(o=>o.status==="processing").length,
      failureRate:percent(rows.filter(o=>o.status==="failed").length,finished.length),averageDuration:average(durations),timedOperations:durations.length};
  });
  const startCounts=counts(events.filter(e=>["practice_started","targeted_practice_started"].includes(e.event_name)),e=>e.event_name==="practice_started"?"Ordinary Practice":e.properties.source==="current_focus"?"Current Focus":"Answer feedback focus");
  const servedBanks=new Set(f.practice.filter(q=>through(q.created_at)&&q.bank_question_id).map(q=>q.bank_question_id!));
  const repeated=counts(practice.filter(q=>q.bank_question_id),q=>`${q.user_id}:${q.bank_question_id}`).reduce((n,c)=>n+Math.max(0,c.value-1),0);
  const buckets=new Map<string,{label:string;attempts:number;active:Set<string>;originals:number;revised:number;bank:number;generated:number;ratings:number[];operations:number;failures:number}>();
  const earliest=[...attempts,...practice,...events,...operations,...ratings].map(a=>Date.parse(a.created_at));
  const first=range.preset==="all"?earliest.reduce((min,date)=>Math.min(min,date),Date.parse(range.end)):Date.parse(range.start);
  const span=(Date.parse(range.end)-first)/DAY,grain=span>180?"month":span>60?"week":"day";
  const key=(d:string|number)=>{const t=new Date(d);if(grain==="month")return `${t.toISOString().slice(0,7)}-01`;
    if(grain==="week")t.setUTCDate(t.getUTCDate()-((t.getUTCDay()+6)%7));return dateOnly(t.getTime());};
  const bucket=(d:string|number)=>{const k=key(d);if(!buckets.has(k))buckets.set(k,{label:k,attempts:0,active:new Set(),originals:0,revised:0,bank:0,generated:0,ratings:[],operations:0,failures:0});return buckets.get(k)!;};
  // Fill empty intervals too; a missing day must remain a visible zero.
  for(let d=Date.parse(key(first));d<Date.parse(range.end);){bucket(d);const t=new Date(d);if(grain==="month")t.setUTCMonth(t.getUTCMonth()+1);else t.setUTCDate(t.getUTCDate()+(grain==="week"?7:1));d=t.getTime();}
  for(const a of attempts){const b=bucket(a.created_at);b.attempts++;if(!a.parent_attempt_id){b.originals++;if(chains.has(a.id))b.revised++;}}
  for(const a of selectedActivity)bucket(a.created_at).active.add(a.user_id);
  for(const q of practice){if(q.question_origin==="curated_bank")bucket(q.created_at).bank++;if(q.question_origin==="adaptive_generated")bucket(q.created_at).generated++;}
  for(const r of ratings)bucket(r.updated_at).ratings.push(r.rating);
  for(const o of operations){const b=bucket(o.created_at);b.operations++;if(o.status==="failed")b.failures++;}
  const trend=[...buckets.values()].sort((a,b)=>a.label.localeCompare(b.label)).map(b=>({...b,active:b.active.size,rating:average(b.ratings),ratings:b.ratings.length,revisionRate:percent(b.revised,b.originals)}));
  const ratingGroup=(key:(a:AttemptFact)=>string)=>counts(ratings,r=>{const a=attemptMap.get(r.attempt_id);return a?key(a):"Deleted / unavailable";}).map(c=>{
    const rows=ratings.filter(r=>{const a=attemptMap.get(r.attempt_id);return (a?key(a):"Deleted / unavailable")===c.label;});return {...c,average:average(rows.map(r=>r.rating))};});
  const feed=[...f.users.filter(u=>inRange(u.created_at,range)).map(u=>({at:u.created_at,userId:u.id,label:"Account created",attemptId:null as string|null})),
    ...attempts.map(a=>({at:a.created_at,userId:a.user_id,label:`${a.parent_attempt_id?"Revision":"Submission"} · ${formatOf(a)}${a.diagram_present?" · diagram":""}`,attemptId:a.id})),
    ...practice.map(q=>({at:q.created_at,userId:q.user_id,label:q.question_origin==="curated_bank"?"Bank question served":q.question_origin==="adaptive_generated"?"Practice question generated":"Practice question saved (legacy)",attemptId:null})),
    ...ratings.map(r=>({at:r.updated_at,userId:r.user_id,label:`Feedback rated ${r.rating}/5`,attemptId:r.attempt_id})),
    ...failures.map(o=>({at:o.created_at,userId:o.user_id,label:`${o.capability} failed · ${o.failure_category??"unknown"}`,attemptId:null}))]
    .sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,20);
  return {range,windows,registered:f.users.length,newUsers:f.users.filter(u=>inRange(u.created_at,range)).length,
    active:activeIds.size,returning:[...activeIds].filter(id=>dayCount(allByUser.get(id)??[])>1).length,
    attempts:attempts.length,allTimeAttempts:f.attempts.length,submitters:new Set(attempts.map(a=>a.user_id)).size,
    attemptsPerActive:activeIds.size?attempts.length/activeIds.size:null,revision,
    diagrams:{with:attempts.filter(a=>a.diagram_present).length,without:attempts.filter(a=>!a.diagram_present).length,
      assessed:attempts.filter(a=>a.diagram_assessed&&a.diagram_present&&a.diagram_mode!=="not_assessed").length,
      missingRequired:attempts.filter(a=>["required_explicitly","necessary_for_task"].includes(a.diagram_role??"")&&["not_provided","no_relevant_diagram"].includes(a.diagram_state??"")).length,
      unreadable:attempts.filter(a=>["unreadable","unreadable_ambiguous","not_readable"].includes(a.diagram_state??"")).length},
    formats:counts(attempts,formatOf),papers:counts(attempts,paperOf),topics:counts(attempts,topicOf),
    scores:counts(originals.filter(a=>a.scoring_state==="marked"&&a.marks_earned!==null&&a.marks_available&&a.marks_assessable===a.marks_available),a=>{
      const p=100*a.marks_earned!/a.marks_available!;return p<25?"0–24%":p<50?"25–49%":p<75?"50–74%":"75–100%";}),
    models:counts(attempts,a=>a.grading_model_id),contracts:counts(attempts,a=>a.grading_contract_version),
    practice:{total:practice.length,origins:counts(practice,q=>q.question_origin),bank:practice.filter(q=>q.question_origin==="curated_bank").length,
      generated:practice.filter(q=>q.question_origin==="adaptive_generated").length,
      fallbackRate:percent(practice.filter(q=>q.question_origin==="adaptive_generated").length,practice.filter(q=>q.question_origin!==null).length),
      focused:practice.filter(q=>q.from_current_focus).length,topics:counts(practice,q=>`${q.topic_code} · ${q.topic_label}`),
      formats:counts(practice,q=>`${q.mark_total} marks`),bankQuestions:counts(practice.filter(q=>q.bank_question_id),q=>q.bank_question_id),
      starts:startCounts,repeated,servedBanks:[...servedBanks],
      unsubmitted:practice.filter(q=>!allAttempts.some(a=>a.practice_question_id===q.id)).length,
      models:counts(practice,q=>q.model_id),versions:counts(practice,q=>q.grading_blueprint_version)},
    feedback:{count:ratings.length,average:average(ratings.map(r=>r.rating)),positive:percent(ratings.filter(r=>r.rating>=4).length,ratings.length),
      distribution:[1,2,3,4,5].map(n=>({label:`${n} / 5`,value:ratings.filter(r=>r.rating===n).length})),
      byFormat:ratingGroup(formatOf),byTopic:ratingGroup(topicOf),lowest:[...ratings].sort((a,b)=>a.rating-b.rating||Date.parse(b.updated_at)-Date.parse(a.updated_at)).slice(0,20)},
    comparisons,retention,users,trend,grain,feed,funnels:[eventFunnel("feedback_viewed"),eventFunnel("next_step_clicked")],
    ai:{total:operations.length,failures:failures.length,failureRate:percent(failures.length,terminal.length),capabilities:aiCapabilities,
      categories:counts(failures,o=>o.failure_category),statuses:counts(operations,o=>o.status),
      quotas:counts(f.operations.filter(o=>inRange(o.created_at,windowRange(1))),o=>`${o.user_id}:${o.capability}`)}};
}
export type Metrics = ReturnType<typeof calculateMetrics>;

export function filterAttempts(f:Facts,range:Range,params:URLSearchParams) {
  const practice=new Map(f.practice.map(q=>[q.id,q]));
  return f.attempts.filter(a=>{
    if(!inRange(a.created_at,range))return false;
    const checks:Record<string,string>={user:a.user_id,topic:topicOf(a),marks:String(a.marks_available??"unknown"),
      framework:a.framework??"unknown",paper:paperOf(a),diagram:a.diagram_present?"yes":"no",kind:a.parent_attempt_id?"revision":"original",
      origin:a.practice_question_id?(practice.get(a.practice_question_id)?.question_origin??"unknown"):"manual",
      model:a.grading_model_id??"unknown",contract:a.grading_contract_version??"unknown",state:a.scoring_state??"legacy"};
    return Object.entries(checks).every(([k,v])=>!params.get(k)||params.get(k)===v);
  }).sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at)||a.id.localeCompare(b.id));
}
