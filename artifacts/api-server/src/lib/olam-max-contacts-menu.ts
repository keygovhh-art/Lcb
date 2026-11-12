/** Shared MAX contact menus for both phone adapters.
 * '*' goes back, '#' advances; zero NEVER means back.
 * Root button can shift with joined-campaign menu; internal actions do not.
 */
export const contactsName="קאנטאקט'ס";
export const contactsMain=Object.freeze({
 "1":{action:"list",label:"צו הערן אלע קאנטאקטן"},
 "2":{action:"new_contact",label:"צו אריינלייגן א קאנטאקט"},
 "3":{action:"search",label:"צו זוכן א קאנטאקט"},
 "4":{action:"missed_incoming",label:"קאנטאקטן וועמענס רופן דו האסט פארפאסט"},
 "5":{action:"callable_now",label:"קאנטאקטן וואס מ'קען שוין רופן לויט זייער צייט"},
 "6":{action:"callback_donation",label:"קאנטאקטן וואס ווארטן אויף א צוריק־קאל פאר א נדבה"},
 "7":{action:"pledge_pending",label:"צוגעזאגטע אדער טיילווייז באצאלטע נדבות"},
 "8":{action:"warm",label:"ווארעמע קאנטאקטן"},
 "9":{action:"do_not_call",label:"קאנטאקטן וואס מען טאר נישט רופן"},
 "0":{action:"other_outcomes",label:"אנדערע קאל־רעזולטאטן"},
 "*":{action:"back",label:"צוריק"}
});
export const contactsOrder=Object.freeze({"1":"newest","2":"oldest","*":"back"});
export const contactsItemActions=Object.freeze({
 "1":"edit_contact","2":"all_call_statistics","3":"hide_contact","*":"back"
});
export const contactsEditFields=Object.freeze({
 "1":"all","2":"phone","3":"name","4":"postal_address",
 "5":"notes","6":"preferred_hours","7":"contact_role","8":"recontact_rule","9":"do_not_call","*":"back"
});
export const contactsSearchActions=Object.freeze({
 "1":"phone","2":"call_date","3":"contact_number","*":"back"
});
export const contactsDateModes=Object.freeze({"1":"hebrew","2":"gregorian","*":"back"});
export const contactsOtherOutcomes=Object.freeze({
 "1":"donation","2":"no_answer","3":"not_interested","4":"asked_no_more",
 "5":"pledge","6":"callback","7":"other","8":"unreported","9":"all_warmth","*":"back"
});
export const contactsWarmth=Object.freeze({
 "1":"very_warm","2":"very_generous","3":"warm","4":"generous","*":"back"
});
export const contactsAnyCategorySearch=Object.freeze({
 "1":"phone","2":"call_date","3":"contact_number","*":"back"
});
export const contactPolicy=Object.freeze({
 userScopedContactNumbersStartAt:1,
 autoCreateNamelessContactOnCall:true,
 inboundNeverAssumeLastPurpose:true,
 noAnswerIsNotUnreported:true,
 preserveAllPriorStatistics:true,
 repeatCallMayUseNewPurpose:true,
 skipPurposeMeansNull:true,
 categoryListAutoStarts:true,
 categorySearchKey:"1",
 backKey:"*",
 nextKey:"#",
 providerOutbound:"signalwire"
});
