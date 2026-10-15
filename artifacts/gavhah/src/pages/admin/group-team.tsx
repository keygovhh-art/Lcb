import {Link} from "wouter";
import {useAuth} from "@/context/auth-context";
import {Layout} from "@/components/layout/layout";
import {GroupPlatformManagement} from "@/components/admin/group-platform-management";
import {Button} from "@/components/ui/button";

export default function GroupTeamWorkspace(){
  const {user,isLoaded}=useAuth();
  const allowed=["group_staff","moderator","admin","super_admin"].includes(user?.role||"");
  return <Layout><main className="container max-w-5xl mx-auto px-4 py-8" dir="rtl">
    {!isLoaded?<p>לאדט...</p>
      :!user?<div className="space-y-4"><p>ביטע שרייב זיך איין אין דיין אקאונט.</p>
        <Link href="/login"><Button>אריינשרייבן</Button></Link></div>
      :!allowed?<div className="rounded-xl border p-5"><p>דאס איז נאר פאר גבהה־מערכת מעמבערס מיט ספעציעלע גרופ־רעכטן.</p></div>
      :<GroupPlatformManagement/>}
  </main></Layout>;
}
