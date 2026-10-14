/**
 * BimTix sample data.
 * Everything here is a SAMPLE for the design build: events come from the
 * BimTix brand board; prices, member details and fees are placeholders until
 * real promoters, a payment provider and a backend are in place.
 */
window.BIMTIX = {
  feeRate: 0.05,                // sample service fee (5%)
  maxPerOrder: 6,               // buy limit per person
  pointsPerDollar: 1,           // Rewards: 1 point per BBD $1 spent
  redeem: { points: 1000, value: 10 }, // 1,000 points = BBD $10 off

  member: {
    first: "Kerry",
    name: "Kerry B.",
    initials: "KB",
    tier: "Gold",
    points: 1250,
    nextTier: "Platinum",
    toNext: 750,
    since: "2026"
  },

  categories: [
    { id: "music", label: "Music", icon: "music" },
    { id: "carnival", label: "Carnival", icon: "mask" },
    { id: "vip", label: "VIP", icon: "vip" },
    { id: "yacht", label: "Yacht", icon: "yacht" }
  ],

  events: [
    {
      id: "awaken",
      title: "Awaken",
      sub: "The Christmas Eve Experience",
      date: "2026-12-24",
      time: "9:00 PM",
      venue: "[Venue name]",
      area: "Bridgetown, Barbados",
      region: "bridgetown",
      tags: ["Soca", "Premium", "Open bar"],
      cats: ["music", "carnival", "vip"],
      featured: true,
      tiers: [
        { id: "early", name: "Early bird", price: 150, soldOut: true },
        { id: "general", name: "General", price: 180, note: "all-inclusive" },
        { id: "vip", name: "VIP", price: 350, note: "VIP deck + premium bar", vip: true }
      ]
    },
    {
      id: "first-light",
      title: "First Light",
      sub: "New Year’s Day Beach Party",
      date: "2027-01-01",
      time: "2:00 PM",
      venue: "[Beach venue]",
      area: "Saint James, Barbados",
      region: "west",
      tags: ["Beach", "Music", "Lifestyle"],
      cats: ["music"],
      tiers: [
        { id: "general", name: "General", price: 120, note: "beach access + welcome drink" },
        { id: "vip", name: "VIP", price: 250, note: "cabana + premium bar", vip: true }
      ]
    },
    {
      id: "island-riddim",
      title: "Island Riddim",
      sub: "The Ultimate Soca Experience",
      date: "2027-02-17",
      time: "9:00 PM",
      venue: "[Venue name]",
      area: "Bridgetown, Barbados",
      region: "bridgetown",
      tags: ["Soca", "Dancehall", "Festival"],
      cats: ["music", "carnival"],
      tiers: [
        { id: "early", name: "Early bird", price: 120, soldOut: true },
        { id: "general", name: "General", price: 150, note: "main floor" },
        { id: "vip", name: "VIP", price: 300, note: "VIP deck + premium bar", vip: true }
      ]
    },
    {
      id: "sea-and-sound",
      title: "Sea & Sound",
      sub: "Sunset Yacht Experience",
      date: "2027-04-30",
      time: "5:00 PM",
      venue: "[Marina]",
      area: "West Coast, Barbados",
      region: "west",
      tags: ["Music", "Food", "Premium"],
      cats: ["yacht", "vip", "music"],
      tiers: [
        { id: "general", name: "Deck pass", price: 225, note: "limited spaces" },
        { id: "vip", name: "VIP", price: 400, note: "upper deck + chef’s table", vip: true }
      ]
    }
  ],

  // Sample account history
  upcoming: [
    { eventId: "awaken", qty: 2, tier: "VIP" },
    { eventId: "island-riddim", qty: 2, tier: "General" }
  ],
  past: [
    { title: "Sunset Sessions", date: "2026-09-12", qty: 1, points: 120 },
    { title: "Bim Jazz Night", date: "2026-08-22", qty: 2, points: 160 }
  ],

  /* Owner dashboard — SAMPLE platform data across all promoters.
     Money model (sample rates, to be decided):
       - Buyers pay ticket price + service fee (5%) -> service fee is BimTix income.
       - Card processing (est. 3.5% of what buyers pay) comes out of BimTix income.
       - Promoter payout = ticket sales - refunds, paid after the event. */
  owner: {
    name: "Juwan",
    processingRate: 0.035,
    payoutDelayDays: 3,
    promoters: [
      { id: "riddim-nation", name: "Riddim Nation Entertainment", status: "verified" },
      { id: "coastline", name: "Coastline Events", status: "verified" },
      { id: "sea-breeze", name: "Sea Breeze Productions", status: "verified" },
      {
        id: "gold-coast", name: "Gold Coast Socials", status: "pending", submitted: "2026-10-13",
        checks: [
          { label: "Business registration", done: true },
          { label: "Photo ID of owner", done: true },
          { label: "Bank details for payouts", done: false }
        ]
      }
    ],
    events: [
      { id: "awaken", title: "Awaken", promoter: "riddim-nation", date: "2026-12-24", status: "live", capacity: 800, sold: 540, sales: 108000, refunds: 1800 },
      { id: "first-light", title: "First Light", promoter: "coastline", date: "2027-01-01", status: "live", capacity: 500, sold: 310, sales: 48900, refunds: 0 },
      { id: "island-riddim", title: "Island Riddim", promoter: "riddim-nation", date: "2027-02-17", status: "live", capacity: 600, sold: 512, sales: 84600, refunds: 600 },
      { id: "sea-and-sound", title: "Sea & Sound", promoter: "sea-breeze", date: "2027-04-30", status: "live", capacity: 120, sold: 64, sales: 16850, refunds: 0 },
      { id: "sunset-sessions", title: "Sunset Sessions", promoter: "sea-breeze", date: "2026-09-12", status: "ended", capacity: 200, sold: 180, sales: 13500, refunds: 450, payout: "review" },
      { id: "bim-jazz-night", title: "Bim Jazz Night", promoter: "coastline", date: "2026-08-22", status: "ended", capacity: 300, sold: 260, sales: 20800, refunds: 0, payout: "paid", paidOn: "2026-08-26" },
      { id: "soca-sunrise", title: "Soca Sunrise", promoter: "riddim-nation", date: "2027-01-23", status: "pending", capacity: 900, sold: 0, sales: 0, refunds: 0, submitted: "2026-10-12", tiers: "Early bird BBD $90 · General BBD $120 · VIP BBD $220", venue: "Bridgetown" },
      { id: "rum-riddim-cruise", title: "Rum & Riddim Cruise", promoter: "gold-coast", date: "2027-03-06", status: "pending", capacity: 150, sold: 0, sales: 0, refunds: 0, submitted: "2026-10-13", tiers: "General BBD $95 · VIP BBD $160", venue: "Bridgetown Careenage" }
    ],
    refunds: [
      { id: "r-4799", order: "#BTX-4799", event: "island-riddim", buyer: "Nicole S.", tickets: "2 × General", amount: 300, reason: "Can’t attend — family emergency", requested: "2026-10-12" },
      { id: "r-4652", order: "#BTX-4652", event: "awaken", buyer: "Jason M.", tickets: "1 × VIP", amount: 350, reason: "Bought the wrong ticket type", requested: "2026-10-13" }
    ],
    flags: [
      { id: "f-1", event: "island-riddim", level: "High", text: "6 new accounts paid with the same card and bought 36 General tickets in 10 minutes." }
    ]
  }
};
