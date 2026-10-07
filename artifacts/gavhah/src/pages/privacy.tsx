import { Layout } from "@/components/layout/layout";

export default function PrivacyPage() {
  return (
    <Layout>
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <h1 className="font-serif text-4xl font-bold text-primary mb-3">Privacy</h1>
        <p className="text-sm text-muted-foreground mb-8">How Gavhah handles information used to operate the community platform.</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-7">
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Information you provide</h2>
            <p>Gavhah stores the account and profile information you choose to provide, such as your name, public nickname, email or phone number, location, bio, and password hash. Passwords are not stored as readable text.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Community content</h2>
            <p>Posts, comments, public groups, news, volunteer profiles, approved minyans, public projects, and other content you publish may be visible to other visitors. Private Askanus cases, private group posts, private help-request contact information, and pending moderated submissions are restricted by the platform's access rules.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Operational data</h2>
            <p>The platform uses session records so you can remain signed in, and stores notifications, moderation reports, support messages, reservation records, and activity needed to provide the features you use.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Payments and communications</h2>
            <p>Gavhah does not currently collect card or bank payment details through this website. Donation totals may include verified offline donations or supporter pledges. Phone, SMS, voicemail, and email-delivery providers are not currently connected; website notifications are stored inside the platform.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Service providers</h2>
            <p>The platform relies on infrastructure providers to host the application and database. Information is processed only as needed to operate, secure, and maintain the service.</p>
          </section>
          <section>
            <h2 className="font-serif text-xl font-bold text-primary">Your choices</h2>
            <p>You can edit supported profile fields and change your password from My Profile. For account, content, or privacy requests that are not available directly in the interface, use Contact & Support in the System Center.</p>
          </section>
        </div>
      </div>
    </Layout>
  );
}
