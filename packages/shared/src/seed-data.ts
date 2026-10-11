import { Category, CategoryId, ChecklistState, PrepItem } from "./types";
import {
  MESA_AZ_OVERLAY,
  applyRegionNotes,
  regionNotesFor,
} from "./data/region-notes";

export const CATEGORIES: Category[] = [
  { id: "water", label: "Water & Hydration", emoji: "💧" },
  { id: "food", label: "Food & Nutrition", emoji: "🥫" },
  { id: "medical", label: "First Aid & Medical", emoji: "🩹" },
  { id: "shelter", label: "Shelter & Protection", emoji: "⛺" },
  { id: "tools", label: "Tools & Power", emoji: "🔦" },
  { id: "comms", label: "Communication & Navigation", emoji: "📻" },
  { id: "documents", label: "Documents & Money", emoji: "📄" },
  { id: "morale", label: "Comfort & Morale", emoji: "☕" },
];

// Region-neutral items. Notes come from region overlays (see data/region-notes.ts).
export const BASE_PREP_ITEMS: PrepItem[] = [
  // Water & Hydration
  {
    id: "water-1",
    name: "Drinking water",
    categoryId: "water",
    essential: true,
    quantity: "1 gallon per person per day, 3-day supply",
    regionNote: null,
  },
  {
    id: "water-2",
    name: "Water purification tablets",
    categoryId: "water",
    essential: true,
    quantity: "1 pack (50 tablets)",
    regionNote: null,
  },
  {
    id: "water-3",
    name: "Portable water filter",
    categoryId: "water",
    essential: false,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "water-4",
    name: "Electrolyte packets",
    categoryId: "water",
    essential: true,
    quantity: "12 packets",
    regionNote: null,
  },
  {
    id: "water-5",
    name: "Collapsible water container",
    categoryId: "water",
    essential: false,
    quantity: "1 (2.5 gallon)",
    regionNote: null,
  },

  // Food & Nutrition
  {
    id: "food-1",
    name: "Non-perishable food (canned/freeze-dried)",
    categoryId: "food",
    essential: true,
    quantity: "3-day supply per person",
    regionNote: null,
  },
  {
    id: "food-2",
    name: "Manual can opener",
    categoryId: "food",
    essential: true,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "food-3",
    name: "Energy/granola bars",
    categoryId: "food",
    essential: true,
    quantity: "12 bars",
    regionNote: null,
  },
  {
    id: "food-4",
    name: "Peanut butter",
    categoryId: "food",
    essential: false,
    quantity: "1 jar (16 oz)",
    regionNote: null,
  },
  {
    id: "food-5",
    name: "Dried fruit and nuts",
    categoryId: "food",
    essential: false,
    quantity: "1 lb mixed",
    regionNote: null,
  },
  {
    id: "food-6",
    name: "Instant oatmeal packets",
    categoryId: "food",
    essential: false,
    quantity: "8 packets",
    regionNote: null,
  },
  {
    id: "food-7",
    name: "Utensils and mess kit",
    categoryId: "food",
    essential: true,
    quantity: "1 set per person",
    regionNote: null,
  },

  // First Aid & Medical
  {
    id: "medical-1",
    name: "First aid kit",
    categoryId: "medical",
    essential: true,
    quantity: "1 comprehensive kit",
    regionNote: null,
  },
  {
    id: "medical-2",
    name: "Prescription medications",
    categoryId: "medical",
    essential: true,
    quantity: "7-day supply",
    regionNote: null,
  },
  {
    id: "medical-3",
    name: "Sunscreen (SPF 50+)",
    categoryId: "medical",
    essential: true,
    quantity: "1 bottle",
    regionNote: null,
  },
  {
    id: "medical-4",
    name: "Insect repellent",
    categoryId: "medical",
    essential: false,
    quantity: "1 bottle",
    regionNote: null,
  },
  {
    id: "medical-5",
    name: "Instant cold packs",
    categoryId: "medical",
    essential: true,
    quantity: "4 packs",
    regionNote: null,
  },
  {
    id: "medical-6",
    name: "Cooling towels",
    categoryId: "medical",
    essential: true,
    quantity: "2",
    regionNote: null,
  },
  {
    id: "medical-7",
    name: "Burn gel and bandages",
    categoryId: "medical",
    essential: false,
    quantity: "1 pack",
    regionNote: null,
  },

  // Shelter & Protection
  {
    id: "shelter-1",
    name: "Emergency tarp/shelter",
    categoryId: "shelter",
    essential: true,
    quantity: "1 (8x10 ft minimum)",
    regionNote: null,
  },
  {
    id: "shelter-2",
    name: "Emergency mylar blankets",
    categoryId: "shelter",
    essential: true,
    quantity: "4",
    regionNote: null,
  },
  {
    id: "shelter-3",
    name: "N95 masks",
    categoryId: "shelter",
    essential: true,
    quantity: "4",
    regionNote: null,
  },
  {
    id: "shelter-4",
    name: "Bandanas/buffs",
    categoryId: "shelter",
    essential: true,
    quantity: "2",
    regionNote: null,
  },
  {
    id: "shelter-5",
    name: "Ponchos/rain gear",
    categoryId: "shelter",
    essential: true,
    quantity: "2",
    regionNote: null,
  },
  {
    id: "shelter-6",
    name: "Duct tape",
    categoryId: "shelter",
    essential: true,
    quantity: "1 roll",
    regionNote: null,
  },

  // Tools & Power
  {
    id: "tools-1",
    name: "Flashlight (LED)",
    categoryId: "tools",
    essential: true,
    quantity: "2",
    regionNote: null,
  },
  {
    id: "tools-2",
    name: "Extra batteries",
    categoryId: "tools",
    essential: true,
    quantity: "2 sets (AA and AAA)",
    regionNote: null,
  },
  {
    id: "tools-3",
    name: "Portable battery bank",
    categoryId: "tools",
    essential: true,
    quantity: "1 (20,000+ mAh)",
    regionNote: null,
  },
  {
    id: "tools-4",
    name: "Multi-tool/knife",
    categoryId: "tools",
    essential: true,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "tools-5",
    name: "Hand-crank flashlight/charger",
    categoryId: "tools",
    essential: false,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "tools-6",
    name: "Work gloves",
    categoryId: "tools",
    essential: false,
    quantity: "1 pair",
    regionNote: null,
  },

  // Communication & Navigation
  {
    id: "comms-1",
    name: "NOAA weather radio (hand-crank)",
    categoryId: "comms",
    essential: true,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "comms-2",
    name: "Emergency whistle",
    categoryId: "comms",
    essential: true,
    quantity: "1 per person",
    regionNote: null,
  },
  {
    id: "comms-3",
    name: "Local area map (printed)",
    categoryId: "comms",
    essential: true,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "comms-4",
    name: "Waterproof phone pouch",
    categoryId: "comms",
    essential: false,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "comms-5",
    name: "Emergency contact card",
    categoryId: "comms",
    essential: true,
    quantity: "1 per person",
    regionNote: null,
  },

  // Documents & Money
  {
    id: "documents-1",
    name: "Copies of IDs and insurance",
    categoryId: "documents",
    essential: true,
    quantity: "1 set in waterproof bag",
    regionNote: null,
  },
  {
    id: "documents-2",
    name: "Waterproof document bag",
    categoryId: "documents",
    essential: true,
    quantity: "1",
    regionNote: null,
  },
  {
    id: "documents-3",
    name: "Cash in small bills",
    categoryId: "documents",
    essential: true,
    quantity: "$100-200 in small bills",
    regionNote: null,
  },
  {
    id: "documents-4",
    name: "Emergency plan document",
    categoryId: "documents",
    essential: true,
    quantity: "1 printed copy",
    regionNote: null,
  },
  {
    id: "documents-5",
    name: "USB drive with digital backups",
    categoryId: "documents",
    essential: false,
    quantity: "1",
    regionNote: null,
  },

  // Comfort & Morale
  {
    id: "morale-1",
    name: "Café Bustelo instant coffee",
    categoryId: "morale",
    essential: false,
    quantity: "6 packets",
    regionNote: null,
  },
  {
    id: "morale-2",
    name: "Playing cards or small game",
    categoryId: "morale",
    essential: false,
    quantity: "1 deck/game",
    regionNote: null,
  },
  {
    id: "morale-3",
    name: "Comfort items for kids",
    categoryId: "morale",
    essential: false,
    quantity: "1-2 small items",
    regionNote: null,
  },
  {
    id: "morale-4",
    name: "Notebook and pen",
    categoryId: "morale",
    essential: false,
    quantity: "1 each",
    regionNote: null,
  },
  {
    id: "morale-5",
    name: "Hard candy or gum",
    categoryId: "morale",
    essential: false,
    quantity: "1 bag",
    regionNote: null,
  },
  {
    id: "morale-6",
    name: "Small book or puzzle book",
    categoryId: "morale",
    essential: false,
    quantity: "1",
    regionNote: null,
  },
];

// The default seed carries the Region 9 / Arizona (Mesa) notes so existing
// clients keep working until they opt in to region selection.
export const PREP_ITEMS: PrepItem[] = applyRegionNotes(
  BASE_PREP_ITEMS,
  regionNotesFor(MESA_AZ_OVERLAY.region, "AZ"),
);

export function getItemsByCategory(categoryId: CategoryId): PrepItem[] {
  return PREP_ITEMS.filter((item) => item.categoryId === categoryId);
}

export function createInitialChecklistState(): ChecklistState {
  const state: ChecklistState = {};
  for (const item of PREP_ITEMS) {
    state[item.id] = false;
  }
  return state;
}
