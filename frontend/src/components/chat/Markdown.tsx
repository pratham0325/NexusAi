import { memo, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="chat-md text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className ?? "");
            const raw = String(children).replace(/\n$/, "");
            if (!match && !raw.includes("\n")) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
            return <CodeBlock language={match?.[1] ?? "text"} value={raw} />;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});

function CodeBlock({
  language,
  value,
}: {
  language: string;
  value: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = useMemo(
    () => () => {
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      });
    },
    [value],
  );

  return (
    <div className="group/code relative my-2 rounded-lg border border-border/60">
      <div className="flex items-center justify-between border-b border-border/60 bg-muted/50 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
          {language}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 rounded-md"
          onClick={copy}
        >
          {copied ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          background: "transparent",
          padding: "0.75rem 0.9rem",
          fontSize: "0.8rem",
        }}
        codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
      >
        {value}
      </SyntaxHighlighter>
    </div>
  );
}
