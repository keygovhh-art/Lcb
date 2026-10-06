import { useState } from "react";
import { Link } from "wouter";
import { Layout } from "@/components/layout/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { useAuth } from "@/context/auth-context";

export default function Login() {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) { setError("Please fill in all fields."); return; }
    setLoading(true);
    setError("");
    const result = await login(identifier.trim(), password);
    setLoading(false);
    if (result.ok) {
      window.location.assign("/");
    } else {
      setError(result.error ?? "Login failed. Please check your credentials.");
    }
  };

  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center py-16 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <span className="font-serif text-3xl font-bold text-accent">Gavhah</span>
            <h1 className="font-serif text-2xl font-bold text-primary mt-2 mb-1">Welcome Back</h1>
            <p className="text-muted-foreground font-serif italic text-sm">Sign in to your kehilla account</p>
          </div>

          <div className="bg-card border rounded-2xl p-8 shadow-sm">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="font-semibold">Email or Phone Number</Label>
                <Input
                  id="identifier"
                  type="text"
                  value={identifier}
                  onChange={e => setIdentifier(e.target.value)}
                  placeholder="your@email.com or +1 (718) 555-0100"
                  className="h-12"
                  autoComplete="username"
                  required
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="font-semibold">Password</Label>
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="h-12 pr-11"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-secondary hover:bg-secondary/90 text-white font-semibold text-base gap-2"
                disabled={loading}
              >
                {loading ? "Signing in..." : <><LogIn className="h-5 w-5" /> Sign In</>}
              </Button>
            </form>

            <div className="mt-6 pt-6 border-t text-center">
              <p className="text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link href="/register" className="text-secondary font-semibold hover:underline">
                  Join the Kehilla
                </Link>
              </p>
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            By signing in you agree to our community standards and guidelines.
          </p>
        </div>
      </div>
    </Layout>
  );
}
