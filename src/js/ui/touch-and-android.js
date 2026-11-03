/**
 * Touch screens: a field being typed in hides the launch bar until the keyboard closes. And the Android app's report
 * of where a new design was saved (prSavedAs).
 */
// on touch screens, a field being typed in hides the launch bar until the keyboard closes
{
  /**
   * True on a touch screen.
   */
  const touch = () => window.matchMedia && matchMedia("(pointer:coarse)").matches;
  /**
   * True for a field that brings up the keyboard.
   */
  const typed = (el) =>
    el &&
    (el.tagName === "TEXTAREA" ||
      (el.tagName === "INPUT" &&
        !["checkbox", "radio", "button", "submit", "range", "file", "color"].includes(el.type)));
  document.addEventListener("focusin", (e) => {
    if (touch() && typed(e.target)) document.documentElement.classList.add("typing");
  });
  document.addEventListener("focusout", () =>
    setTimeout(() => {
      if (!typed(document.activeElement)) document.documentElement.classList.remove("typing");
    }, 0),
  );
  /**
   * The keyboard was put away while the field still has focus: finish the edit and bring the launch bar back.
   *
   * the keyboard was put away while the field still has focus: finish the edit and bring the launch bar back
   */
  const closed = () => {
    document.documentElement.classList.remove("typing");
    const a = document.activeElement;
    if (typed(a)) a.blur();
  };
  // the Android app reports the keyboard itself
  // leaving the app hides the keyboard without telling the page: forget the typing state, so the launch bar and swipes come back
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) closed();
  });
  window.prKeyboard = (open) => {
    if (!open) closed();
    else if (touch() && typed(document.activeElement)) document.documentElement.classList.add("typing");
  };
  // in a phone browser, the visible area grows back to full height when the keyboard closes
  const vv = window.visualViewport;
  if (vv && !window.PocketRocketApp) {
    let full = vv.height,
      was = false;
    vv.addEventListener("resize", () => {
      full = Math.max(full, vv.height);
      const open = vv.height < full * 0.85;
      if (was && !open && document.documentElement.classList.contains("typing")) closed();
      was = open;
    });
    window.addEventListener("orientationchange", () => {
      full = 0;
      setTimeout(() => {
        full = vv.height;
      }, 400);
    });
  }
}
// the Android app reports the place on the phone a new design was saved to
window.prSavedAs = async (uri) => {
  if (!uri || !SOURCE) return;
  const old = SOURCE.recentId ? await recentGet(SOURCE.recentId) : null;
  if (old && old.id !== uri) await recentDel(old.id);
  await recentPut({
    ...(old || { name: SOURCE.name, rocket: D.name || "", data: null }),
    id: uri,
    uri,
    when: Date.now(),
  });
  setSource({ ...SOURCE, recentId: uri });
  renderRecent();
};
