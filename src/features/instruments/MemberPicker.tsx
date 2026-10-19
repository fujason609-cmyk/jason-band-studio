import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { MemberBadge } from "@/features/band/components/MemberBadge";
import { MEMBERS } from "@/features/band/members";
import { useT } from "@/i18n/useT";
import { useStudioStore } from "@/stores/useStudioStore";

/**
 * Picks which member the live keyboard plays. A radio group with roving focus:
 * arrow keys move the choice, Tab leaves the group.
 */
export function MemberPicker() {
  const selected = useStudioStore((s) => s.settings.selectedMember);
  const selectMember = useStudioStore((s) => s.selectMember);
  const t = useT();
  const groupRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const index = MEMBERS.findIndex((m) => m.id === selected);
    const next = MEMBERS[(index + step + MEMBERS.length) % MEMBERS.length]!;
    selectMember(next.id);
    groupRef.current?.querySelector<HTMLButtonElement>(`[data-member="${next.id}"]`)?.focus();
  };

  return (
    <div ref={groupRef} className="member-picker" role="radiogroup" aria-label={t.chooseMember} onKeyDown={onKeyDown}>
      {MEMBERS.map((m) => {
        const checked = m.id === selected;
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            data-member={m.id}
            className={`member-chip ${checked ? "is-checked" : ""}`}
            style={{ "--member": `var(${m.colorVar})` } as CSSProperties}
            onClick={() => selectMember(m.id)}
          >
            <MemberBadge member={m} size="sm" />
            <span className="member-chip__name">{t.memberName[m.id]}</span>
          </button>
        );
      })}
    </div>
  );
}
