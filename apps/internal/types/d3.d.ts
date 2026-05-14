// Minimal stub so TS can resolve `import("d3")` without pulling @types/d3.
// We only need a handful of force functions at runtime; cast to any inside callers.
declare module "d3";
