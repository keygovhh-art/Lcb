import {useEffect,useState} from "react";
import {Link} from "wouter";
import {useAuth} from "@/context/auth-context";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {useToast} from "@/hooks/use-toast";
import {Shield,Users,Lock,RefreshCw,ExternalLink,Eye,CheckCircle,History,Search} from "lucide-react";

type PlatformGroup={
  id:number;name:string;description:string;privacy:string;ownerId:number;
  memberCount:number;postCount:number;platformFeatureOverrides:Record<string,boolean>;
  access:{canViewPrivate:boolean;canModerate:boolean};
};
type Member={id:number;userId:number;userName:string;role:string;status:string;protectedByPlatform:boolean};
type User={id:number;name:string;nickname:string|null;role:string;status:string};
type StaffGrant={userId:number;canViewPrivate:boolean;canModerate:boolean;grantedBy:number};
type GroupPost={id:number;authorName:string;content:string;moderationStatus:string;
  createdAt:string;views:number;isPinned:boolean};
type Audit={id:number;actorId:number;targetUserId:number|null;groupId:number|null;
  action:string;details:Record<string,unknown>;createdAt:string};
const publicKeys=[
  ["allowReplies","דערלויבן רעפלייען"],
  ["replyApproval","ערשט אדמין־רעוויאו אויף רעפלייען"],
  ["postApproval","ערשט אדמין־רעוויאו אויף פאוסטס"],
  ["membersCanPost","מעמבערס מעגן פאוסטן"],
  ["membersCanReply","מעמבערס מעגן רעפלייען"],
  ["showViewCounts","וויאו־ציילער"],
  ["allowDownvotes","דאונוואוטס"],
] as const;
const memberKeys=[
  ["joinGroup","ערלויבן זיך אנשליסן"],["upvotePosts","אפוואוטס"],
  ["reportPosts","רעפארטן פאוסטס"],["editOwnPosts","עדיטן אייגענע פאוסטס"],
  ["deleteOwnPosts","דעליטן אייגענע פאוסטס"],
  ["deleteOwnReplies","דעליטן אייגענע רעפלייען"],
] as const;
const adminKeys=[
  ["manageGroupInfo","עדיטן גרופ־אינפארמאציע"],
  ["manageGroupSettings","ענדערן גרופ־סעטינגס"],
  ["deleteGroup","אויסמעקן גרופ"],
  ["approveMembers","אפראווען מעמבערס"],
  ["removeMembers","ארויסווארפן מעמבערס"],
  ["suspendMembers","סוספענדירן מעמבערס"],
  ["restoreMembers","צוריק אקטיווירן מעמבערס"],
  ["manageAdmins","מאכן אדער אראפנעמען גרופ־אדמינס"],
  ["moderatePosts","אדמין־רעוויאו פון פאוסטס"],
  ["editOthersPosts","עדיטן אנדערע פאוסטס"],
  ["deleteOthersPosts","אויסמעקן אנדערע פאוסטס"],
  ["pinPosts","פינען פאוסטס"],
  ["lockReplies","פארשפארן רעפלייען"],
  ["moderateReplies","רעוויאו פון רעפלייען"],
  ["deleteOthersReplies","אויסמעקן אנדערע רעפלייען"],
  ["viewGroupReports","זען גרופ־רעפארטס"],
  ["resolveGroupReports","פארענדיגן רעפארטס"],
] as const;

export function GroupPlatformManagement(){
  const {user}=useAuth();
  const {toast}=useToast();
  const isSuper=user?.role==="super_admin";
  const [groups,setGroups]=useState<PlatformGroup[]>([]);
  const [selected,setSelected]=useState<number|null>(null);
  const [members,setMembers]=useState<Member[]>([]);
  const [posts,setPosts]=useState<GroupPost[]>([]);
  const [postsPage,setPostsPage]=useState(1);
  const [hasMorePosts,setHasMorePosts]=useState(false);
  const [grants,setGrants]=useState<StaffGrant[]>([]);
  const [audit,setAudit]=useState<Audit[]>([]);
  const [search,setSearch]=useState("");
  const [users,setUsers]=useState<User[]>([]);
  const [grantUser,setGrantUser]=useState<number|null>(null);
  const [grantView,setGrantView]=useState(false);
  const [grantModerate,setGrantModerate]=useState(false);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(false);
  const [category,setCategory]=useState<"posts"|"features"|"members"|"rights"|"audit">("posts");
  const [error,setError]=useState("");
  const [draftOverrides,setDraftOverrides]=useState<Record<string,boolean>>({});
  const [roleChoice,setRoleChoice]=useState("group_staff");
  const [selectedUser,setSelectedUser]=useState<User|null>(null);

  const get=async<T,>(url:string):Promise<T>=>{
    const res=await fetch(url,{credentials:"include",cache:"no-store"});
    if(!res.ok)throw Error(`${res.status}: ${(await res.json().catch(()=>({}))).error||"Cannot load"}`);
    return res.json() as Promise<T>;
  };
  const send=async(url:string,body:unknown)=>{
    setBusy(true);
    try{
      const res=await fetch(url,{method:"PATCH",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
      const value=await res.json().catch(()=>({}));
      if(!res.ok)throw Error(value.error||"Not permitted");
      toast({title:"אפגעהיטן",description:"די רעכטן זענען אפדעיטעד"});
      return true;
    }catch(e){toast({title:"נישט געלונגען",description:String(e),variant:"destructive"});return false;}
    finally{setBusy(false);}
  };
  const reload=async()=>{
    setLoading(true);
    try{
      const all=await get<PlatformGroup[]>("/api/admin/group-control/groups");
      setGroups(all);setError("");
      if(selected!==null&&!all.some(g=>g.id===selected))setSelected(null);
    }catch(e){setError(String(e));}
    finally{setLoading(false);}
  };
  const refreshSelected=async(id:number)=>{
    try{
      const [p,m]=await Promise.all([
        get<{posts:GroupPost[];hasMore:boolean}>(`/api/admin/group-control/groups/${id}/posts?page=0`),
        get<Member[]>(`/api/admin/group-control/groups/${id}/members`),
      ]);
      setPosts(p.posts);setHasMorePosts(p.hasMore);setPostsPage(1);setMembers(m);
      if(isSuper){
        const s=await get<StaffGrant[]>(`/api/admin/group-control/groups/${id}/staff`);
        setGrants(s);
      }
      setError("");
    }catch(e){setError(String(e));}
  };
  useEffect(()=>{void reload();},[user?.id]);
  useEffect(()=>{
    if(selected!==null)void refreshSelected(selected);
  },[selected,user?.id]);
  useEffect(()=>{
    if(!isSuper||search.trim().length<2){setUsers([]);return;}
    const run=async()=>{try{setUsers(await get<User[]>(`/api/admin/group-control/users?search=${encodeURIComponent(search.trim())}`));}catch{}};
    void run();
  },[search,isSuper]);
  useEffect(()=>{if(!isSuper||category!=="audit")return;
    void get<Audit[]>("/api/admin/group-control/audit").then(setAudit).catch(e=>setError(String(e)));
  },[isSuper,category]);

  const group=groups.find(g=>g.id===selected);
  const changeOverride=async(key:string,v:string)=>{
    if(!selected)return;
    const value=v==="default"?null:v==="on";
    const ok=await send(`/api/admin/group-control/groups/${selected}/overrides`,{overrides:{[key]:value}});
    if(ok){await reload();setDraftOverrides(prev=>({...prev,[key]:value===null?false:value}));}
  };
  const loadMorePosts=async()=>{
    if(!selected||!hasMorePosts)return;
    try{
      const p=await get<{posts:GroupPost[];hasMore:boolean}>(`/api/admin/group-control/groups/${selected}/posts?page=${postsPage}`);
      setPosts(old=>[...old,...p.posts]);setPostsPage(postsPage+1);setHasMorePosts(p.hasMore);
    }catch(e){setError(String(e));}
  };
  const setProtect=async(member:Member)=>{
    if(!selected||!isSuper)return;
    if(!window.confirm(member.protectedByPlatform?"אוועקנעמען גבהה־שוץ?":"באשיצן דעם מעמבער פון גרופ־אדמינס?"))return;
    if(await send(`/api/admin/group-control/groups/${selected}/members/${member.id}/protection`,
      {protected:!member.protectedByPlatform}))await refreshSelected(selected);
  };
  const setRole=async()=>{
    if(!selectedUser||!isSuper)return;
    if(!window.confirm(`אמת'דיג געבן ${selectedUser.name} דעם ראלע ${roleChoice}? גרעסערע ראלעס האבן אויך רעכטן אין אנדערע אפטיילונגען.`))return;
    const ok=await send(`/api/admin/group-control/users/${selectedUser.id}/role`,{role:roleChoice});
    if(ok){setSelectedUser(null);setSearch("");}
  };
  const saveGrant=async()=>{
    if(!selected||!grantUser)return;
    const ok=await send(`/api/admin/group-control/groups/${selected}/staff/${grantUser}`,
      {canViewPrivate:grantView,canModerate:grantModerate});
    if(ok)await refreshSelected(selected);
  };

  return <section className="space-y-5" dir="rtl">
    <div className="flex flex-wrap justify-between items-center gap-3">
      <div><h2 className="font-serif font-bold text-2xl flex items-center gap-2"><Shield className="h-5 w-5"/> גבהה־גרופ־פארוואלטונג</h2>
        <p className="text-sm text-muted-foreground">אלע פאוסטס, מעמבער־שוץ און פארגעשריטענע גרופ־רעכטן — מיט פריוואטקייט און באזונדערע ערלויבענישן.</p></div>
      <Button variant="outline" disabled={loading} onClick={()=>void reload()}><RefreshCw className="w-4 h-4 me-2"/>דערפרישן</Button>
    </div>
    {error&&<p className="rounded-lg border p-3 text-sm text-destructive">{error}</p>}
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <p className="font-semibold text-sm">אויסקלייבן א גרופ</p>
      <select className="w-full rounded-lg border p-3 min-h-11 bg-background" value={selected??""}
        onChange={e=>{setSelected(e.target.value?Number(e.target.value):null);setCategory("posts");}}>
        <option value="">אויסקלייבן...</option>
        {groups.map(g=><option key={g.id} value={g.id}>{g.name} — {g.privacy==="private"?"פריוואט":"עפנטליך"}</option>)}
      </select>
      {!isSuper&&<p className="text-xs text-muted-foreground">דו זעסט נאר גרופעס וואס דער סופער־אדמין האט דיר באזונדער ערלויבט.</p>}
    </div>
    {group&&<div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2 items-center">
        <div><strong className="text-lg">{group.name}</strong>
          <p className="text-xs text-muted-foreground">{group.memberCount} מעמבערס · {group.postCount} פאוסטס</p></div>
        <Link href={`/groups/${group.id}`}><Button variant="outline" className="gap-1"><ExternalLink className="w-4 h-4"/>עפענען גרופ</Button></Link>
      </div>
      <div className="flex gap-2 flex-wrap">
        {(["posts","members","features","rights","audit"] as const).filter(k=>
          isSuper||k==="posts"||k==="members").map(k=><Button key={k} size="sm"
          variant={category===k?"default":"outline"}
          onClick={()=>setCategory(k)}>{({posts:"אלע פאוסטס",members:"מעמבערס",features:"יעדע פיטשער",rights:"אדמין־רעכטן",audit:"אדמין־היסטאריע"})[k]}</Button>)}
      </div>
      {category==="posts"&&<div className="space-y-3">
        <h3 className="font-semibold">פאוסטס פון דער גרופ ({posts.length})</h3>
        {posts.map(p=><article key={p.id} className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex justify-between gap-2 text-xs text-muted-foreground">
            <strong>{p.authorName}</strong><span>{p.moderationStatus}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap break-words">{p.content}</p>
          <div className="flex justify-between items-center gap-2">
            <span className="text-xs text-muted-foreground"><Eye className="w-3 h-3 inline"/> {p.views} וויאוס</span>
            <Link href={`/groups/${group.id}#group-post-${p.id}`}><Button variant="outline" size="sm">עפענען אינעם גרופ־פאוסט</Button></Link>
          </div>
        </article>)}
        {!posts.length&&<p className="text-sm text-muted-foreground">נישטא קיין פאוסטס צו ווייזן.</p>}
        {hasMorePosts&&<Button variant="outline" onClick={()=>void loadMorePosts()}>ווייז נאך פאוסטס</Button>}
      </div>}
      {category==="members"&&<div className="space-y-3">
        <h3 className="font-semibold">מעמבערס ({members.length})</h3>
        {members.map(m=><div key={m.id} className="border rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
          <div><strong>{m.userName}</strong><p className="text-xs text-muted-foreground">{m.role} · {m.status}
            {m.protectedByPlatform?" · גבהה־באשיצט":""}</p></div>
          {isSuper&&<Button size="sm" variant={m.protectedByPlatform?"secondary":"outline"} disabled={busy}
            onClick={()=>void setProtect(m)}>{m.protectedByPlatform?"אוועקנעמען שוץ":"באשיצן דעם מעמבער"}</Button>}
        </div>)}
      </div>}
      {category==="features"&&isSuper&&<div className="space-y-5">
        <p className="text-sm text-muted-foreground">יעדער פיטשער איז באזונדער. „נאר גרופ“ = גרופ־אדמין קאנטראל; „יא“ = גבהה צינדט אן; „ניין“ = גבהה שפארט אפ.</p>
        {([["גרופ־סעטינגס",publicKeys],["מעמבער־פונקציעס",memberKeys],["אדמין־מעגליכקייטן",adminKeys]] as const).map(([heading,keys])=><div key={heading} className="space-y-2">
          <h3 className="font-semibold">{heading}</h3>
          {keys.map(([key,label])=><div key={key} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-medium">{label}</span>
            <select className="p-2 border rounded-lg bg-background min-h-10 text-sm"
              disabled={busy}
              value={group.platformFeatureOverrides?.[key]===undefined?"default":group.platformFeatureOverrides[key]?"on":"off"}
              onChange={e=>void changeOverride(key,e.target.value)}>
              <option value="default">נאר גרופ</option>
              <option value="on">יא — גבהה</option>
              <option value="off">ניין — גבהה</option>
            </select>
          </div>)}
        </div>)}
      </div>}
      {category==="rights"&&isSuper&&<div className="space-y-5">
        <div className="border rounded-xl bg-muted/10 p-4 space-y-3">
          <h3 className="font-semibold">אדמין־רעכטן צוטיילן</h3>
          <p className="text-sm text-muted-foreground">ערשט מאך דעם מענטש א „גרופ־מערכת־העלפער“, אדער טויש זיין שטאפל. געווענליכע גבהה־אדמינס און מאדערעיטערס האבן אויך אלטע מערכת־רעכטן — ניצן נאר פאר ווער דו געטרויסט פולשטענדיג.</p>
          <div className="flex flex-wrap gap-2 items-center">
            <Search className="w-4 h-4 text-muted-foreground"/>
            <Input placeholder="זוך א מעמבער לויט נאמען אדער ID..." value={search}
              onChange={e=>setSearch(e.target.value)} className="flex-1 min-w-40"/>
          </div>
          {users.map(u=><Button key={u.id} size="sm" variant={selectedUser?.id===u.id?"secondary":"outline"}
            onClick={()=>{setSelectedUser(u);setRoleChoice(u.role==="super_admin"?"member":u.role);setGrantUser(u.id);}}>
            {u.name} (#{u.id}, {u.role})
          </Button>)}
          {selectedUser&&<div className="space-y-2 rounded-lg border p-3">
            <p className="font-semibold">{selectedUser.name} — יעצט: {selectedUser.role}</p>
            <select className="w-full border rounded-lg p-3 bg-background"
              value={roleChoice} onChange={e=>setRoleChoice(e.target.value)}>
              <option value="member">נאר מעמבער</option>
              <option value="group_staff">גרופ־מערכת־העלפער (באגרעניצט)</option>
              <option value="moderator">מערכת־מאדערעיטער (ברייטערע רעכטן)</option>
              <option value="admin">מערכת־אדמין (ברייטערע רעכטן)</option>
            </select>
            <Button disabled={busy||selectedUser.role==="super_admin"} onClick={()=>void setRole()}>באשטעטיגן נייע שטאפל</Button>
          </div>}
        </div>
        <div className="border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold">ערלויבן צוטריט צו דער אויסגעקליבענער גרופ</h3>
          <p className="text-xs text-muted-foreground">דאס ארבעט אויך ביי פריוואטע גרופעס. בלויז דער סופער־אדמין קען עס ערלויבן. צוטריט ווערט רעקארדירט.</p>
          <Input placeholder="מעמבער־ID" type="number" value={grantUser??""}
            onChange={e=>setGrantUser(e.target.value?Number(e.target.value):null)}/>
          <label className="flex gap-2"><input type="checkbox" checked={grantView}
            onChange={e=>{setGrantView(e.target.checked);if(!e.target.checked)setGrantModerate(false);}}/> מעג זען פריוואטע אינהאלט</label>
          <label className="flex gap-2"><input type="checkbox" checked={grantModerate}
            onChange={e=>{setGrantModerate(e.target.checked);if(e.target.checked)setGrantView(true);}}/> מעג אויך מאדערירן</label>
          <Button disabled={busy||!grantUser} onClick={()=>void saveGrant()}>היט אפ דערלויבעניש</Button>
          <h4 className="font-semibold text-sm">די שוין צוגעטיילטע רעכטן</h4>
          {grants.map(g=><div key={g.userId} className="border rounded-lg p-2 flex justify-between items-center gap-2">
            <span className="text-xs">מעמבער #{g.userId} · {g.canViewPrivate?"מעג זען":""} {g.canModerate?"· מאדערירן":""}</span>
            <Button variant="outline" size="sm" disabled={busy} onClick={()=>{
              setGrantUser(g.userId);setGrantView(false);setGrantModerate(false);
            }}>אויסקלייבן פאר אפטיילן</Button>
          </div>)}
        </div>
      </div>}
      {category==="audit"&&isSuper&&<div className="space-y-2">
        <h3 className="font-semibold">לעצטע אדמין־אקציעס</h3>
        {audit.map(a=><p key={a.id} className="text-xs border rounded-lg p-3">
          {a.action} · אדמין #{a.actorId} · גרופ #{a.groupId??"—"} · {new Date(a.createdAt).toLocaleString()}
        </p>)}
      </div>}
    </div>}
  </section>;
}
