import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DEFAULT_SETTINGS } from "@/services/storage/settingsStorage";
import { useStudioStore } from "@/stores/useStudioStore";
import { MemberPicker } from "./MemberPicker";

describe("MemberPicker", () => {
  beforeEach(() => {
    useStudioStore.setState({ settings: { ...DEFAULT_SETTINGS, language: "en", selectedMember: "yui" } });
  });

  it("switches the play-along member by click", async () => {
    const user = userEvent.setup();
    render(<MemberPicker />);
    expect(screen.getByRole("radio", { name: "Yui" })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: "Ritsu" }));
    expect(useStudioStore.getState().settings.selectedMember).toBe("ritsu");
    expect(screen.getByRole("radio", { name: "Ritsu" })).toHaveAttribute("aria-checked", "true");
  });

  it("moves the choice with arrow keys and wraps around", async () => {
    const user = userEvent.setup();
    render(<MemberPicker />);
    screen.getByRole("radio", { name: "Yui" }).focus();
    await user.keyboard("{ArrowLeft}");
    expect(useStudioStore.getState().settings.selectedMember).toBe("azusa");
    expect(screen.getByRole("radio", { name: "Azusa" })).toHaveFocus();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(useStudioStore.getState().settings.selectedMember).toBe("mio");
  });

  it("shows Chinese names when the language is Chinese", () => {
    useStudioStore.getState().updateSettings({ language: "zh" });
    render(<MemberPicker />);
    expect(screen.getByRole("radiogroup", { name: "你要和谁换位一起弹？" })).toBeInTheDocument();
    for (const name of ["唯", "澪", "律", "紬", "梓"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });
});
