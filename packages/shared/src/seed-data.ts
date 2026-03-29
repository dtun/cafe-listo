import { Category, CategoryId, ChecklistState, PrepItem } from "./types";

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

export const PREP_ITEMS: PrepItem[] = [
  // Water & Hydration
  {
    id: "water-1",
    name: "Drinking water",
    categoryId: "water",
    essential: true,
    quantity: "1 gallon per person per day, 3-day supply",
    regionNote:
      "Desert climate demands extra water — FEMA recommends 1 gallon/day but consider 1.5 in Mesa summers",
  },
  {
    id: "water-2",
    name: "Water purification tablets",
    categoryId: "water",
    essential: true,
    quantity: "1 pack (50 tablets)",
    regionNote:
      "Monsoon flooding can contaminate municipal water; tablets are backup purification",
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
    regionNote:
      "Critical for extreme heat — Mesa averages 47 days/year over 109.5°F by 2050",
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
    regionNote:
      "Store in coolest spot possible — Arizona garage temps can exceed 130°F and degrade shelf life",
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
    regionNote: "Choose bars that won't melt — avoid chocolate-heavy options in AZ heat",
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
    regionNote:
      "Heat can degrade medications — rotate frequently and store with cold packs if needed",
  },
  {
    id: "medical-3",
    name: "Sunscreen (SPF 50+)",
    categoryId: "medical",
    essential: true,
    quantity: "1 bottle",
    regionNote: "Mesa UV index regularly hits extreme (11+) — sunburn is a real emergency risk",
  },
  {
    id: "medical-4",
    name: "Insect repellent",
    categoryId: "medical",
    essential: false,
    quantity: "1 bottle",
    regionNote: "Mosquitoes spike during monsoon season (June–September)",
  },
  {
    id: "medical-5",
    name: "Instant cold packs",
    categoryId: "medical",
    essential: true,
    quantity: "4 packs",
    regionNote: "Essential for heat exhaustion first response — activate and apply to neck/armpits",
  },
  {
    id: "medical-6",
    name: "Cooling towels",
    categoryId: "medical",
    essential: true,
    quantity: "2",
    regionNote: "Soak and wear around neck — can drop body temp 20-30°F in extreme heat",
  },
  {
    id: "medical-7",
    name: "Burn gel and bandages",
    categoryId: "medical",
    essential: false,
    quantity: "1 pack",
    regionNote: "Wildfire risk is significant — 48% of Mesa buildings face some wildfire exposure",
  },

  // Shelter & Protection
  {
    id: "shelter-1",
    name: "Emergency tarp/shelter",
    categoryId: "shelter",
    essential: true,
    quantity: "1 (8x10 ft minimum)",
    regionNote: "Doubles as flash flood water diverter and shade structure in desert sun",
  },
  {
    id: "shelter-2",
    name: "Emergency mylar blankets",
    categoryId: "shelter",
    essential: true,
    quantity: "4",
    regionNote: "Reflects heat away when used as shade — not just for cold weather",
  },
  {
    id: "shelter-3",
    name: "N95 masks",
    categoryId: "shelter",
    essential: true,
    quantity: "4",
    regionNote: "Critical for dust storms (haboobs) and wildfire smoke — Mesa gets both regularly",
  },
  {
    id: "shelter-4",
    name: "Bandanas/buffs",
    categoryId: "shelter",
    essential: true,
    quantity: "2",
    regionNote: "Wet bandana on neck for cooling; dry over face during dust storms",
  },
  {
    id: "shelter-5",
    name: "Ponchos/rain gear",
    categoryId: "shelter",
    essential: true,
    quantity: "2",
    regionNote: "Monsoon storms dump heavy rain fast — flash flood risk is real in Maricopa County",
  },
  {
    id: "shelter-6",
    name: "Duct tape",
    categoryId: "shelter",
    essential: true,
    quantity: "1 roll",
    regionNote: "Seal window gaps during dust storms to keep fine particulates out",
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
    regionNote: "Heat degrades batteries faster — check and rotate every 6 months in AZ",
  },
  {
    id: "tools-3",
    name: "Portable battery bank",
    categoryId: "tools",
    essential: true,
    quantity: "1 (20,000+ mAh)",
    regionNote:
      "Power outages spike during peak heat when the grid is strained — keep phones charged",
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
    regionNote: "Backup power when battery bank dies during extended outage",
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
    regionNote:
      "NOAA broadcasts dust storm and flash flood warnings — critical when cell towers are down",
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
    regionNote: "Mark evacuation routes and cooling centers — Mesa has designated heat relief stations",
  },
  {
    id: "comms-4",
    name: "Waterproof phone pouch",
    categoryId: "comms",
    essential: false,
    quantity: "1",
    regionNote: "Protects phone during monsoon flash flooding",
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
    regionNote: "Flash floods can soak through standard containers — use a sealed dry bag",
  },
  {
    id: "documents-3",
    name: "Cash in small bills",
    categoryId: "documents",
    essential: true,
    quantity: "$100-200 in small bills",
    regionNote: "ATMs and card readers go down during power outages",
  },
  {
    id: "documents-4",
    name: "Emergency plan document",
    categoryId: "documents",
    essential: true,
    quantity: "1 printed copy",
    regionNote:
      "Include Mesa-specific shelters, cooling centers, and FEMA Region 9 contact info",
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
    regionNote: "The namesake — compact, shelf-stable, and a morale booster when things get tough",
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
    regionNote: "Choose heat-resistant candy — chocolate melts fast in Arizona",
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
