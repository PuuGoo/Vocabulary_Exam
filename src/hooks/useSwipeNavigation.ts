"use client";

import { useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { getSwipeDirection } from "@/lib/swipe";

type SwipeOptions = {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  canSwipeLeft?: boolean;
  canSwipeRight?: boolean;
  enabled?: boolean;
};

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  canSwipeLeft = true,
  canSwipeRight = true,
  enabled = true,
}: SwipeOptions) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const startRef = useRef<{ x: number; y: number; startedAt: number } | null>(null);
  const suppressClickRef = useRef(false);
  const leftRef = useRef(onSwipeLeft);
  const rightRef = useRef(onSwipeRight);
  leftRef.current = onSwipeLeft;
  rightRef.current = onSwipeRight;

  function resetSwipe() {
    startRef.current = null;
    setSwipeOffset(0);
    setIsSwiping(false);
  }

  function onTouchStart(event: TouchEvent<HTMLElement>) {
    if (!enabled || event.touches.length !== 1) return;
    const touch = event.touches[0];
    startRef.current = { x: touch.clientX, y: touch.clientY, startedAt: Date.now() };
    suppressClickRef.current = false;
  }

  function onTouchMove(event: TouchEvent<HTMLElement>) {
    const start = startRef.current;
    if (!start || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      resetSwipe();
      return;
    }
    if (Math.abs(deltaX) < 8) return;
    setIsSwiping(true);
    setSwipeOffset(Math.max(-110, Math.min(110, deltaX)));
  }

  function onTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = startRef.current;
    if (!start) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const elapsed = Date.now() - start.startedAt;
    const direction = getSwipeDirection(deltaX, deltaY, elapsed);
    if (direction) {
      suppressClickRef.current = true;
      if (direction === "left" && canSwipeLeft) leftRef.current();
      if (direction === "right" && canSwipeRight) rightRef.current();
    }
    resetSwipe();
  }

  function onClickCapture(event: MouseEvent<HTMLElement>) {
    if (!suppressClickRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = false;
  }

  return {
    swipeOffset,
    isSwiping,
    swipeProps: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
      onTouchCancel: resetSwipe,
      onClickCapture,
    },
    swipeStyle: {
      touchAction: "pan-y" as const,
      transform: `translateX(${swipeOffset}px) rotate(${swipeOffset / 35}deg)`,
      transition: isSwiping ? "none" : "transform 180ms ease-out, border-color 150ms ease",
    },
  };
}
