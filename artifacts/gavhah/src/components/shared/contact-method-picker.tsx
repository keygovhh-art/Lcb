import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/context/language-context";

export type ContactWay = "phone" | "email" | "sms";
export type ContactMethodsForm = {
  primaryMethod: ContactWay;
  primaryValue: string;
  backupMethod: ContactWay | null;
  backupValue: string | null;
  mayConsiderSharing: "" | "yes" | "no";
};
export const initialContactMethods = (): ContactMethodsForm => ({
  primaryMethod:"phone", primaryValue:"", backupMethod:null, backupValue:null,
  mayConsiderSharing:"",
});
const METHODS: ContactWay[] = ["phone","email","sms"];
export function ContactMethodPicker({value,onChange}:{
  value:ContactMethodsForm;onChange:(next:ContactMethodsForm)=>void
}) {
  const { lang } = useLanguage(), yi=lang==="yi";
  const label=(m:ContactWay)=>
    m==="phone"?(yi?"טעלעפאן־רוף":"Phone call"):
    m==="email"?(yi?"אימעיל":"Email"):(yi?"טעקסט־מעסעדזש (SMS)":"Text message (SMS)");
  const change=(patch:Partial<ContactMethodsForm>)=>onChange({...value,...patch});
  const field=(kind:"primary"|"backup")=>{
    const m=kind==="primary"?value.primaryMethod:value.backupMethod!;
    const v=kind==="primary"?value.primaryValue:value.backupValue||"";
    return <Input
      type={m==="email"?"email":"tel"}
      autoComplete={m==="email"?"email":"tel"}
      inputMode={m==="email"?"email":"tel"}
      maxLength={200}
      value={v}
      placeholder={m==="email"?"your@email.com":"+1 845 555 0100"}
      onChange={e=>change(kind==="primary"?{primaryValue:e.target.value}:{backupValue:e.target.value})}
      required
      className="h-11"
    />;
  };
  return <div className="border rounded-xl p-4 space-y-4 bg-muted/10">
    <div>
      <h3 className="font-semibold text-base text-primary">
        {yi?"וויאזוי קען מען זיך פארבינדן מיט דיר?":"How can we reach you?"}
      </h3>
      <p className="text-xs text-muted-foreground mt-1">
        {yi?"דער קאנטאקט ווערט געהאלטן פריוואט ביי גבהה. אנדערע באקומען נישט די פרטים אן דירעקטע רשות פון דיר, דער צווייטער צד און באשטעטיגונג פון דער מערכת.":
          "Your contact details stay private with Gavhah. Sharing requires staff approval and fresh explicit permission from both people for that specific introduction."}
      </p>
    </div>
    <div className="space-y-1.5">
      <Label>{yi?"הויפט־וועג — פארלאנגט":"Primary method — required"}</Label>
      <select value={value.primaryMethod} className="w-full h-11 rounded-md border px-3 bg-background"
        onChange={e=>{const primaryMethod=e.target.value as ContactWay;
          change({primaryMethod,primaryValue:"",...(primaryMethod===value.backupMethod?{backupMethod:null,backupValue:null}:{})});}}>
        {METHODS.map(m=><option key={m} value={m}>{label(m)}</option>)}
      </select>
      {field("primary")}
    </div>
    <div className="space-y-1.5">
      <Label>{yi?"בעק־אפ — אינגאנצן אפטיאָנעל":"Backup — completely optional"}</Label>
      <p className="text-xs text-muted-foreground">
        {yi?"דו קענסט עס לאזן ליידיג. אויב איינער קען נישט נוצן דיין הויפט־וועג, וועט די מערכת פריש באהאנדלען דעם פאל.":
          "You may leave this empty. If the other person cannot use your primary method, Gavhah will review a different route."}
      </p>
      <select value={value.backupMethod||"none"} className="w-full h-11 rounded-md border px-3 bg-background"
        onChange={e=>change({backupMethod:e.target.value==="none"?null:e.target.value as ContactWay,backupValue:null})}>
        <option value="none">{yi?"קיין בעק־אפ נישט":"No backup"}</option>
        {METHODS.filter(m=>m!==value.primaryMethod).map(m=><option key={m} value={m}>{label(m)}</option>)}
      </select>
      {value.backupMethod&&field("backup")}
    </div>
    <fieldset className="border rounded-lg p-3 space-y-2">
      <legend className="text-sm font-semibold px-1">
        {yi?"אויב די מערכת געפינט א פאסיגע פארבינדונג — מעג מען דיר בעטן רשות איבערצוגעבן דיינע פרטים?":"May Gavhah ask for your permission to share contact details for a suitable introduction?"}
      </legend>
      <label className="flex gap-2 items-start text-sm">
        <input type="radio" name="considerSharing" checked={value.mayConsiderSharing==="yes"}
          onChange={()=>change({mayConsiderSharing:"yes"})} className="mt-1"/>
        {yi?"יא, אבער נאר נאך מיין פערזענליכע באשטעטיגונג פאר יעדן פאל":"Yes — but only after my personal approval for each case"}
      </label>
      <label className="flex gap-2 items-start text-sm">
        <input type="radio" name="considerSharing" checked={value.mayConsiderSharing==="no"}
          onChange={()=>change({mayConsiderSharing:"no"})} className="mt-1"/>
        {yi?"ניין, נאר די מערכת זאל פארמיטלען. נישט איבערגעבן מיינע פרטים":"No — only Gavhah may mediate; do not disclose my details"}
      </label>
      <p className="text-xs text-muted-foreground">
        {yi?"מען מוז אויסקלייבן יא אדער ניין. די מערכת קען נישט מסכים זיין אנשטאט דיר. דו קענסט אליין געבן אדער צוריקנעמען רשות ביי יעדן ספעציפישן פאל.":
          "Please explicitly choose Yes or No. Administration cannot consent on your behalf; you decide again for each specific case."}
      </p>
    </fieldset>
  </div>;
}
