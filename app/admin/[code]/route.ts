import { authorizeAdmin, adminNotFound, PRIVATE_HEADERS } from "@/lib/admin/auth";
import { loadAdminFacts, findAdminUser, recentComments } from "@/lib/admin/data";
import { calculateMetrics, parseRange } from "@/lib/admin/metrics";
import { renderDashboard, renderUnavailable } from "@/lib/admin/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function GET(request:Request, context:{params:Promise<{code:string}>}) {
  const identity=await authorizeAdmin((await context.params).code);
  if(!identity)return adminNotFound();
  const params=new URL(request.url).searchParams,now=new Date();
  const headers={...PRIVATE_HEADERS,"Content-Type":"text/html; charset=utf-8"};
  let range;
  try { range=parseRange(params,now); } catch {
    return new Response(renderUnavailable("Choose valid UTC dates, with the start on or before the end."),{status:400,headers});
  }
  try {
    const [facts,searchUsers,comments]=await Promise.all([
      loadAdminFacts(identity,now),params.get("section")==="users"?findAdminUser(identity,params.get("search")??""):[],
      params.get("section")==="feedback"?recentComments(range):[],
    ]);
    const html=renderDashboard({facts,metrics:calculateMetrics(facts,range,now),params,now,searchUsers,comments});
    return new Response(html,{headers});
  } catch {
    return new Response(renderUnavailable("The source data could not be loaded. No partial totals are shown. Please refresh to retry."),{status:503,headers});
  }
}
