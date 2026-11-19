export const catalog = {
  hub: {
    title: "The Observatory",
    kind: "Portal hub",
    desc: "Five gateways stand beneath a shared sky. Choose a world to step inside.",
    mark: "◎",
    color: "#f2cb91",
  },
  earth: {
    title: "Edge of Earth",
    kind: "Planetary landscape",
    desc: "Follow the cliff to the rim of a planet waking into sunlight.",
    mark: "◒",
    color: "#ffbe86",
  },
  valley: {
    title: "Portal Valley",
    kind: "Canyon landscape",
    desc: "Trace the water through the canyon to a gate of light.",
    mark: "∩",
    color: "#9ae5c7",
  },
  field: {
    title: "Starlight Field",
    kind: "Cosmic landscape",
    desc: "Walk the winding path between constellations of luminous flowers.",
    mark: "✧",
    color: "#debaff",
  },
  sculpture: {
    title: "Particle Sculpture Room",
    kind: "Interactive installation",
    desc: "Choose a form. Move your pointer or touch the filaments to bend them.",
    mark: "∿",
    color: "#f5bcda",
  },
  lab: {
    title: "Hand Tracking Particle Lab",
    kind: "Gesture installation",
    desc: "Shape the particles with your hand, or try an effect with the controls.",
    mark: "✳",
    color: "#9bdcfa",
  },
} as const;
export type WorldId = keyof typeof catalog;
