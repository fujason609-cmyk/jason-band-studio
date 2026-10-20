import { forwardRef } from "react";

/** Positioned imperatively by the timeline on each animation frame. Its head is a guitar pick. */
export const Playhead = forwardRef<HTMLDivElement>(function Playhead(_props, ref) {
  return (
    <div className="playhead" ref={ref} aria-hidden="true">
      <svg className="playhead__pick" viewBox="0 0 20 22" width="20" height="22">
        <path d="M10 21C6 16 1.5 10.5 1.5 6.2 1.5 2.8 5.2 1 10 1s8.5 1.8 8.5 5.2C18.5 10.5 14 16 10 21Z" />
      </svg>
    </div>
  );
});
