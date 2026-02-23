import { Github } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t bg-card py-4">
      <div className="container flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6 text-sm text-muted-foreground">
        <a
          href="https://coroyo.de/datenschutz"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Datenschutz
        </a>
        <span className="hidden md:inline text-border">|</span>
        <a
          href="https://shrymp-commerce.com/impressum/"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Impressum
        </a>
        <span className="hidden md:inline text-border">|</span>
        <a
          href="https://shrymp-commerce.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          Shrymp Commerce 🦐
        </a>
        <span className="hidden md:inline text-border">|</span>
        <a
          href="https://github.com/COROYO/shopify-data-migrator"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
          title="Open Source on GitHub"
        >
          <Github className="h-4 w-4" />
        </a>
        <span className="hidden md:inline text-border">|</span>
        <span className="text-muted-foreground">
          v{import.meta.env.VITE_APP_VERSION}
        </span>
      </div>
    </footer>
  );
}
