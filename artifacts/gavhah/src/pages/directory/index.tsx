import { Layout } from "@/components/layout/layout";

export default function Directory() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl font-bold text-primary mb-8">Activists Directory</h1>
        <p className="text-muted-foreground mb-8">Find volunteers and view active help requests.</p>
        <div className="p-12 text-center border rounded-lg bg-muted/20">
          <p className="font-serif italic text-muted-foreground">Directory features coming soon.</p>
        </div>
      </div>
    </Layout>
  );
}
