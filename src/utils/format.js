export const currency = (value) => value === null || value === undefined ? 'N/A' : `PKR ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const percent = (value) => `${(value * 100).toFixed(1)}%`;
export const index = (value) => value === null ? 'N/A' : value.toFixed(2);
export const signedCurrency = (value) => value === null ? 'N/A' : `${value < 0 ? '-' : '+'}${currency(Math.abs(value))}`;
export const pctPoints = (v) => v === null || v === undefined ? 'N/A' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
export const compact = (v) => Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(Math.round(v));
