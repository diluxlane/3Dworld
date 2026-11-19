export const atlas = {
  hub: [
    "The Observatory",
    "Hub world",
    "Five gates stand above a silent sea of mountains. Choose a light and step through.",
  ],
  earth: [
    "Edge of Earth",
    "Orbital frontier",
    "Follow the basalt shelf to the sunrise. A blue planet turns beneath the last stars.",
  ],
  valley: [
    "Portal Valley",
    "Tidal sanctuary",
    "Walk the banks of a still inlet toward the luminous gate.",
  ],
  field: [
    "Starlight Field",
    "Nocturnal garden",
    "Follow the trail between clusters of luminous flowers.",
  ],
  sculpture: [
    "Particle Sculpture Room",
    "Kinetic collection",
    "Choose a form. Drag across the sculpture to bend its surface.",
  ],
  lab: [
    "Hand Tracking Particle Lab",
    "Gesture studio",
    "Shape the constellation with your hand, or try a gesture below.",
  ],
} as const;
export type Place = keyof typeof atlas;
export const places = Object.keys(atlas) as Place[];
