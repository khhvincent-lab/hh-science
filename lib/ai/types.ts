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


export type SolveResult = {
  answer:
    string;

  explanation:
    string;

  options:
    string;

  annotations:
    Annotation[];
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
