import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadImageFile } from "@/lib/image-upload";

export function ImageUploadField({
  value,
  onChange,
  label = "Image",
  allowUrl = true,
}: {
  value?: string | null;
  onChange: (url: string) => void;
  label?: string;
  allowUrl?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const pick = async (file?: File) => {
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload image");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <Label className="font-semibold">{label}</Label>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={e => void pick(e.target.files?.[0])}
      />

      {value ? (
        <div className="rounded-xl border overflow-hidden bg-muted/20">
          <img src={value} alt="" className="w-full max-h-56 object-cover" />
          <div className="flex gap-2 p-3">
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-1" />}
              Replace
            </Button>
            <Button type="button" variant="outline" size="sm" className="text-destructive" onClick={() => onChange("")} disabled={uploading}>
              <Trash2 className="h-4 w-4 mr-1" /> Remove
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full h-12 border-dashed" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ImagePlus className="h-4 w-4 mr-2" />}
          {uploading ? "Uploading image..." : "Choose image from phone"}
        </Button>
      )}

      {allowUrl && (
        <Input
          value={value ?? ""}
          onChange={e => onChange(e.target.value)}
          placeholder="Or paste an image URL"
          disabled={uploading}
        />
      )}

      <p className="text-xs text-muted-foreground">Images are compressed automatically. Maximum stored size: 1.5 MB.</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
