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
    "Forest sanctuary",
    "Follow the stream to the stone arch. Select its opening to enter Edge of Earth.",
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

export const gallerySections: { title: string; entries: Place[] }[] = [
  { title: "Explore worlds", entries: ["hub", "valley", "earth", "field"] },
  { title: "Creative lab", entries: ["sculpture", "lab"] },
];
export const accessHints: Record<Place, string> = {
  hub: "Walk or tap a gate",
  valley: "Walk · Select the stone arch",
  earth: "Walk · Look around",
  field: "Walk · Look around",
  sculpture: "Pointer or touch · Six forms",
  lab: "Camera or manual gestures",
};
