import type {
  AIModelId,
  AIProvider,
} from "@/lib/ai-models";

import type {
  ReasoningEffort,
} from "@/lib/ai-settings";


export type SolverRole =
  | "science_gate"
  | "primary"
  | "verifier"
  | "arbiter"
  | "followup";


export type Annotation = {
  id:
    string;

  display:
    string;

  label:
    string;

  meaning:
    string;

  source:
    string;

  usage:
    string;
};



export type ScienceDiagramPrimitive = {
  kind: "line" | "arrow" | "circle" | "rect" | "label" | "polyline" | "arc";
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
  x?: number;
  y?: number;
  cx?: number;
  cy?: number;
  r?: number;
  width?: number;
  height?: number;
  points?: Array<{ x: number; y: number }>;
  startAngle?: number;
  endAngle?: number;
  text?: string;
  note?: string;
  role?: "primary" | "secondary" | "accent" | "muted";
  dashed?: boolean;
};

export type ScienceDiagram = {
  type:
    | "force"
    | "incline"
    | "circular_motion"
    | "spring"
    | "pulley"
    | "optics"
    | "circuit"
    | "earth_layers"
    | "fault"
    | "plate_boundary"
    | "sun_angle"
    | "earth_moon_sun"
    | "atmosphere"
    | "ocean_circulation"
    | "chemistry_apparatus"
    | "motion_graph"
    | "coordinate_graph"
    | "wave"
    | "vector"
    | "phase_diagram"
    | "generic";
  title: string;
  caption: string;
  confidence: number;
  primitives: ScienceDiagramPrimitive[];
};


export type ChemicalAtom = {
  id: string;
  label: string;
  x: number;
  y: number;
  charge?: string;
  hydrogens?: number;
  showLabel?: boolean;
  note?: string;
};

export type ChemicalBond = {
  from: string;
  to: string;
  order: 1 | 2 | 3 | "aromatic";
};

export type ChemicalStructure = {
  kind: "organic" | "inorganic" | "ionic" | "skeletal" | "lewis";
  title: string;
  formula: string;
  caption: string;
  confidence: number;
  atoms: ChemicalAtom[];
  bonds: ChemicalBond[];
};

export type SolveResult = {
  answer:
    string;

  explanation:
    string;

  options:
    string;

  annotations:
    Annotation[];

  diagram:
    ScienceDiagram | null;

  chemicalStructure:
    ChemicalStructure | null;
};


export type SolverUsage = {
  inputTokens:
    number;

  cachedInputTokens:
    number;

  cacheWriteTokens:
    number;

  outputTokens:
    number;

  totalTokens:
    number;

  estimatedCostUsd:
    number;
};


export type SolverRequest = {
  model:
    AIModelId;

  reasoning:
    ReasoningEffort;

  prompt:
    string;

  images?:
    string[];

  expectJson?:
    boolean;
};


export type SolverResponse = {
  provider:
    AIProvider;

  model:
    AIModelId;

  text:
    string;

  usage:
    SolverUsage;

  latencyMs:
    number;
};


export type ScienceGateResult = {
  allowed:
    boolean;

  category:
    | "physics"
    | "chemistry"
    | "biology"
    | "earth"
    | "mixed_science"
    | "non_science"
    | "unclear";

  confidence:
    number;

  reason:
    string;

  rejectionType?:
    | "invalid_image"
    | "non_science"
    | null;

  topic?: string;
  keywords?: string[];
  questionSignature?: string;
};


export type VerificationResult = {
  verdict:
    | "approve"
    | "major_error";

  confidence:
    number;

  concern:
    string;

  suggestedAnswer:
    string;
};


export type RouterTrace = {
  requestId:
    string;

  primary:
    SolverResponse | null;

  verifier:
    SolverResponse | null;

  arbiter:
    SolverResponse | null;
};
