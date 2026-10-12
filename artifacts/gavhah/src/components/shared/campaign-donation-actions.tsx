import { useState } from "react";
import { Copy, ExternalLink, Heart, PhoneCall } from "lucide-react";
import { useLanguage } from "@/context/language-context";

export type CampaignDonationSettings = {
  phoneNumber?: string | null;
  phoneExtension?: string | null;
  phoneButtonText?: string | null;
  donationUrl?: string | null;
  linkButtonText?: string | null;
  buttonStyle?: string | null;
  buttonLayout?: string | null;
};

const designs: Record<string, string> = {
  classic: "bg-primary text-primary-foreground hover:opacity-90 border-primary",
  gold: "bg-amber-500 text-slate-950 hover:bg-amber-400 border-amber-500",
  soft: "bg-primary/10 text-primary hover:bg-primary/15 border-primary/20",
  outline: "bg-transparent text-primary hover:bg-primary/5 border-primary/40",
};

export function donationPhoneHref(phone: string, extension?: string | null): string | null {
  const main = phone.trim().replace(/[\s().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(main)) return null;
  if (!extension) return `tel:${main}`;
  const ext = extension.trim().replace(/\s+/g, "");
  if (!/^[#*]?\d{1,12}$/.test(ext)) return null;
  // Two dialer pauses and encoded DTMF extension. Not every mobile dialer
  // supports post-dial sequences, so always show a copyable extension too.
  return `tel:${main},,${encodeURIComponent(ext)}`;
}

export function safeDonationLink(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname ||
        url.hostname === "localhost" || url.hostname.endsWith(".local")) return null;
    return url.href;
  } catch { return null; }
}

export function CampaignDonationActions({ campaign, compact = false }: {
  campaign: CampaignDonationSettings; compact?: boolean;
}) {
  const { lang } = useLanguage();
  const yi = lang === "yi";
  const [copied, setCopied] = useState(false);
  const phone = campaign.phoneNumber ? donationPhoneHref(campaign.phoneNumber, campaign.phoneExtension) : null;
  const link = safeDonationLink(campaign.donationUrl);
  const style = designs[campaign.buttonStyle || "classic"] || designs.classic;
  const inline = campaign.buttonLayout === "inline";
  const buttonClass = `min-h-12 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 border shadow-sm font-semibold text-center transition-colors break-words ${style}`;
  const copyExtension = async () => {
    if (!campaign.phoneExtension) return;
    try {
      await navigator.clipboard.writeText(campaign.phoneExtension);
      setCopied(true);
    } catch { setCopied(false); }
  };
  return <div className="w-full space-y-2" dir={yi ? "rtl" : "ltr"}>
    {(phone || link) ? (
      <>
        <div className={`grid gap-2 ${inline && !compact ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          {phone && <a className={buttonClass} href={phone} aria-label={campaign.phoneButtonText || (yi ? "גיב א נדבה אויפן טעלעפאן" : "Donate by Phone")}>
            <PhoneCall className="h-5 w-5 shrink-0" />
            <span>{campaign.phoneButtonText || (yi ? "נדבה אויפן טעלעפאן" : "Donate by Phone")}</span>
          </a>}
          {link && <a className={buttonClass} href={link} rel="noreferrer" referrerPolicy="no-referrer" aria-label={campaign.linkButtonText || (yi ? "גיב א נדבה אנליין" : "Donate Online")}>
            <Heart className="h-5 w-5 shrink-0" />
            <span>{campaign.linkButtonText || (yi ? "גיב א נדבה אנליין" : "Donate Online")}</span>
            <ExternalLink className="h-4 w-4 shrink-0 opacity-75" />
          </a>}
        </div>
        {phone && <div className="text-center text-xs text-muted-foreground">
          <span dir="ltr" className="font-semibold">{campaign.phoneNumber}{campaign.phoneExtension ? ` · ${campaign.phoneExtension}` : ""}</span>
          {campaign.phoneExtension && <>
            <button type="button" onClick={() => void copyExtension()}
              className="inline-flex items-center gap-1 underline ms-2 text-primary min-h-8">
              <Copy className="h-3 w-3"/>{copied ? (yi ? "קאפירט" : "Copied") : (yi ? "קאפיר עקסטענשאן" : "Copy extension")}
            </button>
            <p className="text-[11px] mt-1">{yi ?
              "אויב דער טעלעפאן לייגט נישט אויטאמאטיש אריין דעם עקסטענשאן, דרוק אים אריין ביים רופן." :
              "If your dialer does not send the extension automatically, enter it during the call."}</p>
          </>}
        </div>}
        {link && <p className="text-[11px] text-center text-muted-foreground">
          {yi ? "דער קנעפל פירט צו אן אויסערליכן נדבה־וועבזייטל." : "The link opens an external donation website."}
        </p>}
      </>
    ) : (
      <div className="w-full rounded-xl border border-dashed bg-muted/20 p-3 text-center text-sm text-muted-foreground">
        <Heart className="h-5 w-5 mx-auto mb-1 opacity-60" />
        {yi ? "אצינד איז נאך נישט פארבונדן קיין נדבה־וועג." : "Donation options are not connected for this campaign yet."}
      </div>
    )}
  </div>;
}
