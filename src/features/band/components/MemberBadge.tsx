import type { BandMember } from "../types";

/** A coloured name seal: the member's given-name kanji, no character artwork. */
export function MemberBadge({ member, size = "md" }: { member: BandMember; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`member-badge member-badge--${size}`} style={{ background: `var(${member.colorVar})` }} aria-hidden="true">
      {member.nameJa.slice(-1)}
    </span>
  );
}
