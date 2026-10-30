/**
 * SignalWire cXML <Record> -> private MAX studio WAV draft.
 * Caller-provided RecordingUrl is NOT fetched. A known, verified project URL
 * is constructed using the SignalWire RecordingSid from a signed webhook.
 */
import {pool} from "@workspace/db";
import type {Response} from "express";
const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;")
 .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;");
export function beginMaxRecording(res:Response,actionUrl:string){
 res.status(200).type("application/xml; charset=utf-8").set("Cache-Control","no-store").send(
  '<?xml version="1.0" encoding="UTF-8"?><Response>'+
  '<Say>Record a new announcement after the beep. Press pound to save it as a private draft. This will NOT change any live extension.</Say>'+
  '<Record action="'+escape(actionUrl)+'" method="POST" maxLength="90" finishOnKey="#" playBeep="true" trim="trim-silence" />'+
  '</Response>');
}
export async function privateMaxRecording(path:string,sid:string,duration:number){
 if(!/^[A-Za-z0-9-]{10,80}$/.test(sid)||!Number.isFinite(duration)||duration<1||duration>90)
  throw Error("Invalid recording response");
 const result=await pool.query<{space_hostname:string;project_id:string}>(
  "SELECT space_hostname,project_id FROM public.gavhah_signalwire_credentials "+
  "WHERE id=1 AND verified_at IS NOT NULL");
 const row=result.rows[0];
 if(!row||!/^[a-z0-9](?:[a-z0-9-]{0,60}[a-z0-9])?$/.test(row.space_hostname)||
  !/^[0-9a-f-]{36}$/i.test(row.project_id))throw Error("Verified provider credentials unavailable");
 const url="https://"+row.space_hostname+".signalwire.com/api/laml/2010-04-01/Accounts/"+
  encodeURIComponent(row.project_id)+"/Recordings/"+encodeURIComponent(sid)+".wav";
 // Never follow a redirect, never request the supplied RecordingUrl.
 const response=await fetch(url,{method:"GET",redirect:"error",cache:"no-store",signal:AbortSignal.timeout(15000)});
 if(!response.ok||Number(response.headers.get("content-length")||0)>4*1024*1024)
  throw Error("Recording unavailable or too large");
 const reader=response.body?.getReader();if(!reader)throw Error("No recording stream");
 const chunks:Buffer[]=[];let size=0;
 try{for(;;){
  const {value,done}=await reader.read();if(done)break;
  size+=value.length;if(size>4*1024*1024)throw Error("Recording exceeds size limit");
  chunks.push(Buffer.from(value));
 }}finally{await reader.cancel().catch(()=>{});}
 const audio=Buffer.concat(chunks,size);
 if(audio.length<80||audio.toString("ascii",0,4)!=="RIFF"||
  audio.toString("ascii",8,12)!=="WAVE")throw Error("Provider audio validation failed");
 await pool.query("CREATE TABLE IF NOT EXISTS public.gavhah_max_voice_drafts ("+
  "path text PRIMARY KEY CHECK(path='root' OR (path <> '55555' AND path ~ '^[1-9][0-9]{0,15}$')),"+
  "yiddish_script text NOT NULL DEFAULT '',english_tts text NOT NULL DEFAULT '',"+
  "draft_audio bytea,mime_type text,updated_at timestamptz NOT NULL DEFAULT now())");
 await pool.query("INSERT INTO public.gavhah_max_voice_drafts(path,draft_audio,mime_type) "+
  "VALUES($1,$2,'audio/wav') ON CONFLICT(path) DO UPDATE SET "+
  "draft_audio=EXCLUDED.draft_audio,mime_type=EXCLUDED.mime_type,updated_at=now()",[path,audio]);
 return {bytes:audio.length,live:false};
}
