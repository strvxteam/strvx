import type { Node, Provenance } from "../types.js";

// Filled in by Task 5 once types exist; for harness self-test we don't need fixtures yet.
export const POSTGRES_PROVENANCE_SAMPLE: Pick<Provenance, "source_type" | "extraction_method"> = {
  source_type: "postgres",
  extraction_method: "cdc",
};

export type _FixturesPlaceholderUntilTask5 = Node;
