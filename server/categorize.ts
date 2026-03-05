// server/categorize.ts
// Material category classification for FRAMING & DRYWALL construction
// Optimized for Trebol Contractors Corp's actual materials

export type MaterialCategory =
  | "metal_studs"      // Metal studs (all gauges)
  | "metal_track"      // Metal track, slip track, slotted track
  | "metal_angles"     // Angles, L-angles, clips
  | "furring_channel"  // Hi-hat, z-furring, resilient channel
  | "drywall_boards"   // Gypsum boards (regular, fire, moisture, mold)
  | "cement_board"     // Cement board, Durock, Hardiebacker
  | "insulation"       // R-11, R-19, Tuff-R, XPS, Fi-Foil
  | "compound"         // Joint compound, mud, Durabond
  | "tape"             // Drywall tape, mesh tape, duct tape
  | "fasteners"        // Screws, nails, pins, anchors
  | "corner_bead"      // Corner bead (vinyl, metal, paper)
  | "ceiling_grid"     // Ceiling suspension, main tees, cross tees
  | "plywood"          // Plywood, OSB, sheathing
  | "sealants"         // Caulk, acoustical sealant, fire caulk
  | "tools"            // Tools, equipment, accessories
  | "delivery"         // Delivery, fuel surcharge, freight
  | "misc";            // Everything else

export type Categorization = {
  category: MaterialCategory;
  confidence: number;
  matchedKeyword?: string;
  reason: string;
};

type Rule = {
  category: MaterialCategory;
  keywords: string[];
  patterns?: RegExp[];
};

// Order matters (first match wins) - more specific rules first
const RULES: Rule[] = [
  // ========== METAL STUDS ==========
  {
    category: "metal_studs",
    keywords: [
      "metal stud", "stud 20 ga", "stud 25 ga", "stud 18 ga", "stud 16 ga",
      "20ga metal stud", "25ga metal stud", "18ga metal stud", "16ga metal stud",
      "c-stud", "c stud", "cstud",
    ],
    patterns: [
      /\b(?:s\d+s\d*|s\d+cs\d*)\b/i, // S358S20, S6CS18 etc
      /\d[\s-]*\d\/\d["']?\s*(?:x\s*)?\d+['"]?\s*stud/i, // 3-5/8"X12' STUD
      /stud\s*\d+\s*ga/i,
      /\d+\s*ga\s*(?:metal\s*)?stud/i,
      /\d+ga\s*metal\s*stud/i,
    ]
  },

  // ========== METAL TRACK ==========
  {
    category: "metal_track",
    keywords: [
      "metal track", "track 20 ga", "track 25 ga", "track 18 ga", "track 16 ga",
      "slip track", "slotted track", "slotted slip track",
      "runner", "floor track", "ceiling track",
    ],
    patterns: [
      /\b(?:s\d+t\d*|s\d+sts\d*)\b/i, // S358T20, S358STS16 etc
      /\d[\s-]*\d\/\d["']?\s*(?:x\s*)?\d+['"]?\s*track/i,
      /track\s*\d+\s*ga/i,
      /\d+\s*ga\s*(?:metal\s*)?track/i,
      /slip\s*track/i,
    ]
  },

  // ========== METAL ANGLES ==========
  {
    category: "metal_angles",
    keywords: [
      "angle 20 ga", "angle 18 ga", "angle 16 ga", "angle 25 ga",
      "metal angle", "l-angle", "l angle", "steel angle",
      "wall angle", "radius clip", "clip",
    ],
    patterns: [
      /\b(?:s\d+a\d*)\b/i, // S3A20, S112A20 etc
      /\d+["']\s*x\s*\d+["']\s*angle/i, // 3" X 3" ANGLE
      /angle\s*\d+\s*ga/i,
      /radius\s*clip/i,
    ]
  },

  // ========== FURRING / HAT CHANNEL ==========
  {
    category: "furring_channel",
    keywords: [
      "hi hat", "hihat", "hi-hat", "hat channel", "furring channel",
      "z-furring", "z furring", "zfurring",
      "resilient channel", "rc channel", "sound channel",
    ],
    patterns: [
      /\bshhc\d*\b/i, // SHHC, SHHC20 etc
      /\bs\d+z\d*\b/i, // S112Z20 etc
      /hi\s*hat/i,
      /furring/i,
    ]
  },

  // ========== CEILING GRID / SUSPENSION ==========
  {
    category: "ceiling_grid",
    keywords: [
      "main tee", "cross tee", "cr tee", "ceiling grid", "suspension",
      "wall molding", "hanger wire", "grid wire",
      "arm drywall", "drywall main", "drywall tee",
    ],
    patterns: [
      /\barm\s*drywall/i,
      /main\s*\d+["']/i,
      /\d+['"]?\s*(?:cr|cross)\s*tee/i,
      /cgah|cgax|cgaf/i, // FBM ceiling grid codes
    ]
  },

  // ========== CORNER BEAD ========== (BEFORE drywall_boards to catch "drywall arch corner")
  {
    category: "corner_bead",
    keywords: [
      "corner bead", "cornerbead", "arch bead", "arch corner",
      "drywall arch", "drywall corner", // catch "drywall arch corner"
      "j-bead", "j bead", "jbead",
      "l-bead", "l bead", "lbead",
      "bullnose", "bull nose",
      "vinyl bead", "metal bead", "paper faced bead",
      "no-coat", "nocoat", "strait flex",
    ],
    patterns: [
      /\bvcb\d+/i, // VCB125A etc
      /\bcorner\s*bead/i,
      /\barch\s*corner/i,
      /\bdrywall\s*arch/i, // "DRYWALL ARCH CORNER"
      /\bddb\b/i, // from catalog
    ]
  },

  // ========== DRYWALL BOARDS ==========
  {
    category: "drywall_boards",
    keywords: [
      "drywall", "sheetrock", "gypsum", "gyp board", "gypboard",
      "wallboard", "plasterboard", "gyp",
      "fire rated", "fire x", "firex", "type x", "type c",
      "mold defense", "mold resistant", "moisture resistant",
      "non-rated", "regular drywall",
      "glass mat", "glass matt", "densglass", "dens glass",
      "shaftwall", "shaft liner", "exterior sheathing",
      "weather defense", "gold bond",
    ],
    patterns: [
      /\b(?:1\/2|5\/8|1\/4|3\/8)["'']?\s*(?:drywall|gyp|sheetrock|fire|mold)/i,
      /\bd\d+[a-z]+\b/i, // D12R, D58F, D12MD etc (from catalog)
    ]
  },

  // ========== CEMENT BOARD ==========
  {
    category: "cement_board",
    keywords: [
      "cement board", "cementboard", "durock", "hardiebacker", "hardie",
      "backer board", "backerboard", "tile backer", "tilebacker",
      "wonderboard", "permabase",
    ],
    patterns: [
      /\b(?:1\/2|5\/8|1\/4)["'']?\s*cement/i,
      /d\d+d(?:s)?\b/i, // D48D, D48D58, D58DS
    ]
  },

  // ========== INSULATION ==========
  {
    category: "insulation",
    keywords: [
      "insulation", "batt insulation", "blown insulation",
      "r-11", "r-19", "r-13", "r-15", "r-21", "r-30", "r-38",
      "r11", "r19", "r13", "r15", "r21", "r30", "r38",
      "kraft faced", "unfaced", "uf",
      "tuff-r", "tuffr", "tuff r",
      "thermax", "xps", "eps", "polyiso", "rigid foam",
      "fi-foil", "fifoil", "fi foil", "radiant barrier",
      "rockwool", "mineral wool", "fiberglass",
      "spray foam", "closed cell", "open cell",
    ],
    patterns: [
      /\br-?\d+\s*(?:kraft|uf|insulation|batt)/i,
      /\bit(?:fr|mx)\d*/i, // ITFR1, ITMX1, ITMX34 from catalog
      /\bir\d+[ku]/i, // IR11K, IR19U from catalog
    ]
  },

  // ========== JOINT COMPOUND ==========
  {
    category: "compound",
    keywords: [
      "joint compound", "drywall compound", "drywall mud", "mud",
      "durabond", "dura bond", "easy sand", "easysand",
      "all purpose", "topping", "taping compound",
      "lightweight", "lite", "plus 3",
      "usg compound", "magnum", "finishline",
      "hot mud", "setting compound", "20 minute", "45 minute", "90 minute",
    ],
    patterns: [
      /\bdurabond\s*\d+/i,
      /\b(?:20|45|90)\s*(?:min|minute)/i,
      /joint\s*compound/i,
    ]
  },

  // ========== TAPE ==========
  {
    category: "tape",
    keywords: [
      "drywall tape", "paper tape", "mesh tape", "fiberglass tape",
      "joint tape", "glass mesh", "fibatape",
      "duct tape", "gorilla tape",
      "500' tape", "tape roll",
    ],
    patterns: [
      /\btape\s*roll\b/i,
      /\b\d+['"]?\s*tape\b/i,
      /\bddtl\b/i, // from catalog
      /\bdvt\b/i, // from catalog
    ]
  },

  // ========== FASTENERS / SCREWS ==========
  {
    category: "fasteners",
    keywords: [
      "screw", "drywall screw", "fine screw", "coarse screw",
      "self drilling", "self tapping", "tek screw",
      "framing screw", "bugle head",
      "pin", "ramset", "trakfast", "track fast",
      "nail", "brad", "staple",
      "anchor", "toggle", "molly", "tapcon",
      "washer", "nut", "bolt",
    ],
    patterns: [
      /\b\d+[-\/]?\d+["']?\s*(?:screw|pin)/i, // 1-1/4" screws
      /\bf\d+[a-z]+/i, // F114FM8, F158FM5 from catalog
      /\b(?:#6|#8|#10|#12)\s*(?:x\s*)?\d+/i,
      /\bpin\s*(?:w\/|with)?\s*washer/i,
    ]
  },

  // ========== PLYWOOD / SHEATHING ==========
  {
    category: "plywood",
    keywords: [
      "plywood", "osb", "sheathing", "cdx", "frt", "pt plywood",
      "fire retardant", "pressure treated",
      "subfloor", "subflooring", "underlayment",
      "t1-11", "t111", "siding",
    ],
    patterns: [
      /\b(?:3\/8|1\/2|5\/8|3\/4|1)\s*["']?\s*(?:cdx|osb|plywood|ply)/i,
      /\b(?:cdx|frt|pt)\s*plywood/i,
    ]
  },

  // ========== SEALANTS / CAULK ==========
  {
    category: "sealants",
    keywords: [
      "caulk", "sealant", "silicone", "latex caulk",
      "acoustical caulk", "acoustic sealant", "sound sealant",
      "fire caulk", "firestop", "fire stop",
      "dynaflex", "dap", "alex", "big stretch",
      "construction adhesive", "liquid nail", "pl premium",
    ],
    patterns: [
      /\bacoustical?\s*(?:caulk|sealant)/i,
      /\bfire\s*(?:caulk|stop|sealant)/i,
      /\busgac\b/i, // MUSGAC from catalog
    ]
  },

  // ========== DELIVERY / FREIGHT ==========
  {
    category: "delivery",
    keywords: [
      "delivery", "freight", "shipping", "fuel surcharge",
      "handling", "transport", "trucking",
    ],
    patterns: [
      /\bfuel\s*surcharge/i,
      /\bdelivery\s*(?:fee|charge)/i,
    ]
  },

  // ========== TOOLS & ACCESSORIES ==========
  {
    category: "tools",
    keywords: [
      "tool", "drill", "saw", "sander", "grinder",
      "knife", "utility knife", "snips", "tin snips",
      "level", "laser", "tape measure",
      "scaffold", "ladder", "stilts", "baker scaffold",
      "spray", "sprayer", "hopper", "texture gun",
      "trowel", "hawk", "mud pan", "knife",
      "filter", "vacuum", "shop vac", "ridgid",
      "extension cord", "light", "work light",
      "generator", "compressor",
      "rental", "equipment rental",
    ],
    patterns: [
      /\brental\b/i,
      /\bequipment\b/i,
      /\bfilter\b.*\bridgid\b/i,
    ]
  },
];

/**
 * Categorize a line item description
 */
export function categorizeLineItem(description: string): Categorization {
  const d = (description || "").toLowerCase();

  for (const rule of RULES) {
    // Check keywords first
    for (const kw of rule.keywords) {
      if (d.includes(kw.toLowerCase())) {
        return {
          category: rule.category,
          confidence: 0.9,
          matchedKeyword: kw,
          reason: `keyword_match: "${kw}"`,
        };
      }
    }

    // Check patterns
    if (rule.patterns) {
      for (const pattern of rule.patterns) {
        const match = d.match(pattern);
        if (match) {
          return {
            category: rule.category,
            confidence: 0.85,
            matchedKeyword: match[0],
            reason: `pattern_match: "${match[0]}"`,
          };
        }
      }
    }
  }

  return {
    category: "misc",
    confidence: 0.3,
    reason: "no_match",
  };
}

/**
 * Categorize multiple line items efficiently
 */
export function categorizeLineItems(
  items: Array<{ description: string; productCode?: string | null }>
): Array<Categorization & { index: number }> {
  return items.map((item, index) => {
    // Try description first, then product code
    let result = categorizeLineItem(item.description);

    // If low confidence and we have a product code, try that too
    if (result.confidence < 0.5 && item.productCode) {
      const codeResult = categorizeLineItem(item.productCode);
      if (codeResult.confidence > result.confidence) {
        result = codeResult;
      }
    }

    return { ...result, index };
  });
}

/**
 * Get category display name (Spanish-friendly for Miami market)
 */
export function getCategoryDisplayName(category: MaterialCategory): string {
  const displayNames: Record<MaterialCategory, string> = {
    metal_studs: "Metal Studs",
    metal_track: "Metal Track",
    metal_angles: "Metal Angles/Clips",
    furring_channel: "Furring Channel",
    drywall_boards: "Drywall Boards",
    cement_board: "Cement Board",
    insulation: "Insulation",
    compound: "Joint Compound",
    tape: "Tape",
    fasteners: "Fasteners/Screws",
    corner_bead: "Corner Bead",
    ceiling_grid: "Ceiling Grid",
    plywood: "Plywood/Sheathing",
    sealants: "Sealants/Caulk",
    tools: "Tools/Equipment",
    delivery: "Delivery/Freight",
    misc: "Miscellaneous",
  };
  return displayNames[category] || category;
}

/**
 * Get all available categories
 */
export function getAllCategories(): MaterialCategory[] {
  return [
    "metal_studs",
    "metal_track",
    "metal_angles",
    "furring_channel",
    "drywall_boards",
    "cement_board",
    "insulation",
    "compound",
    "tape",
    "fasteners",
    "corner_bead",
    "ceiling_grid",
    "plywood",
    "sealants",
    "tools",
    "delivery",
    "misc",
  ];
}

/**
 * Test categorization with sample items
 */
export function testCategorization(): void {
  const testItems = [
    "3-5/8\"X12' STUD 20 GA 3 5/8\" WIDE",
    "S358S20 3-5/8\" METAL STUD 20GA",
    "3 5/8\" TRACK 16 GA 10'",
    "S358STS16 3 5/8\" SLIP TRACK SLOTTED 16 GA 10FT",
    "7/8\"X10' HI HAT CHANNEL 20 GA 7/8\" WIDE",
    "3\" X 3\" ANGLE 20 GA 10'",
    "VINYL 1 1/4\" X 1 1/4\" DRYWALL ARCH CORNER",
    "ARM DRYWALL12' MAIN 8\" OC FACETED (12/CTN)",
    "ARM DRYWALL I.D. 4' CR TEE (36/CTN) UNPAINTED",
    "ARM RADIUS CLIP (50/CTN)",
    "1/2\" Fire Rated Drywall 4x8",
    "5/8\" Mold Defense",
    "R-19 Kraft Insulation",
    "Tuff-R 1\" Rigid Insulation",
    "Fi-Foil Radiant Barrier",
    "Durabond 45 Joint Compound",
    "1-1/4\" Fine Drywall Screws",
    "RAMSET 1\" PIN W/WASHER 100PK",
    "GORILLA BLACK DUCT TAPE 30YD",
    "DYNAFLEX ULTRA BLACK 10.1OZ",
    "Misc. Fuel Surcharge",
    "CDX Plywood 3/4\"",
    "STNDRD PLEATED PAPER FLTR FOR RIDGID",
  ];

  console.log("=== CATEGORIZATION TEST ===\n");
  for (const item of testItems) {
    const result = categorizeLineItem(item);
    console.log(`"${item}"`);
    console.log(`  -> ${result.category} (${(result.confidence * 100).toFixed(0)}%) - ${result.reason}\n`);
  }
}
