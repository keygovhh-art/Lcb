import { Layout } from "@/components/layout/layout";

export default function TermsPage() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="font-serif text-4xl font-bold text-primary mb-3">Community Terms</h1>
        <p className="text-sm text-muted-foreground mb-8">Basic rules for using the Gavhah community platform.</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-7">
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Use the platform responsibly</h2>
            <p>Use Gavhah for lawful community, chesed, coordination, discussion, and informational purposes. Do not use the service for harassment, impersonation, spam, fraud, unauthorized access, or harmful or illegal activity.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Your content</h2>
            <p>Only publish material you are permitted to share. You remain responsible for the accuracy and appropriateness of content you submit. Content may be reported and reviewed by platform moderators.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Moderation</h2>
            <p>Administrators and moderators may review reports, reject pending public listings, suspend or ban accounts, and remove or update content when necessary to protect the community or operate the service.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Charity and pledges</h2>
            <p>Online card and bank payments are not currently processed by this website. Amounts displayed as recorded donations may reflect verified offline donations entered by administrators, while amounts on United In Kindness may reflect supporter pledges. A pledge is not the same as a completed payment.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Availability</h2>
            <p>Features may change, be moderated, or be temporarily unavailable. Information on the platform is provided for community coordination and should not be treated as a substitute for professional legal, medical, financial, or emergency services.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Questions</h2>
            <p>Use Contact & Support in the System Center for questions about the platform, these terms, or an account.</p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
