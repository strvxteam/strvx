const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

export type ProspectStage = "cold" | "warm" | "hot";
export type ProspectIndustry = "HVAC" | "Electrical" | "Plumbing" | "Roofing" | "Solar";
export type TouchChannel = "email" | "linkedin" | "phone" | "referral";

export interface Prospect {
  id: string;
  name: string;
  company: string;
  industry: ProspectIndustry;
  stage: ProspectStage;
  lastTouch: Date | null;
  channel: TouchChannel;
  sequence: string;
  touchCount: number;
}

export const STAGE_COLORS: Record<ProspectStage, string> = {
  cold: "bg-[#e8f0fe] text-[#1a73e8]",
  warm: "bg-[#fef3e2] text-[#e67e22]",
  hot: "bg-[#fde8e8] text-[#c0392b]",
};

export const mockProspects: Prospect[] = [
  {
    id: "pros-1",
    name: "Mike Johnson",
    company: "Johnson HVAC Services",
    industry: "HVAC",
    stage: "hot",
    lastTouch: daysAgo(1),
    channel: "email",
    sequence: "HVAC Outreach v2",
    touchCount: 5,
  },
  {
    id: "pros-2",
    name: "Rachel Torres",
    company: "BrightSpark Electric",
    industry: "Electrical",
    stage: "warm",
    lastTouch: daysAgo(3),
    channel: "linkedin",
    sequence: "Trades Cold Outreach",
    touchCount: 3,
  },
  {
    id: "pros-3",
    name: "Dave Patterson",
    company: "Patterson Plumbing Co",
    industry: "Plumbing",
    stage: "cold",
    lastTouch: daysAgo(7),
    channel: "email",
    sequence: "Trades Cold Outreach",
    touchCount: 2,
  },
  {
    id: "pros-4",
    name: "Lisa Chang",
    company: "Apex Roofing Solutions",
    industry: "Roofing",
    stage: "warm",
    lastTouch: daysAgo(2),
    channel: "phone",
    sequence: "Roofing Specialist",
    touchCount: 4,
  },
  {
    id: "pros-5",
    name: "Carlos Mendez",
    company: "SunPower Installations",
    industry: "Solar",
    stage: "hot",
    lastTouch: daysAgo(0),
    channel: "email",
    sequence: "Solar Outreach v1",
    touchCount: 6,
  },
  {
    id: "pros-6",
    name: "Tom Bradley",
    company: "Bradley Heating & Air",
    industry: "HVAC",
    stage: "cold",
    lastTouch: daysAgo(10),
    channel: "linkedin",
    sequence: "HVAC Outreach v2",
    touchCount: 1,
  },
  {
    id: "pros-7",
    name: "Sarah Kim",
    company: "Kim Electric LLC",
    industry: "Electrical",
    stage: "hot",
    lastTouch: daysAgo(1),
    channel: "referral",
    sequence: "Referral Follow-Up",
    touchCount: 3,
  },
  {
    id: "pros-8",
    name: "James Wilson",
    company: "Wilson Plumbing & Drain",
    industry: "Plumbing",
    stage: "warm",
    lastTouch: daysAgo(4),
    channel: "email",
    sequence: "Trades Cold Outreach",
    touchCount: 3,
  },
  {
    id: "pros-9",
    name: "Amanda Foster",
    company: "FosterTop Roofing",
    industry: "Roofing",
    stage: "cold",
    lastTouch: daysAgo(14),
    channel: "email",
    sequence: "Roofing Specialist",
    touchCount: 2,
  },
  {
    id: "pros-10",
    name: "Robert Green",
    company: "GreenSolar Tech",
    industry: "Solar",
    stage: "warm",
    lastTouch: daysAgo(2),
    channel: "linkedin",
    sequence: "Solar Outreach v1",
    touchCount: 4,
  },
  {
    id: "pros-11",
    name: "Patricia Lee",
    company: "ComfortZone HVAC",
    industry: "HVAC",
    stage: "warm",
    lastTouch: daysAgo(5),
    channel: "phone",
    sequence: "HVAC Outreach v2",
    touchCount: 3,
  },
  {
    id: "pros-12",
    name: "Daniel Harris",
    company: "Harris Electrical Services",
    industry: "Electrical",
    stage: "cold",
    lastTouch: null,
    channel: "email",
    sequence: "Trades Cold Outreach",
    touchCount: 0,
  },
  {
    id: "pros-13",
    name: "Nancy Cooper",
    company: "Cooper & Sons Plumbing",
    industry: "Plumbing",
    stage: "hot",
    lastTouch: daysAgo(1),
    channel: "phone",
    sequence: "Trades Cold Outreach",
    touchCount: 7,
  },
  {
    id: "pros-14",
    name: "Brian Mitchell",
    company: "Mitchell Roofing Group",
    industry: "Roofing",
    stage: "cold",
    lastTouch: daysAgo(21),
    channel: "email",
    sequence: "Roofing Specialist",
    touchCount: 1,
  },
  {
    id: "pros-15",
    name: "Jessica Nguyen",
    company: "SolarEdge Installations",
    industry: "Solar",
    stage: "warm",
    lastTouch: daysAgo(3),
    channel: "linkedin",
    sequence: "Solar Outreach v1",
    touchCount: 4,
  },
];

export const mockSequences = [
  { name: "HVAC Outreach v2", activeProspects: 3, totalTouches: 9, responseRate: 33 },
  { name: "Trades Cold Outreach", activeProspects: 5, totalTouches: 15, responseRate: 20 },
  { name: "Roofing Specialist", activeProspects: 3, totalTouches: 7, responseRate: 14 },
  { name: "Solar Outreach v1", activeProspects: 3, totalTouches: 14, responseRate: 43 },
  { name: "Referral Follow-Up", activeProspects: 1, totalTouches: 3, responseRate: 67 },
];
