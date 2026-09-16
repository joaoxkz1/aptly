"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { FeedbackInput, OriginalMarkInput } from "@/lib/analytics/student-reports";

/** Mounted only for durable saved attempts. Each instance is keyed by attempt ID. */
export function AttemptFeedback({ attemptId }: { attemptId: string }) {
  const [rating,setRating]=useState<number|null>(null),[comment,setComment]=useState("");
  const [earned,setEarned]=useState(""),[available,setAvailable]=useState("");
  const [loaded,setLoaded]=useState(false),[loadError,setLoadError]=useState(false),[retry,setRetry]=useState(0);
  const [saving,setSaving]=useState<"feedback"|"originalMark"|null>(null);
  const [message,setMessage]=useState(""),[error,setError]=useState("");
  const [hasFeedback,setHasFeedback]=useState(false),[hasMark,setHasMark]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/attempts/${attemptId}/reports`,{cache:"no-store",signal:controller.signal})
      .then(async res=>{if(!res.ok)throw new Error();return res.json();})
      .then(data=>{
        if(controller.signal.aborted)return;
        setRating(data.feedback?.rating??null);setComment(data.feedback?.comment??"");
        setEarned(data.originalMark?String(data.originalMark.marks_earned):"");
        setAvailable(data.originalMark?String(data.originalMark.marks_available):"");
        setHasFeedback(Boolean(data.feedback));setHasMark(Boolean(data.originalMark));setLoaded(true);setLoadError(false);
      }).catch(()=>{if(!controller.signal.aborted)setLoadError(true);});
    return ()=>controller.abort();
  },[attemptId,retry]);
  async function save(kind:"feedback"|"originalMark",value:FeedbackInput|OriginalMarkInput|null) {
    if(saving||!loaded)return;
    setSaving(kind);setMessage("");setError("");
    try {
      const res=await fetch(`/api/attempts/${attemptId}/reports`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({kind,value})});
      if(!res.ok)throw new Error();
      if(kind==="feedback"){setHasFeedback(value!==null);if(value===null){setRating(null);setComment("");}}
      else {setHasMark(value!==null);if(value===null){setEarned("");setAvailable("");}}
      setMessage(value===null?"Removed.":kind==="feedback"?"Thanks — your feedback is saved. You can edit it anytime.":"Original mark saved as student-reported and unverified.");
    } catch {setError("We couldn’t save that. Please try again.");} finally {setSaving(null);}
  }
  if(!loaded)return <div className="text-xs text-muted-foreground">{loadError?<><span>Feedback controls could not load.</span> <button type="button" onClick={()=>setRetry(n=>n+1)} className="text-primary underline">Retry</button></>:"Loading feedback controls…"}</div>;
  return <Card><CardContent className="space-y-4 p-4 md:p-5">
    <form onSubmit={e=>{e.preventDefault();if(rating)void save("feedback",{rating,comment:comment.trim()||null});}} className="space-y-3">
      <fieldset disabled={saving!==null} className="space-y-3">
        <legend className="text-sm font-semibold">How useful was this feedback?</legend>
        <div role="radiogroup" aria-label="Feedback usefulness" className="flex flex-wrap gap-2">
          {[1,2,3,4,5].map(value=><label key={value} className="cursor-pointer">
            <input type="radio" name={`rating-${attemptId}`} value={value} checked={rating===value}
              aria-label={`${value} out of 5${value===1?", not useful":value===5?", very useful":""}`}
              onChange={()=>{setRating(value);setMessage("");}} className="peer sr-only" />
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm font-medium peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary ${rating===value?"border-primary bg-primary text-primary-foreground":"border-border bg-card hover:bg-muted"}`}>{value}</span>
          </label>)}
        </div>
        <p className="text-xs text-muted-foreground">1 = not useful · 5 = very useful</p>
        <details><summary className="cursor-pointer text-xs text-muted-foreground">Add an optional comment</summary>
          <label className="mt-2 block text-xs">What could be better? (500 characters max)
            <textarea maxLength={500} value={comment} onChange={e=>{setComment(e.target.value);setMessage("");}} rows={2} className="mt-1 w-full rounded-lg border border-border bg-background p-2 text-sm" />
          </label><p className="mt-1 text-xs text-muted-foreground">Private to you and Aptly’s internal team. Please avoid personal or sensitive information.</p>
        </details>
        <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" variant="outline" disabled={!rating}>{saving==="feedback"?"Saving…":hasFeedback?"Update rating":"Save rating"}</Button>
          {hasFeedback&&<Button type="button" size="sm" variant="ghost" onClick={()=>void save("feedback",null)}>Remove rating</Button>}</div>
      </fieldset>
    </form>
    <details className="border-t border-border pt-3"><summary className="cursor-pointer text-xs font-medium">{hasMark?"Edit original mark":"Add an original mark (optional)"}</summary>
      <p className="mt-2 text-xs text-muted-foreground">If this work was marked before using Aptly, you can record that mark. It is entered by you and not independently verified, even if it came from a teacher. Aptly’s estimate stays unchanged.</p>
      <form className="mt-3 space-y-3" onSubmit={e=>{e.preventDefault();void save("originalMark",{marks_earned:Number(earned),marks_available:Number(available)});}}>
        <fieldset disabled={saving!==null} className="space-y-3">
          <div className="flex flex-wrap gap-3"><label className="text-xs">Marks earned<input required type="number" min="0" max={available||60} step="0.01" value={earned} onChange={e=>setEarned(e.target.value)} className="mt-1 block w-28 rounded-lg border border-border bg-background p-2 text-sm" /></label>
            <label className="text-xs">Marks available<input required type="number" min="1" max="60" step="1" value={available} onChange={e=>setAvailable(e.target.value)} className="mt-1 block w-28 rounded-lg border border-border bg-background p-2 text-sm" /></label></div>
          <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" variant="outline">{saving==="originalMark"?"Saving…":hasMark?"Update original mark":"Save original mark"}</Button>
            {hasMark&&<Button type="button" size="sm" variant="ghost" onClick={()=>void save("originalMark",null)}>Remove original mark</Button>}</div>
        </fieldset>
      </form>
    </details>
    {message&&<p role="status" className="text-xs text-muted-foreground">{message}</p>}
    {error&&<p role="alert" className="text-xs text-destructive">{error}</p>}
  </CardContent></Card>;
}
