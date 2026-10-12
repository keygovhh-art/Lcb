import { useEffect, useState } from "react";
import { Link } from "wouter";
import { UserRound, Users, Plus, Trash2, ShieldCheck, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useAuth, type LinkedAccount } from "@/context/auth-context";
import { useLanguage } from "@/context/language-context";

function accountName(account:LinkedAccount) {
  return account.nickname || account.name || `#${account.id}`;
}

/**
 * The active identity is set only by the verified server session.
 * Passwords are used solely for an explicit add-account request and are never
 * written to localStorage, a cookie or a persisted account list.
 */
export function AccountSwitcher({compact=false,open:controlledOpen,onOpenChange,hideTrigger=false}:{compact?:boolean;open?:boolean;onOpenChange?:(open:boolean)=>void;hideTrigger?:boolean}){
  const {user,accounts,loadAccounts,addAccount,switchAccount,removeAccount}=useAuth();
  const {lang}=useLanguage(),yi=lang==="yi";
  const [localOpen,setLocalOpen]=useState(false);
  const open=controlledOpen??localOpen;
  const setOpen=(value:boolean)=>{if(onOpenChange)onOpenChange(value);else setLocalOpen(value);};
  const [addOpen,setAddOpen]=useState(false);
  const [identifier,setIdentifier]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  useEffect(()=>{if(open)void loadAccounts();},[open,loadAccounts]);
  if(!user)return null;
  const list=accounts.length?accounts:[{id:user.id,nickname:user.nickname,name:user.name,role:user.role,active:true}];
  const handleAdd=async(e:React.FormEvent)=>{
    e.preventDefault();setError("");setMessage("");setBusy(true);
    try{
      const result=await addAccount(identifier.trim(),password);
      setPassword("");
      if(!result.ok){setError(result.error||"Could not add this account");return;}
      setIdentifier("");setAddOpen(false);
      setMessage(yi?"דער אקאונט איז פארבונדן. קלייב אויס וועלכן דו ווילסט יעצט נוצן.":
        "Account verified and added. Choose which account to use.");
    }finally{setBusy(false);}
  };
  const handleSwitch=async(id:number)=>{
    if(id===user.id){setOpen(false);return;}
    setBusy(true);setError("");
    const result=await switchAccount(id);
    if(!result.ok){setError(result.error||"Unable to switch accounts");setBusy(false);}
  };
  const handleRemove=async(id:number)=>{
    setBusy(true);setError("");
    const result=await removeAccount(id);
    if(!result.ok)setError(result.error||"Could not remove account");
    setBusy(false);
  };
  return <Dialog open={open} onOpenChange={setOpen}>
    {!hideTrigger&&<DialogTrigger asChild>
      <Button type="button" size={compact?"sm":"default"} variant="outline"
        className="gap-2 max-w-full" aria-label={yi?"טויש אקאונט":"Switch account"}>
        <Users className="h-4 w-4"/>
        {compact?(yi?"טויש אקאונט":"Switch Account"):(yi?"אקאונט אויסוואל":"Manage / Switch Accounts")}
      </Button>
    </DialogTrigger>}
    <DialogContent className="w-[calc(100vw-2rem)] max-w-md max-h-[86dvh] overflow-y-auto"
      dir={yi?"rtl":"ltr"}>
      <DialogHeader>
        <DialogTitle>{yi?"וועלכן אקאונט ווילסטו נוצן?":"Select your account"}</DialogTitle>
        <DialogDescription>
          {yi?"יעדע אקאונט ווערט באזונדער באשטעטיגט. נאר דער יעצט אויסגעקליבענער אקאונט קען שרייבן, פאסטן אדער בעטן הילף.":
            "Each account is verified separately. Only the active account makes posts, requests or staff changes."}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2" role="list">
        {list.map(account=><div key={account.id} role="listitem"
          className={`border rounded-xl p-3 flex items-center justify-between gap-2 ${account.id===user.id?"border-primary bg-primary/5":"bg-card"}`}>
          <div className="min-w-0 flex items-center gap-2">
            <UserRound className="h-5 w-5 shrink-0 text-primary"/>
            <div className="min-w-0">
              <p className="font-semibold truncate" dir="auto">{accountName(account)}</p>
              {account.id===user.id?<span className="text-xs text-primary flex items-center gap-1">
                <Check className="h-3 w-3"/>{yi?"איצט אקטיוו":"Currently active"}
              </span>:<span className="text-xs text-muted-foreground">{yi?"באשטעטיגטער אקאונט":"Verified account"}</span>}
            </div>
          </div>
          {account.id!==user.id&&<div className="flex items-center gap-1 shrink-0">
            <Button type="button" size="sm" disabled={busy} onClick={()=>void handleSwitch(account.id)}>
              {yi?"נוץ דעם":"Use"}
            </Button>
            <Button type="button" size="icon" variant="ghost" disabled={busy}
              aria-label={yi?"נעם אראפ פון אויסוואל":"Remove from chooser"}
              onClick={()=>void handleRemove(account.id)}>
              <Trash2 className="h-4 w-4"/>
            </Button>
          </div>}
        </div>)}
      </div>
      {message&&<p role="status" className="text-sm rounded-md border p-2">{message}</p>}
      {error&&<p role="alert" className="text-sm text-destructive border border-destructive/30 rounded-md p-2">{error}</p>}
      {!addOpen?<Button type="button" variant="outline" className="w-full gap-2"
        disabled={busy||list.length>=8} onClick={()=>setAddOpen(true)}>
        <Plus className="h-4 w-4"/>{yi?"לייג צו נאך אן אקאונט":"Add an existing account"}
      </Button>:<form onSubmit={e=>void handleAdd(e)} className="border rounded-lg p-3 space-y-3">
        <p className="text-sm font-semibold">{yi?"באשטעטיג דעם צווייטן אקאונט איינמאל":"Verify the additional account once"}</p>
        <Input value={identifier} onChange={e=>setIdentifier(e.target.value)}
          autoComplete="username" placeholder={yi?"אימעיל אדער טעלעפאן":"Email or phone"} required/>
        <Input value={password} onChange={e=>setPassword(e.target.value)}
          autoComplete="current-password" placeholder={yi?"פעסווארד":"Password"} type="password" required/>
        <div className="flex gap-2 flex-wrap">
          <Button type="submit" disabled={busy||!identifier.trim()||!password}>
            <ShieldCheck className="h-4 w-4"/>{yi?"באשטעטיג און לייג צו":"Verify and add"}
          </Button>
          <Button type="button" variant="outline" onClick={()=>{setAddOpen(false);setPassword("");setError("");}}>
            {yi?"קענסל":"Cancel"}
          </Button>
        </div>
      </form>}
      <p className="text-xs text-muted-foreground">
        {yi?"די פעסווארדס ווערן נישט אפגעהיטן אינעם בראוזער. אויב די סעסיע ענדיגט זיך, דארף מען זיך ווידער איינלאגן.":
          "Passwords are never saved by Gavhah's account switcher. After session expiry, accounts must be verified again."}
      </p>
      <Link href="/register" onClick={()=>setOpen(false)} className="text-sm underline text-primary">
        {yi?"עפן א נייעם אקאונט":"Register a new account"}
      </Link>
    </DialogContent>
  </Dialog>;
}

/** Identity field for every member-owned action: never a selectable text input. */
export function ActiveAccountIdentity({label}:{label?:string}){
  const {user}=useAuth();
  const {lang}=useLanguage(),yi=lang==="yi";
  if(!user)return null;
  return <div className="space-y-2">
    <p className="text-sm font-semibold">{label || (yi?"וועלכער אקאונט?":"Posting as account")}</p>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 p-3">
      <span className="min-w-0 font-semibold break-words" dir="auto">{user.nickname||user.name}</span>
      <AccountSwitcher compact />
    </div>
    <p className="text-xs text-muted-foreground">{yi?"דער נאמען קומט פונעם איינגעשריבענעם אקאונט. צו נוצן אן אנדערן, דרוק „טויש אקאונט“.":
      "This identity belongs to your signed-in account, not an editable name field."}</p>
  </div>;
}
