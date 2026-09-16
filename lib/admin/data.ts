import "server-only";
import { getAdminClient } from "@/lib/supabase/admin";
import type { AdminIdentity } from "./auth";
import type { Facts, Range } from "./metrics";
export async function loadAdminFacts(identity:AdminIdentity, now:Date):Promise<Facts> {
  const {data,error}=await getAdminClient().rpc("admin_analytics_snapshot",{
    p_user_id:identity.userId,p_session_id:identity.sessionId,p_before:now.toISOString(),
  });
  if(error||!data)throw new Error("Analytics unavailable");
  return data as Facts;
}
export async function findAdminUser(identity:AdminIdentity, search:string):Promise<{id:string;email:string}[]> {
  if(!search.trim())return [];
  const {data,error}=await getAdminClient().rpc("admin_find_user",{
    p_user_id:identity.userId,p_session_id:identity.sessionId,p_search:search.trim().slice(0,254),
  });
  if(error)throw new Error("Search unavailable");return data??[];
}
export async function recentComments(range:Range) {
  const {data,error}=await getAdminClient().from("attempt_feedback").select("attempt_id,user_id,rating,comment,updated_at")
    .not("comment","is",null).gte("updated_at",range.start).lt("updated_at",range.end).order("updated_at",{ascending:false}).limit(20);
  if(error)throw new Error("Comments unavailable");
  return (data??[]) as {attempt_id:string;user_id:string;rating:number;comment:string;updated_at:string}[];
}
