// Categorical palette validated with the dataviz skill's validator against
// this app's actual chart surfaces (dark #111828 card, light #ffffff card):
// worst adjacent CVD ΔE 10.3 (protan) — inside the 8-12 floor band, which is
// legal only paired with direct labels/legend (every chart below ships both).
// Never cycle past slot order; never reuse a status color (StatusBadge's
// gold/green/red) as a categorical series -- those are reserved for state.
export const CHART_CATEGORICAL_DARK = ["#3987e5", "#199e70", "#c98500", "#9085e9", "#d95926", "#e66767"];
export const CHART_CATEGORICAL_LIGHT = ["#2a78d6", "#1baf7a", "#eda100", "#4a3aa7", "#eb6834", "#e34948"];

export function categoricalPalette(isDark: boolean): string[] {
  return isDark ? CHART_CATEGORICAL_DARK : CHART_CATEGORICAL_LIGHT;
}

export const CHART_GRID_DARK = "#2a3348";
export const CHART_GRID_LIGHT = "#e5e7eb";
export const CHART_AXIS_DARK = "#8a93a8";
export const CHART_AXIS_LIGHT = "#64748b";
