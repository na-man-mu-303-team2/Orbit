export const orbitDesignTokens = {
  color: {
    ink: "#090909",
    canvas: "#ffffff",
    surface: "#f7f7f5",
    surfaceRaised: "#fbfbfa",
    border: "#e6e6e6",
    borderStrong: "#c9c9c5",
    textMuted: "#5f5f5b",
    lilac: "#c5b0f4",
    lilacSoft: "#f1ecff",
    lilacStrong: "#6846d8",
    lime: "#dceeb1",
    cream: "#f4ecd6",
    mint: "#c8e6cd",
    coral: "#f3c9b6",
    navy: "#1f1d3d",
    success: "#287a4d",
    successSoft: "#e6f4e9",
    warning: "#9a5d13",
    warningSoft: "#fbefd7",
    info: "#3466a6",
    infoSoft: "#e9f2fb",
    danger: "#b8443c",
    dangerSoft: "#fae9e7"
  },
  space: {
    1: "4px",
    2: "8px",
    3: "12px",
    4: "16px",
    5: "24px",
    6: "32px",
    7: "48px",
    8: "64px",
    9: "96px"
  },
  radius: {
    control: "8px",
    panel: "16px",
    block: "24px",
    pill: "999px"
  },
  control: {
    compact: "36px",
    default: "44px",
    prominent: "52px"
  },
  type: {
    display: "clamp(3rem, 6vw, 5.375rem)",
    title: "clamp(2.5rem, 4vw, 4rem)",
    pageTitle: "clamp(2.25rem, 3vw, 3rem)",
    heading: "26px",
    subheading: "20px",
    bodyLarge: "18px",
    body: "16px",
    bodySmall: "14px",
    ui: "14px",
    uiSmall: "13px",
    caption: "12px"
  }
} as const;

export type OrbitDesignTokens = typeof orbitDesignTokens;
