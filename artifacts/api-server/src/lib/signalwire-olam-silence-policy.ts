/**
 * cXML consumes consecutive Gather verbs in order. A Gather with
 * actionOnEmptyResult=false continues to the next instruction on silence.
 * Exactly two 4-second waits, then an unannounced hangup.
 */
const escapeXml=(value:string)=>value.replace(/&/g,"&amp;").replace(/"/g,"&quot;")
 .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/'/g,"&apos;");
export function buildOlamTwoAttemptGather(actionUrl:string,requestedDigits:number,
 firstTrustedPromptXml:string,retryTrustedPromptXml:string):string {
 if(!/^https:\/\/[^\s"<>]+$/.test(actionUrl))throw Error("HTTPS action required");
 const digits=Number.isInteger(requestedDigits)?Math.min(16,Math.max(1,requestedDigits)):1;
 const begin='<Gather input="dtmf" action="'+escapeXml(actionUrl)+'" method="POST" '+
   'numDigits="'+digits+'" finishOnKey="#" timeout="4" actionOnEmptyResult="false">';
 return begin+firstTrustedPromptXml+'</Gather>'+
   begin+retryTrustedPromptXml+'</Gather><Hangup/>';
}
