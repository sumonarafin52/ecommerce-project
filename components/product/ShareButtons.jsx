// components/product/ShareButtons.jsx
"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";

export default function ShareButtons({ name, path }) {
  const [url, setUrl] = useState("");
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setUrl(window.location.origin + path);
    setCanNativeShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [path]);

  const nativeShare = async () => {
    try {
      await navigator.share({ title: name, url });
    } catch {
      // user closed the share sheet — nothing to do
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn't copy — long-press the address bar instead");
    }
  };

  const text = encodeURIComponent(`${name} ${url}`);
  const btn =
    "w-9 h-9 rounded-full border border-line bg-cream-white flex items-center justify-center text-ink-soft hover:text-indigo-900 hover:border-indigo-700/40 transition-colors";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-bold text-ink-muted mr-0.5">Share</span>
      {canNativeShare && (
        <button type="button" onClick={nativeShare} className={btn} aria-label="Share">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
          </svg>
        </button>
      )}
      <a href={`https://wa.me/?text=${text}`} target="_blank" rel="noopener noreferrer" className={btn} aria-label="Share on WhatsApp">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1-.2.3-.8 1-.9 1.2-.2.2-.3.2-.6.1-.3-.1-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5.3-.5c.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1112 21.8zM20.5 3.5A11.8 11.8 0 002.1 17.7L.5 23.5l6-1.6A11.8 11.8 0 0023.8 12c0-3.2-1.2-6.1-3.3-8.5z" />
        </svg>
      </a>
      <a
        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={btn}
        aria-label="Share on Facebook"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M14 13.5h2.5l1-4H14v-2c0-1 0-2 2-2h1.5V2.1C17.2 2.1 16 2 14.6 2 11.7 2 10 3.7 10 6.8v2.7H7v4h3V22h4v-8.5z" />
        </svg>
      </a>
      <button type="button" onClick={copy} className={btn} aria-label="Copy link">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.8 1.7M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
        </svg>
      </button>
    </div>
  );
}
