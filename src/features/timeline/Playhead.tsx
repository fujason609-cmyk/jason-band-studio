import { forwardRef } from "react";

/** Positioned imperatively by the timeline on each animation frame. */
export const Playhead = forwardRef<HTMLDivElement>(function Playhead(_props, ref) {
  return (
    <div className="playhead" ref={ref} aria-hidden="true">
      <span className="playhead__head" />
    </div>
  );
});
