import "server-only";
import { ECONOMICS_QUESTION_BANK } from "@/lib/assessment/question-bank/economics-v1";
import { DAILY_GRADE_LIMIT, DAILY_DIAGRAM_REVIEW_LIMIT, DAILY_EXTRACTION_LIMIT, DAILY_PRACTICE_GENERATION_LIMIT } from "@/lib/ai/config";
import { counts, filterAttempts, formatOf, paperOf, topicOf, type Count, type Facts, type Metrics } from "./metrics";

// Route handlers deliberately emit plain HTML: Next's RSC router state serializes
// dynamic URL segments. No route code, React payload, script or secret is emitted here.
export const escapeHtml = (v:unknown) => String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
const h=escapeHtml;
const num=(v:number|null|undefined,places=0)=>v==null?"—":v.toLocaleString("en-GB",{maximumFractionDigits:places});
const pct=(v:number|null)=>v===null?"—":`${num(v,1)}%`;
const stamp=(v:string|null)=>v?`${new Date(v).toISOString().slice(0,16).replace("T"," ")} UTC`:"—";
const short=(id:string)=>id.slice(0,8);
const empty='<p class="empty">No data in this period.</p>';
const section=(title:string,body:string,note="")=>`<section class="panel"><div class="panel-heading"><h2>${h(title)}</h2>${note?`<p>${h(note)}</p>`:""}</div>${body}</section>`;
const cards=(items:[string,string|number,string?][])=>`<div class="metrics">${items.map(([label,value,note])=>`<article class="metric"><h2>${h(label)}</h2><strong>${h(value)}</strong>${note?`<p>${h(note)}</p>`:""}</article>`).join("")}</div>`;
const table=(heads:string[],rows:string[][],caption?:string)=>rows.length?`<div class="table-wrap"><table>${caption?`<caption>${h(caption)}</caption>`:""}<thead><tr>${heads.map(x=>`<th scope="col">${h(x)}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`:empty;
const bars=(rows:Count[],limit=12)=>{
  const max=Math.max(1,...rows.map(r=>r.value));
  return rows.length?`<ul class="bars">${rows.slice(0,limit).map(r=>`<li><div><span>${h(r.label)}</span><b>${num(r.value,1)}</b></div><progress max="${max}" value="${r.value}" aria-label="${h(r.label)}: ${r.value}"></progress></li>`).join("")}</ul>${rows.length>limit?`<details><summary>All ${rows.length} categories</summary>${table(["Category","Count"],rows.map(r=>[h(r.label),num(r.value)]))}</details>`:""}`:empty;
};
const grid=(...content:string[])=>`<div class="panel-grid">${content.join("")}</div>`;
const notice=(text:string)=>`<p class="notice">${h(text)}</p>`;
const link=(params:URLSearchParams,updates:Record<string,string|null>,text:string)=>{
  const query=new URLSearchParams(params);for(const [key,value] of Object.entries(updates)){if(value===null)query.delete(key);else query.set(key,value);}
  return `<a href="?${h(query.toString())}">${h(text)}</a>`;
};
const attemptLink=(params:URLSearchParams,id:string,text=short(id))=>link(params,{section:"attempts",attempt:id,page:null},text);
const userLink=(params:URLSearchParams,id:string)=>link(params,{section:"attempts",user:id,attempt:null,page:null},short(id));
const SECTIONS={overview:"Overview",users:"Users & retention",attempts:"Attempts",revisions:"Revision behaviour",practice:"Practice",feedback:"Feedback",ai:"AI operations"};
type Comment={attempt_id:string;user_id:string;rating:number;comment:string;updated_at:string};
export type RenderInput={facts:Facts;metrics:Metrics;params:URLSearchParams;now:Date;comments:Comment[];searchUsers:{id:string;email:string}[]};

function trends(m:Metrics,kind:"activity"|"practice"|"feedback"|"ai"|"revision") {
  const rows=m.trend;
  if(kind==="activity")return table([`Period (${m.grain}, UTC)`,"Submissions","Active users"],rows.map(r=>[h(r.label),`<span class="mini"><progress max="${Math.max(1,...rows.map(x=>x.attempts))}" value="${r.attempts}" aria-label="${r.attempts} submissions"></progress>${r.attempts}</span>`,String(r.active)]));
  if(kind==="practice")return table([`Period (${m.grain})`,"Bank","Generated"],rows.map(r=>[r.label,String(r.bank),String(r.generated)]));
  if(kind==="feedback")return table([`Period (${m.grain})`,"Current ratings updated","Mean / 5"],rows.map(r=>[r.label,String(r.ratings),num(r.rating,2)]));
  if(kind==="revision")return table([`Original created (${m.grain})`,"Originals","Revised by range end","Rate"],rows.map(r=>[r.label,String(r.originals),String(r.revised),pct(r.revisionRate)]));
  return table([`Operation created (${m.grain})`,"Operations","Failures"],rows.map(r=>[r.label,String(r.operations),String(r.failures)]));
}
function overview({metrics:m,params:p}:RenderInput) {
  return cards([["Registered users",m.registered,"All current accounts"],["Meaningfully active",m.active,m.range.label],["Submissions",m.attempts,`${m.submitters} unique submitters`],
    ["Returning active users",m.returning,"Selected activity + another observed UTC day"],["Originals revised",pct(m.revision.rate),`${m.revision.chains} of ${m.revision.originals} originals`],
    ["Feedback rating",`${num(m.feedback.average,2)} / 5`,`${m.feedback.count} ratings · ${pct(m.feedback.positive)} positive`],
    ["Bank share",pct(m.practice.bank+m.practice.generated?100*m.practice.bank/(m.practice.bank+m.practice.generated):null),`${m.practice.total} saved Practice questions`],
    ["AI failure rate",pct(m.ai.failureRate),`${m.ai.failures} failed of ${m.ai.total} retained operations`]])+
    section("Current activity windows",table(["Window (UTC)","New users","Active users","Submissions"],m.windows.map(w=>[w.days===1?"Today / DAU":`${w.days} days / ${w.days===7?"WAU":"MAU"}`,String(w.newUsers),String(w.activeUsers),String(w.attempts)])),"Calendar windows ending at refresh time; independent of the date filter.")+
    grid(section("Submission & activity trend",trends(m,"activity")),section("Question formats",bars(m.formats)))+
    grid(section("Diagrams",bars([{label:"Submitted evidence",value:m.diagrams.with},{label:"No submitted evidence",value:m.diagrams.without},{label:"Assessed with submitted evidence",value:m.diagrams.assessed},{label:"Known required diagram missing / irrelevant",value:m.diagrams.missingRequired},{label:"Saved unreadable evidence",value:m.diagrams.unreadable}]),"Diagram requirements are counted only where the saved contract establishes them."),
      section("Practice & focus",bars([...m.practice.starts,{label:"Current Focus-linked questions",value:m.practice.focused},{label:"Bank questions served",value:m.practice.bank},{label:"AI fallback questions",value:m.practice.generated}]),"Starts are interaction signals from this release. Saved questions are authoritative."))+
    grid(section("Topics submitted",bars(m.topics)),section("What is failing?",bars(m.ai.categories),"Retained AI ledger; failures / completed operations. Pending work is excluded from the rate."))+
    section("Recent product activity",table(["Time","User","Activity"],m.feed.map(x=>[h(stamp(x.at)),userLink(p,x.userId),x.attemptId?attemptLink(p,x.attemptId,x.label):h(x.label)])))+
    notice(`${m.allTimeAttempts} retained submissions all time. ${num(m.attemptsPerActive,2)} submissions per active user in the selected period. ${m.revision.revisions} revisions, ${m.revision.originals} originals. AI history is subject to the existing 30-day opportunistic retention policy.`);
}
function pagination(p:URLSearchParams,total:number) {
  const page=Math.max(1,Math.min(Math.ceil(total/25)||1,Math.floor(Number(p.get("page")))||1));
  return {page,start:(page-1)*25,html:`<div class="pagination"><span>${num(total)} results · Page ${page} / ${Math.ceil(total/25)||1}</span><div>${page>1?link(p,{page:String(page-1)},"← Previous"):""} ${page*25<total?link(p,{page:String(page+1)},"Next →"):""}</div></div>`};
}
function users({metrics:m,params:p,searchUsers}:RenderInput) {
  const search=p.get("search")??"";
  const rows=m.users.filter(u=>!search||searchUsers.some(s=>s.id===u.id)||u.id===search).sort((a,b)=>(b.lastActivity??"").localeCompare(a.lastActivity??""));
  const pages=pagination(p,rows.length);
  return cards([["Active on 1 day",m.retention.oneDay],["Active on 2+ days",m.retention.twoPlus],["Active on 3+ days",m.retention.threePlus],
    ["Returned within 7 days",`${m.retention.returned7} / ${m.retention.eligible7}`,"Users with a full 7-day observation window"],
    ["Returned within 30 days",`${m.retention.returned30} / ${m.retention.eligible30}`,"Users with a full 30-day observation window"]])+
    section("Signup cohort activation",bars(m.retention.funnel),"Accounts created in the selected period; sequential milestones observed by the period end. Returning is measured after revision for the last step.")+
    section("User activity",`<form method="get" class="search-form">${hidden(p,["search","page","attempt"])}<label>Exact email or user UUID<input name="search" value="${h(search)}" maxlength="254" placeholder="Search a specific account" autocomplete="off"></label><button>Find user</button></form>`+
      pages.html+table(["User","Joined","Last active","Attempts","Revisions","Practice","Diagrams","Ratings","Active days","First / latest submission"],rows.slice(pages.start,pages.start+25).map(u=>[
        `${userLink(p,u.id)}<small>${h(searchUsers.find(s=>s.id===u.id)?.email??u.id)}</small>`,h(stamp(u.created_at)),h(stamp(u.lastActivity)),String(u.attempts),String(u.revisions),String(u.practice),String(u.diagrams),String(u.ratings),String(u.activeDays),`${h(stamp(u.firstAttempt))}<small>${h(stamp(u.lastAttempt))}</small>`])),
      "Counts and active days use the selected period. First / latest submission and last activity use retained history through its end. Emails appear only after exact account search.")+
    notice("Return windows start at the first observed meaningful action, require activity on a different UTC day, and include only users with the full observation window. Historical transient actions were not recorded before this release.");
}
function hidden(params:URLSearchParams,omit:string[]) {
  return [...params].filter(([k])=>!omit.includes(k)).map(([k,v])=>`<input type="hidden" name="${h(k)}" value="${h(v)}">`).join("");
}
function select(name:string,label:string,values:string[],p:URLSearchParams) {
  const unique=[...new Set(values)].sort();
  return `<label>${h(label)}<select name="${name}"><option value="">All</option>${unique.map(v=>`<option value="${h(v)}"${p.get(name)===v?" selected":""}>${h(v)}</option>`).join("")}</select></label>`;
}
function attempts({facts:f,metrics:m,params:p}:RenderInput) {
  const detailId=p.get("attempt");
  if(detailId) {
    const a=f.attempts.find(a=>a.id===detailId);
    if(!a)return section("Attempt unavailable",notice("This attempt does not exist or has been deleted."));
    const rating=f.ratings.find(r=>r.attempt_id===a.id),reported=f.reportedMarks.find(r=>r.attempt_id===a.id);
    const children=f.attempts.filter(r=>r.parent_attempt_id===a.id);
    return `<p>${link(p,{attempt:null},"← Back to attempts")}</p>`+section("Attempt details",table(["Field","Value"],[
      ["Attempt",h(a.id)],["User",userLink(p,a.user_id)],["Created",h(stamp(a.created_at))],["Topic",h(topicOf(a))],
      ["Format / paper",h(`${formatOf(a)} · ${paperOf(a)}`)],["Framework",h(a.framework??"Unknown / legacy")],
      ["Aptly estimate",a.marks_earned!==null?`${num(a.marks_earned)} / ${num(a.marks_available)}`:"Unavailable"],
      ["Legacy compatibility score",a.legacy_score!==null?`${a.legacy_score} / ${a.legacy_max_score} (not an IB mark)`:"—"],
      ["Scoring state",h(a.scoring_state??"Legacy")],["Diagram",h(`${a.diagram_present?"Submitted evidence":"No submitted evidence"} · ${a.diagram_state??"Unknown"}`)],
      ["Model / contract",h(`${a.grading_model_id??"Unknown"} · ${a.grading_contract_version??"Unknown"}`)],
      ["Rubric / assessment version",h(`${a.rubric_version??"Unknown"} · ${a.assessment_version??"Unknown"}`)],
      ["Parent",a.parent_attempt_id?attemptLink(p,a.parent_attempt_id):"Original (or removed historical link)"],
      ["Child revisions",children.map(c=>attemptLink(p,c.id)).join(" · ")||"None"],
      ["Feedback rating",rating?`${rating.rating} / 5`:"Not rated"],
      ["Student-reported original mark",reported?`${num(Number(reported.marks_earned),2)} / ${reported.marks_available} · unverified` :"Not reported"],
    ]),"Deliberate metadata drill-down. Answers, diagram images, prompts and private assessment snapshots are not loaded into this console.");
  }
  const rows=filterAttempts(f,m.range,p),pages=pagination(p,rows.length);
  return section("Filter submissions",`<form method="get" class="filters attempt-filters">${hidden(p,["user","topic","marks","framework","paper","diagram","kind","origin","model","contract","state","page","attempt"])}
    <label>User UUID<input name="user" value="${h(p.get("user")??"")}" placeholder="Any user" maxlength="36"></label>
    ${select("topic","Topic",f.attempts.map(topicOf),p)}${select("marks","Marks available",f.attempts.map(a=>String(a.marks_available??"unknown")),p)}
    ${select("framework","Framework",f.attempts.map(a=>a.framework??"unknown"),p)}${select("paper","Paper",f.attempts.map(paperOf),p)}
    ${select("diagram","Diagram submitted",["yes","no"],p)}${select("kind","Original / revision",["original","revision"],p)}
    ${select("origin","Question origin",["curated_bank","adaptive_generated","manual","unknown"],p)}
    ${select("model","Model",f.attempts.map(a=>a.grading_model_id??"unknown"),p)}${select("contract","Grading contract",f.attempts.map(a=>a.grading_contract_version??"unknown"),p)}
    ${select("state","Scoring state",f.attempts.map(a=>a.scoring_state??"legacy"),p)}<button>Apply filters</button></form>`)+
    section("Submissions",pages.html+table(["Time","User","Format / topic","Estimate","Diagram","Kind","Model / contract","Details"],rows.slice(pages.start,pages.start+25).map(a=>[
      h(stamp(a.created_at)),userLink(p,a.user_id),`${h(formatOf(a))}<small>${h(topicOf(a))}</small>`,`${num(a.marks_earned)} / ${num(a.marks_available)}<small>${h(a.scoring_state??"Legacy")}</small>`,
      h(a.diagram_state??(a.diagram_present?"Submitted":"None")),a.parent_attempt_id?"Revision":"Original",`${h(a.grading_model_id??"Unknown")}<small>${h(a.grading_contract_version??"Unknown")}</small>`,attemptLink(p,a.id,"Inspect →")]))+
      pages.html,"No full student answers appear in the table.")+
    grid(section("Paper / assessment types",bars(m.papers)),section("Original response score distribution",bars(m.scores),"Fully marked original responses only, normalized within their own total; legacy compatibility scores and revisions are excluded."));
}
function revisions({metrics:m}:RenderInput) {
  const r=m.revision;
  return cards([["Originals revised",pct(r.rate),`${r.chains} / ${r.originals} originals`],["Revisions submitted",r.revisions],["Users revising",r.users],
    ["Median first revision",r.medianHours===null?"—":`${num(r.medianHours,1)} hours`],["Revisions per original",num(r.perOriginal,2)],["Repeat revisions",r.repeatRevisions],
    ["Internal score change",r.averageDelta===null?"—":`${num(r.averageDelta,2)} marks`,`${r.compared} comparable chains`]])+
    notice("Revision behaviour and internal score change are not external evidence of learning or an improvement caused by Aptly. Compare each original with its latest revision once, only with fully marked, matching framework, total and grading contract.")+
    grid(section("Internal score direction",bars([{label:"Higher internal estimate (%)",value:r.improving??0},{label:"Unchanged (%)",value:r.unchanged??0},{label:"Lower internal estimate (%)",value:r.falling??0}]),`${r.compared} comparable chains; no comparisons means no evidence, not zero improvement.`),
      section("Interaction → revision",table(["Signal","Attempts with signal","Later direct revision","Conversion"],m.funnels.map(x=>[h(x.label),String(x.started),String(x.converted),pct(x.rate)])),"Signals in the selected period; unique attempts, ordered before the child submission. Captured only from this release."))+
    section("Revision rate by original submission period",trends(m,"revision"),"Denominator: retained originals created in the period. Numerator: originals with a descendant submitted by the selected range end. Recent originals have had less time to be revised.");
}
function practice({metrics:m}:RenderInput) {
  const q=m.practice, served=new Set(q.servedBanks);
  const enabled=process.env.NEXT_PUBLIC_DIAGRAM_ASSESSMENT_ENABLED==="true";
  const available=ECONOMICS_QUESTION_BANK.filter(q=>q.qualityStatus!=="deprecated"&&(enabled||q.marks!==4));
  const unused=available.filter(q=>!served.has(q.id));
  return cards([["Questions saved",q.total],["Bank questions",q.bank],["AI fallback",q.generated,`${pct(q.fallbackRate)} of known origins`],
    ["Current Focus questions",q.focused],["No linked submission yet",q.unsubmitted,"Saved in period, no attempt by period end"],["Repeated bank serves",q.repeated,"Same user + bank ID, beyond first in period"]])+
    notice("A saved question is a served question. No linked submission yet is a proxy for unfinished Practice, not proof of abandonment. Null origins remain unknown; they are not guessed as AI fallback. Repeated serves do not reveal how often the selector successfully avoided repeats.")+
    grid(section("Question origin",bars(q.origins)),section("Practice starts",bars(q.starts),"Start signals record requesting a question; repeated retries within 30 seconds are deduplicated."))+
    grid(section("Most selected / served topics",bars(q.topics)),section("Question formats",bars(q.formats)))+
    grid(section("Most served bank questions",bars(q.bankQuestions)),section("Bank / generation trend",trends(m,"practice")))+
    section("Bank coverage",`<p>${unused.length} / ${available.length} currently available bank questions have never been served in retained history through the selected range end.</p><details><summary>Inspect unserved question IDs</summary>${table(["Bank ID","Topic","Marks"],unused.map(q=>[h(q.id),h(q.topicCode),String(q.marks)]))}</details>`)+
    grid(section("Generation models",bars(q.models)),section("Assessment blueprint versions",bars(q.versions)))+
    notice("Use fallback share and the AI operations page together to investigate unexpected fallback or repeated Practice failures; no universal alert threshold is assumed.");
}
function feedback({metrics:m,params:p,comments}:RenderInput) {
  const f=m.feedback;
  const differenceGroups=counts(m.comparisons,c=>c.absoluteDifference===0?"0 marks":c.absoluteDifference<=1?">0–1 mark":c.absoluteDifference<=2?">1–2 marks":">2 marks");
  return cards([["Ratings",f.count],["Average rating",`${num(f.average,2)} / 5`],["Positive",pct(f.positive),"4 or 5 out of 5"],["Reported mark comparisons",m.comparisons.length,"Matching totals and fully marked estimates only"]])+
    grid(section("Rating distribution",bars(f.distribution)),section("Rating trend",trends(m,"feedback"),"One active rating per attempt. Edits move the current rating to its update date; this is not an immutable rating history."))+
    grid(section("Rating by format",table(["Format","Ratings","Mean / 5"],f.byFormat.map(x=>[h(x.label),String(x.value),num(x.average,2)]))),section("Rating by topic",table(["Topic","Ratings","Mean / 5"],f.byTopic.map(x=>[h(x.label),String(x.value),num(x.average,2)]))))+
    section("Recent comments",table(["Updated","Rating","Attempt","Comment"],comments.map(c=>[h(stamp(c.updated_at)),`${c.rating}/5`,attemptLink(p,c.attempt_id),h(c.comment)])),"Private student feedback; visible only in this authorized view.")+
    section("Lowest-rated attempts",table(["Rating","Updated","User","Attempt"],f.lowest.map(r=>[`${r.rating}/5`,h(stamp(r.updated_at)),userLink(p,r.user_id),attemptLink(p,r.attempt_id)])))+
    notice("Original marks are entered by students and are not independently verified teacher data. These differences do not measure validated teacher agreement. Only matching denominators and fully assessed Aptly marks are compared.")+
    grid(section("Absolute difference distribution",bars(differenceGroups)),section("Differences by question type",table(["Type","Comparisons","Mean absolute difference"],counts(m.comparisons,c=>c.format).map(g=>{
      const c=m.comparisons.filter(c=>c.format===g.label);return [h(g.label),String(c.length),num(c.reduce((n,r)=>n+r.absoluteDifference,0)/c.length,2)];}))))+
    section("Student-reported / Aptly comparison",table(["Attempt","Type","Reported (unverified)","Aptly estimate","Aptly minus reported","Absolute difference"],m.comparisons.slice(0,100).map(c=>[attemptLink(p,c.attemptId),h(c.format),`${num(c.reported,2)} / ${c.total}`,`${c.estimated} / ${c.total}`,num(c.difference,2),num(c.absoluteDifference,2)])),"Latest current report per attempt updated in period. Table shows up to 100 comparisons; aggregate distributions include all.");
}
function ai({metrics:m,params:p}:RenderInput) {
  const a=m.ai,limits:Record<string,number>={grade:DAILY_GRADE_LIMIT,diagram:DAILY_DIAGRAM_REVIEW_LIMIT,scan:DAILY_EXTRACTION_LIMIT,practice:DAILY_PRACTICE_GENERATION_LIMIT};
  const worst=[...a.capabilities].filter(c=>c.failureRate!==null).sort((x,y)=>y.failureRate!-x.failureRate!)[0];
  return cards([["Retained operations",a.total],["Failed operations",a.failures],["Failure rate",pct(a.failureRate),"Failed / (succeeded + failed)"],["Highest failure rate",worst?.capability??"—",worst?`${pct(worst.failureRate)} · ${worst.total} operations`:"No completed operations"]])+
    notice("The existing AI ledger prunes records older than 30 days when a user next reserves that capability. All time means all retained rows, not complete lifetime AI usage. No token or cost history is inferred.")+
    section("Capabilities",table(["Capability","Total","Reserved","Processing","Succeeded","Failed","Failure rate","Mean elapsed seconds","Timed rows"],a.capabilities.map(c=>[h(c.capability),String(c.total),String(c.reserved),String(c.processing),String(c.succeeded),String(c.failed),pct(c.failureRate),num(c.averageDuration,2),String(c.timedOperations)])),"Elapsed time uses processing_started_at → completed_at where both exist. It includes application processing; it is not provider-only latency.")+
    grid(section("Failure categories",bars(a.categories)),section("Operation status",bars(a.statuses)))+
    section("Operations & failures over time",trends(m,"ai"))+
    section("Today’s per-user quota usage",table(["User","Capability","Reserved / daily limit","Quota usage"],a.quotas.map(q=>{
      const [user,capability]=q.label.split(":");return [userLink(p,user),h(capability),`${q.value} / ${limits[capability]??"?"}`,pct(limits[capability]?100*q.value/limits[capability]:null)];})),"Current UTC day, independent of selected period. All reservations consume quota, including dispatched failures. Bank selection does not consume a Practice AI reservation.")+
    grid(section("Grading models on saved attempts",bars(m.models)),section("Grading contract versions",bars(m.contracts)));
}
export function renderDashboard(input:RenderInput):string {
  const p=input.params,key=p.get("section")??"overview",active=Object.hasOwn(SECTIONS,key)?key as keyof typeof SECTIONS:"overview";
  const content=({overview,users,attempts,revisions,practice,feedback,ai}[active])(input);
  const nav=Object.entries(SECTIONS).map(([key,title])=>`<a href="?${h(new URLSearchParams({section:key,range:input.metrics.range.preset,...(p.get("from")?{from:p.get("from")!}:{}),...(p.get("to")?{to:p.get("to")!}:{})}).toString())}"${key===active?' aria-current="page"':""}>${h(title)}</a>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><meta name="referrer" content="no-referrer"><title>${h(SECTIONS[active])} · Aptly internal</title><link rel="stylesheet" href="/admin-console.css"></head>
  <body><a class="skip" href="#main">Skip to analytics</a><div class="console"><aside><div class="brand">a<span>Aptly</span></div><p class="eyebrow">INTERNAL CONSOLE</p><nav aria-label="Admin sections">${nav}</nav><div class="sidebar-foot"><span class="private-dot"></span> Private · Founder access<p>Product health, activity<br>and feedback.</p></div></aside>
  <div class="workspace"><header><div><p class="eyebrow">PRODUCT INTELLIGENCE</p><h1>${h(SECTIONS[active])}</h1><p class="subtitle">${h(input.metrics.range.label)}</p></div><div class="refresh"><a class="button secondary" href="?${h(p.toString())}">↻ Refresh</a><small>Refreshed ${h(stamp(input.now.toISOString()))}</small></div></header>
  <form method="get" class="date-filter" aria-label="Date range">${hidden(p,["range","from","to","page"])}<label>Period<select name="range">${[["today","Today"],["7d","Last 7 days"],["30d","Last 30 days"],["all","All time"],["custom","Custom range"]].map(([v,t])=>`<option value="${v}"${input.metrics.range.preset===v?" selected":""}>${t}</option>`).join("")}</select></label><label>Custom start<input type="date" name="from" value="${h(p.get("from")??"")}"></label><label>Custom end (inclusive)<input type="date" name="to" value="${h(p.get("to")??"")}"></label><button>Apply period</button><span>All dates in UTC</span></form>
  <main id="main">${content}<details class="definitions"><summary>Metric definitions & coverage</summary><p>Meaningful activity: saved submission, saved Practice question, or recorded feedback / Next Step / Current Focus / Practice / revision interaction. Authentication and History visits alone do not count. DAU / WAU / MAU use the current UTC day and the last 7 / 30 calendar days.</p><p>Revision rate: retained original attempts created in the selected range with at least one descendant revision by its end, divided by those originals. A revision chain counts once. Returning active user: active in range and on more than one distinct observed UTC day through range end.</p><p>Feedback uses the latest editable rating (1–5); positive means 4–5. Bank share and fallback share exclude unknown historical origins. AI failure rate excludes pending operations. Diagram usage is submitted evidence / all retained submissions; unknown legacy evidence is not inferred.</p><p>Interactions, ratings and reported marks begin with this release. Deleted work is absent, deleted parent links cannot be reconstructed, and AI retention makes older periods incomplete. All counts are observed behaviour, not evidence of causal learning gains.</p></details></main>
  <footer>Aptly internal · Source: existing product records + bounded interaction signals · UTC</footer></div></div></body></html>`;
}

export function renderUnavailable(message:string) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/admin-console.css"><title>Analytics unavailable</title></head><body><main class="error-panel"><h1>Analytics unavailable</h1><p>${h(message)}</p><a href="?">Retry overview</a></main></body></html>`;
}
