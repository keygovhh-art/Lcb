/**
 * Reserved SignalWire numbers MUST never be assigned to the new Gavhah IVR.
 * The owner's screenshot identifies +1 (605) 655-8080 as the existing number.\n * Older messages reversed the digits as 8080655605; protect BOTH labels.
 * A number with any active voice handler is treated as IN USE, not free.
 */
export const RESERVED_OTHER_SYSTEM_NUMBERS=new Set(["6056558080","8080655605"]);
export function normalizedSignalWireNumber(phone:unknown):string{
 const digits=String(phone??"").replace(/\D/g,"");
 return digits.length===11&&digits[0]==="1"?digits.slice(1):digits;
}
export function isProtectedSignalWireNumber(phone:unknown):boolean{
 return RESERVED_OTHER_SYSTEM_NUMBERS.has(normalizedSignalWireNumber(phone));
}
type ProviderNumber={
 phone_number?:string;friendly_name?:string;sid?:string;voice_url?:string|null;
 voice_application_sid?:string|null;voice_fallback_url?:string|null;
 trunk_sid?:string|null;capabilities?:{voice?:boolean};voice_method?:string
};
export function classifySignalWireNumber(number:ProviderNumber){
 const phone=normalizedSignalWireNumber(number.phone_number);
 const reserved=isProtectedSignalWireNumber(phone);
 const voiceAssigned=!!(
  number.voice_url?.trim()||number.voice_application_sid||
  number.voice_fallback_url?.trim()||number.trunk_sid
 );
 const voiceCapable=number.capabilities?.voice===true;
 // Never assume an empty Legacy Compatibility voice_url guarantees a Fabric
 // route is not assigned. The admin must confirm within SignalWire.
 const reason=reserved?"reserved_for_another_system":
   voiceAssigned?"already_has_voice_routing":
   !voiceCapable?"voice_not_available":"needs_provider_route_review";
 return {
  number:String(number.phone_number??""),
  label:String(number.friendly_name??"").slice(0,100),
  reserved,voiceAssigned,voiceCapable,
  canConsider:!reserved&&!voiceAssigned&&voiceCapable,
  reason
 };
}
