/*
 * Everything you'd want to change without touching page code.
 * Leave a value empty ("") and the part of the page that needs it simply
 * doesn't show, so the funnel works today and fills in as you add things.
 */
export const config = {
  /** Meta pixel "The rollout". The subscribe page fires Subscribe, like beehiiv did. */
  metaPixelId: "2051633398755508",

  /** The iClosed event the booking calendar shows. */
  iclosedUrl: "https://app.iclosed.io/e/Phlo/the-rollout",

  /**
   * The VSL on /sprint. An .mp4 URL (an R2 public bucket works well), plus an
   * optional poster image and .vtt captions. Empty = the page runs without it.
   */
  vsl: {
    src: "",
    poster: "",
    captions: "",
  },

  /** The 90-second "what to expect on the call" video on /booked. */
  expectationsVideo: {
    src: "",
    poster: "",
  },

  /** Daniel's LinkedIn profile, e.g. https://www.linkedin.com/in/... */
  linkedinUrl: "",

  /**
   * A mobile number people can text "confirmed" to after booking, in
   * international format, e.g. +61400000000. Empty hides that step.
   */
  textNumber: "",

  /** A square photo of Daniel, e.g. "/assets/daniel.jpg". Shown on the survey. */
  danielPhoto: "",
} as const;
