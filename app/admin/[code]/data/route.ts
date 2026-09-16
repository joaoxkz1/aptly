import { authorizeAdmin, adminNotFound, PRIVATE_HEADERS } from "@/lib/admin/auth";
import { loadAdminFacts } from "@/lib/admin/data";
import { calculateMetrics, parseRange } from "@/lib/admin/metrics";

export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{code:string}>}) {
  const identity=await authorizeAdmin((await context.params).code);
  if(!identity)return adminNotFound();
  const now=new Date();let range;
  try {range=parseRange(new URL(request.url).searchParams,now);} catch {
    return Response.json({error:"invalid_range"},{status:400,headers:PRIVATE_HEADERS});
  }
  try {
    const m=calculateMetrics(await loadAdminFacts(identity,now),range,now);
    // Explicit aggregate DTO: no route code, identity, emails, comments or row dump.
    return Response.json({refreshedAt:now.toISOString(),range,registered:m.registered,active:m.active,
      returning:m.returning,attempts:m.attempts,submitters:m.submitters,revision:m.revision,diagrams:m.diagrams,
      formats:m.formats,topics:m.topics,windows:m.windows,
      feedback:{count:m.feedback.count,average:m.feedback.average,positive:m.feedback.positive},
      ai:{total:m.ai.total,failures:m.ai.failures,failureRate:m.ai.failureRate},trend:m.trend}, {headers:PRIVATE_HEADERS});
  } catch {return Response.json({error:"unavailable"},{status:503,headers:PRIVATE_HEADERS});}
}
