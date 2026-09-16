import { describe,it,expect,vi,beforeEach } from "vitest";
import type { Facts } from "@/lib/admin/metrics";
const mocks=vi.hoisted(()=>({auth:vi.fn(),facts:vi.fn(),search:vi.fn(),comments:vi.fn()}));
vi.mock("@/lib/admin/auth",async()=>({...await vi.importActual("@/lib/admin/auth"),authorizeAdmin:mocks.auth}));
vi.mock("@/lib/admin/data",()=>({loadAdminFacts:mocks.facts,findAdminUser:mocks.search,recentComments:mocks.comments}));
import { GET } from "./route";
import { GET as DATA } from "./data/route";
const facts:Facts={users:[],attempts:[],practice:[],events:[],ratings:[],reportedMarks:[],operations:[]};
beforeEach(()=>{vi.clearAllMocks();mocks.auth.mockResolvedValue({userId:"u",sessionId:"s"});mocks.facts.mockResolvedValue(facts);mocks.search.mockResolvedValue([]);mocks.comments.mockResolvedValue([]);});
const context={params:Promise.resolve({code:"123456"})};
describe("private admin HTTP surfaces",()=>{
  it.each([GET,DATA])("denies before loading aggregates",async(handler)=>{
    mocks.auth.mockResolvedValue(null);const r=await handler(new Request("https://aptly.test/admin/123456"),context);
    expect(r.status).toBe(404);expect(await r.text()).toBe("Not found");expect(mocks.facts).not.toHaveBeenCalled();
  });
  it.each(["overview","users","attempts","practice","revisions","feedback","ai"])("renders %s without the route code or scripts",async(section)=>{
    const r=await GET(new Request(`https://aptly.test/admin/123456?section=${section}`),context);expect(r.status).toBe(200);
    const html=await r.text();expect(html).not.toContain("123456");expect(html).not.toContain("<script");expect(html).toContain("noindex,nofollow");
    expect(r.headers.get("cache-control")).toContain("no-store");expect(r.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("returns an explicit aggregate API DTO without credentials, identities or code",async()=>{
    const r=await DATA(new Request("https://aptly.test/admin/123456/data"),context);const json=await r.json();
    expect(json.registered).toBe(0);expect(json.users).toBeUndefined();expect(JSON.stringify(json)).not.toMatch(/123456|sessionId|userId|service_role|comment/);
  });
  it("fails closed instead of displaying partial totals",async()=>{
    mocks.facts.mockRejectedValue(new Error("private database failure"));const r=await GET(new Request("https://aptly.test/admin/123456"),context);
    expect(r.status).toBe(503);expect(await r.text()).not.toContain("private database failure");
  });
  it("escapes comments and query input",async()=>{
    mocks.comments.mockResolvedValue([{attempt_id:"id",user_id:"u",rating:1,comment:'<script>alert("x")</script>',updated_at:new Date().toISOString()}]);
    const r=await GET(new Request("https://aptly.test/admin/123456?section=feedback"),context);const html=await r.text();expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");
  });
});
