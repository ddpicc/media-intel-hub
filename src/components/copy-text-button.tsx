"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type CopyTextButtonProps = {
  text: string;
};

export function CopyTextButton({ text }: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => {
        setCopied(false);
      }, 1200);
    } catch {
      setCopied(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text}
      className="inline-flex items-center gap-1.5 rounded-md border border-[#2a3550] bg-[#111a2c] px-2.5 py-1.5 text-xs text-[#bcd0f1] hover:bg-[#162238] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? "已复制" : "一键复制"}
    </button>
  );
}
