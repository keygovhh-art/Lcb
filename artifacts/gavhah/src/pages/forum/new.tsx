import { useState } from "react";
import { useLocation } from "wouter";
import { useCreateDiscussion } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";
import { MemberGate } from "@/components/shared/member-gate";
import { DisplayAsSelector, type DisplayAs, getDisplayName } from "@/components/shared/display-as-selector";
import { useAuth } from "@/context/auth-context";

export default function ForumNew() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState("");
  const [displayAs, setDisplayAs] = useState<DisplayAs>("nickname");
  const createDiscussion = useCreateDiscussion();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    const authorName = getDisplayName(displayAs, user);
    createDiscussion.mutate(
      { data: { title, content, category: category.trim(), authorName } },
      {
        onSuccess: (disc) => {
          void qc.invalidateQueries({ queryKey: ["/api/discussions"] });
          toast({ title: "Discussion published", description: "Your discussion is now live." });
          navigate(`/forum/${disc.id}`);
        },
        onError: () => toast({
          title: "Could not publish discussion",
          description: "Please check the form and try again.",
          variant: "destructive",
        }),
      }
    );
  };

  return (
    <Layout>
      <div className="bg-muted/30 border-b">
        <div className="container mx-auto px-4 py-8">
          <Link href="/forum">
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-primary mb-4">
              <ArrowLeft className="h-4 w-4" /> Back to Forum
            </Button>
          </Link>
          <h1 className="font-serif text-4xl font-bold text-primary">Start a Discussion</h1>
          <p className="text-muted-foreground mt-2 font-serif italic">
            Share your question, idea, or topic with the community.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <MemberGate action="start a discussion">
          <div className="bg-card border rounded-xl p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="category" className="font-semibold text-foreground">Topic (optional) / טעמע (אפטשענעל)</Label>
                <Input
                  id="category"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="שרייב דיין אייגענע טעמע, אדער לאז ליידיג"
                  maxLength={100}
                  className="h-12 text-base"
                />
                <p className="text-xs text-muted-foreground">
                  Write any topic in your own words, or leave this blank. There are no preset categories.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="title" className="font-semibold text-foreground">Discussion Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="What would you like to discuss?"
                  className="h-12 text-base"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="content" className="font-semibold text-foreground">Your Message</Label>
                <Textarea
                  id="content"
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Provide details, context, and what kind of input you are looking for from the community..."
                  className="min-h-48 text-base resize-none"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Please maintain a respectful tone. All content is subject to community guidelines.
                </p>
              </div>

              <DisplayAsSelector value={displayAs} onChange={setDisplayAs} />

              <div className="flex gap-4 justify-end pt-4 border-t">
                <Link href="/forum">
                  <Button type="button" variant="outline" className="px-8">Cancel</Button>
                </Link>
                <Button
                  type="submit"
                  className="bg-secondary hover:bg-secondary/90 text-white px-8"
                  disabled={createDiscussion.isPending || !title.trim() || !content.trim()}
                >
                  {createDiscussion.isPending ? "Posting..." : "Post Discussion"}
                </Button>
              </div>
            </form>
          </div>
        </MemberGate>

        <div className="mt-8 p-6 bg-accent/5 border border-accent/20 rounded-xl">
          <h3 className="font-serif font-bold text-primary mb-2">Community Guidelines</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>Maintain respectful, Torah-appropriate language at all times</li>
            <li>Do not share personal contact information publicly</li>
            <li>Keep discussions focused and relevant to the community</li>
            <li>Report inappropriate content using the report button</li>
          </ul>
        </div>
      </div>
    </Layout>
  );
}
