import { useEffect, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ProjectReport={
  caseId:number;title:string;status:string;urgency:string;
  lifetime:{goal:number;manuallyReportedReceived:number;outstandingPromises:number};
  period:{
    receiptCount:number;manuallyReportedGross:number;manuallyReportedNetAsOfNow:number;
    externallyMarkedVerifiedNet:number;newPledgeCount:number;newlyRecordedPledges:number;
    callReportCount:number;callOutcomes:Record<string,number>;
  };
};
type Report={
  days:number;fromUtc:string;asOfUtc:string;
  summary:{lifetimeReceived:number;lifetimeOutstanding:number;periodReportedNet:number;
    periodVerifiedNet:number;periodNewPledges:number;periodCallReports:number};
  projects:ProjectReport[];limitations:string[];
};
const money=(value:number)=>"$"+value.toLocaleString(undefined,{maximumFractionDigits:2,minimumFractionDigits:2});
export function MaxPerformancePanel(){
  const [days,setDays]=useState(30);
  const [expanded,setExpanded]=useState(false);
  const [report,setReport]=useState<Report|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!expanded)return;
    const abort=new AbortController();
    setLoading(true);setError("");
    fetch("/api/askanus/max/reports?days="+days,{
      credentials:"include",cache:"no-store",signal:abort.signal,
    }).then(async r=>{
      const data=await r.json();
      if(!r.ok)throw Error(data.error||"נישט געלונגען");
      return data as Report;
    }).then(setReport).catch(e=>{if(!abort.signal.aborted)setError(String(e.message||e));})
      .finally(()=>{if(!abort.signal.aborted)setLoading(false);});
    return ()=>abort.abort();
  },[expanded,days]);
  return <section dir="rtl" aria-label="MAX פערזענליכע באריכטן" className="rounded-xl border bg-card p-4 sm:p-6 space-y-3">
    <div className="flex gap-3 flex-wrap items-center justify-between">
      <h3 className="font-bold flex gap-2 items-center"><BarChart3 className="h-5 w-5"/> MAX — מיין פארשריט און באריכטן</h3>
      <Button type="button" size="sm" variant="outline"
        onClick={()=>setExpanded(v=>!v)}>{expanded?"צומאכן באריכט":"עפענען מיין באריכט"}</Button>
    </div>
    {!expanded? <p className="text-sm text-muted-foreground">
      פערזענליכע באריכטן אויף רופן, נייע התחייבויות און באריכטעטע נדבות,
      באזונדער פון דיין אלגעמיינעם „מיין עסקנות“־איבערבליק.
    </p>: <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="אויסקלייבן באריכט־תקופה">
        {[7,30,90,365].map(n=><Button key={n} type="button" size="sm"
          variant={days===n?"default":"outline"} disabled={loading}
          onClick={()=>setDays(n)}>{n} טעג</Button>)}
      </div>
      {loading&&<p role="status" className="text-sm">לאדנט דעם באריכט...</p>}
      {error&&<p role="alert" className="text-destructive text-sm">{error}</p>}
      {report&&<div className="space-y-4">
        <p className="text-xs text-muted-foreground" dir="ltr">
          {new Date(report.fromUtc).toLocaleDateString()} — {new Date(report.asOfUtc).toLocaleDateString()}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-center">
          {[
            ["באקומען, גאנצע עסקנות",money(report.summary.lifetimeReceived)],
            ["אפענע התחייבויות",money(report.summary.lifetimeOutstanding)],
            ["באקומען אין דער תקופה, נעץ",money(report.summary.periodReportedNet)],
            ["נייע התחייבויות",money(report.summary.periodNewPledges)],
            ["מאנועל איינגעשריבענע רוף־באריכטן",String(report.summary.periodCallReports)],
            ["אלס באשטעטיגט אנגעצייכנט",money(report.summary.periodVerifiedNet)],
          ].map(([label,value])=><div key={label} className="rounded-lg bg-muted/30 p-3">
            <strong className="block text-lg">{value}</strong><span className="text-xs">{label}</span>
          </div>)}
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold">פער פראיעקט</h4>
          {report.projects.length===0&&<p className="text-sm">קיין פערזענליכע פראיעקטן געפונען.</p>}
          {report.projects.map(p=><div key={p.caseId} className="border rounded-lg p-3 space-y-2 text-sm">
            <strong>{p.title}</strong>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span>באקומען אין דער תקופה: {money(p.period.manuallyReportedNetAsOfNow)}</span>
              <span>נייע התחייבויות: {money(p.period.newlyRecordedPledges)}</span>
              <span>רוף־באריכטן: {p.period.callReportCount}</span>
              <span>אפענע התחייבויות (אלעמאל): {money(p.lifetime.outstandingPromises)}</span>
            </div>
          </div>)}
        </div>
        <div className="rounded-lg border p-3 space-y-2 text-xs text-muted-foreground">
          <strong className="text-foreground">וויכטיגע ערקלערונג</strong>
          <p>די ציפערן זענען פערזענליכע באריכטן, נישט קיין אויטאמאטישע באשטעטיגונג
            פונעם באנק אדער קארטל־סערוויס. א קארעקטור ווערט אפגערעכנט פונעם באצאלונגס־רעקארד.</p>
          <p>די תקופה מיינט די לעצטע {report.days} מאל 24 שעה.
            עלטערע פראיעקט־סכומים קענען ארייננעמען פריערדיגע איינטראגן אן איינצלנע קבלות.</p>
        </div>
      </div>}
    </>}
  </section>;
}
