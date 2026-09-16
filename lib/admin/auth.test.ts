import { beforeEach,describe,it,expect,vi } from "vitest";
import { readFileSync,readdirSync,statSync } from "node:fs";
import { join } from "node:path";
const mocks=vi.hoisted(()=>({getUser:vi.fn(),getClaims:vi.fn(),rpc:vi.fn(),client:vi.fn(),privileged:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:mocks.client}));
vi.mock("@/lib/supabase/admin",()=>({getAdminClient:mocks.privileged}));
import { authorizeAdmin,matchesAdminCode } from "./auth";
const uid="11111111-1111-4111-8111-111111111111",sid="22222222-2222-4222-8222-222222222222";
beforeEach(()=>{
  vi.clearAllMocks();process.env.ADMIN_ROUTE_CODE="123456";
  mocks.client.mockResolvedValue({auth:{getUser:mocks.getUser,getClaims:mocks.getClaims}});
  mocks.privileged.mockReturnValue({rpc:mocks.rpc});
  mocks.getUser.mockResolvedValue({data:{user:{id:uid}},error:null});mocks.getClaims.mockResolvedValue({data:{claims:{sub:uid,session_id:sid}}});
  mocks.rpc.mockResolvedValue({data:true,error:null});
});
describe("live server admin authorization",()=>{
  it("denies signed-out visitors even with the correct code",async()=>{mocks.getUser.mockResolvedValue({data:{user:null},error:null});expect(await authorizeAdmin("123456")).toBeNull();expect(mocks.rpc).not.toHaveBeenCalled();});
  it("denies normal users and ignores forged metadata",async()=>{mocks.getUser.mockResolvedValue({data:{user:{id:uid,user_metadata:{admin:true,role:"admin"}}}});mocks.rpc.mockResolvedValue({data:false});expect(await authorizeAdmin("123456")).toBeNull();});
  it("denies an admin with a wrong or unconfigured code before auth queries",async()=>{expect(await authorizeAdmin("654321")).toBeNull();expect(mocks.client).not.toHaveBeenCalled();delete process.env.ADMIN_ROUTE_CODE;expect(matchesAdminCode("123456")).toBe(false);});
  it("allows only a correct code plus live session membership",async()=>{expect(await authorizeAdmin("123456")).toEqual({userId:uid,sessionId:sid});expect(mocks.rpc).toHaveBeenCalledWith("admin_session_authorized",{p_user_id:uid,p_session_id:sid});});
  it("fails closed on lookup errors, missing sessions, mismatched claims or anonymous users",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{message:"down"}});expect(await authorizeAdmin("123456")).toBeNull();
    mocks.getClaims.mockResolvedValue({data:{claims:{sub:uid}}});expect(await authorizeAdmin("123456")).toBeNull();
    mocks.getClaims.mockResolvedValue({data:{claims:{sub:sid,session_id:sid}}});expect(await authorizeAdmin("123456")).toBeNull();
    mocks.getUser.mockResolvedValue({data:{user:{id:uid,is_anonymous:true}}});expect(await authorizeAdmin("123456")).toBeNull();
  });
  it("rejects invalid code formats",()=>{for(const value of ["","1","12abc3","123456 ","1".repeat(33)])expect(matchesAdminCode(value)).toBe(false);});
  it("has no route link or code in public navigation or sitemap",()=>{
    const nav=readFileSync("components/app-shell.tsx","utf8");expect(nav).not.toContain("/admin");expect(nav).not.toContain("ADMIN_ROUTE_CODE");
    const walk=(dir:string):string[]=>readdirSync(dir).flatMap(n=>statSync(join(dir,n)).isDirectory()?walk(join(dir,n)):[join(dir,n)]);
    for(const file of walk("app").filter(f=>/sitemap\./.test(f)))expect(readFileSync(file,"utf8")).not.toContain("admin");
    expect(readFileSync("public/robots.txt","utf8")).toContain("Disallow: /admin/");
    for(const file of [...walk("components"),...walk("lib"),...walk("app")].filter(f=>/\.tsx?$/.test(f)&&!f.endsWith(".test.ts"))){
      const source=readFileSync(file,"utf8");if(source.includes('"use client"'))expect(source).not.toContain("ADMIN_ROUTE_CODE");
    }
  });
});
