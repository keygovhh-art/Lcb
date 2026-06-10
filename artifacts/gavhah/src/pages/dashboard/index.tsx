import { Layout } from "@/components/layout/layout";

export default function Dashboard() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl font-bold text-primary mb-8">Community Dashboard</h1>
        <p className="text-muted-foreground mb-8">Overview of platform statistics and activity.</p>
        <div className="p-12 text-center border rounded-lg bg-muted/20">
          <p className="font-serif italic text-muted-foreground">Dashboard features coming soon.</p>
        </div>
      </div>
    </Layout>
  );
}
