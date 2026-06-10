import { Layout } from "@/components/layout/layout";

export default function Minyans() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl font-bold text-primary mb-8">Minyan Center</h1>
        <p className="text-muted-foreground mb-8">Find local minyanim and prayer times.</p>
        <div className="p-12 text-center border rounded-lg bg-muted/20">
          <p className="font-serif italic text-muted-foreground">Minyans features coming soon.</p>
        </div>
      </div>
    </Layout>
  );
}
