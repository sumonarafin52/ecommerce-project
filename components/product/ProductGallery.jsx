// components/product/ProductGallery.jsx
"use client";

import { useEffect, useRef, useState } from "react";

export default function ProductGallery({ images, activeIndex, onIndexChange, productName, badges }) {
  const [zooming, setZooming] = useState(false);
  const [zoomPos, setZoomPos] = useState({ x: 50, y: 50 });
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [canHover, setCanHover] = useState(false);
  const imgRef = useRef(null);
  const touchStartX = useRef(null);

  useEffect(() => {
    setCanHover(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  const goTo = (i) => onIndexChange(((i % images.length) + images.length) % images.length);
  const next = () => goTo(activeIndex + 1);
  const prev = () => goTo(activeIndex - 1);

  const handleMouseMove = (e) => {
    if (!canHover || !imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    setZoomPos({
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    });
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(delta) > 40) (delta < 0 ? next : prev)();
    touchStartX.current = null;
  };

  useEffect(() => {
    if (!lightboxOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setLightboxOpen(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxOpen, activeIndex]);

  const current = images[activeIndex];

  return (
    <div className="space-y-3">
      <div
        ref={imgRef}
        className="relative aspect-square bg-cream-alt border border-line rounded-xl overflow-hidden group"
        onMouseEnter={() => canHover && setZooming(true)}
        onMouseLeave={() => setZooming(false)}
        onMouseMove={handleMouseMove}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {current ? (
          <>
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className={`w-full h-full ${canHover ? "cursor-zoom-in" : "cursor-pointer"}`}
              aria-label="View full size"
            >
              <img
                key={activeIndex}
                src={current}
                alt={`${productName} ${activeIndex + 1}`}
                className="w-full h-full object-contain transition-opacity duration-200"
              />
            </button>

            {/* hover magnifier lens — desktop only, hidden on touch devices
                where hover doesn't make sense */}
            {canHover && zooming && (
              <div
                className="absolute inset-0 pointer-events-none bg-cream-white"
                style={{
                  backgroundImage: `url(${current})`,
                  backgroundPosition: `${zoomPos.x}% ${zoomPos.y}%`,
                  backgroundSize: "220%",
                  backgroundRepeat: "no-repeat",
                }}
              />
            )}

            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="absolute bottom-3 right-3 w-9 h-9 rounded-full bg-white/90 shadow-md flex items-center justify-center text-ink-soft hover:text-indigo-900 hover:bg-white transition-colors opacity-0 group-hover:opacity-100"
              aria-label="Zoom image"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0zM10.5 7.5v6M7.5 10.5h6" />
              </svg>
            </button>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-ink-muted">No image</div>
        )}

        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={prev}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-ink-soft hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Previous image"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-ink-soft hover:text-indigo-900 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Next image"
            >
              ›
            </button>
          </>
        )}

        {badges}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2.5 overflow-x-auto no-scrollbar">
          {images.map((img, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-colors ${
                i === activeIndex ? "border-indigo-900" : "border-line hover:border-indigo-700/50"
              }`}
            >
              <img src={img} alt={`${productName} ${i + 1}`} className="w-full h-full object-contain bg-cream-alt" />
            </button>
          ))}
        </div>
      )}

      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[100] bg-ink/90 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xl"
            aria-label="Close"
          >
            ✕
          </button>

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl"
              aria-label="Previous image"
            >
              ‹
            </button>
          )}

          <img
            src={current}
            alt={`${productName} ${activeIndex + 1}`}
            className="max-w-full max-h-[85vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {images.length > 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-2xl"
              aria-label="Next image"
            >
              ›
            </button>
          )}

          {images.length > 1 && (
            <span className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/80 text-xs font-bold">
              {activeIndex + 1} / {images.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
