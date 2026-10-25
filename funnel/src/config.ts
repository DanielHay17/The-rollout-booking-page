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

  /**
   * /sprint2: the same page with Daniel's video in the hero, linked from the
   * newsletter. /sprint (where new subscribers land) keeps running without it,
   * so the two can be compared before one wins.
   */
  sprint2Vsl: {
    // v3 is take 2 with only the LinkedIn sidebar blurred (same cut, so the
    // v2 captions and poster still fit).
    src: "/assets/vsl/vsl-v3.mp4",
    poster: "/assets/vsl/vsl-v2-poster.jpg",
    captions: "/assets/vsl/vsl-v2.vtt",
  },

  /** The 90-second "what to expect on the call" video on /booked. */
  expectationsVideo: {
    src: "",
    poster: "",
  },

  /** Daniel's LinkedIn profile, e.g. https://www.linkedin.com/in/... */
  linkedinUrl: "https://www.linkedin.com/in/daniel--hay/",

  /**
   * A mobile number people can text "confirmed" to after booking, in
   * international format, e.g. +61400000000. Empty hides that step.
   */
  textNumber: "",

  /** A square photo of Daniel (from his beehiiv author profile). Survey and booking page. */
  danielPhoto: "/assets/daniel.webp",

  /**
   * The profile card at the top of the survey. Keep the counts true: LinkedIn
   * showed 2,225 followers on 12 Oct 2026. Empty hides that count.
   */
  profile: {
    name: "Daniel Hay",
    headline: "Founder of The Rollout · Sydney, Australia",
    subscribers: "5,000+",
    linkedinFollowers: "2,200+",
  },
} as const;
