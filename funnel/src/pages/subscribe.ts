import "../index.css";

import { cleanEmail } from "@shared/survey";
import { ApiError, attribution, postJson, rememberTouch, writeState } from "@/lib/funnel";
import { initPixel } from "@/lib/pixel";

/*
 * Step 1: the email-only subscribe form. On success the Worker has saved the
 * lead to the CRM and added them to beehiiv; we move straight on to /welcome.
 */

const form = document.getElementById("subscribe-form") as HTMLFormElement;
const input = document.getElementById("email") as HTMLInputElement;
const honeypot = document.getElementById("company_fax") as HTMLInputElement;
const button = document.getElementById("subscribe-button") as HTMLButtonElement;
const errorLine = document.getElementById("form-error") as HTMLParagraphElement;

let busy = false;
// Each landing page words its button for its own ad ("Send me the setup").
const buttonLabel = button.textContent?.trim() || "Subscribe";

function setBusy(next: boolean) {
  busy = next;
  button.disabled = next;
  button.textContent = next ? "Subscribing…" : buttonLabel;
}

function showError(message: string) {
  errorLine.textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

input.addEventListener("input", () => {
  if (errorLine.textContent) showError("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (busy) return;

  const email = cleanEmail(input.value);
  if (!email) {
    showError("That email doesn't look quite right.");
    input.focus();
    return;
  }

  showError("");
  setBusy(true);
  const { utm, referrer } = attribution();
  try {
    const result = await postJson<{ token: string | null }>("/api/subscribe", {
      email,
      company_fax: honeypot.value,
      referrer,
      // Which landing page did it, so the CRM can compare them.
      landing: window.location.pathname,
      ...utm,
    });
    writeState({ token: result.token ?? undefined, email, utm, pendingSubscribeEvent: true });
    window.location.assign("/welcome");
  } catch (err) {
    setBusy(false);
    showError(
      err instanceof ApiError && err.status === 400
        ? "That email doesn't look quite right."
        : "Something went wrong on our end. Mind trying again?",
    );
  }
});

// Coming back with the browser's Back button restores this page as it was
// left, button still saying "Subscribing…". Reset it.
window.addEventListener("pageshow", () => setBusy(false));

rememberTouch();

// Landing pages with a looping clip: hold it on its first frame for anyone
// who has asked their device for less motion.
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  for (const clip of document.querySelectorAll<HTMLVideoElement>("video[autoplay]")) clip.pause();
}

if (document.readyState === "complete") initPixel();
else window.addEventListener("load", () => initPixel(), { once: true });
