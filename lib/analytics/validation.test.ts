import { describe,it,expect } from "vitest";
import { parseEvent,EVENT_NAMES } from "./events";
import { parseFeedback,parseOriginalMark } from "./student-reports";
import { boundedJson,validMutationOrigin } from "./request";
const id="11111111-1111-4111-8111-111111111111";
describe("bounded interaction registry",()=>{
  it("accepts controlled interaction signals only",()=>{
    for(const event of EVENT_NAMES)expect(parseEvent({event,attemptId:id,properties:{source:"result"}})).not.toBeNull();
    for(const event of ["assessment_completed","revision_completed","ai_succeeded","anything"])expect(parseEvent({event})).toBeNull();
  });
  it("rejects identity spoofing, arbitrary properties, invalid references and oversized content",()=>{
    for(const payload of [{event:"practice_started",user_id:id},{event:"feedback_viewed"},{event:"practice_started",attemptId:"other"},
      {event:"practice_started",properties:{answer:"private"}},{event:"practice_started",properties:{source:"x".repeat(1000)}},
      {event:"practice_started",properties:{source:null}},{event:"history_viewed",properties:{action:"revise"}}])expect(parseEvent(payload)).toBeNull();
  });
  it("limits streamed bytes and rejects cross-site mutations",async()=>{
    const req=new Request("https://aptly.test/api/events",{method:"POST",body:JSON.stringify({value:"x".repeat(5000)})});
    await expect(boundedJson(req)).rejects.toThrow("payload too large");
    expect(validMutationOrigin(new Request("https://aptly.test/api/events",{method:"POST",headers:{Origin:"https://evil.test","Content-Type":"application/json"}}))).toBe(false);
    expect(validMutationOrigin(new Request("http://localhost:3130/api/events",{method:"POST",headers:{Host:"127.0.0.1:3130",Origin:"http://127.0.0.1:3130","Content-Type":"application/json"}}))).toBe(true);
    expect(validMutationOrigin(new Request("https://aptly.test/api/events",{method:"POST",headers:{Host:"aptly.test",Origin:"https://evil.test","X-Forwarded-Host":"evil.test","Content-Type":"application/json"}}))).toBe(false);
  });
});
describe("student report validation",()=>{
  it("bounds ratings and comments",()=>{
    expect(parseFeedback({rating:4,comment:"  Helpful  "})).toEqual({rating:4,comment:"Helpful"});
    for(const input of [{rating:0},{rating:6},{rating:1.5},{rating:"5"},{rating:5,comment:"a".repeat(501)},{rating:5,user_id:id}])expect(parseFeedback(input)).toBeNull();
  });
  it("accepts unverified marks only within their total and never accepts a source override",()=>{
    expect(parseOriginalMark({marks_earned:4.5,marks_available:10})).not.toBeNull();
    for(const input of [{marks_earned:11,marks_available:10},{marks_earned:-1,marks_available:10},{marks_earned:1,marks_available:0},{marks_earned:NaN,marks_available:10},
      {marks_earned:1.234,marks_available:10},{marks_earned:1,marks_available:10,source:"teacher_verified"}])expect(parseOriginalMark(input)).toBeNull();
  });
});
